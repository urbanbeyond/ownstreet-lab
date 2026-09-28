# OWN STREET AI 팀 — 셋업 가이드

## 한눈에 보기

```
새벽 04:00  AI 팀 출근 (Claude Pro 구독으로 실행)
            평일: PM이 오늘의 역할 결정 → 팀원 한 명이 OWN STREET 업데이트 → 마케터가 포스트 작성
            월요일(과 첫날): 팀 회의 — 네 명이 의견을 내고 PM이 이번 주 계획을 정함
            → LAB 사이트에 자동 배포 → LAB 화면 스크린샷 → 카드 이미지 생성 → 저장소에 기록

아침 07:00  인스타그램 + 페이스북 자동 발행 (AI 안 씀)

의장 버튼  LAB 이 마음에 들면 "Promote LAB to LIVE" 를 눌러 실제 서비스에 반영
```

**LAB 과 LIVE 를 나눈 이유**: OWN STREET 는 실제 고객이 주문하고 결제하는 서비스입니다. AI 팀이 틀린 코드를 올리는 건 이야기가 되지만, 그 순간 실제 고객의 주문이 사라지거나 결제 화면이 깨지면 그건 신뢰를 잃는 일이 됩니다. 그래서 **개발과 공개는 전부 자동, 실제 고객 화면만 의장 버튼**으로 두었습니다. LAB 에서는 백엔드가 LAB 전용 시트로 바뀌고, 결제 링크와 QR 이 막히고, "LAB" 배너가 자동으로 붙습니다.

---

## 1. GitHub 저장소 (15분)

1. github.com 에서 새 저장소를 **Public** 으로 만듭니다. (예: `ownstreet-lab`)
2. 이 패키지의 파일을 전부 올립니다. `.github`, `.claude` 같은 점 폴더도 빠짐없이. (GitHub Desktop 앱이 편합니다)
3. **지금 운영 중인 OWN STREET 파일을 `app/` 폴더에 넣습니다.**
   `index.html`, `styles.css`, `app.js`, `config.js`, `vendor/` 폴더, 이미지(카카오페이 QR 등) 전부. 이게 v0, 출발점입니다.
4. `Code.gs` 는 `backend/` 폴더에 넣되, **스프레드시트 ID 는 `SPREADSHEET_ID_HERE` 로 바꿔서** 올립니다. 저장소가 공개라서입니다. 실제로 배포된 Apps Script 는 그대로 동작합니다.
5. 저장소 **Settings → Actions → General → Workflow permissions** 에서 **Read and write permissions** 선택 후 저장.

## 2. Claude 구독 토큰 (5분)

