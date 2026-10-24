# Day 17 — developer

## 오늘 한 것
1. `CLAUDE.md`, `daily/2026-10-25/pm_decision.md`, `daily/2026-10-24/work_summary.md`를 먼저 읽고
   맥락을 확인했다. 10-24 designer가 발견·수정한 패턴을 정확히 확인: `resume()`이 `beginOrder()`/
   `answer()`/`editStep()`/`placeOrder()`와 달리 `chat.active = true`를 설정하지 않아서,
   `keepInView()`(새 메시지 추가 시 자동 스크롤하는 함수) 맨 앞의 `if (!chat.active) return;`에
   걸려 콘솔 에러 없이 조용히 스크롤이 생략되고, sticky 입력창이 메시지를 가리는 버그였다.
2. `app/app.js` 전체에서 `chat.active`를 설정하는 지점과 `keepInView()`를 호출하는 지점(모든
   `appendMsg()` 경유)을 grep으로 먼저 정리했다. PM이 지정한 세 함수를 코드로 추적:
   - **`editStep()`**(549~556줄, 주문 확인 카드 "수정" 버튼): `chat.active = true;`가 맨 앞에
     있다. git log로 확인한 결과 이 함수가 처음 작성될 때부터 있던 줄이고, 10-24에 새로 추가된
     게 아니다(10-24는 `resume()`에만 빠뜨렸던 것). → 문제 없음.
   - **`recheckPending()`**(591~594줄)과 **`settleOldPending()`**(597~617줄): 둘 다 `chat.active`를
     직접 설정하지 않는다. 다만 코드를 끝까지 추적한 결과, 이 두 함수는 `submitOrder()` →
     `placeOrder()`(562줄에서 `chat.active = true` 설정) 이후에만 도달 가능한 구조다.
     `recheckPending()`은 "다시 확인" 버튼(`unknownChoices()`)에서만, `settleOldPending()`은
     `submitOrder()` 내부에서만 호출되는데 두 경로 모두 이미 한 번 "주문하기"를 눌러
     `chat.active`가 true인 상태에서만 진입 가능하다. `chat.active`는 초기값(false) 외에는
     코드 어디서도 다시 false로 되돌리지 않는다(grep으로 확인, `chat.active = false` 대입 없음).
     → 구조상 이 둘은 `resume()`과 같은 종류의 버그가 생길 수 없다고 판단했다.
3. 판단을 코드만으로 끝내지 않고 Playwright(chromium, `/tmp/pw`에 새로 설치, 저장소에 흔적 없음)로
   실제 화면에 떠서 세 경로를 모두 직접 밟아 확인했다(모바일 375px). `app/`을
   `python3 -m http.server 8765`로 로컬에 띄우고, Firebase 로그인은 10-24와 같은 방식의 가짜
   모듈로, 접수 서버 응답은 `page.route`로 모의(실제 서버·계정과 통신하지 않음, 입력값은 전부
   가짜):
   - `editStep()`: 주문 확인 카드에서 "배송 주소 수정" 클릭 → 입력창 재등장 → 값 재입력 →
     확인 카드 재생성까지, `boundingBox()`로 마지막 메시지와 입력창 좌표를 재서 겹침 여부를 수치로
     확인 → 겹침 없음.
   - `recheckPending()`: 접수 요청을 매번 네트워크 오류(NETWORK)로 응답하게 만들어 "확인할 수
     없습니다" 안내 + "다시 확인" 버튼까지 재현한 뒤, 버튼을 눌러 `recheckPending()`을 실행 →
     겹침 없음.
   - `settleOldPending()`: 1차 주문을 서버가 분명히 답했지만 알 수 없는 코드로 응답하게 해
     `unconfirmed` 상태를 만들고, "내용 수정"으로 확인 카드를 다시 띄운 뒤 주소를 바꿔 재주문 →
     `submitOrder()`가 `settleOldPending()`을 호출하는 경로를 실패 응답(여전히 unconfirmed로
     남는 경우)과 성공 응답(old-check에서 "이미 접수돼 있었음"으로 확인되어 접수 완료·결제 안내
     화면까지 가는 경우) 양쪽 모두 재현 → 두 경우 모두 겹침 없음.
   - 매 경로마다 `fullPage`뿐 아니라 실제 사용자가 보는 뷰포트(스크롤 안 한 화면) 캡처로도 다시
     확인했다 — 10-24 designer가 남긴 "`fullPage`만으로는 겹침이 안 보일 수 있다"는 교훈을 그대로
     따랐다.
   - 과정에서 "수정 후 재생성된 확인 카드"의 `fullPage` 스크린샷이 카드 중간까지만 스크롤된 것처럼
     보여 한 번 의심했으나, `waitForTimeout` 후 `boundingBox()`로 다시 재니 "주문하기" 버튼이
     입력창과 겹치지 않고 화면 안에 있었다(좌표로 수치 확인) — 스크린샷을 찍은 시점이 스크롤 애니메이션
     도중이었을 뿐, 최종 상태는 정상이었다. 평소 흐름(수정 없이 끝까지)과 좌표를 비교해도 동일한
     위치 범위였다.
   - 결론: **세 진입점 모두 겹침 버그가 재현되지 않았다. 코드 수정 없음.**
4. 여유 작업: `app/COMPONENTS.md`의 "상태 안내(`.msg.status`)는 `--muted-foreground` + 점선
   테두리" 설명을 `app/styles.css`와 대조했다. 실제 CSS는
   `.msg.bot.status .bubble { color: var(--muted-foreground); }`뿐이고 테두리 선언이 없다
   (10-23 의장 요청으로 봇 말풍선 박스를 없앤 흔적). 10-24 designer가 지적한 그대로 문서가
   구식이었음을 확인하고, `COMPONENTS.md` 해당 줄만 실제 CSS에 맞게 고쳤다(코드·동작 변경 없음).

