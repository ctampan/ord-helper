"""Tooltip first-paint, Shift race, and count-feedback regressions on production.

Run against port 4173: python tests/browser-tooltip-ux.py
Requires Python Playwright and Chrome. Captures only in-memory test instrumentation.
"""
import json

from playwright.sync_api import expect, sync_playwright

SAMPLE_FRAMES = """() => {
  window.tooltipFrames = [];
  let remaining = 18;
  const sample = () => {
    const tips = [...document.querySelectorAll('[data-tooltip-unit-id]')]
      .filter(el => getComputedStyle(el).visibility === 'visible');
    for (const tip of tips) {
      const rect = tip.getBoundingClientRect();
      window.tooltipFrames.push({ id: tip.dataset.tooltipUnitId, side: tip.dataset.abilityPosition,
        x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    }
    if (--remaining) requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
} """

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel="chrome", headless=True)
    context = browser.new_context(viewport={"width": 1920, "height": 1080})
    context.add_init_script("localStorage.setItem('ord_has_seen_help', 'true'); localStorage.setItem('ord_capability_filters_expanded', 'false')")
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    # Different intrinsic image sizes must not move tooltip geometry.
    page.route("**/images/**", lambda route: route.fulfill(status=200, content_type="image/svg+xml",
               body='<svg xmlns="http://www.w3.org/2000/svg" width="400" height="900"><rect width="400" height="900" fill="blue"/></svg>'))
    page.goto("http://127.0.0.1:4173/ord-helper/")
    expect(page.locator("main [data-unit-id]")).to_have_count(278)
    a = page.locator("[data-unit-id='rare_hawkins']")
    b = page.locator("[data-unit-id='transcendence_doflamingo']")
    a.hover()
    page.keyboard.down("Shift")
    expect(page.locator("[data-tooltip-unit-id='rare_hawkins']")).to_be_visible()
    page.keyboard.up("Shift")
    expect(page.locator("[data-tooltip-unit-id]")).to_have_count(0)
    b.hover()
    # Reproduce a delayed enter from A arriving after the pointer reached B.
    a.dispatch_event("mouseover")
    page.evaluate(SAMPLE_FRAMES)
    page.keyboard.down("Shift")
    tip = page.locator("[data-tooltip-unit-id='transcendence_doflamingo']")
    expect(tip).to_be_visible()
    page.wait_for_timeout(350)
    frames = page.evaluate("window.tooltipFrames")
    assert frames and {frame["id"] for frame in frames} == {"transcendence_doflamingo"}, frames
    assert len({(frame["side"], frame["x"], frame["y"], frame["width"], frame["height"]) for frame in frames}) == 1, frames
    page.keyboard.up("Shift")
    expect(page.locator("[data-tooltip-unit-id]")).to_have_count(0)

    # Pointer outside every unit must not resurrect a retained hover on Shift.
    page.mouse.move(0, 0)
    a.dispatch_event("mouseover")
    page.keyboard.down("Shift")
    expect(page.locator("[data-tooltip-unit-id]")).to_have_count(0)
    page.keyboard.up("Shift")
    a.hover()
    page.keyboard.down("Shift")
    expect(page.locator("[data-tooltip-unit-id='rare_hawkins']")).to_be_visible()
    page.evaluate("window.dispatchEvent(new Event('blur'))")
    expect(page.locator("[data-tooltip-unit-id]")).to_have_count(0)
    page.keyboard.up("Shift")

    # The fallback is also measured in its final collapsed form before painting.
    page.set_viewport_size({"width": 390, "height": 844})
    a.hover()
    page.evaluate(SAMPLE_FRAMES)
    page.keyboard.down("Shift")
    expect(page.locator("[data-tooltip-unit-id='rare_hawkins']")).to_be_visible()
    page.wait_for_timeout(350)
    narrow_frames = page.evaluate("window.tooltipFrames")
    assert narrow_frames and {frame["side"] for frame in narrow_frames} == {"below"}, narrow_frames
    assert len({(frame["x"], frame["y"], frame["width"], frame["height"]) for frame in narrow_frames}) == 1, narrow_frames
    page.keyboard.up("Shift")

    page.set_viewport_size({"width": 1920, "height": 1080})
    a.locator("input").fill("1")
    feedback = page.locator("[data-count-feedback='rare_hawkins']")
    expect(feedback).to_have_text("+1")
    assert feedback.evaluate("el => el.parentElement === document.body && getComputedStyle(el).pointerEvents === 'none'")
    animation = feedback.locator("span")
    assert animation.evaluate("el => parseFloat(getComputedStyle(el).animationDuration)") >= 1
    # Inspect a precise animation time instead of relying on a busy CI clock.
    animation.evaluate("el => { const animation = el.getAnimations()[0]; animation.pause(); animation.currentTime = 650; }")
    expect(feedback).to_be_visible()
    assert float(animation.evaluate("el => getComputedStyle(el).opacity")) >= 0.95
    feedback_box, row_box = animation.bounding_box(), a.bounding_box()
    assert feedback_box["y"] < row_box["y"], (feedback_box, row_box)
    animation.evaluate("el => el.getAnimations()[0].play()")
    expect(feedback).to_have_count(0, timeout=2000)
    a.locator("input").fill("4")
    expect(feedback).to_have_text("+3")
    a.locator("input").fill("2")
    expect(feedback).to_have_text("-2")
    animation.evaluate("el => { const animation = el.getAnimations()[0]; animation.pause(); animation.currentTime = 650; }")
    expect(feedback).to_be_visible()
    page.emulate_media(reduced_motion="reduce")
    a.locator("input").fill("3")
    expect(feedback).to_have_text("+1")
    assert "feedbackFade" in animation.evaluate("el => getComputedStyle(el).animationName")
    expect(feedback).to_have_count(0, timeout=2000)
    a.locator("[class*='name']").click()
    expect(a.locator("input")).to_have_value("4")
    expect(feedback).to_have_text("+1")
    a.locator("[class*='name']").click(modifiers=["Control"])
    expect(a.locator("input")).to_have_value("3")
    expect(feedback).to_have_text("-1")
    assert not errors, errors
    browser.close()
    print(json.dumps({"stable_wide_frames": len(frames), "stable_narrow_frames": len(narrow_frames)}))
    print("Tooltip UX checks passed: stale Shift target, outside-pointer/blur safeguards, stable first paint, unclipped sustained add/remove feedback and reduced motion.")
