"""문제 1 재현: refresh 토큰이 무효해도 쿠키가 지워지지 않아 요청마다 갱신을 다시 시도하는가?

실제 Supabase 대신 가짜 응답을 돌려준다.
- /rest/v1/todo  -> 401 (access 토큰 만료)
- /auth/v1/token -> 400 (refresh 토큰도 무효)
"""
import os
import sys
from pathlib import Path

os.environ["SUPABASE_URL"] = "https://fake.supabase.co"
os.environ["SUPABASE_ANON_KEY"] = "fake-key"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import app as todo_app  # noqa: E402


class FakeResponse:
    def __init__(self, status, data=None):
        self.status_code = status
        self._data = data or {}
        self.content = b"{}"
        self.text = "{}"

    def json(self):
        return self._data


calls = []


def fake_request(method, url, **kwargs):
    calls.append(url.split("supabase.co")[1])
    if "/auth/v1/token" in url:
        return FakeResponse(400, {"error_code": "refresh_token_not_found"})
    return FakeResponse(401)


todo_app.requests.request = fake_request
client = todo_app.app.test_client()
client.set_cookie("todo_at", "expired-access")
client.set_cookie("todo_rt", "invalid-refresh")

for i in (1, 2, 3):
    calls.clear()
    r = client.get("/api/todos")
    set_cookies = r.headers.getlist("Set-Cookie")
    refresh_calls = sum("/auth/v1/token" in c for c in calls)
    print(f"요청 {i}: 상태 {r.status_code}, Supabase 갱신 호출 {refresh_calls}회, "
          f"Set-Cookie {len(set_cookies)}개, 남은 쿠키 todo_rt={client.get_cookie('todo_rt') is not None}")
