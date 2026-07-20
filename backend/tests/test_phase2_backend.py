"""Phase 2 backend tests: tables, waiters, staff-login, GST bills, menu PATCH,
super_admin endpoints (summary, restaurants, users, plans, subscriptions), RBAC.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://lean-mobile-6.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "Ammar@prodevopz.in"
ADMIN_PASSWORD = "Ammar@786**"


def _hdr(token=None, ct=True):
    h = {}
    if ct:
        h["Content-Type"] = "application/json"
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def _post(path, json=None, token=None):
    return requests.post(f"{API}{path}", json=json, headers=_hdr(token), timeout=30)


def _get(path, token=None):
    return requests.get(f"{API}{path}", headers=_hdr(token, ct=False), timeout=30)


def _patch(path, json=None, token=None):
    return requests.patch(f"{API}{path}", json=json, headers=_hdr(token), timeout=30)


def _delete(path, token=None):
    return requests.delete(f"{API}{path}", headers=_hdr(token, ct=False), timeout=30)


S = {}


# ---------------- setup: admin + fresh owner+restaurant ----------------
def test_setup_admin_login():
    r = _post("/auth/login", {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    S["admin"] = r.json()["access_token"]
    S["admin_id"] = r.json()["user"]["id"]


def test_setup_owner_with_phone_and_gst():
    email = f"TEST_p2owner_{uuid.uuid4().hex[:8]}@example.com"
    reg = _post("/auth/register", {"email": email, "password": "Owner12345", "full_name": "P2 Owner"}).json()
    S["owner"] = reg["access_token"]
    S["owner_id"] = reg["user"]["id"]
    S["owner_email"] = email
    phone = f"9{uuid.uuid4().int % 10**9:09d}"
    S["phone"] = phone
    r = _post("/restaurant", {
        "name": "TEST P2 Diner", "owner_name": "P2 Owner",
        "address": "Addr", "phone": phone,
        "gst": "27ABCDE1234F1Z5", "gst_enabled": True, "fssai": "F123",
        "upi_id": "p2@upi", "merchant_name": "P2",
    }, token=S["owner"])
    assert r.status_code == 200, r.text
    rest = r.json()
    assert rest["phone"] == phone
    assert rest["gst_enabled"] is True
    S["tenant"] = rest["id"]


# ---------------- tables CRUD ----------------
def test_tables_crud_owner():
    # create
    r = _post("/tables", {"label": "5", "seats": 4}, token=S["owner"])
    assert r.status_code == 200, r.text
    t = r.json()
    assert t["label"] == "5" and t["seats"] == 4
    S["table_id"] = t["id"]
    # list
    lst = _get("/tables", token=S["owner"]).json()
    assert any(x["id"] == t["id"] for x in lst)
    # another one for waiter chip tests
    t2 = _post("/tables", {"label": "6", "seats": 2}, token=S["owner"]).json()
    S["table2_id"] = t2["id"]
    # delete
    d = _delete(f"/tables/{t2['id']}", token=S["owner"])
    assert d.status_code == 200
    lst2 = _get("/tables", token=S["owner"]).json()
    assert not any(x["id"] == t2["id"] for x in lst2)


# ---------------- waiters CRUD + staff login ----------------
def test_create_waiter_and_staff_login_flow():
    r = _post("/staff/waiters", {"name": "Ravi", "pin": "4321"}, token=S["owner"])
    assert r.status_code == 200, r.text
    w = r.json()
    assert w["name"] == "Ravi" and w["pin"] == "4321" and "id" in w
    S["waiter_id"] = w["id"]

    # list
    lst = _get("/staff/waiters", token=S["owner"]).json()
    assert any(x["id"] == w["id"] for x in lst)
    assert all("password" not in x and "email" not in x for x in lst)

    # duplicate PIN rejected
    dup = _post("/staff/waiters", {"name": "Other", "pin": "4321"}, token=S["owner"])
    assert dup.status_code == 400

    # staff-login success
    ok = _post("/auth/staff-login", {"phone": S["phone"], "pin": "4321"})
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert body["user"]["role"] == "waiter"
    assert body["user"]["tenant_id"] == S["tenant"]
    S["waiter_token"] = body["access_token"]

    # wrong phone
    bad_phone = _post("/auth/staff-login", {"phone": "0000000000", "pin": "4321"})
    assert bad_phone.status_code == 401
    assert "Restaurant phone not found" in bad_phone.json().get("detail", "")

    # wrong pin
    bad_pin = _post("/auth/staff-login", {"phone": S["phone"], "pin": "9999"})
    assert bad_pin.status_code == 401
    assert "Invalid PIN" in bad_pin.json().get("detail", "")


def test_waiter_pin_length_validation():
    r = _post("/staff/waiters", {"name": "Bad", "pin": "12"}, token=S["owner"])
    assert r.status_code in (400, 422)
    r2 = _post("/staff/waiters", {"name": "Bad", "pin": "1234567"}, token=S["owner"])
    assert r2.status_code in (400, 422)


def test_delete_waiter():
    tmp = _post("/staff/waiters", {"name": "TmpW", "pin": "5555"}, token=S["owner"]).json()
    r = _delete(f"/staff/waiters/{tmp['id']}", token=S["owner"])
    assert r.status_code == 200
    lst = _get("/staff/waiters", token=S["owner"]).json()
    assert not any(x["id"] == tmp["id"] for x in lst)


# ---------------- menu item PATCH ----------------
def test_menu_item_patch_partial_update():
    cat = _post("/categories", {"name": "TEST P2 Cat", "sort_order": 0}, token=S["owner"]).json()
    item = _post("/menu-items", {
        "category_id": cat["id"], "name": "TEST Dosa", "price": 100.0,
    }, token=S["owner"]).json()
    S["item_id"] = item["id"]
    r = _patch(f"/menu-items/{item['id']}", {
        "price": 120.0,
        "image_url": "https://loremflickr.com/300/200/dosa",
        "image_base64": "",
    }, token=S["owner"])
    assert r.status_code == 200, r.text
    upd = r.json()
    assert upd["price"] == 120.0
    assert upd["image_url"].startswith("https://loremflickr.com")
    # name preserved
    assert upd["name"] == "TEST Dosa"

    # 404 for unknown
    nf = _patch(f"/menu-items/{uuid.uuid4()}", {"price": 1}, token=S["owner"])
    assert nf.status_code == 404


# ---------------- bills with GST split ----------------
def test_bill_gst_split_when_enabled():
    # need an order
    order = _post("/orders", {
        "table_number": "5",
        "items": [{"menu_item_id": S["item_id"], "name": "TEST Dosa", "price": 120.0, "quantity": 2, "notes": ""}],
    }, token=S["owner"]).json()
    r = _post("/bills", {"order_id": order["id"], "tax_percent": 5, "discount": 0}, token=S["owner"])
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["subtotal"] == 240.0
    assert b["gst_enabled"] is True
    assert b["tax"] == 12.0
    assert b["cgst"] == 6.0
    assert b["sgst"] == 6.0
    assert b["total"] == 252.0
    # snapshot & items & table_number
    snap = b.get("restaurant_snapshot", {})
    assert snap.get("name") == "TEST P2 Diner"
    assert snap.get("phone") == S["phone"]
    assert snap.get("gst") == "27ABCDE1234F1Z5"
    assert "fssai" in snap and "logo_base64" in snap
    assert b["table_number"] == "5"
    assert len(b["items"]) == 1 and b["items"][0]["quantity"] == 2


def test_bill_gst_disabled_override():
    order = _post("/orders", {
        "table_number": "5",
        "items": [{"menu_item_id": S["item_id"], "name": "TEST Dosa", "price": 120.0, "quantity": 1, "notes": ""}],
    }, token=S["owner"]).json()
    r = _post("/bills", {
        "order_id": order["id"], "tax_percent": 5, "discount": 0, "gst_enabled": False,
    }, token=S["owner"])
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["gst_enabled"] is False
    assert b["tax"] == 0.0 and b["cgst"] == 0.0 and b["sgst"] == 0.0
    assert b["total"] == 120.0


# ---------------- Super Admin endpoints ----------------
def test_admin_summary():
    r = _get("/admin/summary", token=S["admin"])
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ("total_restaurants", "total_users", "total_owners", "total_waiters",
              "active_subscriptions", "mrr", "arr"):
        assert k in d
    assert d["total_restaurants"] >= 1
    assert d["total_waiters"] >= 1


def test_admin_restaurants_list_and_detail():
    lst = _get("/admin/restaurants", token=S["admin"]).json()
    match = next((r for r in lst if r["id"] == S["tenant"]), None)
    assert match is not None
    assert match["owner_email"] == S["owner_email"].lower()
    assert match["phone"] == S["phone"]
    assert "subscription" in match

    detail = _get(f"/admin/restaurants/{S['tenant']}", token=S["admin"]).json()
    assert detail["id"] == S["tenant"]
    assert "orders_total" in detail and "revenue_total" in detail
    assert detail["orders_total"] >= 1


def test_admin_users_list_no_password():
    users = _get("/admin/users", token=S["admin"]).json()
    assert isinstance(users, list) and len(users) > 0
    assert all("password" not in u for u in users)


def test_admin_reset_password_waiter_requires_pin_format():
    # invalid: non-digit
    bad = _post(f"/admin/users/{S['waiter_id']}/reset-password",
                {"new_password": "abcdef"}, token=S["admin"])
    assert bad.status_code == 400

    # valid 4-digit PIN
    ok = _post(f"/admin/users/{S['waiter_id']}/reset-password",
               {"new_password": "8888"}, token=S["admin"])
    assert ok.status_code == 200

    # waiter can login with new PIN
    login = _post("/auth/staff-login", {"phone": S["phone"], "pin": "8888"})
    assert login.status_code == 200


def test_admin_reset_password_owner_ok():
    r = _post(f"/admin/users/{S['owner_id']}/reset-password",
              {"new_password": "NewOwner123"}, token=S["admin"])
    assert r.status_code == 200
    # login owner with new password
    lg = _post("/auth/login", {"email": S["owner_email"], "password": "NewOwner123"})
    assert lg.status_code == 200
    S["owner"] = lg.json()["access_token"]


def test_admin_cannot_self_delete():
    r = _delete(f"/admin/users/{S['admin_id']}", token=S["admin"])
    assert r.status_code == 400


# ---------------- plans + subscriptions ----------------
def test_seeded_plans_exist_public_and_admin():
    pub = _get("/plans").json()
    names = {(p["name"], p["interval"]) for p in pub}
    assert ("Monthly", "month") in names
    assert ("Yearly", "year") in names
    monthly = next(p for p in pub if p["name"] == "Monthly")
    assert monthly["price"] == 499.0
    yearly = next(p for p in pub if p["name"] == "Yearly")
    assert yearly["price"] == 4999.0
    S["monthly_plan_id"] = monthly["id"]

    adm = _get("/admin/plans", token=S["admin"]).json()
    assert any(p["name"] == "Monthly" for p in adm)


def test_admin_create_and_delete_plan():
    p = _post("/admin/plans", {"name": f"TEST_Plan_{uuid.uuid4().hex[:6]}", "price": 999.0,
                               "interval": "month", "features": ["f"]}, token=S["admin"])
    assert p.status_code == 200
    pid = p.json()["id"]
    d = _delete(f"/admin/plans/{pid}", token=S["admin"])
    assert d.status_code == 200


def test_admin_assign_and_cancel_subscription_and_mrr():
    # baseline mrr
    base = _get("/admin/summary", token=S["admin"]).json()
    r = _post(f"/admin/restaurants/{S['tenant']}/subscription",
              {"plan_id": S["monthly_plan_id"], "status": "active"}, token=S["admin"])
    assert r.status_code == 200, r.text
    sub = r.json()
    assert sub["plan_name"] == "Monthly" and sub["price"] == 499.0
    after = _get("/admin/summary", token=S["admin"]).json()
    assert after["active_subscriptions"] >= base["active_subscriptions"] + 1
    assert after["mrr"] >= base["mrr"] + 499.0 - 0.01

    # cancel
    c = _delete(f"/admin/restaurants/{S['tenant']}/subscription", token=S["admin"])
    assert c.status_code == 200


# ---------------- RBAC negatives ----------------
def test_non_admin_cannot_hit_admin_endpoints():
    endpoints = [
        ("GET", "/admin/summary"),
        ("GET", "/admin/restaurants"),
        ("GET", "/admin/users"),
        ("GET", "/admin/plans"),
    ]
    for method, path in endpoints:
        if method == "GET":
            r = _get(path, token=S["owner"])
        assert r.status_code == 403, f"{path} expected 403 got {r.status_code}"


def test_waiter_cannot_hit_admin_endpoints():
    r = _get("/admin/summary", token=S["waiter_token"])
    # waiter's pin was reset; use owner-created waiter session (still valid JWT until expiry)
    assert r.status_code in (401, 403)


# ---------------- admin restaurant cascade delete ----------------
def test_admin_delete_restaurant_cascades():
    # create a throwaway owner+tenant
    email = f"TEST_del_{uuid.uuid4().hex[:8]}@example.com"
    reg = _post("/auth/register", {"email": email, "password": "Owner12345", "full_name": "Del"}).json()
    tok = reg["access_token"]
    phone = f"8{uuid.uuid4().int % 10**9:09d}"
    rest = _post("/restaurant", {"name": "TEST Del", "owner_name": "Del", "upi_id": "d@upi",
                                 "merchant_name": "D", "phone": phone}, token=tok).json()
    tid = rest["id"]
    _post("/tables", {"label": "1", "seats": 2}, token=tok)
    _post("/staff/waiters", {"name": "W", "pin": "1111"}, token=tok)

    d = _delete(f"/admin/restaurants/{tid}", token=S["admin"])
    assert d.status_code == 200

    # verify cascade: restaurant detail 404
    nf = _get(f"/admin/restaurants/{tid}", token=S["admin"])
    assert nf.status_code == 404

    # owner user still exists but tenant_id cleared
    users = _get("/admin/users", token=S["admin"]).json()
    owner_u = next((u for u in users if u["id"] == reg["user"]["id"]), None)
    assert owner_u is not None
    assert owner_u.get("tenant_id") in (None, "")
