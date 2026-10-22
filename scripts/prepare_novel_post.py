"""
오늘의 디플로이 픽션 회차를 SNS 발행용으로 묶는다.
(2026-10-23 의장 결정: 소비자에게 보이는 것은 디플로이 픽션 소설이고, 개발 포스트 post.json 은 기록으로 저장만 한다)

- 오늘 회차: novel/episodes/EP###.md 중 "> 기반 기록: daily/<오늘>" 줄이 있는 가장 큰 번호
- 인스타그램: 마케터가 쓴 novel/social/EP###.json 의 instagram_body (없으면 회차 본문 앞부분으로 자동 생성)
- 페이스북: 회차 전문 (마크다운 기호만 걷어냄)
- 표지: novel/covers/EP###.jpg (novel_cover.py)
- 결과: daily/<오늘>/publish.json — 08:00 발행 작업(Claude 예약 작업 + Metricool)이 이 파일만 읽는다
- 오늘 회차가 없거나 비밀값처럼 보이는 글자가 섞여 있으면 publish.json 을 만들지 않는다 (= 그날은 발행 없음)

사용: python scripts/prepare_novel_post.py [YYYY-MM-DD]
"""

import json
import re
import subprocess
import sys

from common import DAILY, ROOT, paused, today_kst, write_json

LAB_URL = "ownstreet-lab.netlify.app"  # ownstreet.team 인증서가 붙으면 이 값만 바꾼다
INTRO = "urbanbeyond 의 AI 팀 막내가 쓰는 소설입니다. 일어난 일은 실제 기록 그대로, 속마음은 상상입니다."
TAGS = "#urbanbeyond #OWNSTREET #디플로이픽션 #DeployFiction"
IG_MAX = 2200
DEFAULT_ACCENT = "#F85003"
SECRET_RE = re.compile(r"(sk-ant-|nfp_|ghp_|github_pat_|AIza[0-9A-Za-z_-]{20}|script\.google\.com/macros|docs\.google\.com/spreadsheets)")

EPISODES = ROOT / "novel" / "episodes"
SOCIAL = ROOT / "novel" / "social"
COVERS = ROOT / "novel" / "covers"


def find_episode(day: str):
    hits = []
    for p in EPISODES.glob("EP*.md"):
        head = p.read_text(encoding="utf-8").splitlines()[:6]
        if any(l.startswith(">") and f"daily/{day}" in l for l in head):
            hits.append(p)
    return max(hits, key=lambda p: int(re.sub(r"\D", "", p.stem) or 0)) if hits else None


def parse(md: str):
    lines = md.splitlines()
    title = re.sub(r"^#\s*EP\d+\s*[—-]\s*", "", lines[0]).strip() if lines else ""
    body = []
    for l in lines[1:]:
        if l.startswith("> 기반 기록") or l.strip() == "<!-- deploy-stamp -->":
            continue
        if l.strip() == "---":
            body.append("· · ·")
            continue
        l = re.sub(r"^#{2,}\s*", "", l)          # 소제목 기호
        l = l.replace("**", "").replace("`", "")  # 굵게·코드 기호
        body.append(l)
    text = re.sub(r"\n{3,}", "\n\n", "\n".join(body)).strip()
    story = text.split("오늘의 풀이")[0]
    story = story.rsplit("· · ·", 1)[0].strip() if story.rstrip().endswith("· · ·") else story.strip()
    return title, text, story


def wrap_title(title: str, width: int = 9) -> str:
    words, lines, cur = title.replace(",", ", ").split(), [], ""
    for w in words:
        if cur and len(cur) + 1 + len(w) > width:
            lines.append(cur)
            cur = w
        else:
            cur = f"{cur} {w}".strip()
    if cur:
        lines.append(cur)
    return "|".join(lines[:3])


def auto_ig_body(story: str, limit: int = 1100) -> str:
    out = ""
    for para in [p for p in story.split("\n\n") if p.strip()]:
        if para.startswith("· · ·"):
            break
        if len(out) + len(para) > limit:
            break
        out += para + "\n\n"
    return out.strip()


def main() -> int:
    if paused():
        print("PAUSE — 건너뜀")
        return 0
    day = sys.argv[1] if len(sys.argv) > 1 else today_kst()
    ep_path = find_episode(day)
    if not ep_path:
        print(f"{day} 회차 없음 — 오늘은 발행할 소설이 없음")
        return 0
    ep = ep_path.stem
    title, full, story = parse(ep_path.read_text(encoding="utf-8"))

    social_path = SOCIAL / f"{ep}.json"
    social = json.loads(social_path.read_text(encoding="utf-8")) if social_path.exists() else {}
    ig_body = (social.get("instagram_body") or "").strip() if social.get("safety_check") == "passed" else ""
    auto = not ig_body
    if auto:
        ig_body = auto_ig_body(story)

    header = f"디플로이 픽션 {ep} — {title}"
    lab = f"👉 오늘의 LAB 직접 눌러보기: {LAB_URL}"
    ig_tail = f"\n\n전문은 페이스북 urbanbeyond 페이지에 있어요.\n\n{lab}\n\n{TAGS}"
    ig_head = f"{header}\n\n"
    room = IG_MAX - len(ig_head) - len(ig_tail) - len(INTRO) - 4
    if len(ig_body) > room:
        ig_body = ig_body[: room - 1].rsplit("\n", 1)[0].rstrip() + "…"
    instagram = f"{ig_head}{ig_body}\n\n{INTRO}{ig_tail}"
    facebook = f"{header}\n\n{INTRO}\n\n{full}\n\n{lab}\n\n{TAGS}"

    for name, text in (("instagram", instagram), ("facebook", facebook)):
        if SECRET_RE.search(text):
            print(f"{name} 글에 비밀값처럼 보이는 글자가 있어 발행 파일을 만들지 않음")
            return 1

    cover_title = social.get("cover_title") or wrap_title(title)
    cover_teaser = social.get("cover_teaser") or "오늘 새벽,|AI 팀에서|실제로 일어난 일"
    accent = social.get("accent") or DEFAULT_ACCENT
    focus = social.get("focus") or ""
    subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "novel_cover.py"), ep, cover_title, cover_teaser, accent, focus],
        check=True,
    )

    out = {
        "source": "novel",
        "date": day,
        "episode": ep,
        "title": title,
        "image_path": f"novel/covers/{ep}.jpg",
        "instagram": instagram,
        "facebook": facebook,
        "instagram_auto": auto,
    }
    (DAILY / day).mkdir(parents=True, exist_ok=True)
    write_json(DAILY / day / "publish.json", out)
    print(f"발행 준비 완료 → daily/{day}/publish.json ({ep}, 인스타 {len(instagram)}자{' 자동' if auto else ''}, 페이스북 {len(facebook)}자)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
