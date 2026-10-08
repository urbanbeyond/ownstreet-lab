"""
웹소설 회차의 표지 카드(1080x1350)를 OWN STREET 디자인으로 만든다.

사용: python scripts/novel_cover.py EP002 "첫 회의,|폰에서 본 사람은|아직 없다" "한 줄|두 줄|세 줄" [#포인트색] [오늘의 인물]
  - 제목과 소개 문장은 `|` 로 줄을 나눈다 (제목 3줄, 소개 3줄 이내 권장)
  - 포인트색(선택): 그 회 중심 인물의 색 (novel/CHARACTERS.md). 상자 왼쪽 띠로 들어간다. 시리즈 색 오렌지는 그대로.
  - 오늘의 인물(선택): 띠 색 옆에 작게 적는 이름 (예: "윤 개발자")
결과: novel/covers/EP###.jpg
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw

import prepare_hero as h

ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    ep, title, teaser = sys.argv[1], sys.argv[2].split("|"), sys.argv[3].split("|")
    accent = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] else None
    focus = sys.argv[5] if len(sys.argv) > 5 else ""
    W, H = h.W, h.H
    img = Image.new("RGB", (W, H), h.PAPER)
    d = ImageDraw.Draw(img)
    d.text((64, 52), "OWN STREET", font=h.anton(64), fill=h.INK)
    label = f"EP {ep[2:]}"
    f = h.anton(52)
    tw = d.textlength(label, font=f)
    x1 = W - 64
    x0 = x1 - tw - 48
    h.boxed(d, (x0, 52, x1, 136), fill=h.SIGNAL)
    d.text((x0 + 24, 58), label, font=f, fill=h.PAPER)
    d.text((64, 146), "DEPLOY FICTION", font=h.anton(40), fill=h.SIGNAL)
    d.text((64 + d.textlength("DEPLOY FICTION", font=h.anton(40)) + 20, 152), "디플로이 픽션", font=h.ko(30, "Black"), fill=h.INK)
    h.boxed(d, (64, 260, W - 64 - h.SHADOW, H - 170))
    if accent:
        d.rectangle([66, 262, 66 + 22, H - 172], fill=accent)
    max_w = W - 64 - h.SHADOW - 112 - 48
    size = 104
    while size > 56 and max(d.textlength(ln, font=h.ko(size, "Black")) for ln in title) > max_w:
        size -= 4
    f = h.ko(size, "Black")
    y = 340
    for ln in title:
        d.text((112, y), ln, font=f, fill=h.INK)
        y += int(size * 1.35)
    d.rectangle([112, y + 30, 232, y + 40], fill=h.SIGNAL)
    y += 80
    for ln in teaser:
        d.text((112, y), ln, font=h.ko(40, "Bold"), fill=h.INK)
        y += 60
    d.text((112, H - 260), "글 · 배 마케터 (AI 팀 막내)", font=h.ko(30, "Bold"), fill=h.MUTED)
    if accent and focus:
        fx = 112 + d.textlength("글 · 배 마케터 (AI 팀 막내)", font=h.ko(30, "Bold")) + 36
        d.rectangle([fx, H - 252, fx + 22, H - 230], fill=accent)
        d.text((fx + 34, H - 260), focus, font=h.ko(30, "Bold"), fill=h.INK)
    d.line([64, H - 110, W - 64, H - 110], fill=h.INK, width=3)
    d.text((64, H - 88), "urbanbeyond · AI 코드가 실행되면, 소설은 현실이 된다", font=h.ko(28, "Bold"), fill=h.MUTED)
    out = ROOT / "novel" / "covers" / f"{ep}.jpg"
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, "JPEG", quality=90)
    print(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
