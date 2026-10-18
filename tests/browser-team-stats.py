"""Team stats/recommendation acceptance against a running production preview."""
import json
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4173/ord-helper/"
ARTIFACTS = ROOT / "node_modules/.tmp/team-stats-browser"
ARTIFACTS.mkdir(parents=True, exist_ok=True)


def no_sources(panel):
    assert not re.search(r"ORDSearch|Sions|Warcraft map|\bTMO\b|values differ between references", panel.inner_text(), re.I)


with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    context.add_init_script("""localStorage.setItem('ord_has_seen_help', 'true');
      if (!localStorage.getItem('ord_team_stats:2.323')) localStorage.setItem('ord_team_stats:2.323',
        JSON.stringify({profile:'Balanced', expanded:false, conditions:{}}));
      if (!localStorage.getItem('ord_inventory')) localStorage.setItem('ord_inventory',
        JSON.stringify({common_luffy: 30, hidden_bonkurei: 2, hidden_ivankov: 1}));""")
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(URL)
    panel = page.get_by_role("region", name="Team Stats", exact=True)
    expect(panel).to_contain_text("3 units")
    expect(panel.get_by_role("combobox", name="Build profile")).to_have_value("Hybrid")
    expect(panel.get_by_role("option", name="Balanced", exact=True)).to_have_count(0)
    expect(panel.get_by_role("button", name="Team Stats", exact=True)).to_have_attribute("aria-expanded", "false")
    summary = panel.get_by_role("group", name="Team summary", exact=True)
    armor = summary.locator("[data-team-category='shield']")
    expect(armor).to_be_visible()
    expect(armor).to_contain_text("-11")
    assert armor.inner_text().startswith("-11"), armor.inner_text()
    assert armor.evaluate("chip => chip.firstElementChild.tagName === 'STRONG'")
    assert armor.evaluate("chip => getComputedStyle(chip.querySelector('strong')).color !== getComputedStyle(chip.querySelector('span')).color")
    assert panel.bounding_box()["height"] < 110
    panel.screenshot(path=str(ARTIFACTS / "team-stats-collapsed.png"))
    armor.click()
    contributions = panel.get_by_role("group", name="Armor reduction contributions", exact=True)
    expect(contributions).to_contain_text("Bonkurei (Hidden) × 2")
    expect(contributions).to_contain_text("-11 armor")
    expect(panel.get_by_role("tab")).to_have_count(2)
    expect(panel.get_by_role("tab", name="Build guides", exact=True)).to_have_count(0)
    expect(panel).not_to_contain_text("Extra wood")
    panel.get_by_role("button", name="Team Stats", exact=True).click()
    expect(contributions).to_have_count(0)
    expect(armor).to_be_visible()
    expect(armor).to_contain_text("-11")
    armor.click()
    no_sources(panel)
    saved = page.evaluate("localStorage.getItem('ord_inventory')")
    contributions.get_by_role("button", name="Bonkurei (Hidden) × 2", exact=True).click()
    expect(page.get_by_role("dialog", name="Recipe details")).to_be_visible()
    page.get_by_role("button", name="Close recipe", exact=True).click()
    assert page.evaluate("localStorage.getItem('ord_inventory')") == saved

    filters = page.locator("#capability-filters")
    filters.get_by_role("checkbox", name=re.compile("^Flying")).check()
    expect(panel).to_contain_text("3 units")
    expect(armor).to_contain_text("-11")
    filters.get_by_role("button", name="Clear", exact=True).click()

    panel.get_by_role("combobox", name="Build profile").select_option("Magic")
    panel.get_by_role("tab", name="Easy to craft", exact=True).click()
    page.reload()
    expect(panel.get_by_role("combobox", name="Build profile")).to_have_value("Magic")
    expect(panel.get_by_role("button", name="Team Stats", exact=True)).to_have_attribute("aria-expanded", "true")
    page.get_by_role("button", name="Toggle team stats", exact=True).click()
    expect(panel).to_have_count(0)
    page.reload()
    expect(panel).to_have_count(0)
    page.get_by_role("button", name="Toggle team stats", exact=True).click()
    expect(panel).to_be_visible()
    expect(panel.get_by_role("combobox", name="Build profile")).to_have_value("Magic")

    # Native buff exclusions apply across rarities and duplicate units.
    page.evaluate("localStorage.setItem('ord_inventory', JSON.stringify({rare_sabo:3, hidden_sabo:2, transcendence_sabo:1}))")
    page.reload()
    expect(armor).to_contain_text("~-45…-30")
    armor.click()
    expect(panel.get_by_role("group", name="Armor reduction contributions", exact=True)).to_contain_text("Numeric total incomplete")
    expect(panel.get_by_role("group", name="Armor reduction contributions", exact=True)).to_contain_text("-35")
    expect(panel.get_by_role("group", name="Armor reduction contributions", exact=True)).to_contain_text("-20")
    armor.click()
    numeric_first = summary.locator("[data-team-category]").evaluate_all("chips => chips.map(c => !!c.querySelector('strong'))")
    assert numeric_first == sorted(numeric_first, reverse=True), numeric_first
    panel.get_by_role("tab", name="Easy to craft", exact=True).click()
    cards = panel.get_by_role("tabpanel").locator("[data-recommendation-id]")
    expect(cards).to_have_count(5)
    expect(panel).to_contain_text("crafting readiness and fewest missing materials")
    expect(cards.first).to_contain_text(re.compile("dominant|unclassified"))
    boxes = [cards.nth(i).bounding_box() for i in range(2)]
    assert abs(boxes[0]["y"] - boxes[1]["y"]) < 1, boxes
    assert boxes[1]["x"] > boxes[0]["x"]
    cards.first.scroll_into_view_if_needed()
    expect(cards.first.locator("img")).to_have_js_property("complete", True)
    assert cards.first.locator("img").evaluate("image => image.naturalWidth > 0")
    saved = page.evaluate("localStorage.getItem('ord_inventory')")
    cards.first.get_by_role("button", name=re.compile("^View recipe")).click()
    expect(page.get_by_role("dialog", name="Recipe details")).to_be_visible()
    page.get_by_role("button", name="Close recipe", exact=True).click()
    assert page.evaluate("localStorage.getItem('ord_inventory')") == saved
    panel.screenshot(path=str(ARTIFACTS / "team-stats-cards-wide.png"))
    page.set_viewport_size({"width": 390, "height": 844})
    boxes = [cards.nth(i).bounding_box() for i in range(2)]
    assert abs(boxes[0]["x"] - boxes[1]["x"]) < 1, boxes
    assert boxes[1]["y"] > boxes[0]["y"]
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    panel.screenshot(path=str(ARTIFACTS / "team-stats-cards-narrow.png"))
    page.set_viewport_size({"width": 1440, "height": 1000})

    # The shipped data supplies numeric cumulative support values, not only counts.
    page.evaluate("localStorage.setItem('ord_inventory', JSON.stringify({hidden_sabo:1, hidden_mobydick:1, rare_chopper:1, legendary_dragon:1, rare_brook:1, legendary_chopper:1, random_yotsuba:1, rare_sugar:1}))")
    page.reload()
    expect(summary.locator("[data-team-category='slow']")).to_contain_text("~-75%")
    expect(summary.locator("[data-team-category='damageb']")).to_contain_text("~+50%")
    expect(summary.locator("[data-team-category='speedb']")).to_contain_text("~+35%")
    expect(summary.locator("[data-team-category='regen']")).to_contain_text("~+2.1 mana/s")
    summary.locator("[data-team-category='slow']").click()
    expect(panel.get_by_role("group", name="Movement slow contributions", exact=True)).to_contain_text("Estimated cumulative value")
    panel.screenshot(path=str(ARTIFACTS / "cumulative-support.png"))
    no_sources(panel)

    # A small Custom graph exercises consumed support, exclusive forms and
    # actual crafting without depending on a particular shipped recommendation.
    portrait = "images/common_luffy.jpg"
    fixture = {"version": "fixture", "rarities": ["Common", "Rare", "Legendary"], "units": [
        {"id": "common_luffy", "name": "Luffy", "rarity": "Common", "image": portrait},
        {"id": "support", "name": "Support", "rarity": "Rare", "image": portrait,
         "capabilities": [{"category": "shield", "detail": "-10"}]},
        {"id": "form", "name": "Forms", "rarity": "Rare", "image": portrait, "capabilities": [
            {"category": "damageb", "condition": "Human form", "exclusiveGroup": "form", "detail": "+5"},
            {"category": "docking", "condition": "Phoenix form", "exclusiveGroup": "form", "detail": "+10%"}]},
        {"id": "target", "name": "Target", "rarity": "Legendary", "image": portrait,
         "recipe": [{"unitId": "support", "count": 1}, {"unitId": "common_luffy", "count": 1}],
         "capabilities": [{"category": "slow", "detail": "-20%"}, {"category": "stun", "detail": "1 s"}]},
    ]}
    page.evaluate("""data => {
      localStorage.setItem('ord_custom_data', JSON.stringify(data));
      localStorage.setItem('ord_version', 'Custom');
      localStorage.setItem('ord_inventory', JSON.stringify({common_luffy: 1, support: 1, form: 2}));
      localStorage.setItem('ord_team_stats:Custom', JSON.stringify({expanded:true, profile:'Physical', conditions:{form:{'Human form':2,'Phoenix form':2}}}));
    }""", fixture)
    page.reload()
    expect(panel.get_by_role("combobox", name="Build profile")).to_have_value("Physical")
    expect(panel).to_contain_text("3 units")
    result = panel.get_by_role("tabpanel")
    expect(result).to_contain_text("Target")
    expect(result).to_contain_text("Ready to craft")
    expect(result).to_contain_text("Loses coverage: Armor reduction")
    panel.get_by_role("tab", name="Easy to craft", exact=True).click()
    expect(panel.get_by_role("tabpanel")).to_contain_text("Target")
    panel.get_by_role("tab", name="Easy to craft", exact=True).press("ArrowRight")
    expect(panel.get_by_role("tab", name="Complete team", exact=True)).to_be_focused()
    expect(panel.get_by_role("tab")).to_have_count(2)
    expect(panel).not_to_contain_text("Extra wood")

    panel.get_by_text("Active upgrades & forms", exact=True).click()
    human = panel.get_by_role("checkbox", name="Forms (Rare) · Human form", exact=True)
    phoenix = panel.get_by_role("checkbox", name="Forms (Rare) · Phoenix form", exact=True)
    form_choices = panel.get_by_role("group", name="Forms (Rare) upgrades and forms", exact=True)
    assert abs(human.bounding_box()["y"] - phoenix.bounding_box()["y"]) < 1
    form_choices.screenshot(path=str(ARTIFACTS / "compact-forms-wide.png"))
    expect(human).to_be_checked()
    expect(phoenix).not_to_be_checked()
    expect(panel.locator("[data-team-category='damageb']")).to_contain_text("×1")
    phoenix.focus()
    phoenix.press("Space")
    expect(human).not_to_be_checked()
    expect(phoenix).to_be_checked()
    expect(panel.locator("[data-team-category='damageb']")).to_have_count(0)
    expect(panel.locator("[data-team-category='docking']")).to_contain_text("×1")
    page.reload()
    panel.get_by_text("Active upgrades & forms", exact=True).click()
    expect(human).not_to_be_checked()
    expect(phoenix).to_be_checked()
    no_sources(panel)

    # The checkbox enables one copy; removing the last copy clears its choice.
    row = page.locator("main [data-unit-id='form']")
    row.click(modifiers=["Control"])
    expect(phoenix).to_be_checked()
    row.click(modifiers=["Control"])
    expect(phoenix).to_have_count(0)
    row.click()
    panel.get_by_text("Active upgrades & forms", exact=True).click()
    expect(phoenix).not_to_be_checked()

    # Craft using the existing right-click interaction and verify immediate stats.
    page.locator("main [data-unit-id='target']").click(button="right")
    expect(panel.locator("[data-team-category='shield']")).to_have_count(0)
    expect(panel.locator("[data-team-category='slow']")).to_be_visible()

    page.set_viewport_size({"width": 390, "height": 844})
    page.evaluate("document.documentElement.setAttribute('data-theme', 'light')")
    panel.scroll_into_view_if_needed()
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    assert abs(human.bounding_box()["y"] - phoenix.bounding_box()["y"]) < 1
    form_choices.screenshot(path=str(ARTIFACTS / "compact-forms-narrow.png"))
    page.screenshot(path=str(ARTIFACTS / "team-stats-narrow.png"), full_page=True)
    panel.get_by_role("button", name="Team Stats", exact=True).click()
    expect(panel.locator("[data-team-category='slow']")).to_be_visible()
    expect(panel.get_by_role("tabpanel")).to_have_count(0)
    assert panel.bounding_box()["height"] < 160
    panel.screenshot(path=str(ARTIFACTS / "team-stats-collapsed-narrow.png"))
    no_sources(panel)
    page.once("dialog", lambda dialog: dialog.accept())
    page.get_by_title("Reset Inventory & Bans", exact=True).click()
    expect(panel).to_contain_text("0 units")
    expect(panel).to_contain_text("Add units to your inventory")

    # Special materials gate both tabs and update as inventory changes.
    gate_fixture = {"version": "gates", "rarities": ["Common", "Random", "Combination Item", "Other", "Legendary", "Mystic"], "units": [
        {"id": "common_luffy", "name": "Luffy", "rarity": "Common", "image": portrait},
        {"id": "common_wisp", "name": "Wisp", "rarity": "Common", "image": "images/common_wisp.png"},
        *[{"id": key, "name": key.title(), "rarity": rarity, "image": portrait}
          for key, rarity in [("random", "Random"), ("item", "Combination Item"), ("other", "Other")]],
        *[{"id": f"needs_{key}", "name": f"Needs {key}", "rarity": "Mystic" if key == "random" else "Legendary",
           "image": portrait, "recipe": [{"unitId": key, "count": 1}, {"unitId": "common_luffy", "count": 1}],
           "capabilities": [{"category": "slow"}]} for key in ["random", "item", "other"]],
        {"id": "plain", "name": "Plain", "rarity": "Legendary", "image": portrait,
         "recipe": [{"unitId": "common_luffy", "count": 2}], "capabilities": [{"category": "stun"}]},
    ]}
    page.evaluate("""data => {
      localStorage.setItem('ord_custom_data', JSON.stringify(data));
      localStorage.setItem('ord_inventory', JSON.stringify({common_luffy:1, common_wisp:1}));
      localStorage.setItem('ord_wisp_enabled', 'true');
      localStorage.setItem('ord_team_stats:Custom', JSON.stringify({expanded:true, profile:'Hybrid', conditions:{}}));
    }""", gate_fixture)
    page.reload()
    for tab in ["Complete team", "Easy to craft"]:
        panel.get_by_role("tab", name=tab, exact=True).click()
        expect(panel.locator("[data-recommendation-id]")).to_have_count(1)
        expect(panel.locator("[data-recommendation-id='plain']")).to_be_visible()
        wisp_number = panel.locator("[data-recommendation-id='plain']").get_by_text("1", exact=True)
        expect(wisp_number).to_be_visible()
        for theme, color in [("light", "rgb(6, 95, 70)"), ("dark", "rgb(34, 197, 94)")]:
            page.evaluate("theme => document.documentElement.setAttribute('data-theme', theme)", theme)
            expect(wisp_number).to_have_css("color", color)
        panel.locator("[data-recommendation-id='plain']").screenshot(path=str(ARTIFACTS / "recommendation-wisp.png"))
    for material in ["random", "item", "other"]:
        page.locator(f"main [data-unit-id='{material}']").click()
        for tab in ["Complete team", "Easy to craft"]:
            panel.get_by_role("tab", name=tab, exact=True).click()
            expect(panel.locator(f"[data-recommendation-id='needs_{material}']")).to_be_visible()
    page.locator("main [data-unit-id='random']").click(modifiers=["Control"])
    for tab in ["Complete team", "Easy to craft"]:
        panel.get_by_role("tab", name=tab, exact=True).click()
        expect(panel.locator("[data-recommendation-id='needs_random']")).to_have_count(0)
        expect(panel.locator("[data-recommendation-id='needs_item']")).to_be_visible()
        expect(panel.locator("[data-recommendation-id='needs_other']")).to_be_visible()
    # Profile support remains available even when no recipe can add slow/stun.
    support_fixture = {"version": "supports", "rarities": ["Common", "Legendary"], "units": [
        {"id": "common_luffy", "name": "Luffy", "rarity": "Common", "image": portrait},
        *[{"id": key, "name": key.title(), "rarity": "Legendary", "image": portrait,
           "recipe": [{"unitId": "common_luffy", "count": cost}], "capabilities": [{"category": category}]}
          for key, category, cost in [("armor", "shield", 8), ("attack", "damageb", 6),
                                      ("speed", "speedb", 4), ("mr", "mshield", 9),
                                      ("amp", "docking", 7), ("bomb", "bombup", 5),
                                      ("mana", "mana-skill", 99)]],
    ]}
    page.evaluate("""data => {
      localStorage.setItem('ord_custom_data', JSON.stringify(data));
      localStorage.setItem('ord_inventory', '{}');
      localStorage.setItem('ord_team_stats:Custom', JSON.stringify({expanded:true, profile:'Physical', conditions:{}}));
    }""", support_fixture)
    page.reload()
    panel.get_by_role("tab", name="Complete team", exact=True).click()
    for profile, expected in [("Physical", ["speed", "attack", "armor"]), ("Magic", ["amp", "mr"]),
                              ("Explosion", ["bomb", "mr"]), ("Hybrid", ["speed", "attack", "armor", "mr"])]:
        panel.get_by_role("combobox", name="Build profile").select_option(profile)
        expect(panel).to_contain_text(f"{profile} support suggestions. Still required: Movement slow, Stun.")
        cards = panel.get_by_role("tabpanel").locator("[data-recommendation-id]")
        expect(cards).to_have_count(len(expected))
        assert cards.evaluate_all("cards => cards.map(c => c.dataset.recommendationId)") == expected
        expect(panel.get_by_role("tabpanel")).not_to_contain_text("No available recipe")
        expect(panel.locator("[data-recommendation-id='mana']")).to_have_count(0)
        no_sources(panel)
    panel.get_by_role("combobox", name="Build profile").select_option("Magic")
    page.reload()
    expect(panel).to_contain_text("Magic support suggestions")
    expect(panel.get_by_role("tabpanel")).to_contain_text("Fills: Magic amplification")
    page.set_viewport_size({"width": 390, "height": 844})
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    panel.screenshot(path=str(ARTIFACTS / "profile-support-fallback.png"))

    # Pure-damage cores are eligible; magical Sengoku remains a Physical support.
    damage_fixture = {"version": "damage", "rarities": ["Common", "Uncommon", "Special", "Rare", "Legendary", "Immortal"], "units": [
        {"id": "common_luffy", "name": "Luffy", "rarity": "Common", "image": portrait},
        {"id": "core", "name": "Physical Core", "rarity": "Legendary", "image": portrait,
         "recipe": [{"unitId": "common_luffy", "count": 30}],
         "damageProfile": {"types": ["Physical"], "dominant": "Physical", "core": True}},
        {"id": "cheap", "name": "Affordable Physical", "rarity": "Legendary", "image": portrait,
         "recipe": [{"unitId": "common_luffy", "count": 1}],
         "damageProfile": {"types": ["Physical"], "dominant": "Physical", "core": False}},
        *[{"id": f"early_{rarity}", "name": f"Early {rarity}", "rarity": rarity, "image": portrait,
           "recipe": [{"unitId": "common_luffy", "count": 1}],
           "damageProfile": {"types": ["Physical"], "dominant": "Physical", "core": True},
           "capabilities": [{"category": "slow"}, {"category": "stun"}]}
          for rarity in ["Uncommon", "Special", "Rare"]],
        {"id": "sengoku", "name": "Sengoku", "rarity": "Immortal", "image": portrait,
         "recipe": [{"unitId": "common_luffy", "count": 100}],
         "damageProfile": {"types": ["Magic", "Explosion"], "dominant": "Magic", "core": True},
         "capabilities": [{"category": "stun"}, {"category": "damageb"}]},
    ]}
    page.evaluate("""data => {
      localStorage.setItem('ord_custom_data', JSON.stringify(data));
      localStorage.setItem('ord_inventory', '{}');
      localStorage.setItem('ord_team_stats:Custom', JSON.stringify({expanded:true, profile:'Physical', conditions:{}}));
    }""", damage_fixture)
    page.reload()
    panel.get_by_role("tab", name="Complete team", exact=True).click()
    expect(panel.locator("[data-recommendation-id]")).to_have_count(1)
    expect(panel.locator("[data-recommendation-id='core']")).to_contain_text("Physical core.")
    expect(panel).not_to_contain_text("Highest material cost")
    panel.get_by_role("combobox", name="Build profile").select_option("Magic")
    expect(panel.locator("[data-recommendation-id='sengoku']")).to_contain_text("Magic core.")
    panel.get_by_role("combobox", name="Build profile").select_option("Physical")
    page.locator("main [data-unit-id='core']").click()
    expect(panel.locator("[data-recommendation-id='sengoku']")).to_contain_text("Physical support.")
    expect(panel.locator("[data-recommendation-id='sengoku']")).to_contain_text("Magic dominant")
    page.locator("main [data-unit-id='common_luffy']").click()
    panel.get_by_role("tab", name="Easy to craft", exact=True).click()
    expect(panel.locator("[data-recommendation-id]").first).to_have_attribute("data-recommendation-id", "cheap")
    expect(panel.locator("[data-recommendation-id='cheap']")).to_contain_text("Ready to craft")
    for tab in ["Complete team", "Easy to craft"]:
        panel.get_by_role("tab", name=tab, exact=True).click()
        expect(panel.locator("[data-recommendation-id^='early_']")).to_have_count(0)
    no_sources(panel)
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    panel.screenshot(path=str(ARTIFACTS / "damage-aware-recommendations.png"))
    assert not errors, errors
    context.close()
    browser.close()

print("Team Stats browser checks passed: numeric-first colored summaries, special-material gates on both tabs, compact/exclusive checkbox forms, native aura totals, sorted portrait cards, filtering independence, recipes, persistence, Custom, crafting, keyboard, narrow layout and reset.")
