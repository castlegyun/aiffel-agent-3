// 화면 코드. DB를 직접 부르지 않고, 백엔드 /api 에만 요청한다.

const DAY_EN = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const DAY_KO = ['일', '월', '화', '수', '목', '금', '토'];
const WEEK = [1, 2, 3, 4, 5, 6, 7]; // 1=월 … 7=일
const WEEK_LABEL = { 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토', 7: '일' };
const WEEK_LETTER = { 1: 'M', 2: 'T', 3: 'W', 4: 'T', 5: 'F', 6: 'S', 7: 'S' };
const STATUS_LABEL = { todo: '미기록', done: '완료', partial: '일부만', missed: '못 함' };

const state = {
  view: 'week',
  today: toDateStr(new Date()),
  weekStart: toDateStr(new Date()), // 목록 첫날 (오늘부터 7일)
  openDate: toDateStr(new Date()), // 펼친 요일
  days: {},                        // date → todos
  reasons: [],
  routines: [],
  history: [],                     // 루틴 달성 기록
  openId: null,                    // 펼친 할 일
  editRoutineId: null,
};

// ── 날짜 도우미 ─────────────────────────────────────────

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function shiftDate(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}
function weekdayNum(s) {
  const day = parseDate(s).getDay();
  return day === 0 ? 7 : day;
}
function mondayOf(s) {
  return shiftDate(s, 1 - weekdayNum(s));
}
function weekDates(start) {
  return WEEK.map((_, i) => shiftDate(start, i));
}
function shortDate(s) {
  const d = parseDate(s);
  return `${d.getMonth() + 1}. ${d.getDate()}`;
}
function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function daysText(repeatDays) {
  const days = repeatDays.split(',').map(Number);
  if (days.length === 7) return '매일';
  if (days.join() === '1,2,3,4,5') return '평일';
  if (days.join() === '6,7') return '주말';
  return days.map((d) => WEEK_LABEL[d]).join(' ');
}

// 작은 DOM 만들기 도우미. 글자는 textContent로 넣어 HTML 주입을 막는다.
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.startsWith('/api/auth/')) {
    showLogin(); // 로그인이 풀렸으면 로그인 화면으로
    throw new Error('다시 로그인해 주세요');
  }
  if (!res.ok) {
    const err = new Error(data.error || '요청을 처리하지 못했어요');
    err.code = data.code;
    throw err;
  }
  return data;
}

let toastTimer;
function showError(err) {
  const box = document.getElementById('error');
  box.textContent = err.message || String(err);
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (box.hidden = true), 3500);
}
async function run(fn) {
  try {
    await fn();
  } catch (err) {
    showError(err);
  }
}

// ── 주간 플래너 ─────────────────────────────────────────

async function loadWeek() {
  const dates = weekDates(state.weekStart);
  const results = await Promise.all(dates.map((d) => api('GET', `/api/days/${d}`)));
  for (const r of results) state.days[r.date] = r.todos;
  state.today = results[0].today;
  renderWeek();
}

async function reloadDay(date) {
  const r = await api('GET', `/api/days/${date}`);
  state.days[date] = r.todos;
  renderWeek();
}

function renderWeek() {
  const dates = weekDates(state.weekStart);
  document.getElementById('weekLabel').textContent =
    `${parseDate(dates[0]).getFullYear()}  ·  ${shortDate(dates[0])} – ${shortDate(dates[6])}`;

  const week = document.getElementById('week');
  // 입력 중인 값이 날아가지 않도록, 열린 추가 칸의 글자는 기억해 둔다
  const draft = week.querySelector('.add-input')?.value || '';
  week.replaceChildren(...dates.map(daySection));
  const input = week.querySelector('.add-input');
  if (input && draft) input.value = draft;
}

