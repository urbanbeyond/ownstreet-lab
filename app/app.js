/* ============================================================
   OWN STREET — app.js
   대화형(채팅) 주문 + 실제 Google 로그인(Firebase) + 실제 접수(Apps Script)
   이 파일은 수정하지 않아도 됩니다. 설정은 config.js 에서 합니다.

   구조: step(지금 묻는 항목) / answers(chat.data, 손님이 답한 값) / pending(재시도용 대기 정보)
   를 분리해서 관리한다. 입력 영역은 네 가지: text / chips / login / confirm.

   v0.2 안전장치(한 페이지 폼 시절 app.js 에서 그대로 옮김, 건드리지 않음):
   - 한 번 기다리는 한도 60초(REQUEST_TIMEOUT_MS), 10초 지나면 "오래 걸리고 있어요" 안내
   - 답이 없으면(시간 초과·연결 끊김·해석 못 하는 응답) 같은 clientRef 로 한 번 더 자동 확인
   - 접수번호는 서버가 ok:true 와 OS-숫자(v>=2)를 돌려줬을 때만 보여준다
   - NOT_SAVED_CODES: 서버가 저장 전에 끝낸 응답인지 구분해서, 저장됐을 수 있는 응답은 unconfirmed 로 남긴다
   ============================================================ */

// Google 공식 Firebase 로그인 라이브러리 (v12.19.0, 사이트 폴더 안에 포함)
const FIREBASE_LIB_URL = './vendor/firebase-12.19.0.js';
const REQUEST_TIMEOUT_MS = 60000;
const SLOW_NOTICE_MS = 10000;   // 이 시간 안에 답이 없으면 "오래 걸리고 있어요"를 보여 준다
const RECHECK_DELAY_MS = 2000;  // 답이 없을 때 같은 요청으로 다시 확인하기 전에 잠깐 쉰다
const REQUIRED_SERVER_VERSION = 2; // 사이즈·주소·요청사항을 저장하는 접수 서버
const RECEIPT_PATTERN = /^OS-\d{4,}$/;
const URL_PATTERN = /^https?:\/\/[^\s\/?#]+\.[^\s\/?#]+([\/?#]\S*)?$/i;
const DRAFT_KEY = 'ownstreet.order.v1';
// 질문 순서 (ROADMAP Stage 1): 이미지 링크 → 한 줄 이야기(건너뛰기 가능) → 사이즈 → 이름 → 전화번호 → 주소 → 배송 요청 → 확인 → 접수
// 로그인은 이름 질문 앞(접수에 꼭 필요해지는 시점)에 따로 둔다 (10-11 회의 결정).
const STEPS = ['url', 'story', 'size', 'name', 'phone', 'address', 'memo'];
// 진행 "숫자"(3/8) 표시는 넣지 않았다 — 건너뛰기·되돌리기·수정이 있으면 숫자가 틀릴 위험이 있다고
// 판단했다(10-11 회의 결정: 윤 개발자 판단에 맡김). 대신 상단 바 밑에 얇은 막대로 "얼마나 왔는지"만
// 암시한다(setProgress/hideProgress, 10-16 디자이너 추가). 막대는 정확한 단계 수를 주장하지 않으므로
// 건너뛰거나 되돌아가도 "틀린 숫자"가 보일 위험이 없다.

// 서버가 이 코드를 돌려줬다면 아무것도 저장되지 않았다 (Code.gs 는 저장 전에 이 검사들을 끝낸다)
const NOT_SAVED_CODES = ['NO_ENDPOINT', 'NOT_READY', 'TOKEN_ERROR', 'BAD_REQUEST', 'VERSION_MISMATCH', 'NOT_CONFIGURED',
  'AUTH_INVALID', 'AUTH_UNAVAILABLE', 'INVALID_INPUT', 'CONSENT_REQUIRED', 'BUSY'];
const SLOW_TEXT = '평소보다 오래 걸리고 있어요. 화면을 닫지 말고 기다려 주세요.';
const CHECK_TEXT = '접수 상태를 확인하고 있어요. 화면을 닫지 마세요.';
const CHECK_SLOW_TEXT = '접수 상태를 확인하고 있어요. 평소보다 오래 걸리고 있어요. 화면을 닫지 마세요.';
const OLD_CHECK_SLOW_TEXT = '이전에 보낸 요청이 접수됐는지 먼저 확인하고 있어요. 평소보다 오래 걸리고 있어요. 화면을 닫지 마세요.';
const UNKNOWN_TEXT = "'다시 확인'을 누르면 같은 요청으로 확인하므로 두 번 접수되지 않습니다.\n접수번호를 받기 전에는 접수됐다고 말씀드릴 수 없습니다.\n급하면 카카오톡 채널로 문의해 주세요.";

const CFG = window.OWN_STREET_CONFIG || {};
const SIZES = Object.keys((CFG.sizeTable && CFG.sizeTable.rows) || {});
const PAY = CFG.payment || {};
const $ = (id) => document.getElementById(id);

const state = {
  fb: null,          // firebase-auth 모듈
  auth: null,        // Auth 인스턴스
  user: null,        // 로그인한 사용자 (없으면 null)
  authMode: 'loading', // loading | ok | inapp | unavailable
  serverOk: false,   // 접수 서버 버전 확인 결과
  // 재시도 시 같은 요청으로 인식시키기 위한 정보 { sig, uid, data, clientRef, tries, unconfirmed }
  // unconfirmed: 서버가 접수했는지 모르는 상태. 이 동안은 같은 clientRef 로만 다시 보낸다.
  pending: null
};

const chat = {
  started: false,
  active: false,     // 사용자가 대화를 누르기 시작했는지 (자동 스크롤·포커스 기준)
  step: null,        // 지금 묻고 있는 항목 (STEPS 의 값, 'login', 'confirm', 'order', 'done')
  editing: false,    // 확인 카드에서 [수정]으로 들어온 경우
  busy: false,
  data: {},          // answers: 손님이 답한 값
  runId: 0           // 다시 시작했을 때 이전 대기 중 말풍선을 무시하기 위한 번호
};

function init() {
  renderStaticInfo();
  bindDialogs();
  $('logoutBtn').addEventListener('click', logout);
  $('chatReset').addEventListener('click', () => resetChat(true));
  state.authReady = setupAuth();
  initChat();
}

/* ============================================================
   로그인
   ============================================================ */

async function setupAuth() {
  if (isInAppBrowser()) {
    state.authMode = 'inapp';
    return;
  }

  const fbc = CFG.firebase || {};
  if (!fbc.apiKey || !fbc.authDomain || !fbc.projectId || !fbc.appId) {
    console.warn('[OWN STREET] config.js 의 firebase 값이 비어 있어 로그인을 시작할 수 없습니다.');
    state.authMode = 'unavailable';
    return;
  }

  try {
    const authMod = await import(FIREBASE_LIB_URL);
    const app = authMod.initializeApp({
      apiKey: fbc.apiKey, authDomain: fbc.authDomain, projectId: fbc.projectId, appId: fbc.appId
    });
    const auth = authMod.getAuth(app); // 기본값: 브라우저를 닫았다 열어도 로그인 유지
    auth.languageCode = 'ko';
    state.fb = authMod;
    state.auth = auth;
    state.authMode = 'ok';

    authMod.onAuthStateChanged(auth, (user) => {
      const wasUser = state.user;
      state.user = user || null;
      renderUser();
      if (wasUser && !state.user) clearSessionData(); // 로그아웃 시 개인정보 삭제
    }, (err) => {
      console.error('[OWN STREET] 로그인 상태 확인 오류', err);
      state.user = null;
      renderUser();
    });
  } catch (err) {
    console.error('[OWN STREET] Firebase 로드 실패', err);
    state.authMode = 'unavailable';
  }
}

/** 실제 Google 로그인. 결과: { ok: true } 또는 { ok: false, message } */
async function login() {
  await state.authReady; // 로그인 기능이 아직 불러와지는 중이면 기다림
  if (state.authMode !== 'ok') {
    return { ok: false, message: '지금은 로그인을 준비하고 있습니다.\n잠시 후 다시 시도해주세요.' };
  }
  try {
    const provider = new state.fb.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const cred = await state.fb.signInWithPopup(state.auth, provider);
    state.user = cred.user || state.auth.currentUser || state.user;
    renderUser();
    return { ok: true };
  } catch (err) {
    console.error('[OWN STREET] 로그인 오류', err && err.code, err);
    return { ok: false, message: loginErrorMessage(err && err.code) };
  }
}

async function logout() {
  if (state.authMode !== 'ok') return;
  const btn = $('logoutBtn');
  btn.disabled = true;
  try {
    await state.fb.signOut(state.auth);
    state.pending = null;
    clearSessionData();
  } catch (err) {
    console.error('[OWN STREET] 로그아웃 오류', err);
  } finally {
    btn.disabled = false;
  }
}

function loginErrorMessage(code) {
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'auth/user-cancelled':
      return '로그인이 취소됐습니다.\n다시 누르면 계정을 선택할 수 있습니다.';
    case 'auth/popup-blocked':
      return '로그인 창이 차단됐습니다.\n주소창 옆의 팝업 차단을 해제한 뒤 다시 눌러주세요.';
    case 'auth/network-request-failed':
      return '인터넷 연결을 확인한 뒤 다시 시도해주세요.';
    case 'auth/unauthorized-domain':
    case 'auth/operation-not-allowed':
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
    case 'auth/configuration-not-found':
    case 'auth/argument-error':
      return '로그인 설정이 아직 끝나지 않았습니다.\n잠시 후 다시 방문해주세요.';
    case 'auth/web-storage-unsupported':
    case 'auth/operation-not-supported-in-this-environment':
      return '이 브라우저에서는 로그인할 수 없습니다.\nChrome 또는 Safari에서 열어주세요.';
    case 'auth/too-many-requests':
      return '잠시 후 다시 시도해주세요.';
    default:
      return '로그인 중 문제가 생겼습니다.\n다시 시도해주세요.';
  }
}

