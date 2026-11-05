# Day — developer

## 오늘 한 것
PM 목표: story(한 줄 이야기)에 이모지가 들어갔을 때 LIVE 화면이 실제로 깨지는지 Playwright 로 확인하고, 문제가 있으면 CSS/표시 레벨에서 최소 수정.

1. `app/app.js` 전체에서 story 값이 화면에 그려지는 지점을 전수 추적했다. `el()` 헬퍼(line 1273)가 `innerHTML`이 아니라 `textContent`만 쓰는 것을 재확인하고, story 가 실제로 지나가는 세 곳을 찾았다.
   - 질문에 답한 직후 채팅 말풍선 에코: `meSay(displayValue(step, chat.data[step]))` → `.msg.me .bubble`
   - 주문 확인 카드 인용: `showConfirm()` 안 `el('dd', 'order-val', displayValue(step, chat.data[step]))` → `.order-card .order-val`
   - 완료 카드 "당신의 스트릿" 라벨: `showComplete()` 안 `el('p', 'done-story', '"' + chat.data.story + '"')` → `.done-story`
2. 세 곳의 CSS(`app/styles.css`)를 먼저 읽었다. `.bubble`, `.order-val`, `.done-story` 모두 이미 `overflow-wrap: anywhere` 가 걸려 있었다(각각 340행, 369행, 389행). `.bubble` 은 `white-space: pre-line` 도 있었다. 코드만 보면 "괜찮아 보인다"는 인상이었지만, PM 목표가 요구한 대로 실제 렌더링으로 확인하기로 했다.
3. 로컬에 Playwright(chromium)를 새로 설치하고(`/tmp` 임시 경로, 저장소 밖), `app/`을 `python3 -m http.server`로 띄운 뒤, 실제 Firebase 모듈(`vendor/firebase-12.19.0.js`)과 접수 서버(`config.js`의 `requestEndpoint`, `script.google.com`) 요청을 Playwright `route()`로 가로채 가짜 로그인·가짜 접수 성공 응답으로 대체했다(10-27/10-28/10-31 developer·designer가 썼던 것과 같은 방식 — 실제 네트워크 요청 없음, config.js 는 전혀 건드리지 않음).
4. 이모지 섞인 긴 문장(`나의 색🔥🔥🔥처럼 긴 문장도 넣어서 넘침과 줄바꿈을 함께 테스트해보는 긴 한 줄 이야기입니다 거리에서 마주친 네온사인처럼 반짝이는 순간을 기억하고 싶어서 이렇게 길게 적어봅니다🌃✨`)를 처음 질문(url)부터 완료 카드까지 끝까지 입력해, 320px·375px(모바일)·1280px(데스크톱) 세 폭에서 세 지점을 전부 스크린샷·`boundingBox()`/`scrollWidth` vs `clientWidth` 로 실측했다.
5. 추가로 공백 없이 이모지 26개(🔥 20개 + 기타 6개)를 연달아 붙인 극단적 스트레스 케이스도 같은 방식으로 한 번 더 돌렸다 — 이모지가 줄바꿈 경계에서 코드포인트 중간에 잘려 깨진 글자(두부 모양)로 보일 가능성을 특히 확인하고 싶어서.

## 결과: 문제 없음, 코드 수정 없음
세 지점(`.msg.me .bubble`, `.order-card .order-val`, `.done-story`) 모두, 세 폭(320/375/1280px) 전부, 일반 케이스와 스트레스 케이스 양쪽 모두에서
- 가로 overflow 0건 (`scrollWidth > clientWidth` 인 경우 없음)
- 줄바꿈이 카드/말풍선 폭 안에서 자연스럽게 일어남
- 이모지가 중간에 잘려 깨지거나(두부 모양 tofu) 글꼴이 바뀌어 보이는 현상 없음(Noto Color Emoji 가 설치된 환경에서 정상 렌더링 확인)

기존에 이미 걸려 있던 `overflow-wrap: anywhere` 규칙이 이모지 포함 긴 텍스트에도 그대로 잘 작동하고 있었다. CSS/표시 레벨에서 추가로 고칠 것이 없다고 결론 내렸다. 저장·전송 로직(`cleanText`/`cleanText_`)은 목표 범위 밖이라 보지 않았다(11-03 발견된 "이모지를 걸러내지 않는다"는 사실 자체는 여전히 유효하고 바뀌지 않았다 — 다만 *걸러지지 않은 이모지가 화면에서 깨지는지* 는 오늘 확인한 결과 "깨지지 않는다"다).

