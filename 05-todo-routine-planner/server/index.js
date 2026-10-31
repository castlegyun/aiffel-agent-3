// 백엔드 API. 화면(public/)은 여기 /api 주소에만 요청하고, DB는 이 서버만 만진다.
// 저장소는 두 가지: SUPABASE_URL 이 있으면 Supabase(로그인 + RLS), 없으면 로컬 SQLite.
process.env.TZ = process.env.TZ || 'Asia/Seoul'; // 날짜 기준: 한국 시간
const path = require('path');
const express = require('express');
const supabase = require('./store/supabase');
const auth = require('./auth');

const MODE = supabase.configured() ? 'supabase' : 'local';
const localStore = MODE === 'local' ? require('./store/sqlite') : null;

const app = express();
app.disable('x-powered-by'); // 서버 종류를 알리지 않는다
app.set('trust proxy', 1); // 배포(Render) 때 앞단 프록시를 믿어야 https 쿠키가 동작한다

// 기본은 내 컴퓨터에서만 접속(127.0.0.1). 같은 와이파이의 다른 기기가 들어오지 못하게 한다.
const HOST = process.env.HOST || '127.0.0.1';
const LOOPBACK = ['127.0.0.1', 'localhost', '::1'];

// 내 컴퓨터 전용으로 띄웠을 때는 주소창의 이름(Host)도 localhost 계열만 받는다.
// 다른 사이트가 DNS를 바꿔치기해 이 서버에 접근하는 공격(DNS rebinding)을 막는다.
app.use((req, res, next) => {
  if (!LOOPBACK.includes(HOST)) return next();
  const hostname = (req.hostname || '').replace(/^\[|\]$/g, '');
  if (!LOOPBACK.includes(hostname)) return res.status(403).json({ error: '허용되지 않은 주소예요' });
  next();
});

// 기본 보안 헤더
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
      "font-src https://fonts.gstatic.com https://cdn.jsdelivr.net",
      "img-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'self'",
    ].join('; '),
  });
  next();
});

app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const STATUSES = ['todo', 'done', 'partial', 'missed'];

// 사용자에게 그대로 보여 줘도 되는 오류 (입력 검사 등)
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}
const bad = (msg) => new HttpError(400, msg);
const notFound = (msg) => new HttpError(404, msg);

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// '2026-10-30' → 1(월) … 7(일)
function weekdayOf(date) {
  const [y, m, d] = date.split('-').map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return day === 0 ? 7 : day;
}

function cleanDate(v) {
  if (typeof v !== 'string' || !DATE_RE.test(v) || Number.isNaN(Date.parse(v))) throw bad('날짜 형식이 올바르지 않아요');
  return v;
}

function cleanTime(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !TIME_RE.test(v)) throw bad('시간은 HH:MM 형식이어야 해요');
  return v;
}

// 시작·종료 시간 짝 검사. required 면 둘 다 필수.
function checkTimes(start, end, required) {
  if (required && (!start || !end)) throw bad('루틴은 시작·종료 시간이 모두 필요해요');
  if (end && !start) throw bad('종료 시간만 있을 수는 없어요. 시작 시간도 넣어 주세요');
  if (start && end && end <= start) throw bad('종료 시간은 시작 시간보다 늦어야 해요 (자정을 넘는 일정은 아직 지원하지 않아요)');
}

function cleanTitle(v) {
  const t = typeof v === 'string' ? v.trim() : '';
  if (!t) throw bad('제목을 입력해 주세요');
  if (t.length > 200) throw bad('제목이 너무 길어요');
  return t;
}

function cleanDays(v) {
  const days = [...new Set((Array.isArray(v) ? v : []).map(Number))].filter((n) => n >= 1 && n <= 7).sort();
  if (days.length === 0) throw bad('반복 요일을 하나 이상 골라 주세요');
  return days.join(',');
}

function cleanId(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw notFound('찾을 수 없어요');
  return n;
}

// ── 로그인 (Supabase 모드) ──────────────────────────────────

// 쿠키로 로그인하므로, 다른 사이트에서 보낸 쓰기 요청은 거절한다 (CSRF 방지)
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  const origin = req.get('origin');
  if (origin && new URL(origin).host !== req.get('host')) {
    return res.status(403).json({ error: '허용되지 않은 요청이에요' });
  }
  next();
});

// 배포 상태 확인용 (Render)
app.get('/api/health', (req, res) => res.json({ ok: true, mode: MODE }));

app.get('/api/auth/me', async (req, res) => {
  if (MODE === 'local') return res.json({ mode: MODE, user: null });
  const who = await auth.resolveUser(req, res);
  res.json({ mode: MODE, user: who ? { email: who.user.email } : null });
});

function cleanCredentials(b) {
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  const password = typeof b.password === 'string' ? b.password : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw bad('이메일 형식이 올바르지 않아요');
  if (password.length < 8 || password.length > 72) throw bad('비밀번호는 8자 이상 72자 이하로 정해 주세요');
  return { email, password };
}

