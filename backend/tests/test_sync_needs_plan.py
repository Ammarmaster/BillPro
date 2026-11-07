"""Offline sync must not let a restaurant without a plan create orders, bills or cash sessions.
The database is an in-memory fake (no real data touched)."""
import asyncio
import os

# Set before importing the server: load_dotenv keeps existing values, so the real .env is never used here
os.environ["MONGO_URL"] = "mongodb://localhost:1/sync-plan-tests"
os.environ["DB_NAME"] = "sync_plan_tests"
os.environ["JWT_SECRET"] = "test-secret"

import server

OWNER = {"id": "u1", "role": "owner", "tenant_id": "t1"}


class Recorder:
    def __init__(self, name, log):
        self.name, self.log = name, log

    async def insert_one(self, doc):
        self.log.append((self.name, "insert"))

    async def find_one(self, *a, **k):
        self.log.append((self.name, "find"))
        return None

    def __getattr__(self, attr):
        async def anything(*a, **k):
            self.log.append((self.name, attr))
            return None
        return anything


class FakeDb:
    def __init__(self):
        self.log = []

    def __getattr__(self, name):
        return Recorder(name, self.log)


def run_sync(monkeypatch, status, actions):
    fake = FakeDb()
    lookups = []

    async def fake_tenant(user):
        return "t1"

    async def fake_limits(tid):
        lookups.append(tid)
        return {"status": status}

    monkeypatch.setattr(server, "db", fake)
    monkeypatch.setattr(server, "_ensure_tenant", fake_tenant)
    monkeypatch.setattr(server, "get_tenant_plan_limits", fake_limits)
    payload = server.BatchSyncRequest(actions=[server.BatchSyncAction(**a) for a in actions])
    result = asyncio.run(server.batch_sync(payload, OWNER))
    return result, fake.log, lookups


PAID_ACTIONS = [
    {"type": "CREATE_ORDER", "payload": {"table_number": "1", "items": [{"name": "Tea", "price": 10, "quantity": 1}]}, "localId": "ord_1"},
    {"type": "CREATE_BILL", "payload": {"order_id": "ord_1"}, "localId": "bill_1"},
    {"type": "OPEN_CASH_SESSION", "payload": {"opening_cash": 100}, "localId": "cs_1"},
]


def test_no_plan_skips_orders_bills_and_cash(monkeypatch):
    actions = PAID_ACTIONS + [{"type": "CREATE_CATEGORY", "payload": {"name": "Drinks"}, "localId": "cat_1"}]
    result, log, lookups = run_sync(monkeypatch, "expired", actions)
    touched = {name for name, _ in log}
    assert "orders" not in touched and "bills" not in touched and "cash_sessions" not in touched
    # Setting up the menu still works without a plan
    assert ("categories", "insert") in log
    assert result["synced_count"] == 1
    assert "ord_1" not in result["id_map"] and "bill_1" not in result["id_map"]
    # The plan is looked up once per sync, not once per action
    assert lookups == ["t1"]


def test_active_plan_still_syncs_orders(monkeypatch):
    result, log, _ = run_sync(monkeypatch, "active", PAID_ACTIONS[:1])
    assert ("orders", "insert") in log
    assert "ord_1" in result["id_map"]
