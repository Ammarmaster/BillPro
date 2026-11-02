"""Menu photo scan, with Gemini and the database replaced by fakes (no network, no real menu changes)."""
import asyncio
import json
import os
import re
import sys
import types

# Set before importing the server: load_dotenv keeps existing values, so the real .env is never used here
os.environ["MONGO_URL"] = "mongodb://localhost:1/menu-scan-tests"
os.environ["DB_NAME"] = "menu_scan_tests"
os.environ["JWT_SECRET"] = "test-secret"

import pytest

pytest.importorskip("httpx")  # Required by TestClient and not part of the server's own requirements

from fastapi.testclient import TestClient

import server

OWNER = {"id": "user-1", "tenant_id": "tenant-1", "role": "owner"}
PAGE_ONE = {
    "is_menu": True,
    "categories": [{
        "name": "Starters",
        "items": [
            {"name": "Paneer Tikka", "price": 220, "sourceText": "Paneer Tikka 220", "is_veg": True, "confidence": 0.98},
            {"name": "Chicken 65", "price": None, "sourceText": "Chicken 65", "is_veg": False, "confidence": 0.7},
        ],
    }],
}
PAGE_TWO = {
    "is_menu": True,
    "categories": [
        {"name": "starters", "items": [{"name": "Veg Manchurian", "price": "₹180", "sourceText": "Veg Manchurian 180", "is_veg": True, "confidence": 0.9}]},
        {"name": "Rice", "items": [{"name": "Jeera Rice", "price": 120, "sourceText": "Jeera Rice 120", "is_veg": True, "confidence": 0.9}]},
    ],
}


class FakeCursor:
    def __init__(self, docs):
        self.docs = docs

    async def to_list(self, length=None):
        return [dict(doc) for doc in self.docs]


class FakeCollection:
    def __init__(self, docs=None):
        self.docs = docs or []
        self.find_one_queries = []
        self.updates = []

    def find(self, query=None, projection=None):
        return FakeCursor(self.docs)

    async def find_one(self, query=None, projection=None, sort=None):
        self.find_one_queries.append(query)
        return None

    async def insert_one(self, doc):
        self.docs.append(dict(doc))

    async def update_one(self, query, update):
        self.updates.append((query, update))


class FakeDb:
    def __init__(self):
        self.categories = FakeCollection([{"id": "cat-rice", "tenant_id": "tenant-1", "name": "Rice"}])
        self.menu_items = FakeCollection()


class FakeGemini:
    """Stands in for the Gemini library. Each reply is JSON text, or an Exception to raise."""

    def __init__(self, replies):
        self.replies = list(replies)
        self.models_tried = []
        self.configured_key = None

    def configure(self, api_key=None):
        self.configured_key = api_key

    def GenerativeModel(self, name, generation_config=None):
        gemini = self

        class Model:
            def generate_content(self, parts, request_options=None):
                gemini.models_tried.append(name)
                reply = gemini.replies.pop(0)
                if isinstance(reply, Exception):
                    raise reply
                return types.SimpleNamespace(text=reply)

        return Model()


@pytest.fixture
def scan(monkeypatch):
    db = FakeDb()

    async def plan_limits(tid):
        return {"features": {"ai_menu": True}}

    async def no_notification(*args, **kwargs):
        return None

    monkeypatch.setattr(server, "db", db)
    monkeypatch.setattr(server, "get_tenant_plan_limits", plan_limits)
    monkeypatch.setattr(server, "notify_tenant", no_notification)
    monkeypatch.setitem(server.app.dependency_overrides, server.get_current_user, lambda: OWNER)
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    # Pages are read one at a time so each fake reply goes to a known page
    monkeypatch.setattr(server, "MENU_SCAN_PAGES_AT_ONCE", 1)

    def use_gemini(replies):
        gemini = FakeGemini(replies)
        package = types.ModuleType("google")
        package.generativeai = gemini
        monkeypatch.setitem(sys.modules, "google", package)
        monkeypatch.setitem(sys.modules, "google.generativeai", gemini)
        return gemini

    # No "with" block: the server's startup work (database connections) must not run
    return TestClient(server.app), db, use_gemini


def photos(count=1):
    return [("images", (f"page{i}.jpg", b"fake-photo", "image/jpeg")) for i in range(count)]


