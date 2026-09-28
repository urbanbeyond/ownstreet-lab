"""
오늘 쓰인 웹소설 회차에 실제 배포 결과를 '배포 도장'으로 찍는다.
디플로이 픽션 — "코드가 실행되면, 소설은 현실이 된다." 소설이 거짓말하지 않게 하는 장치.

환경변수
  DEPLOY_RESULT : deployed | failed | skipped | no-build
  MODE          : work | meeting
"""

import os
import sys
from datetime import datetime

from common import KST, ROOT, read_json, today_dir, today_kst

EPISODES = ROOT / "novel" / "episodes"
MARK = "<!-- deploy-stamp -->"


def find_today_episode():
    if not EPISODES.exists():
        return None
    key = f"daily/{today_kst()}"
    for p in sorted(EPISODES.glob("EP*.md"), reverse=True):
        if key in p.read_text(encoding="utf-8")[:400]:
            return p
    return None


def stamp_line(result: str, mode: str, version: str) -> str:
    now = datetime.now(KST).strftime("%Y-%m-%d %H:%M")
    ver = f" · {version}" if version else ""
    if mode == "meeting":
        return f"▶ no deploy · 회의의 날 · {now} — 오늘은 코드 대신 말이 오갔다."
    if result == "deployed":
        return f"▶ deploy · LAB{ver} · {now} — 코드가 실행됐다."
    if result == "failed":
        return f"▶ deploy failed · LAB{ver} · {now} — 오늘 코드는 실행되지 못했다."
    if result == "no-build":
        return f"▶ deploy blocked · LAB{ver} · {now} — 안전 검사에 걸려 멈췄다."
    return f"▶ deploy pending · LAB{ver} · {now} — 코드는 아직 흐를 길을 기다린다."


def main() -> int:
    ep = find_today_episode()
    if ep is None:
        print("오늘 회차 없음 — 도장 건너뜀")
        return 0
    result = os.environ.get("DEPLOY_RESULT", "skipped")
    mode = os.environ.get("MODE", "work")
    version = ""
    post = today_dir() / "post.json"
    if post.exists():
        try:
            version = (read_json(post).get("version") or "").strip()
        except Exception:
            pass

    text = ep.read_text(encoding="utf-8")
    line = "\n---\n" + stamp_line(result, mode, version) + "\n"
    if MARK in text:
        text = text.replace(MARK, line.strip("\n"), 1)
    elif "▶ " not in text[-300:]:
        text = text.rstrip() + "\n" + line
    else:
        print("이미 도장이 있음 — 건너뜀")
        return 0
    ep.write_text(text, encoding="utf-8")
    print(f"{ep.name} 에 배포 도장: {stamp_line(result, mode, version)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
