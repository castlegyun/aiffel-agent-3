// 저장소 ② Supabase(Postgres) (버전 2, 길 B).
// 요청마다 '로그인한 사용자의 토큰'으로 만든 클라이언트를 쓴다 → DB의 RLS가 항상 적용된다.
// service_role(관리자) 키는 쓰지 않는다.
const { createClient } = require('@supabase/supabase-js');

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_ANON_KEY; // 공개용(anon/publishable) 키. RLS로 보호된다.

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

// 로그인 처리용 (토큰 없이)
function authClient() {
  return createClient(URL, KEY, clientOptions);
}

// 사용자 토큰을 붙인 클라이언트
function userClient(accessToken) {
  return createClient(URL, KEY, {
    ...clientOptions,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

// Supabase 오류를 그대로 내보내지 않는다 (서버 로그에만 남김)
function check({ data, error }) {
  if (error) {
    const err = new Error('DB 요청에 실패했어요');
    err.cause = error;
    throw err;
  }
  return data;
}

// timestamptz → 한국 날짜 'YYYY-MM-DD'
function seoulDate(iso) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(iso));
}
const withCreatedOn = (r) => r && { ...r, created_on: seoulDate(r.created_at) };

function storeFor(accessToken) {
  const sb = userClient(accessToken);
  return {
    mode: 'supabase',

    async dayTodos(date) {
      return check(await sb.rpc('day_todos', { p_date: date }));
    },

    async getTodo(id) {
      return check(await sb.from('todos').select('*').eq('id', id).maybeSingle());
    },

    async insertTodo(t) {
      return check(
        await sb
          .from('todos')
          .insert({ title: t.title, date: t.date, start_time: t.start_time, end_time: t.end_time, is_important: !!t.is_important })
          .select()
          .single()
      );
    },

    async updateTodo(id, t) {
      return check(
        await sb
          .from('todos')
          .update({
            title: t.title,
            start_time: t.start_time,
            end_time: t.end_time,
            is_important: !!t.is_important,
            status: t.status,
            completed_at: t.completed_at,
          })
          .eq('id', id)
          .select()
          .single()
      );
    },

    async deleteTodo(id) {
      check(await sb.from('todos').delete().eq('id', id));
    },

    async deleteReflection(todoId) {
      check(await sb.from('reflections').delete().eq('todo_id', todoId));
    },

    async upsertReflection(todoId, r) {
      return check(
        await sb
          .from('reflections')
          .upsert({ todo_id: todoId, ...r }, { onConflict: 'todo_id' })
          .select()
          .single()
      );
    },

    async reasonExists(id) {
      return !!check(await sb.from('reasons').select('id').eq('id', id).maybeSingle());
    },

    async listReasons() {
      return check(await sb.from('reasons').select('*').order('id'));
    },

    async range(from, to) {
      return check(
        await sb
          .from('todos')
          .select('id, routine_id, date, status')
          .gte('date', from)
          .lte('date', to)
          .not('routine_id', 'is', null)
      );
    },

    async listRoutines() {
      const rows = check(
        await sb.from('routines').select('*').is('ended_on', null).order('start_time').order('id')
      );
      return rows.map(withCreatedOn);
    },

    async getRoutine(id) {
      return withCreatedOn(check(await sb.from('routines').select('*').eq('id', id).is('ended_on', null).maybeSingle()));
    },

    async insertRoutine(r) {
      return withCreatedOn(check(await sb.from('routines').insert({ ...r, is_important: !!r.is_important }).select().single()));
    },

    async updateRoutine(id, r) {
      return withCreatedOn(
        check(await sb.from('routines').update({ ...r, is_important: !!r.is_important }).eq('id', id).select().single())
      );
    },

    async endRoutine(id, today) {
      return check(await sb.from('routines').update({ ended_on: today }).eq('id', id).select().single());
    },

    async clearFuture(routineId, today) {
      check(await sb.from('todos').delete().eq('routine_id', routineId).gt('date', today).eq('status', 'todo'));
    },
  };
}

module.exports = { authClient, storeFor, configured: () => !!(URL && KEY) };
