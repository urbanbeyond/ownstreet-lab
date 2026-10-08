/*
 * Apps Script 서비스를 흉내 낸 가짜 환경 (Node 용)
 * ------------------------------------------------------------
 * 목적: backend/Code.gs 의 로직을 실제 서버에 요청을 보내지 않고 확인한다.
 * 한계: 이것은 "모의(mock)"다. 진짜 SpreadsheetApp / LockService / UrlFetchApp 의 동작과
 *       다를 수 있다. 모의 테스트가 통과해도 실제 Apps Script 에서 돈다는 뜻은 아니다.
 * 규칙: 여기와 테스트에 나오는 이메일·이름·전화번호·주소는 전부 지어낸 값이다.
 *       실제 고객 정보, 실제 스프레드시트 ID, 실제 토큰을 쓰지 않는다.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// 기본은 backend/Code.gs. 일부러 망가뜨린 사본으로 테스트가 실패하는지 볼 때만 CODE_GS_PATH 로 바꾼다.
const CODE_GS_PATH = process.env.CODE_GS_PATH || path.join(__dirname, '..', 'Code.gs');

/* ---------- 가짜 시트 ---------- */

class FakeRange {
  constructor(sheet, row, col, numRows, numCols) {
    this.sheet = sheet; this.row = row; this.col = col; this.numRows = numRows; this.numCols = numCols;
    // 진짜 시트처럼, 칸 수(열)가 시트 크기를 넘으면 오류
    if (row < 1 || col < 1 || numRows < 1 || numCols < 1 || col + numCols - 1 > sheet.maxColumns) {
      throw new Error('The coordinates or dimensions of the range are invalid.');
    }
  }
  getDisplayValues() {
    if (this.sheet.hooks.readFail) throw new Error('모의: 읽기 실패');
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const line = [];
      for (let c = 0; c < this.numCols; c++) {
        const v = this.sheet.get(this.row + r, this.col + c);
        line.push(v === undefined || v === null ? '' : String(v));
      }
      out.push(line);
    }
    const tweak = this.sheet.hooks.readTweak;
    return tweak ? tweak(out, this.row, this.col) : out;
  }
  setValues(values) {
    if (this.sheet.hooks.dropWrites) return this;
    for (let r = 0; r < this.numRows; r++) {
      for (let c = 0; c < this.numCols; c++) this.sheet.set(this.row + r, this.col + c, values[r][c]);
    }
    return this;
  }
  setValue(v) { return this.setValues([[v]]); }
  setNumberFormat(fmt) {
    for (let r = 0; r < this.numRows; r++) {
      for (let c = 0; c < this.numCols; c++) this.sheet.formats[(this.row + r) + ',' + (this.col + c)] = fmt;
    }
    return this;
  }
  setFontWeight() { return this; }
}

class FakeSheet {
  constructor(name, maxColumns) {
    this.name = name;
    this.maxColumns = maxColumns || 26;
    this.rows = [];      // rows[r-1][c-1]
    this.formats = {};
    this.hooks = {};     // dropWrites, readFail, readTweak
    this.frozen = 0;
  }
  get(r, c) { return (this.rows[r - 1] || [])[c - 1]; }
  set(r, c, v) {
    while (this.rows.length < r) this.rows.push([]);
    this.rows[r - 1][c - 1] = v;
  }
  getLastRow() {
    for (let i = this.rows.length; i >= 1; i--) {
      if ((this.rows[i - 1] || []).some((v) => v !== undefined && v !== null && String(v) !== '')) return i;
    }
    return 0;
  }
  getMaxColumns() { return this.maxColumns; }
  insertColumnsAfter(after, n) { this.maxColumns += n; }
  setFrozenRows(n) { this.frozen = n; }
  getRange(r, c, nr, nc) { return new FakeRange(this, r, c, nr || 1, nc || 1); }
  getParent() { return this.parent; }
  /** 테스트용: 한 줄을 통째로 심는다 (지어낸 값만) */
  seedRow(r, values) { values.forEach((v, i) => this.set(r, i + 1, v)); }
  /** 테스트용: 첫 칸이 비어 있지 않은 줄들을 문자열 배열로 */
  dataRows() {
    const out = [];
    for (let r = 2; r <= this.getLastRow(); r++) out.push((this.rows[r - 1] || []).map((v) => (v === undefined ? '' : String(v))));
    return out;
  }
}

class FakeSpreadsheet {
  constructor(name) { this.name = name; this.sheets = {}; }
  getName() { return this.name; }
  getSheetByName(n) { return this.sheets[n] || null; }
  insertSheet(n) {
    const s = new FakeSheet(n);
    s.parent = this;
    this.sheets[n] = s;
    return s;
  }
  addSheet(sheet) { sheet.parent = this; this.sheets[sheet.name] = sheet; return sheet; }
}

/* ---------- 환경 만들기 ---------- */

/** 기본 로그인 토큰: 이름이 tokA / tokB 로 시작하면 가짜 사용자 A / B 로 인정한다 */
function defaultFetch(url, opts) {
  const payload = JSON.parse(opts.payload || '{}');
  const tok = String(payload.idToken || '');
  const who = tok.startsWith('tokA') ? 'tester-a@example.test' : tok.startsWith('tokB') ? 'tester-b@example.test' : null;
  if (!who) return { getResponseCode: () => 400, getContentText: () => JSON.stringify({ error: { message: 'INVALID_ID_TOKEN' } }) };
  return {
    getResponseCode: () => 200,
    getContentText: () => JSON.stringify({
      users: [{ email: who, emailVerified: true, localId: 'uid-' + who, providerUserInfo: [{ providerId: 'google.com' }] }]
    })
  };
}

