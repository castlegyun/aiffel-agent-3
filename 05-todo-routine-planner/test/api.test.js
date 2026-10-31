// PRD [완료 기준] 확인표를 API로 자동 점검한다. 실행: npm test
// 매번 임시 DB 파일로 서버를 새로 띄우므로 내 todo.db 는 건드리지 않는다.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PORT}/api`;
const DB_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'todo-test-')), 'test.db');
let server;

function startServer() {
  server = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
    env: { ...process.env, PORT: String(PORT), DB_FILE, TZ: 'Asia/Seoul' },
    stdio: 'ignore',
  });
}

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`${BASE}/reasons`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('서버가 뜨지 않았어요');
}

async function stopServer() {
  if (!server) return;
  const exited = new Promise((r) => server.once('exit', r));
  server.kill();
  await exited;
}

async function api(method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json();
  return { status: res.status, data };
}

const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = fmt(new Date());
// 오늘 이후 첫 번째 '그 요일' 날짜 (1=월 … 7=일)
function nextWeekday(n) {
  const d = new Date();
  for (let i = 1; i <= 7; i++) {
    d.setDate(d.getDate() + 1);
    if ((d.getDay() === 0 ? 7 : d.getDay()) === n) return fmt(d);
  }
}
const day = async (date) => (await api('GET', `/days/${date}`)).data.todos;

before(async () => {
  startServer();
  await waitForServer();
});
after(stopServer);

test('잘못된 입력은 저장되지 않고 이유가 돌아온다', async () => {
  const cases = [
    ['/todos', { title: '   ', date: today }],
    ['/todos', { title: 'x', date: today, end_time: '09:00' }],
    ['/todos', { title: 'x', date: today, start_time: '25:00' }],
    ['/routines', { title: 'x', start_time: '09:00', repeat_days: [1] }],
    ['/routines', { title: 'x', start_time: '10:00', end_time: '09:00', repeat_days: [1] }],
    ['/routines', { title: 'x', start_time: '09:00', end_time: '10:00', repeat_days: [] }],
  ];
  for (const [url, body] of cases) {
    const { status, data } = await api('POST', url, body);
    assert.equal(status, 400, JSON.stringify(body));
    assert.ok(data.error);
  }
});

test('반복 생성: 월·수·금 루틴은 그 요일에만, 새로고침해도 한 번만', async () => {
  await api('POST', '/routines', { title: '운동', start_time: '18:00', end_time: '19:00', repeat_days: [1, 3, 5] });
  const mon = nextWeekday(1);
  const tue = nextWeekday(2);
  await day(mon);
  const twice = await day(mon);
  assert.equal(twice.filter((t) => t.title === '운동').length, 1);
  assert.equal((await day(tue)).filter((t) => t.title === '운동').length, 0);
});

test('기록 보존: 루틴을 고치면 오늘은 그대로, 내일부터 바뀐다', async () => {
  const { data: r } = await api('POST', '/routines', { title: '공부', start_time: '09:00', end_time: '10:00', repeat_days: [1, 2, 3, 4, 5, 6, 7] });
  const tomorrow = fmt(new Date(Date.now() + 864e5));
  await day(today);
  await day(tomorrow);
  await api('PATCH', `/routines/${r.id}`, { title: '공부 (수정)', start_time: '10:00', end_time: '11:00' });
  const t0 = (await day(today)).find((t) => t.routine_id === r.id);
  const t1 = (await day(tomorrow)).find((t) => t.routine_id === r.id);
  assert.equal(t0.title, '공부');
  assert.equal(t0.start_time, '09:00');
  assert.equal(t1.title, '공부 (수정)');
  assert.equal(t1.start_time, '10:00');
});

test('상태·회고 저장, 다음 날에 지난번 다짐과 날짜가 보인다, 서버 재시작 후에도 남는다', async () => {
  const { data: r } = await api('POST', '/routines', { title: '독서', start_time: '07:00', end_time: '07:30', repeat_days: [1, 2, 3, 4, 5, 6, 7] });
  const t = (await day(today)).find((x) => x.routine_id === r.id);
  assert.equal(t.status, 'todo'); // 처음은 미기록

  assert.equal((await api('PATCH', `/todos/${t.id}`, { status: 'missed' })).status, 200);
  const saved = await api('PUT', `/todos/${t.id}/reflection`, { reason_id: 2, actual: '영상 시청', next_action: '폰을 다른 방에' });
  assert.equal(saved.status, 200);

  const tomorrow = fmt(new Date(Date.now() + 864e5));
  const next = (await day(tomorrow)).find((x) => x.routine_id === r.id);
  assert.equal(next.last_next_action, '폰을 다른 방에');
  assert.equal(next.last_next_date, today);
  // 같은 날짜에는 자기 회고가 '지난번'으로 보이지 않는다
  assert.equal((await day(today)).find((x) => x.id === t.id).last_next_action, null);

  await stopServer();
  startServer();
  await waitForServer();
  const after = (await day(today)).find((x) => x.id === t.id);
  assert.equal(after.status, 'missed');
  assert.equal(after.next_action, '폰을 다른 방에');
});

