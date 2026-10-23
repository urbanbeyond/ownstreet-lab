# Day 16 — designer

## 오늘 한 것
1. `CLAUDE.md`, `daily/2026-10-24/pm_decision.md`, `daily/2026-10-22`·`2026-10-23`의 work_summary.md,
   `app/COMPONENTS.md`를 먼저 읽고 맥락을 확인했다. 10-22 developer가 "이어하기"가 TDZ 버그로
   전혀 동작하지 않는 걸 발견했고, 10-23 developer가 그 버그(`init()` 호출 순서)를 고쳤으며,
   "탭을 닫았다 다시 열기 케이스를 눈으로 봐달라"는 요청이 오늘로 넘어온 상태였다.
2. `/tmp/pw`에 Playwright(chromium) + 브라우저 바이너리를 새로 설치하고(저장소에는 흔적 남기지
   않음), `app/`을 `python3 -m http.server 8765`로 로컬에 띄운 뒤 실제 화면을 떠서 확인했다.
   - **시나리오 1**: `url`만 작성된 draft를 sessionStorage에 넣고 새로고침(로그인 불필요 지점 복원).
   - **시나리오 2**: `url`·`story`·`size`까지 작성된 draft(로그인 바로 앞)로 새로고침.
   - 둘 다 모바일 375px·데스크톱 1280px에서 콘솔 에러 없이 끝까지 재생되는 것을 1차로 확인했다
     (10-23 developer의 TDZ 수정이 제대로 LAB에 반영될 조건에서 잘 동작하는지 재확인한 셈).
3. **`fullPage` 스크린샷만으로는 안 보이는 문제가 있어서, 실제 사용자가 보는 뷰포트(스크롤 안 한
   화면) 캡처로 다시 확인했다.** 그 결과 모바일 375px에서 시나리오 2(로그인 직전 복원)의 경우
   "이어서 진행합니다"와 "접수 확인을 위해 Google 로그인이 필요합니다" 안내 문구가 화면 아래
   sticky 입력창(로그인 버튼이 들어있는 영역, `#chatInput`)에 완전히 가려져 전혀 안 보이는 것을
   발견했다. 데스크톱 1280px(뷰포트가 더 높아서)에서는 우연히 안 가려져 증상이 없었다.
4. **같은 지점을 "평소 채팅 흐름"(버튼 클릭·텍스트 입력으로 끝까지 직접 진행, resume 아님)으로
   밟아 비교했더니 겹침이 없었다** — 즉 resume 경로에서만 생기는 문제였다. 원인을 추적해
   `resume()` 함수가 `beginOrder()`/`answer()`와 달리 `chat.active = true`를 설정하지 않는다는
   것을 찾았다. `chat.active`가 꺼져 있으면 `keepInView()`(새 메시지가 추가될 때 자동으로
   스크롤해 입력창과 안 겹치게 하는 함수)가 매번 조용히 아무 일도 하지 않고 끝나버린다
   (`keepInView()` 맨 앞의 `if (!chat.active) return;`).
5. `resume()` 안에 `chat.active = true;` 한 줄을 추가해 고쳤다(최소 수정, 로직·문구 변경 없음).
   `node --check app/app.js`로 문법 확인. 수정 전/후 모바일·데스크톱 스크린샷으로 비교해 겹침이
   사라지고 평소 흐름과 동일한 간격(약 16px)으로 보이는 것을 확인했다. 콘솔 에러도 수정 전후 모두
   없었다(이 버그는 에러를 던지지 않고 조용히 스크롤만 생략하는 종류라 콘솔만으로는 못 잡는다).
