/* ============================================================
   OWN STREET — app.js
   대화형 주문 + 실제 Google 로그인(Firebase) + 실제 접수(Apps Script)
   이 파일은 수정하지 않아도 됩니다. 설정은 config.js 에서 합니다.
   ============================================================ */

// Google 공식 Firebase 로그인 라이브러리 (v12.19.0, 사이트 폴더 안에 포함)
const FIREBASE_LIB_URL = './vendor/firebase-12.19.0.js';
const REQUEST_TIMEOUT_MS = 30000;
const REQUIRED_SERVER_VERSION = 2;           // 사이즈·주소·요청사항을 저장하는 접수 서버
const RECEIPT_PATTERN = /^OS-\d{4,}$/;
const URL_PATTERN = /^https?:\/\/[^\s\/?#]+\.[^\s\/?#]+([\/?#]\S*)?$/i;
const DRAFT_KEY = 'ownstreet.order.v1';
const STEPS = ['url', 'size', 'name', 'phone', 'address', 'memo'];

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
  pending: null      // 재시도 시 같은 요청으로 인식시키기 위한 정보
};

const chat = {
  started: false,
  active: false,     // 사용자가 대화를 누르기 시작했는지 (자동 스크롤·포커스 기준)
  step: null,        // 지금 묻고 있는 항목
  editing: false,    // 확인 카드에서 [수정]으로 들어온 경우
  busy: false,
  data: {},
  runId: 0           // 다시 시작했을 때 이전 대기 중 말풍선을 무시하기 위한 번호
};

function init() {
  renderStaticInfo();
  bindDialogs();
  $('heroStart').addEventListener('click', () => startFromHero());
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
    setupInAppNotice();
    showAuthState('inapp');
    $('heroStart').hidden = true;
    return;
  }

  const fbc = CFG.firebase || {};
  if (!fbc.apiKey || !fbc.authDomain || !fbc.projectId || !fbc.appId) {
    console.warn('[OWN STREET] config.js 의 firebase 값이 비어 있어 로그인을 시작할 수 없습니다.');
    state.authMode = 'unavailable';
    showAuthState('unavailable');
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
      state.user = user || null;
      renderUser();
    }, (err) => {
      console.error('[OWN STREET] 로그인 상태 확인 오류', err);
      state.user = null;
      renderUser();
    });
  } catch (err) {
    console.error('[OWN STREET] Firebase 로드 실패', err);
    state.authMode = 'unavailable';
    $('unavailableMsg').textContent = '주문 기능을 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 새로고침해주세요.';
    showAuthState('unavailable');
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
    showAuthMsg('로그아웃되었습니다.');
  } catch (err) {
    console.error('[OWN STREET] 로그아웃 오류', err);
    showAuthMsg('로그아웃하지 못했습니다. 새로고침한 뒤 다시 시도해주세요.');
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
    $('userEmail').textContent = u.email || '';
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
    showAuthState('in');
    $('userChip').hidden = false;
    $('topTag').hidden = true;
  } else {
    showAuthState('out');
    $('userChip').hidden = true;
    $('topTag').hidden = false;
  }
}

function showAuthState(name) {
  document.querySelectorAll('.auth-state').forEach((el) => { el.hidden = el.dataset.state !== name; });
}
function showAuthMsg(text) { const m = $('authMsg'); m.textContent = text; m.hidden = false; }

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

function setupInAppNotice() {
  if (inAppKind() === 'other') {
    $('openExternalBtn').hidden = true;
    $('inappHint').textContent = '화면의 ··· 또는 공유 버튼을 누르고 "Safari로 열기"를 선택해주세요. 또는 주소를 복사해 Safari에 붙여넣어 주세요.';
  }
  $('openExternalBtn').addEventListener('click', openExternalBrowser);
  $('copyLinkBtn').addEventListener('click', async () => {
    const ok = await copyText(location.href);
    showAuthMsg(ok ? '주소를 복사했습니다. Chrome 또는 Safari 주소창에 붙여넣어 주세요.' : '주소를 복사하지 못했습니다.');
  });
}

/* ============================================================
   대화형 주문
   ============================================================ */

