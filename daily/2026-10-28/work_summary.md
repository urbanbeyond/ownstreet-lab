# Day — developer

## 오늘 한 것
`CLAUDE.md`, `daily/2026-10-28/pm_decision.md`, `daily/2026-10-25/work_summary.md`,
`daily/2026-10-27/work_summary.md`를 먼저 읽고 맥락을 확인했다. 오늘 목표는 "LIVE 전체 품질
재점검 ②" — `app/app.js` 전체에서 `chat.active` 류 상태 플래그가 모든 진입 경로에서 실제로
설정되는지 전수 조사하는 것.

1. **코드 추적(전수조사)**: `app/app.js`(1309줄) 전체를 읽고 `grep`으로 `chat.active`를
   설정하는 모든 지점(`beginOrder` 355, `resume` 367, `answer` 410, `editStep` 556,
   `placeOrder` 567, `resetChat` 928)과, `chat.active`를 참조해서 동작이 갈리는 모든 지점
   (`keepInView` 961, `focusComposer` 1058, `botSay` 953)을 찾았다. 그 다음 `askStep()`,
   `showConfirm()`, `showComplete()`, `showLoginChoice()`, `askLogin()` 등 메시지를 추가하는
   모든 함수의 **모든 호출 지점**을 역추적해서, 각 호출이 항상 이미 `chat.active=true`가 설정된
   체인(`beginOrder`/`resume`/`answer`/`editStep`/`placeOrder`) 안에서만 일어나는지 확인했다.
   - PM이 지목한 `editStep()`(556)·`recheckPending()`(596)·`settleOldPending()`(602)은 10-25와
     같은 결론(안전)을 코드 추적으로도 재확인.
   - 추가로 `placeOrder()`의 재로그인 분기(572-576)와 `handleResult()`의 `AUTH_INVALID`/
     `TOKEN_ERROR` 재로그인 분기(801-805)도 확인 — 둘 다 `showLoginChoice()`를 부르지만
     `submitOrder()` 체인(이미 `placeOrder()`가 chat.active=true 설정) 안에서만 도달 가능.
   - `onAuthStateChanged` 콜백(105-114)은 `renderUser()`만 호출하고 `appendMsg`를 거치지
     않아 `chat.active`와 무관함을 확인.
   - `resetChat(autoStart)`는 실제 호출부 2곳(72, 910) 모두 `true`로만 호출되어
     `autoStart=false` 경로(928-929의 else)는 현재 도달 불가능한 코드임을 확인(버그 아님,
     안전망으로 남겨둔 것으로 보임).
2. **Playwright 인위적 재현(10-27 designer 제안 방식 그대로 적용)**: 코드 추적만으로 끝내지
   않고, Playwright(1.64.1, `/tmp/pw`에 새로 설치, 저장소에 흔적 없음)로 실제 화면을 모바일
   (375×812)에서 띄워 상태 전환을 인위적으로 만들었다. `vendor/firebase-12.19.0.js`를 테스트
   전용 가짜 모듈로(`page.route`), 접수 서버 응답도 전부 `page.route`로 모의(실제 서버·계정과
   통신 없음, 입력값은 전부 가짜 — 홍길동/010-1234-5678/서울시 강남구 테스트로 등). 7개 시나리오:
   - `editStep()`: 확인 카드에서 "배송 주소 수정" → 값 변경 → 확인 카드 재생성
   - `runSubmit()` 자동 재확인: 1차 NETWORK 실패 → `isNoAnswer()` 경로로 자동 재확인 → 성공
   - `recheckPending()`: NETWORK 계속 실패 → "다시 확인" 버튼
   - `settleOldPending()`: 서버가 `NOT_SAVED_CODES`에 없는 코드로 응답 → "내용 수정" →
     확인 카드 재생성 → 값 바꿔 재주문 → 이전 요청 확인(old-check) → 완료 화면
   - `handleResult()` AUTH_INVALID 재로그인: 서버가 두 번 다 `AUTH_INVALID` → "다시
     로그인해주세요" → 로그인 버튼 재클릭
   - 로그인 실패(팝업 닫힘) 후 재시도
   - `resume()`: 로그인~이름까지 입력 후 페이지 새로고침(sessionStorage draft로 재진입)
   - 매 단계마다 `boundingBox()`로 마지막 메시지와 sticky 입력창의 좌표를 재서 겹침 여부를
     수치로 판정. **7개 시나리오 모두 겹침 없음(overlap: false)**.