6. "이어서 진행합니다" 메시지가 `COMPONENTS.md`의 `.msg.status`(상태 안내) 규칙과 맞는 스타일인지
   확인했다. 결론: **지금 스타일(일반 bot 발화, 박스 없는 텍스트)이 맞다.** `.msg.status`는 모두
   "서버와 통신 중이라 잠시 기다려야 함"을 알리는 일시적 로딩 안내(`접수 중입니다…`, `접수 상태를
   확인하고 있어요` 등, 끝나면 `.remove()`됨)인 반면 "이어서 진행합니다"는 그런 성격이 아니라
   맥락 전환을 알리는 봇의 평범한 발화라서, `status` 스타일(muted 회색)을 억지로 입히면 오히려
   "로딩 중"으로 오해를 줄 수 있다고 판단해 코드를 바꾸지 않았다. 참고로 `COMPONENTS.md`의
   "상태 안내는 `--muted-foreground` + 점선 테두리" 설명은 10-23 의장 요청(봇 말풍선 박스 제거)
   이후 실제 CSS(`.msg.bot.status .bubble { color: var(--muted-foreground); }`, 점선 테두리 없음)
   와 어긋난 구식 문구로 보인다 — 오늘 범위 밖이라 고치지 않고 다음으로 남긴다.
7. 여유가 있어 10-22 developer가 보류해 둔 "`.order-edit`가 데스크톱 폭에서도 깨지지 않는지"를
   확인했다. Firebase 로그인 단계를 테스트 전용 스텁(`/tmp` 안의 가짜 모듈, 실제 서버·계정과
   통신하지 않음, 10-22 developer가 쓴 방법을 참고해 다시 만듦)으로 통과시켜 데스크톱 1280px에서
   실제 채팅 흐름을 끝까지 밟아 주문 확인 카드에 도달시켰다. `.chat { max-width: 560px }`로 채팅
   영역 자체가 제한돼 있어 `.order-card` 폭은 데스크톱에서도 560px, `.order-edit` 크기는 28×48px로
   모바일과 완전히 동일했고 레이아웃 깨짐이 없었다(스크린샷·실측 모두 확인).
8. `CHANGELOG.md`에 v0.9.2 한 줄 추가.

## 바뀐 파일
- `app/app.js` — `resume()` 함수 맨 앞에 `chat.active = true;` 한 줄과 설명 주석 추가. 그 외 변경 없음
  (`git diff` 로 확인: 추가 4줄뿐).
- `CHANGELOG.md` — v0.9.2 한 줄 추가.

## 검증에 쓴 방법 (서버·실제 계정 접근 없음)
- `app/`을 `python3 -m http.server`로 로컬에 띄우고 Playwright(chromium, `/tmp`에 임시 설치,
  저장소에 흔적 없음)로 접속.
- "이어하기" 확인은 `sessionStorage.setItem('ownstreet.order.v1', ...)`로 draft를 직접 넣고
  새로고침하는 방식(실제 로그인·서버 요청 없음).
- "`.order-edit` 데스크톱" 확인에서만 `page.route`로 `vendor/firebase-*.js` 요청을 테스트 전용
  가짜 모듈로 바꿔 로그인 버튼 흐름만 통과시켰다(실제 Google 계정·Apps Script 서버와 어떤 통신도
  하지 않음, 입력한 이름/연락처/주소는 전부 가짜 값).
- `config.js`의 `requestEndpoint`·`firebase`·`payment.kakaopayLink`·`contactUrl`, `kakaopay-qr.svg`는
  전혀 건드리지 않았다.

## 스크린샷 (daily/2026-10-24/)
- `mobile_resume_early.png` / `desktop_resume_early.png` — 시나리오 1(로그인 불필요 지점 복원),
  모바일 375px·데스크톱 1280px. 다음 질문(이야기) 입력창까지 자연스럽게 이어짐.
- `mobile_resume.png` / `desktop_resume.png` — 시나리오 2(로그인 직전 복원), 수정 후. "이어서
  진행합니다"·로그인 안내 문구·Google 로그인 버튼이 모두 겹침 없이 보임.
- `desktop_order_edit.png` — `.order-edit` 데스크톱 1280px 확인, 주문 확인 카드까지 도달한 전체
  페이지 캡처. 카드 폭 560px, 행 레이아웃·48px 탭 영역 모바일과 동일.

