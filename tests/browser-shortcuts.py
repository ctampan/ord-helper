"""Single-key global shortcuts, modifier exclusion and saved-binding migration."""
import json
import re
import sys

from playwright.sync_api import expect, sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4173/ord-helper/"


def dispatch(page, key, **flags):
    # Synthetic modified keys verify app handling without invoking OS/browser commands.
    return page.evaluate("""options => {
      const event = new KeyboardEvent('keydown', {bubbles:true, cancelable:true, ...options});
      document.activeElement.dispatchEvent(event);
      return event.defaultPrevented;
    }""", {"key": key, **flags})


with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    context.add_init_script("""if (!localStorage.getItem('shortcut_test_initialized')) {
      localStorage.setItem('shortcut_test_initialized', 'true');
      localStorage.setItem('ord_has_seen_help', 'true');
      localStorage.setItem('ord_inventory', JSON.stringify({common_luffy:3}));
      localStorage.setItem('ord_shortcuts', JSON.stringify({unitShortcuts:{common_luffy:'q'},
        globalShortcuts:{TOGGLE_TOOLTIP:'t', TOGGLE_BAN_MODE:'b', TOGGLE_WISP_MODE:'w'}}));
    }""")
    page = context.new_page()
    errors = []
    dialogs = []
    page.on("pageerror", lambda error: errors.append(str(error)))

    def dismiss(dialog):
        dialogs.append(dialog.message)
        dialog.dismiss()

    page.on("dialog", dismiss)
    page.goto(URL)
    config = page.get_by_role("region", name="Configuration", exact=True)
    stats = config.get_by_role("button", name="Toggle team stats", exact=True)
    filters = config.get_by_role("button", name="Toggle ability filters", exact=True)
    reset = config.get_by_role("button", name="Reset", exact=True)
    for button, key in [(stats, "s"), (filters, "f"), (reset, "r")]:
        expect(button).to_have_attribute("aria-keyshortcuts", key)
        expect(button).to_have_attribute("title", re.compile(f"Shortcut: {key.upper()}$"))

    # New defaults are added to an older saved map without losing the unit binding.
    saved = page.evaluate("localStorage.getItem('ord_inventory')")
    for key in ["s", "f", "r"]:
        for modifier in ["ctrlKey", "altKey", "shiftKey", "metaKey"]:
            assert not dispatch(page, key, **{modifier: True}), (key, modifier)
        assert not dispatch(page, key, repeat=True)
        assert not dispatch(page, key, isComposing=True)
    expect(stats).to_have_attribute("aria-pressed", "true")
    expect(filters).to_have_attribute("aria-pressed", "true")
    assert not dialogs, dialogs
    assert page.evaluate("localStorage.getItem('ord_inventory')") == saved

    # Send real Ctrl+R as well. Headless Chrome may not perform browser UI shortcuts.
    page.keyboard.press("Control+r")
    page.reload()
    expect(stats).to_have_attribute("aria-pressed", "true")
    assert not dialogs, dialogs
    assert page.evaluate("localStorage.getItem('ord_inventory')") == saved

    page.keyboard.press("s")
    expect(stats).to_have_attribute("aria-pressed", "false")
    expect(page.locator("#team-stats")).to_have_count(0)
    page.reload()
    expect(stats).to_have_attribute("aria-pressed", "false")
    page.keyboard.press("s")
    expect(page.locator("#team-stats")).to_be_visible()

    filter_panel = page.locator("#capability-filters")
    flying = filter_panel.get_by_role("checkbox", name=re.compile("^Flying"))
    flying.check()
    page.evaluate("document.activeElement.blur()")
    page.keyboard.press("f")
    expect(filter_panel).to_have_count(0)
    page.reload()
    expect(filters).to_have_attribute("aria-pressed", "false")
    page.keyboard.press("f")
    expect(flying).to_be_checked()
    filter_panel.get_by_role("button", name="Clear", exact=True).click()

    # Global keys do nothing while editing inventory or selecting a version.
    count = page.locator("main [data-unit-id='common_luffy'] input")
    count.focus()
    for key in ["s", "f", "r"]:
        assert not dispatch(page, key)
    expect(stats).to_have_attribute("aria-pressed", "true")
    expect(filters).to_have_attribute("aria-pressed", "true")
    assert not dialogs, dialogs
    config.get_by_role("combobox", name="Game version").focus()
    for key in ["s", "f", "r"]:
        assert not dispatch(page, key)
    page.evaluate("document.activeElement.blur()")

    # Plain unit keys and Ctrl+unit keys keep their add/remove semantics.
    page.keyboard.press("q")
    expect(count).to_have_value("4")
    page.keyboard.press("Control+q")
    expect(count).to_have_value("3")

    page.keyboard.press("r")
    assert dialogs == ["Reset inventory and bans?"]
    assert page.evaluate("localStorage.getItem('ord_inventory')") == saved

    # Capturing a shortcut must not trigger any current global action.
    config.get_by_title("Keyboard Shortcuts", exact=True).click()
    reset_row = page.get_by_text("Reset Inventory", exact=True).locator("..")
    reset_row.get_by_text("r", exact=True).click()
    page.keyboard.press("r")
    assert len(dialogs) == 1
    stats_row = page.get_by_text("Toggle Team Stats", exact=True).locator("..")
    stats_row.get_by_text("s", exact=True).click()
    page.keyboard.press("x")
    page.get_by_role("button", name="Remove shortcut for Toggle Ability Filters", exact=True).click()
    page.get_by_role("button", name="Close shortcuts", exact=True).click()
    page.reload()
    expect(stats).to_have_attribute("aria-keyshortcuts", "x")
    assert filters.get_attribute("aria-keyshortcuts") is None
    page.keyboard.press("s")
    expect(stats).to_have_attribute("aria-pressed", "true")
    page.keyboard.press("x")
    expect(stats).to_have_attribute("aria-pressed", "false")
    page.keyboard.press("f")
    expect(filters).to_have_attribute("aria-pressed", "true")

    # Existing unit/custom global keys take precedence over newly introduced defaults.
    page.evaluate("""() => localStorage.setItem('ord_shortcuts', JSON.stringify({
      unitShortcuts:{common_luffy:'s'}, globalShortcuts:{TOGGLE_TOOLTIP:'f', RESET_INVENTORY:'z'}
    }))""")
    page.reload()
    assert stats.get_attribute("aria-keyshortcuts") is None
    assert filters.get_attribute("aria-keyshortcuts") is None
    expect(reset).to_have_attribute("aria-keyshortcuts", "z")
    page.keyboard.press("s")
    expect(count).to_have_value("4")
    expect(stats).to_have_attribute("aria-pressed", "false")
    page.keyboard.press("r")
    assert len(dialogs) == 1
    page.keyboard.press("z")
    assert len(dialogs) == 2

    # Accepting the same reset confirmation clears the inventory.
    page.remove_listener("dialog", dismiss)
    page.once("dialog", lambda dialog: dialog.accept())
    page.keyboard.press("z")
    expect(count).to_have_value("0")
    assert not errors, errors
    browser.close()
    print("Shortcut browser checks passed: S/F/R, modifiers, native Ctrl+R, persistence, text input, recording, remaps, conflicts and reset confirmation.")
