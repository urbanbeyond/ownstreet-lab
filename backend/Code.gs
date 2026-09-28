/**
 * ============================================================
 *  OWN STREET — 접수 서버 (Google Apps Script)
 * ============================================================
 *  이 파일의 내용 "전체"를 복사해서
 *  Apps Script 편집기의 기존 코드를 모두 지운 뒤 붙여넣으세요.
 *
 *  직접 바꿔야 하는 곳은 아래 [설정 1] 한 줄뿐입니다.
 *  ([설정 2]는 이미 ownstreetdb 스프레드시트로 채워져 있습니다.)
 *
 *  하는 일
 *   1) 웹사이트에서 보낸 로그인 정보가 진짜 Google 로그인인지 확인
 *   2) 이름 / 전화번호 / URL 형식 확인
 *   3) 접수번호(OS-0001, OS-0002 ...)를 겹치지 않게 발급
 *   4) 스프레드시트 'REQUESTS' 시트에 한 줄 저장
 *   5) 저장이 확인된 경우에만 접수번호를 웹사이트로 돌려줌
 * ============================================================
 */

// [설정 1] Firebase 웹 API 키
// Firebase 콘솔 > 프로젝트 설정 > 일반 > 내 앱 > firebaseConfig 의 apiKey 값을
// 따옴표 안에 그대로 붙여넣으세요. (예: 'AIzaSy....')
const FIREBASE_API_KEY = 'AIzaSyClgBwgP-zB8xXGuIIaFrvdu1U4jqq-sfY';

// [설정 2] 접수 내용을 저장할 스프레드시트 ID
// ※ 공개 저장소라서 여기서는 비워 둡니다. Apps Script 에 붙여넣어 배포할 때
//   LIVE 는 ownstreetdb 의 ID, LAB 은 ownstreetdb-LAB 의 ID 를 넣으세요.
const SPREADSHEET_ID = '';

// ---- 아래부터는 수정하지 않아도 됩니다 -----------------------

const SHEET_NAME = 'REQUESTS';
const HEADERS = ['접수번호', '접수시간', '이메일', '이름', '전화번호', 'URL', '상태'];
const DEFAULT_STATUS = '접수';
const TIMEZONE = 'Asia/Seoul';
const ID_PREFIX = 'OS-';
const SEQ_PROPERTY = 'OS_LAST_SEQ';
const DUPLICATE_WINDOW_SECONDS = 21600; // 같은 요청 재전송 방지(6시간)

/** 웹사이트 → 접수 요청 */
function doPost(e) {
  let body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '');
  } catch (err) {
    return json_({ ok: false, code: 'BAD_REQUEST' });
  }
  try {
    return json_(handleRequest_(body || {}));
  } catch (err) {
    console.error('접수 처리 오류: ' + (err && err.stack ? err.stack : err));
    return json_({ ok: false, code: 'SERVER_ERROR' });
  }
}

/** 브라우저로 URL을 열었을 때 상태 확인용 (저장 기능 없음) */
function doGet() {
  return json_({
    ok: true,
    service: 'OWN STREET',
    ready: isConfigured_(),
    message: isConfigured_() ? '접수 서버가 작동 중입니다.' : 'FIREBASE_API_KEY 설정이 필요합니다.'
  });
}

function handleRequest_(body) {
  if (body.action !== 'request') return { ok: false, code: 'BAD_REQUEST' };
  if (!isConfigured_()) return { ok: false, code: 'NOT_CONFIGURED' };

  // 1) 로그인 확인 (Google 서버에 직접 확인)
  const user = verifyUser_(body.idToken);
  if (user.status === 'invalid') return { ok: false, code: 'AUTH_INVALID' };
  if (user.status === 'config') return { ok: false, code: 'NOT_CONFIGURED' };
  if (user.status !== 'ok') return { ok: false, code: 'AUTH_UNAVAILABLE' };

  // 2) 입력값 확인
  const name = cleanName_(body.name);
  const phone = normalizePhone_(body.phone);
  const url = cleanUrl_(body.url);
  const badFields = [];
  if (!name) badFields.push('name');
  if (!phone) badFields.push('phone');
  if (!url) badFields.push('url');
  if (badFields.length) return { ok: false, code: 'INVALID_INPUT', fields: badFields };
  if (body.consent !== true) return { ok: false, code: 'CONSENT_REQUIRED' };

  const clientRef = typeof body.clientRef === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(body.clientRef)
    ? body.clientRef : '';

  // 3) 동시에 여러 명이 신청해도 번호가 겹치지 않도록 잠금
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, code: 'BUSY' };
  try {
    const cache = CacheService.getScriptCache();
    const cacheKey = clientRef ? 'ref:' + Utilities.base64EncodeWebSafe(user.uid + ':' + clientRef) : '';
    if (cacheKey) {
      const existing = cache.get(cacheKey);
      if (existing) return { ok: true, request_id: existing, duplicate: true };
    }

    const sheet = getSheet_();
    const seq = nextSequence_(sheet);
    const requestId = formatId_(seq);
    const createdAt = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
    const row = sheet.getLastRow() + 1;

    // 접수번호·시간·전화번호는 글자 그대로 보이도록 텍스트 형식
    sheet.getRange(row, 1, 1, 2).setNumberFormat('@');
    sheet.getRange(row, 5).setNumberFormat('@');
    sheet.getRange(row, 1, 1, HEADERS.length).setValues([[
      requestId, createdAt, user.email, safeCell_(name), phone, safeCell_(url), DEFAULT_STATUS
    ]]);
    SpreadsheetApp.flush();

    // 4) 실제로 저장되었는지 다시 읽어서 확인
    const saved = sheet.getRange(row, 1, 1, 3).getDisplayValues()[0];
    if (saved[0] !== requestId || saved[2] !== user.email) {
      throw new Error('저장 확인 실패 (row ' + row + ')');
    }

    PropertiesService.getScriptProperties().setProperty(SEQ_PROPERTY, String(seq));
    if (cacheKey) cache.put(cacheKey, requestId, DUPLICATE_WINDOW_SECONDS);

    return { ok: true, request_id: requestId, created_at: createdAt };
  } finally {
    lock.releaseLock();
  }
}

