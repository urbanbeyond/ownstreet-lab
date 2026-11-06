"""
캐릭터 컷 — 그날 회차의 실제 대사를 캐릭터 시트 얼굴과 말풍선으로 엮은 이미지(1080x1350)를 만든다.
의장 결정 2026-11-06 (R-027): ChatGPT 웹툰 예약에 기대지 않고, 피드 첫 장에 사람이 보이게 매일 자동으로 만든다.

사용: python scripts/make_character_cuts.py EP024
재료: novel/social/EP###.json 의 "cuts" (막내가 쓴다)
  "cuts": [
    {"speaker": "윤 개발자", "expression": "thinking", "line": "회차 본문에 있는 대사 그대로", "caption": "(선택) 장면 설명 한 줄"},
    ...
  ]
  - 3~6줄. 한 장에 두 줄씩 → 최대 3장 (novel/webtoon/EP###/01.png, 02.png, 03.png)
  - line 은 회차 본문(EP###.md)에 있는 문장이어야 한다. 본문에 없는 말은 건너뛴다 (지어낸 대사 방지).
  - speaker: 김 PM / 신 브랜더 / 진 디자이너 / 윤 개발자 / 배 마케터(=나, 막내) / 의장
  - expression: 인물마다 4가지 (아래 FACES). 맞지 않으면 기본 표정.
결과가 없거나 cuts 가 없으면 아무것도 만들지 않는다 (발행은 표지 한 장으로 나간다).
"""

import json
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw

import prepare_hero as h

ROOT = Path(__file__).resolve().parent.parent
FACE_DIR = ROOT / "novel" / "assets" / "faces"

ROLES = {
    "김 PM": "pm", "PM": "pm",
    "신 브랜더": "brander", "브랜더": "brander",
    "진 디자이너": "designer", "디자이너": "designer",
    "윤 개발자": "developer", "개발자": "developer",
    "배 마케터": "marketer", "마케터": "marketer", "막내": "marketer", "나": "marketer",
    "의장": "chair", "이 의장": "chair",
}
FACES = {
    "pm": ["neutral", "thinking", "explaining", "determined"],
    "brander": ["neutral", "playful", "thinking", "confident"],
    "designer": ["neutral", "observing", "analyzing", "verifying"],
    "developer": ["neutral", "thinking", "explaining", "determined"],
    "marketer": ["smile", "listening", "playful", "confident"],
    "chair": ["neutral", "thinking", "smiling", "determined"],
}
NAMES = {"pm": "김 PM", "brander": "신 브랜더", "designer": "진 디자이너",
         "developer": "윤 개발자", "marketer": "배 마케터", "chair": "의장"}
ACCENT = {"pm": (31, 43, 70), "brander": (217, 139, 127), "designer": (0, 71, 199),
          "developer": (47, 62, 51), "marketer": (212, 167, 44), "chair": (19, 22, 27)}

W, H = h.W, h.H
INK, PAPER, SIGNAL, MUTED = h.INK, h.PAPER, h.SIGNAL, h.MUTED
WHITE = (255, 255, 255)


def norm(s: str) -> str:
    return re.sub(r"[\s\"'“”‘’「」『』.,!?…·—\-]", "", s)


def wrap(draw, text, font, max_w):
    lines, cur = [], ""
    for word in text.split(" "):
        test = (cur + " " + word).strip()
        if draw.textlength(test, font=font) <= max_w:
            cur = test
            continue
        if cur:
            lines.append(cur)
        cur = word
        while draw.textlength(cur, font=font) > max_w:  # 아주 긴 덩어리는 글자 단위로
            i = len(cur)
            while i > 1 and draw.textlength(cur[:i], font=font) > max_w:
                i -= 1
            lines.append(cur[:i])
            cur = cur[i:]
    if cur:
        lines.append(cur)
    return lines


def face(role, expr):
    expr = expr if expr in FACES[role] else FACES[role][0]
    return Image.open(FACE_DIR / f"{role}_{expr}.jpg").convert("RGB")


