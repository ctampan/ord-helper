"""Solid icons and labeled Config acceptance against a production preview."""
import json
import re
import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4173/ord-helper/"
ARTIFACTS = ROOT / "node_modules/.tmp/config-browser"
ARTIFACTS.mkdir(parents=True, exist_ok=True)
LABELS = ["Help", "Shortcuts", "Theme", "UI Size", "Team Stats", "Filters",
          "Subgroups", "Sort", "Recipes", "Tooltips", "Ban Mode", "Wisp", "Export", "Import", "Reset"]


with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 1000}, accept_downloads=True, color_scheme="dark")
    context.add_init_script("""if (!localStorage.getItem('config_test_initialized')) {
      localStorage.setItem('config_test_initialized', 'true');
      localStorage.setItem('ord_has_seen_help', 'true');
      localStorage.setItem('ord_theme', 'dark');
      localStorage.setItem('ord_ui_size', '50');
      localStorage.setItem('ord_inventory', JSON.stringify({common_luffy:30, common_wisp:100, hidden_sabo:1}));
    }""")
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(URL)
    config = page.get_by_role("region", name="Configuration", exact=True)
    header = config.get_by_role("button", name="Config", exact=True)
    controls = config.locator("button[title]")

    expect(controls).to_have_count(15)
    assert controls.evaluate_all("buttons => buttons.map(b => b.querySelector('span').textContent)") == LABELS
    for i in range(15):
        button = controls.nth(i)
        expect(button.locator("svg[aria-hidden='true']")).to_be_visible()
        assert button.bounding_box()["height"] >= 44
        assert button.locator("span").first.evaluate("s => s.scrollWidth <= s.clientWidth && getComputedStyle(s).fontSize === '10px'")
    boxes = [controls.nth(i).bounding_box() for i in range(6)]
    assert len({round(box["y"]) for box in boxes[:3]}) == 1
    assert boxes[3]["y"] > boxes[0]["y"]
    expect(config.get_by_role("combobox", name="Game version")).to_be_visible()

    # Collapse and Ban Mode are native, keyboard-operable buttons.
    header.focus()
    header.press("Enter")
    expect(header).to_have_attribute("aria-expanded", "false")
    expect(controls).to_have_count(0)
    header.press("Space")
    expect(header).to_have_attribute("aria-expanded", "true")
    ban = config.get_by_role("button", name="Toggle ban mode", exact=True)
    ban.focus()
    ban.press("Space")
    expect(ban).to_have_attribute("aria-pressed", "true")
    expect(ban).to_contain_text("On")
    ban.press("Space")
    expect(ban).to_have_attribute("aria-pressed", "false")

    config.get_by_title("Keyboard Shortcuts", exact=True).click()
    expect(page.get_by_text("Shortcut Settings", exact=True)).to_be_visible()
    page.get_by_role("button", name="Close shortcuts", exact=True).click()
    config.get_by_title("Help & Features", exact=True).click()
    help_dialog = page.get_by_role("dialog", name="ORD Helper Features", exact=True)
    expect(help_dialog).to_be_visible()
    assert help_dialog.locator("svg").count() >= 10
    assert not re.search(r"[\U0001F000-\U0001FAFF\u2600-\u27BF]", help_dialog.inner_text())
    page.get_by_role("button", name="Close help", exact=True).click()

    # Existing interactions and title selectors remain usable.
    zoom = config.get_by_role("button", name="Adjust UI size", exact=True)
    zoom.click()
    expect(zoom).to_contain_text("51%")
    page.wait_for_function("getComputedStyle(document.querySelector('[aria-label=\"Adjust UI size\"] svg')).width !== '18px'")
    assert zoom.locator("svg").bounding_box()["width"] > 18
    zoom.click(button="right")
    expect(zoom).to_contain_text("50%")
    zoom.click(modifiers=["Control"])
    expect(zoom).to_contain_text("55%")
    zoom.click(button="right", modifiers=["Control"])
    expect(zoom).to_contain_text("50%")

    toggles = [
        ("Toggle tooltips", "Always", "true"),
        ("Toggle Wisp calculation", "Off", "false"),
        ("Toggle subgroups", "Flat", "false"),
        ("Toggle alphabetical sort", "A\u2013Z", "true"),
        ("Toggle recipe icons", "Off", "false"),
    ]
    for name, status, pressed in toggles:
        button = config.get_by_role("button", name=name, exact=True)
        button.click()
        expect(button).to_contain_text(status)
        expect(button).to_have_attribute("aria-pressed", pressed)
    expect(page.locator("main [data-unit-id] button[title='Show Recipe']")).to_have_count(0)

    config.get_by_role("button", name="Toggle team stats", exact=True).click()
    expect(page.locator("#team-stats")).to_have_count(0)
    filters = page.locator("#capability-filters")
    filters.get_by_role("checkbox", name=re.compile("^Flying")).check()
    filter_button = config.get_by_role("button", name="Toggle ability filters", exact=True)
    expect(filter_button).to_contain_text("On \u00b7 1")
    filter_button.click()
    expect(filters).to_have_count(0)
    expect(filter_button).to_contain_text("Off \u00b7 1")

    config.get_by_role("button", name="Toggle theme", exact=True).click()
    expect(config.get_by_role("button", name="Toggle theme", exact=True)).to_contain_text("Light")
    page.reload()
    expect(page.locator("html")).to_have_attribute("data-theme", "light")
    for name, status, pressed in toggles:
        expect(config.get_by_role("button", name=name, exact=True)).to_have_attribute("aria-pressed", pressed)
        expect(config.get_by_role("button", name=name, exact=True)).to_contain_text(status)
    expect(filter_button).to_contain_text("Off \u00b7 1")
    expect(page.locator("#team-stats")).to_have_count(0)

    # T/B/W global shortcuts retain the same behavior with the new controls.
    page.evaluate("document.activeElement.blur()")
    page.keyboard.press("t")
    expect(config.get_by_role("button", name="Toggle tooltips", exact=True)).to_contain_text("Shift")
    page.keyboard.press("b")
    expect(ban).to_have_attribute("aria-pressed", "true")
    page.keyboard.press("b")
    page.keyboard.press("w")
    expect(config.get_by_role("button", name="Toggle Wisp calculation", exact=True)).to_contain_text("On")

    filter_button.click()
    filters.get_by_role("button", name="Clear", exact=True).click()
    config.get_by_role("button", name="Toggle recipe icons", exact=True).click()
    recipe = page.locator("main [data-unit-id] button[title='Show Recipe']").first
    expect(recipe.locator("svg")).to_be_visible()
    saved = page.evaluate("localStorage.getItem('ord_inventory')")
    recipe.click()
    expect(page.get_by_role("dialog", name="Recipe details", exact=True)).to_be_visible()
    page.get_by_role("button", name="Close recipe", exact=True).click()
    assert page.evaluate("localStorage.getItem('ord_inventory')") == saved
    wisp_badge = page.locator("main [aria-label$=' Wisp']").first
    expect(wisp_badge).to_be_visible()
    expect(wisp_badge.locator("svg")).to_be_visible()

    # Real download/upload round-trip uses only this isolated browser's state.
    with page.expect_download() as download_info:
        config.get_by_title("Export Game Version", exact=True).click()
    export_path = ARTIFACTS / "exported-game.json"
    download_info.value.save_as(export_path)
    exported = json.loads(export_path.read_text(encoding="utf8"))
    assert exported["units"]
    config.locator("input[type=file]").set_input_files(export_path)
    expect(config.get_by_role("combobox", name="Game version")).to_have_value("Custom")
    config.get_by_role("combobox", name="Game version").select_option("2.323")

    # Reset must still ask; cancel preserves state and accept clears it.
    saved = page.evaluate("localStorage.getItem('ord_inventory')")
    page.once("dialog", lambda dialog: dialog.dismiss())
    config.get_by_role("button", name="Reset", exact=True).click()
    assert page.evaluate("localStorage.getItem('ord_inventory')") == saved
    page.once("dialog", lambda dialog: dialog.accept())
    config.get_by_role("button", name="Reset", exact=True).click()
    expect(page.locator("main [data-unit-id='common_luffy'] input")).to_have_value("0")

    # Config follows UI Size, with the pre-compaction dimensions restored at 50%.
    for width in [1440, 390]:
        page.set_viewport_size({"width": width, "height": 1000})
        for theme in ["dark", "light"]:
            measurements = []
            for size in [0, 50, 100]:
                page.evaluate("""([theme, size]) => {
                  localStorage.setItem('ord_theme', theme);
                  localStorage.setItem('ord_ui_size', String(size));
                }""", [theme, size])
                page.reload()
                expect(zoom).to_contain_text(f"{size}%")
                scale = 0.9 + 0.2 * size / 100
                assert config.bounding_box()["width"] >= 184 * scale - 0.1
                assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
                assert config.bounding_box()["height"] < 380
                assert controls.evaluate_all("""(buttons, scale) => buttons.every(b =>
                  b.scrollWidth <= b.clientWidth && b.getBoundingClientRect().height >= 44 * scale - 0.1)
                """, scale)
                metrics = config.evaluate("""panel => ({
                  height: panel.getBoundingClientRect().height,
                  icon: panel.querySelector('button[title] svg').getBoundingClientRect().width,
                  label: parseFloat(getComputedStyle(panel.querySelector('button[title] span')).fontSize),
                  header: parseFloat(getComputedStyle(panel.querySelector('button span')).fontSize),
                  version: panel.querySelector('select').getBoundingClientRect().height,
                  padding: parseFloat(getComputedStyle(panel).paddingTop)
                })""")
                assert abs(metrics["icon"] - 18 * scale) < 0.1
                assert abs(metrics["label"] - 10 * scale) < 0.1
                # App light mode must keep recipe glyphs visible even with a dark OS preference.
                expect(recipe.locator("svg")).to_be_visible()
                contrast = recipe.locator("svg").evaluate("""svg => {
                  const foreground = getComputedStyle(svg).color.match(/[\\d.]+/g).slice(0, 3).map(Number);
                  const background = getComputedStyle(svg.closest('[data-unit-id]')).backgroundColor.match(/[\\d.]+/g).slice(0, 3).map(Number);
                  const luminance = rgb => rgb.map(c => {
                    c /= 255;
                    return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
                  }).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
                  const fg = luminance(foreground), bg = luminance(background);
                  return (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05);
                }""")
                assert contrast >= 3, (theme, contrast)
                if size == 50:
                    assert abs(metrics["icon"] - 18) < 0.1
                measurements.append(metrics)
                config.screenshot(path=str(ARTIFACTS / f"config-{width}-{theme}-{size}.png"))
                if size == 50:
                    recipe.locator("xpath=ancestor::*[@data-unit-id]").screenshot(path=str(ARTIFACTS / f"recipe-icon-{width}-{theme}.png"))
            for metric in measurements[0]:
                assert measurements[0][metric] < measurements[1][metric] < measurements[2][metric], (metric, measurements)
    assert not errors, errors
    browser.close()
    print("Config browser checks passed: solid icons, labeled grid, keyboard, all controls, persistence, import/export, reset and responsive themes.")
