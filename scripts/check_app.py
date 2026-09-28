"""
app/ 이 최소한 열리는 상태인지 점검한다.
- index.html 존재
- app/ 의 자바스크립트 문법 (node --check, vendor/ 제외)

사용:
  python scripts/check_app.py            # 결과만 출력, 항상 0으로 종료
  python scripts/check_app.py --strict   # 문제가 있으면 1로 종료 (LIVE 반영 전 검사용)
  python scripts/check_app.py --report daily/2026-10-01/lab_status.md
"""

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "app"


def check() -> list[str]:
    problems = []
    if not (APP / "index.html").exists():
        problems.append("app/index.html 이 없음")
    node = shutil.which("node")
    if node:
        for js in sorted(APP.rglob("*.js")):
            if "vendor" in js.relative_to(APP).parts:
                continue
            r = subprocess.run([node, "--check", str(js)], capture_output=True, text=True)
            if r.returncode != 0:
                lines = r.stderr.strip().splitlines()
                first = next((l for l in lines if "Error" in l), lines[0] if lines else "문법 오류")
                problems.append(f"{js.relative_to(ROOT)}: {first}")
    else:
        print("node 없음 — 자바스크립트 문법 검사 건너뜀")
    return problems


def main() -> int:
    strict = "--strict" in sys.argv
    report = None
    if "--report" in sys.argv:
        report = ROOT / sys.argv[sys.argv.index("--report") + 1]

    problems = check()
    if problems:
        text = "# LAB 상태: 문제 있음\n\n" + "\n".join(f"- {p}" for p in problems) + "\n\n다음 사이클에서 먼저 고쳐야 함.\n"
    else:
        text = "# LAB 상태: 정상\n\nindex.html 있음, 자바스크립트 문법 오류 없음.\n"
    print(text)
    if report:
        report.parent.mkdir(parents=True, exist_ok=True)
        report.write_text(text, encoding="utf-8")
    return 1 if (strict and problems) else 0


if __name__ == "__main__":
    sys.exit(main())
