"""
LAB 빌드(build/lab)를 로컬 서버로 띄워 휴대폰 크기 화면을 찍는다.
결과: daily/오늘날짜/screen.png — 마케터가 image_source 에 "screen.png" 를 쓴 날 대표 이미지가 된다.
실패해도 사이클을 멈추지 않는다.
"""

import functools
import http.server
import sys
import threading

from common import ROOT, today_dir

BUILD = ROOT / "build" / "lab"
PORT = 8765


def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(BUILD))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def main() -> int:
    if not (BUILD / "index.html").exists():
        print("build/lab 없음 — 스크린샷 건너뜀")
        return 0
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("playwright 없음 — 스크린샷 건너뜀")
        return 0

    httpd = serve()
    out = today_dir() / "screen.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
            try:
                page.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="networkidle", timeout=25000)
            except Exception:
                pass  # 외부 리소스가 늦어도 보이는 만큼 찍는다
            page.wait_for_timeout(1500)
            page.screenshot(path=str(out))
            browser.close()
        print(f"스크린샷 → {out.relative_to(ROOT)}")
    except Exception as e:
        print(f"스크린샷 실패: {e}")
    finally:
        httpd.shutdown()
    return 0


if __name__ == "__main__":
    sys.exit(main())
