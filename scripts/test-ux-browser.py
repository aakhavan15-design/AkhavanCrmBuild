"""Playwright UX smoke against a local build. All API traffic is intercepted."""
import argparse
import re
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import TimeoutError as PlaywrightTimeout, expect, sync_playwright


def create_session(browser, origin, width, permissions):
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
                        "id": "perm-ux", "permissions": permissions,
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
    return context, page, errors


def sign_in(page, origin):
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


def navigate(page, path):
    page.evaluate("""route => {
      history.pushState({}, '', route);
      dispatchEvent(new PopStateEvent('popstate'));
    }""", path)


def run_payment_form(browser, origin, width, screenshot_dir):
    context, page, errors = create_session(browser, origin, width, ["accounts.view", "internal.view", "finance.view", "finance.manage"])
    try:
        sign_in(page, origin)
        navigate(page, '/finance?tab=requests')
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


def test_floating_header(browser, origin, width):
    context, page, errors = create_session(browser, origin, width, ["accounts.view", "internal.view"])
    try:
        sign_in(page, origin)
        header = page.get_by_role("banner", name="نوار ابزار اصلی")
        profile = header.get_by_role("button", name="حساب کاربری")
        entry_url = page.url
        profile.click()
        expect(page.get_by_role("dialog", name="حساب کاربری")).to_be_visible()
        assert page.url == entry_url
        page.go_back()
        expect(page.get_by_role("dialog", name="حساب کاربری")).to_have_count(0)
        expect(profile).to_be_focused()
        header.get_by_role("button", name="اعلان‌ها").click()
        expect(page.get_by_role("button", name="مشاهده همه اعلان‌ها")).to_be_visible()
        page.keyboard.press("Escape")
        expect(page.get_by_role("dialog", name="اعلان‌ها")).to_have_count(0)
        header.get_by_role("button", name="گفت‌وگوی سازمانی").click()
        expect(page.get_by_role("button", name="ورود به چت")).to_be_visible()
        page.keyboard.press("Escape")
        header.get_by_role("button", name="منوی اصلی").click()
        expect(page.get_by_role("dialog", name="منوی اصلی سامانه")).to_be_visible()
        page.keyboard.press("Escape")
        expect(header.get_by_role("button", name="منوی اصلی")).to_be_focused()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        assert not errors, errors
    finally:
        context.close()


def test_design_system(browser, origin, screenshot_dir):
    context, page, errors = create_session(browser, origin, 390, ["accounts.view", "settings.manage"])
    try:
        sign_in(page, origin)
        navigate(page, "/design-system")
        expect(page.get_by_role("heading", name="سیستم طراحی")).to_be_visible()
        invalid = page.get_by_role("textbox", name="مبلغ")
        assert invalid.get_attribute("aria-invalid") == "true"
        description_ids = invalid.get_attribute("aria-describedby").split()
        assert len(description_ids) == 2
        assert all(page.evaluate("(id) => Boolean(document.getElementById(id))", identifier) for identifier in description_ids)
        opener = page.get_by_role("button", name="بازکردن پنجره", exact=True)
        opener.click()
        modal = page.get_by_role("dialog", name="بررسی پنجره")
        trigger = modal.get_by_role("button", name="انتخاب در پنجره")
        trigger.click()
        search = modal.get_by_role("combobox", name="انتخاب در پنجره")
        expect(search).to_be_focused()
        search.fill("202")
        expect(search).to_have_attribute("aria-activedescendant", re.compile("option-0$"))
        expect(modal.get_by_role("option", name="گروه غرب")).to_be_visible()
        page.keyboard.press("Escape")
        expect(modal).to_be_visible()
        expect(trigger).to_be_focused()
        trigger.click()
        search.fill("۲۰۲")
        expect(modal.get_by_role("option", name="گروه غرب")).to_be_visible()
        page.keyboard.press("Enter")
        expect(trigger).to_contain_text("گروه غرب")
        second = modal.get_by_role("button", name="بازکردن پنل دوم")
        second.click()
        expect(page.get_by_role("dialog", name="پنل دوم")).to_be_visible()
        page.keyboard.press("Escape")
        expect(second).to_be_focused()
        assert page.evaluate("document.body.style.overflow") == "hidden"
        page.keyboard.press("Escape")
        expect(opener).to_be_focused()
        assert page.evaluate("document.body.style.overflow") != "hidden"
        if screenshot_dir:
            page.evaluate("document.querySelector('#main-scroll-container').scrollTop = 0")
            page.screenshot(path=screenshot_dir / "catalogue-mobile.png", animations="disabled")
        assert not errors, errors
        print("PASS design system · labels, nested Escape, search normalization and scroll lock")
    finally:
        context.close()
    context, page, _ = create_session(browser, origin, 390, ["accounts.view"])
    try:
        sign_in(page, origin)
        navigate(page, "/design-system")
        page.wait_for_url(lambda url: url.endswith("/"))
        expect(page.get_by_role("heading", name="سیستم طراحی")).to_have_count(0)
        print("PASS design system · restricted for a user without settings permission")
    finally:
        context.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--origin", default="http://127.0.0.1:4198")
    parser.add_argument("--browser", choices=("chromium", "webkit"), default="chromium")
    parser.add_argument("--executable")
    parser.add_argument("--design-origin")
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
            for width in (320, 1440):
                test_floating_header(browser, args.origin, width)
            if args.design_origin:
                test_design_system(browser, args.design_origin, args.screenshots)
        finally:
            browser.close()


if __name__ == "__main__":
    main()
