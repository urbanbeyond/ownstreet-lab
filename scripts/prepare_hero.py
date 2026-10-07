"""
발행용 대표 이미지(hero.jpg, 1080x1350)를 OWN STREET 디자인으로 만든다.

- post.json 의 image_source 가
  - "screen.png"  → LAB 모바일 화면을 휴대폰 비율 그대로 카드에 넣는다
  - 시안 파일명    → 그 이미지(png/jpg/svg)를 카드에 넣는다
  - 빈 문자열      → card_headline 으로 텍스트 카드를 만든다
- post.json 이 없으면 (사이클이 중간에 멈춘 날): 멈췄다는 사실을 알리는 최소 post.json 을 만든다.

인스타그램 API 는 JPEG 만 받으므로 결과는 항상 hero.jpg 다.
"""

import io
import sys
from glob import glob
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from common import DAILY, ROOT, paused, read_json, today_dir, today_kst, write_json

W, H = 1080, 1350
PAPER = (246, 243, 237)   # #F6F3ED
INK = (19, 22, 27)        # #13161B
SIGNAL = (248, 80, 3)     # #F85003
MUTED = (110, 110, 110)
BORDER, SHADOW = 5, 12     # OWN STREET 의 두꺼운 테두리 + 하드 그림자 (1080px 기준)
FONTS = Path(__file__).resolve().parent / "fonts"

ROLE_LABEL = {
    "pm": "PM",
    "brand-feature-developer": "BRAND FEATURE",
    "designer": "DESIGNER",
    "developer": "DEVELOPER",
    "marketer": "MARKETER",
    "meeting": "TEAM MEETING",
}


def anton(size: int) -> ImageFont.FreeTypeFont:
    p = FONTS / "Anton-Regular.ttf"
    return ImageFont.truetype(str(p), size) if p.exists() else ko(size)


def ko(size: int, weight: str = "Bold") -> ImageFont.FreeTypeFont:
    for name in (f"NotoSansCJK-{weight}.ttc", "NotoSansCJK-Bold.ttc"):
        hits = glob(f"/usr/share/fonts/**/{name}", recursive=True)
        if hits:
            return ImageFont.truetype(hits[0], size, index=1)  # index 1 = 한국어
    return ImageFont.load_default(size)


def wrap(draw: ImageDraw.ImageDraw, text: str, f, max_w: int) -> list[str]:
    lines, line = [], ""
    for ch in text:
        trial = line + ch
        if draw.textlength(trial, font=f) <= max_w:
            line = trial
            continue
        cut = line.rfind(" ")
        if cut > 0:
            lines.append(line[:cut])
            line = line[cut + 1 :] + ch
        else:
            lines.append(line)
            line = ch
    if line:
        lines.append(line)
    return lines


def boxed(draw: ImageDraw.ImageDraw, box, fill=PAPER) -> None:
    x0, y0, x1, y1 = box
    draw.rectangle([x0 + SHADOW, y0 + SHADOW, x1 + SHADOW, y1 + SHADOW], fill=INK)
    draw.rectangle(box, fill=fill, outline=INK, width=BORDER)


def day_count() -> int:
    return len([p for p in DAILY.iterdir() if p.is_dir()]) if DAILY.exists() else 1


def ensure_post(d: Path) -> dict:
    p = d / "post.json"
    if p.exists():
        return read_json(p)
    day = day_count()
    post = {
        "date": today_kst(),
        "day": day,
        "role": "",
        "version": "",
        "angle": "사이클 중단 공개",
        "card_headline": "오늘 AI 팀의 작업이 중간에 멈췄습니다",
        "caption": (
            f"OWN STREET Day {day} · 오늘은 AI 팀의 작업이 중간에 멈췄습니다.\n"
            "무엇이 문제였는지 확인하고, 고치는 과정까지 그대로 공유하겠습니다.\n"
            "멈춘 날도 만드는 과정의 일부입니다.\n\n"
            "#OWNSTREET #buildinpublic #AI팀"
        ),
        "image_source": "",
        "safety_check": "passed",
        "auto_fallback": True,
    }
    write_json(p, post)
    print("post.json 없음 → 중단 공개용 최소 포스트 생성")
    return post


def load_source(path: Path) -> Image.Image | None:
    try:
        if path.suffix.lower() == ".svg":
            import cairosvg

            png = cairosvg.svg2png(url=str(path), output_width=1600)
            img = Image.open(io.BytesIO(png)).convert("RGBA")
        else:
            img = Image.open(path).convert("RGBA")
        if img.getextrema()[3][0] < 255:  # 투명 배경은 종이색 위에
            plate = Image.new("RGBA", img.size, PAPER + (255,))
            plate.alpha_composite(img)
            img = plate
        return img.convert("RGB")
    except Exception as e:
        print(f"대표 이미지 불러오기 실패 ({path.name}): {e} → 텍스트 카드로 대체")
        return None


