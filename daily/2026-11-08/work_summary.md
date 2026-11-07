# Day — developer

## 오늘 한 것
PM 목표대로, 2026-10-30 developer 가 설계만 남긴 `docs/funnel-drop-off-design.md` 4절("구현한다면 — 다음에 쓸 최소 설계 초안")을 그대로 코드화했다. 4절 문서는 "서버: `action: 'ping'` 하나, 받으면 `FUNNEL` 전용 시트에 `{date, step}` 두 칸, 개인정보 없이 로그인 전에도 호출 가능" / "클라이언트: 다섯 지점에서 응답을 기다리지 않는 1회성 `fetch(keepalive: true)`, 재시도 없음"을 그대로 지정해 뒤, 그 설계를 벗어나지 않았다.

- **서버(`backend/Code.gs`)**: `doPost` 에서 `body.action === 'ping'` 을 가장 먼저 분기해 `handlePing_` 으로 보낸다. 기존 접수 경로(`handleRequest_`)는 전혀 거치지 않으므로, ping 쪽에서 어떤 예외가 나도 접수 흐름에 영향이 없다(ping 쪽은 자체 try/catch 로 모든 오류를 흡수하고 항상 `{ ok: true }` 를 돌려준다). 새 함수: `handlePing_`(날짜·단계 형식 검사 → `FUNNEL` 시트에 한 줄), `getFunnelSheet_`(없으면 만듦), `cleanFunnelDate_`(`yyyy-MM-dd` 만), `cleanFunnelStep_`(미리 정한 5개 단계 이름만, 자유 입력 거절). 새 상수: `FUNNEL_SHEET_NAME`, `FUNNEL_HEADERS`(날짜/단계 두 칸), `FUNNEL_STEPS`(`begin`/`login`/`name`/`confirm`/`order`). `idToken`·이름·전화번호·이메일·uid 는 받지도 저장하지도 않는다.
- **클라이언트(`app/app.js`)**: 공통 헬퍼 `pingFunnel(step)` 을 추가하고 다섯 지점에 호출을 걸었다 — `beginOrder()` 시작, `askLogin()` 시작(로그인 안내 도달), `askStep()` 안에서 `step === 'name'` 일 때(이름 단계 진입=로그인 완료, 로그인을 거쳐 왔든 이미 로그인된 상태로 바로 왔든 한 지점에서 잡힘), `showConfirm()` 시작, `placeOrder()` 시작. 날짜는 서버(`TIMEZONE = 'Asia/Seoul'`)와 기준을 맞추기 위해 `Intl.DateTimeFormat` 으로 한국 시간 `yyyy-MM-dd` 를 뽑는 `todayKST()` 를 따로 만들어 썼다(단순 `toISOString()` 은 UTC라 자정 근처에 날짜가 하루 어긋날 수 있어서). 응답은 `.catch(() => {})` 로 버리고, `CFG.requestEndpoint` 가 없거나 fetch 자체가 예외를 던져도 try/catch 로 흡수해 주문 흐름에 어떤 영향도 주지 않는다.
- **확인**: `node backend/test/code-gs.test.js` 기존 191개 테스트 전부 통과(회귀 없음). 별도 테스트 파일은 만들지 않고, `mock-apps-script.js` 를 그대로 가져와 ping 시나리오(정상 저장, 잘못된 step/date 무시, idToken 등 개인정보 필드를 같이 보내도 저장 안 됨, 저장소를 열 수 없을 때도 `{ok:true}` 로 조용히 끝남, REQUESTS 시트와 섞이지 않음, 기존 접수가 그대로 동작함)를 bash 에서 직접 돌려 확인했다(일회성 확인용 스크립트라 저장소에 파일로 남기지 않았다). `node --check app/app.js` 통과, `python3 -m http.server` 로 `app/` 정적 파일이 그대로 열리는 것도 확인.
- `backend/API.md` 에 8절("이탈 집계 핑")을 추가해 요청/응답/저장 형식을 문서화. `config.js`·`kakaopay-qr.svg` 는 손대지 않았다.

## 바뀐 파일
- `backend/Code.gs` — `doPost` 에 ping 분기 추가, 새 함수 4개(`handlePing_`, `getFunnelSheet_`, `cleanFunnelDate_`, `cleanFunnelStep_`), 새 상수 3개(`FUNNEL_SHEET_NAME`, `FUNNEL_HEADERS`, `FUNNEL_STEPS`). 기존 함수·로직은 건드리지 않음(접수 경로는 `body = body || {}` 로 처리 위치만 한 줄 옮겼고 동작은 그대로).
- `app/app.js` — 새 함수 `pingFunnel(step)`, `todayKST()`. 다섯 지점(`beginOrder`, `askLogin`, `askStep`, `showConfirm`, `placeOrder`)에 호출 한 줄씩 추가.
- `backend/API.md` — 8절 "이탈 집계 핑" 추가, 7절 한계 목록에서 "이탈 기록은 아직 없다" 문구 제거.
- `OPERATOR_TODO.md` — LAB·LIVE Code.gs 반영 요청 추가.
- `CHANGELOG.md` — 맨 위에 `[정기] v0.14` 한 줄 추가.
- `daily/2026-11-08/work_summary.md` — 이 파일.

