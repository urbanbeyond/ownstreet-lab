"""공통 유틸: 한국 시간 기준 날짜, 경로, Meta Graph API 호출."""

import json
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

KST = timezone(timedelta(hours=9))
ROOT = Path(__file__).resolve().parent.parent
DAILY = ROOT / "daily"
GRAPH = "https://graph.facebook.com/v21.0"


def today_kst() -> str:
    return datetime.now(KST).date().isoformat()


def today_dir() -> Path:
    return DAILY / today_kst()


def paused() -> bool:
    """저장소 루트에 PAUSE 파일이 있으면 모든 자동 작업을 멈춘다."""
    return (ROOT / "PAUSE").exists()


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def graph(method: str, path: str, token: str, retries: int = 3, **params):
    """Meta Graph API 호출. 일시적 오류는 몇 번 재시도한다. 오류 메시지에 토큰이 찍히지 않게 한다."""
    params["access_token"] = token
    last_error = None
    for attempt in range(retries):
        try:
            if method == "GET":
                r = requests.get(f"{GRAPH}/{path}", params=params, timeout=60)
            else:
                r = requests.post(f"{GRAPH}/{path}", data=params, timeout=60)
            if r.status_code < 500:
                body = r.json()
                if "error" in body:
                    err = body["error"]
                    raise RuntimeError(f"Graph API 오류 {err.get('code')}: {err.get('message')}")
                return body
            last_error = RuntimeError(f"Graph API {r.status_code}")
        except requests.RequestException as e:
            last_error = RuntimeError(f"네트워크 오류: {type(e).__name__}")
        time.sleep(3 * (attempt + 1))
    raise last_error
