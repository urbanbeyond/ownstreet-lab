/*
 * Code.gs v2 모의 테스트
 *
 * 실행: node backend/test/code-gs.test.js
 *
 * 이 테스트는 Apps Script 서비스를 흉내 낸 가짜 환경(mock-apps-script.js)에서
 * Code.gs 의 로직만 확인한다. 실제 Apps Script 서버, 실제 스프레드시트, 실제 Google 로그인과는
 * 아무 관련이 없다. "모의 테스트 통과"는 "실제 서버에서 확인함"이 아니다.
 * 테스트에 쓰는 이메일·이름·전화번호·주소·토큰은 전부 지어낸 값이다.
 */
'use strict';

const fs = require('fs');
const M = require('./mock-apps-script');
const { createEnv, freshEnv, FakeSheet, FakeSpreadsheet, v2Body, legacyBody, fakeToken } = M;

let passed = 0;
let failed = 0;
const failures = [];
let currentGroup = '';

function group(name) { currentGroup = name; console.log('\n# ' + name); }
function check(name, cond, detail) {
  if (cond) {
    passed++;
    console.log('  PASS  ' + name);
  } else {
    failed++;
    failures.push(currentGroup + ' / ' + name);
    console.log('  FAIL  ' + name + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : ''));
  }
}
function eq(name, actual, expected) {
  check(name, JSON.stringify(actual) === JSON.stringify(expected), { actual, expected });
}
const HEADERS_V2 = ['접수번호', '접수시간', '이메일', '이름', '전화번호', 'URL', '상태', '사이즈', '주소', '배송 요청', '한 줄 이야기', 'clientRef', '동의 시각'];
const HEADERS_V0 = HEADERS_V2.slice(0, 7);
const noReceipt = (r) => r.ok !== true && !('request_id' in r);

/* ------------------------------------------------------------ */
group('1. doGet (상태 확인)');
{
  const env = freshEnv();
  const g = env.doGet();
  eq('version 이 2', g.version, 2);
  eq('ok / ready / storage 가 true', [g.ok, g.ready, g.storage], [true, true, true]);
  check('고객 데이터 필드가 없다 (service/message 문자열만)', Object.keys(g).sort().join() === 'message,ok,ready,service,storage,version', Object.keys(g));
  check('doGet 은 시트를 만들거나 쓰지 않는다', env.sheet() === null);

  const noStore = createEnv({ active: null });
  const g2 = noStore.doGet();
  eq('저장소가 없으면 storage false, ready false', [g2.version, g2.storage, g2.ready], [2, false, false]);

  const badId = createEnv({ active: new FakeSpreadsheet('붙어 있는 시트'), property: 'FAKE_ID_NOT_REGISTERED' });
  const g3 = badId.doGet();
  eq('속성 ID 를 열 수 없으면 붙어 있는 시트로 몰래 바꾸지 않고 storage false', [g3.storage, g3.ready], [false, false]);

  const noKey = freshEnv({ keyOverride: '' });
  const g4 = noKey.doGet();
  eq('API 키가 비어 있으면 ready false (version 은 2)', [g4.version, g4.ready], [2, false]);
}

