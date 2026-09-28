/* ============================================================
   OWN STREET — app.js
   실제 Google 로그인(Firebase Authentication) + 실제 접수(Apps Script)
   이 파일은 수정하지 않아도 됩니다. 설정은 config.js 에서 합니다.
   ============================================================ */

// Google 공식 Firebase 로그인 라이브러리 (v12.19.0, 사이트 폴더 안에 포함)
const FIREBASE_LIB_URL = './vendor/firebase-12.19.0.js';
const REQUEST_TIMEOUT_MS = 30000;
const RECEIPT_PATTERN = /^OS-\d{4,}$/;
const URL_PATTERN = /^https?:\/\/[^\s\/?#]+\.[^\s\/?#]+([\/?#]\S*)?$/i;

const CFG = window.OWN_STREET_CONFIG || {};
const $ = (id) => document.getElementById(id);

const state = {
  fb: null,        // firebase-auth 모듈
  auth: null,      // Auth 인스턴스
  user: null,      // 로그인한 사용자 (없으면 null)
  ready: false,    // 로그인 기능 사용 가능 여부
  sending: false,
  pending: null    // 재시도 시 같은 요청으로 인식시키기 위한 정보
};

init();

function init() {
  renderStaticInfo();
  bindDialogs();
  bindForm();
  $('readyBadge').addEventListener('click', (e) => { e.preventDefault(); goToForm(); });
  $('loginBtn').addEventListener('click', login);
  $('logoutBtn').addEventListener('click', logout);
  setupAuth();
}

/* ---------------- 로그인 ---------------- */

async function setupAuth() {
  if (isInAppBrowser()) {
    setupInAppNotice();
    showAuthState('inapp');
    return;
  }

  const fbc = CFG.firebase || {};
  if (!fbc.apiKey || !fbc.authDomain || !fbc.projectId || !fbc.appId) {
    console.warn('[OWN STREET] config.js 의 firebase 값이 비어 있어 로그인을 시작할 수 없습니다.');
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
    state.ready = true;

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
    $('unavailableMsg').textContent = '로그인 기능을 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 새로고침해주세요.';
    showAuthState('unavailable');
  }
}

async function login() {
  if (!state.ready) {
    scrollToId('top');
    return;
  }
  hideAuthMsg();
  const btn = $('loginBtn');
  btn.disabled = true;
  try {
    const provider = new state.fb.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await state.fb.signInWithPopup(state.auth, provider);
    // 로그인 성공 → 다음 할 일(요청 작성)로 안내
    setTimeout(() => scrollToId('request'), 150);
  } catch (err) {
    console.error('[OWN STREET] 로그인 오류', err && err.code, err);
    const msg = loginErrorMessage(err && err.code);
    if (msg) showAuthMsg(msg);
  } finally {
    btn.disabled = false;
  }
}

async function logout() {
  if (!state.ready) return;
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
      return '로그인이 취소되었습니다. 다시 누르면 계정을 선택할 수 있습니다.';
    case 'auth/popup-blocked':
      return '로그인 창이 차단되었습니다. 브라우저 주소창 옆의 팝업 차단을 해제한 뒤 다시 눌러주세요.';
    case 'auth/network-request-failed':
      return '인터넷 연결을 확인한 뒤 다시 시도해주세요.';
    case 'auth/unauthorized-domain':
    case 'auth/operation-not-allowed':
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
    case 'auth/configuration-not-found':
    case 'auth/argument-error':
      return '로그인 설정이 아직 끝나지 않았습니다. 잠시 후 다시 방문해주세요.';
    case 'auth/web-storage-unsupported':
    case 'auth/operation-not-supported-in-this-environment':
      return '이 브라우저에서는 로그인할 수 없습니다. Chrome 또는 Safari에서 열어주세요.';
    case 'auth/too-many-requests':
      return '잠시 후 다시 시도해주세요.';
    default:
      return '로그인 중 문제가 생겼습니다. 다시 시도해주세요.';
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
    $('loginGate').hidden = true;
  } else {
    showAuthState('out');
    $('userChip').hidden = true;
    $('topTag').hidden = false;
    $('loginGate').hidden = false;
  }
}

function goToForm() {
  scrollToId('request');
  setTimeout(() => $('name').focus({ preventScroll: true }), 400);
}

