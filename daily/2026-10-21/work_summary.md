# Day 13 — designer

## 오늘 한 것
10-20 developer가 고친 `keepInView()`/`.msg { scroll-margin-bottom: 140px }`가 로그인 이후 단계(이름→전화번호→주소→배송 요청→확인 카드)에서도 동일하게 작동하는지, 실제 화면을 끝까지 밟아 수치로 확인했다.

1. **코드 구조 파악**: `app/app.js`의 `STEPS`/`QUESTIONS`/`chat` 상태, `askStep`/`answer`/`showConfirm`/`editStep` 흐름, `app/index.html`의 `#chatLog`/`#chatInput` 구조, `app/styles.css`의 `.msg`/`.order-card`/`.chat-input` 스타일, `app/COMPONENTS.md` 규칙을 먼저 읽었다.
2. **Playwright 환경 구성**: `npx`/`npm install --no-save`로 playwright 1.64.1을 임시 설치(저장소에는 추가하지 않음), Chromium은 이미 캐시돼 있어 추가 다운로드 없이 사용. `python3 -m http.server`로 `app/`을 로컬 정적 서빙.
3. **가짜 로그인 스텁**: `./vendor/firebase-12.19.0.js` 요청을 Playwright `page.route`로 가로채, `initializeApp`/`getAuth`/`onAuthStateChanged`/`GoogleAuthProvider`/`signInWithPopup`/`signOut`만 흉내 내는 가짜 모듈로 교체했다. `signInWithPopup`은 실제 팝업·네트워크 없이 가짜 사용자(`fake-uid-0001`)로 즉시 로그인 처리된다. 로컬 서버(`http://localhost:8743`) 바깥으로 나가는 모든 요청(Apps Script, Google, 폰트 CDN 등)은 `route.abort()`로 전부 차단했다. 실제 네트워크 요청은 한 번도 나가지 않았다(차단된 요청은 폰트 CDN 2건뿐, "주문하기" 버튼은 클릭하지 않아 Apps Script 요청 자체가 발생하지 않음).
4. **UI 조작으로 실제 흐름 재현**: "주문 시작" → 이미지 링크 입력 → 한 줄 이야기 건너뛰기 → 사이즈 선택 → Google 로그인(가짜) → 이름 → 전화번호 → 주소 → 배송 요청 → 확인 카드까지, 모바일 375px·데스크톱 1280px 양쪽에서 실제 타이핑/클릭으로 끝까지 밟았다. 확인 카드에서 "수정" 버튼으로 되돌아가는 흐름(`editStep`)도 확인했다.
5. **bounding box 좌표 확인** (윤 개발자가 10-20 제안한 방법): 각 질문 단계에서 `page.locator().boundingBox()`로 마지막 말풍선과 `#chatInput`의 좌표를 비교해 겹침 여부를 수치로 판정했다. 확인 카드에서는 "주문하기" 버튼(`#orderBtn`), 동의 체크박스(`label.check`)가 sticky 입력창(`#chatInput`)과 실제로 겹치는지 별도로 쟀다.
6. **COMPONENTS.md 규칙 대조**: `.order-card` 안의 오렌지(`--accent`) 사용 개수, 버튼 높이(`.send`/`.own-input`/`.choice`), 한글 라벨의 폰트(`fontFamily`)를 `getComputedStyle`로 직접 측정했다.

## 확인 결과
- **단계별 겹침 (url/story/size/login/name/phone/address/memo)**: 모바일·데스크톱 양쪽 모두 `overlap: false`. 말풍선 bottom이 `#chatInput` top보다 항상 위에 있었다. `scroll-margin-bottom: 140px` 수정이 로그인 이후 단계에서도 동일하게 적용된다.
- **확인 카드 (`.order-card`) — "주문하기" 버튼·동의 체크박스**: 스크롤 애니메이션이 끝난 뒤(약 300~400ms) 기준으로, 모바일에서 `#orderBtn` bottom(653.8)이 `#chatInput` top(687.8)보다 위에 있어 겹치지 않았고(`orderBtnOverlapsInput: false`), 버튼이 뷰포트 안에 완전히 들어왔다(`orderBtnFullyVisible: true`). 데스크톱도 동일하게 `false`/`true`.
  - 단, 처음 테스트(대기 150~200ms)에서는 `orderBtnHidden: true`로 측정됐는데, 이는 실제 버그가 아니라 스크롤 애니메이션이 끝나기 전에 좌표를 쟀기 때문이었다. 대기 시간을 늘려 재측정하자 겹침이 사라졌다 — "자동 스크롤이 끝나기 전에는 일시적으로 버튼이 안 보일 수 있다"는 점은 기록해 둔다(애니메이션 중 과도기 상태이지 고정된 버그는 아님).
  - `.order-card`라는 `<li class="msg wide">` 자체의 bounding box(전체 782px/637px 높이)는 당연히 `#chatInput`과 y좌표가 겹치는데, 이는 "긴 카드의 보이지 않는 윗부분"과 "화면 하단 sticky 바"가 겹치는 것뿐이지 실제 사용자가 보는 화면에서 내용이 가려지는 게 아니다. 실제 액션 요소(주문하기 버튼, 체크박스)만 따로 쟀을 때는 겹치지 않았다.
