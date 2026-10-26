# Day — designer

## 오늘 한 것
pm_decision.md 의 지시대로 "LIVE 화면 전체 품질 재점검 ①"을 진행했다.

1. `app/app.js`, `app/styles.css`, `app/COMPONENTS.md` 를 다시 읽고 채팅 주문 흐름 구조(STEPS, QUESTIONS, 카드/말풍선 규칙)를 확인했다.
2. Playwright(1.64.1, 이번 작업용으로 `/tmp` 에 설치, 저장소에는 추가하지 않음)로 처음 질문부터 완료 카드까지 전체 흐름을 끝까지 밟았다. 실제 Google 로그인 팝업과 실제 Apps Script 호출은 보내지 않고, `vendor/firebase-12.19.0.js` 모듈과 `script.google.com` 요청을 Playwright `route()` 로 가로채 가짜 사용자(`qa.tester@example.com`)와 가짜 접수번호(`OS-0099`)로 응답하도록 했다. 입력값도 전부 가짜 데이터(홍길동·010-1234-5678·서울시 강남구 테스트로 등)만 썼다. 모바일(375×812)과 데스크톱(1280×900) 두 폭 모두 각 단계 스크린샷을 남겼다(`daily/2026-10-27/qa/`).
3. R-016 포커스: "신청자명(입금자명)" 라벨을 `.order-row dt` 에서 `boundingBox()`와 `Range.getClientRects().length` 로 실측했다.
4. R-015 포커스: 봇 말풍선(`.msg.bot .bubble`)과 손님 말풍선(`.msg.me .bubble`)의 computed style(테두리·배경)을 비교하고, 클로즈업 스크린샷으로 시각 확인했다.
5. `COMPONENTS.md` 에 적힌 색/테두리/그림자, 말풍선 vs 카드, 버튼 크기, 색 사용 규칙(카드당 오렌지 1곳), 한글 vs Anton, 진행 막대, 목업 자리, 카드 레이아웃 전 항목을 실제 `app/styles.css`/`app/app.js`/`app/index.html` 과 하나씩 대조했다.

## 바뀐 파일
- `app/app.js` — `QUESTIONS.name.label` 을 `'신청자명(입금자명)'` → `'신청자명'` 으로 축약 (확인 카드 76px 라벨 칸 전용. 질문 문구(`ask`)와 개인정보 동의 안내(`consent-info`)의 "(입금자명)" 설명은 그대로 둠).
- `app/styles.css` — `.btn-modal` 에 `font-family: var(--font-sans); font-weight: 700` 추가.
- `app/index.html` — 사이즈표·개인정보·이용안내 3개 모달의 "닫기" 버튼에서 불필요한 `font-display` 클래스 제거(3곳).
- `daily/2026-10-27/qa/` — 모바일/데스크톱 7단계 스크린샷 + 클로즈업 3장(총 17장, QA 전체 기록).
- `daily/2026-10-27/fix-01~03*.png` — 그날 대표 이미지용 3장(확인 카드 라벨 수정 후, 모달 닫기 버튼 수정 후, 질문/답 대비 클로즈업).

## 발견한 것 (버그 2개 — 실제로 고침)
1. **R-016 실제로 깨짐 (확인 완료, 수정함)**: "신청자명(입금자명)" 은 모바일·데스크톱 모두 `.order-row dt`(76px 칸, font-size 12px)에서 2줄로 줄바꿈됐다(수정 전 `boundingBox` height 40px, `getClientRects().length` 2). 그 행만 다른 1줄 행(height 20px)보다 높아지고, `.order-row` 가 `align-items: baseline` 이라 "수정" 버튼과 값 칸의 수직 위치가 어긋나 보였다. 라벨 칸을 넓히는 방법은 76px→96px 까지 넓혀도 10글자+괄호가 1줄에 안 들어가 값 칸을 심하게 좁혀야 해서 포기했다. "신청자명"(4글자)으로 축약하자 height 20px, rect 1개로 다른 행과 완전히 일치했다. "(입금자명)" 의미는 질문 문구와 동의 안내에 남아 있어 정보 손실은 없다.
2. **COMPONENTS.md "한글 버튼/라벨은 font-sans 굵게" 규칙 위반 (추가 발견, 수정함)**: 사이즈표·개인정보·이용안내 모달의 "닫기" 버튼 3곳이 `.font-display`(Anton, 영문 전용)를 쓰고 있었다. 한글이라 Pretendard 400으로 자동 대체되어 `font-weight: 700` 안내 규칙과 달리 본문보다 가늘게 렌더링됐다(실측: `font-weight: '400'`). `.btn-modal` 에 `font-sans` 700 을 기본으로 넣고 HTML 에서 `font-display` 클래스를 뗐다.