/** 길이 100 이상인 가짜 토큰 (Code.gs 의 길이 검사를 통과하도록) */
function fakeToken(prefix) { return prefix + '-' + 'x'.repeat(120); }

/**
 * @param {object} o
 *   active      : 스크립트에 붙어 있는 가짜 스프레드시트 (없으면 null)
 *   property    : SPREADSHEET_ID 속성 값 ('' 이면 없음)
 *   registry    : { 가짜ID: 가짜스프레드시트 } — openById 가 찾는 곳
 *   fetch       : UrlFetchApp.fetch 대체
 *   lockOk      : tryLock 결과
 *   props       : 초기 스크립트 속성
 *   keyOverride : FIREBASE_API_KEY 값을 바꿔 불러올 때
 */
function createEnv(o) {
  o = o || {};
  const logs = [];
  const props = Object.assign({}, o.props || {});
  if (o.property) props.SPREADSHEET_ID = o.property;
  const registry = o.registry || {};
  const cacheStore = {};
  const env = {
    logs, props, cacheStore,
    SpreadsheetApp: {
      openById(id) {
        if (!registry[id]) throw new Error('Unable to open spreadsheet (모의: 없는 ID)');
        return registry[id];
      },
      getActiveSpreadsheet() { return o.active || null; },
      flush() {}
    },
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty(k) { return Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null; },
          setProperty(k, v) { props[k] = String(v); }
        };
      }
    },
    LockService: {
      getScriptLock() {
        return { tryLock() { return o.lockOk !== false; }, releaseLock() { env.lockReleased = (env.lockReleased || 0) + 1; } };
      }
    },
    CacheService: {
      // Code.gs v2 는 캐시를 쓰지 않는다. 쓰더라도 항상 비어 있는 캐시(= 캐시가 사라진 상황)로 만든다.
      getScriptCache() { return { get() { return null; }, put() {}, remove() {} }; }
    },
    UrlFetchApp: { fetch: o.fetch || defaultFetch },
    Utilities: {
      formatDate(d, tz, fmt) {
        const p = new Intl.DateTimeFormat('sv-SE', {
          timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        }).format(d);
        return p; // "yyyy-MM-dd HH:mm:ss"
      }
    },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput(text) {
        return { content: text, setMimeType() { return this; }, getContent() { return text; } };
      }
    },
    console: {
      log: (...a) => logs.push(['log', a.join(' ')]),
      error: (...a) => logs.push(['error', a.join(' ')]),
      warn: (...a) => logs.push(['warn', a.join(' ')])
    }
  };
  const ctx = vm.createContext(Object.assign({}, env));
  let src = fs.readFileSync(CODE_GS_PATH, 'utf8');
  if (o.keyOverride !== undefined) {
    src = src.replace(/const FIREBASE_API_KEY = '[^']*';/, "const FIREBASE_API_KEY = '" + o.keyOverride + "';");
  }
  vm.runInContext(src, ctx, { filename: 'Code.gs' });
  env.ctx = ctx;

  env.doGet = () => JSON.parse(vm.runInContext('doGet()', ctx).getContent());
  env.post = (bodyObj) => {
    ctx.__e = { postData: { contents: typeof bodyObj === 'string' ? bodyObj : JSON.stringify(bodyObj) } };
    return JSON.parse(vm.runInContext('doPost(__e)', ctx).getContent());
  };
  return env;
}

/** 새 형식(v2) 요청의 기본 본문 — 전부 지어낸 값 */
function v2Body(extra) {
  return Object.assign({
    action: 'request', v: 2, idToken: fakeToken('tokA'),
    name: '테스트고객', phone: '010-0000-0001', url: 'https://example.test/share/abc',
    size: 'L', address: '테스트시 예시구 가상로 1, 101동 101호', memo: '문 앞에 두세요', story: '테스트용 한 줄',
    consent: true, clientRef: 'ref-' + Math.random().toString(36).slice(2, 12) + '-aaaa'
  }, extra || {});
}

/** 옛 형식(v0 폼) 요청의 기본 본문 — app/app.js 가 보내는 항목과 같다 */
function legacyBody(extra) {
  return Object.assign({
    action: 'request', idToken: fakeToken('tokA'),
    name: '테스트고객', phone: '01000000002', url: 'https://example.test/share/old',
    consent: true, clientRef: 'old-' + Math.random().toString(36).slice(2, 12) + '-bbbb'
  }, extra || {});
}

/** 빈 REQUESTS 시트가 붙은 기본 환경 */
function freshEnv(o) {
  const ss = new FakeSpreadsheet('모의 스프레드시트');
  const env = createEnv(Object.assign({ active: ss }, o || {}));
  env.ss = ss;
  env.sheet = () => ss.getSheetByName('REQUESTS');
  return env;
}

module.exports = { createEnv, freshEnv, FakeSheet, FakeSpreadsheet, v2Body, legacyBody, fakeToken, defaultFetch, CODE_GS_PATH };
