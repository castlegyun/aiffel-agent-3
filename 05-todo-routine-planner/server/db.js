// DB 연결과 표 만들기. DB에 접근하는 코드는 server/ 폴더에만 둔다.
const path = require('path');
const Database = require('better-sqlite3');

// DB 파일 위치. 기본은 프로젝트 폴더의 todo.db, 예시·테스트용은 DB_FILE 환경변수로 바꾼다.
const DB_FILE = path.resolve(__dirname, '..', process.env.DB_FILE || 'todo.db');
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS routines (
    id           INTEGER PRIMARY KEY,
    title        TEXT NOT NULL,
    start_time   TEXT,                       -- '09:30'
    end_time     TEXT,
    repeat_days  TEXT NOT NULL,              -- '1,2,3,4,5' (1=월 … 7=일)
    is_important INTEGER NOT NULL DEFAULT 0,
    ended_on     TEXT,                       -- 반복 종료일 (이날까지만 생김). NULL = 계속
    created_at   TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS todos (
    id           INTEGER PRIMARY KEY,
    routine_id   INTEGER REFERENCES routines(id) ON DELETE SET NULL,
    title        TEXT NOT NULL,
    date         TEXT NOT NULL,              -- '2026-10-30'
    start_time   TEXT,
    end_time     TEXT,
    status       TEXT NOT NULL DEFAULT 'todo'
                 CHECK (status IN ('todo', 'done', 'partial', 'missed', 'skipped')),
    is_important INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    UNIQUE (routine_id, date)
  );

  CREATE TABLE IF NOT EXISTS reasons (
    id    INTEGER PRIMARY KEY,
    label TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS reflections (
    id          INTEGER PRIMARY KEY,
    todo_id     INTEGER NOT NULL UNIQUE REFERENCES todos(id) ON DELETE CASCADE,
    reason_id   INTEGER REFERENCES reasons(id),
    reason_note TEXT,
    actual      TEXT,
    next_action TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_todos_date ON todos(date);
`);

// 예전 todo.db 에 ended_on 열이 없으면 추가한다
if (!db.prepare('PRAGMA table_info(routines)').all().some((c) => c.name === 'ended_on')) {
  db.exec('ALTER TABLE routines ADD COLUMN ended_on TEXT');
}

const insertReason = db.prepare('INSERT OR IGNORE INTO reasons (label) VALUES (?)');
for (const label of ['피곤함', '폰·SNS', '급한 일', '계획이 무리', '시작이 어려움', '기타']) {
  insertReason.run(label);
}

module.exports = db;
