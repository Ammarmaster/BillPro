"""Deleting orders and bills, with the database replaced by a small in-memory fake (no real data touched)."""
import asyncio
import os
import types

# Set before importing the server: load_dotenv keeps existing values, so the real .env is never used here
os.environ["MONGO_URL"] = "mongodb://localhost:1/remove-orders-tests"
os.environ["DB_NAME"] = "remove_orders_tests"
os.environ["JWT_SECRET"] = "test-secret"

import pytest
from fastapi import HTTPException

import server

OWNER = {"id": "u1", "tenant_id": "t1", "role": "owner"}
WAITER = {"id": "u2", "tenant_id": "t1", "role": "waiter"}


def _matches(doc, query):
    for key, want in query.items():
        if key == "$or":
            if not any(_matches(doc, q) for q in want):
                return False
            continue
        have = doc.get(key)
        values = have if isinstance(have, list) else [have]
        if isinstance(want, dict):
            if "$in" in want and not any(v in want["$in"] for v in values):
                return False
            if "$nin" in want and any(v in want["$nin"] for v in values):
                return False
            if "$ne" in want and want["$ne"] in values:
                return False
        elif want not in values:
            return False
    return True


class FakeCursor:
    def __init__(self, docs):
        self.docs = docs

    async def to_list(self, _limit):
        return [dict(d) for d in self.docs]


class FakeCollection:
    def __init__(self, docs=None):
        self.docs = docs or []

    def find(self, query, _projection=None):
        return FakeCursor([d for d in self.docs if _matches(d, query)])

    async def count_documents(self, query):
        return len([d for d in self.docs if _matches(d, query)])

    async def insert_one(self, doc):
        self.docs.append(dict(doc))

    async def delete_one(self, query):
        self.docs = [d for d in self.docs if not _matches(d, query)]

    async def update_one(self, query, update):
        for d in self.docs:
            if _matches(d, query):
                d.update(update["$set"])
                return

    async def update_many(self, query, update):
        for d in self.docs:
            if _matches(d, query):
                d.update(update["$set"])


def _order(oid, status="placed", table="1", price=100):
    return {"id": oid, "tenant_id": "t1", "table_number": table, "status": status, "customer_name": "Guest", "subtotal": price, "items": [{"name": oid, "price": price, "quantity": 1}]}


def _bill(bid, order_ids, status="pending", total=200):
    return {"id": bid, "tenant_id": "t1", "order_id": order_ids[0], "order_ids": order_ids, "status": status, "total": total, "subtotal": total, "items": [], "discount": 0.0, "tax_percent": 0.0, "gst_enabled": False}


@pytest.fixture
def db(monkeypatch):
    fake = types.SimpleNamespace(orders=FakeCollection(), bills=FakeCollection(), deleted_bills=FakeCollection(), tables=FakeCollection())

    async def ensure_tenant(user):
        return user["tenant_id"]

    async def notify(*_args, **_kwargs):
        return None

    monkeypatch.setattr(server, "db", fake)
    monkeypatch.setattr(server, "_ensure_tenant", ensure_tenant)
    monkeypatch.setattr(server, "notify_tenant", notify)
    return fake


def remove(order_ids, user=OWNER):
    return asyncio.run(server.remove_orders(server.RemoveOrdersIn(order_ids=order_ids), user))


def test_last_order_frees_the_table(db):
    db.orders.docs = [_order("o1")]
    db.tables.docs = [{"id": "tb1", "tenant_id": "t1", "label": "1", "status": "occupied"}]
    remove(["o1"], WAITER)
    assert db.orders.docs[0]["status"] == "cancelled"
    assert db.tables.docs[0]["status"] == "available"


def test_table_stays_occupied_while_another_order_is_open(db):
    db.orders.docs = [_order("o1"), _order("o2")]
    db.tables.docs = [{"id": "tb1", "tenant_id": "t1", "label": "1", "status": "occupied"}]
    remove(["o1"], WAITER)
    assert db.tables.docs[0]["status"] == "occupied"


def test_unpaid_takeaway_bill_is_removed(db):
    db.orders.docs = [_order("o1", table="Takeaway")]
    db.bills.docs = [_bill("b1", ["o1"])]
    remove(["o1"], WAITER)
    assert db.bills.docs == []
    assert db.deleted_bills.docs[0]["id"] == "b1"


def test_paid_bill_leaves_sales_but_is_kept_for_records(db):
    db.orders.docs = [_order("o1", status="paid")]
    db.bills.docs = [_bill("b1", ["o1"], status="paid")]
    remove(["o1"], OWNER)
    assert db.bills.docs == []
    assert db.deleted_bills.docs[0]["status"] == "paid"
    assert db.orders.docs[0]["status"] == "cancelled"


def test_waiter_cannot_delete_a_paid_order(db):
    db.orders.docs = [_order("o1", status="paid")]
    db.bills.docs = [_bill("b1", ["o1"], status="paid")]
    with pytest.raises(HTTPException) as err:
        remove(["o1"], WAITER)
    assert err.value.status_code == 403
    assert db.orders.docs[0]["status"] == "paid"
    assert len(db.bills.docs) == 1


def test_shared_bill_only_loses_the_removed_order(db):
    db.orders.docs = [_order("o1"), _order("o2", price=150)]
    db.bills.docs = [_bill("b1", ["o1", "o2"], total=250)]
    remove(["o1"], WAITER)
    bill = db.bills.docs[0]
    assert bill["order_ids"] == ["o2"]
    assert bill["order_id"] == "o2"
    assert bill["total"] == 150
    assert [i["name"] for i in bill["items"]] == ["o2"]


def test_another_restaurants_order_cannot_be_deleted(db):
    db.orders.docs = [{**_order("o1"), "tenant_id": "t2"}]
    with pytest.raises(HTTPException) as err:
        remove(["o1"], OWNER)
    assert err.value.status_code == 404
    assert db.orders.docs[0]["status"] == "placed"