def row(img, d, y, role, expr, line, left: bool):
    """한 사람의 얼굴 + 말풍선. 높이 약 470."""
    fw, fh = 300, 380
    fimg = face(role, expr)
    fimg = fimg.resize((fw, int(fimg.height * fw / fimg.width)))
    fimg = fimg.crop((0, 0, fw, min(fh, fimg.height)))
    fh = fimg.height
    fx = 64 if left else W - 64 - fw
    h.boxed(d, (fx - 4, y - 4, fx + fw + 4, y + fh + 4), fill=PAPER)
    img.paste(fimg, (fx, y))
    # 이름표 (인물 색 띠)
    d.rectangle([fx, y + fh + 14, fx + 10, y + fh + 54], fill=ACCENT[role])
    d.text((fx + 22, y + fh + 12), NAMES[role], font=h.ko(32, "Black"), fill=INK)
    # 말풍선
    bx0 = fx + fw + 44 if left else 64
    bx1 = W - 64 if left else fx - 44
    font = h.ko(42, "Bold")
    lines = wrap(d, line, font, bx1 - bx0 - 64)[:6]
    lh = 60
    bh = max(150, len(lines) * lh + 64)
    by0 = y + 24
    by1 = by0 + bh
    h.boxed(d, (bx0, by0, bx1, by1), fill=WHITE)
    # 꼬리 (얼굴 쪽으로)
    ty = by0 + 56
    if left:
        d.polygon([(bx0 + 2, ty), (bx0 - 34, ty + 22), (bx0 + 2, ty + 44)], fill=WHITE, outline=INK)
        d.line([(bx0 + 2, ty + 3), (bx0 + 2, ty + 41)], fill=WHITE, width=6)
    else:
        d.polygon([(bx1 - 2, ty), (bx1 + 34, ty + 22), (bx1 - 2, ty + 44)], fill=WHITE, outline=INK)
        d.line([(bx1 - 2, ty + 3), (bx1 - 2, ty + 41)], fill=WHITE, width=6)
    for i, ln in enumerate(lines):
        d.text((bx0 + 32, by0 + 32 + i * lh), ln, font=font, fill=INK)
    return max(y + fh + 70, by1 + 20)


def render(ep, title, cuts, page, pages, out):
    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img)
    d.text((64, 52), "OWN STREET", font=h.anton(56), fill=INK)
    tag = ep
    f = h.anton(40)
    tw = d.textlength(tag, font=f)
    h.boxed(d, (W - 64 - tw - 40, 56, W - 64, 120), fill=SIGNAL)
    d.text((W - 64 - tw - 20, 62), tag, font=f, fill=PAPER)
    d.text((64, 128), "디플로이 픽션 · " + title, font=h.ko(30, "Bold"), fill=MUTED)
    y = 210
    cap = next((c.get("caption") for c in cuts if c.get("caption")), "")
    if cap:
        cf = h.ko(34, "Bold")
        cl = wrap(d, cap, cf, W - 128 - 56)[:2]
        ch = len(cl) * 48 + 40
        d.rectangle([64, y, W - 64, y + ch], fill=INK)
        for i, ln in enumerate(cl):
            d.text((92, y + 20 + i * 48), ln, font=cf, fill=PAPER)
        y += ch + 44
    else:
        y += 20
    for i, c in enumerate(cuts):
        y = row(img, d, y, c["role"], c.get("expression", ""), c["line"], left=(i % 2 == 0))
        y += 30
    d.line([64, H - 96, W - 64, H - 96], fill=INK, width=3)
    d.text((64, H - 76), "urbanbeyond · AI 팀 막내가 쓰는 회사 이야기", font=h.ko(26, "Bold"), fill=MUTED)
    pg = f"{page}/{pages}"
    d.text((W - 64 - d.textlength(pg, font=h.anton(32)), H - 80), pg, font=h.anton(32), fill=INK)
    img.save(out, quality=92)


def main() -> int:
    ep = sys.argv[1]
    ep_md = ROOT / "novel" / "episodes" / f"{ep}.md"
    social = ROOT / "novel" / "social" / f"{ep}.json"
    if not ep_md.exists() or not social.exists():
        print(f"{ep}: 회차 또는 SNS 판 없음 — 캐릭터 컷 건너뜀")
        return 0
    data = json.loads(social.read_text(encoding="utf-8"))
    raw = data.get("cuts") or []
    body = norm(ep_md.read_text(encoding="utf-8"))
    title = (ep_md.read_text(encoding="utf-8").splitlines() or [""])[0].lstrip("# ").split("—")[-1].strip()
    cuts = []
    for c in raw:
        role = ROLES.get((c.get("speaker") or "").strip())
        line = (c.get("line") or "").strip().strip('"“”')
        if not role or not line:
            continue
        if norm(line) not in body:
            print(f"본문에 없는 대사라 건너뜀: {line[:30]}")
            continue
        cuts.append({**c, "role": role, "line": line})
    cuts = cuts[:6]
    if len(cuts) < 2:
        print(f"{ep}: 쓸 수 있는 대사가 2줄 미만 — 캐릭터 컷 건너뜀")
        return 0
    outdir = ROOT / "novel" / "webtoon" / ep
    outdir.mkdir(parents=True, exist_ok=True)
    for old in outdir.glob("[0-9][0-9].*"):
        old.unlink()
    groups = [cuts[i:i + 2] for i in range(0, len(cuts), 2)]
    for i, g in enumerate(groups, 1):
        render(ep, title, g, i, len(groups), outdir / f"{i:02d}.jpg")
    print(f"{ep}: 캐릭터 컷 {len(groups)}장 → {outdir.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
