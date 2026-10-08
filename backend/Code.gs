/**
 * ============================================================
 *  OWN STREET — 접수 서버 v2 (Google Apps Script)
 * ============================================================
 *  이 파일의 내용 "전체"를 복사해서
 *  Apps Script 편집기의 기존 코드를 모두 지운 뒤 붙여넣으세요.
 *
 *  직접 바꿔야 하는 곳은 아래 [설정 1] 한 줄뿐입니다 (이미 채워져 있으면 그대로).
 *  스프레드시트 ID 는 코드에 쓰지 않습니다. (아래 [설정 2] 참고)
 *
 *  하는 일
 *   1) 웹사이트에서 보낸 로그인 정보가 진짜 Google 로그인인지 확인
 *   2) 이름 / 전화번호 / URL 형식 확인
 *      (v2 요청이면 사이즈 / 주소도 확인하고, 배송 요청 / 한 줄 이야기가 있으면 같이 확인)
 *   3) 접수번호(OS-0001, OS-0002 ...)를 겹치지 않게 발급
 *   4) 스프레드시트 'REQUESTS' 시트에 한 줄 저장
 *   5) 저장한 줄을 다시 읽어 확인한 경우에만 접수번호를 웹사이트로 돌려줌
 *
 *  호환
 *   - 요청에 v 가 없으면 옛 형식(v0 폼: 이름·전화번호·URL)으로 받습니다.
 *   - 요청에 v: 2 가 있으면 새 형식(사이즈·주소 필수)으로 받습니다.
 *   - 요청 / 응답 형식은 backend/API.md 에 있습니다.
 * ============================================================
 */

// [설정 1] Firebase 웹 API 키
// Firebase 콘솔 > 프로젝트 설정 > 일반 > 내 앱 > firebaseConfig 의 apiKey 값을
// 따옴표 안에 그대로 붙여넣으세요. (예: 'AIzaSy....')
// ※ 이 값은 웹사이트(config.js)에도 공개되는 Firebase 웹 키이며 비밀값이 아닙니다.
const FIREBASE_API_KEY = 'AIzaSyClgBwgP-zB8xXGuIIaFrvdu1U4jqq-sfY';

// [설정 2] 접수 내용을 저장할 스프레드시트 ID — 코드에 쓰지 않습니다 (공개 저장소라서).
// Apps Script 편집기 왼쪽 ⚙ 프로젝트 설정 > 맨 아래 "스크립트 속성" 에서
//   속성: SPREADSHEET_ID   값: (스프레드시트 주소의 /d/ 와 /edit 사이의 긴 글자)
// 를 한 번 추가하세요. 코드를 다시 붙여넣어도 속성은 그대로 남습니다.
// 속성이 없으면, 스프레드시트에 붙어 있는 스크립트(확장 프로그램 > Apps Script)일 때만
// 그 스프레드시트를 씁니다. 속성이 있는데 열 수 없으면 다른 시트로 몰래 바꾸지 않고 실패합니다.
const SPREADSHEET_ID_PROPERTY = 'SPREADSHEET_ID';

// ---- 아래부터는 수정하지 않아도 됩니다 -----------------------

const SERVER_VERSION = 2;

const SHEET_NAME = 'REQUESTS';

// 열 순서는 바꾸지 않습니다. 새 열은 항상 맨 뒤에 덧붙입니다.
// 1~7 열은 v0 부터 있던 열이고, 8~13 열이 v2 에서 덧붙은 열입니다.
const HEADERS = [
  '접수번호', '접수시간', '이메일', '이름', '전화번호', 'URL', '상태',
  '사이즈', '주소', '배송 요청', '한 줄 이야기', 'clientRef', '동의 시각'
];
const COL = {
  ID: 1, CREATED: 2, EMAIL: 3, NAME: 4, PHONE: 5, URL: 6, STATUS: 7,
  SIZE: 8, ADDRESS: 9, MEMO: 10, STORY: 11, CLIENT_REF: 12, CONSENT_AT: 13
};
const LEGACY_COLUMN_COUNT = 7;

const SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL']; // app/config.js 의 sizeTable 과 같아야 함
const ADDRESS_MIN = 5;
const ADDRESS_MAX = 200;
const MEMO_MAX = 300;
const STORY_MAX = 200;

const DEFAULT_STATUS = '접수';
const TIMEZONE = 'Asia/Seoul';
const ID_PREFIX = 'OS-';
const SEQ_PROPERTY = 'OS_LAST_SEQ';

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

/**
 * 브라우저로 URL을 열었을 때 상태 확인용 (저장 기능 없음, 고객 데이터는 읽지 않음)
 *  version : 이 서버의 버전 (2 이상이어야 대화형 주문 화면이 접수를 시도함)
 *  storage : 저장할 스프레드시트를 열 수 있는지 (true / false)
 *  ready   : 로그인 확인 키와 저장 시트가 모두 준비되었는지
 */
function doGet() {
  const keyOk = isConfigured_();
  const storageOk = canOpenStorage_();
  let message = '접수 서버가 작동 중입니다.';
  if (!keyOk) message = 'FIREBASE_API_KEY 설정이 필요합니다.';
  else if (!storageOk) message = '저장할 스프레드시트를 열 수 없습니다. 스크립트 속성 SPREADSHEET_ID 를 확인하세요.';
  return json_({
    ok: true,
    service: 'OWN STREET',
    version: SERVER_VERSION,
    ready: keyOk && storageOk,
    storage: storageOk,
    message: message
  });
}

