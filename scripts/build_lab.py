"""
app/ 를 LAB 용으로 변환해 build/lab/ 에 만든다. LIVE 고객과 결제를 보호하는 안전 장치다.

1. 모든 Apps Script 주소(script.google.com/macros/s/.../exec)를 LAB 전용 주소로 바꾼다
   → LAB 에서 들어온 요청은 실제 주문 시트가 아닌 LAB 시트에 저장된다
2. 카카오페이 링크를 막고, 카카오페이 QR 이미지 파일을 "LAB 결제 불가" 이미지로 바꾼다
3. 모든 HTML 맨 위에 LAB 배너를 붙이고, 검색엔진 노출을 막는다
4. 변환 뒤 다시 검사해서 LIVE 주소나 결제 링크가 하나라도 남아 있으면 빌드를 지우고 실패한다
   (이 경우 LAB 배포 단계는 건너뛴다)

환경변수: LAB_APPS_SCRIPT_URL (필수)
"""

import os
import re
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "app"
OUT = ROOT / "build" / "lab"

TEXT_EXT = {".html", ".htm", ".js", ".mjs", ".css", ".json", ".txt", ".svg", ".webmanifest", ".xml"}
APPS_SCRIPT_RE = re.compile(r"https://script\.google\.com/macros/s/[A-Za-z0-9_\-]+/exec")
KAKAOPAY_URL_RE = re.compile(r"https?://[A-Za-z0-9.\-]*kakaopay\.com[^\s\"'<>)]*", re.I)
PAY_IMAGE_RE = re.compile(r"(kakao[-_]?pay|pay[-_]?qr|qr[-_]?pay)", re.I)
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}

BANNER = (
    '<div id="lab-banner" style="position:sticky;top:0;z-index:2147483647;'
    "background:#13161B;color:#F6F3ED;font:600 13px/1.4 -apple-system,system-ui,sans-serif;"
    'padding:9px 14px;text-align:center;border-bottom:3px solid #F85003">'
    '<b style="color:#F85003;letter-spacing:.08em">LAB</b> · AI 팀의 실험실 버전입니다. '
    "여기서 한 요청은 실제로 제작·결제되지 않아요.</div>"
)
NOINDEX = '<meta name="robots" content="noindex,nofollow">'


def lab_pay_image(path: Path) -> None:
    """결제 QR 자리에 들어갈 'LAB 결제 불가' 이미지."""
    if path.suffix.lower() == ".svg":
        path.write_text(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">'
            '<rect width="400" height="400" fill="#F6F3ED" stroke="#13161B" stroke-width="8"/>'
            '<text x="200" y="190" font-size="64" text-anchor="middle" font-family="sans-serif" '
            'font-weight="bold" fill="#F85003">LAB</text>'
            '<text x="200" y="250" font-size="28" text-anchor="middle" font-family="sans-serif" '
            'fill="#13161B">결제 불가</text></svg>',
            encoding="utf-8",
        )
        return
    try:
        size = Image.open(path).size
    except Exception:
        size = (400, 400)
    img = Image.new("RGB", size, (246, 243, 237))
    d = ImageDraw.Draw(img)
    w, h = size
    d.rectangle([2, 2, w - 3, h - 3], outline=(19, 22, 27), width=max(4, w // 50))
    d.line([0, 0, w, h], fill=(248, 80, 3), width=max(4, w // 40))
    d.line([0, h, w, 0], fill=(248, 80, 3), width=max(4, w // 40))
    fmt = {".jpg": "JPEG", ".jpeg": "JPEG", ".webp": "WEBP", ".gif": "GIF"}.get(path.suffix.lower(), "PNG")
    img.save(path, fmt)


def transform_text(text: str, lab_url: str, is_html: bool) -> str:
    text = APPS_SCRIPT_RE.sub(lab_url, text)
    text = KAKAOPAY_URL_RE.sub("#lab-no-payment", text)
    if is_html:
        text, n = re.subn(r"(<body[^>]*>)", r"\1" + BANNER, text, count=1, flags=re.I)
        if n == 0:
            text = BANNER + text
        text, n = re.subn(r"</head>", NOINDEX + "</head>", text, count=1, flags=re.I)
    return text


def verify(lab_url: str) -> list[str]:
    problems = []
    for f in OUT.rglob("*"):
        if not f.is_file():
            continue
        rel = f.relative_to(OUT)
        if f.suffix.lower() in TEXT_EXT:
            t = f.read_text(encoding="utf-8", errors="ignore")
            for m in APPS_SCRIPT_RE.findall(t):
                if m != lab_url:
                    problems.append(f"{rel}: LAB 이 아닌 Apps Script 주소가 남아 있음")
            if KAKAOPAY_URL_RE.search(t):
                problems.append(f"{rel}: 카카오페이 링크가 남아 있음")
    return problems


def main() -> int:
    lab_url = os.environ.get("LAB_APPS_SCRIPT_URL", "").strip()
    if not APPS_SCRIPT_RE.fullmatch(lab_url):
        print("LAB_APPS_SCRIPT_URL 이 없거나 형식이 다름 — 안전을 위해 LAB 빌드를 만들지 않음")
        return 2
    if not APP.exists():
        print("app/ 폴더가 없음")
        return 2

    shutil.rmtree(OUT, ignore_errors=True)
    shutil.copytree(APP, OUT)

    changed_urls = replaced_imgs = 0
    for f in OUT.rglob("*"):
        if not f.is_file():
            continue
        ext = f.suffix.lower()
        if ext in IMAGE_EXT and PAY_IMAGE_RE.search(f.name):
            lab_pay_image(f)
            replaced_imgs += 1
            continue
        if ext in TEXT_EXT:
            before = f.read_text(encoding="utf-8", errors="ignore")
            after = transform_text(before, lab_url, ext in {".html", ".htm"})
            if after != before:
                changed_urls += len(APPS_SCRIPT_RE.findall(before)) + len(KAKAOPAY_URL_RE.findall(before))
                f.write_text(after, encoding="utf-8")

    problems = verify(lab_url)
    if problems:
        shutil.rmtree(OUT, ignore_errors=True)
        print("LAB 빌드 안전 검사 실패 — 배포하지 않음:")
        for p in problems:
            print(" -", p)
        return 1

    print(f"LAB 빌드 완료 → build/lab (주소·결제 링크 {changed_urls}곳 교체, 결제 이미지 {replaced_imgs}개 교체, 배너 추가)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