def post_photos(client, count=1):
    return client.post("/api/menu/ocr-process", files=photos(count))


def test_blocked_key_gives_a_clear_message_without_trying_other_models(scan):
    client, _, use_gemini = scan
    gemini = use_gemini([Exception("403 Your API key was reported as leaked. Please use another API key.")])
    res = post_photos(client)
    assert res.status_code == 503
    assert res.json()["detail"] == server.MENU_SCAN_KEY_PROBLEM
    assert len(gemini.models_tried) == 1


def test_missing_key_gives_a_clear_message(scan, monkeypatch):
    client, _, use_gemini = scan
    use_gemini([])
    monkeypatch.delenv("GEMINI_API_KEY")
    res = post_photos(client)
    assert res.status_code == 503
    assert res.json()["detail"] == server.MENU_SCAN_KEY_PROBLEM


def test_retired_model_moves_on_to_the_next_one(scan):
    client, _, use_gemini = scan
    gemini = use_gemini([Exception("404 model is no longer available"), json.dumps(PAGE_ONE)])
    res = post_photos(client)
    assert res.status_code == 200
    assert gemini.models_tried == server.MENU_SCAN_MODELS[:2]


def test_quota_used_up_on_every_model_says_busy(scan):
    client, _, use_gemini = scan
    use_gemini([Exception("429 quota exceeded") for _ in server.MENU_SCAN_MODELS])
    res = post_photos(client)
    assert res.status_code == 429
    assert res.json()["detail"] == server.MENU_SCAN_BUSY


def test_broken_ai_reply_tries_the_next_model(scan):
    client, _, use_gemini = scan
    use_gemini(['{"is_menu": true, "categories": [{"name": "Star', json.dumps(PAGE_ONE)])
    assert post_photos(client).status_code == 200


def test_pages_join_into_one_menu(scan):
    client, _, use_gemini = scan
    use_gemini([json.dumps(PAGE_ONE), json.dumps(PAGE_TWO)])
    data = post_photos(client, 2).json()
    assert [c["name"] for c in data["categories"]] == ["Starters", "Rice"]
    assert [i["name"] for i in data["categories"][0]["items"]] == ["Paneer Tikka", "Chicken 65", "Veg Manchurian"]
    assert data["total_items"] == 4
    assert data["failed_pages"] == []


def test_same_page_photographed_twice_does_not_repeat_dishes(scan):
    client, _, use_gemini = scan
    use_gemini([json.dumps(PAGE_ONE), json.dumps(PAGE_ONE)])
    assert post_photos(client, 2).json()["total_items"] == 2


def test_more_than_five_pages_are_all_read(scan):
    client, _, use_gemini = scan
    gemini = use_gemini([json.dumps(PAGE_ONE) for _ in range(7)])
    assert post_photos(client, 7).status_code == 200
    assert len(gemini.models_tried) == 7


def test_too_many_pages_are_refused_with_a_message(scan):
    client, _, use_gemini = scan
    gemini = use_gemini([])
    res = post_photos(client, server.MENU_SCAN_MAX_PAGES + 1)
    assert res.status_code == 400
    assert gemini.models_tried == []


def test_one_bad_page_keeps_the_rest(scan):
    client, _, use_gemini = scan
    use_gemini([json.dumps(PAGE_ONE), json.dumps({"is_menu": False})])
    res = post_photos(client, 2)
    assert res.status_code == 200
    assert res.json()["total_items"] == 2
    assert res.json()["failed_pages"] == [{"page": 2, "reason": server.MENU_SCAN_NOT_A_MENU}]


def test_photo_that_is_not_a_menu_says_so(scan):
    client, _, use_gemini = scan
    use_gemini([json.dumps({"is_menu": False})])
    res = post_photos(client)
    assert res.status_code == 400
    assert res.json()["detail"] == server.MENU_SCAN_NOT_A_MENU


def test_menu_with_no_dishes_says_so(scan):
    client, _, use_gemini = scan
    use_gemini([json.dumps({"is_menu": True, "categories": []})])
    res = post_photos(client)
    assert res.status_code == 400
    assert res.json()["detail"] == server.MENU_SCAN_NO_DISHES


def test_oversized_photo_is_refused_before_calling_the_ai(scan, monkeypatch):
    client, _, use_gemini = scan
    gemini = use_gemini([])
    monkeypatch.setattr(server, "MENU_SCAN_MAX_BYTES", 5)
    assert post_photos(client).status_code == 413
    assert gemini.models_tried == []