function handleRequest_(body) {
  if (body.action !== 'request') return { ok: false, code: 'BAD_REQUEST' };

  // 0) 요청 형식 버전: v 없음 = 옛 형식(v0), v: 2 = 새 형식. 모르는 새 버전은 받지 않는다.
  //    (새 화면이 보낸 항목을 서버가 조용히 버리고 "성공"을 돌려주는 일을 막기 위해)
  const version = parseVersion_(body.v);
  if (version === 0) return { ok: false, code: 'BAD_REQUEST' };
  if (version > SERVER_VERSION) return { ok: false, code: 'VERSION_MISMATCH' };
  const isV2 = version >= 2;

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
  const size = cleanSize_(body.size);
  const address = cleanText_(body.address, ADDRESS_MAX);
  const memo = cleanText_(body.memo, MEMO_MAX);
  const story = cleanText_(body.story, STORY_MAX);
  const clientRef = typeof body.clientRef === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(body.clientRef)
    ? body.clientRef : '';

  const badFields = [];
  if (!name) badFields.push('name');
  if (!phone) badFields.push('phone');
  if (!url) badFields.push('url');
  // 사이즈·주소: v2 는 필수, 옛 형식은 "있을 때만" 검증
  if (isV2 ? !size : (isPresent_(body.size) && !size)) badFields.push('size');
  if (address === null || (address === '' ? isV2 : address.length < ADDRESS_MIN)) badFields.push('address');
  if (memo === null) badFields.push('memo');
  if (story === null) badFields.push('story');
  // v2 는 중복 접수를 찾을 수 있어야 하므로 clientRef 필수
  if (isV2 && !clientRef) badFields.push('clientRef');
  if (badFields.length) return { ok: false, code: 'INVALID_INPUT', fields: badFields };
  if (body.consent !== true) return { ok: false, code: 'CONSENT_REQUIRED' };

  // 3) 동시에 여러 명이 신청해도 번호가 겹치지 않도록 잠금
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, code: 'BUSY' };
  try {
    const sheet = getSheet_();

    // 같은 사람이 같은 clientRef 로 다시 보내면, 시트에 이미 저장된 줄의 번호를 돌려준다.
    // (캐시가 아니라 시트에서 찾으므로 캐시가 사라져도 중복 줄이 생기지 않는다)
    if (clientRef) {
      const dup = findByClientRef_(sheet, user.email, clientRef);
      if (dup) {
        return { ok: true, v: SERVER_VERSION, request_id: dup.id, created_at: dup.createdAt, duplicate: true };
      }
    }

    const seq = nextSequence_(sheet);
    const requestId = formatId_(seq);
    const createdAt = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
    const consentAt = createdAt; // 동의(consent: true)가 담긴 요청을 서버가 받은 시각
    const row = sheet.getLastRow() + 1;

    const values = [
      requestId, createdAt, user.email, safeCell_(name), phone, safeCell_(url), DEFAULT_STATUS,
      size, safeCell_(address), safeCell_(memo), safeCell_(story), clientRef, consentAt
    ];

    // 글자 그대로 보이도록 텍스트 형식 (번호·시간·전화번호·주소의 "1-2" 같은 값이 날짜로 바뀌지 않게)
    const rowRange = sheet.getRange(row, 1, 1, HEADERS.length);
    rowRange.setNumberFormat('@');
    rowRange.setValues([values]);
    SpreadsheetApp.flush();

    // 4) 실제로 저장되었는지 다시 읽어서 확인 (맨 끝 열까지 읽어서, 줄이 끝까지 써졌는지도 본다)
    const saved = sheet.getRange(row, 1, 1, HEADERS.length).getDisplayValues()[0];
    const mustMatch = [
      [COL.ID, requestId], [COL.EMAIL, user.email], [COL.SIZE, size],
      [COL.CLIENT_REF, clientRef], [COL.CONSENT_AT, consentAt]
    ];
    for (let i = 0; i < mustMatch.length; i++) {
      if (String(saved[mustMatch[i][0] - 1]) !== mustMatch[i][1]) {
        throw new Error('저장 확인 실패 (row ' + row + ', col ' + mustMatch[i][0] + ')');
      }
    }

    PropertiesService.getScriptProperties().setProperty(SEQ_PROPERTY, String(seq));

    return { ok: true, v: SERVER_VERSION, request_id: requestId, created_at: createdAt };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 요청의 v 값을 읽는다.
 * 없음(undefined/null) → 1 (옛 형식), 1 이상의 정수 → 그 값, 그 밖 → 0 (잘못된 값)
 */
function parseVersion_(v) {
  if (v === undefined || v === null) return 1;
  if (typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= 1) return v;
  return 0;
}

function isPresent_(v) {
  return v !== undefined && v !== null && v !== '';
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

/**
 * 저장할 스프레드시트를 연다.
 *  1) 스크립트 속성 SPREADSHEET_ID 가 있으면 그 시트 (열 수 없으면 오류 — 다른 시트로 바꾸지 않음)
 *  2) 속성이 없으면 이 스크립트가 붙어 있는 스프레드시트
 *  3) 둘 다 없으면 오류
 */
function getSpreadsheet_() {
  const id = String(PropertiesService.getScriptProperties().getProperty(SPREADSHEET_ID_PROPERTY) || '').trim();
  if (id) return SpreadsheetApp.openById(id);
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) throw new Error('저장할 스프레드시트가 없습니다 (스크립트 속성 ' + SPREADSHEET_ID_PROPERTY + ' 를 넣어 주세요)');
  return active;
}

/** 저장 시트를 열 수 있는지만 본다. 시트를 만들지 않고 줄도 읽지 않는다. */
function canOpenStorage_() {
  try {
    return !!getSpreadsheet_();
  } catch (err) {
    console.error('저장소 확인 실패: ' + (err && err.message ? err.message : err));
    return false;
  }
}

function getSheet_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  ensureHeaders_(sheet);
  return sheet;
}

/**
 * 머리글을 맞춘다. 시트가 비어 있으면 전체를 쓰고, 이미 있으면 빠진 칸만 채운다.
 *  - 기존 1~7 열: 비어 있을 때만 채운다 (이름이 달라도 덮어쓰지 않는다. 열 "위치"가 약속이다).
 *  - 새 8~13 열: 비어 있으면 채운다. 다른 글자가 이미 있으면 덮어쓰지 않고 오류로 멈춘다.
 */