/* ------------------------------------------------------------ */
group('2. 옛 형식(v0 폼) 요청 — v 없음');
{
  const env = freshEnv();
  const r = env.post(legacyBody());
  eq('ok true, 접수번호 OS-0001', [r.ok, r.request_id], [true, 'OS-0001']);
  eq('성공 응답에 v: 2', r.v, 2);
  check('created_at 이 있다', /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(r.created_at), r.created_at);
  const sh = env.sheet();
  eq('머리글 13칸 (앞 7칸은 v0 순서 그대로)', sh.rows[0], HEADERS_V2);
  const row = sh.dataRows()[0];
  eq('앞 7칸: 번호·이메일·이름·전화·URL·상태', [row[0], row[2], row[3], row[4], row[5], row[6]],
    ['OS-0001', 'tester-a@example.test', '테스트고객', '010-0000-0002', 'https://example.test/share/old', '접수']);
  eq('사이즈·주소·배송 요청·한 줄은 비어 있다', [row[7], row[8], row[9], row[10]], ['', '', '', '']);
  check('clientRef 와 동의 시각은 저장된다', row[11].startsWith('old-') && row[12] === row[1], [row[11], row[12], row[1]]);

  const r2 = env.post(legacyBody({ clientRef: undefined }));
  eq('clientRef 없는 옛 요청도 받는다 (OS-0002)', [r2.ok, r2.request_id], [true, 'OS-0002']);
  eq('그 줄의 clientRef 칸은 비어 있다', env.sheet().dataRows()[1][11], '');

  const r3 = env.post(legacyBody({ v: 1 }));
  eq('v: 1 도 옛 형식으로 받는다', [r3.ok, r3.request_id], [true, 'OS-0003']);

  const r4 = env.post(legacyBody({ size: 'M', address: '테스트시 예시구 가상로 2' }));
  eq('옛 요청에 유효한 size/address 가 따라와도 저장한다', [r4.ok, env.sheet().dataRows()[3][7], env.sheet().dataRows()[3][8]], [true, 'M', '테스트시 예시구 가상로 2']);

  const bad = env.post(legacyBody({ size: 'XXL' }));
  eq('옛 요청이라도 size 가 있는데 틀리면 거절', [bad.ok, bad.code, bad.fields], [false, 'INVALID_INPUT', ['size']]);
  const bad2 = env.post(legacyBody({ name: '', phone: '123', url: 'ftp://x' }));
  eq('옛 요청의 name/phone/url 검증은 그대로', [bad2.code, bad2.fields], ['INVALID_INPUT', ['name', 'phone', 'url']]);
  eq('거절된 요청은 줄을 만들지 않는다', env.sheet().dataRows().length, 4);
}

/* ------------------------------------------------------------ */
group('3. 새 형식(v: 2) 요청');
{
  const env = freshEnv();
  const r = env.post(v2Body());
  eq('ok true, OS-0001, v: 2', [r.ok, r.request_id, r.v], [true, 'OS-0001', 2]);
  const row = env.sheet().dataRows()[0];
  eq('사이즈 L', row[7], 'L');
  eq('주소', row[8], '테스트시 예시구 가상로 1, 101동 101호');
  eq('배송 요청', row[9], '문 앞에 두세요');
  eq('한 줄 이야기(story)', row[10], '테스트용 한 줄');
  check('clientRef 저장', /^ref-/.test(row[11]), row[11]);
  check('동의 시각 저장', /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(row[12]), row[12]);
  eq('전화번호는 정규화되어 저장', row[4], '010-0000-0001');

  const r2 = env.post(v2Body({ memo: '', story: '' }));
  eq('배송 요청·한 줄은 비워도 된다', [r2.ok, r2.request_id], [true, 'OS-0002']);
  const r3 = env.post(v2Body({ memo: undefined, story: undefined }));
  eq('배송 요청·한 줄 항목이 아예 없어도 된다', [r3.ok, r3.request_id], [true, 'OS-0003']);

  ['S', 'M', 'L', 'XL', '2XL', '3XL'].forEach((s) => {
    const x = env.post(v2Body({ size: s }));
    check('사이즈 ' + s + ' 허용', x.ok === true, x);
  });

  const lines = env.post(v2Body({ address: '테스트시\n예시구   가상로 3', memo: '줄바꿈\t포함', story: '  앞뒤 공백  ' }));
  const lrow = env.sheet().dataRows().pop();
  eq('줄바꿈·연속 공백은 공백 하나로, 앞뒤 공백은 지움', [lines.ok, lrow[8], lrow[9], lrow[10]], [true, '테스트시 예시구 가상로 3', '줄바꿈 포함', '앞뒤 공백']);
}