function showAuthState(name) {
  document.querySelectorAll('.auth-state').forEach((el) => { el.hidden = el.dataset.state !== name; });
}
function showAuthMsg(text) { const m = $('authMsg'); m.textContent = text; m.hidden = false; }
function hideAuthMsg() { const m = $('authMsg'); m.textContent = ''; m.hidden = true; }

/* 카카오톡·인스타그램 등 앱 안 브라우저: Google이 로그인을 막으므로 바깥 브라우저로 안내 */
function isInAppBrowser() {
  const ua = navigator.userAgent || '';
  return /KAKAOTALK|Instagram|FBAN|FBAV|FB_IAB|NAVER\(inapp|Line\/|DaumApps|everytimeApp|; wv\)/i.test(ua);
}

function setupInAppNotice() {
  const ua = navigator.userAgent || '';
  const here = location.href;
  const isKakao = /KAKAOTALK/i.test(ua);
  const isLine = /Line\//i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const openBtn = $('openExternalBtn');

  if (!isKakao && !isLine && !isAndroid) {
    // iOS 앱 안 브라우저: 자동으로 열 수 있는 방법이 없음
    openBtn.hidden = true;
    $('inappHint').textContent = '화면의 ··· 또는 공유 버튼을 누르고 "Safari로 열기"를 선택해주세요. 또는 주소를 복사해 Safari에 붙여넣어 주세요.';
  }
  openBtn.addEventListener('click', () => {
    if (isKakao) {
      location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(here);
    } else if (isLine) {
      location.href = here + (here.includes('?') ? '&' : '?') + 'openExternalBrowser=1';
    } else if (isAndroid) {
      location.href = `intent://${location.host}${location.pathname}${location.search}#Intent;scheme=https;package=com.android.chrome;end`;
    }
  });
  $('copyLinkBtn').addEventListener('click', async () => {
    const ok = await copyText(here);
    showAuthMsg(ok ? '주소를 복사했습니다. Chrome 또는 Safari 주소창에 붙여넣어 주세요.' : '주소를 복사하지 못했습니다.');
  });
}

/* ---------------- 요청 폼 ---------------- */

function bindForm() {
  const form = $('requestForm');
  form.addEventListener('submit', onSubmit);

  const phone = $('phone');
  phone.addEventListener('input', () => {
    const atEnd = phone.selectionStart === phone.value.length;
    if (atEnd) phone.value = formatPhoneTyping(phone.value);
    clearFieldError('phone');
  });
  phone.addEventListener('blur', () => {
    const n = normalizePhone(phone.value);
    if (n) phone.value = n;
  });

  const url = $('url');
  url.addEventListener('blur', () => {
    const v = url.value.trim();
    if (v && !/^[a-z][a-z0-9+.-]*:/i.test(v) && /^[^\s]+\.[^\s]+$/.test(v)) url.value = 'https://' + v;
  });

  $('name').addEventListener('input', () => clearFieldError('name'));
  url.addEventListener('input', () => clearFieldError('url'));
  $('consent').addEventListener('change', () => clearFieldError('consent'));

  $('retryBtn').addEventListener('click', () => {
    $('failDialog').close();
    if (typeof form.requestSubmit === 'function') form.requestSubmit();
    else form.dispatchEvent(new Event('submit', { cancelable: true }));
  });
}

async function onSubmit(e) {
  e.preventDefault();
  if (state.sending) return;
  clearAllErrors();

  // 1. 로그인 확인
  if (!state.user) {
    const gate = $('loginGate');
    gate.hidden = false;
    gate.textContent = '';
    gate.append('아직 로그인하지 않았습니다. 맨 위의 ');
    const b = document.createElement('strong'); b.textContent = 'Google로 시작하기'; gate.append(b);
    gate.append('를 먼저 눌러주세요.');
    scrollToId('top');
    return;
  }

  // 2~5. 입력 확인
  const rawPhone = $('phone').value.trim();
  const rawUrl = $('url').value.trim();
  const data = {
    name: cleanName($('name').value),
    phone: normalizePhone(rawPhone),
    url: normalizeUrl(rawUrl)
  };
  const errors = [];
  if (!data.name) errors.push(['name', '이름을 입력해주세요.']);
  if (!rawPhone) errors.push(['phone', '전화번호를 입력해주세요.']);
  else if (!data.phone) errors.push(['phone', '전화번호를 다시 확인해주세요. 예) 010-1234-5678']);
  if (!rawUrl) errors.push(['url', '생성한 이미지의 URL을 입력해주세요.']);
  else if (!data.url) errors.push(['url', '주소 형식이 올바르지 않습니다. https:// 로 시작하는 주소를 붙여넣어 주세요.']);
  if (!$('consent').checked) errors.push(['consent', '개인정보 수집 및 이용에 동의해주세요.']);

  if (errors.length) {
    errors.forEach(([f, m]) => showFieldError(f, m));
    focusField(errors[0][0]);
    return;
  }

  $('phone').value = data.phone;
  $('url').value = data.url;
  await send(data);
}

