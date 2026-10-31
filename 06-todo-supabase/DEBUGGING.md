# 디버깅 기록

에이전트가 만든 코드를 다시 읽고, 의심 가는 부분을 **재현 → 원인 확인 → 수정 → 확인** 순서로 처리했다.
실제 Supabase를 건드리지 않도록 Supabase 응답을 흉내 내는 스크립트(`debug/`)로 재현했다.

| # | 문제 | 수정 커밋 |
|---|---|---|
| 1 | refresh 토큰이 무효해도 쿠키가 남아 요청마다 갱신을 반복 | `965919b` |
| 2 | "(지남)" 표시와 "오늘" 필터가 서로 다른 시계를 기준으로 판단 | `332c99b` |

## 1. 무효한 refresh 토큰이 계속 남는 문제

**발견:** `app.py`의 `renew()`를 읽다가, 갱신에 실패하면 `None`만 돌려주고 쿠키는 그대로 두는 것을 확인했다.

**재현:** `debug/repro_refresh.py`. access 토큰은 만료(401), refresh 토큰도 무효(400)인 상황에서 `/api/todos`를 3번 요청했다.

수정 전:
```
요청 1: 상태 401, Supabase 갱신 호출 1회, Set-Cookie 0개, 남은 쿠키 todo_rt=True
요청 2: 상태 401, Supabase 갱신 호출 1회, Set-Cookie 0개, 남은 쿠키 todo_rt=True
요청 3: 상태 401, Supabase 갱신 호출 1회, Set-Cookie 0개, 남은 쿠키 todo_rt=True
```

**원인:** 쓸 수 없는 쿠키가 브라우저에 남아서, 이후 모든 요청이 실패할 갱신을 다시 시도한다. 화면은 401을 받아 로그인 화면으로 가지만, 서버는 요청마다 Supabase에 불필요한 호출을 한 번씩 더 한다.
refresh 토큰은 만료되거나, 다른 곳에서 로그아웃하거나, 이미 사용된 경우 무효가 된다.

**해결:** `renew()`가 실패하면 `g.clear_session = True`를 표시한다. 응답 직전에 `apply_cookies()`가 두 쿠키를 지운다.

수정 후:
```
요청 1: 상태 401, Supabase 갱신 호출 1회, Set-Cookie 2개, 남은 쿠키 todo_rt=False
요청 2: 상태 401, Supabase 갱신 호출 0회, Set-Cookie 2개, 남은 쿠키 todo_rt=False
요청 3: 상태 401, Supabase 갱신 호출 0회, Set-Cookie 2개, 남은 쿠키 todo_rt=False
```

**회귀 확인:** `debug/check_refresh_ok.py`. refresh 토큰이 유효하면 여전히 새 쿠키를 받고 200으로 성공한다.
```
상태 200, todo_at=new-access, todo_rt=new-refresh
```

## 2. "(지남)" 표시와 "오늘" 필터의 기준 시계가 다른 문제

**발견:** "오늘" 필터는 서버의 `today()`(Asia/Seoul)로 계산하는데, "(지남)" 표시는 `app.js`의 `todayString()`이 브라우저 시계로 계산하고 있었다.

**재현:** 시각을 2026-10-29 23:30 UTC(한국 시간 10-30 08:30)로 고정하고, 브라우저 시간대가 UTC인 경우를 가정했다. 마감일이 2026-10-29인 미완료 항목으로 확인했다.
```
[브라우저: app.js의 todayString, 시간대 UTC]
브라우저의 오늘: 2026-10-29 / 마감 2026-10-29 항목 (지남) 표시: false
[서버: app.py의 today, Asia/Seoul]
서버의 오늘: 2026-10-30 / 마감 2026-10-29 항목이 오늘 필터에 포함: False
```

**원인:** 한국 기준으로 이미 하루 지난 항목이 "(지남)"으로도, "오늘 할 일"에도 표시되지 않아 어디에서도 강조되지 않는다. 같은 "오늘"을 두 곳에서 따로 계산한 것이 원인이다.
한국 시간대로 설정된 PC에서는 드러나지 않고, 해외에 있거나 PC 시간대가 다르게 설정된 경우에 생긴다.

**해결:** 날짜 판단을 서버 한곳으로 모았다. 목록 API가 각 항목에 `overdue`를 계산해서 보내고, 화면은 그 값만 쓴다. 브라우저의 `todayString()`은 삭제했다.

**확인:** `debug/check_overdue.py`. 같은 고정 시각에서 서버가 계산한 값이다.
```
어제 마감          due=2026-10-29 overdue=True
오늘 마감          due=2026-10-30 overdue=False
어제 마감, 완료      due=2026-10-29 overdue=False
마감 없음          due=None overdue=False
```

## 다시 실행하기
```
cd debug
python repro_refresh.py
python check_refresh_ok.py
python check_overdue.py
```
가짜 응답을 쓰므로 `.env`나 인터넷 연결 없이 돌아간다. 지금 코드에서 실행하면 수정 후 결과가 나온다.

## 확인하지 못한 것
- 실제 Supabase와 브라우저로는 다시 확인하지 않았다. 위 결과는 모두 가짜 Supabase 응답으로 확인한 것이다.