function renderUser() {
  const u = state.user;
  if (u) {
    const name = u.displayName || (u.email ? u.email.split('@')[0] : '');
    $('userName').textContent = name;
    $('avatarInitial').textContent = (name || '?').trim().charAt(0).toUpperCase();
    const img = $('avatarImg');
    if (u.photoURL) {
      img.onload = () => { img.hidden = false; $('avatarInitial').hidden = true; };
      img.onerror = () => { img.hidden = true; $('avatarInitial').hidden = false; };
      img.src = u.photoURL;
    } else {
      img.hidden = true;
      $('avatarInitial').hidden = false;
    }
    $('userChip').hidden = false;
    $('topTag').hidden = true;
  } else {
    $('userChip').hidden = true;
    $('topTag').hidden = false;
  }
}

/** 진행 막대: idx(0 ~ STEPS.length) 를 받아 채움 비율만 넓게 보여준다.
 *  숫자(예: "3/8")는 쓰지 않는다 — 건너뛰기·되돌리기·수정이 있으면 숫자가 틀릴 수 있어서다. */
function setProgress(idx) {
  const bar = $('topProgress');
  const ratio = Math.max(0.04, Math.min(1, idx / STEPS.length)); // 시작부터 살짝 채워 "시작했다"는 것만 보여줌
  bar.style.setProperty('--progress', ratio);
  bar.setAttribute('aria-valuenow', Math.round(ratio * 100));
  bar.hidden = false;
}
function hideProgress() {
  $('topProgress').hidden = true;
}

/* 카카오톡·인스타그램 등 앱 안 브라우저: Google이 로그인을 막으므로 바깥 브라우저로 안내 */
function isInAppBrowser() {
  const ua = navigator.userAgent || '';
  return /KAKAOTALK|Instagram|FBAN|FBAV|FB_IAB|NAVER\(inapp|Line\/|DaumApps|everytimeApp|; wv\)/i.test(ua);
}

