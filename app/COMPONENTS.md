# app/ 구성 — 내가브랜드 (R-039, 2026-11-21)

티셔츠 주문 화면은 `live-tee` 브랜치에 보관(LIVE ownstreet.life 는 아직 그 버전). 이 폴더는 LAB(ownstreet.team)용 내가브랜드.

- `index.html` — 한 페이지, 다섯 걸음 섹션(01 단어 · 02 선물할 사람+색 · 03 이름 · 04 로고 · 05 자랑 카드). 앞 걸음을 마쳐야 다음이 열린다.
- `app.js` — 서버 호출 없음. 상태는 이 기기 localStorage(`naegabrand:v1`)에만.
  - 이름 후보: 단어 그대로 · 로마자 · 로마자+선물 대상 꼬리(HOUSE/CLUB/& YOU/SELF/STUDIO) · 색 영문+로마자 · 로마자 01. 사용자가 고르고 고친다.
  - 로고: canvas 1000×1000, 스타일 3개(굵게·배지·태그), 고른 색. 어두운 색이면 테두리를 밝게.
  - 티셔츠 미리보기: `assets/tee.svg`(의장 사진 목업, 점선 없는 판) 위에 로고를 겹쳐 보임.
  - 내 AI 이미지: 프롬프트 복사 + ChatGPT·Gemini 열기 (사용자 계정·사용량, 유료 API 없음).
  - 자랑 카드: canvas 1080×1350 PNG, 공유(Web Share) 또는 저장.
  - 막힐 때 단서 질문: 의장의 실제 답을 예시로 보여 줌(`docs/naegabrand/example-chair.md`).
- `styles.css` — 디자인 시스템(오프화이트·잉크·시그널 오렌지, Anton, 2px 테두리 + 4px 하드 그림자).
- `config.js`, `kakaopay-qr.svg`, `vendor/` — 지금 화면은 쓰지 않지만 규칙상 손대지 않고 둔다.