function daySection(date) {
  const todos = state.days[date] || [];
  const isOpen = state.openDate === date;
  const isToday = date === state.today;
  const recorded = todos.filter((t) => t.status !== 'todo').length;
  const d = parseDate(date);

  const classes = ['day'];
  if (isOpen) classes.push('is-open');
  if (date < state.today) classes.push('is-past');

  const head = h(
    'button',
    {
      type: 'button',
      class: 'day-head',
      'aria-expanded': String(isOpen),
      onclick: () => {
        if (isOpen) return;
        state.openDate = date;
        state.openId = null;
        renderWeek();
      },
    },
    h('h2', { class: 'display', 'aria-label': `${d.getMonth() + 1}월 ${d.getDate()}일 ${DAY_KO[d.getDay()]}요일` },
      h('span', { class: 'num' }, String(d.getDate()).padStart(2, '0')),
      h('span', { class: 'dow' }, DAY_EN[d.getDay()].slice(0, 3))),
    h('span', { class: 'day-meta' },
      isToday ? h('span', { class: 'today-tag' }, 'TODAY') : null,
      // 펼친 날은 아래 줄에 날짜·진행이 나오므로 접힌 날에만 보여 준다
      !isOpen && todos.length ? h('span', {}, `기록 ${recorded}/${todos.length}`) : null,
      !isOpen ? h('span', {}, `${shortDate(date)} ${DAY_KO[d.getDay()]}`) : null)
  );

  const section = h('section', { class: classes.join(' ') }, head);
  if (isOpen) section.append(dayBody(date, todos));
  return section;
}

function dayBody(date, todos) {
  const d = parseDate(date);
  const isToday = date === state.today;
  // 진행률 = 기록률: (완료 + 일부만 + 못 함) ÷ 전체
  const done = todos.filter((t) => t.status === 'done').length;
  const recorded = todos.filter((t) => t.status !== 'todo').length;

  const body = h('div', { class: 'day-body' });
  body.append(
    h('p', { class: 'day-sub' },
      `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}`,
      isToday ? `  —  지금 ${nowHHMM()}` : '',
      todos.length ? `  ·  기록 ${recorded}/${todos.length} · 완료 ${done}` : '  ·  이날 계획이 없어요')
  );

  const bar = h('div', { class: 'progress', role: 'progressbar', 'aria-label': '기록률', 'aria-valuemin': '0', 'aria-valuemax': String(todos.length), 'aria-valuenow': String(recorded) }, h('span'));
  bar.firstChild.style.width = todos.length ? `${(recorded / todos.length) * 100}%` : '0';
  body.append(bar);

  const list = h('ul', { class: 'list' });
  const timed = todos.filter((t) => t.start_time);
  const untimed = todos.filter((t) => !t.start_time);
  const now = nowHHMM();
  let nowPlaced = !isToday;

  if (untimed.length) {
    list.append(h('li', { class: 'group-label' }, 'ANYTIME · 시간 미지정'));
    for (const t of untimed) list.append(todoItem(t, date));
    if (timed.length) list.append(h('li', { class: 'group-label' }, 'TIMELINE'));
  }

  for (const t of timed) {
    if (!nowPlaced && t.start_time > now) {
      list.append(h('li', { class: 'now' }, `NOW ${now}`));
      nowPlaced = true;
    }
    list.append(todoItem(t, date));
  }
  if (!nowPlaced && timed.length) list.append(h('li', { class: 'now' }, `NOW ${now}`));

  if (!todos.length) list.append(h('li', { class: 'empty' }, '이날 계획이 없어요.'));
  body.append(list, addForm(date));
  return body;
}

function todoItem(t, date) {
  const isOpen = state.openId === t.id;
  const classes = ['item', `is-${t.status}`];
  if (t.is_important) classes.push('is-important');
  if (isOpen) classes.push('is-open');

  const boxMark = { done: '✓', partial: '–', missed: '×', todo: '' }[t.status];
  const box = h(
    'button',
    {
      type: 'button',
      class: `box is-${t.status}`,
      'aria-label': t.status === 'done' ? '완료 취소' : '완료로 표시',
      onclick: () => run(() => setStatus(t, date, t.status === 'todo' ? 'done' : 'todo')),
    },
    boxMark
  );

  const tags = [];
  if (t.is_important) tags.push(h('span', { class: 'mark-important' }, '중요'));
  if (t.status === 'partial' || t.status === 'missed') {
    const hasReflection = t.next_action || t.actual || t.reason_id;
    tags.push(h('span', {}, `${STATUS_LABEL[t.status]} · ${hasReflection ? '회고 있음' : '회고 남기기'}`));
  }

  const body = h(
    'div',
    {
      class: 'body',
      role: 'button',
      tabindex: '0',
      'aria-expanded': String(isOpen),
      onclick: () => toggleOpen(t.id),
      onkeydown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleOpen(t.id);
        }
      },
    },
    h('p', { class: 'title' }, t.title, tags.length ? h('span', { class: 'tags' }, tags) : null),
    t.last_next_action && t.status !== 'done'
      ? h('p', { class: 'last-note' }, h('b', {}, `지난번 다짐 · ${shortDate(t.last_next_date)} `), '— ', t.last_next_action)
      : null
  );

  const li = h(
    'li',
    { class: classes.join(' ') },
    h('div', { class: 'item-row' }, h('span', { class: 'time' }, t.start_time || ''), box, body)
  );
  if (isOpen) li.append(todoPanel(t, date));
  return li;
}