## 잘 안 된 것, 아쉬운 것
- 설계 문서가 이미 "다섯 지점"을 구체적으로 지정해 둔 덕분에 코드화 자체는 막힘 없이 끝났다. 다만 실제 Google 로그인·실제 Apps Script 서버 없이는 ping 이 "정말로 네트워크를 타고 서버까지 가서 시트에 한 줄이 생긴다"는 것을 끝까지 확인할 방법이 없다 — 모의 환경(mock-apps-script.js)으로 Code.gs 로직은 확인했고, app.js 쪽은 fetch 호출이 걸리는 코드 경로와 문법만 확인했다. LAB 반영 뒤 실제로 FUNNEL 시트에 줄이 쌓이는지는 사람이 한 번 봐야 안심된다.
- "`name` 단계 진입" 핑을 `askStep()` 안에 `step === 'name'` 조건으로 넣었다. 설계 문서는 "name 단계 진입(=로그인 완료)"이라고 적었는데, 실제로는 `resume()`(새로고침 뒤 이어하기)에서도 같은 조건으로 핑이 찍힌다 — 이건 "로그인 완료"가 아니라 "이어하기로 다시 name 질문에 도달"인 경우도 포함한다. 설계가 요구한 지점(로그인 뒤 처음 name 에 도달하는 순간)보다 넓게 잡힌 셈인데, 통계용이라 완벽한 세션 추적이 아니라는 전제(설계 문서 4절 "한계를 미리 인정")에 비추면 큰 문제는 아니라고 판단해 그대로 두었다. 더 정밀하게 하려면 "로그인 바로 뒤에만" 찍는 조건을 따로 둬야 하는데, 그건 설계가 요구한 범위를 넘는 추가 판단이라 오늘은 손대지 않았다.
- `FUNNEL_STEPS` 화이트리스트(5개 고정값)를 서버에 둔 건 설계 문서에 직접 적힌 내용은 아니고 내가 추가한 안전장치다(자유 입력이 시트에 쌓이는 걸 막기 위해). 나중에 다른 지점에 핑을 더 추가하고 싶으면 이 목록도 같이 늘려야 한다는 걸 다음 사람이 놓치지 않게 주석으로 남겨뒀다.

## 의장에게 넘긴 것 (있으면 OPERATOR_TODO.md 에도 적었는지)
서버(`backend/Code.gs`)가 바뀌었으므로 LAB·LIVE 양쪽 Apps Script 재배포가 필요하다. `OPERATOR_TODO.md` 에 2026-11-08 항목으로 "무엇을·왜·바뀐 함수·반영 절차"를 적었다. **배포 전까지는 화면이 ping 을 보내도 서버가 `action: 'ping'` 을 모르는 상태라 거절되고(화면은 응답을 기다리지 않으므로 사용자 경험에는 아무 영향 없음), 통계가 쌓이지 않는다.** 로그인·접수(REQUEST) 흐름은 배포 여부와 무관하게 지금과 완전히 같다.

## 다음에 이어서 할 것
- LAB 반영 뒤, 실제로 `FUNNEL` 시트에 줄이 쌓이는지 한 번 사람이 확인해 주면 안심된다(의장이 LAB 사이트를 한 번 눌러보는 정도로 충분, 개인정보는 전혀 없는 시트라 아무나 봐도 된다).
- 설계 문서 4절이 이미 "한계"로 인정한 대로, 이 방법은 세션 단위 추적이 아니라 "그 날의 대략적인 깔때기 모양"만 보여준다. 나중에 실제로 며칠 치 FUNNEL 데이터가 쌓이면, 그 숫자를 보고 "다음 날 역할"이 어디를 더 파야 할지(예: 로그인 단계 이탈이 유독 크다면 인앱 브라우저 안내를 더 손볼지) 판단할 수 있을 것 같다.
- `resume()` 경로에서 `name` 핑이 중복 찍히는 문제(위 "잘 안 된 것" 참고)를 더 정밀하게 다듬고 싶다면, "로그인 완료 직후"에만 찍도록 `showLoginChoice` 의 `onDone` 콜백 쪽에 핑을 옮기는 방법도 있다. 오늘은 설계 문서가 지정한 지점(name 단계 진입)을 그대로 따르는 쪽을 택했다.

## 팀원에게 한마디
10-30 developer 에게 — 설계 문서(`docs/funnel-drop-off-design.md`)를 정말 꼼꼼하게 써 놓아서 오늘 코드화가 수월했습니다. 특히 4절에 "다섯 지점"과 "받을 항목(date, step)"까지 구체적으로 적어둔 덕분에 판단할 게 거의 없었어요. 다음 사람(브랜더나 디자이너가 될 수도 있겠죠)에게 — FUNNEL 시트가 실제로 쌓이기 시작하면, 그 숫자를 가장 먼저 볼 수 있는 사람이 "어느 단계에서 가장 많이 빠지는지"를 다음 회의 안건으로 올려주면 좋겠습니다.