async function send(data) {
  const sig = JSON.stringify([state.user.uid, data.name, data.phone, data.url]);
  if (!state.pending || state.pending.sig !== sig) {
    state.pending = { sig, data, clientRef: newClientRef() };
  }
  setSending(true);
  try {
    let result = await postRequest(state.pending, false);
    if (result.code === 'AUTH_INVALID') {
      // 로그인 토큰을 새로 받아 한 번 더 시도
      result = await postRequest(state.pending, true);
    }
    handleResult(result);
  } finally {
    setSending(false);
  }
}

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
        idToken,
        name: pending.data.name,
        phone: pending.data.phone,
        url: pending.data.url,
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

function handleResult(r) {
  r = r || {};
  if (r.ok === true && RECEIPT_PATTERN.test(String(r.request_id || ''))) {
    state.pending = null;
    $('requestForm').reset();
    clearAllErrors();
    showComplete(r.request_id);
    return;
  }

  console.warn('[OWN STREET] 접수 실패 코드:', r.code || 'UNKNOWN');

  if (r.code === 'INVALID_INPUT' && Array.isArray(r.fields)) {
    const msg = { name: '이름을 다시 확인해주세요.', phone: '전화번호를 다시 확인해주세요. 예) 010-1234-5678', url: '주소를 다시 확인해주세요. https:// 로 시작하는 주소를 붙여넣어 주세요.' };
    r.fields.forEach((f) => msg[f] && showFieldError(f, msg[f]));
    if (r.fields[0]) focusField(r.fields[0]);
    return;
  }
  if (r.code === 'CONSENT_REQUIRED') {
    showFieldError('consent', '개인정보 수집 및 이용에 동의해주세요.');
    focusField('consent');
    return;
  }

  let detail = '잠시 후 다시 시도해주세요.';
  if (r.code === 'AUTH_INVALID' || r.code === 'TOKEN_ERROR') {
    detail = '로그인 정보를 확인하지 못했습니다. LOGOUT 후 다시 로그인한 뒤 시도해주세요.';
  } else if (r.code === 'NETWORK' || r.code === 'TIMEOUT') {
    detail = '인터넷 연결을 확인하고 잠시 후 다시 시도해주세요.';
  }
  $('failText').textContent = detail;
  $('failDialog').showModal();
}

function setSending(on) {
  state.sending = on;
  const btn = $('submitBtn');
  btn.disabled = on;
  btn.textContent = on ? 'SENDING...' : 'REQUEST';
  btn.setAttribute('aria-busy', on ? 'true' : 'false');
  ['name', 'phone', 'url', 'consent'].forEach((id) => { $(id).disabled = on; });
}

/* ---------------- 완료 / 복사 ---------------- */

function formatWon(n) {
  return Number(n).toLocaleString('ko-KR') + '원';
}

function showComplete(id) {
  $('receiptNo').textContent = id;
  const pay = CFG.payment || {};
  const link = String(pay.kakaopayLink || '').trim();
  if (pay.price && /^https:\/\//.test(link)) {
    $('payAmount').textContent = formatWon(pay.price);
    $('payRef').textContent = id;
    $('payLink').href = link;
    const qr = $('payQr');
    if (pay.kakaopayQr) { qr.src = pay.kakaopayQr; qr.hidden = false; $('payQr').nextElementSibling.hidden = false; }
    else { qr.hidden = true; $('payQr').nextElementSibling.hidden = true; }
    $('payBox').hidden = false;
  } else {
    $('payBox').hidden = true;
  }
  $('copyBtn').textContent = 'COPY';
  $('copyMsg').textContent = '';
  $('completeDialog').showModal();
}