const QUESTIONS = {
  url: {
    label: '이미지 링크',
    ask: '이미지가 있는 채팅 링크를 보내주세요.\n공개 링크만 받습니다.',
    input: { type: 'text', inputmode: 'url', placeholder: 'https://...', maxlength: 2000, autocomplete: 'off', autocapitalize: 'off' },
    parse(raw) {
      const v = normalizeUrl(raw);
      return v ? { value: v } : { error: '링크 형식이 아닙니다.\nhttps:// 로 시작하는 주소를 붙여넣어 주세요.' };
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
    label: '이름',
    ask: '받는 분 이름을 알려주세요.',
    input: { type: 'text', placeholder: '홍길동', maxlength: 40, autocomplete: 'name' },
    parse(raw) {
      const v = cleanName(raw);
      return v ? { value: v } : { error: '이름을 다시 확인해주세요.\n40자까지 입력할 수 있습니다.' };
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
    label: '요청사항',
    ask: '요청사항이 있으면 적어주세요.',
    input: { type: 'text', placeholder: '예) 프린트를 크게', maxlength: 300, autocomplete: 'off' },
    skip: '없음',
    parse(raw) {
      if (cleanText(raw, 1, 9999) === '') return { value: '' };
      const v = cleanText(raw, 1, 300);
      return v ? { value: v } : { error: '요청사항은 300자까지 입력할 수 있습니다.' };
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
    choices.push({
      label: '주소 복사',
      onPick: async () => { botNow((await copyText(location.href)) ? '주소를 복사했습니다.\n브라우저 주소창에 붙여넣어 주세요.' : '주소를 복사하지 못했습니다.'); }
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
  botNow('OWN STREET입니다.\n생성한 이미지로 티셔츠를 만듭니다.');
  botNow(priceLine() + '\n배송비 포함');
}

function startFromHero() {
  chat.active = true;
  scrollToId('request');
  if (state.authMode === 'inapp' || state.authMode === 'unavailable') return;
  if (!chat.started) setTimeout(() => beginOrder(), 350);
  else setTimeout(() => focusComposer(), 350);
}

async function beginOrder() {
  if (chat.started) return;
  chat.started = true;
  chat.active = true;
  $('chatReset').hidden = false;
  meSay('주문 시작');
  await askStep(STEPS[0]);
}

/** 저장해둔 대화를 다시 그려서 이어가기 */
function resume(draft) {
  chat.started = true;
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
  if (next) askStep(next, true);
  else showConfirm(true);
}

async function askStep(step, instant) {
  chat.step = step;
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
  if (step !== 'memo' && text.trim() === '') { focusComposer(); return; }

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
  if (idx < STEPS.length - 1) await askStep(STEPS[idx + 1]);
  else await showConfirm();
}

function displayValue(step, value) {
  if (step === 'memo' && !value) return '없음';
  return value;
}

/* ---------- 주문 확인 카드 ---------- */

async function showConfirm(instant) {
  chat.step = 'confirm';
  retireCards();
  if (instant) botNow('주문 내용을 확인해주세요.'); else await botSay('주문 내용을 확인해주세요.');

  const card = el('div', 'card order-card');
  card.dataset.card = 'confirm';
  const dl = el('dl', 'order-list');
  STEPS.forEach((step) => {
    const row = el('div', 'order-row');
    row.append(el('dt', 'font-display', QUESTIONS[step].label));
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
  const info = el('p', 'consent-info', '수집: 이름, 전화번호, 배송 주소, 이미지 URL, Google 이메일 · 목적: 제작 요청 확인, 연락, 배송 ');
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
    showLoginChoice();
    return;
  }
  await submitOrder();
}

function showLoginChoice() {
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
        showLoginChoice();
        return;
      }
      await botSay((state.user && state.user.email ? state.user.email + '\n' : '') + '로그인됐습니다.');
      await submitOrder();
    }
  }]);
}

async function submitOrder() {
  if (chat.busy) return;
  chat.busy = true;
  setComposerNone();
  const run = chat.runId;
  const status = botNow('접수 중입니다…', 'status');

  const d = chat.data;
  const sig = JSON.stringify([state.user.uid, d.url, d.size, d.name, d.phone, d.address, d.memo]);
  if (!state.pending || state.pending.sig !== sig) {
    state.pending = { sig, data: { ...d }, clientRef: newClientRef() };
  }

  let result = await ensureServer();
  if (result.ok) {
    result = await postRequest(state.pending, false);
    if (result.code === 'AUTH_INVALID') result = await postRequest(state.pending, true); // 토큰 새로 받아 한 번 더
  }
  chat.busy = false;
  if (run !== chat.runId) return;
  status.remove();
  await handleResult(result || {});
}

/** 접수 서버가 대화형 주문(사이즈·주소 저장)을 지원하는지 확인 */
async function ensureServer() {
  if (state.serverOk) return { ok: true };
  if (!CFG.requestEndpoint) return { ok: false, code: 'NOT_READY' };
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

async function postRequest(pending, forceRefresh) {
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
  if (r.ok === true && RECEIPT_PATTERN.test(String(r.request_id || ''))) {
    state.pending = null;
    clearDraft();
    chat.step = 'done';
    showComplete(r.request_id);
    return;
  }

  console.warn('[OWN STREET] 접수 실패 코드:', r.code || 'UNKNOWN');

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
    showLoginChoice();
    return;
  }

  let msg = '접수에 실패했습니다.\n잠시 후 다시 시도해주세요.';
  if (r.code === 'NETWORK' || r.code === 'TIMEOUT') msg = '접수에 실패했습니다.\n인터넷 연결을 확인하고 다시 시도해주세요.';
  else if (r.code === 'NOT_READY' || r.code === 'NOT_CONFIGURED') msg = '지금은 주문을 준비하고 있습니다.\n잠시 후 다시 시도해주세요.';
  await botSay(msg, 'warn');
  const choices = [
    { label: '다시 시도', primary: true, id: 'retryBtn', onPick: () => { meSay('다시 시도'); submitOrder(); } },
    { label: '내용 수정', onPick: () => { meSay('내용 수정'); showConfirm(); } }
  ];
  if (contactUrl()) choices.push({ label: '카톡 문의', href: contactUrl() });
  setChoices(choices);
}

/* ---------- 접수 완료 + 결제 안내 ---------- */

function showComplete(id) {
  const done = el('div', 'card done-card');
  const kicker = el('div', 'modal-kicker');
  kicker.append(el('span', 'dot'), el('span', 'font-display', 'REQUEST COMPLETE'));
  const no = el('p', 'font-display receipt', id);
  no.id = 'receiptNo';
  done.append(kicker, el('p', 'done-title', '접수됐습니다.'), el('p', 'modal-sub', '접수번호'), no,
    el('p', 'done-text', '확인 후 연락드리겠습니다.'));
  appendMsg('bot', done, 'wide');

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
  greet();
  if (autoStart) { chat.active = true; scrollToId('request'); beginOrder(); }
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
  if (chat.active && !prefersReducedMotion()) await new Promise((r) => setTimeout(r, 260));
  if (run !== chat.runId) return null;
  return botNow(text, kind);
}

function meSay(text) { return appendMsg('me', text); }

function keepInView() {
  if (!chat.active) return;
  requestAnimationFrame(() => {
    $('chatInput').scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  });
}

/* ---------- 입력 영역 ---------- */

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
  const send = el('button', 'send font-display', '보내기');
  send.type = 'submit';
  send.id = 'chatSend';
  form.append(input, send);
  form.addEventListener('submit', (e) => { e.preventDefault(); onSubmit(input.value); });
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
  const input = $('chatText');
  if (input) setTimeout(() => input.focus({ preventScroll: true }), 60);
}

const GOOGLE_ICON = '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.17-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.97 10.71A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.17.29-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3.01-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.93 11.43 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/></svg>';

/* ---------- 작성 중인 주문 임시 저장 (같은 기기에서 이어하기) ---------- */

function saveDraft() {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ data: chat.data, at: Date.now() })); } catch (e) { /* 저장 불가 환경은 무시 */ }
}
function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* 무시 */ }
}
function loadDraft() {
  try {
    const raw = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (!raw || typeof raw.data !== 'object' || !raw.data) return null;
    if (Date.now() - Number(raw.at || 0) > 7 * 24 * 3600 * 1000) { clearDraft(); return null; } // 7일 지나면 버림
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
function scrollToId(id) {
  $(id).scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
}

init();
