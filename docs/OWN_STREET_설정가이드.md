# OWN STREET 설정 가이드

순서대로 한 번만 하면 됩니다. (약 20~30분)

```
own-street/
├─ site/            ← 웹사이트 (이 폴더를 통째로 Netlify에 올립니다)
│  ├─ index.html
│  ├─ styles.css
│  ├─ app.js
│  ├─ config.js     ← 직접 채우는 파일은 이것 하나
│  └─ vendor/       ← Google 로그인 라이브러리 (건드리지 않기)
├─ apps-script/
│  └─ Code.gs       ← Apps Script에 통째로 붙여넣을 코드
└─ 설정가이드.md
```

비밀 값(Client Secret, 서비스 계정 키 등)은 이 구조에 필요 없습니다.
config.js에 넣는 Firebase 값은 원래 웹사이트에 공개되도록 만들어진 값이라 괜찮습니다.

---

## 1단계 — Firebase에서 Google 로그인 켜기

1. https://console.firebase.google.com 접속 → 운영할 Google 계정으로 로그인
2. **프로젝트 만들기** 클릭 → 이름 `own-street` 입력 → **계속**
3. Google 애널리틱스 화면에서 스위치를 **끄고** → **프로젝트 만들기** → 완료되면 **계속**
4. 왼쪽 메뉴 **빌드(Build) → Authentication** → **시작하기**
5. **로그인 방법(Sign-in method)** 탭 → **Google** 클릭
6. **사용 설정** 스위치 켜기 → **프로젝트 지원 이메일**에서 내 이메일 선택 → **저장**
7. 왼쪽 위 **⚙ 톱니바퀴 → 프로젝트 설정** → **일반** 탭 맨 아래 **내 앱** → 웹 아이콘 **`</>`** 클릭
8. 앱 닉네임 `own-street-web` 입력 → "Firebase 호스팅 설정"은 **체크하지 않음** → **앱 등록**
9. 화면에 나오는 `firebaseConfig` 에서 아래 4개 값을 메모장에 복사 → **콘솔로 이동**
   - `apiKey` (AIza로 시작)
   - `authDomain` (…firebaseapp.com)
   - `projectId`
   - `appId` (1:숫자:web:… 형식)

## 2단계 — config.js 채우기

`site/config.js` 를 메모장(Mac은 텍스트편집기)으로 열어 ① 부분에 붙여넣습니다.

```js
firebase: {
  apiKey: 'AIza……',
  authDomain: 'own-street-xxxx.firebaseapp.com',
  projectId: 'own-street-xxxx',
  appId: '1:1234567890:web:abcd……'
},
```

같은 파일의 ③ 문의 이메일, ④ 개인정보 보유 기간도 운영 방침에 맞게 채우세요.
(비워두면 사이트에 "문의처를 준비하고 있습니다", "[보유 기간 입력 필요]"로 보입니다.)

## 3단계 — Apps Script 코드 교체 (접수번호 + 이메일 저장)

지금 스프레드시트 `ownstreetdb` 의 `ver1` 시트에는 이메일·접수번호 칸이 없습니다.
새 코드는 같은 스프레드시트에 **REQUESTS** 라는 새 시트를 만들어 저장합니다. `ver1` 은 건드리지 않습니다.

1. Google Drive에서 **ownstreetdb** 스프레드시트 열기
2. 위 메뉴 **확장 프로그램 → Apps Script**
   - 먼저 **배포 → 배포 관리**를 눌러 웹 앱 URL이 `…AKfycbxmhqNB…9S0t/exec` 인지 확인하세요.
   - 다르다면 https://script.google.com 에서 그 URL을 가진 프로젝트를 찾아 여세요.
3. 왼쪽 파일 목록에서 **Code.gs(코드.gs)** 클릭
4. 편집 화면 클릭 → **Ctrl+A** (Mac: ⌘+A) → **Delete** 로 기존 코드 전부 지우기
5. `apps-script/Code.gs` 내용 전체를 복사해 붙여넣기
6. 맨 위 `FIREBASE_API_KEY = '여기에_Firebase_apiKey_붙여넣기'` 의 따옴표 안을 1단계의 **apiKey** 로 바꾸기
7. 위쪽 **💾 저장** 아이콘 (또는 Ctrl+S)
8. 저장 아이콘 오른쪽 함수 선택 칸에서 **setup** 선택 → **▶ 실행**
9. 권한 창이 뜨면: **권한 검토** → 내 계정 선택 → **고급** → **(프로젝트 이름)(으)로 이동(안전하지 않음)** → **허용**
   (내가 만든 스크립트라서 나오는 정상 안내입니다.)