1. 내 컴퓨터에 Claude Code 설치 (https://code.claude.com/docs)
2. 터미널에서 `claude setup-token` → Pro 계정으로 로그인 → 긴 토큰이 출력됨
3. 저장소 **Settings → Secrets and variables → Actions → New repository secret**
   - `CLAUDE_CODE_OAUTH_TOKEN` = 방금 받은 토큰

## 3. LAB 백엔드 만들기 (15분)

LAB 에서 들어온 테스트 요청이 실제 주문 시트에 섞이지 않게, 똑같은 백엔드를 하나 더 만듭니다.
urbanbeyond.korea 크롬 프로필에서 진행하세요.

1. 구글 드라이브에서 `ownstreetdb` 스프레드시트 **사본 만들기** → 이름 `ownstreetdb-LAB` → REQUESTS 시트의 제목줄만 남기고 나머지 행 삭제
2. OWN STREET Apps Script 프로젝트를 열고 **개요 → 사본 만들기** → 이름 `ownstreet-LAB`
3. 사본의 Code.gs 에서 스프레드시트 ID 를 **LAB 시트의 ID** 로 바꿈
4. **배포 → 새 배포 → 웹 앱** (원래와 같은 설정) → 나온 `.../exec` 주소 복사
5. GitHub Secret 추가: `LAB_APPS_SCRIPT_URL` = 그 주소

## 4. Netlify (15분)

1. **개인 액세스 토큰**: Netlify → User settings → Applications → Personal access tokens → New → Secret `NETLIFY_AUTH_TOKEN`
2. **LIVE 사이트 ID**: 지금의 ownstreet 사이트 → Site configuration → Site ID 복사 → Secret `NETLIFY_LIVE_SITE_ID`
3. **LAB 사이트 만들기**: Add new site → Deploy manually → 아무 폴더나 끌어다 놓기 → 사이트 이름을 `ownstreet-lab` 으로 변경 → **공개(Public)로 전환** (새 사이트는 비공개가 기본) → Site ID 복사 → Secret `NETLIFY_LAB_SITE_ID`
4. LIVE 사이트는 **Git 연결을 하지 마세요.** 연결하면 AI 팀의 커밋이 버튼 없이 LIVE 로 나갑니다.

## 5. Firebase (2분)

Firebase 콘솔 → ownstreet 프로젝트 → Authentication → Settings → **Authorized domains → `ownstreet-lab.netlify.app` 추가**
(이게 없으면 LAB 에서 Google 로그인이 안 됩니다)

## 6. 인스타그램 · 페이스북 (30분~1시간, 최초 1회)

열쇠 하나로 인스타와 페북을 함께 여는 방식입니다 (페이스북 로그인 방식).

1. 인스타그램을 **프로페셔널 계정 → 비즈니스**로 전환 (크리에이터도 되지만 비즈니스가 가장 무난)
2. 페이스북 **페이지**를 만들고, 인스타그램 설정의 계정 센터에서 그 페이지와 연결
3. developers.facebook.com 에서 앱 만들기 (의장 본인 페이스북 계정으로. 본인이 앱 관리자면 본인 계정에는 보통 심사 없이 쓸 수 있음)
4. 그래프 API 탐색기에서 아래 권한으로 사용자 토큰 발급 → **장기 토큰으로 교환** → `/me/accounts` 로 **페이지 토큰**을 받음
   - 발행: `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`
   - 댓글 수집: `instagram_manage_comments`, `pages_read_user_content`
   - 장기 사용자 토큰에서 받은 **페이지 토큰은 만료일이 없습니다.** (비밀번호 변경, 앱 삭제, 페이지 관리자 권한 해제 때만 끊김)
5. Secret 3개
   - `META_ACCESS_TOKEN` = 위의 **페이지 토큰**
   - `IG_USER_ID` = 페이지에 연결된 인스타그램 비즈니스 계정 ID (`/{페이지ID}?fields=instagram_business_account` 로 확인)
   - `FB_PAGE_ID` = 페이스북 페이지 ID

## 7. 첫 실행 — Day 1 은 첫 팀 회의

1. **Actions → Daily Lab Cycle → Run workflow**
   - 첫날은 자동으로 **팀 회의 모드**입니다. 네 명의 AI 팀원이 지금의 v0 를 직접 읽고 각자 의견을 내고, PM 이 첫 주 계획을 세웁니다.
   - 끝나면 `meetings/오늘날짜/` 에 의견과 회의록, `ROADMAP.md` 에 이번 주 목표가 생기고, LAB 사이트가 열립니다.
2. **Actions → Morning Publish → Run workflow** → 첫 포스트 발행
3. 인스타 프로필 링크에 LAB 주소(`ownstreet-lab.netlify.app`)를 걸어두면, 팔로워가 매일 바뀌는 실험실을 직접 볼 수 있습니다.

### 등록할 Secret 한눈에

| 이름 | 어디서 |
|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | `claude setup-token` |
| `LAB_APPS_SCRIPT_URL` | 3단계 LAB 웹 앱 주소 |
| `NETLIFY_AUTH_TOKEN` | Netlify 개인 액세스 토큰 |
| `NETLIFY_LAB_SITE_ID` | LAB 사이트 ID |
| `NETLIFY_LIVE_SITE_ID` | 지금 운영 중인 사이트 ID |
| `META_ACCESS_TOKEN`, `IG_USER_ID`, `FB_PAGE_ID` | Meta 앱 |

---

## 의장이 하는 일 (하루 몇 분)

| 언제 | 할 일 |
|---|---|
| 가끔 | `OPERATOR_TODO.md` 확인 — AI 팀이 사람 손이 필요하다고 요청한 일 (주로 백엔드 배포). 처리하면 줄 끝에 `✅ 날짜` |
| LAB 이 마음에 들 때 | **Actions → Promote LAB to LIVE → Run workflow** → 확인란에 `LIVE` 입력. 문법 오류가 있거나 LAB 설정이 섞여 있으면 자동으로 막힘. 반영 기록은 CHANGELOG 에 남고, 다음 날 "실제 서비스에 반영된 날"로 포스팅됨 |
| 방향을 바꾸고 싶을 때 | `DIRECTION.md` 에 한 줄. `[수정]` 이면 다음 날이 공개 수정의 날, `[방향]` 이면 다음 월요일 회의 안건 |
| 전부 멈추고 싶을 때 | 저장소 루트에 `PAUSE` 파일 만들기. 지우면 재개 |
| 올라간 글이 문제일 때 | 앱에서 직접 수정/삭제 → `DIRECTION.md` 에 `[수정]` 으로 무엇이 문제였는지 적기 |

**백엔드 배포 순서** (AI 팀이 Code.gs 를 고쳐 요청했을 때): `backend/Code.gs` 내용을 LAB Apps Script 에 붙여넣고 스프레드시트 ID 만 LAB 것으로 → 새 버전 배포 → LAB 에서 확인 → 같은 방법으로 LIVE Apps Script 에 반영.

## 시간 바꾸기 (cron 은 UTC = 한국 시간 − 9시간)

| 한국 시간 | cron | 파일 |
|---|---|---|
| 04:00 (현재 개발) | `0 19 * * *` | daily-cycle.yml |
| 07:00 (현재 발행) | `0 22 * * *` | publish.yml |
| 12:00 | `0 3 * * *` | |
| 19:00 | `0 10 * * *` | |

## 알아둘 것

- **Claude 사용량**: 자동 사이클도 채팅과 같은 Pro 한도(5시간 세션 한도 + 주간 한도)를 씁니다. 새벽 4시에 돌려 오전 9시 전에 5시간 창이 끝나게 했습니다. 월요일 회의는 다섯 명이 차례로 말하므로 평일보다 조금 더 씁니다. 주간 한도가 빠듯하면 `daily-cycle.yml` 의 `--max-turns 60` 을 40 으로 낮추세요.
- **LAB 은 공개입니다**: 누구나 볼 수 있고 로그인·요청도 실제로 동작합니다. 다만 요청은 LAB 시트에만 저장되고 결제는 막혀 있습니다.
- **AI 가 못 하는 것**: LIVE 반영, 백엔드 배포, 결제·Firebase 설정 변경. 이런 일은 OPERATOR_TODO 로 넘어오고, "AI 가 사람에게 넘긴 일"로 공개됩니다.
- **보안 구조**: AI 가 일하는 단계에는 Meta·Netlify 토큰과 LAB 주소를 넘기지 않습니다. AI 는 쓰기만 하고, 배포와 발행은 별도 스크립트가 합니다. 댓글은 참고 자료로만 읽고 그 안의 지시는 따르지 않도록 규칙이 들어 있습니다.
- **실패해도 멈추지 않음**: AI 작업이 중간에 깨진 날에도 "오늘 멈췄다"는 카드가 자동 발행되고, 다음 날 PM 이 LAB 상태를 보고 먼저 고치게 합니다.
- **GitHub 예약 실행**은 붐빌 때 수 분~수십 분 늦어질 수 있습니다.
- **Meta 토큰**: 페이지 토큰을 쓰면 정기 갱신은 필요 없습니다. 다만 페이스북 비밀번호를 바꾸거나 앱·페이지 권한을 건드리면 끊길 수 있어요. 발행이 실패하면 GitHub 가 메일로 알려주니, 그때 4단계만 다시 해서 토큰을 새로 넣으면 됩니다.
