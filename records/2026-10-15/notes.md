# 2026-10-15 기록 (저장소 밖 일 + 사이클 진단)

## 자동 사이클이 빈손이던 진짜 원인
- 증상: 10-11 이후 매일 daily/ 폴더에 임시 포스트("작업이 중간에 멈췄습니다")만 남고 pm_decision·work_summary·소설 회차 없음. app/ 는 10-08 이후 변화 없음.
- 원인: Daily Lab Cycle 의 "Run AI team" 단계가 매일 12~20초 만에 끝남(정상이면 수십 분). claude-code-action 이 인증에서 즉시 튕긴 것. => CLAUDE_CODE_OAUTH_TOKEN 만료/누락으로 판단.
- 이 단계에 continue-on-error 가 걸려 있어, 실패해도 Actions 화면에는 "성공"으로 표시됨. 그래서 멈춘 걸 알아차리지 못했다.
- 지금까지 나온 진짜 결과물(EP001~003, 10-12 회의)은 자동 사이클이 아니라 대화에서 직접 만든 것. 무인 사이클 자체는 11일부터 빈손.

## Morning Publish 실패
- IG_USER_ID·FB_PAGE_ID 가 비어 발행 단계가 매일 실패. (토큰 문제와 별개)

## Codex 충돌 여부
- 의장이 로컬(C:\...\Codex\ownstreetlife)에서 Codex 로 비슷한 데일리 작업을 돌리고 있었음. 확인 결과 구조가 다른 별개 코드베이스(docs/MVP_SPEC.md, prompts/daily-cycle.md 등은 우리 저장소에 없음)이고, 우리 저장소에 외부 커밋 흔적 없음. => 이번 GitHub 실패의 원인은 아님.
- 결정: OWN STREET 의 개발·이야기 글·기록은 Claude 하나로. 이미지 생성(웹툰화·시각물)은 ChatGPT 쪽. 로컬 Codex 의 OWN STREET '개발' 데일리는 중지. (DIRECTION.md 반영)

## 오늘 한 것 (코드)
- 임시(fallback) 포스트가 실제 브랜드 계정에 자동 발행되지 않도록 안전장치 추가(publish_post.py 는 auto_fallback 이면 건너뜀, prepare_hero.py 는 fallback 포스트의 safety_check 를 passed 대신 fallback 으로).

## 의장 조치 대기
- CLAUDE_CODE_OAUTH_TOKEN 재발급(claude setup-token) 후 GitHub Secrets 갱신 — 1순위.
- IG_USER_ID·FB_PAGE_ID 입력(또는 발행을 Metricool 로 이관).
- 로컬 Codex 의 OWN STREET 개발 데일리 중지. (이미지 생성 쪽 ChatGPT 활용은 유지)
