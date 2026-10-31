-- 루틴 플래너 — Supabase(Postgres) 스키마 + RLS
-- Supabase 대시보드 > SQL Editor 에 붙여 넣고 실행한다. 여러 번 실행해도 안전하다.
--
-- 원칙
--  - 모든 개인 데이터 행에는 소유자(user_id)가 있고, 기본값은 로그인한 사용자(auth.uid())다.
--  - RLS: 로그인한 사용자는 자기 행만 조회·추가·수정·삭제할 수 있다.
--  - 로그인하지 않은 요청(anon)은 어떤 표도 읽거나 쓸 수 없다.
--  - 백엔드는 '사용자 토큰'으로만 접속한다(service_role 키를 쓰지 않는다) → RLS가 항상 적용된다.

-- ── 표 ──────────────────────────────────────────────────

create table if not exists public.routines (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 200),
  start_time   text not null check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_time     text not null check (end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and end_time > start_time),
  repeat_days  text not null check (repeat_days ~ '^[1-7](,[1-7])*$'),   -- '1,2,3,4,5' (1=월 … 7=일)
  is_important boolean not null default false,
  ended_on     date,                                                     -- 반복 종료일. null = 계속
  created_at   timestamptz not null default now()
);

create table if not exists public.todos (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  routine_id   bigint references public.routines (id) on delete set null,
  title        text not null check (char_length(title) between 1 and 200),
  date         date not null,
  start_time   text check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_time     text check (end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  status       text not null default 'todo' check (status in ('todo', 'done', 'partial', 'missed', 'skipped')),
  is_important boolean not null default false,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (routine_id, date),
  check (end_time is null or (start_time is not null and end_time > start_time))
);
create index if not exists todos_user_date_idx on public.todos (user_id, date);

create table if not exists public.reasons (
  id    bigint generated always as identity primary key,
  label text not null unique
);
insert into public.reasons (label)
values ('피곤함'), ('폰·SNS'), ('급한 일'), ('계획이 무리'), ('시작이 어려움'), ('기타')
on conflict (label) do nothing;

create table if not exists public.reflections (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  todo_id     bigint not null unique references public.todos (id) on delete cascade,
  reason_id   bigint references public.reasons (id),
  reason_note text check (char_length(reason_note) <= 500),
  actual      text check (char_length(actual) <= 500),
  next_action text check (char_length(next_action) <= 500),
  created_at  timestamptz not null default now()
);

-- ── 권한: 로그인한 사용자(authenticated)만, anon 은 없음 ──────────

revoke all on public.routines, public.todos, public.reasons, public.reflections from anon;
grant select, insert, update, delete on public.routines, public.todos, public.reflections to authenticated;
grant select on public.reasons to authenticated;

-- ── RLS ────────────────────────────────────────────────

alter table public.routines    enable row level security;
alter table public.todos       enable row level security;
alter table public.reasons     enable row level security;
alter table public.reflections enable row level security;

-- routines: 자기 것만
drop policy if exists "routines: own rows" on public.routines;
create policy "routines: own rows" on public.routines
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- todos: 자기 것만, 연결하는 루틴도 자기 것이어야 한다
drop policy if exists "todos: own rows" on public.todos;
create policy "todos: own rows" on public.todos
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (routine_id is null
         or exists (select 1 from public.routines r where r.id = routine_id and r.user_id = (select auth.uid())))
  );

-- reflections: 자기 것만, 회고를 다는 할 일도 자기 것이어야 한다
drop policy if exists "reflections: own rows" on public.reflections;
create policy "reflections: own rows" on public.reflections
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.todos t where t.id = todo_id and t.user_id = (select auth.uid()))
  );

-- reasons: 로그인한 사용자는 읽기만
drop policy if exists "reasons: read" on public.reasons;
create policy "reasons: read" on public.reasons
  for select to authenticated
  using (true);

-- ── 함수: 날짜별 목록 (루틴 자동 생성 + 회고 + 지난번 다짐) ──────
-- security invoker: 호출한 사용자의 권한으로 실행되므로 RLS가 그대로 적용된다.

create or replace function public.day_todos(p_date date)
returns table (
  id bigint, routine_id bigint, title text, date date, start_time text, end_time text,
  status text, is_important boolean, completed_at timestamptz, created_at timestamptz,
  reason_id bigint, reason_note text, actual text, next_action text,
  last_next_action text, last_next_date date
)
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
begin
  -- 그 날짜에 해당하는 내 루틴을 할 일로 만든다. 이미 있으면 (routine_id, date) 중복 금지로 건너뛴다.
  insert into public.todos (routine_id, title, date, start_time, end_time, is_important)
  select r.id, r.title, p_date, r.start_time, r.end_time, r.is_important
  from public.routines r
  where (',' || r.repeat_days || ',') like '%,' || extract(isodow from p_date)::int || ',%'
    and (r.created_at at time zone 'Asia/Seoul')::date <= p_date
    and (r.ended_on is null or p_date <= r.ended_on)
  on conflict (routine_id, date) do nothing;

  return query
  select t.id, t.routine_id, t.title, t.date, t.start_time, t.end_time,
         t.status, t.is_important, t.completed_at, t.created_at,
         rf.reason_id, rf.reason_note, rf.actual, rf.next_action,
         prev.next_action, prev.date
  from public.todos t
  left join public.reflections rf on rf.todo_id = t.id
  -- 같은 루틴의, 이 날짜보다 이전 기록 중 '다음엔 이렇게'가 있는 가장 최근 것
  left join lateral (
    select r2.next_action, t2.date
    from public.reflections r2
    join public.todos t2 on t2.id = r2.todo_id
    where t.routine_id is not null
      and t2.routine_id = t.routine_id
      and t2.date < t.date
      and coalesce(r2.next_action, '') <> ''
    order by t2.date desc
    limit 1
  ) prev on true
  where t.date = p_date and t.status <> 'skipped'
  order by t.start_time nulls last, t.id;
end;
$$;

revoke all on function public.day_todos(date) from public, anon;
grant execute on function public.day_todos(date) to authenticated;
