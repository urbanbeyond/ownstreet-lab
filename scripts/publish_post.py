"""
그날의 post.json 을 인스타그램과 페이스북에 발행한다. 사람 검수 없음.

- 이미 발행한 날은 다시 올리지 않는다 (published.json 이 있으면 건너뜀).
- 인스타그램: 이미지 컨테이너 생성 → 처리 완료까지 대기 → 발행.
- 페이스북: 페이지에 사진+캡션으로 발행.
- 발행 결과(포스트 ID)는 daily/날짜/published.json 에 저장 → 다음 날 댓글 수집에 사용.
- DRY_RUN=1 이면 실제로 올리지 않고 무엇을 올릴지만 출력한다.

환경변수: META_ACCESS_TOKEN, IG_USER_ID, FB_PAGE_ID, RAW_BASE
"""

import os
import sys
import time

from common import graph, paused, read_json, today_dir, today_kst, write_json

MAX_CAPTION = 2200


def wait_container(container_id: str, token: str, timeout: int = 300) -> None:
    waited = 0
    while waited < timeout:
        status = graph("GET", container_id, token, fields="status_code").get("status_code")
        if status == "FINISHED":
            return
        if status in ("ERROR", "EXPIRED"):
            raise RuntimeError(f"인스타 컨테이너 처리 실패: {status}")
        time.sleep(5)
        waited += 5
    raise RuntimeError("인스타 컨테이너 처리 시간 초과")


def main() -> int:
    if paused():
        print("PAUSE 파일 있음 — 발행 건너뜀")
        return 0

    d = today_dir()
    post_path = d / "post.json"
    if not post_path.exists():
        print(f"{today_kst()} post.json 없음 — 발행할 것 없음")
        return 0
    if (d / "published.json").exists():
        print("오늘은 이미 발행됨 — 건너뜀")
        return 0

    post = read_json(post_path)
    if post.get("safety_check") != "passed":
        print("안전 체크 미통과 — 발행하지 않음")
        return 0

    caption = post["caption"][:MAX_CAPTION]
    image_url = f"{os.environ.get('RAW_BASE', '').rstrip('/')}/{post['image_path']}"

    if os.environ.get("DRY_RUN") == "1":
        print("[DRY_RUN] 이미지:", image_url)
        print("[DRY_RUN] 캡션:\n" + caption)
        return 0

    token = os.environ["META_ACCESS_TOKEN"]
    result = {"date": today_kst()}
    errors = []

    try:
        c = graph("POST", f"{os.environ['IG_USER_ID']}/media", token, image_url=image_url, caption=caption)
        wait_container(c["id"], token)
        pub = graph("POST", f"{os.environ['IG_USER_ID']}/media_publish", token, creation_id=c["id"])
        result["instagram_media_id"] = pub["id"]
        print("인스타그램 발행 완료")
    except Exception as e:
        errors.append(f"instagram: {e}")
        print(f"인스타그램 발행 실패: {e}")

    try:
        fb = graph("POST", f"{os.environ['FB_PAGE_ID']}/photos", token, url=image_url, message=caption)
        result["facebook_post_id"] = fb.get("post_id") or fb.get("id")
        print("페이스북 발행 완료")
    except Exception as e:
        errors.append(f"facebook: {e}")
        print(f"페이스북 발행 실패: {e}")

    if len(result) > 1:
        if errors:
            result["errors"] = errors
        write_json(d / "published.json", result)

    # 둘 다 실패하면 워크플로를 실패로 표시해 GitHub 가 알림 메일을 보내게 한다
    return 1 if len(result) == 1 else 0


if __name__ == "__main__":
    sys.exit(main())