function toggleOpen(id) {
  state.openId = state.openId === id ? null : id;
  renderWeek();
}

function todoPanel(t, date) {
  const panel = h('div', { class: 'panel' });

  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': '상태' });
  for (const s of ['done', 'partial', 'missed', 'todo']) {
    seg.append(
      h('button', {
        type: 'button',
        class: t.status === s ? 'is-on' : '',
        'aria-pressed': String(t.status === s),
        onclick: () => run(() => setStatus(t, date, s)),
      }, STATUS_LABEL[s])
    );
  }
  panel.append(h('div', { class: 'panel-block' }, h('p', { class: 'label' }, 'Result · 결과 기록'), seg));

  if (t.status === 'partial' || t.status === 'missed') panel.append(reflectionForm(t));

  const title = h('input', { class: 'field', value: t.title, maxlength: '200', 'aria-label': '제목' });
  const start = h('input', { class: 'field', type: 'time', value: t.start_time || '', 'aria-label': '시작 시간' });
  const end = h('input', { class: 'field', type: 'time', value: t.end_time || '', 'aria-label': '끝 시간' });
  panel.append(
    h('div', { class: 'panel-block' },
      h('p', { class: 'label' }, t.routine_id ? 'Edit · 오늘만' : 'Edit'),
      title,
      h('div', { class: 'row', style: 'margin-top:6px' }, start, h('span', { class: 'dash' }, '–'), end,
        h('button', {
          type: 'button',
          class: 'line-btn',
          onclick: () => run(async () => {
            await api('PATCH', `/api/todos/${t.id}`, { title: title.value, start_time: start.value, end_time: end.value });
            await reloadDay(date);
          }),
        }, '저장')))
  );

  panel.append(
    h('div', { class: 'actions' },
      h('button', {
        type: 'button',
        class: `line-btn${t.is_important ? ' is-on' : ''}`,
        'aria-pressed': String(!!t.is_important),
        onclick: () => run(async () => {
          await api('PATCH', `/api/todos/${t.id}`, { is_important: !t.is_important });
          await reloadDay(date);
        }),
      }, t.is_important ? '중요 해제' : '중요 표시'),
      h('button', {
        type: 'button',
        class: 'link-btn',
        onclick: () => run(async () => {
          const msg = t.routine_id ? '이 날짜에서만 이 루틴을 뺄까요? 루틴 자체는 그대로예요.' : '이 할 일을 지울까요?';
          if (!confirm(msg)) return;
          await api('DELETE', `/api/todos/${t.id}`);
          state.openId = null;
          await reloadDay(date);
        }),
      }, t.routine_id ? '이 날만 빼기' : '삭제'))
  );
  return panel;
}

