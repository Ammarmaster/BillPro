"""Monthly AutoPay charges from Razorpay must keep the restaurant active on its own plan.
The database is an in-memory fake (no real data touched)."""
import asyncio
import json
import os
from datetime import datetime, timedelta, timezone

os.environ["MONGO_URL"] = "mongodb://localhost:1/renewal-tests"
os.environ["DB_NAME"] = "renewal_tests"
os.environ["JWT_SECRET"] = "test-secret"

import server


def _match(doc, query):
    for k, v in query.items():
        if isinstance(v, dict) and "$ne" in v:
            if doc.get(k) == v["$ne"]:
                return False
        elif doc.get(k) != v:
            return False
    return True


class Col:
    def __init__(self, docs):
        self.docs = docs

    async def find_one(self, query, projection=None, sort=None):
        found = [d for d in self.docs if _match(d, query)]
        if sort:
            key, direction = sort[0]
            found.sort(key=lambda d: d.get(key, ""), reverse=direction == -1)
        return dict(found[0]) if found else None

    async def update_one(self, query, update):
        for d in self.docs:
            if _match(d, query):
                d.update(update.get("$set", {}))
                for k, v in update.get("$push", {}).items():
                    d.setdefault(k, []).append(v)
                return


class FakeDb:
    def __init__(self, subs):
        self.subscriptions = Col(subs)
        self.plans = Col([
            {"id": "GROWTH_MONTHLY", "name": "Growth", "price": 499.0, "valid_days": 30, "is_active": False},
            {"id": "GROWTH_MONTHLY_599", "name": "Growth", "price": 599.0, "valid_days": 30, "is_active": True},
        ])


def old_growth_sub(**extra):
    ends = datetime.now(timezone.utc) + timedelta(days=1)
    sub = {"id": "s1", "tenant_id": "t1", "plan_id": "GROWTH_MONTHLY", "plan_name": "Growth", "price": 499.0,
           "interval": "month", "status": "active", "razorpay_subscription_id": "sub_rzp1",
           "razorpay_payment_id": "pay_first", "created_at": "2026-10-01", "ends_at": ends.isoformat()}
    sub.update(extra)
    return sub


def renew(monkeypatch, subs, payment_id="pay_month2"):
    monkeypatch.setattr(server, "db", FakeDb(subs))
    return asyncio.run(server._extend_subscription_on_renewal({"id": "sub_rzp1"}, payment_id))


def test_old_499_customer_gets_another_month_on_same_plan(monkeypatch):
    subs = [old_growth_sub()]
    before = datetime.fromisoformat(subs[0]["ends_at"])
    assert renew(monkeypatch, subs) is True
    s = subs[0]
    assert s["plan_id"] == "GROWTH_MONTHLY" and s["price"] == 499.0 and s["status"] == "active"
    assert datetime.fromisoformat(s["ends_at"]) - before == timedelta(days=30)


def test_expired_customer_who_paid_is_active_again(monkeypatch):
    past = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
    subs = [old_growth_sub(status="expired", ends_at=past)]
    assert renew(monkeypatch, subs) is True
    assert subs[0]["status"] == "active"
    assert datetime.fromisoformat(subs[0]["ends_at"]) > datetime.now(timezone.utc) + timedelta(days=29)


def test_same_payment_is_not_counted_twice(monkeypatch):
    subs = [old_growth_sub()]
    assert renew(monkeypatch, subs) is True
    first_end = subs[0]["ends_at"]
    assert renew(monkeypatch, subs) is False
    assert subs[0]["ends_at"] == first_end


def test_first_payment_is_not_added_again(monkeypatch):
    subs = [old_growth_sub()]
    end = subs[0]["ends_at"]
    assert renew(monkeypatch, subs, payment_id="pay_first") is False
    assert subs[0]["ends_at"] == end


def test_switched_plan_is_not_brought_back(monkeypatch):
    subs = [old_growth_sub(status="cancelled"),
            {"id": "s2", "tenant_id": "t1", "plan_id": "PRO_MONTHLY", "status": "active", "created_at": "2026-10-05"}]
    assert renew(monkeypatch, subs) is False
    assert subs[0]["status"] == "cancelled"


class FakeRequest:
    def __init__(self, body):
        self._body = json.dumps(body).encode()
        self.headers = {}

    async def body(self):
        return self._body


def test_webhook_subscription_charged_renews(monkeypatch):
    subs = [old_growth_sub()]
    monkeypatch.setattr(server, "db", FakeDb(subs))
    monkeypatch.setattr(server, "razorpay_client", object())
    monkeypatch.setattr(server, "RAZORPAY_WEBHOOK_SECRET", "")
    event = {"event": "subscription.charged", "payload": {
        "subscription": {"entity": {"id": "sub_rzp1", "plan_id": "plan_TupnPSnQSitc0L"}},
        "payment": {"entity": {"id": "pay_month2", "order_id": "order_x", "amount": 49900}}}}
    result = asyncio.run(server.razorpay_webhook(FakeRequest(event)))
    assert result["renewed"] is True
    assert subs[0]["plan_id"] == "GROWTH_MONTHLY" and subs[0]["price"] == 499.0
