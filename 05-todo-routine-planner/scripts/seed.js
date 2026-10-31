// 리뷰·시연용 예시 데이터. 실제 개인 일정이 아닌 일반 예시만 넣는다.
// 사용: npm run seed  (DB_FILE 환경변수가 있으면 그 파일에, 없으면 todo.db 에)
// 이미 루틴이 있으면 아무것도 하지 않는다.
process.env.TZ = process.env.TZ || 'Asia/Seoul';
const db = require('../server/db');

if (db.prepare('SELECT COUNT(*) AS n FROM routines').get().n > 0) {
  console.log('이미 데이터가 있어요. 예시 데이터를 넣지 않았어요.');
  process.exit(0);
}

const pad = (n) => String(n).padStart(2, '0');
const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shift = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return dateStr(d);
};
const yesterday = shift(-1);
const today = shift(0);

const addRoutine = db.prepare(
  `INSERT INTO routines (title, start_time, end_time, repeat_days, is_important, created_at)
   VALUES (?, ?, ?, ?, ?, ?)`
);
const routines = [
  ['기상 & 물 한 잔', '07:00', '07:20', '1,2,3,4,5', 0],
  ['아침 독서', '07:30', '08:00', '1,2,3,4,5,6,7', 1],
  ['영어 단어 30개', '08:30', '09:00', '1,2,3,4,5', 0],
  ['오후 집중 공부', '14:00', '16:00', '1,2,3,4,5', 1],
  ['스트레칭', '22:00', '22:15', '1,2,3,4,5,6,7', 0],
];
// 어제부터 시작한 루틴으로 만들어, 어제 기록과 '지난번 다짐'을 보여 줄 수 있게 한다
const ids = routines.map((r) => addRoutine.run(...r, `${yesterday} 00:00:00`).lastInsertRowid);

const addTodo = db.prepare(
  `INSERT INTO todos (routine_id, title, date, start_time, end_time, status, is_important)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);
// 어제 루틴 기록
const y = new Date();
y.setDate(y.getDate() - 1);
const yWeekday = y.getDay() === 0 ? 7 : y.getDay();
const yStatus = ['done', 'done', 'partial', 'missed', 'done'];
routines.forEach((r, i) => {
  if (!r[3].split(',').map(Number).includes(yWeekday)) return;
  addTodo.run(ids[i], r[0], yesterday, r[1], r[2], yStatus[i], r[4]);
});

// 어제 '오후 집중 공부'를 못 한 회고 → 오늘 같은 루틴에 '지난번 다짐'으로 보인다
const missed = db.prepare('SELECT id FROM todos WHERE routine_id = ? AND date = ?').get(ids[3], yesterday);
if (missed) {
  db.prepare(
    `INSERT INTO reflections (todo_id, reason_id, actual, next_action)
     VALUES (?, (SELECT id FROM reasons WHERE label = '폰·SNS'), ?, ?)`
  ).run(missed.id, '짧은 영상을 보다가 한 시간이 지났다', '공부 시작 전에 폰을 다른 방에 두기');
}

// 한 번짜리 할 일
addTodo.run(null, '과제 제출 준비', today, '19:00', '20:00', 'todo', 1);
addTodo.run(null, '장보기', today, null, null, 'todo', 0);
addTodo.run(null, '발표 자료 만들기', shift(2), '10:00', '12:00', 'todo', 0);

console.log('예시 데이터를 넣었어요: 루틴 5개, 한 번짜리 할 일 3개, 회고 1개');
