# Day 15 — developer

## 오늘 한 것
1. PM 결정(`daily/2026-10-23/pm_decision.md`)의 요약을 그대로 믿지 않고 먼저 직접 재현했다.
   - `node`로 `init()`이 모듈 최상단에서 즉시 호출되고, 그 안에서 호출되는 함수가 나중에 `const`로
     선언되는 변수를 참조하는 최소 예제를 만들어 `Cannot access 'QUESTIONS' before initialization`가
     실제로 발생하는지 확인했다(TDZ, Temporal Dead Zone).
   - 그다음 실제 `app/app.js`를 Playwright(chromium)로 띄워서 같은 문제가 있는지 확인했다.
     `loadDraft()`의 `catch` 블록에 임시로 `console.error`를 하나 추가해(검증 끝나고 즉시 원복,
     `diff`로 원본과 바이트 단위 동일함을 확인) 재현했더니 콘솔에 다음이 그대로 찍혔다.
     ```
     [DEBUG loadDraft catch] ReferenceError: Cannot access 'QUESTIONS' before initialization
         at loadDraft (app.js:1084:19)
         at initChat (app.js:340:17)
         at init (app.js:76:3)
         at app.js:68:1
     ```
   - PM 요약이 정확했다. `init()`(68행)이 파일 로드 시 즉시 호출 → `initChat()`(320행) →
     `loadDraft()`(1076행)가 `QUESTIONS[step]`(246행에서 `const`로 선언)을 TDZ 구간에서 참조해
     예외가 났고, `loadDraft()`의 `try/catch`가 이를 조용히 삼켜 항상 `null`을 반환했다. 그 결과
     "이어하기" 메시지는 한 번도 뜨지 않고, sessionStorage에 저장된 draft가 있어도 항상 처음부터
     "주문 시작" 버튼이 다시 떴다.
2. PM이 제안한 두 가지 고치는 방법(설정 상수를 `init()` 호출보다 앞으로 옮기기 / `init()` 호출을
   파일 끝으로 옮기기) 중, 파일 안에 `QUESTIONS` 외에도 `GOOGLE_ICON` 등 나중에 선언되는
   top-level `const`가 더 있어서(1064행) 상수만 옮기면 또 다른 TDZ 참조가 남을 수 있다고 보고,
   **`init()` 호출 자체를 파일 맨 끝(모든 top-level `const` 선언이 끝난 지점)으로 옮기는 방법**을
   택했다. 함수 선언(`function ...`)은 모두 호이스팅되므로 호출 순서만 이렇게 바꿔도 다른 동작은
   그대로다. 변경은 단 두 군데:
   - 68행 근처의 `init();` 호출 줄을 삭제.
   - 파일 맨 끝(`prefersReducedMotion()` 함수 뒤)에 왜 이 위치에 두는지 적은 주석과 함께
     `init();` 한 줄을 추가.
3. `node --check app/app.js`로 문법 확인, 그리고 Playwright로 수정 전/후를 비교 검증했다
   (아래 "검증 방법과 결과" 참고).
4. `CHANGELOG.md`에 v0.9 한 줄 추가.

## 바뀐 파일
- `app/app.js`
  - 68행 근처의 `init();` 호출 줄 삭제.
  - 파일 맨 끝(기존 1292행 `prefersReducedMotion()` 함수 뒤)에 `init();` 호출과 설명 주석을 추가.
  - 그 외 로직·문구·동작은 전혀 바꾸지 않았다(diff로 확인: 삭제 2줄 + 추가 7줄(주석 5줄 + 공백 1줄 +
    `init();` 1줄)뿐).
- `CHANGELOG.md` — v0.9 한 줄 추가.
- (참고) `ROADMAP.md`에 diff가 있었는데, 이는 10-22 작업자가 이미 남긴 변경으로 내가 만든 것이
  아니다. 그대로 두었다.

## 검증 방법과 결과
서버(Code.gs) 호출, 실제 Firebase 로그인 모두 하지 않았다. `app/`을 `python3 -m http.server`로
로컬에 띄우고 Playwright(chromium)로 다음을 확인했다.