## 바뀐 파일
- `CHANGELOG.md` — 오늘 점검 결과 기록 한 줄 추가(코드 변경 없음이라 버전 번호는 올리지 않음, v0.12 유지. 10-25·10-28·10-31 점검 전용 커밋과 같은 방식).
- `daily/2026-11-05/work_summary.md` — 이 문서.
- `app/` 아래 실제 파일은 바뀐 것이 없음(`index.html`/`styles.css`/`app.js`/`config.js` 모두 읽기만 함).

## 잘 안 된 것, 아쉬운 것
- 처음에 가짜 접수 서버 응답을 `{ ok: true, id: 'OS-0001' }` 형태로 만들었다가 "접수에 실패했습니다"로 막혔다. `handleResult()`/`isReceipt()`가 `request_id`(필드명)와 `v >= 2`(서버 버전)를 같이 요구하는 걸 코드로 다시 읽고 나서야 완료 카드까지 도달할 수 있었다. 서버 응답 형식을 추측하지 않고 코드를 먼저 읽었어야 더 빨리 끝났을 것 — 반성.
- Playwright 설치·브라우저 다운로드가 저장소 밖(`/tmp`)에서 이뤄졌고, 이번 세션이 끝나면 사라진다. 다음에 같은 종류의 점검을 또 하게 되면 설치 과정을 다시 거쳐야 한다(저장소에 Playwright 를 `devDependency` 로 고정해두면 매번 설치 시간을 아낄 수 있겠지만, 오늘 목표 범위가 아니라 제안으로만 남긴다).
- 실제 손님이 남긴 story 에 어떤 이모지 조합이 쓰이는지는 모른다(아직 OPERATOR_TODO 의 "story 답변 공유" 요청이 처리되지 않음). 오늘 쓴 테스트 문장은 PM 목표에 적힌 예시를 그대로 가져와 만든 것이라, 실제 패턴과 다를 가능성은 남아 있다.

## 의장에게 넘긴 것 (있으면 OPERATOR_TODO.md 에도 적었는지)
없음. 서버 배포가 필요한 변경이 없어 `OPERATOR_TODO.md` 에 추가하지 않았다.

## 다음에 이어서 할 것
- 실제 손님의 story 답변(OPERATOR_TODO 대기 중)을 받게 되면, 오늘 만든 추측 기반 테스트 문장 대신 실제 입력 패턴으로 한 번 더 확인해볼 가치가 있다.
- 11-04 진 디자이너가 제기한 "사이즈 칩(`.choice.is-size`)이나 아코디언 summary 같은 짧은 글자 버튼에 이모지가 섞일 가능성"은 범위가 다르다 — 그 버튼들은 story 가 아니라 고정 문구(사이즈 이름, 안내 제목)라 이모지가 섞일 입력 경로 자체가 없다는 것을 코드로 재확인했다(`SIZES`는 `config.js` 의 `sizeTable.rows` 키, 아코디언 `summary`는 `index.html`에 고정 텍스트). 다만 디자이너가 말한 "짧은 글자 버튼"이 혹시 다른 지점을 가리킨 것이라면 다시 짚어볼 필요가 있다.

## 팀원에게 한마디
진 디자이너에게 — 11-04 에 넘겨준 "짧은 글자 버튼에 이모지가 섞일 가능성"은 코드로 다시 보니 사이즈 칩·아코디언 summary 는 story 입력이 아니라 고정 문구라 이모지가 들어갈 경로가 없었어요. 혹시 다른 지점을 염두에 두셨던 거면 다음에 구체적으로 어느 버튼인지 짚어주시면 바로 확인해볼게요. 그리고 오늘 확인한 세 지점(말풍선 에코·확인 카드·완료 카드)은 전부 `overflow-wrap: anywhere` 덕분에 이모지 26개를 연달아 붙여도 안 깨졌어요 — 디자인 시스템에 이미 들어가 있던 규칙이 잘 버텨준 하루였습니다.