function reflectionForm(t) {
  let reasonId = t.reason_id || null;
  const etc = state.reasons.find((r) => r.label === '기타');

  const actual = h('input', { class: 'field', value: t.actual || '', placeholder: '실제로 한 일 — 예: 유튜브를 봤다', maxlength: '500', 'aria-label': '실제로 한 일' });
  const note = h('input', { class: 'field', value: t.reason_note || '', placeholder: '이유를 직접 적어 주세요', maxlength: '500', 'aria-label': '기타 이유' });
  const next = h('input', { class: 'field', value: t.next_action || '', placeholder: '예: 폰을 다른 방에 두고 시작', maxlength: '500', 'aria-label': '다음엔 이렇게' });
  const saved = h('span', { class: 'saved' });

  const chips = h('div', { class: 'chips' });
  const paint = () => {
    for (const c of chips.children) {
      const on = Number(c.dataset.id) === reasonId;
      c.classList.toggle('is-on', on);
      c.setAttribute('aria-pressed', String(on));
    }
    note.hidden = !(etc && reasonId === etc.id);
  };
  for (const r of state.reasons) {
    chips.append(
      h('button', {
        type: 'button',
        class: 'chip',
        'data-id': String(r.id),
        onclick: () => {
          reasonId = reasonId === r.id ? null : r.id;
          paint();
        },
      }, r.label)
    );
  }
  paint();

  return h('div', { class: 'panel-block' },
    h('p', { class: 'label' }, 'Review · 실제로 한 일 (선택)'),
    actual,
    h('p', { class: 'label', style: 'margin-top:14px' }, 'Why · 이유'),
    chips,
    note,
    h('p', { class: 'label', style: 'margin-top:14px' }, 'Next time · 다음엔 이렇게'),
    next,
    h('div', { class: 'row', style: 'margin-top:12px' },
      h('button', {
        type: 'button',
        class: 'solid-btn',
        onclick: async () => {
          saved.textContent = '저장 중…';
          try {
            await api('PUT', `/api/todos/${t.id}/reflection`, {
              reason_id: reasonId,
              reason_note: note.hidden ? '' : note.value,
              actual: actual.value,
              next_action: next.value,
            });
            Object.assign(t, { reason_id: reasonId, reason_note: note.value, actual: actual.value, next_action: next.value });
            saved.textContent = '저장했어요';
          } catch (err) {
            saved.textContent = `저장하지 못했어요 — ${err.message}`;
          }
        },
      }, '회고 저장'),
      saved));
}

function addForm(date) {
  const title = h('input', { class: 'add-input', name: 'title', placeholder: '할 일 추가…', maxlength: '200', required: true, 'aria-label': '할 일 추가' });
  const start = h('input', { class: 'field', type: 'time', 'aria-label': '시작 시간' });
  const end = h('input', { class: 'field', type: 'time', 'aria-label': '끝 시간' });
  const important = h('input', { type: 'checkbox' });

  return h('form', {
    class: 'add',
    autocomplete: 'off',
    onsubmit: (e) => {
      e.preventDefault();
      run(async () => {
        await api('POST', '/api/todos', {
          title: title.value,
          date,
          start_time: start.value,
          end_time: end.value,
          is_important: important.checked,
        });
        title.value = '';
        await reloadDay(date);
        document.querySelector('.add-input')?.focus();
      });
    },
  },
  title,
  h('div', { class: 'add-more' },
    start, h('span', { class: 'dash' }, '–'), end,
    h('label', { class: 'check' }, important, '중요'),
    h('button', { type: 'submit', class: 'solid-btn' }, '추가')));
}

async function setStatus(t, date, status) {
  await api('PATCH', `/api/todos/${t.id}`, { status });
  if (status === 'partial' || status === 'missed') state.openId = t.id; // 바로 회고를 쓸 수 있게 펼친다
  await reloadDay(date);
}

// ── 루틴 / 해빗 트래커 ──────────────────────────────────

async function loadRoutines() {
  const from = shiftDate(state.today, -60);
  const [routines, history] = await Promise.all([
    api('GET', '/api/routines'),
    api('GET', `/api/range?from=${from}&to=${state.today}`),
  ]);
  state.routines = routines;
  state.history = history;
  renderRoutines();
}

function statusOn(routineId, date) {
  return state.history.find((x) => x.routine_id === routineId && x.date === date)?.status;
}

function isScheduled(r, date) {
  return r.repeat_days.split(',').map(Number).includes(weekdayNum(date)) && date >= (r.created_on || r.created_at.slice(0, 10));
}

// 오늘부터 거꾸로, 해야 하는 날에 '완료'가 이어진 날 수. 오늘은 아직 안 했어도 끊긴 걸로 보지 않는다.
function streakOf(r) {
  let n = 0;
  for (let i = 0; i <= 60; i++) {
    const date = shiftDate(state.today, -i);
    if (!isScheduled(r, date)) continue;
    const s = statusOn(r.id, date);
    if (s === 'done') n++;
    else if (i === 0) continue;
    else break;
  }
  return n;
}