$('copyBtn').addEventListener('click', async () => {
  const id = $('receiptNo').textContent;
  const ok = await copyText(id);
  if (ok) {
    $('copyBtn').textContent = 'COPIED';
    $('copyMsg').textContent = `접수번호 ${id}를 복사했습니다.`;
  } else {
    $('copyMsg').textContent = '복사하지 못했습니다. 번호를 길게 눌러 복사해주세요.';
  }
});
$('closeCompleteBtn').addEventListener('click', () => $('completeDialog').close());

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

/* ---------------- 입력값 정리 ---------------- */

function cleanName(v) {
  const s = String(v || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  return s.length >= 1 && s.length <= 40 ? s : '';
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

/* ---------------- 오류 표시 ---------------- */

function showFieldError(field, msg) {
  const err = $(field + 'Err');
  err.textContent = msg;
  err.hidden = false;
  $(field).setAttribute('aria-invalid', 'true');
}
function clearFieldError(field) {
  const err = $(field + 'Err');
  err.textContent = '';
  err.hidden = true;
  $(field).removeAttribute('aria-invalid');
}
function clearAllErrors() { ['name', 'phone', 'url', 'consent'].forEach(clearFieldError); }
function focusField(field) {
  const el = $(field);
  el.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  setTimeout(() => el.focus({ preventScroll: true }), 250);
}

/* ---------------- 안내 콘텐츠 ---------------- */

function renderStaticInfo() {
  // SIZE
  const st = CFG.sizeTable || { columns: [], rows: {} };
  const table = $('sizeTable');
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
  $('sizeNote').textContent = missing
    ? '단위 cm · 상세 수치는 준비 중입니다.'
    : (String(st.note || '').trim() || '단위 cm');

  // SIZE 칩
  Object.keys(st.rows || {}).forEach((size) => $('sizeChips').appendChild(cell('span', size)));

  // QUALITY / CARE / CUSTOM GUIDE / COPYRIGHT·NOTICE / TERMS
  fillList('qualityList', CFG.quality);
  fillList('careList', CFG.care);
  fillList('guideList', CFG.guide);
  fillList('noticeList', CFG.notice);
  fillList('termsList', ['REQUEST는 제작 요청 접수이며, 확인 후 제작 가능 여부를 연락드립니다.'].concat(CFG.notice || []));

  // PRIVACY / CONTACT
  $('retentionText').textContent = String(CFG.privacyRetention || '').trim() || '[보유 기간 입력 필요]';
  // PRICE
  const pay = CFG.payment || {};
  if (pay.price) {
    $('priceName').textContent = pay.productName || '';
    $('priceAmount').textContent = formatWon(pay.price);
    $('priceDesc').textContent = [pay.description, '접수 완료 후 카카오페이로 결제'].filter(Boolean).join(' · ');
    $('priceBox').hidden = false;
  }

  // CONTACT → 카카오톡 채널 채팅
  const contactUrl = String(CFG.contactUrl || '').trim();
  if (/^https:\/\//.test(contactUrl)) $('contactLink').href = contactUrl;
}

function fillList(id, items) {
  const ul = $(id);
  const list = (Array.isArray(items) ? items : []).map((s) => String(s).trim()).filter(Boolean);
  if (!list.length) { ul.appendChild(cell('li', '준비 중입니다.')); return; }
  list.forEach((s) => ul.appendChild(cell('li', s)));
}

function cell(tag, text) { const el = document.createElement(tag); el.textContent = text; return el; }

/* ---------------- 대화상자 ---------------- */

function bindDialogs() {
  document.querySelectorAll('[data-open]').forEach((btn) => {
    btn.addEventListener('click', () => $(btn.dataset.open).showModal());
  });
  document.querySelectorAll('dialog').forEach((dlg) => {
    dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dlg.close()));
    // 바깥 어두운 영역을 누르면 닫기 (완료 창은 실수로 닫히지 않게 제외)
    dlg.addEventListener('click', (e) => {
      if (e.target !== dlg || dlg.id === 'completeDialog') return;
      const r = dlg.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) dlg.close();
    });
  });
}

/* ---------------- 기타 ---------------- */

function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
function scrollToId(id) {
  $(id).scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
}
