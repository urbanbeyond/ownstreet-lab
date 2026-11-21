# app/ 구성 — 내가브랜드 (R-039, 2026-11-21)

티셔츠 주문 화면은 `live-tee` 브랜치에 보관(LIVE ownstreet.life 는 아직 그 버전). 이 폴더는 LAB(ownstreet.team)용 내가브랜드.

- `index.html` — 한 페이지, 다섯 걸음 섹션(01 단어 · 02 선물할 사람+색 · 03 이름 · 04 로고 · 05 자랑 카드). 앞 걸음을 마쳐야 다음이 열린다.
- `app.js` — 서버 호출 없음. 상태는 이 기기 localStorage(`naegabrand:v1`)에만.
  - 이름(R-041): 단어를 그대로 쓰지 않고 `naming-words.js`(이름 사전)에서 같은 결의 격 있는 말(영어·라틴어·프랑스어·이탈리아어·한자어 등)과 뜻을 보여 준다. 사용자가 고르고 고친다. 사전에 없는 단어는 내 AI 에게 물어볼 글(복사+ChatGPT·Gemini 열기). "내 단어 그대로 쓸래"도 가능. 꼬리말·숫자 붙이기 금지(R-040).
  - 로고: canvas 1000×1000, 스타일 3개(굵게·배지·태그), 고른 색. 어두운 색이면 테두리를 밝게.
  - 티셔츠 미리보기: `assets/tee.svg`(의장 사진 목업, 점선 없는 판) 위에 로고를 겹쳐 보임.
  - 내 AI 이미지: 프롬프트 복사 + ChatGPT·Gemini 열기 (사용자 계정·사용량, 유료 API 없음).
  - 자랑 카드: canvas 1080×1350 PNG, 공유(Web Share) 또는 저장.
  - 막힐 때 단서 질문: 의장의 실제 답을 예시로 보여 줌(`docs/naegabrand/example-chair.md`).
- `styles.css` — 디자인 시스템(오프화이트·잉크·시그널 오렌지, Anton, 2px 테두리 + 4px 하드 그림자).
- `config.js`, `kakaopay-qr.svg`, `vendor/` — 지금 화면은 쓰지 않지만 규칙상 손대지 않고 둔다.

## 내 AI 커넥터 (R-042, 2026-11-21)
- `../netlify/functions/mcp.mjs` — MCP 커넥터 `https://ownstreet.team/mcp` (Netlify Functions, 로그인·저장·유료 API 없음). 사용자가 자기 ChatGPT·Claude 커스텀 커넥터에 넣으면 대화는 사용자 AI 가, 이 서버는 도구 3개만:
  - `naegabrand_start` 진행 안내(단어 1개 → 선물할 사람 → 색 → 격 있는 다른 말로 이름 → 로고), `naegabrand_name_words` 이름 사전, `naegabrand_make_logo` 결과 링크.
  - 사용 횟수는 함수 로그에 도구 이름만 남는다(개인정보 없음).
- `b/` — 결과 페이지. `?n=이름&c=색&t=선물할 사람&w=단어&s=bold|badge|tag` 로 로고·티셔츠·자랑 카드를 그린다. 서버 저장 없음.
- `connect/` — 연결 방법 안내(주소 복사 → 내 AI 에 넣기 → "내가브랜드로 내 브랜드 만들어 줘").
- `brand-render.js` — 로고·카드 그리기 공용 모듈(웹 화면과 결과 페이지가 같이 쓴다).
- 배포: LAB 배포 명령에 `--functions=netlify/functions` 가 있어야 커넥터가 살아 있다 (lab-deploy.yml, daily-cycle.yml). LIVE(promote-live)에는 넣지 않았다.