app.post('/api/auth/login', async (req, res) => {
  if (MODE === 'local') throw notFound('로컬 모드에서는 로그인이 없어요');
  const { email, password } = cleanCredentials(req.body || {});
  const { data, error } = await auth.signIn(email, password);
  // 가입은 됐지만 확인 메일 링크를 아직 누르지 않은 경우 (비밀번호가 맞을 때만 이 오류가 온다)
  if (error && error.code === 'email_not_confirmed') {
    return res.status(403).json({ error: '아직 이메일 확인 전이에요. 메일함(스팸함 포함)에서 확인 링크를 눌러 주세요', code: 'email_not_confirmed' });
  }
  // 이메일이 없는지 비밀번호가 틀렸는지 구분해서 알려 주지 않는다
  if (error || !data.session) throw new HttpError(401, '이메일 또는 비밀번호가 맞지 않아요');
  auth.setSession(res, data.session);
  res.json({ user: { email: data.user.email } });
});

app.post('/api/auth/signup', async (req, res) => {
  if (MODE === 'local') throw notFound('로컬 모드에서는 로그인이 없어요');
  const { email, password } = cleanCredentials(req.body || {});
  const { data, error } = await auth.signUp(email, password);
  if (error) {
    // 원인별로 안내한다 (Supabase 오류 원문은 보여 주지 않는다)
    if (error.code === 'over_email_send_rate_limit' || error.status === 429) {
      throw new HttpError(429, '확인 메일 발송 한도(무료: 1시간에 약 2통)를 넘었어요. 잠시 뒤 다시 가입해 주세요');
    }
    if (error.code === 'weak_password') throw bad('비밀번호가 너무 약해요. 영문·숫자를 섞어 더 길게 정해 주세요');
    if (error.code === 'signup_disabled') throw new HttpError(403, '지금은 새로 가입할 수 없어요');
    console.error('signup failed', error.code || error.status);
    throw bad('가입하지 못했어요. 잠시 뒤 다시 시도해 주세요');
  }
  if (data.session) {
    auth.setSession(res, data.session);
    return res.status(201).json({ user: { email: data.user.email } });
  }
  res.status(202).json({ message: '확인 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요' });
});

// 확인 메일 다시 보내기. 가입 여부를 알려 주지 않도록 결과와 상관없이 같은 응답을 준다.
app.post('/api/auth/resend', async (req, res) => {
  if (MODE === 'local') throw notFound('로컬 모드에서는 로그인이 없어요');
  const email = typeof (req.body || {}).email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('이메일 형식이 올바르지 않아요');
  const { error } = await auth.resendConfirmation(email);
  if (error && error.status === 429) throw new HttpError(429, '메일을 너무 자주 보냈어요. 잠시 뒤에 다시 시도해 주세요');
  res.json({ message: '가입된 이메일이면 확인 메일을 다시 보냈어요' });
});

app.post('/api/auth/logout', async (req, res) => {
  if (MODE === 'local') return res.status(204).end();
  const token = auth.readCookies(req)[auth.ACCESS];
  if (token) await auth.signOut(token);
  auth.clearSession(res);
  res.status(204).end();
});

// 나머지 /api 는 저장소가 필요하다. Supabase 모드에서는 로그인한 사용자만.
app.use('/api', async (req, res, next) => {
  if (MODE === 'local') {
    req.store = localStore;
    return next();
  }
  const who = await auth.resolveUser(req, res);
  if (!who) return res.status(401).json({ error: '로그인이 필요해요' });
  req.store = supabase.storeFor(who.accessToken);
  next();
});

// ── 날짜별 목록 ──────────────────────────────────────────────

app.get('/api/days/:date', async (req, res) => {
  const date = cleanDate(req.params.date);
  const todos = await req.store.dayTodos(date, weekdayOf(date));
  res.json({ date, today: todayStr(), todos });
});

// ── 할 일 ────────────────────────────────────────────────────

app.post('/api/todos', async (req, res) => {
  const b = req.body || {};
  const t = {
    title: cleanTitle(b.title),
    date: cleanDate(b.date),
    start_time: cleanTime(b.start_time),
    end_time: cleanTime(b.end_time),
    is_important: !!b.is_important,
  };
  checkTimes(t.start_time, t.end_time, false);
  res.status(201).json(await req.store.insertTodo(t));
});

async function findTodo(store, id) {
  const todo = await store.getTodo(cleanId(id));
  if (!todo) throw notFound('할 일을 찾을 수 없어요'); // 남의 할 일도 RLS 때문에 '없음'으로 보인다
  return todo;
}

app.patch('/api/todos/:id', async (req, res) => {
  const todo = await findTodo(req.store, req.params.id);
  const b = req.body || {};
  const next = { ...todo };
  if ('title' in b) next.title = cleanTitle(b.title);
  if ('start_time' in b) next.start_time = cleanTime(b.start_time);
  if ('end_time' in b) next.end_time = cleanTime(b.end_time);
  if ('is_important' in b) next.is_important = !!b.is_important;
  if ('status' in b) {
    if (!STATUSES.includes(b.status)) throw bad('상태 값이 올바르지 않아요');
    next.status = b.status;
    next.completed_at = b.status === 'todo' ? null : new Date().toISOString();
  }
  checkTimes(next.start_time, next.end_time, false);
  const saved = await req.store.updateTodo(todo.id, next);
  // 완료나 미기록으로 바꾸면 회고는 필요 없으니 지운다
  if (next.status === 'done' || next.status === 'todo') await req.store.deleteReflection(todo.id);
  res.json(saved);
});