/* ------------------------------------------------------------ */
group('4. 새 형식의 잘못된 입력 (줄이 생기면 안 된다)');
{
  const env = freshEnv();
  const before = () => (env.sheet() ? env.sheet().dataRows().length : 0);
  const cases = [
    ['사이즈 없음', { size: undefined }, ['size']],
    ['사이즈 XXL', { size: 'XXL' }, ['size']],
    ['사이즈 소문자 xl', { size: 'xl' }, ['size']],
    ['사이즈 숫자', { size: 5 }, ['size']],
    ['사이즈 빈 글자', { size: '' }, ['size']],
    ['주소 없음', { address: undefined }, ['address']],
    ['주소 4글자(너무 짧음)', { address: '가나다라' }, ['address']],
    ['주소 201글자(너무 김)', { address: '가'.repeat(201) }, ['address']],
    ['주소가 글자가 아님', { address: 12345 }, ['address']],
    ['배송 요청 301글자', { memo: '가'.repeat(301) }, ['memo']],
    ['배송 요청이 글자가 아님', { memo: { a: 1 } }, ['memo']],
    ['한 줄 201글자', { story: '가'.repeat(201) }, ['story']],
    ['한 줄이 글자가 아님', { story: ['x'] }, ['story']],
    ['clientRef 없음', { clientRef: undefined }, ['clientRef']],
    ['clientRef 형식 틀림', { clientRef: 'a b' }, ['clientRef']],
    ['여러 항목이 동시에 틀림', { size: 'Z', address: '', story: 5 }, ['size', 'address', 'story']]
  ];
  cases.forEach(([name, extra, fields]) => {
    const n = before();
    const r = env.post(v2Body(extra));
    check(name + ' → INVALID_INPUT ' + fields.join(','), r.ok === false && r.code === 'INVALID_INPUT' && JSON.stringify(r.fields) === JSON.stringify(fields) && noReceipt(r), r);
    check(name + ' → 줄이 늘지 않음', before() === n);
  });
  const edge = env.post(v2Body({ address: '가'.repeat(200), memo: '가'.repeat(300), story: '가'.repeat(200) }));
  check('경계값(주소 200, 배송 요청 300, 한 줄 200)은 허용', edge.ok === true, edge);
  const five = env.post(v2Body({ address: '가나다라마' }));
  check('주소 5글자는 허용', five.ok === true, five);

  const c = env.post(v2Body({ consent: false }));
  eq('동의 안 함 → CONSENT_REQUIRED', [c.ok, c.code], [false, 'CONSENT_REQUIRED']);
  const c2 = env.post(v2Body({ consent: 'true' }));
  eq('동의가 문자열 "true" 이면 거절', [c2.ok, c2.code], [false, 'CONSENT_REQUIRED']);
  eq('동의 없는 요청은 줄을 만들지 않는다', env.sheet().dataRows().length, 2);
}

/* ------------------------------------------------------------ */
group('5. 요청 형식 버전(v) 검사');
{
  const env = freshEnv();
  const r3 = env.post(v2Body({ v: 3 }));
  eq('v: 3 (서버가 모르는 새 형식) → VERSION_MISMATCH', [r3.ok, r3.code], [false, 'VERSION_MISMATCH']);
  check('v: 3 에 접수번호 없음', noReceipt(r3));
  ['2', 0, -1, 2.5, true, 'x', {}].forEach((v) => {
    const r = env.post(v2Body({ v }));
    check('잘못된 v ' + JSON.stringify(v) + ' → BAD_REQUEST', r.ok === false && r.code === 'BAD_REQUEST', r);
  });
  eq('v 를 null 로 보내면 옛 형식으로 받는다', env.post(legacyBody({ v: null })).ok, true);
  eq('action 이 틀리면 BAD_REQUEST', env.post(v2Body({ action: 'myOrders' })).code, 'BAD_REQUEST');
  eq('본문이 JSON 이 아니면 BAD_REQUEST', env.post('이건 JSON 이 아님').code, 'BAD_REQUEST');
  eq('본문이 비어 있으면 BAD_REQUEST', env.post('').code, 'BAD_REQUEST');
  eq('본문이 숫자 JSON 이어도 BAD_REQUEST', env.post('5').code, 'BAD_REQUEST');
  check('거절된 요청 뒤에도 시트에 줄이 없다', env.sheet() === null || env.sheet().dataRows().length === 1);
}

