"""Browser acceptance checks against a running production preview.

Run: python tests/browser-capabilities.py [http://127.0.0.1:4173/ord-helper/]
Requires Python Playwright and Chrome. Artifacts go to node_modules/.tmp.
"""
import json
import re
import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4173/ord-helper/"
DATA = json.loads((ROOT / "public/data/2.323.json").read_text(encoding="utf8"))
ARTIFACTS = ROOT / "node_modules/.tmp/capability-browser"
ARTIFACTS.mkdir(parents=True, exist_ok=True)


def base(unit, category):
    return any(c["category"] == category and not c.get("condition") for c in unit.get("capabilities", []))


def expected(categories, mode="all"):
    predicate = all if mode == "all" else any
    return sum(predicate(base(u, c) for c in categories) for u in DATA["units"])


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel="chrome", headless=True)
    context = browser.new_context(viewport={"width": 1920, "height": 1080})
    context.add_init_script("localStorage.setItem('ord_has_seen_help', 'true')")
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(URL)
    rows = page.locator("main [data-unit-id]")
    toggle = page.get_by_role("button", name="Toggle ability filters", exact=True)
    panel = page.locator("#capability-filters")
    mode = panel.get_by_role("combobox")

    def category(label):
        return panel.get_by_role("checkbox", name=re.compile("^" + re.escape(label) + r"\b"))

    def clear():
        panel.get_by_role("button", name="Clear", exact=True).click()

    expect(rows).to_have_count(278)
    expect(panel).to_be_visible()
    expect(panel.get_by_role("checkbox")).to_have_count(28)
    assert page.locator(".dashboard > .column").count() == 7
    assert page.locator("[data-rarity='Legendary'] h4").all_text_contents() == ["Stun", "Physical Damage", "Magic Damage", "Single Target", "Finisher"]
    page.screenshot(path=str(ARTIFACTS / "expanded.png"))
    expect(panel).to_be_visible()
    expect(panel.get_by_role("checkbox")).to_have_count(28)
    category("Armor reduction").check()
    expect(rows).to_have_count(expected(["shield"]))
    category("Area stun").check()
    expect(rows).to_have_count(expected(["shield", "stun"]))
    mode.select_option("any")
    expect(rows).to_have_count(expected(["shield", "stun"], "any"))
    page.screenshot(path=str(ARTIFACTS / "open.png"))
    selection = page.evaluate("localStorage.getItem('ord_capability_filters')")
    toggle.click()
    expect(panel.get_by_role("checkbox")).to_have_count(0)
    expect(rows).to_have_count(expected(["shield", "stun"], "any"))
    expect(toggle).to_have_attribute("title", re.compile("2 active"))
    assert page.evaluate("localStorage.getItem('ord_capability_filters')") == selection
    expect(panel).to_have_count(0)
    expect(toggle).to_have_attribute("aria-pressed", "false")
    page.screenshot(path=str(ARTIFACTS / "hidden.png"))
    page.reload()
    expect(panel.get_by_role("checkbox")).to_have_count(0)
    expect(rows).to_have_count(expected(["shield", "stun"], "any"))
    expect(panel).to_have_count(0)
    toggle.click()
    expect(toggle).to_have_attribute("aria-pressed", "true")
    expect(category("Armor reduction")).to_be_checked()
    expect(category("Area stun")).to_be_checked()
    # The header still collapses choices independently of Config visibility.
    header = panel.get_by_role("button", name="Ability filters", exact=True)
    header.click()
    expect(panel).to_be_visible()
    expect(panel.get_by_role("checkbox")).to_have_count(0)
    expect(toggle).to_have_attribute("aria-pressed", "true")
    page.reload()
    expect(panel).to_be_visible()
    expect(header).to_have_attribute("aria-expanded", "false")
    expect(panel.get_by_role("checkbox")).to_have_count(0)
    expect(toggle).to_have_attribute("aria-pressed", "true")
    expect(rows).to_have_count(expected(["shield", "stun"], "any"))
    toggle.click()
    expect(panel).to_have_count(0)
    page.reload()
    expect(panel).to_have_count(0)
    toggle.click()
    expect(header).to_have_attribute("aria-expanded", "false")
    expect(panel.get_by_role("checkbox")).to_have_count(0)
    header.click()
    expect(header).to_have_attribute("aria-expanded", "true")
    page.reload()
    expect(header).to_have_attribute("aria-expanded", "true")
    expect(panel.get_by_role("checkbox")).to_have_count(28)
    clear()
    expect(rows).to_have_count(278)
    category("Armor reduction").check()
    page.reload()
    expect(panel.get_by_role("checkbox")).to_have_count(28)
    expect(rows).to_have_count(expected(["shield"]))
    expect(category("Armor reduction")).to_be_checked()
    expect(mode).to_have_value("any")
    clear()
    expect(rows).to_have_count(278)

    # Resource activation is independent from regeneration and supports All/Any.
    for label, key in [("HP skill", "hp-skill"), ("Mana skill", "mana-skill"), ("Swimming", "swimming")]:
        category(label).check()
        expect(rows).to_have_count(expected([key]))
        if key == "swimming":
            expect(page.locator("main [data-unit-id='distortion_burgess']")).to_have_count(1)
        clear()
    category("HP skill").check()
    category("Mana skill").check()
    mode.select_option("all")
    expect(rows).to_have_count(expected(["hp-skill", "mana-skill"]))
    mode.select_option("any")
    expect(rows).to_have_count(expected(["hp-skill", "mana-skill"], "any"))
    clear()

    # Empty categories must not clear inventory or remove the Config toggle.
    category("Single-target missing-HP damage").check()
    expect(rows).to_have_count(0)
    expect(panel.get_by_text(re.compile("No units match"))).to_be_visible()
    assert page.locator(".dashboard > .column").count() == 7
    toggle.click()
    expect(rows).to_have_count(0)
    expect(panel).to_have_count(0)
    toggle.click()
    clear()
    expect(rows).to_have_count(278)

    # A hidden group preserves its existing collapsed state and subgroup order.
    legendary = page.locator("[data-rarity='Legendary']")
    legendary.locator("h3").click()
    category("Single-target missing-HP damage").check()
    expect(legendary).to_have_count(0)
    clear()
    expect(legendary.locator("[data-unit-id]")).to_have_count(0)
    legendary.locator("h3").click()
    expect(legendary.locator("[data-unit-id]")).to_have_count(39)

    # Verified source values are readable in the actual interactive recipe modal.
    hawkins = page.locator("[data-unit-id='rare_hawkins']")
    hawkins.get_by_title("Show Recipe", exact=True).click()
    modal = page.get_by_role("dialog", name="Recipe details")
    expect(modal.locator("[aria-label='Unit capabilities']")).to_contain_text("Armor reduction")
    expect(modal.locator("[aria-label='Unit capabilities']")).to_contain_text("-10")
    assert not re.search(r"ORDSearch|Sions|−", modal.inner_text())
    assert "Group reference:" not in modal.inner_text()
    assert modal.locator("[aria-label='Unit capabilities']").evaluate("el => !el.parentElement.className.includes('recipeContent')")
    page.get_by_role("button", name="Close recipe", exact=True).click()
    for uid, values in [
        ("transcendence_law", ["HP skill", "HP 250", "Mana skill", "135 Mana", "only once"]),
        ("limited_katakuri", ["HP skill", "35", "consume 17 HP"]),
        ("legendary_jinbe", ["Swimming", "Mana skill", "85 Mana"]),
        ("hidden_tiger", ["Flying", "Ignores terrain"]),
    ]:
        page.locator(f"[data-unit-id='{uid}']").get_by_title("Show Recipe", exact=True).click()
        caps = modal.locator("[aria-label='Unit capabilities']")
        for value in values:
            expect(caps).to_contain_text(value)
        assert not re.search(r"ORDSearch|Sions|Warcraft map|−", caps.inner_text())
        page.get_by_role("button", name="Close recipe", exact=True).click()
    doflamingo = page.locator("[data-unit-id='transcendence_doflamingo']")
    doflamingo.get_by_title("Show Recipe", exact=True).click()
    assert modal.evaluate("el => { const caps = el.querySelector('[aria-label=\"Unit capabilities\"]'); const note = [...el.querySelectorAll('div')].find(n => n.textContent.startsWith('Command: joker tr') && !n.querySelector('div')); return note && !!(note.compareDocumentPosition(caps) & Node.DOCUMENT_POSITION_FOLLOWING); }")
    page.get_by_role("button", name="Close recipe", exact=True).click()

    # A long tooltip remains within the viewport and can be entered/scrolled.
    doflamingo = page.locator("[data-unit-id='transcendence_doflamingo']")
    doflamingo.scroll_into_view_if_needed()
    page.keyboard.down("Shift")
    doflamingo.hover()
    tooltip = page.locator("[data-tooltip-unit-id='transcendence_doflamingo']")
    expect(tooltip).to_be_visible()
    expect(tooltip).to_contain_text("-250%")
    expect(tooltip).to_contain_text("Mana skill")
    expect(tooltip).to_contain_text("150")
    expect(tooltip.get_by_role("complementary", name="Ability panel")).to_be_visible()
    assert not re.search(r"ORDSearch|Sions|−", tooltip.inner_text())
    assert tooltip.get_by_text("Movement slow", exact=True).count() == 1
    box = tooltip.bounding_box()
    assert box["y"] >= 9 and box["y"] + box["height"] <= 1071, box
    tooltip.hover()
    expect(tooltip).to_be_visible()
    side_box = tooltip.get_by_role("complementary").bounding_box()
    main_box = tooltip.bounding_box()
    page.mouse.move(main_box["x"] + main_box["width"] + 4, max(main_box["y"], side_box["y"]) + 10)
    page.wait_for_timeout(200)
    expect(tooltip).to_be_visible()
    tooltip.get_by_role("complementary").hover()
    page.wait_for_timeout(200)
    expect(tooltip).to_be_visible()
    expect(tooltip.locator("[data-ability-details] p")).to_be_visible()
    expect(tooltip).to_contain_text("-250%")
    expect(tooltip).not_to_contain_text("136")
    expect(tooltip).not_to_contain_text("Values differ between references")
    page.screenshot(path=str(ARTIFACTS / "tooltip-side.png"))
    page.keyboard.up("Shift")
    expect(tooltip).to_have_count(0)

    # Craft with every ingredient hidden by the armor-ignoring filter.
    mihawk = next(u for u in DATA["units"] if u["id"] == "eternal_mihawk")
    inventory = {r["unitId"]: r["count"] for r in mihawk["recipe"]}
    inventory["rare_hawkins"] = 2
    page.evaluate("inventory => localStorage.setItem('ord_inventory', JSON.stringify(inventory))", inventory)
    page.reload()
    clear()
    category("Armor-ignoring damage").check()
    expect(rows).to_have_count(expected(["ignore"]))
    assert expected(["ignore"]) == 1
    target = page.locator("[data-unit-id='eternal_mihawk']")
    target.click(button="right")
    expect(target.locator("input")).to_have_value("1")
    saved = page.evaluate("JSON.parse(localStorage.getItem('ord_inventory'))")
    assert saved["rare_hawkins"] == 2
    assert all(saved[r["unitId"]] == 0 for r in mihawk["recipe"])
    page.get_by_title("Ban Mode: OFF", exact=True).click()
    target.click()
    page.wait_for_function("JSON.parse(localStorage.getItem('ord_bans')).includes('eternal_mihawk')")
    target.click()
    page.get_by_title("Ban Mode: ON", exact=True).click()
    target.click(modifiers=["Alt"])
    expect(page.get_by_text("Recipe Tree: Mihawk", exact=True)).to_be_visible()
    page.keyboard.press("Escape")
    # Global keyboard shortcuts continue to work while filtering hides materials.
    page.keyboard.press("w")
    expect(page.get_by_title(re.compile("^Wisp Calculation: OFF"))).to_be_visible()
    page.keyboard.press("w")
    expect(page.get_by_title(re.compile("^Wisp Calculation: ON"))).to_be_visible()

    # Export includes structured values and conditions; old Custom still imports.
    with page.expect_download() as download_info:
        page.get_by_title("Export Game Version", exact=True).click()
    download = download_info.value
    exported = json.loads(Path(download.path()).read_text(encoding="utf8"))
    assert exported == DATA
    custom = {"version": "legacy-custom", "rarities": ["Common"], "units": [
        {"id": "common_wisp", "name": "Wisp", "rarity": "Common", "image": "images/common_wisp.png"},
        {"id": "common_luffy", "name": "Luffy", "rarity": "Common", "image": "images/common_luffy.jpg"},
    ]}
    page.locator("input[type=file]").set_input_files({"name": "legacy.json", "mimeType": "application/json", "buffer": json.dumps(custom).encode()})
    expect(page.get_by_title("Select Game Version", exact=True)).to_have_value("Custom")
    expect(rows).to_have_count(0)
    clear()
    expect(rows).to_have_count(2)
    category("Armor-ignoring damage").check()
    page.get_by_title("Select Game Version", exact=True).select_option("2.323")
    expect(rows).to_have_count(1)
    page.get_by_title("Select Game Version", exact=True).select_option("Custom")
    expect(rows).to_have_count(0)
    page.reload()
    expect(panel.get_by_role("checkbox")).to_have_count(28)
    expect(rows).to_have_count(0)
    clear()
    page.get_by_title("Select Game Version", exact=True).select_option("2.323")

    # Existing appearance settings and narrow screens do not break the panel.
    page.get_by_title("Switch to Light Mode", exact=True).click()
    page.set_viewport_size({"width": 390, "height": 844})
    expect(panel).to_be_visible()
    assert panel.bounding_box()["width"] <= 390
    category("Armor reduction").focus()
    page.keyboard.press("Space")
    expect(category("Armor reduction")).to_be_checked()
    page.screenshot(path=str(ARTIFACTS / "narrow-light.png"))
    clear()
    # At narrow widths, abilities are below the recipe and initially collapsed.
    hawkins.scroll_into_view_if_needed()
    page.keyboard.down("Shift")
    hawkins.hover()
    narrow = page.locator("[data-tooltip-unit-id='rare_hawkins']")
    expect(narrow).to_have_attribute("data-ability-position", "below")
    expect(narrow.locator("[aria-label='Unit capabilities']")).not_to_be_visible()
    have = hawkins.locator("input").input_value()
    narrow.get_by_text("Abilities", exact=True).click()
    expect(narrow.locator("[aria-label='Unit capabilities']")).to_be_visible()
    box = narrow.bounding_box()
    assert 9 <= box["x"] and box["x"] + box["width"] <= 381, box
    assert 9 <= box["y"] and box["y"] + box["height"] <= 835, box
    expect(hawkins.locator("input")).to_have_value(have)
    page.screenshot(path=str(ARTIFACTS / "tooltip-narrow.png"))
    page.keyboard.up("Shift")
    # A deliberately long Custom ability panel checks left placement, independent
    # scrolling, resize fallback and optional source/legacy display compatibility.
    fixture = {"version": "overflow-fixture", "rarities": ["Common", "Eternal"], "units": [
        {"id": "common_luffy", "name": "Luffy", "rarity": "Common", "image": "images/common_luffy.jpg"},
        {"id": "edge_unit", "name": "Edge unit", "rarity": "Eternal", "image": "images/common_luffy.jpg",
         "recipe": [{"unitId": "common_luffy", "count": 1}], "note": "Command: edge. Group reference: 201, 211.",
         "capabilities": [{"category": "shield", "detail": "−4"}],
         "abilityDetails": "Sions — " + "Long verified ability context. " * 250},
    ]}
    page.locator("input[type=file]").set_input_files({"name": "overflow.json", "mimeType": "application/json", "buffer": json.dumps(fixture).encode()})
    page.evaluate("localStorage.setItem('ord_ui_size', '100')")
    page.reload()
    page.set_viewport_size({"width": 900, "height": 700})
    page.get_by_title(re.compile("^UI Zoom: 100%")).click(button="right", modifiers=["Control"])
    expect(page.get_by_title(re.compile("^UI Zoom: 95%"))).to_be_visible()
    edge = page.locator("[data-unit-id='edge_unit']")
    page.keyboard.down("Shift")
    edge.hover()
    popup = page.locator("[data-tooltip-unit-id='edge_unit']")
    expect(popup).to_have_attribute("data-ability-position", "left")
    aside = popup.get_by_role("complementary")
    aside.hover()
    page.wait_for_timeout(200)
    expect(popup).to_be_visible()
    assert not re.search(r"Sions|ORDSearch|−|Group reference", popup.inner_text())
    assert aside.evaluate("el => el.scrollHeight > el.clientHeight")
    abox = aside.bounding_box()
    assert 9 <= abox["x"] and abox["x"] + abox["width"] <= 891, abox
    assert 9 <= abox["y"] and abox["y"] + abox["height"] <= 691, abox
    aside.evaluate("el => el.scrollTop = el.scrollHeight")
    assert aside.evaluate("el => el.scrollTop > 0")
    assert popup.locator("[class*='recipePanel']").evaluate("el => el.scrollTop === 0")
    page.screenshot(path=str(ARTIFACTS / "tooltip-left-overflow.png"))
    page.set_viewport_size({"width": 390, "height": 844})
    edge.hover()
    expect(popup).to_have_attribute("data-ability-position", "below")
    expect(popup.get_by_role("complementary")).to_have_count(0)
    popup.get_by_text("Abilities", exact=True).click()
    expect(popup.locator("[data-ability-details] p")).to_be_visible()
    page.keyboard.up("Shift")
    # Existing users with saved choices but no visibility preference see the panel.
    page.evaluate("localStorage.removeItem('ord_capability_filters_expanded')")
    page.reload()
    expect(panel.get_by_role("checkbox")).to_have_count(28)
    assert not errors, errors
    browser.close()
    print("Browser checks passed: layout, All/Any, persistence, empty states, modal/tooltip values, hidden-material crafting, bans/tree, export/Custom switching, light/narrow keyboard controls.")