function ensureHeaders_(sheet) {
  if (sheet.getMaxColumns() < HEADERS.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), HEADERS.length - sheet.getMaxColumns());
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    return;
  }
  const current = sheet.getRange(1, 1, 1, HEADERS.length).getDisplayValues()[0];
  for (let i = 0; i < HEADERS.length; i++) {
    const have = String(current[i]).trim();
    if (have === '') {
      sheet.getRange(1, i + 1).setValue(HEADERS[i]).setFontWeight('bold');
    } else if (i >= LEGACY_COLUMN_COUNT && have !== HEADERS[i]) {
      throw new Error('머리글 충돌: ' + (i + 1) + '번째 열에 이미 "' + have + '" 가 있습니다 (필요한 이름: "' + HEADERS[i] + '")');
    }
  }
}

/** 같은 이메일 + 같은 clientRef 로 이미 저장된 줄을 찾는다 (없으면 null) */
function findByClientRef_(sheet, email, clientRef) {
  const last = sheet.getLastRow();
  if (last < 2) return null;
  const n = last - 1;
  const refs = sheet.getRange(2, COL.CLIENT_REF, n, 1).getDisplayValues();
  const emails = sheet.getRange(2, COL.EMAIL, n, 1).getDisplayValues();
  for (let i = n - 1; i >= 0; i--) {
    if (String(refs[i][0]).trim() === clientRef && String(emails[i][0]).trim().toLowerCase() === email) {
      const meta = sheet.getRange(i + 2, 1, 1, 2).getDisplayValues()[0];
      const id = String(meta[0]).trim();
      // 같은 요청의 줄은 있는데 접수번호가 이상하면 번호를 만들어 돌려주지 않고 오류로 끝낸다
      if (!/^OS-\d+$/.test(id)) throw new Error('중복 요청의 줄에 접수번호가 없습니다 (row ' + (i + 2) + ')');
      return { id: id, createdAt: String(meta[1]) };
    }
  }
  return null;
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

/** 정확히 S, M, L, XL, 2XL, 3XL 중 하나여야 한다. 아니면 '' */
function cleanSize_(v) {
  if (typeof v !== 'string') return '';
  const s = v.trim();
  return SIZES.indexOf(s) >= 0 ? s : '';
}

/**
 * 자유 입력 글(주소·배송 요청·한 줄 이야기)을 정리한다.
 *  - 없음(undefined/null) → ''
 *  - 글자가 아니거나 max 를 넘으면 → null (잘못된 입력)
 *  - 줄바꿈·제어문자는 공백으로, 연속 공백은 하나로, 앞뒤 공백은 지운다
 */
function cleanText_(v, max) {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') return null;
  if (v.length > max * 4) return null;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length <= max ? s : null;
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
 *   - REQUESTS 시트를 만들고 (이미 있으면 빠진 머리글만 채우고)
 *   - Firebase API 키가 맞는지 확인합니다.
 *   결과는 아래 '실행 로그'에 한국어로 나옵니다. (고객 데이터는 출력하지 않습니다)
 */
function setup() {
  const sheet = getSheet_();
  const usingProperty = !!String(PropertiesService.getScriptProperties().getProperty(SPREADSHEET_ID_PROPERTY) || '').trim();
  console.log('✅ 스프레드시트 연결 완료: "' + sheet.getParent().getName() + '" 의 "' + SHEET_NAME + '" 시트'
    + (usingProperty ? ' (스크립트 속성 SPREADSHEET_ID 사용)' : ' (이 스크립트가 붙어 있는 시트 사용 — 속성 SPREADSHEET_ID 는 아직 없음)'));
  console.log('✅ 머리글 ' + HEADERS.length + '칸 확인: ' + HEADERS.join(' | '));

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