/* ------------------------------------------------------------ */
group('6. 같은 clientRef 중복');
{
  const env = freshEnv();
  const body = v2Body({ clientRef: 'dup-ref-0001-aaaa' });
  const a = env.post(body);
  const b = env.post(body);
  eq('첫 요청 OS-0001', [a.ok, a.request_id], [true, 'OS-0001']);
  eq('같은 요청을 다시 보내면 같은 번호 + duplicate', [b.ok, b.request_id, b.duplicate, b.v], [true, 'OS-0001', true, 2]);
  eq('created_at 도 처음 것과 같다', b.created_at, a.created_at);
  eq('줄은 하나뿐 (이 테스트의 캐시는 항상 비어 있으므로, 시트에서 찾아서 막은 것)', env.sheet().dataRows().length, 1);

  const other = env.post(Object.assign({}, body, { idToken: fakeToken('tokB'), clientRef: 'dup-ref-0001-aaaa' }));
  eq('다른 사람이 같은 clientRef 를 써도 남의 번호를 돌려주지 않는다 (새 OS-0002)', [other.ok, other.request_id, other.duplicate], [true, 'OS-0002', undefined]);
  const again = env.post(Object.assign({}, body, { idToken: fakeToken('tokB') }));
  eq('그 사람이 다시 보내면 자기 번호(OS-0002)', [again.request_id, again.duplicate], ['OS-0002', true]);
  const newRef = env.post(Object.assign({}, body, { clientRef: 'dup-ref-0002-aaaa' }));
  eq('clientRef 가 다르면 새 접수 (OS-0003)', [newRef.request_id, newRef.duplicate], ['OS-0003', undefined]);

  const l1 = env.post(legacyBody({ clientRef: 'legacy-ref-0001-b' }));
  const l2 = env.post(legacyBody({ clientRef: 'legacy-ref-0001-b' }));
  eq('옛 형식 요청의 중복도 시트에서 찾는다', [l1.request_id, l2.request_id, l2.duplicate], ['OS-0004', 'OS-0004', true]);
  eq('줄 수는 4', env.sheet().dataRows().length, 4);

  // 옛 코드가 쓴 줄(7칸, clientRef 열 없음)이 있는 시트에서도 문제없이 동작
  const old = freshEnv();
  const sh = new FakeSheet('REQUESTS', 7);
  old.ss.addSheet(sh);
  sh.seedRow(1, HEADERS_V0);
  sh.seedRow(2, ['OS-0001', '2026-01-01 00:00:00', 'tester-z@example.test', '옛고객', '010-0000-0009', 'https://example.test/old', '접수']);
  const o1 = old.post(v2Body({ clientRef: 'after-old-0001-zz' }));
  eq('7칸짜리 옛 시트(열이 7개뿐)에서도 받고 다음 번호는 OS-0002', [o1.ok, o1.request_id], [true, 'OS-0002']);
}

/* ------------------------------------------------------------ */
group('7. 로그인 토큰 확인 실패');
{
  const env = freshEnv();
  const r = env.post(v2Body({ idToken: fakeToken('bad') }));
  eq('Google 이 400 → AUTH_INVALID', [r.ok, r.code], [false, 'AUTH_INVALID']);
  check('접수번호 없음 / 줄 없음', noReceipt(r) && (env.sheet() === null || env.sheet().dataRows().length === 0));
  eq('토큰이 짧으면 AUTH_INVALID (Google 에 묻지 않음)', env.post(v2Body({ idToken: 'short' })).code, 'AUTH_INVALID');
  eq('토큰이 없으면 AUTH_INVALID', env.post(v2Body({ idToken: undefined })).code, 'AUTH_INVALID');

  const netDown = freshEnv({ fetch: () => { throw new Error('모의: 네트워크 끊김'); } });
  const n = netDown.post(v2Body());
  eq('확인 서버 연결 실패 → AUTH_UNAVAILABLE', [n.ok, n.code], [false, 'AUTH_UNAVAILABLE']);
  check('연결 실패에도 줄이 없다', noReceipt(n) && netDown.sheet() === null);

  const server5xx = freshEnv({ fetch: () => ({ getResponseCode: () => 503, getContentText: () => '{}' }) });
  eq('Google 5xx → AUTH_UNAVAILABLE', server5xx.post(v2Body()).code, 'AUTH_UNAVAILABLE');

  const keyBad = freshEnv({ fetch: () => ({ getResponseCode: () => 403, getContentText: () => JSON.stringify({ error: { message: 'API key not valid' } }) }) });
  eq('API 키 문제(403) → NOT_CONFIGURED', keyBad.post(v2Body()).code, 'NOT_CONFIGURED');

  const unverified = freshEnv({ fetch: () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ users: [{ email: 'tester-a@example.test', emailVerified: false, providerUserInfo: [{ providerId: 'google.com' }] }] }) }) });
  eq('이메일 미인증 → AUTH_INVALID', unverified.post(v2Body()).code, 'AUTH_INVALID');
  const notGoogle = freshEnv({ fetch: () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ users: [{ email: 'tester-a@example.test', emailVerified: true, providerUserInfo: [{ providerId: 'password' }] }] }) }) });
  eq('Google 로그인이 아니면 AUTH_INVALID', notGoogle.post(v2Body()).code, 'AUTH_INVALID');
  const disabled = freshEnv({ fetch: () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ users: [{ email: 'tester-a@example.test', emailVerified: true, disabled: true, providerUserInfo: [{ providerId: 'google.com' }] }] }) }) });
  eq('정지된 계정 → AUTH_INVALID', disabled.post(v2Body()).code, 'AUTH_INVALID');

  const noKey = freshEnv({ keyOverride: '' });
  eq('API 키가 비어 있으면 NOT_CONFIGURED', noKey.post(v2Body()).code, 'NOT_CONFIGURED');

  // 로그인이 실패하면 입력 검증보다 먼저 막힌다 (잘못된 입력 + 잘못된 토큰 → AUTH_INVALID)
  eq('로그인 실패가 입력 검증보다 먼저', env.post(v2Body({ idToken: fakeToken('bad'), size: 'Z' })).code, 'AUTH_INVALID');
}

