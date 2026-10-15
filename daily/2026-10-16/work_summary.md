# Day 8 — designer

## 오늘 한 것
어제(10-15) developer 가 `app/` 으로 이식한 채팅형 주문 골격을 다듬었다. PM 목표 다섯 가지를 모두 다뤘다.

1. **채팅 카드 모양 다듬기 + 공통 컴포넌트 규칙 문서화**
   - 주문 확인 카드(`.order-card`)의 한글 라벨("이미지 링크", "이름" 등)이 `.font-display`(Anton, 영문 전용)로 되어 있어서 Pretendard로 자동 대체되며 다른 한글보다 가늘어 보이던 문제를 발견, `.order-label-ko`(본문 글꼴 굵게)로 고쳤다. (`app/app.js`, `app/styles.css`)
   - 쓰이지 않는 옛 한 페이지 폼 시절 CSS를 정리했다: `.hero`/`.hero-*`, 중복 정의돼 있던 첫 번째 `.topbar`/`.user-chip`/`.chip-*` 블록(두 번째 채팅용 블록만 실제로 쓰임), `.btn`/`.btn-paper`/`.btn-ink`/`.badge-accent`/`.login-as`/`.notice-box`/`.auth-msg`, `.form`/`.gate`/`.field`/`.field-label`, `.price-box`/`.price-row`/`.price-name`/`.price-amount`/`.price-desc`, `.pay-box`. 지우기 전 `app/app.js`·`app/index.html`에서 각 클래스가 실제로 쓰이는지 grep으로 하나씩 확인했다.
   - `app/COMPONENTS.md`를 새로 만들어 말풍선 vs 카드 사용 기준, 버튼 최소 크기(48px), 오렌지 색 사용 범위, 한글/Anton 처리 규칙, 진행 막대 동작, 목업 자리 메모, 자주 쓰는 카드 레이아웃(`.order-card`, `.mockup-card`/`.pay-card` 패턴)을 정리했다.

2. **티셔츠 뒷면 목업 자리 점검**
   - `app/`에 목업 관련 코드가 전혀 없다는 것을 git 히스토리·grep으로 확인했다(과거에도 없었다 — 아직 구현된 적이 없는 기능).
   - 손님이 실제로 보내는 것은 이미지 파일 주소가 아니라 "생성한 이미지가 있는 채팅 링크"(`config.js`의 가이드 문구, `app/app.js`의 `normalizeUrl`)라서, 신뢰할 수 없는 외부 주소를 그대로 `<img src>`에 걸 수 없다고 판단했다. 그래서 손님 이미지를 직접 보여주는 미리보기는 오늘 범위에서 만들지 않았다.
   - 대신 `app/assets/tee-back-mockup.svg`(뒷면 아웃라인 + 점선 프린트 영역, 디자인 시스템 색·2px 테두리)를 새로 그리고, 접수 완료 카드 바로 다음에 "뒷면 단일 프린트 · 최대 A3 사이즈" 안내와 함께 보여주는 카드(`buildMockupCard()`)를 추가했다. 손님이 고른 사이즈도 함께 보여준다.
   - 실제 손님 이미지를 넣으려면 별도로 이미지 파일을 받는 절차가 필요하다는 점을 `COMPONENTS.md`에 남겨 developer/브랜더 논의로 넘겼다.

3. **상단 바를 더 얇게**
   - 브랜드 글자 20px→16px, 패딩 12px→8px(모바일 기준)로 줄였다. `.topbar`를 `.topbar-wrap`(sticky 고정 래퍼) 안에 넣어 구조를 정리했다.
   - user-chip(로그인 상태 배지)도 패딩·아바타 크기를 살짝 줄여 톤을 맞췄다.

4. **진행 단계 표시 — 숫자 대신 막대로 넣었다**
   - 윤 개발자가 걱정한 "건너뛰기·되돌리기가 있으면 숫자가 틀릴 위험"은 타당하다고 판단했다. 그래서 "3/8" 같은 숫자는 쓰지 않고, 상단 바 바로 아래 3px 높이 막대(`#topProgress`, `.topbar-progress`)가 `STEPS` 배열 기준 비율만큼 오렌지로 채워지는 방식을 넣었다.
   - 이 방식이 숫자보다 안전하다고 본 이유: 막대는 "정확한 단계 수"를 주장하지 않는다. 손님이 수정하러 되돌아가서 막대가 줄어들어도 "틀린 정보"로 보이지 않는다(숫자였다면 "3/8"이 "2/8"로 줄어드는 게 이상해 보였을 것). `setProgress(idx)`/`hideProgress()`를 `askStep`, `askLogin`, `showConfirm`, `showComplete`, `resetChat`에 연결했다.
   - `prefers-reduced-motion`을 존중해 막대 채움 트랜지션을 끌 수 있게 했다(기존 규칙 패턴을 그대로 따름).

