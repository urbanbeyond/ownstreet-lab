"""
연결 점검: 실제로 게시하지 않고, 등록된 열쇠들이 제대로 작동하는지만 확인한다.
결과는 checks/connection-report.md 에 적는다. 열쇠 값은 절대 적지 않는다.

점검 항목
- Meta: 토큰 종류(페이지/사용자)와 만료, 페이스북 페이지, 인스타 계정, 게시 권한, 댓글 읽기 권한
- Netlify: 토큰, LAB 사이트, LIVE 사이트
- LAB 백엔드 주소: 형식, LIVE 주소와 다른지, 응답하는지
- Claude 토큰: 워크플로의 앞 단계 결과(CLAUDE_CHECK)를 받아 적는다
"""

import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "checks" / "connection-report.md"
GRAPH = "https://graph.facebook.com/v21.0"
KST = timezone(timedelta(hours=9))

rows: list[tuple[str, str, str]] = []  # (항목, 결과, 설명)


def ok(item, note=""):
    rows.append((item, "✅", note))


def bad(item, note):
    rows.append((item, "❌", note))


def warn(item, note):
    rows.append((item, "⚠️", note))


def gget(path, token, **params):
    params["access_token"] = token
    try:
        r = requests.get(f"{GRAPH}/{path}", params=params, timeout=30)
        body = r.json()
    except Exception as e:
        return None, f"요청 실패({type(e).__name__})"
    if "error" in body:
        e = body["error"]
        return None, f"{e.get('code')}: {e.get('message', '')[:120]}"
    return body, None


def check_meta():
    token = os.environ.get("META_ACCESS_TOKEN", "").strip()
    ig = os.environ.get("IG_USER_ID", "").strip()
    page = os.environ.get("FB_PAGE_ID", "").strip()

    missing = [n for n, v in [("META_ACCESS_TOKEN", token), ("IG_USER_ID", ig), ("FB_PAGE_ID", page)] if not v]
    if missing:
        bad("Meta 비밀값 등록", "등록 안 됨: " + ", ".join(missing))
        if not token:
            return
    else:
        ok("Meta 비밀값 등록", "3개 모두 등록됨")

    me, err = gget("me", token, fields="id,name")
    if err:
        bad("Meta 토큰 작동", err)
        return
    ok("Meta 토큰 작동", f"토큰 주인: {me.get('name')}")

    # 토큰 종류와 만료
    dbg, err = gget("debug_token", token, input_token=token)
    if dbg and "data" in dbg:
        d = dbg["data"]
        ttype = d.get("type", "?")
        exp = d.get("expires_at", None)
        scopes = set(d.get("scopes", []))
        exp_txt = "만료 없음" if not exp else datetime.fromtimestamp(exp, KST).strftime("%Y-%m-%d %H:%M 만료")
        if ttype == "PAGE" and not exp:
            ok("토큰 종류·만료", f"페이지 토큰, {exp_txt}")
        elif ttype == "PAGE":
            warn("토큰 종류·만료", f"페이지 토큰이지만 {exp_txt} — 장기 토큰에서 다시 받아야 함")
        else:
            warn("토큰 종류·만료", f"{ttype} 토큰, {exp_txt} — 페이지 토큰(만료 없음)을 권장")
        need = {
            "instagram_basic", "instagram_content_publish", "instagram_manage_comments",
            "pages_show_list", "pages_read_engagement", "pages_manage_posts", "pages_read_user_content",
        }
        if scopes:
            lacking = sorted(need - scopes)
            if lacking:
                bad("권한 7종", "빠진 권한: " + ", ".join(lacking))
            else:
                ok("권한 7종", "모두 있음")
    else:
        warn("토큰 종류·만료", f"확인 못 함 ({err}) — 아래 개별 점검으로 판단")

    if page:
        p, err = gget(page, token, fields="name,instagram_business_account")
        if err:
            bad("페이스북 페이지", err)
        else:
            ok("페이스북 페이지", f"{p.get('name')}")
            linked = (p.get("instagram_business_account") or {}).get("id")
            if ig and linked and linked != ig:
                bad("인스타-페이지 연결", "페이지에 연결된 인스타 ID 와 IG_USER_ID 가 다름")
            elif linked:
                ok("인스타-페이지 연결", "연결됨, ID 일치" if linked == ig else "연결됨")
            else:
                bad("인스타-페이지 연결", "페이지에 연결된 인스타 비즈니스 계정이 없음")

    if ig:
        u, err = gget(ig, token, fields="username")
        if err:
            bad("인스타 계정", err)
        else:
            ok("인스타 계정", f"@{u.get('username')}")

        lim, err = gget(f"{ig}/content_publishing_limit", token, fields="quota_usage,config")
        if err:
            bad("인스타 게시 권한", err)
        else:
            data = (lim.get("data") or [{}])[0]
            total = (data.get("config") or {}).get("quota_total", "?")
            ok("인스타 게시 권한", f"게시 가능 (24시간 한도 {total}개 중 {data.get('quota_usage', 0)}개 사용)")

        media, err = gget(f"{ig}/media", token, fields="id", limit=1)
        if err:
            bad("인스타 댓글 읽기", f"게시물 목록 조회 실패: {err}")
        elif not media.get("data"):
            warn("인스타 댓글 읽기", "게시물이 없어 확인 보류")
        else:
            _, err = gget(f"{media['data'][0]['id']}/comments", token, limit=1)
            if err:
                bad("인스타 댓글 읽기", err)
            else:
                ok("인스타 댓글 읽기", "가능")

    if page:
        posts, err = gget(f"{page}/posts", token, fields="id", limit=1)
        if err:
            bad("페이스북 게시물·댓글 읽기", err)
        elif not posts.get("data"):
            warn("페이스북 게시물·댓글 읽기", "게시물이 없어 확인 보류")
        else:
            _, err = gget(f"{posts['data'][0]['id']}/comments", token, limit=1)
            if err:
                bad("페이스북 게시물·댓글 읽기", err)
            else:
                ok("페이스북 게시물·댓글 읽기", "가능")