/* ------------------------------------------------------------ */
group('8. 저장 뒤 다시 읽기 실패 — 거짓 성공이 없어야 한다');
{
  // (a) 쓰기가 사라짐: setValues 가 아무것도 안 함
  const a = freshEnv();
  a.post(v2Body()); // 시트와 머리글을 먼저 만든다 (OS-0001 은 성공)
  a.sheet().hooks.dropWrites = true;
  const ra = a.post(v2Body());
  eq('(a) 쓰기가 사라지면 ok false / SERVER_ERROR', [ra.ok, ra.code], [false, 'SERVER_ERROR']);
  check('(a) 응답에 접수번호가 없다', noReceipt(ra), ra);
  eq('(a) 저장 번호 기록(OS_LAST_SEQ)이 올라가지 않았다', a.props.OS_LAST_SEQ, '1');
  check('(a) 오류가 로그에 남았다', a.logs.some((l) => l[0] === 'error' && /저장 확인 실패/.test(l[1])), a.logs);
  a.sheet().hooks.dropWrites = false;
  const ra2 = a.post(v2Body());
  eq('(a) 쓰기가 돌아온 뒤 다음 요청은 OS-0002 (사라진 번호를 건너뛰지도, 겹치지도 않음)', ra2.request_id, 'OS-0002');

  // (b) 다시 읽은 값이 다름
  const b = freshEnv();
  b.post(v2Body());
  b.sheet().hooks.readTweak = (vals, row, col) => (row > 1 && col === 1 && vals[0].length === 13 ? [vals[0].map((v, i) => (i === 2 ? 'someone-else@example.test' : v))] : vals);
  const rb = b.post(v2Body());
  eq('(b) 읽은 이메일이 다르면 실패', [rb.ok, rb.code], [false, 'SERVER_ERROR']);
  check('(b) 응답에 접수번호가 없다', noReceipt(rb));

  // (c) 읽기 자체가 오류
  const c = freshEnv();
  c.post(v2Body());
  c.sheet().hooks.readFail = true;
  const rc = c.post(v2Body());
  eq('(c) 다시 읽기가 오류 → SERVER_ERROR', [rc.ok, rc.code], [false, 'SERVER_ERROR']);
  check('(c) 응답에 접수번호가 없다', noReceipt(rc));

  // (d) 줄이 끝까지 안 써짐: 맨 끝 칸(동의 시각)이 비어 있음
  const d = freshEnv();
  d.post(v2Body());
  d.sheet().hooks.readTweak = (vals, row, col) => (row > 1 && col === 1 && vals[0].length === 13 ? [vals[0].map((v, i) => (i === 12 ? '' : v))] : vals);
  const rd = d.post(v2Body());
  eq('(d) 맨 끝 칸이 비어 있으면(줄이 끝까지 안 써짐) 실패', [rd.ok, rd.code], [false, 'SERVER_ERROR']);

  // (e) 저장은 됐는데 읽기 확인에서 실패한 뒤, 같은 요청을 다시 보내면 줄이 하나 더 생기지 않는다
  const e = freshEnv();
  e.post(v2Body());
  const body = v2Body({ clientRef: 'retry-ref-0001-zz' });
  e.sheet().hooks.readTweak = (vals, row, col) => (row > 1 && col === 1 && vals[0].length === 13 ? [vals[0].map((v, i) => (i === 2 ? 'x@example.test' : v))] : vals);
  const e1 = e.post(body);
  eq('(e) 1차: 실패로 보인다', [e1.ok, e1.code], [false, 'SERVER_ERROR']);
  e.sheet().hooks.readTweak = null;
  const e2 = e.post(body);
  eq('(e) 2차(같은 clientRef): 이미 저장된 줄의 번호를 돌려준다', [e2.ok, e2.request_id, e2.duplicate], [true, 'OS-0002', true]);
  eq('(e) 줄은 총 2개 (중복 줄 없음)', e.sheet().dataRows().length, 2);

  // (f) 저장소를 열 수 없음
  const f = createEnv({ active: null });
  const rf = f.post(v2Body());
  eq('(f) 저장소가 없으면 SERVER_ERROR + 접수번호 없음', [rf.ok, rf.code, noReceipt(rf)], [false, 'SERVER_ERROR', true]);

  // (g) 잘못된 SPREADSHEET_ID 속성: 붙어 있는 시트로 몰래 바꾸지 않는다
  const attached = new FakeSpreadsheet('붙어 있는 시트');
  const g = createEnv({ active: attached, property: 'FAKE_ID_NOT_REGISTERED' });
  const rg = g.post(v2Body());
  eq('(g) 속성 ID 를 못 열면 실패', [rg.ok, rg.code], [false, 'SERVER_ERROR']);
  check('(g) 붙어 있는 시트에는 아무것도 쓰지 않았다', attached.getSheetByName('REQUESTS') === null);

  // (h) 잠금을 못 잡음
  const h = freshEnv({ lockOk: false });
  const rh = h.post(v2Body());
  eq('(h) 잠금 실패 → BUSY, 줄 없음', [rh.ok, rh.code, h.sheet() === null], [false, 'BUSY', true]);

  // 잠금은 성공/실패와 상관없이 풀린다
  check('성공·실패 요청 뒤에도 잠금이 풀린다', a.lockReleased >= 3, a.lockReleased);
}

