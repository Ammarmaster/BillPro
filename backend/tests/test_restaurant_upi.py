"""Bills must carry the restaurant's own UPI ID. The database is an in-memory fake (no real data touched)."""
import asyncio
import os

# Set before importing the server: load_dotenv keeps existing values, so the real .env is never used here
os.environ["MONGO_URL"] = "mongodb://localhost:1/restaurant-upi-tests"
os.environ["DB_NAME"] = "restaurant_upi_tests"
os.environ["JWT_SECRET"] = "test-secret"

import server


class FakeCursor:
    def __init__(self, docs):
        self.docs = docs

    def __aiter__(self):
        self.it = iter(self.docs)
        return self

    async def __anext__(self):
        try:
            return next(self.it)
        except StopIteration:
            raise StopAsyncIteration

    async def to_list(self, _limit):
        return self.docs


def _matches(doc, query):
    for key, want in query.items():
        if key == "$or":
            if not any(_matches(doc, q) for q in want):
                return False
        elif isinstance(want, dict):
            if "$in" in want and doc.get(key) not in want["$in"]:
                return False
        elif doc.get(key) != want:
            return False
    return True


class FakeCollection:
    def __init__(self, docs=None):
        self.docs = docs or []

    def find(self, query, _projection=None):
        return FakeCursor([dict(d) for d in self.docs if _matches(d, query)])

    async def find_one(self, query, _projection=None, **_kwargs):
        return next((dict(d) for d in self.docs if _matches(d, query)), None)

    async def insert_one(self, doc):
        self.docs.append(doc)

    async def update_one(self, query, update, **_kwargs):
        for doc in self.docs:
            if _matches(doc, query):
                for path, value in update.get("$set", {}).items():
                    target = doc
                    *parents, leaf = path.split(".")
                    for parent in parents:
                        target = target[parent]
                    target[leaf] = value
                return

    async def update_many(self, *_args, **_kwargs):
        return None


class FakeDb:
    def __init__(self, **collections):
        self.collections = {k: FakeCollection(v) for k, v in collections.items()}

    def __getattr__(self, name):
        return self.collections.setdefault(name, FakeCollection())


def test_new_bill_snapshot_has_restaurants_own_upi(monkeypatch):
    db = FakeDb(
        restaurants=[{"id": "t1", "name": "Cafe", "upi_id": "cafe@okaxis", "merchant_name": "Cafe"}],
        orders=[{
            "id": "o1", "tenant_id": "t1", "table_number": "Takeaway", "status": "placed",
            "items": [{"menu_item_id": "m1", "name": "Tea", "price": 20.0, "quantity": 1, "notes": ""}],
            "subtotal": 20.0,
        }],
    )
    monkeypatch.setattr(server, "db", db)

    async def allow(*_args, **_kwargs):
        return None

    monkeypatch.setattr(server, "_ensure_active_subscription", allow)
    user = {"id": "u1", "tenant_id": "t1", "role": "owner"}
    bill = asyncio.run(server.create_bill(server.BillIn(order_id="o1"), user))

    assert bill["restaurant_snapshot"]["upi_id"] == "cafe@okaxis"
    assert bill["restaurant_snapshot"]["merchant_name"] == "Cafe"
    assert bill["upi_url"].startswith("upi://pay?pa=cafe@okaxis&")


def test_changing_upi_updates_only_this_restaurants_unpaid_bills(monkeypatch):
    old_url = "upi://pay?pa=old@ybl&pn=Cafe&am=20&cu=INR&tn=Table-1"
    bills = [
        {"id": "pending", "tenant_id": "t1", "status": "pending", "upi_url": old_url,
         "restaurant_snapshot": {"name": "Cafe", "upi_id": "old@ybl"}},
        {"id": "no-snapshot", "tenant_id": "t1", "status": "pending", "upi_url": old_url},
        {"id": "paid", "tenant_id": "t1", "status": "paid", "upi_url": old_url,
         "restaurant_snapshot": {"name": "Cafe", "upi_id": "old@ybl"}},
        {"id": "other-shop", "tenant_id": "t2", "status": "pending", "upi_url": old_url,
         "restaurant_snapshot": {"name": "Other", "upi_id": "old@ybl"}},
    ]
    monkeypatch.setattr(server, "db", FakeDb(bills=bills))

    asyncio.run(server._sync_pending_bills_upi("t1", "new@okaxis", "Cafe"))

    by_id = {b["id"]: b for b in bills}
    assert by_id["pending"]["upi_url"] == "upi://pay?pa=new@okaxis&pn=Cafe&am=20&cu=INR&tn=Table-1"
    assert by_id["pending"]["restaurant_snapshot"]["upi_id"] == "new@okaxis"
    assert by_id["no-snapshot"]["upi_url"].startswith("upi://pay?pa=new@okaxis&")
    assert "restaurant_snapshot" not in by_id["no-snapshot"]
    assert by_id["paid"]["upi_url"] == old_url
    assert by_id["other-shop"]["upi_url"] == old_url