function inAppKind() {
  const ua = navigator.userAgent || '';
  if (/KAKAOTALK/i.test(ua)) return 'kakao';
  if (/Line\//i.test(ua)) return 'line';
  if (/Android/i.test(ua)) return 'android';
  return 'other'; // iOS 앱 안 브라우저: 자동으로 열 수 있는 방법이 없음
}

function openExternalBrowser() {
  const here = location.href;
  const kind = inAppKind();
  if (kind === 'kakao') location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(here);
  else if (kind === 'line') location.href = here + (here.includes('?') ? '&' : '?') + 'openExternalBrowser=1';
  else if (kind === 'android') location.href = `intent://${location.host}${location.pathname}${location.search}#Intent;scheme=https;package=com.android.chrome;end`;
}

/* ============================================================
   대화형 주문
   ============================================================ */

const QUESTIONS = {
  url: {
    label: '이미지 링크',
    ask: 'OWN STREET입니다.\n만들어 둔 이미지가 있는 채팅 링크를 보내주세요.\n공개 링크만 받을 수 있어요.',
    input: { type: 'text', inputmode: 'url', placeholder: 'https://...', maxlength: 2000, autocomplete: 'off', autocapitalize: 'off' },
    parse(raw) {
      const v = normalizeUrl(raw);
      return v ? { value: v } : { error: '링크 형식이 아닙니다.\nhttps:// 로 시작하는 주소를 붙여넣어 주세요.' };
    }
  },
  story: {
    label: '한 줄 이야기',
    ask: '이 이미지, 어떤 마음으로 만들었어요?\n한 줄로 적어주면 접수번호 받을 때 같이 보여드릴게요.\n건너뛰어도 괜찮아요.',
    input: { type: 'text', placeholder: '예) 처음으로 내가 정한 나의 색', maxlength: 200, autocomplete: 'off' },
    skip: '건너뛰기',
    parse(raw) {
      if (cleanText(raw, 1, 9999) === '') return { value: '' };
      const v = cleanText(raw, 1, 200);
      return v ? { value: v } : { error: '한 줄 이야기는 200자까지 입력할 수 있습니다.' };
    }
  },
  size: {
    label: '사이즈',
    ask: '사이즈를 골라주세요.',
    parse(raw) {
      return SIZES.includes(raw) ? { value: raw } : { error: '버튼에서 사이즈를 골라주세요.' };
    }
  },
  name: {
    // label 은 확인 카드(.order-row dt)의 76px 라벨 칸에도 그대로 쓰인다. "신청자명(입금자명)"
    // 전체 문구는 그 칸 폭에서 2줄로 줄바꿈되어 다른 행(1줄)과 높이가 달라지고 baseline 정렬이
    // 어긋나 보였다(2026-10-27 designer, Playwright 로 boundingBox·클라이언트 rect 수 2 확인).
    // "(입금자명)" 의미는 질문 문구(ask)와 개인정보 동의 안내(consent-info)에 그대로 남아 있으므로
    // 좁은 라벨 칸에서만 축약한다.
    label: '신청자명',
    ask: '신청자명(입금자명)을 알려주세요.\n받는 분이 다르면 마지막 배송 요청에 적어주세요.',
    input: { type: 'text', placeholder: '홍길동', maxlength: 40, autocomplete: 'name' },
    parse(raw) {
      const v = cleanName(raw);
      return v ? { value: v } : { error: '신청자명을 다시 확인해주세요.\n40자까지 입력할 수 있습니다.' };
    }
  },
  phone: {
    label: '연락처',
    ask: '연락처를 알려주세요.',
    input: { type: 'tel', inputmode: 'numeric', placeholder: '010-0000-0000', maxlength: 13, autocomplete: 'tel', phone: true },
    parse(raw) {
      const v = normalizePhone(raw);
      return v ? { value: v } : { error: '번호를 다시 확인해주세요.\n예) 010-1234-5678' };
    }
  },
  address: {
    label: '배송 주소',
    ask: '배송 주소를 알려주세요.\n상세 주소까지 적어주세요.',
    input: { type: 'text', placeholder: '도로명 주소 + 동·호수', maxlength: 200, autocomplete: 'street-address' },
    parse(raw) {
      const v = cleanText(raw, 5, 200);
      return v ? { value: v } : { error: '주소를 조금 더 자세히 적어주세요.' };
    }
  },
  memo: {
    label: '배송 요청',
    ask: '배송 요청사항이 있으면 적어주세요.',
    input: { type: 'text', placeholder: '예) 부재 시 문 앞에 두세요', maxlength: 300, autocomplete: 'off' },
    skip: '없음',
    parse(raw) {
      if (cleanText(raw, 1, 9999) === '') return { value: '' };
      const v = cleanText(raw, 1, 300);
      return v ? { value: v } : { error: '배송 요청은 300자까지 입력할 수 있습니다.' };
    }
  }
};

function priceLine() {
  const parts = [PAY.productName || 'STANDARD', '뒷면 프린트'];
  if (PAY.price) parts.push(formatWon(PAY.price));
  return parts.join(' · ');
}

function initChat() {
  if (state.authMode === 'inapp') {
    botNow('앱 안 브라우저에서는 주문할 수 없습니다.\nChrome이나 Safari에서 열어주세요.', 'warn');
    const choices = [];
    if (inAppKind() !== 'other') choices.push({ label: '브라우저로 열기', primary: true, onPick: openExternalBrowser });
    else botNow('화면의 ··· 또는 공유 버튼을 누르고 "Safari로 열기"를 선택해주세요.\n또는 주소를 복사해 Safari에 붙여넣어 주세요.');
    choices.push({
      label: '주소 복사',
      onPick: async (btn) => { btn.textContent = (await copyText(location.href)) ? '복사됨' : '복사 실패'; }
    });
    setChoices(choices);
    return;
  }
  if (state.authMode === 'unavailable') {
    botNow('지금은 주문을 준비하고 있습니다.\n잠시 후 다시 방문해주세요.', 'warn');
    setComposerNone();
    return;
  }

  greet();
  const draft = loadDraft();
  if (draft) resume(draft);
  else setChoices([{ label: '주문 시작', primary: true, id: 'chatStart', onPick: () => beginOrder() }]);
}

function greet() {
  botNow(priceLine() + '\n배송비 포함');
}

async function beginOrder() {
  if (chat.started) return;
  chat.started = true;
  chat.active = true;
  $('chatReset').hidden = false;
  meSay('주문 시작');
  await askStep(STEPS[0]);
}

/** 저장해둔 대화를 다시 그려서 이어가기 (개인정보가 담길 수 있으므로 sessionStorage 에서만 읽는다) */
function resume(draft) {
  chat.started = true;
  // beginOrder()/answer() 와 마찬가지로 "사용자가 실제로 채팅에 참여 중"으로 표시한다.
  // 이 값이 없으면 keepInView() 가 매번 조용히 멈춰서, 재생된 마지막 메시지(로그인 안내 등)가
  // 화면 아래 sticky 입력창(로그인 버튼 포함)에 가려진 채로 방치된다(실제로 재현·확인함).
  chat.active = true;
  chat.data = draft.data;
  $('chatReset').hidden = false;
  meSay('주문 시작');
  let next = null;
  for (const step of STEPS) {
    if (!(step in chat.data)) { next = step; break; }
    botNow(QUESTIONS[step].ask);
    meSay(displayValue(step, chat.data[step]));
  }
  botNow('이어서 진행합니다.');
  if (next) {
    // 이름 질문부터는 로그인이 필요하다 (이어하기에서도 같은 문 앞을 지킨다)
    const needsLogin = STEPS.indexOf(next) >= STEPS.indexOf('name') && !state.user;
    if (needsLogin) askLogin(); else askStep(next, true);
  } else {
    showConfirm(true);
  }
}

async function askStep(step, instant) {
  chat.step = step;
  setProgress(STEPS.indexOf(step));
  const q = QUESTIONS[step];
  if (instant) botNow(q.ask); else await botSay(q.ask);
  if (chat.step !== step) return;

  if (step === 'size') {
    const choices = SIZES.map((s) => ({ label: s, size: true, onPick: () => answer('size', s) }));
    choices.push({ label: '사이즈표 보기', ghost: true, keep: true, onPick: () => $('sizeDialog').showModal() });
    setChoices(choices);
  } else {
    setTextInput(q, (raw) => answer(step, raw));
  }
}

async function answer(step, raw) {
  if (chat.busy || chat.step !== step) return;
  const q = QUESTIONS[step];
  const text = String(raw == null ? '' : raw);
  if (!q.skip && text.trim() === '') { focusComposer(); return; }

  const res = q.parse(text);
  chat.active = true;
  if (res.error) {
    if (text.trim()) meSay(text.trim().slice(0, 200));
    await botSay(res.error, 'warn');
    focusComposer();
    return;
  }

  chat.data[step] = res.value;
  saveDraft();
  meSay(displayValue(step, res.value));
  chat.step = null;
  setComposerNone();

  if (chat.editing) { chat.editing = false; await showConfirm(); return; }
  const idx = STEPS.indexOf(step);
  const next = STEPS[idx + 1];
  if (next) {
    // 이름 질문 앞에서 로그인 확인 (개인정보 단계에 들어가기 전)
    // LAB 미리보기에서는 이미 로그인된 사람이어도 이름(개인정보) 질문 전에 멈춘다
    if (next === 'name' && (CFG.labPreview || !state.user)) { await askLogin(); return; }
    await askStep(next);
  } else {
    await showConfirm();
  }
}

/** 이름 질문 앞에서 Google 로그인 (접수에 꼭 필요해지는 시점에 둔다) */
async function askLogin() {
  chat.step = 'login';
  setProgress(STEPS.indexOf('name'));
  await botSay('이제부터는 신청자명·연락처·주소를 여쭤봅니다.\n접수 확인을 위해 Google 로그인이 필요합니다.');
  if (chat.step !== 'login') return;
  showLoginChoice(() => askStep('name'));
}

function showLoginChoice(onDone) {
  // LAB 미리보기 빌드(LAB 접수 서버가 아직 없을 때)에서만 켜진다. LIVE 에서는 이 값이 없다.
  if (CFG.labPreview) {
    botNow('LAB 미리보기는 여기까지예요.\n로그인부터 접수까지는 실제 서비스에서 할 수 있어요.');
    setChoices([{ label: '실제 서비스로 가기', primary: true, href: 'https://ownstreet.life' }]);
    return;
  }
  setChoices([{
    label: 'Google로 로그인', google: true, id: 'chatLogin',
    onPick: async () => {
      if (chat.busy) return;
      chat.busy = true;
      setComposerNone();
      const r = await login();
      chat.busy = false;
      if (!r.ok) {
        await botSay(r.message, 'warn');
        showLoginChoice(onDone);
        return;
      }
      await botSay((state.user && state.user.email ? state.user.email + '\n' : '') + '로그인됐습니다.');
      onDone();
    }
  }]);
}

function displayValue(step, value) {
  if ((step === 'memo' || step === 'story') && !value) return '건너뛰기';
  return value;
}

/* ---------- 주문 확인 카드 ---------- */

async function showConfirm(instant) {
  chat.step = 'confirm';
  setProgress(STEPS.length - 0.5); // 마지막 질문 뒤, 접수 전 — 거의 다 왔다는 정도만 보여준다
  retireCards();
  if (instant) botNow('주문 내용을 확인해주세요.'); else await botSay('주문 내용을 확인해주세요.');

  const card = el('div', 'card order-card');
  card.dataset.card = 'confirm';
  const dl = el('dl', 'order-list');
  STEPS.forEach((step) => {
    const row = el('div', 'order-row');
    row.append(el('dt', 'order-label-ko', QUESTIONS[step].label));
    const dd = el('dd', step === 'url' ? 'order-val is-url' : 'order-val', displayValue(step, chat.data[step]));
    const edit = el('button', 'link order-edit', '수정');
    edit.type = 'button';
    edit.dataset.edit = step;
    edit.setAttribute('aria-label', QUESTIONS[step].label + ' 수정');
    edit.addEventListener('click', () => editStep(step));
    row.append(dd, edit);
    dl.append(row);
  });
  card.append(dl);

  const total = el('div', 'order-total');
  total.append(el('span', 'order-total-name', priceLine().replace(/ · [^·]*원$/, '')));
  total.append(el('span', 'font-display order-total-price', PAY.price ? formatWon(PAY.price) : ''));
  card.append(total, el('p', 'order-note', '배송비 포함 · 접수 후 카카오페이로 결제'));

  const consentWrap = el('div', 'consent');
  const label = el('label', 'check');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.id = 'consent';
  label.append(cb, el('span', 'box'), el('span', '', '개인정보 수집 및 이용에 동의합니다.'));
  label.querySelector('.box').setAttribute('aria-hidden', 'true');
  const info = el('p', 'consent-info', '수집: 신청자명(입금자명), 전화번호, 배송 주소, 이미지 URL, Google 이메일 · 목적: 제작 요청 확인, 연락, 배송 ');
  const more = el('button', 'link', '자세히 보기');
  more.type = 'button';
  more.addEventListener('click', () => $('privacyDialog').showModal());
  info.append(more);
  const consentErr = el('span', 'err');
  consentErr.id = 'consentErr';
  consentErr.hidden = true;
  consentWrap.append(label, info, consentErr);
  card.append(consentWrap);

  const order = el('button', 'btn-request btn-request-ko', '주문하기');
  order.type = 'button';
  order.id = 'orderBtn';
  order.addEventListener('click', () => {
    if (!cb.checked) {
      consentErr.textContent = '개인정보 수집 및 이용에 동의해주세요.';
      consentErr.hidden = false;
      return;
    }
    consentErr.hidden = true;
    placeOrder();
  });
  cb.addEventListener('change', () => { consentErr.hidden = true; });
  card.append(order);

  appendMsg('bot', card, 'wide');
  setComposerNone();
}

/** 예전 확인 카드는 더 누를 수 없게 */
function retireCards() {
  document.querySelectorAll('[data-card="confirm"]').forEach((c) => {
    c.dataset.card = 'old';
    c.classList.add('is-old');
    c.querySelectorAll('button, input').forEach((b) => { b.disabled = true; });
    c.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
  });
}

async function editStep(step) {
  if (chat.busy) return;
  chat.active = true;
  chat.editing = true;
  retireCards();
  meSay(QUESTIONS[step].label + ' 수정');
  await askStep(step);
}

/* ---------- 주문 접수 ---------- */

async function placeOrder() {
  if (chat.busy) return;
  chat.active = true;
  chat.step = 'order';
  retireCards();
  meSay('주문하기');

  if (!state.user) {
    await botSay('주문 확인을 위해 Google 로그인이 필요합니다.');
    showLoginChoice(() => submitOrder());
    return;
  }
  await submitOrder();
}

async function submitOrder() {
  if (chat.busy) return;
  const sig = JSON.stringify([state.user.uid, chat.data.url, chat.data.story, chat.data.size,
    chat.data.name, chat.data.phone, chat.data.address, chat.data.memo]);
  // 접수 여부를 모르는 이전 요청이 있고 내용이 바뀌었다면, 새로 보내기 전에 이전 요청부터 확인한다
  // (이전 요청이 이미 저장됐을 수 있는데 새 clientRef 로 또 보내면 두 번 접수된다)
  if (state.pending && state.pending.sig !== sig) {
    if (!(await settleOldPending())) return;
  }
  if (!state.pending || state.pending.sig !== sig) {
    state.pending = { sig, uid: state.user.uid, data: { ...chat.data }, clientRef: newClientRef(), tries: 0, unconfirmed: false };
  }
  await runSubmit(state.pending);
}

/** 접수 여부를 모르는 채로 끊겼던 요청을, 보냈던 그대로(같은 clientRef) 다시 확인한다 */
async function recheckPending() {
  if (chat.busy || !state.pending || !state.user || state.pending.uid !== state.user.uid) return;
  await runSubmit(state.pending, true);
}

/** 이전 요청을 확인한다. 새 요청을 보내도 되면 true */
async function settleOldPending() {
  const old = state.pending;
  // 확인할 수 없거나(다른 계정) 접수 여부를 모르는 상태가 아니면 이전 요청은 버린다
  if (!old.unconfirmed || old.uid !== state.user.uid) { state.pending = null; return true; }
  chat.busy = true;
  const status = botNow('고치기 전에 보냈던 요청을 먼저 확인하고 있어요. 화면을 닫지 마세요.', 'status');
  const r = await attemptRequest(old, 'old-check-slow');
  chat.busy = false;
  status.remove();
  if (isReceipt(r)) {
    state.pending = null;
    clearDraft();
    chat.step = 'done';
    showComplete(r.request_id, '고치기 전에 보냈던 요청이 이미 접수되어 있었습니다. 새로 접수하지 않았습니다.');
    return false;
  }
  if (r && NOT_SAVED_CODES.includes(r.code)) { state.pending = null; return true; }
  await botSay(UNKNOWN_TEXT, 'warn');
  setChoices(unknownChoices());
  return false;
}

async function runSubmit(pending, isRecheck) {
  chat.busy = true;
  setComposerNone();
  const run = chat.runId;
  const status = botNow(isRecheck ? CHECK_TEXT : '접수 중입니다…', 'status');

  let result;
  if (isRecheck) {
    result = await attemptRequest(pending, 'recheck-slow');
  } else {
    result = await ensureServer();
    if (result.ok) result = await attemptRequest(pending, 'slow');
  }

  if (isNoAnswer(result)) {
    // 답이 없다 = 접수됐는지 모른다. 바로 "실패"라고 하지 않고, 같은 clientRef 로 한 번 더 확인한다.
    pending.unconfirmed = true;
    if (run === chat.runId) status.remove();
    const status2 = run === chat.runId ? botNow(CHECK_TEXT, 'status') : null;
    await sleep(RECHECK_DELAY_MS);
    result = await attemptRequest(pending, 'recheck-slow');
    chat.busy = false;
    if (status2) status2.remove();
    if (run !== chat.runId) return; // 그동안 새 대화가 시작됐으면 화면은 더 바꾸지 않는다 (pending 추적은 계속된다)
    await handleResult(result || {});
    return;
  }

  chat.busy = false;
  if (run !== chat.runId) return;
  status.remove();
  await handleResult(result || {});
}

/** 접수 서버가 대화형 주문(사이즈·주소 저장)을 지원하는지 확인 */
async function ensureServer() {
  if (state.serverOk) return { ok: true };
  if (!CFG.requestEndpoint) return { ok: false, code: 'NO_ENDPOINT' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(CFG.requestEndpoint, { method: 'GET', redirect: 'follow', cache: 'no-store', signal: ctrl.signal });
    if (!res.ok) return { ok: false, code: 'HTTP_' + res.status };
    let info;
    try { info = JSON.parse(await res.text()); } catch { return { ok: false, code: 'BAD_RESPONSE' }; }
    if (info && info.ready === true && Number(info.version) >= REQUIRED_SERVER_VERSION) {
      state.serverOk = true;
      return { ok: true };
    }
    console.warn('[OWN STREET] 접수 서버(Apps Script)를 새 버전으로 배포해야 합니다. 현재 버전:', info && info.version);
    return { ok: false, code: 'NOT_READY' };
  } catch (err) {
    return { ok: false, code: err && err.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 서버에 한 번 보낸다 (로그인 토큰이 만료됐으면 새로 받아 한 번 더). 걸린 시간과 결과 코드를 콘솔에 남긴다.
 * 콘솔에는 이름·전화번호·이메일·토큰·입력 주소를 남기지 않는다. 시도 횟수, 걸린 시간, 결과 코드만.
 */
async function attemptRequest(pending, slowKind) {
  pending.tries += 1;
  const t0 = Date.now();
  const slowText = slowKind === 'recheck-slow' ? CHECK_SLOW_TEXT
    : slowKind === 'old-check-slow' ? OLD_CHECK_SLOW_TEXT
    : SLOW_TEXT;
  let slowEl = null;
  const slow = setTimeout(() => { slowEl = botNow(slowText, 'status'); }, SLOW_NOTICE_MS);
  let r;
  try {
    r = await postRequest(pending, false);
    if (r && r.code === 'AUTH_INVALID') {
      // 로그인 토큰을 새로 받아 한 번 더 시도 (같은 clientRef)
      r = await postRequest(pending, true);
    }
  } finally {
    clearTimeout(slow);
    if (slowEl) slowEl.remove();
  }
  if (!r || typeof r !== 'object') r = { ok: false, code: 'BAD_RESPONSE' };
  console.info('[OWN STREET] 접수 요청 ' + pending.tries + '번째 · ' + (Date.now() - t0) + 'ms · '
    + (isReceipt(r) ? 'ok ' + r.request_id + (r.duplicate ? ' (이미 저장된 요청)' : '') : (r.code || 'UNKNOWN')));
  return r;
}

/** 서버가 접수번호를 돌려준 경우만 true. 이 조건을 느슨하게 만들지 않는다. */
function isReceipt(r) {
  return !!r && r.ok === true && RECEIPT_PATTERN.test(String(r.request_id || '')) && Number(r.v || 0) >= REQUIRED_SERVER_VERSION;
}

/** 서버의 분명한 답이 아니라 "답이 없음"인 경우: 시간 초과, 연결 끊김, 해석할 수 없는 응답, HTTP 오류 */
function isNoAnswer(r) {
  const c = r && r.code;
  return c === 'TIMEOUT' || c === 'NETWORK' || c === 'BAD_RESPONSE' || (typeof c === 'string' && c.indexOf('HTTP_') === 0);
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function postRequest(pending, forceRefresh) {
  if (!CFG.requestEndpoint) return { ok: false, code: 'NO_ENDPOINT' };
  let idToken;
  try {
    idToken = await state.user.getIdToken(forceRefresh);
  } catch (err) {
    console.error('[OWN STREET] 로그인 토큰 오류', err);
    return { ok: false, code: 'TOKEN_ERROR' };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(CFG.requestEndpoint, {
      method: 'POST',
      // text/plain: Apps Script가 응답을 브라우저에 그대로 돌려줄 수 있는 방식
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'request',
        v: REQUIRED_SERVER_VERSION,
        idToken,
        name: pending.data.name,
        phone: pending.data.phone,
        url: pending.data.url,
        size: pending.data.size,
        address: pending.data.address,
        memo: pending.data.memo || '',
        story: pending.data.story || '',
        consent: true,
        clientRef: pending.clientRef
      }),
      redirect: 'follow',
      cache: 'no-store',
      signal: ctrl.signal
    });
    if (!res.ok) return { ok: false, code: 'HTTP_' + res.status };
    const text = await res.text();
    try { return JSON.parse(text); } catch { return { ok: false, code: 'BAD_RESPONSE' }; }
  } catch (err) {
    return { ok: false, code: err && err.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK' };
  } finally {
    clearTimeout(timer);
  }
}

async function handleResult(r) {
  // 스프레드시트 저장이 확인된 경우에만 완료
  if (isReceipt(r)) {
    state.pending = null;
    clearDraft();
    chat.step = 'done';
    showComplete(r.request_id);
    return;
  }

  console.warn('[OWN STREET] 접수 실패 코드:', r.code || 'UNKNOWN');

  // 서버의 분명한 답이 "저장 안 됨"이 아니면 접수됐을 수도 있다. 같은 clientRef 로만 다시 보내도록 표시해 둔다.
  if (state.pending && !NOT_SAVED_CODES.includes(r.code)) state.pending.unconfirmed = true;

  // 답이 없었다(여기까지 왔다면 재확인도 끝난 것) = 접수됐는지 모른다. "실패"라고 하지 않는다.
  if (isNoAnswer(r)) {
    await botSay(UNKNOWN_TEXT, 'warn');
    setChoices(unknownChoices());
    return;
  }

  if (r.code === 'INVALID_INPUT' && Array.isArray(r.fields)) {
    const field = r.fields.find((f) => STEPS.includes(f));
    if (field) {
      await botSay("'" + QUESTIONS[field].label + "' 항목을 다시 확인해주세요.", 'warn');
      chat.editing = true;
      await askStep(field);
      return;
    }
  }

  if (r.code === 'AUTH_INVALID' || r.code === 'TOKEN_ERROR') {
    await botSay('로그인 정보를 확인하지 못했습니다.\n다시 로그인해주세요.', 'warn');
    showLoginChoice(() => submitOrder());
    return;
  }

  let msg = '접수에 실패했습니다.\n잠시 후 다시 시도해주세요.';
  if (r.code === 'NOT_READY' || r.code === 'NO_ENDPOINT' || r.code === 'NOT_CONFIGURED' || r.code === 'VERSION_MISMATCH') {
    msg = '지금은 주문을 준비하고 있습니다.\n잠시 후 다시 시도해주세요.';
  }
  await botSay(msg, 'warn');
  const choices = [
    { label: '다시 시도', primary: true, id: 'retryBtn', onPick: () => { meSay('다시 시도'); submitOrder(); } },
    { label: '내용 수정', onPick: () => { meSay('내용 수정'); showConfirm(); } }
  ];
  if (contactUrl()) choices.push({ label: '카톡 문의', href: contactUrl() });
  setChoices(choices);
}

/** 접수됐는지 확인하지 못했을 때의 선택지: 같은 clientRef 로만 다시 확인한다 (새로 보내지 않는다) */
function unknownChoices() {
  const choices = [{ label: '다시 확인', primary: true, id: 'retryBtn', onPick: () => { meSay('다시 확인'); recheckPending(); } }];
  if (contactUrl()) choices.push({ label: '카톡 문의', href: contactUrl() });
  return choices;
}

/* ---------- 티셔츠 뒷면 목업 ----------
   손님이 보내는 것은 "이미지가 있는 채팅 링크"라 실제 이미지 파일 주소가 아니다. 그래서 여기서
   손님 이미지를 직접 끌어와 보여주지 않는다(신뢰할 수 없는 외부 주소를 그대로 <img> 에 걸지 않는다).
   대신 뒷면 어디에, 어떤 크기로 프린트되는지 자리만 짚어주는 정적 SVG 목업을 둔다. */
function buildMockupCard(size) {
  const wrap = el('div', 'card mockup-card');
  const kicker = el('div', 'modal-kicker');
  kicker.append(el('span', 'dot'), el('span', 'font-display', 'BACK PRINT'));
  wrap.append(kicker);
  const img = document.createElement('img');
  img.className = 'mockup-img';
  img.src = './assets/tee-back-mockup.svg';
  img.alt = '티셔츠 뒷면 목업 — 점선 안쪽이 실제 프린트 위치(뒷면 단일, 최대 A3)';
  img.width = 120; img.height = 130;
  wrap.append(img);
  const note = el('p', 'mockup-note',
    (size ? size + ' 사이즈 · ' : '') + '뒷면 단일 프린트 · 최대 A3 사이즈');
  wrap.append(note);
  return wrap;
}

/* ---------- 접수 완료 + 결제 안내 ---------- */

function showComplete(id, extraNote) {
  hideProgress(); // 접수 완료 — 더는 "진행 중"이 아니므로 막대를 치운다
  const done = el('div', 'card done-card');
  const kicker = el('div', 'modal-kicker');
  kicker.append(el('span', 'dot'), el('span', 'font-display', 'REQUEST COMPLETE'));
  const no = el('p', 'font-display receipt', id);
  no.id = 'receiptNo';
  done.append(kicker, el('p', 'done-title', '접수됐습니다.'), el('p', 'modal-sub', '접수번호'), no,
    el('p', 'done-text', '확인 후 연락드리겠습니다.'));
  if (chat.data.story) {
    done.append(el('p', 'done-story-label', '당신의 스트릿'));
    done.append(el('p', 'done-story', '"' + chat.data.story + '"'));
  }
  appendMsg('bot', done, 'wide');

  appendMsg('bot', buildMockupCard(chat.data.size), 'wide');

  const link = String(PAY.kakaopayLink || '').trim();
  if (PAY.price && /^https:\/\//.test(link)) {
    const pay = el('div', 'card pay-card');
    pay.id = 'payBox';
    const head = el('div', 'pay-head');
    head.append(el('span', 'modal-sub', '결제 금액'));
    const amount = el('span', 'font-display pay-amount', formatWon(PAY.price));
    amount.id = 'payAmount';
    head.append(amount);
    const guide = el('p', 'pay-guide');
    guide.append('배송비 포함입니다.', document.createElement('br'), '송금 메시지에 접수번호 ');
    const ref = el('strong', '', id);
    ref.id = 'payRef';
    guide.append(ref, '를 적어주세요.');
    const btn = el('a', 'btn-kakaopay', '카카오페이로 결제하기');
    btn.id = 'payLink';
    btn.href = link;
    btn.target = '_blank';
    btn.rel = 'noopener';
    pay.append(head, guide, btn);
    if (PAY.kakaopayQr) {
      const qr = document.createElement('img');
      qr.className = 'pay-qr';
      qr.id = 'payQr';
      qr.alt = '카카오페이 결제 QR 코드';
      qr.width = 148; qr.height = 148;
      qr.src = PAY.kakaopayQr;
      pay.append(qr, el('p', 'pay-qr-note', 'PC에서는 휴대폰 카메라로 QR을 찍어주세요.'));
    }
    appendMsg('bot', pay, 'wide');
  }

  if (extraNote) botNow(extraNote);

  const choices = [{
    label: '접수번호 복사', id: 'copyBtn', keep: true,
    onPick: async (btn) => {
      const ok = await copyText(id);
      btn.textContent = ok ? '복사됨' : '복사 실패';
      if (!ok) botNow('복사하지 못했습니다.\n접수번호를 길게 눌러 복사해주세요.', 'warn');
    }
  }];
  if (contactUrl()) choices.push({ label: '카톡 문의', href: contactUrl() });
  choices.push({ label: '새 주문', id: 'newOrderBtn', onPick: () => resetChat(true) });
  setChoices(choices);
  $('chatReset').hidden = true;
}

function resetChat(autoStart) {
  chat.runId++;
  chat.started = false;
  chat.step = null;
  chat.editing = false;
  chat.busy = false;
  chat.data = {};
  state.pending = null;
  clearDraft();
  $('chatLog').textContent = '';
  $('chatReset').hidden = true;
  hideProgress();
  greet();
  if (autoStart) { chat.active = true; beginOrder(); }
  else setChoices([{ label: '주문 시작', primary: true, id: 'chatStart', onPick: () => beginOrder() }]);
}

/* ---------- 말풍선 ---------- */

function appendMsg(who, content, extra) {
  const li = el('li', 'msg ' + who + (extra ? ' ' + extra : ''));
  const log = $('chatLog');
  const prev = log.lastElementChild;
  if (who === 'bot' && !(prev && prev.classList.contains('bot'))) {
    li.append(el('span', 'font-display msg-who', 'OWN STREET'));
  }
  if (typeof content === 'string') li.append(el('p', 'bubble', content));
  else li.append(content);
  log.append(li);
  keepInView();
  return li;
}

function botNow(text, kind) { return appendMsg('bot', text, kind); }

/** 살짝 간격을 두고 말하기 (움직임 줄이기 설정이면 바로) */
async function botSay(text, kind) {
  const run = chat.runId;
  if (chat.active && !prefersReducedMotion()) await sleep(260);
  if (run !== chat.runId) return null;
  return botNow(text, kind);
}

function meSay(text) { return appendMsg('me', text); }

function keepInView() {
  if (!chat.active) return;
  requestAnimationFrame(() => {
    // #chatInput 은 position: sticky 라서 뷰포트 안에 "항상 보이는" 요소로 취급되어
    // scrollIntoView 를 걸어도 브라우저가 스크롤을 생략해버린다(실기기 확인 결과 재현됨).
    // 대신 채팅 로그의 가장 최근 말풍선을 타겟으로 스크롤해서 새 메시지가 입력창과
    // 겹치지 않고 눈에 보이게 한다.
    const last = $('chatLog').lastElementChild;
    if (last) last.scrollIntoView({ block: 'end', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  });
}

/* ---------- 입력 영역 (text / chips / login / confirm) ---------- */

function setComposerNone() { $('chatInput').textContent = ''; }

function setTextInput(q, onSubmit) {
  const box = $('chatInput');
  box.textContent = '';
  const form = el('form', 'composer');
  form.noValidate = true;
  const input = document.createElement('input');
  input.className = 'own-input';
  input.id = 'chatText';
  input.setAttribute('aria-label', q.label);
  const cfg = q.input || {};
  input.type = cfg.type || 'text';
  if (cfg.inputmode) input.inputMode = cfg.inputmode;
  if (cfg.placeholder) input.placeholder = cfg.placeholder;
  if (cfg.maxlength) input.maxLength = cfg.maxlength;
  if (cfg.autocomplete) input.autocomplete = cfg.autocomplete;
  if (cfg.autocapitalize) input.setAttribute('autocapitalize', cfg.autocapitalize);
  input.setAttribute('autocorrect', 'off');
  input.spellcheck = false;
  if (cfg.phone) {
    input.addEventListener('input', () => {
      if (input.selectionStart === input.value.length) input.value = formatPhoneTyping(input.value);
    });
  }
  // 한글 IME 조합 중 Enter 로 전송되지 않게 한다 (isComposing 확인)
  let composing = false;
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (composing || e.isComposing)) e.preventDefault();
  });
  const send = el('button', 'send font-display', '보내기');
  send.type = 'submit';
  send.id = 'chatSend';
  form.append(input, send);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (composing) return; // 조합 중 제출 막기
    onSubmit(input.value);
  });
  box.append(form);

  if (q.skip) {
    const row = el('div', 'choices');
    const skip = el('button', 'choice', q.skip);
    skip.type = 'button';
    skip.id = 'chatSkip';
    skip.addEventListener('click', () => onSubmit(''));
    row.append(skip);
    box.append(row);
  }
  keepInView();
  focusComposer();
}

function setChoices(list) {
  const box = $('chatInput');
  box.textContent = '';
  const row = el('div', 'choices');
  list.forEach((c) => {
    let b;
    if (c.href) {
      b = el('a', 'choice', c.label);
      b.href = c.href; b.target = '_blank'; b.rel = 'noopener';
    } else {
      b = el('button', 'choice', '');
      b.type = 'button';
      if (c.google) b.insertAdjacentHTML('afterbegin', GOOGLE_ICON);
      b.append(c.label);
      b.addEventListener('click', () => c.onPick && c.onPick(b));
    }
    if (c.primary) b.classList.add('is-primary');
    if (c.google) b.classList.add('is-google');
    if (c.ghost) b.classList.add('is-ghost');
    if (c.size) { b.classList.add('is-size', 'font-display'); b.dataset.size = c.label; }
    if (c.id) b.id = c.id;
    row.append(b);
  });
  box.append(row);
  keepInView();
}

function focusComposer() {
  if (!chat.active) return;
  // 키보드가 올라오면 마지막 질문이 가려질 수 있으므로, 포커스 뒤 다시 한 번 아래로 맞춘다 (visualViewport 대응)
  const input = $('chatText');
  if (!input) return;
  setTimeout(() => {
    input.focus({ preventScroll: true });
    keepInView();
  }, 60);
  if (window.visualViewport) {
    const onResize = () => { keepInView(); };
    window.visualViewport.addEventListener('resize', onResize, { once: true });
  }
}

const GOOGLE_ICON = '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.17-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.97 10.71A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.17.29-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3.01-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.93 11.43 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/></svg>';

/* ---------- 작성 중인 주문 임시 저장 (같은 탭에서 새로고침해도 이어하기) ----------
   개인정보(이름·전화번호·주소 등 손님이 입력한 값)가 담길 수 있으므로 sessionStorage 에만 둔다.
   localStorage 에는 절대 두지 않는다. 탭을 닫으면 사라지고, 로그아웃 시에도 지운다. */

function saveDraft() {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ data: chat.data, at: Date.now() })); } catch (e) { /* 저장 불가 환경은 무시 */ }
}
function clearDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY); } catch (e) { /* 무시 */ }
}
function loadDraft() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null');
    if (!raw || typeof raw.data !== 'object' || !raw.data) return null;
    // 저장된 값을 다시 검사해서, 앞에서부터 올바른 항목까지만 사용
    const data = {};
    for (const step of STEPS) {
      if (!(step in raw.data)) break;
      const res = QUESTIONS[step].parse(String(raw.data[step]));
      if (res.error) break;
      data[step] = res.value;
    }
    return Object.keys(data).length ? { data } : null;
  } catch (e) {
    return null;
  }
}
/** 로그아웃 때 개인정보를 모두 지운다 (ROADMAP 3번: 개인정보 답은 sessionStorage 에만, 로그아웃 때 지운다) */
function clearSessionData() {
  clearDraft();
  state.pending = null;
}