/** Firebase 로그인 토큰을 Google 서버에 보내 진짜인지 확인 */
function verifyUser_(idToken) {
  if (typeof idToken !== 'string' || idToken.length < 100 || idToken.length > 5000) {
    return { status: 'invalid' };
  }
  let res;
  try {
    res = UrlFetchApp.fetch(
      'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(FIREBASE_API_KEY),
      {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({ idToken: idToken }),
        muteHttpExceptions: true
      }
    );
  } catch (err) {
    console.error('로그인 확인 서버 연결 실패: ' + err);
    return { status: 'unavailable' };
  }

  const code = res.getResponseCode();
  let data = {};
  try { data = JSON.parse(res.getContentText() || '{}'); } catch (err) { data = {}; }

  if (code !== 200) {
    const msg = String((data.error && data.error.message) || '');
    if (/API[ _]?key/i.test(msg) || code === 403) {
      console.error('Firebase API 키 문제: ' + msg);
      return { status: 'config' };
    }
    if (code === 400) return { status: 'invalid' };
    return { status: 'unavailable' };
  }

  const u = data.users && data.users[0];
  if (!u || !u.email || u.emailVerified !== true || u.disabled === true) return { status: 'invalid' };
  const viaGoogle = (u.providerUserInfo || []).some(function (p) { return p.providerId === 'google.com'; });
  if (!viaGoogle) return { status: 'invalid' };

  return { status: 'ok', email: String(u.email).toLowerCase(), uid: String(u.localId || '') };
}

function getSheet_() {
  const ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** 저장된 마지막 번호와 시트에 실제로 있는 가장 큰 번호 중 큰 값 + 1 */
function nextSequence_(sheet) {
  const stored = parseInt(PropertiesService.getScriptProperties().getProperty(SEQ_PROPERTY) || '0', 10) || 0;
  let maxInSheet = 0;
  const last = sheet.getLastRow();
  if (last >= 2) {
    const ids = sheet.getRange(2, 1, last - 1, 1).getDisplayValues();
    for (let i = 0; i < ids.length; i++) {
      const m = /^OS-(\d+)$/.exec(String(ids[i][0]).trim());
      if (m) maxInSheet = Math.max(maxInSheet, parseInt(m[1], 10));
    }
  }
  return Math.max(stored, maxInSheet) + 1;
}

function formatId_(seq) {
  const s = String(seq);
  return ID_PREFIX + (s.length < 4 ? ('0000' + s).slice(-4) : s);
}

function cleanName_(v) {
  if (typeof v !== 'string') return '';
  const s = v.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  return s.length >= 1 && s.length <= 40 ? s : '';
}

function normalizePhone_(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (/^02\d{7,8}$/.test(d)) {
    return d.length === 9 ? '02-' + d.slice(2, 5) + '-' + d.slice(5) : '02-' + d.slice(2, 6) + '-' + d.slice(6);
  }
  if (/^0[1-9]\d{8,9}$/.test(d)) {
    return d.length === 10
      ? d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6)
      : d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
  }
  return '';
}

function cleanUrl_(v) {
  if (typeof v !== 'string') return '';
  const s = v.trim();
  if (s.length > 2000) return '';
  return /^https?:\/\/[^\s\/?#]+\.[^\s\/?#]+([\/?#]\S*)?$/i.test(s) ? s : '';
}

/** 스프레드시트 수식으로 해석되지 않도록 */
function safeCell_(s) {
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function isConfigured_() {
  return typeof FIREBASE_API_KEY === 'string' && /^AIza[0-9A-Za-z_\-]{20,}$/.test(FIREBASE_API_KEY);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * ▶ 처음 한 번 실행하세요 (편집기 위쪽에서 'setup' 선택 → 실행)
 *   - 권한 승인 창을 띄우고
 *   - REQUESTS 시트를 만들고
 *   - Firebase API 키가 맞는지 확인합니다.
 *   결과는 아래 '실행 로그'에 한국어로 나옵니다.
 */
function setup() {
  const sheet = getSheet_();
  console.log('✅ 스프레드시트 연결 완료: "' + sheet.getParent().getName() + '" 의 "' + SHEET_NAME + '" 시트');

  if (!isConfigured_()) {
    console.log('❌ FIREBASE_API_KEY 가 아직 입력되지 않았습니다. 코드 맨 위 [설정 1]을 채운 뒤 저장하고 다시 실행하세요.');
    return;
  }

  const res = UrlFetchApp.fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(FIREBASE_API_KEY),
    { method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: 'setup-check' }), muteHttpExceptions: true }
  );
  const text = res.getContentText();
  // 가짜 토큰을 보냈으므로 "토큰이 잘못됨(400)"이 오면 키는 정상이라는 뜻
  if (res.getResponseCode() === 400 && !/API[ _]?key/i.test(text)) {
    console.log('✅ Firebase API 키 확인 완료 (로그인 확인 기능 정상)');
    console.log('다음 단계: 배포 > 배포 관리 > 연필 아이콘 > 버전: 새 버전 > 배포');
  } else {
    console.log('❌ Firebase API 키를 확인할 수 없습니다. apiKey 값을 다시 복사해 붙여넣으세요.');
    console.log('   (Google 응답: ' + text.slice(0, 200) + ')');
  }
}