def header(draw: ImageDraw.ImageDraw, post: dict) -> None:
    draw.text((64, 52), "OWN STREET", font=anton(64), fill=INK)
    # DAY 배지
    label = f"DAY {int(post.get('day') or 0):03d}"
    f = anton(52)
    tw = draw.textlength(label, font=f)
    x1 = W - 64
    x0 = x1 - tw - 48
    boxed(draw, (x0, 52, x1, 136), fill=SIGNAL)
    draw.text((x0 + 24, 58), label, font=f, fill=PAPER)
    # 역할 · 버전
    role = ROLE_LABEL.get(post.get("role", ""), "")
    x = 64
    if role:
        draw.text((x, 150), role, font=ko(30, "Black"), fill=INK)
        x += draw.textlength(role, font=ko(30, "Black")) + 18
    ver = (post.get("version") or "").strip()
    if ver:
        draw.text((x, 144), ver, font=anton(40), fill=SIGNAL)


def footer(draw: ImageDraw.ImageDraw) -> None:
    draw.line([64, H - 110, W - 64, H - 110], fill=INK, width=3)
    draw.text((64, H - 88), "urbanbeyond · AI 팀이 OWN STREET 를 키우는 중", font=ko(28, "Bold"), fill=MUTED)


def headline(draw: ImageDraw.ImageDraw, text: str, y: int, size: int, max_lines: int) -> None:
    f = ko(size, "Black")
    for line in wrap(draw, text or "오늘의 기록", f, W - 128)[:max_lines]:
        draw.text((64, y), line, font=f, fill=INK)
        y += int(size * 1.32)


def text_card(post: dict) -> Image.Image:
    img = Image.new("RGB", (W, H), PAPER)
    draw = ImageDraw.Draw(img)
    header(draw, post)
    boxed(draw, (64, 260, W - 64 - SHADOW, H - 170))
    f = ko(86, "Black")
    lines = wrap(draw, post.get("card_headline") or "오늘의 기록", f, W - 240)[:6]
    y = 260 + ((H - 170 - 260) - len(lines) * 116) // 2
    for line in lines:
        draw.text((110, y), line, font=f, fill=INK)
        y += 116
    footer(draw)
    return img


def image_card(post: dict, src: Image.Image, phone: bool) -> Image.Image:
    img = Image.new("RGB", (W, H), PAPER)
    draw = ImageDraw.Draw(img)
    header(draw, post)

    area_top, area_bottom = 225, H - 330
    if phone:
        # 휴대폰 화면: 세로로 꽉 차게, 왼쪽에 두고 오른쪽에 헤드라인
        h = area_bottom - area_top + 110
        w = int(src.width * h / src.height)
        shot = src.resize((w, h), Image.LANCZOS)
        x0, y0 = 64, area_top + 10
        boxed(draw, (x0 - BORDER, y0 - BORDER, x0 + w + BORDER, y0 + h + BORDER))
        img.paste(shot, (x0, y0))
        tx = x0 + w + 60
        f = ko(54, "Black")
        y = y0 + 20
        for line in wrap(draw, post.get("card_headline", ""), f, W - tx - 64)[:7]:
            draw.text((tx, y), line, font=f, fill=INK)
            y += 72
        draw.text((tx, y0 + h - 40), "LAB 화면", font=ko(28, "Bold"), fill=SIGNAL)
    else:
        box_w, box_h = W - 128 - SHADOW, area_bottom - area_top
        src.thumbnail((box_w - 40, box_h - 40), Image.LANCZOS)
        boxed(draw, (64, area_top, 64 + box_w, area_bottom))
        img.paste(src, (64 + (box_w - src.width) // 2, area_top + (box_h - src.height) // 2))
        headline(draw, post.get("card_headline", ""), area_bottom + 40, 50, 2)
    footer(draw)
    return img


def main() -> int:
    if paused():
        print("PAUSE 파일 있음 — 건너뜀")
        return 0
    d = today_dir()
    d.mkdir(parents=True, exist_ok=True)
    post = ensure_post(d)

    src, phone = None, False
    name = Path((post.get("image_source") or "").strip()).name  # daily 폴더 밖 경로는 쓰지 않는다
    if name:
        path = d / name
        if path.exists():
            src = load_source(path)
            phone = name == "screen.png"
        else:
            print(f"image_source 를 찾을 수 없음: {name} → 텍스트 카드로 대체")

    card = image_card(post, src, phone) if src is not None else text_card(post)
    out = d / "hero.jpg"
    card.save(out, "JPEG", quality=90)
    post["image_path"] = str(out.relative_to(ROOT))
    write_json(d / "post.json", post)
    print(f"대표 이미지 생성 → {post['image_path']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