## 잘 안 된 것, 아쉬운 것
- `fullPage` 스크린샷만 먼저 찍고 "콘솔 에러 없음 + 메시지 다 뜸"으로 넘어갔으면 이 겹침 버그를
  놓칠 뻔했다. `fullPage` 캡처에서는 sticky 요소가 자기 실제 문서 위치에 그려져서 "바로 아래
  내용과 겹친다"는 사실 자체가 시각적으로 드러나지 않는다(겹치는 순서가 fullPage 렌더링에서는
  '쌓이지' 않고 각자 제자리에 그려짐). 실제 사용자가 보는 뷰포트 캡처로 다시 비교하고 나서야
  문제가 보였다 — PM 결정문이 "실제 화면에서 자연스럽게 보이는지 직접 눈으로"라고 구체적으로
  요청한 이유를 작업하면서 체감했다.
- Firebase 스텁을 처음 만들 때 `GoogleAuthProvider`에 `setCustomParameters` 메서드를 빠뜨려서
  로그인 클릭이 조용히 멈추는 바람에 디버깅에 시간이 좀 들었다. `app/app.js`의 `login()`이
  `provider.setCustomParameters({ prompt: 'select_account' })`를 호출하는 걸 확인하고 고쳤다.
  다음에 비슷한 스텁을 쓸 팀원을 위해 남겨둔다 — 실제 Firebase Auth API 표면을 다 흉내내야
  로그인 흐름 테스트가 끝까지 진행된다.
- `COMPONENTS.md`의 "상태 안내는 muted-foreground + 점선 테두리" 설명이 10-23 봇 말풍선 박스
  제거 이후 실제 CSS와 어긋나 있는 걸 발견했지만, 오늘 범위(화면 확인)를 벗어나는 문서 정리라
  고치지 않고 아래 "다음에 이어서 할 것"에 남긴다.

## 의장에게 넘긴 것 (있으면 OPERATOR_TODO.md 에도 적었는지)
없음. `app/app.js` 한 줄만 고쳤고 서버(Code.gs)·config.js·kakaopay-qr.svg는 건드리지 않았다.
서버 배포가 필요 없는 수정이라 LAB 반영만으로 바로 효과가 난다. `OPERATOR_TODO.md`에 새로
추가한 항목 없음.

## 다음에 이어서 할 것
- `COMPONENTS.md`의 "상태 안내(`.msg.status`)는 muted-foreground + 점선 테두리" 설명을, 10-23
  이후 실제 CSS(점선 테두리 없음, 색만 muted)에 맞게 다음 디자이너 작업 때 정리하면 좋겠다.
- 오늘 발견한 "`chat.active`를 빼먹으면 `keepInView()`가 조용히 멈춘다"는 패턴이 다른 함수에도
  숨어 있을 수 있는지(예: 되돌아가기/수정 흐름 `editStep()` 등) 한 번 더 점검해보면 좋겠다 —
  오늘은 PM이 지정한 resume 경로만 확인했다.

## 팀원에게 한마디
윤 개발자에게 — 10-22·10-23에 "탭을 닫았다 다시 열기 케이스를 눈으로 봐 달라"고 남겨주신 요청,
오늘 직접 보니 TDZ 버그를 고친 뒤에도 남아 있던 또 다른 문제(스크롤이 안 돼서 로그인 버튼이
안내 문구를 가리는 것)를 하나 더 찾을 수 있었습니다. `chat.active` 같은 내부 플래그가 여러
진입점(`beginOrder`, `answer`, `resume`)에 흩어져 있어서 하나만 빠뜨려도 조용히 깨지는 구조인
것 같은데, 다음에 새 진입점을 추가할 때 이 플래그들을 한 곳에 모으거나 체크리스트로 남겨두면
저 같은 역할이 눈으로 확인할 때도 더 빨리 의심 지점을 좁힐 수 있을 것 같습니다.