test('회고는 일부만·못 함 항목에만, 완료로 바꾸면 회고는 지워진다', async () => {
  const { data: t } = await api('POST', '/todos', { title: '정리', date: today });
  assert.equal((await api('PUT', `/todos/${t.id}/reflection`, { actual: 'x' })).status, 400);
  await api('PATCH', `/todos/${t.id}`, { status: 'partial' });
  await api('PUT', `/todos/${t.id}/reflection`, { actual: '반만 함' });
  await api('PATCH', `/todos/${t.id}`, { status: 'done' });
  assert.equal((await day(today)).find((x) => x.id === t.id).actual, null);
});

test('미래 계획: 미래 날짜의 할 일은 그 날짜에서 보인다', async () => {
  const future = fmt(new Date(Date.now() + 20 * 864e5));
  await api('POST', '/todos', { title: '발표', date: future, start_time: '10:00', end_time: '11:00' });
  assert.ok((await day(future)).some((t) => t.title === '발표'));
});

test('반복 종료: 내일부터 생기지 않고 오늘 기록은 남는다', async () => {
  const { data: r } = await api('POST', '/routines', { title: '산책', start_time: '20:00', end_time: '20:30', repeat_days: [1, 2, 3, 4, 5, 6, 7] });
  const tomorrow = fmt(new Date(Date.now() + 864e5));
  await day(today);
  await day(tomorrow);
  assert.equal((await api('POST', `/routines/${r.id}/end`)).status, 200);
  assert.ok((await day(today)).some((t) => t.routine_id === r.id));
  assert.ok(!(await day(tomorrow)).some((t) => t.routine_id === r.id));
  const list = (await api('GET', '/routines')).data;
  assert.ok(!list.some((x) => x.id === r.id));
});

test('삭제: 한 번짜리는 지워지고, 루틴 항목은 그날만 빠진다', async () => {
  const { data: t } = await api('POST', '/todos', { title: '지울 일', date: today });
  assert.equal((await api('DELETE', `/todos/${t.id}`)).status, 204);
  assert.ok(!(await day(today)).some((x) => x.id === t.id));

  const { data: r } = await api('POST', '/routines', { title: '빼볼 루틴', start_time: '06:00', end_time: '06:10', repeat_days: [1, 2, 3, 4, 5, 6, 7] });
  const item = (await day(today)).find((x) => x.routine_id === r.id);
  await api('DELETE', `/todos/${item.id}`);
  assert.ok(!(await day(today)).some((x) => x.routine_id === r.id)); // 다시 생기지 않는다
  const tomorrow = fmt(new Date(Date.now() + 2 * 864e5));
  assert.ok((await day(tomorrow)).some((x) => x.routine_id === r.id)); // 다른 날은 그대로
});

test('SQL 주입 시도는 글자 그대로 저장될 뿐 DB를 바꾸지 않는다', async () => {
  const evil = "x'); DROP TABLE todos; --";
  const { status } = await api('POST', '/todos', { title: evil, date: today });
  assert.equal(status, 201);
  assert.ok((await day(today)).some((t) => t.title === evil));
  assert.equal((await api('GET', '/days/2026-01-01; DROP TABLE todos')).status, 400);
});

test('보안: 깨진 요청에 내부 정보가 보이지 않고, 다른 Host는 거절되고, 보안 헤더가 있다', async () => {
  const bad = await fetch(`${BASE}/todos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
  assert.equal(bad.status, 400);
  const text = await bad.text();
  assert.ok(!text.includes('/Users/') && !text.includes('at '), text);

  const http = require('node:http');
  const status = await new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path: '/api/reasons', headers: { Host: 'evil.example' } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    }).on('error', reject);
  });
  assert.equal(status, 403);

  const page = await fetch(`http://localhost:${PORT}/`);
  assert.equal(page.headers.get('x-powered-by'), null);
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(page.headers.get('content-security-policy').includes("script-src 'self'"));
});

