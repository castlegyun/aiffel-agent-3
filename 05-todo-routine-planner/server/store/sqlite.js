// 저장소 ① 로컬 SQLite (버전 1, 길 A). 로그인 없이 내 컴퓨터의 todo.db 하나를 쓴다.
// 모든 값은 ? 자리표시자(파라미터화 쿼리)로 넘긴다.
const db = require('../db');

const q = {
  // 그 날짜에 해당하는 루틴을 할 일로 만든다. 이미 있으면 (routine_id, date) 중복 금지로 건너뛴다.
  insertFromRoutine: db.prepare(`
    INSERT OR IGNORE INTO todos (routine_id, title, date, start_time, end_time, is_important)
    SELECT id, title, @date, start_time, end_time, is_important
    FROM routines
    WHERE (',' || repeat_days || ',') LIKE '%,' || @weekday || ',%'
      AND date(created_at) <= @date
      AND (ended_on IS NULL OR @date <= ended_on)
  `),
  selectDay: db.prepare(`
    SELECT t.*,
           rf.reason_id, rf.reason_note, rf.actual, rf.next_action,
           prev.next_action AS last_next_action,
           prev.date AS last_next_date
    FROM todos t
    LEFT JOIN reflections rf ON rf.todo_id = t.id
    -- 같은 루틴의, 이 날짜보다 이전 기록 중 '다음엔 이렇게'가 있는 가장 최근 것
    LEFT JOIN (
      SELECT t2.id, t2.date, r2.next_action FROM reflections r2 JOIN todos t2 ON r2.todo_id = t2.id
    ) prev ON prev.id = (
      SELECT t3.id
        FROM reflections r3
        JOIN todos t3 ON r3.todo_id = t3.id
       WHERE t.routine_id IS NOT NULL
         AND t3.routine_id = t.routine_id
         AND t3.date < t.date
         AND r3.next_action IS NOT NULL AND r3.next_action <> ''
       ORDER BY t3.date DESC
       LIMIT 1)
    WHERE t.date = ? AND t.status <> 'skipped'
    ORDER BY t.start_time IS NULL, t.start_time, t.id
  `),
  getTodo: db.prepare('SELECT * FROM todos WHERE id = ?'),
  getRoutine: db.prepare("SELECT *, date(created_at) AS created_on FROM routines WHERE id = ? AND ended_on IS NULL"),
};

module.exports = {
  mode: 'local',

  async dayTodos(date, weekday) {
    q.insertFromRoutine.run({ date, weekday: String(weekday) });
    return q.selectDay.all(date);
  },

  async getTodo(id) {
    return q.getTodo.get(id) || null;
  },

  async insertTodo(t) {
    const info = db
      .prepare('INSERT INTO todos (title, date, start_time, end_time, is_important) VALUES (?, ?, ?, ?, ?)')
      .run(t.title, t.date, t.start_time, t.end_time, t.is_important ? 1 : 0);
    return q.getTodo.get(info.lastInsertRowid);
  },

  async updateTodo(id, t) {
    db.prepare(
      `UPDATE todos SET title = ?, start_time = ?, end_time = ?, is_important = ?, status = ?, completed_at = ?
       WHERE id = ?`
    ).run(t.title, t.start_time, t.end_time, t.is_important ? 1 : 0, t.status, t.completed_at, id);
    return q.getTodo.get(id);
  },

  async deleteTodo(id) {
    db.prepare('DELETE FROM todos WHERE id = ?').run(id);
  },

  async deleteReflection(todoId) {
    db.prepare('DELETE FROM reflections WHERE todo_id = ?').run(todoId);
  },

  async upsertReflection(todoId, r) {
    db.prepare(
      `INSERT INTO reflections (todo_id, reason_id, reason_note, actual, next_action)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (todo_id) DO UPDATE SET
         reason_id = excluded.reason_id, reason_note = excluded.reason_note,
         actual = excluded.actual, next_action = excluded.next_action`
    ).run(todoId, r.reason_id, r.reason_note, r.actual, r.next_action);
    return db.prepare('SELECT * FROM reflections WHERE todo_id = ?').get(todoId);
  },

  async reasonExists(id) {
    return !!db.prepare('SELECT 1 FROM reasons WHERE id = ?').get(id);
  },

  async listReasons() {
    return db.prepare('SELECT * FROM reasons ORDER BY id').all();
  },

  async range(from, to) {
    return db
      .prepare('SELECT id, routine_id, date, status FROM todos WHERE date BETWEEN ? AND ? AND routine_id IS NOT NULL')
      .all(from, to);
  },

  async listRoutines() {
    return db
      .prepare('SELECT *, date(created_at) AS created_on FROM routines WHERE ended_on IS NULL ORDER BY start_time, id')
      .all();
  },

  async getRoutine(id) {
    return q.getRoutine.get(id) || null;
  },

  async insertRoutine(r) {
    const info = db
      .prepare('INSERT INTO routines (title, start_time, end_time, repeat_days, is_important) VALUES (?, ?, ?, ?, ?)')
      .run(r.title, r.start_time, r.end_time, r.repeat_days, r.is_important ? 1 : 0);
    return q.getRoutine.get(info.lastInsertRowid);
  },

  async updateRoutine(id, r) {
    db.prepare(
      'UPDATE routines SET title = ?, start_time = ?, end_time = ?, repeat_days = ?, is_important = ? WHERE id = ?'
    ).run(r.title, r.start_time, r.end_time, r.repeat_days, r.is_important ? 1 : 0, id);
    return q.getRoutine.get(id);
  },

  async endRoutine(id, today) {
    db.prepare('UPDATE routines SET ended_on = ? WHERE id = ?').run(today, id);
    return db.prepare('SELECT * FROM routines WHERE id = ?').get(id);
  },

  // 루틴이 바뀌거나 끝나면, 내일 이후에 미리 만들어 둔 손대지 않은 할 일을 지운다
  async clearFuture(routineId, today) {
    db.prepare("DELETE FROM todos WHERE routine_id = ? AND date > ? AND status = 'todo'").run(routineId, today);
  },
};