/* ------------------------------------------------------------ */
group('9. 시트 열과 머리글');
{
  // 빈 시트
  const fresh = freshEnv();
  fresh.post(v2Body());
  eq('빈 시트: 머리글 13칸, 1~7 이 v0 순서 그대로', fresh.sheet().rows[0], HEADERS_V2);
  eq('첫 줄 고정', fresh.sheet().frozen, 1);
  eq('새 열은 상태 열(7번째) 뒤: 사이즈가 8번째, 동의 시각이 13번째', [HEADERS_V2.indexOf('사이즈'), HEADERS_V2.indexOf('동의 시각')], [7, 12]);

  // 헤더 7칸 + 옛 데이터가 이미 있는 시트
  const env = freshEnv();
  const sh = new FakeSheet('REQUESTS', 26);
  env.ss.addSheet(sh);
  sh.seedRow(1, HEADERS_V0);
  sh.seedRow(2, ['OS-0001', '2026-01-01 10:00:00', 'tester-z@example.test', '옛고객1', '010-0000-0010', 'https://example.test/a', '접수']);
  sh.seedRow(3, ['OS-0002', '2026-01-01 11:00:00', 'tester-y@example.test', '옛고객2', '010-0000-0011', 'https://example.test/b', '입금확인']);
  const snapshot = JSON.stringify(sh.rows.slice(1).map((r) => r.slice(0, 7)));
  const r = env.post(v2Body());
  eq('옛 시트: 접수 성공, 다음 번호 OS-0003', [r.ok, r.request_id], [true, 'OS-0003']);
  eq('옛 시트: 머리글 8~13 이 채워졌다', sh.rows[0], HEADERS_V2);
  eq('옛 시트: 기존 두 줄의 1~7 칸은 그대로', JSON.stringify(sh.rows.slice(1, 3).map((x) => x.slice(0, 7))), snapshot);
  eq('옛 시트: 기존 줄의 새 칸은 비어 있다', [sh.get(2, 8), sh.get(3, 13)], [undefined, undefined]);
  eq('옛 시트: 새 줄은 4번째 줄에 붙었다', sh.get(4, 1), 'OS-0003');

  // 7칸까지만 있는 시트(열이 부족)
  const narrow = freshEnv();
  const nsh = new FakeSheet('REQUESTS', 7);
  narrow.ss.addSheet(nsh);
  nsh.seedRow(1, HEADERS_V0);
  const rn = narrow.post(v2Body());
  eq('열이 7개뿐인 시트도 열을 늘려서 받는다', [rn.ok, nsh.getMaxColumns() >= 13], [true, true]);

  // 의장이 1~7 열 이름을 바꿔 둔 시트: 덮어쓰지 않는다
  const renamed = freshEnv();
  const rsh = new FakeSheet('REQUESTS', 26);
  renamed.ss.addSheet(rsh);
  rsh.seedRow(1, ['번호', '시간', '메일', '이름', '전화', 'URL', '진행상황']);
  const rr = renamed.post(v2Body());
  eq('1~7 열 이름이 달라도 접수된다 (이름은 덮어쓰지 않음)', [rr.ok, rsh.get(1, 7), rsh.get(1, 8)], [true, '진행상황', '사이즈']);

  // 8번째 열에 이미 다른 내용이 있음: 덮어쓰지 않고 멈춘다
  const conflict = freshEnv();
  const csh = new FakeSheet('REQUESTS', 26);
  conflict.ss.addSheet(csh);
  csh.seedRow(1, HEADERS_V0.concat(['내 메모']));
  const rcf = conflict.post(v2Body());
  eq('8번째 열에 다른 이름이 있으면 실패(SERVER_ERROR)', [rcf.ok, rcf.code], [false, 'SERVER_ERROR']);
  eq('그 열의 이름은 덮어쓰지 않았다', csh.get(1, 8), '내 메모');
  check('줄을 쓰지 않았다', csh.getLastRow() === 1);
  check('로그에 머리글 충돌이 남았다', conflict.logs.some((l) => /머리글 충돌/.test(l[1])), conflict.logs);

  // 텍스트 형식: 번호·시간·전화·주소가 날짜/숫자로 바뀌지 않도록 새 줄 전체를 '@' 로
  const fmtRow = fresh.sheet().getLastRow();
  const allText = Array.from({ length: 13 }, (_, i) => fresh.sheet().formats[fmtRow + ',' + (i + 1)] === '@').every(Boolean);
  check('새 줄 13칸 모두 텍스트 형식(@)', allText);

  // 번호 규칙: 저장된 번호가 시트의 최대 번호보다 낮아도 시트 최대 + 1
  const seq = freshEnv({ props: { OS_LAST_SEQ: '2' } });
  const ssh = new FakeSheet('REQUESTS', 26);
  seq.ss.addSheet(ssh);
  ssh.seedRow(1, HEADERS_V0);
  ssh.seedRow(2, ['OS-0007', '2026-01-01 10:00:00', 'tester-z@example.test', '옛', '010-0000-0010', 'https://example.test/a', '접수']);
  eq('저장된 번호(2)보다 시트의 최대(7)가 크면 OS-0008', seq.post(v2Body()).request_id, 'OS-0008');
  const seq2 = freshEnv({ props: { OS_LAST_SEQ: '9' } });
  eq('시트가 비었어도 저장된 번호(9)가 있으면 OS-0010 (번호 재사용 없음)', seq2.post(v2Body()).request_id, 'OS-0010');
  const big = freshEnv({ props: { OS_LAST_SEQ: '9999' } });
  eq('10000 번 이상은 자리 수가 늘어난다', big.post(v2Body()).request_id, 'OS-10000');
}