10. 아래 **실행 로그**에 ✅ 두 줄이 나오면 성공. ❌ 가 나오면 적힌 안내대로 고친 뒤 다시 실행
11. 오른쪽 위 **배포 → 배포 관리** → 목록의 배포 선택 → **✏ 연필(수정)** 아이콘
12. **버전**: **새 버전** 선택 / **다음 사용자 인증 정보로 실행**: **나** / **액세스 권한이 있는 사용자**: **모든 사용자** → **배포**
13. URL이 그대로면 config.js는 바꿀 필요 없습니다.
    - 실수로 "새 배포"를 만들어 URL이 바뀌었다면 → 새 URL을 `config.js` ② `requestEndpoint` 에 넣으세요.
14. 확인: 웹 앱 URL을 브라우저 주소창에 붙여넣어 열었을 때 `"접수 서버가 작동 중입니다."` 가 보이면 완료

## 4단계 — 웹사이트 올리기 (Netlify, 무료)

1. https://app.netlify.com/signup 에서 가입 (Google 계정으로 가입 가능)
   - 가입하지 않고 올리면 1시간 뒤 사이트가 사라집니다.
2. https://app.netlify.com/drop 접속
3. 2단계에서 수정한 **site 폴더**를 통째로 화면에 끌어다 놓기
4. 올라가면 `어떤이름.netlify.app` 주소가 생깁니다
5. **Site configuration → Change site name** → `own-street` 등 원하는 이름 → **Save**
   → 주소가 `own-street.netlify.app` 처럼 바뀝니다 (이미 쓰이는 이름이면 다른 이름)

나중에 config.js 등을 고쳤다면: Netlify에서 사이트 → **Deploys** 탭 → 아래 "Drag and drop your site output folder here" 칸에 site 폴더를 다시 끌어다 놓으면 됩니다.

## 5단계 — Firebase에 사이트 주소 허용

1. Firebase 콘솔 → **Authentication** → **설정(Settings)** 탭
2. **승인된 도메인(Authorized domains)** → **도메인 추가**
3. `own-street.netlify.app` 입력 (https:// 없이, 4단계에서 정한 주소) → **추가**

이걸 빼먹으면 로그인 버튼을 눌렀을 때 "로그인 설정이 아직 끝나지 않았습니다"가 나옵니다.

---

## 실제 서비스 테스트

휴대폰 **Chrome 또는 Safari**에서 사이트 주소를 여세요. (카카오톡 안에서 열면 Google이 로그인을 막기 때문에, 사이트가 "브라우저로 열기"를 안내합니다.)

1. **Google로 시작하기** → 계정 선택 → 내 사진·이름·이메일이 보이는지
2. 새로고침 → 그대로 로그인되어 있는지
3. 이름 / `01012345678` 입력 → `010-1234-5678` 로 바뀌는지 / URL 입력 / 동의 체크
4. **REQUEST** → 버튼이 **SENDING...** → **REQUEST COMPLETE / OS-0001**
5. ownstreetdb → **REQUESTS** 시트에 `OS-0001 / 시간 / 내 이메일 / 이름 / 전화번호 / URL / 접수` 한 줄이 생겼는지
6. **COPY** → 메모장에 붙여넣어 `OS-0001` 이 나오는지
7. 실패 테스트: 휴대폰 **비행기 모드** → 새 내용으로 REQUEST → "접수에 실패했습니다" 확인 →
   비행기 모드 끄고 **다시 시도** → 완료 (같은 요청은 한 줄만 저장됨)
8. **LOGOUT** → 새로고침 → 로그아웃 상태 유지되는지

### 테스트가 끝나고 번호를 OS-0001부터 다시 시작하려면
1. REQUESTS 시트에서 테스트 줄 삭제
2. Apps Script 왼쪽 **⚙ 프로젝트 설정** → 맨 아래 **스크립트 속성** → `OS_LAST_SEQ` 행 삭제 → 저장

(평소에는 줄을 지워도 번호가 되돌아가지 않아 중복이 생기지 않습니다.)

---

## 참고

- 접수번호는 Apps Script가 잠금(LockService) 상태에서 하나씩 발급하므로 여러 명이 동시에 신청해도 겹치지 않습니다.
- 이메일은 사용자가 입력하지 않고, Apps Script가 Google 서버에 로그인 정보를 확인해서 가져옵니다.
- 저장 후 시트를 다시 읽어 확인된 경우에만 접수번호를 돌려주고, 그때만 REQUEST COMPLETE가 표시됩니다.
- 사이즈표·QUALITY 값은 `config.js` ⑤ ⑥ 에 채우면 됩니다.