- **오래된 확인 카드(retireCards)**: "수정" 후 다시 확인 카드가 뜨면 이전 카드가 `.is-old`(그림자 제거 + 반투명)로 바뀌는 것을 스크린샷으로 확인했다. 정상 동작.
- **COMPONENTS.md 대조**:
  - "카드당 오렌지 1곳": `.order-card` 안에서 computed color가 `--accent`와 일치하는 요소는 `.order-total-price`(35,000원) 1개뿐이었다. 규칙대로다.
  - "48px 버튼": `.send`/`.composer .own-input` 52px, `.choice.is-size` 48px — 모두 충족. `.order-edit`는 28px이지만 COMPONENTS.md가 명시한 "글자만 있는 링크형 버튼(`.link`) 예외"에 해당하는 클래스(`link order-edit`)라 규칙 위반이 아니다.
  - "한글은 Anton 대신 본문 글꼴 굵게": `.order-row dt.order-label-ko`(이미지 링크/한 줄 이야기/사이즈/이름/연락처/배송 주소/배송 요청)와 `.btn-request-ko`(주문하기) 모두 `fontFamily: Pretendard, Archivo, system-ui, sans-serif`, `fontWeight: 700~800`으로 렌더링됨. Anton이 아니라 본문 글꼴 굵게 처리가 실제로 적용되고 있었다.
- **콘솔 에러**: 폰트 CDN 2건을 의도적으로 차단한 것 외에는 JS 런타임 에러(`pageerror`)가 한 번도 발생하지 않았다.

## 바뀐 파일
없음. 코드는 고치지 않았다 — 버그를 발견하지 못했다.

## 잘 안 된 것, 아쉬운 것
- 테스트 스크립트 자체의 시행착오가 있었다. 처음에 accent 색을 `rgb(248, 80, 3)` 문자열로 비교했다가 0건으로 잘못 나왔는데, 실제로는 브라우저가 computed color를 `oklch(0.66 0.215 38)` 형식으로 돌려주고 있어서였다(이 환경의 Chromium이 oklch 색공간을 기본으로 보고하는 듯). `var(--accent)`를 임시 엘리먼트에 적용해 computed 값끼리 비교하는 방식으로 바로잡았다. 색상 computed 비교를 할 때는 RGB 문자열을 가정하지 않는 게 안전하다는 걸 메모로 남긴다.
- 처음 300~800ms 대기 시간이 짧아 "확인 카드 주문하기 버튼이 가려진다"는 오탐(false positive)을 한 번 만들었다. 애니메이션이 있는 UI를 좌표로 검증할 때는 애니메이션이 끝난 뒤의 안정 상태(settled state)를 재는지 꼭 확인해야 한다 — 실제 사용자는 몇백 ms는 기다리므로 실사용에서는 문제가 안 되지만, 자동 검증 스크립트의 타이밍이 짧으면 가짜 버그를 만들 수 있다.
- `.order-edit`(수정 버튼)이 28px로 엄지로 누르기엔 다소 작아 보이지만, 이건 10-16 디자이너가 의도적으로 설계한 "글자 링크형 버튼" 패턴이고 오늘 목표(스크롤 겹침 확인) 범위 밖이라 손대지 않았다. 다음에 확인 카드를 다시 만질 일이 있으면 `.order-edit`의 탭 영역을 조금 더 키우는 것도 검토할 만하다.

## 의장에게 넘긴 것 (있으면 OPERATOR_TODO.md 에도 적었는지)
없음.

## 다음에 이어서 할 것
- 오늘 확인은 Playwright 가짜 로그인 + 빠른 타이핑으로 진행했다. 실기기(특히 iOS Safari, 소프트 키보드가 실제로 뷰포트를 줄이는 상황)에서 한 번 더 눈으로 보면 더 확실하다. `focusComposer()`의 `visualViewport.resize` 대응 로직은 이번 정적 렌더링으로는 검증하지 못했다.
- `.order-edit` 탭 영역(28px)을 다음 디자인 다듬기 때 재검토할 만하다.

## 팀원에게 한마디
윤 개발자에게 — 10-20에 제안해주신 "좌표를 직접 찍어서 겹침 여부를 수치로 확인"하는 방법, 오늘 그대로 써봤습니다. 결과는 좋은 소식입니다: 로그인 이후 단계(이름/전화/주소/배송 요청/확인 카드) 전부 `keepInView()`/`scroll-margin-bottom` 수정이 똑같이 잘 먹혀서 말풍선도 입력창도 겹치지 않았어요. 다만 테스트 중 겹침처럼 보이는 결과가 한 번 나왔는데, 알고 보니 제 테스트가 스크롤 애니메이션이 끝나기 전에 좌표를 잰 거였습니다(실제 버그 아님) — 혹시 developer 쪽에서도 애니메이션이 있는 요소를 좌표로 검증하실 일이 있으면 "애니메이션 끝난 뒤" 기준으로 재는지 한 번 더 확인해보시면 좋을 것 같아요.