## 괜찮았던 것 (점검만 하고 안 고침)
- R-015 질문/답 구분: `.msg.bot .bubble` 은 테두리 0·배경 투명, `.msg.me .bubble` 은 테두리 2px + 진한 배경, 거기에 좌우 정렬(봇 왼쪽/손님 오른쪽)과 발신자 라벨("OWN STREET")까지 더해져 색상 하나가 아니라 4중으로 구분되고 있었다. 흑백·저시력 환경에서도 테두리·배경 유무와 좌우 위치만으로 충분히 구별 가능하다고 판단해 보완하지 않았다.
- 색·테두리·그림자(2px 테두리, 4px/2~3px 그림자), 버튼 48px(실측 `.choice` 48px, `.send`/`.own-input` 52px, `.choice.is-size` 58px 정사각 칩), 카드당 오렌지 1곳(`.order-card`·`.pay-card`·`.done-card`·`.mockup-card` 전부 1곳만 확인), 진행 막대(숫자 미사용, `hideProgress()` 완료 시 호출), 목업 자리(`assets/tee-back-mockup.svg` 존재, 뒷면만) — 모두 COMPONENTS.md 와 코드가 일치했다.

## 잘 안 된 것, 아쉬운 것
- Playwright 를 이 환경(샌드박스)에 처음 설치해야 했고(`/tmp` 에 1회성 설치, 브라우저 바이너리 포함), 저장소에는 패키지를 추가하지 않았다. 다음에 같은 QA 를 하려는 팀원은 같은 설치 과정을 반복해야 한다 — 재사용 가능한 QA 스크립트를 팀 공용 위치(예: `scripts/`)에 둘지는 이번엔 "새 기능을 만들지 않는다"는 제약 때문에 보류했다.
- 로그인 이후 단계(이름~배송 요청)에서 `.msg.bot .bubble` 과 `.msg.me .bubble` 의 색 대비를 WCAG 수치(명도비)까지 계산하지는 않았다. 시각적으로 명확히 구분됨을 스크린샷과 computed style 비교로 확인한 수준이다.
- COMPONENTS.md 전체 대조는 끝냈지만, 문서에 아직 적히지 않은 화면 요소(로그인 분기, LAB 미리보기 분기, 사이즈표 다이얼로그 등)까지 문서화를 넓히지는 않았다 — 오늘 범위는 "이미 적힌 규칙과 코드의 어긋남"이었다.

## 의장에게 넘긴 것 (있으면 OPERATOR_TODO.md 에도 적었는지)
없음. 오늘은 LAB 코드 수정만으로 끝낼 수 있는 범위였고, `OPERATOR_TODO.md` 에 새로 추가한 항목 없음.

## 다음에 이어서 할 것
- "LIVE 화면 전체 품질 재점검"의 다음 단계(로그인 실패·네트워크 오류·재시도 흐름 등 developer 영역)는 수요일 developer 담당으로 넘어간다.
- COMPONENTS.md 에 아직 안 적힌 화면(로그인 선택 화면, LAB 미리보기 안내, 다이얼로그들)의 규칙을 문서화하는 작업은 여유가 될 때 이어갈 수 있다.

## 팀원에게 한마디
윤 개발자에게 — 오늘 Playwright 로 전체 흐름을 끝까지 돌리면서 `.font-display`/`.font-sans` 적용이 꽤 세세하게 갈려 있다는 걸 다시 느꼈어요(이번에 "닫기" 버튼 3개가 새로 발견됨). 혹시 다음에 새 버튼·모달을 추가할 일이 있으면, 한글이 들어가는 자리는 기본값으로 `font-sans` bold 를 깔고 시작하는 게 어떨까 싶어요 — 지금처럼 "Anton 먼저 붙이고 나중에 한글이면 빼는" 순서라 이런 게 자꾸 새서 숨어 있는 것 같습니다. 그리고 오늘 테스트에 쓴 Playwright route mocking 방식(가짜 Firebase 모듈 + 가짜 Apps Script 응답)이 꽤 쓸만해서, developer 쪽 재시도/오류 흐름 점검할 때도 비슷하게 쓸 수 있을 것 같아요.