**시나리오 1 — 이름 질문(로그인 필요) 전 단계까지 작성한 draft로 새로고침**
sessionStorage에 `ownstreet.order.v1 = {"data":{"url":"https://example.com/chat/abc"}}`를 미리
넣고 페이지를 새로고침.
- 수정 전: 콘솔에 TDZ `ReferenceError`(위에 적은 그대로), 화면에는 "이어서 진행합니다" 메시지 없이
  처음부터 "주문 시작" 버튼이 다시 떴다.
- 수정 후: 콘솔 에러 없음. 저장된 `url` 답변이 말풍선으로 재생되고 "이어서 진행합니다" 메시지가
  뜬 뒤, 다음 질문("한 줄 이야기")으로 자연스럽게 이어졌다.

**시나리오 2 — 로그인이 필요한 단계 바로 앞(`url`·`story`·`size` 작성됨)까지의 draft**
수정 후: `url`·`story`·`size` 답변이 모두 재생되고 "이어서 진행합니다" → "이제부터는
이름·연락처·주소를 여쭤봅니다. 접수 확인을 위해 Google 로그인이 필요합니다." 메시지와
Google 로그인 버튼이 정상적으로 떴다(실제 로그인은 누르지 않음, 서버·Firebase 요청 없음).

두 시나리오 모두 콘솔 에러 없이 끝까지 재생됐다. `node --check app/app.js`로 문법도 확인했다.

## 잘 안 된 것, 아쉬운 것
- 이번 수정은 범위가 명확하고(선언 순서 이동뿐) 재현·검증도 Playwright로 수정 전/후 모두
  가능했어서 특별히 막힌 지점은 없었다. 다만 `ROADMAP.md`에 내가 만들지 않은 변경이 작업
  트리에 이미 올라와 있던 점은 조금 혼란스러웠다 — 이전 작업자가 다음 목표(#10)를 이미
  ROADMAP에 적어 뒀는데 아직 커밋되지 않은 상태였던 것으로 보인다. 내용 자체는 오늘 한 작업과
  일치해서 손대지 않고 그대로 두었다.
- `init()` 호출 위치를 옮기는 것만으로 충분한지 재차 의심했다 — `setupAuth()`,
  `renderStaticInfo()`, `bindDialogs()` 등 `init()` 안에서 호출하는 다른 함수들도 이 변경으로
  실행 순서가 영향받지 않는지 코드를 다시 읽어 확인했다. 전부 함수 선언(호이스팅)이거나
  `init()` 호출 이전에 이미 선언이 끝난 `const`들만 참조하고 있어 문제가 없었다.

## 의장에게 넘긴 것 (있으면 OPERATOR_TODO.md 에도 적었는지)
없음. 서버(Code.gs)를 건드리지 않았고, `config.js`의 requestEndpoint·firebase·payment.kakaopayLink·
contactUrl, `kakaopay-qr.svg`도 손대지 않았다. 서버 배포가 필요 없는 수정이라 LAB 반영만으로
바로 효과가 나므로 `OPERATOR_TODO.md`에 새로 추가한 요청은 없다.

## 다음에 이어서 할 것
- 10-22 work_summary에서 보류됐던 "`.order-edit`가 데스크톱 폭에서도 깨지지 않는지 추가 확인"은
  오늘도 범위 밖이라 그대로 다음으로 남긴다.
- LAB에 반영된 뒤, 가능하면 사람이 실제 휴대폰에서 "답변 중 탭을 닫았다가 같은 세션에서 다시
  열기"를 한 번 직접 눈으로 봐 주면 좋겠다(Playwright 재현은 모두 가짜 세션 데이터로만 했다).

## 팀원에게 한마디
10-22 윤 개발자(과거의 나)에게 — 어제 발견해 두고 고치는 방법까지 구체적으로 남겨준 덕분에
오늘 작업이 아주 빠르게 끝났다. 다음에 비슷하게 "이번 건 범위 밖이지만 발견했다"는 메모를
남길 때도 재현 경로와 후보 수정 방법을 같이 적어 두면 PM과 다음 날의 나에게 큰 도움이 된다는
걸 다시 확인했다.
