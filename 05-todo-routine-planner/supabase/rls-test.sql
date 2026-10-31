-- RLS 확인: B 계정 권한으로 A 계정의 데이터에 접근해 본다.
-- Supabase SQL Editor 에서 실행. A_ID, B_ID 에 두 테스트 계정의 사용자 ID(auth.users.id)를 넣는다.
-- 끝에서 일부러 오류(RLS_RESULT)를 내므로, 만약 RLS가 뚫려 있어도 시험 중 바뀐 것은 모두 되돌려진다.
do $$
declare
  a uuid := 'A_ID';
  b uuid := 'B_ID';
  b_total int; b_own int; b_sees_a int; b_upd int; b_del int; b_ins text; b_refl text;
  a_total int; a_sees_b int;
  a_todo bigint;
begin
  select id into a_todo from public.todos where user_id = a order by id limit 1;

  -- ① B 로 행동 (로그인한 B와 같은 권한: role=authenticated, auth.uid()=B)
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into b_total from public.todos;
  select count(*) into b_own from public.todos where user_id = b;
  select count(*) into b_sees_a from public.todos where user_id = a;
  with u as (update public.todos set title = 'B가 바꿈' where user_id = a returning 1) select count(*) into b_upd from u;
  with d as (delete from public.todos where user_id = a returning 1) select count(*) into b_del from d;
  begin
    insert into public.todos (user_id, title, date) values (a, 'B가 A 이름으로 추가', current_date);
    b_ins := '허용됨(문제!)';
  exception when others then b_ins := '거절';
  end;
  begin
    insert into public.reflections (user_id, todo_id, actual) values (b, a_todo, 'B가 A 할 일에 회고');
    b_refl := '허용됨(문제!)';
  exception when others then b_refl := '거절';
  end;

  -- ② A 로 행동
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into a_total from public.todos;
  select count(*) into a_sees_b from public.todos where user_id = b;

  raise exception E'RLS_RESULT\n[B로 로그인] 보이는 할 일 %개 (자기 것 %개) | A 할 일 보임 %개 | A 할 일 수정 %개 | A 할 일 삭제 %개 | A 이름으로 추가: % | A 할 일에 회고: %\n[A로 로그인] 보이는 할 일 %개 | B 할 일 보임 %개\n(이 오류는 일부러 낸 것 — 시험 중 바뀐 것은 모두 되돌려짐)',
    b_total, b_own, b_sees_a, b_upd, b_del, b_ins, b_refl, a_total, a_sees_b;
end $$;