function renderRoutines() {
  const dates = weekDates(mondayOf(state.today));
  const wrap = document.getElementById('tracker');
  wrap.replaceChildren();

  if (state.routines.length) {
    wrap.append(
      h('div', { class: 'tracker-head' },
        h('p', { class: 'label', style: 'margin:0' }, 'This week'),
        h('div', { class: 'cells' }, dates.map((d) =>
          h('span', { class: d === state.today ? 'is-today' : '' }, WEEK_LETTER[weekdayNum(d)]))))
    );
  }

  const list = h('ul', { class: 'tracker' });
  for (const r of state.routines) {
    if (state.editRoutineId === r.id) {
      list.append(h('li', { class: 'tracker-row', style: 'display:block' }, routineForm(r)));
      continue;
    }
    const streak = streakOf(r);
    const cells = dates.map((d) => {
      if (!isScheduled(r, d) && !statusOn(r.id, d)) return h('span', { class: 'cell off', title: `${shortDate(d)} 쉬는 날` });
      const s = d <= state.today ? statusOn(r.id, d) : null;
      const mark = { done: '', partial: '–', missed: '×' }[s] || '';
      return h('span', { class: `cell on ${s || ''}`, title: `${shortDate(d)} ${STATUS_LABEL[s] || ''}` }, mark);
    });

    list.append(
      h('li', { class: `tracker-row${r.is_important ? ' is-important' : ''}` },
        h('div', {},
          h('p', { class: 'r-title' }, r.title),
          h('p', { class: 'r-meta' },
            h('span', {}, `${r.start_time || '--:--'}${r.end_time ? ` – ${r.end_time}` : ''}`),
            h('span', {}, daysText(r.repeat_days)),
            r.is_important ? h('span', { class: 'mark-important' }, '중요') : null,
            streak ? h('span', { class: 'streak' }, `${streak}일 연속`) : null,
            h('button', {
              type: 'button',
              class: 'link-btn',
              onclick: () => {
                state.editRoutineId = r.id;
                renderRoutines();
              },
            }, '수정'))),
        h('div', { class: 'cells', 'aria-label': '이번 주 기록' }, cells))
    );
  }
  if (!state.routines.length) list.append(h('li', { class: 'tracker-row' }, h('p', { class: 'empty' }, '아직 루틴이 없어요.')));
  wrap.append(list);

  document.getElementById('routineFormSlot').replaceChildren(state.editRoutineId === null ? routineForm(null) : '');
}