def check_netlify():
    token = os.environ.get("NETLIFY_AUTH_TOKEN", "").strip()
    sites = [("LAB 사이트", os.environ.get("NETLIFY_LAB_SITE_ID", "").strip()),
             ("LIVE 사이트", os.environ.get("NETLIFY_LIVE_SITE_ID", "").strip())]
    if not token:
        bad("Netlify 토큰", "NETLIFY_AUTH_TOKEN 등록 안 됨")
        return
    try:
        r = requests.get("https://api.netlify.com/api/v1/user", headers={"Authorization": f"Bearer {token}"}, timeout=30)
    except Exception as e:
        bad("Netlify 토큰", f"요청 실패({type(e).__name__})")
        return
    if r.status_code != 200:
        bad("Netlify 토큰", f"작동 안 함 (HTTP {r.status_code})")
        return
    ok("Netlify 토큰", "작동함")
    seen = {}
    for label, sid in sites:
        if not sid:
            bad(label, "사이트 ID 등록 안 됨")
            continue
        r = requests.get(f"https://api.netlify.com/api/v1/sites/{sid}", headers={"Authorization": f"Bearer {token}"}, timeout=30)
        if r.status_code != 200:
            bad(label, f"찾을 수 없음 (HTTP {r.status_code})")
            continue
        s = r.json()
        url = s.get("ssl_url") or s.get("url")
        seen[label] = s.get("id")
        ok(label, f"{s.get('name')} — {url}")
    if len(seen) == 2 and seen["LAB 사이트"] == seen["LIVE 사이트"]:
        bad("LAB·LIVE 분리", "두 사이트 ID 가 같음 — LAB 이 실제 매장을 덮어쓰게 됨")


def check_lab_backend():
    lab = os.environ.get("LAB_APPS_SCRIPT_URL", "").strip()
    pat = re.compile(r"https://script\.google\.com/macros/s/[A-Za-z0-9_\-]+/exec")
    if not lab:
        bad("LAB 백엔드 주소", "LAB_APPS_SCRIPT_URL 등록 안 됨")
        return
    if not pat.fullmatch(lab):
        bad("LAB 백엔드 주소", "형식이 다름 (https://script.google.com/macros/s/…/exec 이어야 함)")
        return
    live = pat.findall((ROOT / "app" / "config.js").read_text(encoding="utf-8"))
    if lab in live:
        bad("LAB 백엔드 주소", "LIVE 주소와 같음 — LAB 요청이 실제 주문 시트에 저장됨")
        return
    try:
        r = requests.get(lab, timeout=30, allow_redirects=True)
        ok("LAB 백엔드 주소", f"형식 정상, LIVE 와 다름, 응답 HTTP {r.status_code}")
    except Exception as e:
        warn("LAB 백엔드 주소", f"형식 정상, LIVE 와 다름, 응답 확인 실패({type(e).__name__})")


def main():
    claude = os.environ.get("CLAUDE_CHECK", "")
    if claude == "success":
        ok("Claude 토큰", "AI 팀이 응답함")
    elif claude == "skipped":
        bad("Claude 토큰", "CLAUDE_CODE_OAUTH_TOKEN 등록 안 됨")
    else:
        bad("Claude 토큰", f"AI 팀 실행 실패 ({claude or '결과 없음'})")

    check_meta()
    check_netlify()
    check_lab_backend()

    now = datetime.now(KST).strftime("%Y-%m-%d %H:%M")
    fails = sum(1 for r in rows if r[1] == "❌")
    lines = [
        "# 연결 점검 결과",
        "",
        f"점검 시각: {now} (한국 시간) · 실제 게시는 하지 않음 · 열쇠 값은 기록하지 않음",
        "",
        f"**문제 {fails}개**" if fails else "**모든 연결 정상**",
        "",
        "| 항목 | 결과 | 설명 |",
        "|---|---|---|",
    ] + [f"| {a} | {b} | {c} |" for a, b, c in rows]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        Path(summary).write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