3. **과정에서 겪은 함정과 교정**: 첫 실행에서 시나리오 2~5가 전부 타임아웃으로 실패했다 —
   원인은 테스트 스크립트가 "개인정보 수집 동의" 체크박스를 누락해서 `주문하기` 버튼이
   조용히 막혀 있었던 것(앱 버그 아님, 내 테스트 스크립트 버그). `#consent` 체크 추가로 해결.
   또 한 번은 `scrollProbe`의 500ms 대기가 smooth scroll 애니메이션이 끝나기엔 부족해서
   `overlap: true`가 한 번 찍혔는데, 디버그 스크립트로 800ms 뒤 상태를 다시 확인하니 정상
   (겹침 없음)이었다 — **10-25 developer가 남긴 "애니메이션 도중 캡처는 속을 수 있다"는
   교훈을 오늘도 그대로 재확인**했다. 대기시간을 1.2초로 늘려 안정화했다.
4. **`keepInView()`에 임시 probe 삽입(저장소에는 반영하지 않음, `/tmp/pw/app-instrumented/`
   로컬 복사본에서만)**: `chat.active`가 false라서 스크롤이 스킵되는 순간을 전부 콘솔 로그로
   남기도록 패치한 뒤 7개 시나리오를 다시 돌렸다. 총 297회의 `keepInView()` 호출 중
   "스킵"은 각 시나리오의 **페이지 최초 로드 시점(주문 시작 버튼이 보이기 전, 혹은 새로고침
   직후 찰나)에서만** 발생했고, 한 번 `chat.active=true`가 된 뒤로는 끝까지 단 한 번도 다시
   `false`로 스킵되지 않았다(스크립트로 "한 번 active=true가 된 이후 다시 SKIPPED가 나오는
   경우"를 자동 검사했고, 0건). `resume()` 시나리오에서만 새로고침으로 전역 상태가 리셋되며
   1회 스킵이 잡혔는데, 이는 `resume()`이 즉시 `chat.active=true`를 재설정하는 정상 경로이고
   실제 화면 겹침도 없음을 3번에서 이미 수치로 확인했다.
5. **여유 작업 — `.done-card` 시각 위계 교차 확인**: git log로 `app/styles.css`를 확인한 결과
   10-27 designer의 변경은 확인 카드 라벨(`QUESTIONS.name.label`)과 모달 "닫기" 버튼 폰트였고
   `.done-card` 자체는 건드리지 않았다 — 교차 확인할 회귀 대상이 없음을 먼저 확인했다. 그래도
   현재 `.done-card`의 실제 모습을 Playwright로 캡처(모바일 fullPage)해 점검: REQUEST COMPLETE
   키커 + 오렌지 포인트, 접수번호(Anton, 큰 글씨)가 뒤따르는 목업 카드·결제 카드와 뚜렷이
   구분되어 보였다. 문제 발견 없음.

## 바뀐 파일
- **`app/app.js` — 변경 없음.** 전수조사·Playwright 재현 모두 통과해 고칠 버그를 찾지 못했다
  (`node --check app/app.js` 로 구문 확인은 했으나 애초에 수정하지 않았음).
- `CHANGELOG.md` — 오늘 점검 결과(v0.11, `[정기]`) 한 줄 추가.
- `daily/2026-10-28/work_summary.md` — 이 파일.

## 검증에 쓴 방법 (서버·실제 계정 접근 없음)
- `app/`을 `python3 -m http.server`로 로컬에 띄우고 Playwright(chromium, `/tmp/pw`에 임시 설치,
  저장소에 흔적 없음)로 접속.
- Firebase 로그인은 `page.route`로 `vendor/firebase-12.19.0.js`를 테스트 전용 가짜 모듈로
  바꿔치기(실제 Google 계정과 통신 없음).
- 접수 서버(`requestEndpoint`)로 가는 실제 네트워크 요청은 전부 `page.route`로 가로채 모의
  응답(지연 성공/NETWORK 중단/AUTH_INVALID/알 수 없는 코드/중복 접수)만 돌려줬다. 실제
  Apps Script 서버에는 어떤 요청도 가지 않았다. 입력한 이름/전화번호/주소는 전부 가짜 값.
- `config.js`의 `requestEndpoint`·`firebase`·`payment.kakaopayLink`·`contactUrl`,
  `kakaopay-qr.svg`는 전혀 건드리지 않았다.
- `keepInView()` probe 삽입은 `/tmp/pw/app-instrumented/`의 **로컬 복사본에만** 적용했고,
  저장소의 `app/app.js`는 원본 그대로다.

## 잘 안 된 것, 아쉬운 것
- 새로운 버그는 찾지 못했다. "빠진 곳이 있으면 최소 수정"이라는 목표였지만, 코드 추적과
  Playwright 실측(297회 `keepInView()` 호출 전수 로깅 포함) 양쪽 모두 문제를 재현하지
  못해서 수정할 거리가 없었다 — 10-25 developer의 결론이 오늘도 그대로 재확인된 셈이다.
  10-25/10-27에서 이미 꼼꼼히 점검한 뒤라, 오늘은 "같은 결론에 더 두꺼운 증거를 쌓은 날"에
  가깝다.
- 테스트 스크립트 자체의 버그(동의 체크박스 누락, 스크롤 대기시간 부족)로 두 번 헛짚을 뻔
  했다 — 진짜 앱 버그와 테스트 스크립트 버그를 구분하는 데 시간을 썼다. 다음에 비슷한 점검을
  할 때는 "주문하기" 버튼을 누르기 전 체크리스트(동의 체크박스 포함)를 먼저 정리해두면 더
  빠를 것 같다.
- `settleOldPending()`에 실제로 도달하는 서버 응답 조건(NOT_SAVED_CODES에 없는 코드)이
  운영에서 얼마나 자주 발생하는지는 이번에도 확인 범위 밖이다(10-25가 남긴 메모와 동일).

## 의장에게 넘긴 것 (있으면 OPERATOR_TODO.md 에도 적었는지)
없음. 코드(`app/app.js`, `backend/Code.gs`) 변경이 전혀 없어서 배포 요청도 없다.
`OPERATOR_TODO.md`에 새로 추가한 항목 없음.

## 다음에 이어서 할 것
- `chat.active` 전수조사는 10-25·오늘 두 차례에 걸쳐 코드 추적 + Playwright 실측(상태 전환
  인위적 재현 포함) 양쪽으로 검증이 끝났다고 봐도 될 것 같다. 다음에 이 패턴을 다시 점검할
  일이 생긴다면, 새 진입점(새로운 "대화를 다시 시작/재개하는" 함수)이 추가될 때만 체크하면
  충분하다.
- 오늘 쓴 `keepInView()` probe 방식(콘솔 로그로 스킵 시점 전수 추적 + 스크립트로 "활성화 이후
  재스킵" 자동 검사)은 다음에 비슷한 "상태 플래그가 조용히 빠지는" 버그를 찾을 때 재사용하기
  좋은 방법이다. 팀 공용 스크립트로 정리해둘지는 "새 기능을 만들지 않는다"는 제약 때문에
  오늘은 보류했다(10-27 designer가 남긴 것과 같은 고민).

## 팀원에게 한마디
진 디자이너에게 — 10-27에 제안해주신 Playwright route mocking 방식, 오늘 느린 네트워크·중복
접수·재로그인 같은 상태 전환까지 인위적으로 만드는 데 그대로 잘 썼습니다. 특히 NETWORK 실패를
`route.abort('failed')`로, AUTH_INVALID 두 번 연속 응답으로 재로그인 분기까지 전부 재현할 수
있었던 건 디자이너님이 먼저 길을 깔아주신 덕분입니다. 그리고 오늘도 "애니메이션 도중 캡처는
속을 수 있다"는 10-25의 교훈을 제가 또 한 번 몸으로 확인했습니다(500ms 대기로 겹침처럼 보였던
게 800ms 뒤엔 정상이었어요) — 이 두 가지가 이제 우리 팀 QA의 기본기가 된 것 같습니다.