function routineForm(r) {
  const isNew = r === null;
  let days = new Set(isNew ? [1, 2, 3, 4, 5] : r.repeat_days.split(',').map(Number));

  const title = h('input', { class: 'add-input', value: isNew ? '' : r.title, placeholder: '루틴 추가… (예: 아침 독서)', maxlength: '200', 'aria-label': '루틴 이름' });
  const start = h('input', { class: 'field', type: 'time', value: isNew ? '' : r.start_time || '', 'aria-label': '시작 시간' });
  const end = h('input', { class: 'field', type: 'time', value: isNew ? '' : r.end_time || '', 'aria-label': '끝 시간' });
  const important = h('input', { type: 'checkbox', checked: !isNew && !!r.is_important });

  const dayBox = h('div', { class: 'days', role: 'group', 'aria-label': '반복 요일' });
  const paint = () => {
    for (const b of dayBox.querySelectorAll('.day-btn')) {
      const on = days.has(Number(b.dataset.day));
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    }
  };
  for (const d of WEEK) {
    dayBox.append(
      h('button', {
        type: 'button',
        class: 'day-btn',
        'data-day': String(d),
        onclick: () => {
          days.has(d) ? days.delete(d) : days.add(d);
          paint();
        },
      }, WEEK_LABEL[d])
    );
  }
  const preset = (label, set) =>
    h('button', { type: 'button', class: 'link-btn', onclick: () => { days = new Set(set); paint(); } }, label);
  paint();

  return h('form', {
    class: `routine-form${isNew ? '' : ' is-edit'}`,
    autocomplete: 'off',
    onsubmit: (e) => {
      e.preventDefault();
      run(async () => {
        const body = {
          title: title.value,
          start_time: start.value,
          end_time: end.value,
          repeat_days: [...days],
          is_important: important.checked,
        };
        if (isNew) await api('POST', '/api/routines', body);
        else await api('PATCH', `/api/routines/${r.id}`, body);
        state.editRoutineId = null;
        await loadRoutines();
      });
    },
  },
  title,
  h('div', { class: 'add-more' }, dayBox, preset('평일', [1, 2, 3, 4, 5]), preset('매일', WEEK)),
  h('div', { class: 'add-more' },
    start, h('span', { class: 'dash' }, '–'), end,
    h('label', { class: 'check' }, important, '중요'),
    isNew ? null : h('button', {
      type: 'button',
      class: 'link-btn',
      onclick: () => run(async () => {
        if (!confirm('이 루틴의 반복을 끝낼까요? 내일부터 생기지 않고, 오늘과 지난 기록은 남아요.')) return;
        await api('POST', `/api/routines/${r.id}/end`);
        state.editRoutineId = null;
        await loadRoutines();
      }),
    }, '반복 종료'),
    isNew ? null : h('button', {
      type: 'button',
      class: 'line-btn',
      onclick: () => {
        state.editRoutineId = null;
        renderRoutines();
      },
    }, '취소'),
    h('button', { type: 'submit', class: 'solid-btn' }, isNew ? '추가' : '저장')));
}

// ── 화면 전환 / 이벤트 ──────────────────────────────────

function setView(view) {
  state.view = view;
  document.getElementById('authView').hidden = true;
  document.getElementById('tabs').hidden = false;
  document.getElementById('fab').hidden = false;
  for (const b of document.querySelectorAll('.tab')) b.classList.toggle('is-on', b.dataset.view === view);
  document.getElementById('weekView').hidden = view !== 'week';
  document.getElementById('routineView').hidden = view !== 'routines';
  run(view === 'week' ? loadWeek : loadRoutines);
}
for (const b of document.querySelectorAll('.tab')) b.addEventListener('click', () => setView(b.dataset.view));

function goWeek(start, openDate) {
  state.weekStart = start;
  state.openDate = openDate;
  state.openId = null;
  run(loadWeek);
}
document.getElementById('prevWeek').addEventListener('click', () => {
  const start = shiftDate(state.weekStart, -7);
  goWeek(start, start);
});
document.getElementById('nextWeek').addEventListener('click', () => {
  const start = shiftDate(state.weekStart, 7);
  goWeek(start, start);
});
document.getElementById('thisWeek').addEventListener('click', () => {
  const today = toDateStr(new Date());
  goWeek(today, today);
});

// ── + 버튼: 어느 날짜에든 할 일 추가 ────────────────────

const dialog = document.getElementById('addDialog');
const dialogForm = document.getElementById('addDialogForm');
const dialogError = document.getElementById('addDialogError');

document.getElementById('fab').addEventListener('click', () => {
  dialogForm.reset();
  dialogError.textContent = '';
  // 플래너에서 펼쳐 둔 날을 기본 날짜로
  dialogForm.elements.date.value = state.view === 'week' ? state.openDate : toDateStr(new Date());
  dialog.showModal();
  dialogForm.elements.title.focus();
});
document.getElementById('addDialogCancel').addEventListener('click', () => dialog.close());

dialogForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = dialogForm.elements;
  const date = f.date.value;
  try {
    await api('POST', '/api/todos', {
      title: f.title.value,
      date,
      start_time: f.start_time.value,
      end_time: f.end_time.value,
      is_important: f.is_important.checked,
    });
  } catch (err) {
    dialogError.textContent = err.message; // 창 안에서 이유를 보여 준다
    return;
  }
  dialog.close();
  // 추가한 날짜로 이동해서 펼쳐 보여 준다
  const inRange = date >= state.weekStart && date <= shiftDate(state.weekStart, 6);
  if (state.view !== 'week') setView('week');
  goWeek(inRange ? state.weekStart : date, date);
});