@pytest.mark.parametrize(
    "value,expected",
    [
        (120, 120.0),
        (99.5, 99.5),
        ("120", 120.0),
        ("₹120", 120.0),
        ("Rs. 120", 120.0),
        ("1,200", 1200.0),
        ("120/-", 120.0),
        ("120/200", None),
        ("MRP", None),
        ("", None),
        (None, None),
        (0, None),
        (-5, None),
        (True, None),
        (float("inf"), None),
    ],
)
def test_prices_are_cleaned(value, expected):
    assert server._menu_price(value) == expected


def test_badly_formed_dishes_do_not_lose_the_page(scan):
    client, _, use_gemini = scan
    page = {
        "categories": [
            "not-a-category",
            {"name": "Empty", "items": None},
            {"name": None, "items": [
                "not-a-dish",
                {"name": "", "price": 10},
                {"name": "Masala Dosa", "price": 90, "confidence": None, "is_veg": "false", "sourceText": None},
            ]},
        ],
    }
    use_gemini([json.dumps(page)])
    data = post_photos(client).json()
    assert [c["name"] for c in data["categories"]] == ["Uncategorized"]
    dish = data["categories"][0]["items"][0]
    assert dish["name"] == "Masala Dosa"
    assert dish["is_veg"] is False
    assert dish["confidence"] == 0.5
    assert dish["sourceText"] == "Masala Dosa"


def test_dish_not_in_its_source_line_is_marked_for_checking():
    parsed = {"categories": [{"name": "Mains", "items": [
        {"name": "Butter Naan", "price": 50, "sourceText": "Roti 20", "confidence": 0.99},
    ]}]}
    assert server._clean_menu_categories(parsed)[0]["items"][0]["confidence"] == 0.5


def test_only_an_exact_name_matches_an_existing_category(scan):
    client, _, use_gemini = scan
    page = {"categories": [
        {"name": "rice ", "items": [{"name": "Jeera Rice", "price": 120, "sourceText": "Jeera Rice 120"}]},
        {"name": "Fried Rice", "items": [{"name": "Egg Fried Rice", "price": 150, "sourceText": "Egg Fried Rice 150"}]},
    ]}
    use_gemini([json.dumps(page)])
    categories = post_photos(client).json()["categories"]
    assert (categories[0]["is_existing"], categories[0]["matched_id"]) == (True, "cat-rice")
    assert (categories[1]["is_existing"], categories[1]["matched_id"]) == (False, None)


def test_category_name_with_brackets_can_be_imported(scan):
    client, db, _ = scan
    name = "Soups (Veg"
    body = {"categories": [{"name": name, "items": [{"name": "Tomato Soup", "price": 90}]}]}
    res = client.post("/api/menu/bulk-import", json=body)
    assert res.status_code == 200
    pattern = db.categories.find_one_queries[-1]["name"]["$regex"]
    assert re.fullmatch(pattern, name)
    assert db.menu_items.docs[0]["name"] == "Tomato Soup"


def test_replace_price_changes_only_the_price(scan):
    client, db, _ = scan
    body = {"categories": [{"name": "Rice", "category_id": "cat-rice", "items": [
        {"name": "Jeera Rice", "price": 130, "action": "replace", "existing_item_id": "item-1", "is_veg": False, "description": ""},
    ]}]}
    assert client.post("/api/menu/bulk-import", json=body).status_code == 200
    assert db.menu_items.updates == [({"id": "item-1", "tenant_id": "tenant-1"}, {"$set": {"price": 130.0}})]


def test_dish_photo_without_a_key_skips_gemini_and_still_gives_a_picture(scan, monkeypatch):
    _, _, use_gemini = scan
    gemini = use_gemini([])
    monkeypatch.delenv("GEMINI_API_KEY")
    monkeypatch.setattr(server, "_gemini_image_cache", {})
    result = asyncio.run(server.generate_dish_image_with_gemini("Masala Dosa"))
    assert result["success"] is True
    assert result["image_url"]
    assert gemini.models_tried == []


def test_no_gemini_key_is_written_in_the_code():
    with open(server.__file__, encoding="utf-8") as source:
        assert "AIza" not in source.read()
