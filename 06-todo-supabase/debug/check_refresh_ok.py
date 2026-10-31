"""회귀 확인: refresh 토큰이 유효하면 여전히 새 쿠키를 받고 요청이 성공하는가?"""
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
        self._data = data if data is not None else {}
        self.content = b"[]"
        self.text = ""

    def json(self):
        return self._data


def fake_request(method, url, headers=None, **kwargs):
    if "/auth/v1/token" in url:
        return FakeResponse(200, {"access_token": "new-access", "refresh_token": "new-refresh", "expires_in": 3600})
    if headers.get("Authorization") == "Bearer new-access":
        return FakeResponse(200, [])
    return FakeResponse(401)


todo_app.requests.request = fake_request
client = todo_app.app.test_client()
client.set_cookie("todo_at", "expired-access")
client.set_cookie("todo_rt", "valid-refresh")

r = client.get("/api/todos")
print(f"상태 {r.status_code}, todo_at={client.get_cookie('todo_at').value}, "
      f"todo_rt={client.get_cookie('todo_rt').value}")