/* ------------------------------------------------------------ */
group('10. 시트 수식 주입 막기 (safeCell_)');
{
  const env = freshEnv();
  const r = env.post(v2Body({ name: '=1+1', address: '=HYPERLINK("x")', memo: '+가짜수식', story: '@가짜', url: 'https://example.test/-x' }));
  eq('접수는 된다', r.ok, true);
  const row = env.sheet().dataRows()[0];
  eq('이름 =로 시작 → 작은따옴표 접두', row[3], "'=1+1");
  eq('주소 =로 시작 → 작은따옴표 접두', row[8].slice(0, 2), "'=");
  eq('배송 요청 +로 시작 → 접두', row[9], "'+가짜수식");
  eq('한 줄 @로 시작 → 접두', row[10], "'@가짜");
  eq('URL 은 http 로 시작해서 그대로', row[5], 'https://example.test/-x');
  const r2 = env.post(v2Body({ address: '-5 테스트로 1', memo: '-1', story: '정상 문장' }));
  const row2 = env.sheet().dataRows()[1];
  eq('-로 시작하는 주소·요청에도 접두', [r2.ok, row2[8].charAt(0), row2[9].charAt(0), row2[10]], [true, "'", "'", '정상 문장']);
}

/* ------------------------------------------------------------ */
group('11. 소스 파일 점검 (비밀값·ID 가 코드에 없는지)');
{
  const src = fs.readFileSync(M.CODE_GS_PATH, 'utf8');
  check('openById 에 글자 그대로의 ID 를 넣지 않았다 (속성에서 읽는다)', !/openById\(\s*['"`]/.test(src));
  check('44자 안팎의 스프레드시트 ID 처럼 보이는 긴 글자가 없다', !/['"][A-Za-z0-9_-]{40,}['"]/.test(src));
  check('Script Properties 에서 SPREADSHEET_ID 를 읽는다', /getProperty\(SPREADSHEET_ID_PROPERTY\)/.test(src));
  check('이메일 주소가 코드에 하드코딩되어 있지 않다', !/[A-Za-z0-9._-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/@가짜/g, '')), 'email-like text');
  const testSrc = fs.readFileSync(__filename, 'utf8') + fs.readFileSync(require.resolve('./mock-apps-script'), 'utf8');
  const emails = testSrc.match(/[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.[A-Za-z]+/g) || [];
  check('테스트에 쓴 이메일은 전부 @example.test 뿐이다', emails.length > 0 && emails.every((m) => /@example\.test$/.test(m)), emails.filter((m) => !/@example\.test$/.test(m)));
}

/* ------------------------------------------------------------ */
group('12. 단계별 시간 로그 (동작은 그대로, 고객 정보는 로그에 없음)');
{
  const env = freshEnv();
  const body = v2Body({ clientRef: 'log-ref-0001-aaaa', name: '로그확인이름', address: '로그확인시 가상구 비밀로 99', memo: '로그확인메모', story: '로그확인한줄' });
  const r = env.post(body);
  const timing = () => env.logs.filter((l) => l[0] === 'log' && /^\[타이밍\]/.test(l[1])).map((l) => l[1]);
  eq('성공 요청: 타이밍 로그가 한 줄', timing().length, 1);
  const line = timing()[0];
  check('결과와 접수번호가 들어 있다', /결과=ok OS-0001 /.test(line), line);
  check('합계 시간이 있다', /합계 \d+ms/.test(line), line);
  ['로그인확인', '입력확인', '잠금대기', '시트열기+머리글', '중복찾기', '번호계산', '쓰기', '다시읽기', '번호기록'].forEach((step) => {
    check('단계 "' + step + '" 시간이 있다', new RegExp(step.replace('+', '\\+') + ' \\d+ms').test(line), line);
  });
  check('시트 줄 수(숫자)가 있다', /시트 줄 수 \d+/.test(line), line);
  const everything = env.logs.map((l) => l[1]).join('\n');
  ['tester-a@example.test', '로그확인이름', '로그확인시', '비밀로', '로그확인메모', '로그확인한줄', '010-0000-0001', 'tokA', 'example.test/share', 'log-ref-0001'].forEach((secret) => {
    check('로그에 "' + secret + '" 가 없다', everything.indexOf(secret) === -1, everything);
  });
  eq('응답 모양은 그대로', Object.keys(r).sort().join(), 'created_at,ok,request_id,v');

  env.post(body);
  check('중복 요청: 결과에 duplicate 표시', timing().some((x) => /결과=ok OS-0001 \(duplicate\)/.test(x)), timing());
  env.post(v2Body({ idToken: fakeToken('bad') }));
  check('로그인 실패: 결과=AUTH_INVALID, 잠금·쓰기 단계는 없다', timing().some((x) => /결과=AUTH_INVALID/.test(x) && !/잠금대기/.test(x) && !/쓰기/.test(x)), timing());
  env.post(v2Body({ size: 'Z' }));
  check('입력 오류: 결과=INVALID_INPUT', timing().some((x) => /결과=INVALID_INPUT/.test(x)), timing());
  env.sheet().hooks.dropWrites = true;
  env.post(v2Body());
  check('저장 확인 실패: 타이밍 줄에 결과=EXCEPTION, 단계는 쓰기까지 (줄은 계속 남음)', timing().some((x) => /결과=EXCEPTION/.test(x) && /쓰기 \d+ms/.test(x) && !/다시읽기/.test(x)), timing());
  env.sheet().hooks.dropWrites = false;
  const busy = freshEnv({ lockOk: false });
  busy.post(v2Body());
  check('잠금 실패: 결과=BUSY + 잠금대기 시간', busy.logs.some((l) => /결과=BUSY/.test(l[1]) && /잠금대기 \d+ms/.test(l[1])), busy.logs);
  eq('이 모든 요청 뒤에도 접수번호 규칙은 그대로 (성공 1건만 저장)', env.sheet().dataRows().length, 1);
}

/* ------------------------------------------------------------ */
console.log('\n==============================');
console.log('통과 ' + passed + ' / 실패 ' + failed + ' / 합계 ' + (passed + failed));
if (failed) {
  console.log('실패한 항목:');
  failures.forEach((f) => console.log(' - ' + f));
  process.exit(1);
}
