"""Production browser checks for render isolation and native image loading.

Run with a preview on port 4173: python tests/browser-performance.py
Requires Python Playwright and Chrome; instrumentation exists only in this test.
"""
import json
import re
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / "public/data/2.323.json").read_text(encoding="utf8"))
HOOK = """
window.__ordRenderSamples = [];
const previousRows = new Map();
const previousGroups = new Map();
window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
  supportsFiber: true,
  renderers: new Map(),
  inject(renderer) { this.renderers.set(1, renderer); return 1; },
  onCommitFiberRoot(id, root) {
    const sample = { rows: 0, groups: 0 };
    const visit = fiber => {
      if (!fiber) return;
      const props = fiber.memoizedProps;
      if (props) {
        // Bailed-out subtrees retain their earlier flags and Fiber objects.
        // Count work only when React produced a different current Fiber.
        if (props.unit?.id && props.details?.status && props.onAction) {
          if (previousRows.get(props.unit.id) !== fiber && (fiber.flags & 1)) sample.rows++;
          previousRows.set(props.unit.id, fiber);
        }
        if (props.title && Array.isArray(props.units) && props.details?.get) {
          if (previousGroups.get(props.title) !== fiber && (fiber.flags & 1)) sample.groups++;
          previousGroups.set(props.title, fiber);
        }
      }
      visit(fiber.child); visit(fiber.sibling);
    };
    visit(root.current);
    window.__ordRenderSamples.push(sample);
  },
  onCommitFiberUnmount() {},
};
localStorage.setItem('ord_has_seen_help', 'true');
localStorage.setItem('ord_tooltip_enabled', 'true');
"""

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel="chrome", headless=True)
    context = browser.new_context(viewport={"width": 1920, "height": 1080})
    context.add_init_script(HOOK)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto("http://127.0.0.1:4173/ord-helper/")
    expect(page.locator("main [data-unit-id]")).to_have_count(278)
    shield_count = sum(any(capability["category"] == "shield" and not capability.get("condition")
                           for capability in unit.get("capabilities", [])) for unit in DATA["units"])
    shield = page.get_by_role("checkbox", name=re.compile(r"^Armor reduction\b"))
    expect(shield.locator("..").locator("span")).to_have_text(str(shield_count))
    page.wait_for_function("window.__ordRenderSamples.some(sample => sample.rows >= 278)")
    page.mouse.move(0, 0)
    page.wait_for_timeout(200)
    page.evaluate("window.__ordRenderSamples = []")
    hawkins = page.locator("[data-unit-id='rare_hawkins']")
    hawkins.hover()
    expect(page.locator("[data-tooltip-unit-id='rare_hawkins']")).to_be_visible()
    page.wait_for_timeout(200)
    hover_samples = page.evaluate("window.__ordRenderSamples")
    assert hover_samples and all(sample == {"rows": 0, "groups": 0} for sample in hover_samples), hover_samples
    page.mouse.move(0, 0)
    expect(page.locator("[data-tooltip-unit-id]")).to_have_count(0)

    # A count edit updates its own row without re-rendering unrelated rows.
    page.evaluate("window.__ordRenderSamples = []")
    hawkins.locator("input").fill("1")
    expect(hawkins.locator("input")).to_have_value("1")
    page.wait_for_function("JSON.parse(localStorage.getItem('ord_inventory')).rare_hawkins === 1")
    page.wait_for_timeout(200)
    edit_samples = page.evaluate("window.__ordRenderSamples")
    assert max(sample["rows"] for sample in edit_samples) < 278, edit_samples

    # Native image caching replaces all generated Blob URLs. Decode a visible icon.
    icon = hawkins.locator("img").first
    expect(icon).to_have_attribute("decoding", "async")
    expect(icon).to_have_attribute("loading", "lazy")
    assert not icon.get_attribute("src").startswith("blob:")
    icon.evaluate("async el => { await el.decode(); if (!el.naturalWidth) throw new Error('Image failed'); }")
    assert page.locator("img[src^='blob:']").count() == 0

    # Browsing a recipe uses one shared modal and keeps inventory untouched.
    before = page.evaluate("localStorage.getItem('ord_inventory')")
    hawkins.get_by_title("Show Recipe", exact=True).click()
    modal = page.get_by_role("dialog", name="Recipe details")
    expect(modal).to_have_count(1)
    ingredient = modal.locator("[class*='ingredients'] img").first
    ingredient.click()
    expect(modal.get_by_title("Go Back", exact=True)).to_be_visible()
    modal.get_by_title("Go Back", exact=True).click()
    expect(modal).to_contain_text("Hawkins")
    page.get_by_role("button", name="Close recipe", exact=True).click()
    assert page.evaluate("localStorage.getItem('ord_inventory')") == before

    # Reusing IDs in Custom refreshes counts/statuses and preserves image fallback.
    custom = {"version": "performance-fixture", "rarities": ["Common", "Rare"], "units": [
        {"id": "common_wisp", "name": "Wisp", "rarity": "Common", "image": "images/common_wisp.png"},
        {"id": "common_luffy", "name": "Luffy", "rarity": "Common", "image": "images/common_luffy.jpg"},
        {"id": "rare_hawkins", "name": "Custom Hawk", "rarity": "Rare", "image": "missing-performance-test.png",
         "recipe": [{"unitId": "common_luffy", "count": 1}], "capabilities": [
             {"category": "shield", "detail": "-4"}, {"category": "shield", "detail": "-7"},
             {"category": "stun", "condition": "After upgrade"},
         ]},
    ]}
    page.locator("input[type=file]").set_input_files({"name": "custom.json", "mimeType": "application/json", "buffer": json.dumps(custom).encode()})
    expect(page.locator("main [data-unit-id]")).to_have_count(3)
    expect(shield.locator("..").locator("span")).to_have_text("1")
    expect(page.get_by_role("checkbox", name=re.compile(r"^Area stun\b")).locator("..").locator("span")).to_have_text("0")
    expect(hawkins.locator("img")).to_have_count(0)
    expect(hawkins).to_contain_text("Cu")
    page.locator("[data-unit-id='common_wisp'] input").fill("1")
    expect(hawkins).to_have_class(re.compile("orange"))
    page.get_by_title(re.compile("^Wisp Calculation: ON")).click()
    expect(hawkins).not_to_have_class(re.compile("orange|green"))
    expect(hawkins.locator("[class*='buildableBadge']")).to_have_count(0)
    page.get_by_title(re.compile("^Wisp Calculation: OFF")).click()
    expect(hawkins).to_have_class(re.compile("orange"))
    hawkins.click(button="right")
    expect(hawkins.locator("input")).to_have_value("2")
    expect(page.locator("[data-unit-id='common_wisp'] input")).to_have_value("0")
    assert not errors, errors
    browser.close()
    print(json.dumps({"hover_render_samples": hover_samples, "count_edit_render_samples": edit_samples}))
    print("Performance browser checks passed: isolated hover, selective row updates, native images/fallback, recipe navigation, Custom counts, Wisp and crafting.")