// 1분마다 'NOW' 선을 다시 그린다. 무언가를 펼쳐서 입력 중일 때는 건드리지 않는다.
setInterval(() => {
  const typing = document.activeElement && document.activeElement.tagName === 'INPUT';
  if (state.view === 'week' && state.openId === null && !typing) renderWeek();
}, 60 * 1000);

// ── 로그인 ─────────────────────────────────────────────

let signUpMode = false;

function showLogin(message = '') {
  for (const id of ['weekView', 'routineView', 'tabs', 'fab']) document.getElementById(id).hidden = true;
  document.getElementById('authView').hidden = false;
  const msg = document.getElementById('authMessage');
  msg.textContent = message;
  msg.classList.toggle('is-ok', !!message);
}

function paintAuthMode() {
  document.querySelector('#authView .display').textContent = signUpMode ? 'SIGN UP' : 'LOG IN';
  document.getElementById('authSubmit').textContent = signUpMode ? '가입하기' : '로그인';
  document.getElementById('authSwitch').textContent = signUpMode ? '이미 계정이 있어요 · 로그인' : '처음이에요 · 가입하기';
  document.getElementById('authPassword').autocomplete = signUpMode ? 'new-password' : 'current-password';
}

document.getElementById('authSwitch').addEventListener('click', () => {
  signUpMode = !signUpMode;
  paintAuthMode();
  // 가입 ↔ 로그인을 바꾸면 입력한 값과 안내를 모두 비운다
  document.getElementById('authForm').reset();
  document.getElementById('authMessage').textContent = '';
  document.getElementById('authResend').hidden = true;
  document.getElementById('authEmail').focus();
});

document.getElementById('authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.currentTarget.elements;
  const msg = document.getElementById('authMessage');
  msg.classList.remove('is-ok');
  msg.textContent = signUpMode ? '가입하는 중…' : '로그인하는 중…';
  try {
    const data = await api('POST', signUpMode ? '/api/auth/signup' : '/api/auth/login', {
      email: f.email.value,
      password: f.password.value,
    });
    f.password.value = '';
    if (data && data.user) return startApp(data.user);
    // 이메일 확인이 필요한 경우
    signUpMode = false;
    paintAuthMode();
    msg.classList.add('is-ok');
    msg.textContent = data.message;
  } catch (err) {
    msg.textContent = err.message;
    document.getElementById('authResend').hidden = err.code !== 'email_not_confirmed';
  }
});

document.getElementById('authResend').addEventListener('click', async () => {
  const msg = document.getElementById('authMessage');
  try {
    const data = await api('POST', '/api/auth/resend', { email: document.getElementById('authEmail').value });
    msg.classList.add('is-ok');
    msg.textContent = data.message;
  } catch (err) {
    msg.classList.remove('is-ok');
    msg.textContent = err.message;
  }
});

document.getElementById('logout').addEventListener('click', () =>
  run(async () => {
    await api('POST', '/api/auth/logout');
    state.days = {};
    showLogin('로그아웃했어요');
  })
);

async function startApp(user) {
  const account = document.getElementById('account');
  account.hidden = !user;
  if (user) document.getElementById('accountEmail').textContent = user.email;
  state.reasons = await api('GET', '/api/reasons');
  setView('week');
}

run(async () => {
  // 가입 확인 메일 링크로 돌아온 경우: 주소창의 토큰을 지우고 '확인 완료'를 알려 준다
  // (토큰을 주소에 남겨 두지 않는다. 로그인은 이메일·비밀번호로 다시 한다)
  const hash = new URLSearchParams(location.hash.slice(1));
  let welcome = '';
  if (hash.get('type') === 'signup' || hash.get('access_token')) welcome = '이메일 확인이 끝났어요. 가입한 비밀번호로 로그인해 주세요';
  if (hash.get('error')) welcome = '확인 링크가 만료됐거나 이미 사용됐어요. 로그인해 보시고, 안 되면 확인 메일을 다시 받아 주세요';
  if (location.hash) history.replaceState(null, '', location.pathname);

  const me = await api('GET', '/api/auth/me');
  if (me.mode === 'supabase' && !me.user) return showLogin(welcome);
  await startApp(me.user);
});