## 바뀐 파일
- `app/app.js` — 확인 카드 라벨 클래스 변경(`.order-label-ko`), `setProgress`/`hideProgress` 추가 및 각 단계 호출 지점 연결, `buildMockupCard()` 추가 및 `showComplete()`에서 호출
- `app/styles.css` — 중복/미사용 CSS 정리(약 140줄 삭제), 상단 바를 `.topbar-wrap`/`.topbar`/`.topbar-progress` 구조로 재구성 + 치수 축소, `.order-label-ko`, `.mockup-card`/`.mockup-img`/`.mockup-note` 추가
- `app/index.html` — `<header>` 구조를 `.topbar-wrap`으로 감싸고 `#topProgress` 요소 추가
- `app/assets/tee-back-mockup.svg` — 새로 추가한 티셔츠 뒷면 목업 SVG
- `app/COMPONENTS.md` — 새로 추가한 컴포넌트 규칙 문서
- `daily/2026-10-16/mockup-card.png`, `order-confirm-card.png`, `thin-topbar-progress.png` — 오늘 작업 결과를 playwright로 렌더링해 남긴 스크린샷(시안 비교용)
- `CHANGELOG.md` — v0.4 한 줄 추가
- `app/config.js`, `app/kakaopay-qr.svg`, `backend/Code.gs` — 건드리지 않음

## 잘 안 된 것, 아쉬운 것
- 티셔츠 뒷면 목업은 "자리"만 마련했다. 손님이 올린 실제 이미지를 그 안에 합성해서 보여주는 진짜 미리보기는 만들지 못했다 — 위에 적은 대로 지금 받는 값이 이미지 파일 주소가 아니라서 구조적으로 더 큰 논의(이미지를 어떻게 실제로 받을지)가 필요하다고 판단해 오늘 범위를 넘는다고 보고 멈췄다.
- 이 환경엔 원래 브라우저가 없다고 알고 있었는데, `chromium`/`playwright`가 설치되어 있는 걸 확인하고 실제로 화면을 렌더링해서 스크린샷으로 눈으로 확인할 수 있었다. 로그인 이후 단계(이름~배송 주소~확인~접수)는 실제 Firebase 로그인이 필요해서 여전히 DOM을 직접 주입하는 방식으로만 카드 스타일을 확인했다 — 실제 로그인 플로우를 통과한 화면은 아니다.
- `node --check`, CSS 중괄호 수, HTML 태그 수, DOM id 참조 일치는 스크립트로 확인했지만, 실제 서버 응답(접수 성공/실패)까지 흐르는 전체 경로는 보지 못했다(이건 디자인 작업 범위를 넘는다고 판단).

## 의장에게 넘긴 것 (있으면 OPERATOR_TODO.md 에도 적었는지)
없음. 오늘 작업은 프론트엔드 파일만 다뤘고 서버·설정 변경이 필요한 부분이 없었다. `OPERATOR_TODO.md`에 추가한 항목 없음.

## 다음에 이어서 할 것
- 10-15 developer 의 "다음에 이어서 할 것"에 있던 "시험·수정"(LAB 모바일 확인, 중복 접수 재확인, 인앱 로그인 재확인)이 아직 남아 있다. 오늘 디자인을 다듬었으니 다음 사이클에서 LAB에 올라간 실제 화면을 모바일로 한 번 확인하면 좋겠다.
- 목업에 실제 손님 이미지를 넣으려면: (a) 이미지를 어떻게 안전하게 받을지(채팅 링크 대신 파일 업로드? 아니면 다른 방식?) 팀 논의가 먼저 필요하다. 이건 디자이너 혼자 결정할 범위가 아니라고 봐서 developer/브랜더에게 넘긴다.
- `.btn-label-ko`(한글 버튼 공통 유틸)는 지금 실제로 쓰이는 곳이 없어 보이는데, 과한 정리를 피하려고 남겨뒀다. 다음에 한글 버튼을 새로 추가할 일이 있으면 이 클래스를 재사용하면 된다.

## 팀원에게 한마디
윤 개발자에게 — 상단 바를 얇게 줄이고, 말씀하신 대로 숫자 대신 막대로 진행 표시를 넣었어요(`setProgress`/`hideProgress`, `app/app.js`). 건너뛰기·수정 때문에 "틀린 숫자"가 보일 위험이 있다는 지적에 동의해서, 막대는 정확한 단계 수를 주장하지 않는 방식으로 설계했습니다. 혹시 서버 쪽 로직 바꾸실 때 `STEPS` 배열 순서가 바뀌면 막대 비율도 자동으로 따라가니 따로 손 안 대셔도 될 거예요. 그리고 뒷면 목업은 자리만 만들어뒀는데, 손님 이미지를 실제로 받는 방식(채팅 링크 대신 파일 업로드 등)은 혼자 결정하기 어려운 구조 문제라 다음 회의 때 같이 얘기해보면 좋겠습니다.
