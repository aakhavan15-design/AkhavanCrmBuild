"""Playwright UX smoke against a local build. All API traffic is intercepted."""
import argparse
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import TimeoutError as PlaywrightTimeout, expect, sync_playwright


def run_payment_form(browser, origin, width, screenshot_dir):
    height = 790
    context = browser.new_context(
        viewport={"width": width, "height": height},
        has_touch=width < 640,
        service_workers="block",
        reduced_motion="reduce",
    )
    context.add_init_script("localStorage.setItem('akhavan_data_provider', 'SQLSERVER_BACKEND')")
    page = context.new_page()
    page.set_default_timeout(8000)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    host = urlsplit(origin).netloc

    def respond(route):
        url = urlsplit(route.request.url)
        if url.netloc != host:
            return route.abort()
        if url.path == "/api/v1/auth/login":
            return route.fulfill(json={
                "accessToken": "ux-browser-test-token", "expiresIn": 3600,
                "user": {
                    "id": "user-ux", "userName": "ux-fixture", "displayName": "کاربر آزمون",
                    "role": {"id": "role-ux", "name": "مدیر آزمون", "visibilityScope": "ORG"},
                    "permissionSet": {
                        "id": "perm-ux", "permissions": ["accounts.view", "internal.view", "finance.view", "finance.manage"],
                    },
                },
            })
        if url.path == "/api/v1/state/snapshot":
            return route.fulfill(json={"collections": {}, "singletons": {}, "serverVersion": 1})
        if url.path == "/api/v1/state/sync":
            return route.fulfill(json={"ok": True, "upserted": 0, "deleted": 0, "serverVersion": 1, "rejected": []})
        if url.path == "/api/v1/ledger/balances":
            return route.fulfill(json={"status": "EMPTY", "source": "SQLSERVER_BACKEND", "balances": []})
        if url.path.startswith("/api/"):
            return route.fulfill(status=404, json={"error": {"message": "داده‌ای برای آزمون تعریف نشده است."}})
        return route.continue_()

    page.route("**/*", respond)
    try:
        page.goto(origin + "/finance?tab=requests", wait_until="domcontentloaded")
        page.get_by_role("button", name="فضا خاموش").click()
        page.get_by_placeholder("مثال: a.akhavan").fill("ux-fixture")
        page.get_by_placeholder("رمز عبور").fill("ux-fixture-password")
        page.get_by_role("button", name="ورود به سامانه اخوان").click()
        page.wait_for_url(lambda url: "/login" not in url)
        try:
            page.get_by_role("button", name="فعلاً رد می‌کنم").click(timeout=2500)
        except PlaywrightTimeout:
            pass
        page.evaluate("""() => {
          history.pushState({}, '', '/finance?tab=requests');
          dispatchEvent(new PopStateEvent('popstate'));
        }""")
        if width >= 640:
            page.evaluate("document.documentElement.dataset.theme = 'dark'")
        create = page.locator("button.se-header-create")
        create.focus()
        create.click()
        dialog = page.get_by_role("dialog", name="ثبت دستور پرداخت")
        close = dialog.get_by_role("button", name="بستن", exact=True)
        submit = dialog.get_by_role("button", name="ثبت درخواست")
        field = dialog.get_by_placeholder("مثال: کرایه حمل محموله مشتری ...")
        expect(close).to_be_focused()
        page.keyboard.press("Shift+Tab")
        expect(submit).to_be_focused()
        page.keyboard.press("Tab")
        expect(close).to_be_focused()
        assert page.locator("html").evaluate("(el) => el.scrollWidth === el.clientWidth")
        assert dialog.get_attribute("dir") == "rtl"
        if width < 640:
            assert field.evaluate("(el) => parseFloat(getComputedStyle(el).fontSize)") >= 16
            assert close.bounding_box()["height"] >= 44
            page.evaluate("""() => {
              Object.defineProperty(visualViewport, 'height', { configurable: true, get: () => 340 });
              Object.defineProperty(visualViewport, 'offsetTop', { configurable: true, get: () => 12 });
              visualViewport.dispatchEvent(new Event('resize'));
            }""")
            field.focus()
            field.evaluate("() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))")
            box = submit.bounding_box()
            assert box["y"] + box["height"] <= 352, box
            field_box = field.bounding_box()
            assert field_box["y"] >= 12 and field_box["y"] + field_box["height"] <= box["y"], field_box
        if screenshot_dir:
            page.screenshot(path=screenshot_dir / f"payment-{width}.png", animations="disabled")
        page.keyboard.press("Escape")
        expect(dialog).to_have_count(0)
        expect(create).to_be_focused()
        assert not errors, errors
        print(f"PASS payment form {width}px · RTL, focus, overflow and available viewport")
    finally:
        context.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--origin", default="http://127.0.0.1:4198")
    parser.add_argument("--browser", choices=("chromium", "webkit"), default="chromium")
    parser.add_argument("--executable")
    parser.add_argument("--screenshots", type=Path)
    args = parser.parse_args()
    if args.screenshots:
        args.screenshots.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        options = {"executable_path": args.executable} if args.executable else {}
        browser = getattr(playwright, args.browser).launch(**options)
        try:
            for width in (320, 390, 1440):
                run_payment_form(browser, args.origin, width, args.screenshots)
        finally:
            browser.close()


if __name__ == "__main__":
    main()
