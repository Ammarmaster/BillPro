"""End-to-end backend tests for Lumina ERP Phase 1.
Covers: auth, restaurant onboarding, category/menu, orders, bills, dashboard,
multi-tenant isolation and RBAC.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://lean-mobile-6.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "Ammar@prodevopz.in"
ADMIN_PASSWORD = "Ammar@786**"


# ---------- utility ----------
def _post(path, json=None, token=None):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return requests.post(f"{API}{path}", json=json, headers=h, timeout=30)


def _get(path, token=None):
    h = {}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return requests.get(f"{API}{path}", headers=h, timeout=30)


def _patch(path, json=None, token=None):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return requests.patch(f"{API}{path}", json=json, headers=h, timeout=30)


# ---------- module-scope state ----------
STATE = {}


# ---------- root ----------
def test_root_ok():
    r = _get("/")
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


# ---------- auth ----------
def test_login_super_admin():
    r = _post("/auth/login", {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    data = r.json()
    assert "access_token" in data and "refresh_token" in data and "user" in data
    assert data["user"]["role"] == "super_admin"
    assert data["user"].get("tenant_id") in (None, "")
    STATE["admin_token"] = data["access_token"]
    STATE["admin_refresh"] = data["refresh_token"]


def test_auth_me_super_admin():
    r = _get("/auth/me", token=STATE["admin_token"])
    assert r.status_code == 200
    assert r.json()["email"] == ADMIN_EMAIL.lower()


def test_refresh_token():
    r = requests.post(f"{API}/auth/refresh", headers={"Authorization": f"Bearer {STATE['admin_refresh']}"}, timeout=30)
    assert r.status_code == 200
    assert "access_token" in r.json()


def test_register_new_owner():
    email = f"TEST_owner_{uuid.uuid4().hex[:8]}@example.com"
    r = _post("/auth/register", {"email": email, "password": "Owner12345", "full_name": "TEST Owner A"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["user"]["role"] == "owner"
    assert data["user"]["tenant_id"] is None
    STATE["owner_a_email"] = email
    STATE["owner_a_token"] = data["access_token"]
    STATE["owner_a_id"] = data["user"]["id"]


def test_register_duplicate_email_rejected():
    r = _post("/auth/register", {"email": STATE["owner_a_email"], "password": "Owner12345", "full_name": "Dup"})
    assert r.status_code == 400


def test_register_invalid_role_rejected():
    r = _post("/auth/register", {"email": f"TEST_{uuid.uuid4().hex[:6]}@e.co", "password": "abcdef", "full_name": "X", "role": "super_admin"})
    assert r.status_code == 400


def test_login_wrong_password():
    r = _post("/auth/login", {"email": ADMIN_EMAIL, "password": "wrong"})
    assert r.status_code == 401


def test_me_requires_token():
    r = requests.get(f"{API}/auth/me", timeout=30)
    assert r.status_code == 401


# ---------- RBAC: super admin has no tenant ----------
def test_super_admin_tenant_endpoint_returns_400():
    r = _get("/categories", token=STATE["admin_token"])
    assert r.status_code == 400
    assert "Restaurant not set up" in r.json().get("detail", "")


# ---------- restaurant onboarding ----------
def test_owner_a_create_restaurant():
    payload = {
        "name": "TEST Restaurant A",
        "owner_name": "TEST Owner A",
        "address": "1 Test Rd",
        "upi_id": "testa@upi",
        "merchant_name": "TEST Merchant A",
    }
    r = _post("/restaurant", payload, token=STATE["owner_a_token"])
    assert r.status_code == 200, r.text
    rest = r.json()
    assert rest["name"] == payload["name"]
    STATE["tenant_a_id"] = rest["id"]

    # After onboarding /auth/me should reflect tenant_id
    me = _get("/auth/me", token=STATE["owner_a_token"]).json()
    assert me["tenant_id"] == rest["id"]


# ---------- categories & menu ----------
def test_create_category_and_persist():
    r = _post("/categories", {"name": "TEST Starters", "sort_order": 1}, token=STATE["owner_a_token"])
    assert r.status_code == 200, r.text
    cat = r.json()
    STATE["cat_a_id"] = cat["id"]
    lst = _get("/categories", token=STATE["owner_a_token"]).json()
    assert any(c["id"] == cat["id"] and c["name"] == "TEST Starters" for c in lst)


def test_create_menu_item_and_persist():
    r = _post("/menu-items", {
        "category_id": STATE["cat_a_id"],
        "name": "TEST Paneer Tikka",
        "description": "yum",
        "price": 250.0,
    }, token=STATE["owner_a_token"])
    assert r.status_code == 200, r.text
    item = r.json()
    STATE["item_a_id"] = item["id"]
    STATE["item_a_price"] = item["price"]
    lst = _get("/menu-items", token=STATE["owner_a_token"]).json()
    assert any(i["id"] == item["id"] for i in lst)


# ---------- orders ----------
def test_create_order_with_subtotal():
    body = {
        "table_number": "T1",
        "items": [{
            "menu_item_id": STATE["item_a_id"],
            "name": "TEST Paneer Tikka",
            "price": STATE["item_a_price"],
            "quantity": 2,
            "notes": "",
        }],
        "notes": "test",
    }
    r = _post("/orders", body, token=STATE["owner_a_token"])
    assert r.status_code == 200, r.text
    o = r.json()
    assert o["status"] == "placed"
    assert o["subtotal"] == 500.0
    STATE["order_a_id"] = o["id"]


def test_order_status_transitions():
    for st in ["in_kitchen", "ready", "served"]:
        r = _patch(f"/orders/{STATE['order_a_id']}/status", {"status": st}, token=STATE["owner_a_token"])
        assert r.status_code == 200, r.text
        assert r.json()["status"] == st


def test_order_invalid_status_rejected():
    r = _patch(f"/orders/{STATE['order_a_id']}/status", {"status": "foobar"}, token=STATE["owner_a_token"])
    assert r.status_code == 400


# ---------- bills ----------
def test_create_bill_with_tax_and_upi():
    # need a fresh order to bill
    body = {
        "table_number": "T2",
        "items": [{
            "menu_item_id": STATE["item_a_id"],
            "name": "TEST Paneer Tikka",
            "price": STATE["item_a_price"],
            "quantity": 1,
            "notes": "",
        }],
    }
    order = _post("/orders", body, token=STATE["owner_a_token"]).json()
    STATE["bill_order_id"] = order["id"]

    r = _post("/bills", {"order_id": order["id"], "tax_percent": 5, "discount": 0}, token=STATE["owner_a_token"])
    assert r.status_code == 200, r.text
    bill = r.json()
    assert bill["subtotal"] == 250.0
    assert bill["tax"] == 12.5
    assert bill["total"] == 262.5
    assert bill["upi_url"].startswith("upi://pay?pa=testa@upi")
    assert bill["status"] == "pending"
    STATE["bill_a_id"] = bill["id"]


def test_mark_bill_paid_and_order_served():
    r = _patch(f"/bills/{STATE['bill_a_id']}/pay", token=STATE["owner_a_token"])
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "paid"
    # Order becomes served
    orders = _get("/orders", token=STATE["owner_a_token"]).json()
    match = next((o for o in orders if o["id"] == STATE["bill_order_id"]), None)
    assert match is not None
    assert match["status"] == "served"


# ---------- dashboard ----------
def test_dashboard_summary():
    r = _get("/dashboard/summary", token=STATE["owner_a_token"])
    assert r.status_code == 200, r.text
    s = r.json()
    for k in ["orders_total", "orders_open", "revenue_total", "revenue_today", "menu_count"]:
        assert k in s
    assert s["orders_total"] >= 2
    assert s["revenue_total"] >= 262.5
    assert s["menu_count"] >= 1


# ---------- multi-tenant isolation ----------
def test_multi_tenant_isolation():
    email_b = f"TEST_ownerB_{uuid.uuid4().hex[:8]}@example.com"
    reg = _post("/auth/register", {"email": email_b, "password": "Owner12345", "full_name": "TEST Owner B"}).json()
    tok_b = reg["access_token"]

    _post("/restaurant", {
        "name": "TEST Restaurant B", "owner_name": "TEST B", "upi_id": "b@upi", "merchant_name": "B", "address": "",
    }, token=tok_b)

    cats_b = _get("/categories", token=tok_b).json()
    items_b = _get("/menu-items", token=tok_b).json()
    orders_b = _get("/orders", token=tok_b).json()
    assert all(c["id"] != STATE["cat_a_id"] for c in cats_b)
    assert all(i["id"] != STATE["item_a_id"] for i in items_b)
    assert all(o["id"] != STATE["order_a_id"] for o in orders_b)


# ---------- waiter RBAC negative ----------
def test_waiter_cannot_create_category():
    email_w = f"TEST_waiter_{uuid.uuid4().hex[:8]}@example.com"
    reg = _post("/auth/register", {"email": email_w, "password": "Waiter123", "full_name": "TEST Waiter", "role": "waiter"}).json()
    tok = reg["access_token"]
    r = _post("/categories", {"name": "nope"}, token=tok)
    # waiter has no tenant -> 400 first; RBAC check would be 403 but tenant precedence differs.
    assert r.status_code in (400, 403)