// 한 번짜리 할 일은 진짜로 지운다.
// 루틴에서 만들어진 할 일은 지우면 다시 생기므로, 그 날만 'skipped'로 숨긴다.
app.delete('/api/todos/:id', async (req, res) => {
  const todo = await findTodo(req.store, req.params.id);
  if (todo.routine_id === null) {
    await req.store.deleteTodo(todo.id);
  } else {
    await req.store.updateTodo(todo.id, { ...todo, status: 'skipped' });
    await req.store.deleteReflection(todo.id);
  }
  res.status(204).end();
});

// ── 회고 ─────────────────────────────────────────────────────

app.put('/api/todos/:id/reflection', async (req, res) => {
  const todo = await findTodo(req.store, req.params.id);
  if (!['partial', 'missed'].includes(todo.status)) {
    throw bad("회고는 '일부만'이나 '못 함' 항목에만 남길 수 있어요");
  }
  const b = req.body || {};
  const text = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 500) : null);
  let reasonId = b.reason_id ? Number(b.reason_id) : null;
  if (reasonId && !(Number.isInteger(reasonId) && (await req.store.reasonExists(reasonId)))) reasonId = null;
  res.json(
    await req.store.upsertReflection(todo.id, {
      reason_id: reasonId,
      reason_note: text(b.reason_note),
      actual: text(b.actual),
      next_action: text(b.next_action),
    })
  );
});

// 기간 조회 (루틴 달성 기록용). 자동 생성은 하지 않고 있는 그대로만 읽는다.
app.get('/api/range', async (req, res) => {
  const from = cleanDate(req.query.from);
  const to = cleanDate(req.query.to);
  res.json(await req.store.range(from, to));
});

app.get('/api/reasons', async (req, res) => {
  res.json(await req.store.listReasons());
});

// ── 루틴 ─────────────────────────────────────────────────────

app.get('/api/routines', async (req, res) => {
  res.json(await req.store.listRoutines());
});

app.post('/api/routines', async (req, res) => {
  const b = req.body || {};
  const r = {
    title: cleanTitle(b.title),
    start_time: cleanTime(b.start_time),
    end_time: cleanTime(b.end_time),
    repeat_days: cleanDays(b.repeat_days),
    is_important: !!b.is_important,
  };
  checkTimes(r.start_time, r.end_time, true);
  res.status(201).json(await req.store.insertRoutine(r));
});

async function findRoutine(store, id) {
  const r = await store.getRoutine(cleanId(id));
  if (!r) throw notFound('루틴을 찾을 수 없어요');
  return r;
}

app.patch('/api/routines/:id', async (req, res) => {
  const r = await findRoutine(req.store, req.params.id);
  const b = req.body || {};
  const next = {
    title: 'title' in b ? cleanTitle(b.title) : r.title,
    start_time: 'start_time' in b ? cleanTime(b.start_time) : r.start_time,
    end_time: 'end_time' in b ? cleanTime(b.end_time) : r.end_time,
    repeat_days: 'repeat_days' in b ? cleanDays(b.repeat_days) : r.repeat_days,
    is_important: 'is_important' in b ? !!b.is_important : !!r.is_important,
  };
  checkTimes(next.start_time, next.end_time, true);
  const saved = await req.store.updateRoutine(r.id, next);
  // 내일 이후에 미리 만들어 둔 손대지 않은 항목을 지워 새 내용으로 다시 생기게 한다. 오늘과 과거는 그대로.
  await req.store.clearFuture(r.id, todayStr());
  res.json(saved);
});

// 반복 종료: 오늘까지만 생기고 내일부터는 생기지 않는다. 오늘과 과거 기록·회고는 그대로 둔다.
app.post('/api/routines/:id/end', async (req, res) => {
  const r = await findRoutine(req.store, req.params.id);
  const today = todayStr();
  const saved = await req.store.endRoutine(r.id, today);
  await req.store.clearFuture(r.id, today);
  res.json(saved);
});

// 없는 API 주소
app.use('/api', (req, res) => res.status(404).json({ error: '없는 주소예요' }));

// 예상하지 못한 오류: 내부 정보(파일 경로, 코드 위치)는 숨기고 짧은 안내만 돌려준다
app.use((err, req, res, next) => {
  if (err.expose && err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err.cause || err);
  res.status(status >= 400 && status < 600 ? status : 500).json({
    error: status === 400 ? '요청 형식이 올바르지 않아요' : status === 413 ? '요청이 너무 커요' : '서버에서 문제가 생겼어요',
  });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, HOST, () => {
  console.log(`루틴 플래너 (${MODE === 'supabase' ? 'Supabase' : '로컬 SQLite'}): http://${LOOPBACK.includes(HOST) ? 'localhost' : HOST}:${PORT}`);
});
