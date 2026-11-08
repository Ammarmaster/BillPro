"""Close Counter and the 3:30 AM auto reset. The database is an in-memory fake (no real data touched)."""
import asyncio
import os
from datetime import datetime, timedelta, timezone

os.environ["MONGO_URL"] = "mongodb://localhost:1/close-counter-tests"
os.environ["DB_NAME"] = "close_counter_tests"
os.environ["JWT_SECRET"] = "test-secret"

import server

IST = timezone(timedelta(hours=5, minutes=30))


def ist(day, hour, minute=0):
    return datetime(2026, 11, day, hour, minute, tzinfo=IST)


# ---- day start rules ----

def test_sale_after_midnight_stays_in_old_day():
    # Nobody pressed Close Counter. At 1 AM on the 9th the day still started at 3:30 AM on the 8th
    start = server.business_day_start(None, now=ist(9, 1))
    assert start == ist(8, 3, 30)
    assert server.is_timestamp_in_current_business_day(ist(9, 0, 30).isoformat(), start)


def test_auto_reset_at_330_when_counter_not_closed():
    assert server.business_day_start(None, now=ist(9, 3, 31)) == ist(9, 3, 30)
    assert server.business_day_start(None, now=ist(9, 3, 29)) == ist(8, 3, 30)


def test_close_counter_after_midnight_starts_new_day_then():
    closed = ist(9, 1, 15)
    assert server.business_day_start(closed.isoformat(), now=ist(9, 2)) == closed
    # 3:30 AM does not reset again: the counter was already closed
    assert server.business_day_start(closed.isoformat(), now=ist(9, 10)) == closed
    # Next night the counter is forgotten: auto reset at 3:30 AM on the 10th
    assert server.business_day_start(closed.isoformat(), now=ist(10, 4)) == ist(10, 3, 30)


def test_close_counter_before_midnight():
    closed = ist(8, 23, 30)
    assert server.business_day_start(closed.isoformat(), now=ist(9, 12)) == closed


def test_old_close_is_ignored():
    closed = ist(5, 23, 0)
    assert server.business_day_start(closed.isoformat(), now=ist(9, 12)) == ist(9, 3, 30)


def test_sales_before_330_are_labelled_with_the_day_before():
    assert server.business_date_label(ist(9, 2, 59)) == "2026-11-08"
    assert server.business_date_label(ist(9, 3, 31)) == "2026-11-09"


# ---- unpaid orders are never marked paid ----

class Col:
    def __init__(self, name, log, docs=None):
        self.name, self.log, self.docs = name, log, docs or []

    def find(self, *a, **k):
        docs = self.docs

        class Cursor:
            async def to_list(self, n):
                return list(docs)
        return Cursor()

    async def find_one(self, *a, **k):
        return None

    async def count_documents(self, *a, **k):
        return 2

    def __getattr__(self, attr):
        async def anything(*a, **k):
            self.log.append((self.name, attr, a))
            return None
        return anything


class FakeDb:
    def __init__(self, orders=None, bills=None):
        self.log = []
        self.cols = {"orders": Col("orders", self.log, orders), "bills": Col("bills", self.log, bills)}

    def __getattr__(self, name):
        return self.cols.get(name) or Col(name, self.log)


def test_auto_clear_never_marks_unpaid_as_paid(monkeypatch):
    fake = FakeDb(orders=[{"table_number": "T1", "status": "served"}])
    monkeypatch.setattr(server, "db", fake)
    asyncio.run(server._auto_clear_kitchen_orders("t1", force=True))
    for col, action, args in fake.log:
        assert col in ("tables",), f"{col}.{action} should not be touched"
        if args and len(args) > 1:
            assert args[1].get("$set", {}).get("status") != "paid"
    # The table with an unpaid order is kept busy
    tables_update = [a for c, act, a in fake.log if c == "tables"][0]
    assert "T1" in tables_update[0]["label"]["$nin"]


def test_close_counter_saves_day_and_resets(monkeypatch):
    now = datetime.now(timezone.utc)
    bills = [
        {"status": "paid", "total": 300.0, "paid_at": now.isoformat(), "order_id": "o1"},
        {"status": "paid", "total": 200.5, "paid_at": now.isoformat(), "order_id": "o2"},
    ]
    fake = FakeDb(bills=bills)
    notes = []
    now_window = now - timedelta(hours=1)

    async def fake_tenant(user):
        return "t1"

    async def fake_notify(tid, cat, title, msg, data=None):
        notes.append(data)

    async def fake_start(tid):
        return now - timedelta(hours=5)

    monkeypatch.setattr(server, "db", fake)
    monkeypatch.setattr(server, "_ensure_tenant", fake_tenant)
    monkeypatch.setattr(server, "notify_tenant", fake_notify)
    monkeypatch.setattr(server, "get_business_day_start", fake_start)
    monkeypatch.setattr(server, "close_counter_window", lambda now=None: (True, now_window))
    res = asyncio.run(server.close_counter({"id": "u1", "role": "owner", "tenant_id": "t1"}))
    assert res["sales"] == 500.5 and res["bills_count"] == 2 and res["unpaid_orders"] == 2
    assert ("day_closings", "insert_one") in [(c, a) for c, a, _ in fake.log]
    rest_update = [a for c, act, a in fake.log if c == "restaurants" and act == "update_one"][0]
    assert "day_closed_at" in rest_update[1]["$set"]
    # Nothing was marked as paid
    assert not [a for c, act, a in fake.log if c in ("orders", "bills") and act.startswith("update")]
    assert notes and notes[0]["event"] == "DAY_CLOSED"


# ---- Close Counter only from 10 PM to 3:30 AM, once per night ----

def test_close_window_times():
    assert server.close_counter_window(ist(9, 14))[0] is False      # 2 PM: middle of the day
    assert server.close_counter_window(ist(9, 21, 59))[0] is False
    assert server.close_counter_window(ist(9, 22, 0)) == (True, ist(9, 22))
    assert server.close_counter_window(ist(10, 1, 0)) == (True, ist(9, 22))   # after midnight
    assert server.close_counter_window(ist(10, 3, 31))[0] is False


def _owner_setup(monkeypatch, window, closed_at=None):
    class Rest(Col):
        async def find_one(self, *a, **k):
            return {"day_closed_at": closed_at} if closed_at else None
    fake = FakeDb()
    fake.cols["restaurants"] = Rest("restaurants", fake.log)

    async def fake_tenant(user):
        return "t1"

    async def fake_notify(*a, **k):
        return None
    monkeypatch.setattr(server, "db", fake)
    monkeypatch.setattr(server, "_ensure_tenant", fake_tenant)
    monkeypatch.setattr(server, "notify_tenant", fake_notify)
    monkeypatch.setattr(server, "close_counter_window", lambda now=None: window)
    return fake


def test_close_in_middle_of_day_is_refused(monkeypatch):
    import pytest
    fake = _owner_setup(monkeypatch, (False, ist(9, 22)))
    with pytest.raises(server.HTTPException) as e:
        asyncio.run(server.close_counter({"id": "u1", "role": "owner"}))
    assert e.value.status_code == 400
    assert not [c for c, a, _ in fake.log if c in ("restaurants", "day_closings")]


def test_close_twice_same_night_is_refused(monkeypatch):
    import pytest
    fake = _owner_setup(monkeypatch, (True, ist(9, 22)), closed_at=ist(9, 23).isoformat())
    with pytest.raises(server.HTTPException) as e:
        asyncio.run(server.close_counter({"id": "u1", "role": "owner"}))
    assert e.value.status_code == 409
    assert not [c for c, a, _ in fake.log if c == "day_closings"]
