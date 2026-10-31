"""문제 2 확인: 서버가 Asia/Seoul 기준으로 overdue를 계산하는가?
시각을 2026-10-29 23:30 UTC(한국 10-30 08:30)로 고정한다."""
import os
import sys
from pathlib import Path
from datetime import datetime, timezone

os.environ["SUPABASE_URL"] = "https://fake.supabase.co"
os.environ["SUPABASE_ANON_KEY"] = "fake-key"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import app as todo_app  # noqa: E402

FIXED = datetime(2026, 10, 29, 23, 30, tzinfo=timezone.utc)


class FixedDatetime(datetime):
    @classmethod
    def now(cls, tz=None):
        return FIXED.astimezone(tz) if tz else FIXED


ROWS = [
    {"id": 1, "title": "어제 마감", "is_done": False, "due_date": "2026-10-29"},
    {"id": 2, "title": "오늘 마감", "is_done": False, "due_date": "2026-10-30"},
    {"id": 3, "title": "어제 마감, 완료", "is_done": True, "due_date": "2026-10-29"},
    {"id": 4, "title": "마감 없음", "is_done": False, "due_date": None},
]


class FakeResponse:
    status_code = 200
    content = b"[]"

    def json(self):
        return [dict(r) for r in ROWS]


todo_app.datetime = FixedDatetime
todo_app.requests.request = lambda *a, **k: FakeResponse()
client = todo_app.app.test_client()
client.set_cookie("todo_at", "access")

for todo in client.get("/api/todos").get_json():
    print(f"{todo['title']:<14} due={todo['due_date']} overdue={todo['overdue']}")