## 바뀐 파일
- `app/COMPONENTS.md` — "상태 안내" 설명을 실제 CSS(`.msg.bot.status .bubble`의 글자색만,
  테두리 없음 / `.msg.bot.warn .bubble`의 왼쪽 4px 실선 테두리)에 맞게 수정. 1줄 교체.
- `app/app.js` — **변경 없음.** `editStep()`·`recheckPending()`·`settleOldPending()` 모두
  점검 결과 문제가 없어 코드를 고치지 않았다 (`node --check app/app.js` 통과, `git diff`로
  무변경 확인).
- `CHANGELOG.md` — 오늘 점검 결과(버전 변경 없음, `[정기]`) 한 줄 추가.

## 검증에 쓴 방법 (서버·실제 계정 접근 없음)
- `app/`을 `python3 -m http.server`로 로컬에 띄우고 Playwright(chromium, `/tmp/pw`에 임시 설치,
  저장소에 흔적 없음)로 접속.
- Firebase 로그인은 `page.route`로 `vendor/firebase-*.js`를 테스트 전용 가짜 모듈로 바꿔치기
  (실제 Google 계정과 통신 없음, `GoogleAuthProvider.setCustomParameters`까지 흉내냄 — 10-24
  designer가 남긴 주의사항 반영).
- 접수 서버(`requestEndpoint`)로 가는 실제 네트워크 요청은 전부 `page.route`로 가로채 모의
  응답(NETWORK 오류/알 수 없는 코드/지연 성공)만 돌려줬다. 실제 Apps Script 서버에는 어떤
  요청도 가지 않았다. 입력한 이름/전화번호/주소는 전부 가짜 값.
- `config.js`의 `requestEndpoint`·`firebase`·`payment.kakaopayLink`·`contactUrl`,
  `kakaopay-qr.svg`는 전혀 건드리지 않았다.

## 잘 안 된 것, 아쉬운 것
- `settleOldPending()` 재현 과정에서 UI만으로 이 함수에 도달하는 경로가 생각보다 좁다는 걸 알게
  됐다: 1차 접수 실패가 `isNoAnswer`(NETWORK/TIMEOUT 등)이면 "다시 확인"(`recheckPending()`)만
  뜨고 확인 카드로 못 돌아간다. "내용 수정"으로 확인 카드를 다시 띄우려면 서버가 `UNKNOWN` 같은
  분명하지만 목록에 없는 코드로 답한 경우여야 한다 — 실제 운영에서는 거의 Apps Script가 예상 못한
  예외를 던질 때나 생길 조합이라, 자주 지나가는 길은 아닌 것으로 보인다. 다만 코드상 방어
  로직으로는 타당해서 손대지 않았다.
- "확인 카드가 재생성된 직후" fullPage 스크린샷만 보고 잠깐 버그로 오인할 뻔했다 — 애니메이션
  도중 캡처와 최종 상태를 구분하지 않으면 잘못된 결론을 낼 수 있다는 걸 재확인했다. 다음에
  비슷한 점검을 할 때는 스크린샷 직전에 스크롤 완료를 기다리는 시간을 넉넉히 두거나,
  `boundingBox()` 수치로 먼저 판단하고 스크린샷은 보조로만 쓰는 순서가 더 안전할 것 같다.

## 의장에게 넘긴 것 (있으면 OPERATOR_TODO.md 에도 적었는지)
없음. 코드(`app/app.js`, `backend/Code.gs`) 변경이 전혀 없어서 배포 요청도 없다.
`OPERATOR_TODO.md`에 새로 추가한 항목 없음.

## 다음에 이어서 할 것
- `chat.active`가 코드 전체에 흩어져 있는 구조는 여전하다(진입점마다 수동으로 설정). 10-24
  designer가 남긴 제안처럼, 다음에 새 진입점(새로운 "대화를 다시 시작하는" 함수)을 추가할 때는
  `chat.active`를 빼먹지 않았는지 이 점검 결과(편지점·재확인·재시도 흐름은 모두 괜찮았다)를
  체크리스트로 참고하면 좋겠다.
- `settleOldPending()`에 도달하는 실제 조건(서버가 `NOT_SAVED_CODES`에 없는 코드로 응답)이
  정말 운영에서 일어나는지는 이번 점검 범위 밖이다. Apps Script 쪽에서 어떤 코드들을 실제로
  돌려주는지 `backend/Code.gs`와 맞춰 보면 이 분기의 실제 발생 빈도를 더 정확히 알 수 있을 것
  같다.

## 팀원에게 한마디
진 디자이너에게 — 10-24에 남겨주신 "다른 진입점에도 같은 패턴이 숨어 있을 수 있다"는 제안, 오늘
`editStep()`·`recheckPending()`·`settleOldPending()` 세 곳 모두 직접 밟아봤는데 다행히 깨끗했습니다.
`chat.active`를 한 번 true로 두면 그 뒤로는 절대 false로 안 돌아가게 짜여 있어서, "이미 시작된
흐름 안에서만 호출되는 함수"들은 구조적으로 안전하더군요. 덕분에 `resume()`처럼 "흐름을 처음
되살리는" 함수만 특히 조심하면 된다는 게 더 명확해졌습니다. `fullPage`만으로는 속을 수 있다는
말씀도 오늘 한 번 더 체감했습니다 — 감사합니다.