/* ============================================================
   공통 도구
   ============================================================ */

function contactUrl() {
  const u = String(CFG.contactUrl || '').trim();
  return /^https:\/\//.test(u) ? u : '';
}

function formatWon(n) {
  return Number(n).toLocaleString('ko-KR') + '원';
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) { /* 아래 방법으로 재시도 */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) {
    return false;
  }
}

/* ---------- 입력값 정리 (서버와 같은 규칙) ---------- */

function cleanName(v) {
  const s = String(v || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  return s.length >= 1 && s.length <= 40 ? s : '';
}

function cleanText(v, min, max) {
  const s = String(v || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length >= min && s.length <= max ? s : '';
}

function formatPhoneTyping(v) {
  const d = String(v).replace(/\D/g, '').slice(0, 11);
  if (d.startsWith('02')) {
    if (d.length <= 2) return d;
    if (d.length <= 5) return `02-${d.slice(2)}`;
    if (d.length <= 9) return `02-${d.slice(2, 5)}-${d.slice(5)}`;
    return `02-${d.slice(2, 6)}-${d.slice(6, 10)}`;
  }
  if (d.startsWith('010')) {
    if (d.length <= 3) return d;
    if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  }
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

// 서버(Apps Script)와 같은 규칙
function normalizePhone(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (/^02\d{7,8}$/.test(d)) {
    return d.length === 9 ? `02-${d.slice(2, 5)}-${d.slice(5)}` : `02-${d.slice(2, 6)}-${d.slice(6)}`;
  }
  if (/^0[1-9]\d{8,9}$/.test(d)) {
    return d.length === 10
      ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
      : `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  }
  return '';
}

function normalizeUrl(v) {
  let s = String(v || '').trim();
  if (!s) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s) && /^[^\s]+\.[^\s]+$/.test(s)) s = 'https://' + s;
  if (s.length > 2000 || !URL_PATTERN.test(s)) return '';
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
  } catch {
    return '';
  }
  return s;
}

function newClientRef() {
  if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/* ---------- 안내 콘텐츠 ---------- */

function renderStaticInfo() {
  const st = CFG.sizeTable || { columns: [], rows: {} };
  const missing = buildSizeTable($('sizeTable'), st);
  buildSizeTable($('sizeTableDialog'), st);
  const note = missing
    ? '단위 cm · 상세 수치는 준비 중입니다.'
    : (String(st.note || '').trim() || '단위 cm');
  $('sizeNote').textContent = note;
  $('sizeNoteDialog').textContent = note;

  // SIZE 칩
  SIZES.forEach((size) => $('sizeChips').appendChild(cell('span', size)));

  // QUALITY / CARE / CUSTOM GUIDE / COPYRIGHT·NOTICE / TERMS
  fillList('qualityList', CFG.quality);
  fillList('careList', CFG.care);
  fillList('guideList', CFG.guide);
  fillList('noticeList', CFG.notice);
  fillList('termsList', ['REQUEST는 제작 요청 접수이며, 확인 후 제작 가능 여부를 연락드립니다.'].concat(CFG.notice || []));

  $('retentionText').textContent = String(CFG.privacyRetention || '').trim() || '[보유 기간 입력 필요]';

  // CONTACT → 카카오톡 채널 채팅
  if (contactUrl()) $('contactLink').href = contactUrl();
}

function buildSizeTable(table, st) {
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  hr.appendChild(cell('th', 'SIZE'));
  (st.columns || []).forEach((c) => hr.appendChild(cell('th', c)));
  thead.appendChild(hr);
  const tbody = document.createElement('tbody');
  let missing = false;
  Object.keys(st.rows || {}).forEach((size) => {
    const tr = document.createElement('tr');
    const th = cell('th', size); th.scope = 'row';
    tr.appendChild(th);
    (st.rows[size] || []).forEach((v) => {
      if (!String(v).trim()) missing = true;
      tr.appendChild(cell('td', String(v).trim() || '—'));
    });
    tbody.appendChild(tr);
  });
  table.append(thead, tbody);
  if (st.title) {
    const cap = document.createElement('caption');
    cap.textContent = st.title;
    table.prepend(cap);
  }
  return missing;
}

function fillList(id, items) {
  const ul = $(id);
  const list = (Array.isArray(items) ? items : []).map((s) => String(s).trim()).filter(Boolean);
  if (!list.length) { ul.appendChild(cell('li', '준비 중입니다.')); return; }
  list.forEach((s) => ul.appendChild(cell('li', s)));
}

function cell(tag, text) { const n = document.createElement(tag); n.textContent = text; return n; }

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}

/* ---------- 대화상자 ---------- */

function bindDialogs() {
  document.querySelectorAll('[data-open]').forEach((btn) => {
    btn.addEventListener('click', () => $(btn.dataset.open).showModal());
  });
  document.querySelectorAll('dialog').forEach((dlg) => {
    dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dlg.close()));
    // 바깥 어두운 영역을 누르면 닫기
    dlg.addEventListener('click', (e) => {
      if (e.target !== dlg) return;
      const r = dlg.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) dlg.close();
    });
  });
}

/* ---------- 기타 ---------- */

function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* init() 호출은 파일 맨 끝에 둔다 (10-23 수정): 이 위치면 위에서 선언한 모든 const
   (QUESTIONS, GOOGLE_ICON 등)가 이미 평가된 뒤라 init() → initChat() → loadDraft() 경로가
   QUESTIONS 를 안전하게 참조할 수 있다. 전에는 파일 맨 위(17행대)에서 즉시 호출되어, 아직
   선언되지 않은(TDZ) QUESTIONS 를 참조해 ReferenceError 가 나고 loadDraft() 의 try/catch 가
   이를 조용히 삼켜 "이어하기"가 항상 null 을 반환했다. */
init();
