"""Settling a table twice, and late kitchen updates on paid orders. In-memory fake database."""
import asyncio
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:1/audit-tests")
os.environ.setdefault("DB_NAME", "audit_tests")
os.environ.setdefault("JWT_SECRET", "test-secret")

import pytest
import server


def match(doc, q):
    for k, v in q.items():
        if k == "$or":
            if not any(match(doc, c) for c in v):
                return False
        elif isinstance(v, dict):
            val = doc.get(k)
            if "$in" in v and not (val in v["$in"] or (isinstance(val, list) and set(val) & set(v["$in"]))):
                return False
            if "$nin" in v and val in v["$nin"]:
                return False
            if "$ne" in v and val == v["$ne"]:
                return False
        elif isinstance(doc.get(k), list):
            if v not in doc[k]:
                return False
        elif doc.get(k) != v:
            return False
    return True


class R:
    def __init__(self, n):
        self.matched_count = self.modified_count = n


class Col:
    def __init__(self, docs=None):
        self.docs = docs or []

    def find(self, q, *a, **k):
        docs = [dict(d) for d in self.docs if match(d, q)]

        class C:
            def sort(self, *a, **k):
                return self

            async def to_list(self, n):
                return docs
        return C()

    async def find_one(self, q, *a, **k):
        for d in self.docs:
            if match(d, q):
                return dict(d)

    async def count_documents(self, q):
        return len([d for d in self.docs if match(d, q)])

    async def insert_one(self, d):
        self.docs.append(dict(d))

    async def update_one(self, q, u, **k):
        for d in self.docs:
            if match(d, q):
                d.update(u.get("$set", {}))
                return R(1)
        return R(0)

    async def update_many(self, q, u, **k):
        hit = [d for d in self.docs if match(d, q)]
        for d in hit:
            d.update(u.get("$set", {}))
        return R(len(hit))


class Db:
    def __init__(self, **cols):
        self.cols = {k: Col(v) for k, v in cols.items()}

    def __getattr__(self, n):
        return self.cols.setdefault(n, Col())


@pytest.fixture
def fake(monkeypatch):
    db = Db(orders=[
        {"id": "o1", "tenant_id": "t1", "table_number": "T1", "status": "paid", "subtotal": 100, "items": []},
        {"id": "o2", "tenant_id": "t1", "table_number": "T1", "status": "placed", "subtotal": 200, "items": []},
        {"id": "x1", "tenant_id": "t2", "table_number": "T1", "status": "placed", "subtotal": 50, "items": []},
    ], restaurants=[{"id": "t1"}])

    async def no_notify(*a, **k):
        return None
    monkeypatch.setattr(server, "db", db)
    monkeypatch.setattr(server, "notify_tenant", no_notify)
    return db


USER = {"id": "u1", "role": "waiter", "tenant_id": "t1"}


def status_of(db, oid):
    return next(d["status"] for d in db.cols["orders"].docs if d["id"] == oid)


def test_repeat_settle_does_not_pay_next_customer(fake):
    # o1 was settled already; the same request comes again (double tap / offline retry)
    payload = server.SettleTableIn(table_number="T1", order_ids=["o1"])
    asyncio.run(server.settle_table_endpoint(payload, USER))
    assert status_of(fake, "o2") == "placed"
    assert not fake.bills.docs


def test_settle_without_ids_still_settles_table(fake):
    asyncio.run(server.settle_table_endpoint(server.SettleTableIn(table_number="T1"), USER))
    assert status_of(fake, "o2") == "paid"


def test_late_served_does_not_reopen_paid_order(fake):
    asyncio.run(server.update_order_status("o1", server.OrderStatusIn(status="served"), USER))
    assert status_of(fake, "o1") == "paid"


def test_cannot_change_other_restaurants_order(fake):
    with pytest.raises(server.HTTPException) as e:
        asyncio.run(server.update_order_status("x1", server.OrderStatusIn(status="cancelled"), USER))
    assert e.value.status_code == 404
    assert status_of(fake, "x1") == "placed"


def test_normal_kitchen_update_works(fake):
    asyncio.run(server.update_order_status("o2", server.OrderStatusIn(status="ready"), USER))
    assert status_of(fake, "o2") == "ready"
