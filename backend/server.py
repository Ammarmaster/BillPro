from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import bcrypt
import jwt as pyjwt
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGO = os.environ.get("JWT_ALGO", "HS256")
ADMIN_EMAIL = os.environ["ADMIN_EMAIL"]
ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]
ACCESS_TTL_MIN = int(os.environ.get("ACCESS_TTL_MIN", "60"))
REFRESH_TTL_DAYS = int(os.environ.get("REFRESH_TTL_DAYS", "14"))
RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "")
RAZORPAY_WEBHOOK_SECRET = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# Razorpay client (lazy)
import razorpay
razorpay_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET)) if RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET else None

app = FastAPI(title="Lumina ERP API")
api = APIRouter(prefix="/api")


# ---------- helpers ----------
def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_pw(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def make_token(sub: str, role: str, tenant_id: Optional[str], refresh: bool = False) -> str:
    now = datetime.now(timezone.utc)
    exp = now + (timedelta(days=REFRESH_TTL_DAYS) if refresh else timedelta(minutes=ACCESS_TTL_MIN))
    payload = {
        "sub": sub, "role": role, "tenant_id": tenant_id,
        "iat": int(now.timestamp()), "exp": int(exp.timestamp()), "refresh": refresh,
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def decode_token(token: str) -> dict:
    try:
        return pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")


async def get_current_user(authorization: Optional[str] = Header(default=None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    payload = decode_token(authorization.split(" ", 1)[1])
    if payload.get("refresh"):
        raise HTTPException(status_code=401, detail="Refresh token not allowed here")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def require_roles(*roles: str):
    async def dep(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return dep


# ---------- models ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    full_name: str
    role: str = "owner"  # owner registers themselves; super_admin creates staff


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: dict


class RestaurantIn(BaseModel):
    name: str
    owner_name: str
    bio: Optional[str] = ""
    logo_base64: Optional[str] = ""
    address: str = ""
    phone: str = ""
    gst: Optional[str] = ""
    gst_enabled: bool = False
    fssai: Optional[str] = ""
    upi_id: str
    merchant_name: str


class CategoryIn(BaseModel):
    name: str
    sort_order: int = 0


class MenuItemIn(BaseModel):
    category_id: str
    name: str
    description: str = ""
    price: float
    image_base64: Optional[str] = ""
    image_url: Optional[str] = ""
    is_active: bool = True


class MenuItemUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    image_base64: Optional[str] = None
    image_url: Optional[str] = None
    is_active: Optional[bool] = None
    category_id: Optional[str] = None


class TableIn(BaseModel):
    label: str
    seats: int = 4


class WaiterIn(BaseModel):
    name: str
    pin: str = Field(min_length=4, max_length=6)


class StaffLoginIn(BaseModel):
    phone: str
    pin: str


class OrderItemIn(BaseModel):
    menu_item_id: str
    name: str
    price: float
    quantity: int
    notes: str = ""


class OrderIn(BaseModel):
    table_number: str
    items: List[OrderItemIn]
    notes: str = ""


class OrderStatusIn(BaseModel):
    status: str  # placed, in_kitchen, ready, served, cancelled


class BillIn(BaseModel):
    order_id: str
    tax_percent: float = 5.0
    discount: float = 0.0
    gst_enabled: Optional[bool] = None  # override restaurant default


# ---------- auth routes ----------
@api.get("/")
async def root():
    return {"app": "Lumina ERP", "status": "ok"}


@api.post("/auth/register", response_model=TokenOut)
async def register(payload: RegisterIn):
    existing = await db.users.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    if payload.role not in ("owner", "manager", "waiter", "kitchen"):
        raise HTTPException(status_code=400, detail="Invalid role for self-registration")
    uid = str(uuid.uuid4())
    doc = {
        "id": uid,
        "email": payload.email.lower(),
        "password": hash_pw(payload.password),
        "full_name": payload.full_name,
        "role": payload.role,
        "tenant_id": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    user_out = {k: v for k, v in doc.items() if k not in ("password", "_id")}
    return TokenOut(
        access_token=make_token(uid, payload.role, None),
        refresh_token=make_token(uid, payload.role, None, refresh=True),
        user=user_out,
    )


@api.post("/auth/login", response_model=TokenOut)
async def login(payload: LoginIn):
    user = await db.users.find_one({"email": payload.email.lower()})
    if not user or not verify_pw(payload.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    user_out = {k: v for k, v in user.items() if k not in ("password", "_id")}
    return TokenOut(
        access_token=make_token(user["id"], user["role"], user.get("tenant_id")),
        refresh_token=make_token(user["id"], user["role"], user.get("tenant_id"), refresh=True),
        user=user_out,
    )


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@api.post("/auth/refresh", response_model=TokenOut)
async def refresh(authorization: Optional[str] = Header(default=None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing refresh token")
    payload = decode_token(authorization.split(" ", 1)[1])
    if not payload.get("refresh"):
        raise HTTPException(status_code=400, detail="Not a refresh token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return TokenOut(
        access_token=make_token(user["id"], user["role"], user.get("tenant_id")),
        refresh_token=make_token(user["id"], user["role"], user.get("tenant_id"), refresh=True),
        user=user,
    )


# ---------- restaurant / tenant ----------
@api.post("/restaurant")
async def create_or_update_restaurant(payload: RestaurantIn, user: dict = Depends(require_roles("owner", "super_admin"))):
    tenant_id = user.get("tenant_id")
    now = datetime.now(timezone.utc).isoformat()
    if tenant_id:
        await db.restaurants.update_one({"id": tenant_id}, {"$set": {**payload.dict(), "updated_at": now}})
        rest = await db.restaurants.find_one({"id": tenant_id}, {"_id": 0})
        return rest
    tenant_id = str(uuid.uuid4())
    doc = {"id": tenant_id, **payload.dict(), "owner_user_id": user["id"], "created_at": now, "updated_at": now}
    await db.restaurants.insert_one(doc)
    await db.users.update_one({"id": user["id"]}, {"$set": {"tenant_id": tenant_id}})
    doc.pop("_id", None)
    return doc


@api.get("/restaurant")
async def get_my_restaurant(user: dict = Depends(get_current_user)):
    if not user.get("tenant_id"):
        return None
    return await db.restaurants.find_one({"id": user["tenant_id"]}, {"_id": 0})


# ---------- categories ----------
async def _ensure_tenant(user: dict) -> str:
    if not user.get("tenant_id"):
        raise HTTPException(status_code=400, detail="Restaurant not set up. Complete onboarding first.")
    return user["tenant_id"]


@api.post("/categories")
async def create_category(payload: CategoryIn, user: dict = Depends(require_roles("owner", "manager"))):
    tid = await _ensure_tenant(user)
    doc = {"id": str(uuid.uuid4()), "tenant_id": tid, **payload.dict(), "created_at": datetime.now(timezone.utc).isoformat()}
    await db.categories.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/categories")
async def list_categories(user: dict = Depends(get_current_user)):
    tid = await _ensure_tenant(user)
    cats = await db.categories.find({"tenant_id": tid}, {"_id": 0}).sort("sort_order", 1).to_list(500)
    return cats


@api.delete("/categories/{cid}")
async def delete_category(cid: str, user: dict = Depends(require_roles("owner", "manager"))):
    tid = await _ensure_tenant(user)
    await db.categories.delete_one({"id": cid, "tenant_id": tid})
    await db.menu_items.delete_many({"category_id": cid, "tenant_id": tid})
    return {"ok": True}


# ---------- menu items ----------
@api.post("/menu-items")
async def create_menu_item(payload: MenuItemIn, user: dict = Depends(require_roles("owner", "manager"))):
    tid = await _ensure_tenant(user)
    doc = {"id": str(uuid.uuid4()), "tenant_id": tid, **payload.dict(), "created_at": datetime.now(timezone.utc).isoformat()}
    await db.menu_items.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/menu-items")
async def list_menu_items(user: dict = Depends(get_current_user)):
    tid = await _ensure_tenant(user)
    items = await db.menu_items.find({"tenant_id": tid}, {"_id": 0}).to_list(2000)
    return items


@api.delete("/menu-items/{iid}")
async def delete_menu_item(iid: str, user: dict = Depends(require_roles("owner", "manager"))):
    tid = await _ensure_tenant(user)
    await db.menu_items.delete_one({"id": iid, "tenant_id": tid})
    return {"ok": True}


@api.patch("/menu-items/{iid}")
async def update_menu_item(iid: str, payload: MenuItemUpdate, user: dict = Depends(require_roles("owner", "manager"))):
    tid = await _ensure_tenant(user)
    upd = {k: v for k, v in payload.dict().items() if v is not None}
    if not upd:
        raise HTTPException(status_code=400, detail="No fields to update")
    res = await db.menu_items.update_one({"id": iid, "tenant_id": tid}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Menu item not found")
    return await db.menu_items.find_one({"id": iid}, {"_id": 0})


# ---------- tables ----------
@api.post("/tables")
async def create_table(payload: TableIn, user: dict = Depends(require_roles("owner", "manager"))):
    tid = await _ensure_tenant(user)
    doc = {"id": str(uuid.uuid4()), "tenant_id": tid, **payload.dict(),
           "created_at": datetime.now(timezone.utc).isoformat()}
    await db.tables.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/tables")
async def list_tables(user: dict = Depends(get_current_user)):
    tid = await _ensure_tenant(user)
    tables = await db.tables.find({"tenant_id": tid}, {"_id": 0}).sort("label", 1).to_list(500)
    return tables


@api.delete("/tables/{tbl_id}")
async def delete_table(tbl_id: str, user: dict = Depends(require_roles("owner", "manager"))):
    tid = await _ensure_tenant(user)
    await db.tables.delete_one({"id": tbl_id, "tenant_id": tid})
    return {"ok": True}


# ---------- waiters (staff) ----------
@api.post("/staff/waiters")
async def create_waiter(payload: WaiterIn, user: dict = Depends(require_roles("owner", "manager"))):
    tid = await _ensure_tenant(user)
    if not payload.pin.isdigit():
        raise HTTPException(status_code=400, detail="PIN must be digits")
    # Ensure PIN unique within tenant
    existing = await db.users.find_one({"tenant_id": tid, "role": "waiter", "pin": payload.pin})
    if existing:
        raise HTTPException(status_code=400, detail="PIN already in use for another waiter")
    wid = str(uuid.uuid4())
    synthetic_email = f"waiter+{wid[:8]}@{tid[:8]}.lumina.local"
    doc = {
        "id": wid,
        "email": synthetic_email,
        "password": hash_pw(payload.pin),  # for possible future email/pin login
        "full_name": payload.name,
        "role": "waiter",
        "tenant_id": tid,
        "pin": payload.pin,  # plaintext for owner+PIN lookup (tenant-scoped)
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    return {"id": wid, "name": payload.name, "pin": payload.pin, "role": "waiter"}


@api.get("/staff/waiters")
async def list_waiters(user: dict = Depends(require_roles("owner", "manager"))):
    tid = await _ensure_tenant(user)
    waiters = await db.users.find(
        {"tenant_id": tid, "role": "waiter"},
        {"_id": 0, "password": 0, "email": 0},
    ).to_list(500)
    return waiters


@api.delete("/staff/waiters/{wid}")
async def delete_waiter(wid: str, user: dict = Depends(require_roles("owner", "manager"))):
    tid = await _ensure_tenant(user)
    await db.users.delete_one({"id": wid, "tenant_id": tid, "role": "waiter"})
    return {"ok": True}


@api.post("/auth/staff-login", response_model=TokenOut)
async def staff_login(payload: StaffLoginIn):
    # find restaurant by phone
    restaurant = await db.restaurants.find_one({"phone": payload.phone}, {"_id": 0})
    if not restaurant:
        raise HTTPException(status_code=401, detail="Restaurant phone not found")
    tid = restaurant["id"]
    waiter = await db.users.find_one(
        {"tenant_id": tid, "role": "waiter", "pin": payload.pin},
        {"_id": 0, "password": 0},
    )
    if not waiter:
        raise HTTPException(status_code=401, detail="Invalid PIN")
    return TokenOut(
        access_token=make_token(waiter["id"], "waiter", tid),
        refresh_token=make_token(waiter["id"], "waiter", tid, refresh=True),
        user={k: v for k, v in waiter.items() if k != "pin"},
    )


# ---------- orders ----------
@api.post("/orders")
async def create_order(payload: OrderIn, user: dict = Depends(require_roles("owner", "manager", "waiter"))):
    tid = await _ensure_tenant(user)
    subtotal = sum(i.price * i.quantity for i in payload.items)
    doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tid,
        "table_number": payload.table_number,
        "items": [i.dict() for i in payload.items],
        "notes": payload.notes,
        "subtotal": subtotal,
        "status": "placed",
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.orders.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/orders")
async def list_orders(status_filter: Optional[str] = None, user: dict = Depends(get_current_user)):
    tid = await _ensure_tenant(user)
    q = {"tenant_id": tid}
    if status_filter:
        q["status"] = status_filter
    orders = await db.orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return orders


@api.patch("/orders/{oid}/status")
async def update_order_status(oid: str, payload: OrderStatusIn, user: dict = Depends(get_current_user)):
    tid = await _ensure_tenant(user)
    valid = {"placed", "in_kitchen", "ready", "served", "cancelled"}
    if payload.status not in valid:
        raise HTTPException(status_code=400, detail="Invalid status")
    res = await db.orders.update_one({"id": oid, "tenant_id": tid}, {"$set": {"status": payload.status}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")
    return await db.orders.find_one({"id": oid}, {"_id": 0})


# ---------- bills ----------
@api.post("/bills")
async def create_bill(payload: BillIn, user: dict = Depends(require_roles("owner", "manager", "waiter"))):
    tid = await _ensure_tenant(user)
    order = await db.orders.find_one({"id": payload.order_id, "tenant_id": tid}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    restaurant = await db.restaurants.find_one({"id": tid}, {"_id": 0}) or {}
    subtotal = float(order.get("subtotal", 0))
    gst_enabled = payload.gst_enabled if payload.gst_enabled is not None else bool(restaurant.get("gst_enabled"))
    tax = round(subtotal * (payload.tax_percent / 100), 2) if gst_enabled else 0.0
    cgst = round(tax / 2, 2) if gst_enabled else 0.0
    sgst = round(tax - cgst, 2) if gst_enabled else 0.0
    total = round(subtotal + tax - payload.discount, 2)
    upi_id = restaurant.get("upi_id", "")
    merchant = restaurant.get("merchant_name", restaurant.get("name", "Merchant"))
    upi_url = f"upi://pay?pa={upi_id}&pn={merchant.replace(' ', '%20')}&am={total}&cu=INR&tn=Order-{order['id'][:8]}"
    bill = {
        "id": str(uuid.uuid4()),
        "tenant_id": tid,
        "order_id": order["id"],
        "table_number": order.get("table_number", ""),
        "items": order.get("items", []),
        "subtotal": subtotal,
        "tax_percent": payload.tax_percent if gst_enabled else 0.0,
        "tax": tax,
        "cgst": cgst,
        "sgst": sgst,
        "gst_enabled": gst_enabled,
        "discount": payload.discount,
        "total": total,
        "upi_url": upi_url,
        "status": "pending",
        "restaurant_snapshot": {
            "name": restaurant.get("name", ""),
            "address": restaurant.get("address", ""),
            "phone": restaurant.get("phone", ""),
            "gst": restaurant.get("gst", ""),
            "fssai": restaurant.get("fssai", ""),
            "logo_base64": restaurant.get("logo_base64", ""),
        },
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.bills.insert_one(bill)
    bill.pop("_id", None)
    return bill


@api.patch("/bills/{bid}/pay")
async def mark_bill_paid(bid: str, user: dict = Depends(require_roles("owner", "manager", "waiter"))):
    tid = await _ensure_tenant(user)
    res = await db.bills.update_one({"id": bid, "tenant_id": tid}, {"$set": {"status": "paid", "paid_at": datetime.now(timezone.utc).isoformat()}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Bill not found")
    bill = await db.bills.find_one({"id": bid}, {"_id": 0})
    await db.orders.update_one({"id": bill["order_id"], "tenant_id": tid}, {"$set": {"status": "served"}})
    return bill


@api.get("/bills")
async def list_bills(user: dict = Depends(get_current_user)):
    tid = await _ensure_tenant(user)
    bills = await db.bills.find({"tenant_id": tid}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return bills


# ---------- dashboard ----------
@api.get("/dashboard/summary")
async def dashboard_summary(user: dict = Depends(get_current_user)):
    tid = await _ensure_tenant(user)
    today = datetime.now(timezone.utc).date().isoformat()
    orders = await db.orders.count_documents({"tenant_id": tid})
    open_orders = await db.orders.count_documents({"tenant_id": tid, "status": {"$in": ["placed", "in_kitchen", "ready"]}})
    paid_bills = await db.bills.find({"tenant_id": tid, "status": "paid"}, {"_id": 0}).to_list(2000)
    revenue_total = round(sum(b.get("total", 0) for b in paid_bills), 2)
    revenue_today = round(sum(b.get("total", 0) for b in paid_bills if b.get("paid_at", "").startswith(today)), 2)
    menu_count = await db.menu_items.count_documents({"tenant_id": tid})
    return {
        "orders_total": orders,
        "orders_open": open_orders,
        "revenue_total": revenue_total,
        "revenue_today": revenue_today,
        "menu_count": menu_count,
    }


# ---------- SUPER ADMIN ----------
class PlanIn(BaseModel):
    name: str
    price: float
    interval: str = "month"  # "month" or "year"
    features: List[str] = []
    is_active: bool = True


class SubscribeIn(BaseModel):
    plan_id: str
    status: str = "active"  # active / cancelled


class ResetPasswordIn(BaseModel):
    new_password: str = Field(min_length=4)


@api.get("/admin/summary")
async def admin_summary(user: dict = Depends(require_roles("super_admin"))):
    total_restaurants = await db.restaurants.count_documents({})
    total_users = await db.users.count_documents({})
    total_owners = await db.users.count_documents({"role": "owner"})
    total_waiters = await db.users.count_documents({"role": "waiter"})
    active_subs = await db.subscriptions.find({"status": "active"}, {"_id": 0}).to_list(2000)
    # Compute MRR: monthly plans + yearly plans / 12
    mrr = 0.0
    for s in active_subs:
        mrr += float(s.get("price", 0)) if s.get("interval") == "month" else float(s.get("price", 0)) / 12
    return {
        "total_restaurants": total_restaurants,
        "total_users": total_users,
        "total_owners": total_owners,
        "total_waiters": total_waiters,
        "active_subscriptions": len(active_subs),
        "mrr": round(mrr, 2),
        "arr": round(mrr * 12, 2),
    }


@api.get("/admin/restaurants")
async def admin_list_restaurants(user: dict = Depends(require_roles("super_admin"))):
    rests = await db.restaurants.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    out = []
    for r in rests:
        sub = await db.subscriptions.find_one({"tenant_id": r["id"]}, {"_id": 0}, sort=[("created_at", -1)])
        owner = await db.users.find_one({"id": r.get("owner_user_id"), "role": "owner"}, {"_id": 0, "password": 0})
        out.append({
            "id": r["id"],
            "name": r.get("name", ""),
            "owner_name": r.get("owner_name", ""),
            "owner_email": (owner or {}).get("email"),
            "phone": r.get("phone", ""),
            "address": r.get("address", ""),
            "upi_id": r.get("upi_id", ""),
            "gst": r.get("gst", ""),
            "created_at": r.get("created_at"),
            "subscription": sub,
        })
    return out


@api.get("/admin/restaurants/{tid}")
async def admin_restaurant_detail(tid: str, user: dict = Depends(require_roles("super_admin"))):
    r = await db.restaurants.find_one({"id": tid}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    orders_total = await db.orders.count_documents({"tenant_id": tid})
    paid = await db.bills.find({"tenant_id": tid, "status": "paid"}, {"_id": 0}).to_list(5000)
    revenue = round(sum(b.get("total", 0) for b in paid), 2)
    sub = await db.subscriptions.find_one({"tenant_id": tid}, {"_id": 0}, sort=[("created_at", -1)])
    return {**r, "orders_total": orders_total, "revenue_total": revenue, "subscription": sub}


@api.delete("/admin/restaurants/{tid}")
async def admin_delete_restaurant(tid: str, user: dict = Depends(require_roles("super_admin"))):
    await db.restaurants.delete_one({"id": tid})
    await db.users.update_many({"tenant_id": tid}, {"$set": {"tenant_id": None}})
    await db.categories.delete_many({"tenant_id": tid})
    await db.menu_items.delete_many({"tenant_id": tid})
    await db.tables.delete_many({"tenant_id": tid})
    await db.orders.delete_many({"tenant_id": tid})
    await db.bills.delete_many({"tenant_id": tid})
    await db.subscriptions.delete_many({"tenant_id": tid})
    return {"ok": True}


@api.get("/admin/users")
async def admin_list_users(user: dict = Depends(require_roles("super_admin"))):
    users = await db.users.find({}, {"_id": 0, "password": 0}).sort("created_at", -1).to_list(5000)
    return users


@api.post("/admin/users/{uid}/reset-password")
async def admin_reset_password(uid: str, payload: ResetPasswordIn, user: dict = Depends(require_roles("super_admin"))):
    target = await db.users.find_one({"id": uid})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    upd = {"password": hash_pw(payload.new_password)}
    if target.get("role") == "waiter":
        # Keep PIN in sync (for staff-login flow)
        if not payload.new_password.isdigit() or not (4 <= len(payload.new_password) <= 6):
            raise HTTPException(status_code=400, detail="Waiter password must be a 4-6 digit PIN")
        upd["pin"] = payload.new_password
    else:
        if len(payload.new_password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    await db.users.update_one({"id": uid}, {"$set": upd})
    return {"ok": True}


@api.delete("/admin/users/{uid}")
async def admin_delete_user(uid: str, user: dict = Depends(require_roles("super_admin"))):
    if uid == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    target = await db.users.find_one({"id": uid})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.delete_one({"id": uid})
    return {"ok": True}


# --- plans ---
@api.get("/admin/plans")
async def admin_list_plans(user: dict = Depends(require_roles("super_admin"))):
    return await db.plans.find({}, {"_id": 0}).sort("price", 1).to_list(200)


@api.get("/plans")
async def public_list_plans():
    return await db.plans.find({"is_active": True}, {"_id": 0}).sort("price", 1).to_list(200)


@api.post("/admin/plans")
async def admin_create_plan(payload: PlanIn, user: dict = Depends(require_roles("super_admin"))):
    if payload.interval not in ("month", "year"):
        raise HTTPException(status_code=400, detail="interval must be 'month' or 'year'")
    doc = {"id": str(uuid.uuid4()), **payload.dict(), "created_at": datetime.now(timezone.utc).isoformat()}
    await db.plans.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/admin/plans/{pid}")
async def admin_delete_plan(pid: str, user: dict = Depends(require_roles("super_admin"))):
    await db.plans.delete_one({"id": pid})
    return {"ok": True}


# --- assign subscriptions ---
@api.post("/admin/restaurants/{tid}/subscription")
async def admin_assign_subscription(tid: str, payload: SubscribeIn, user: dict = Depends(require_roles("super_admin"))):
    plan = await db.plans.find_one({"id": payload.plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    if not await db.restaurants.find_one({"id": tid}, {"_id": 0}):
        raise HTTPException(status_code=404, detail="Restaurant not found")
    doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tid,
        "plan_id": plan["id"],
        "plan_name": plan["name"],
        "price": plan["price"],
        "interval": plan["interval"],
        "status": payload.status,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.subscriptions.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/admin/restaurants/{tid}/subscription")
async def admin_cancel_subscription(tid: str, user: dict = Depends(require_roles("super_admin"))):
    latest = await db.subscriptions.find_one({"tenant_id": tid}, {"_id": 0}, sort=[("created_at", -1)])
    if not latest:
        raise HTTPException(status_code=404, detail="No subscription found")
    await db.subscriptions.update_one({"id": latest["id"]}, {"$set": {"status": "cancelled"}})
    return {"ok": True}


# ---------- RAZORPAY CHECKOUT ----------
class CheckoutIn(BaseModel):
    plan_id: str


class VerifyIn(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    plan_id: str


@api.get("/subscriptions/mine")
async def my_subscription(user: dict = Depends(get_current_user)):
    tid = await _ensure_tenant(user)
    sub = await db.subscriptions.find_one({"tenant_id": tid}, {"_id": 0}, sort=[("created_at", -1)])
    return sub


@api.post("/subscriptions/checkout")
async def checkout(payload: CheckoutIn, user: dict = Depends(require_roles("owner", "manager"))):
    if not razorpay_client:
        raise HTTPException(status_code=503, detail="Razorpay not configured")
    tid = await _ensure_tenant(user)
    plan = await db.plans.find_one({"id": payload.plan_id, "is_active": True}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    amount_paise = int(round(float(plan["price"]) * 100))
    receipt = f"tid-{tid[:8]}-{uuid.uuid4().hex[:8]}"[:40]
    try:
        order = razorpay_client.order.create({
            "amount": amount_paise,
            "currency": "INR",
            "receipt": receipt,
            "payment_capture": 1,
            "notes": {"tenant_id": tid, "plan_id": plan["id"], "plan_name": plan["name"]},
        })
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Razorpay error: {e}")
    await db.payment_orders.insert_one({
        "id": str(uuid.uuid4()),
        "razorpay_order_id": order["id"],
        "tenant_id": tid,
        "plan_id": plan["id"],
        "amount": amount_paise,
        "status": "created",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    restaurant = await db.restaurants.find_one({"id": tid}, {"_id": 0}) or {}
    return {
        "key_id": RAZORPAY_KEY_ID,
        "order_id": order["id"],
        "amount": amount_paise,
        "currency": "INR",
        "plan_name": plan["name"],
        "interval": plan["interval"],
        "prefill": {
            "name": restaurant.get("owner_name", user["full_name"]),
            "email": user["email"],
            "contact": restaurant.get("phone", ""),
        },
        "notes": {"tenant_id": tid, "plan_id": plan["id"]},
    }


@api.post("/subscriptions/verify")
async def verify_payment(payload: VerifyIn, user: dict = Depends(require_roles("owner", "manager"))):
    if not razorpay_client:
        raise HTTPException(status_code=503, detail="Razorpay not configured")
    tid = await _ensure_tenant(user)
    try:
        razorpay_client.utility.verify_payment_signature({
            "razorpay_order_id": payload.razorpay_order_id,
            "razorpay_payment_id": payload.razorpay_payment_id,
            "razorpay_signature": payload.razorpay_signature,
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid signature: {e}")
    plan = await db.plans.find_one({"id": payload.plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    await db.payment_orders.update_one(
        {"razorpay_order_id": payload.razorpay_order_id, "tenant_id": tid},
        {"$set": {"status": "paid", "razorpay_payment_id": payload.razorpay_payment_id, "paid_at": datetime.now(timezone.utc).isoformat()}},
    )
    # Deactivate any prior active subs, insert new active sub
    await db.subscriptions.update_many({"tenant_id": tid, "status": "active"}, {"$set": {"status": "cancelled"}})
    sub = {
        "id": str(uuid.uuid4()),
        "tenant_id": tid,
        "plan_id": plan["id"],
        "plan_name": plan["name"],
        "price": plan["price"],
        "interval": plan["interval"],
        "status": "active",
        "razorpay_payment_id": payload.razorpay_payment_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.subscriptions.insert_one(sub)
    sub.pop("_id", None)
    return sub


from fastapi import Request

@api.post("/subscriptions/webhook")
async def razorpay_webhook(request: Request):
    if not razorpay_client:
        raise HTTPException(status_code=503, detail="Razorpay not configured")
    body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")
    if RAZORPAY_WEBHOOK_SECRET:
        try:
            razorpay_client.utility.verify_webhook_signature(body.decode(), signature, RAZORPAY_WEBHOOK_SECRET)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Bad signature: {e}")
    import json as _json
    event = _json.loads(body.decode() or "{}")
    event_type = event.get("event", "")
    payload_payment = (((event.get("payload") or {}).get("payment") or {}).get("entity") or {})
    order_id = payload_payment.get("order_id")
    payment_id = payload_payment.get("id")
    if order_id and event_type in ("payment.captured", "payment.authorized"):
        po = await db.payment_orders.find_one({"razorpay_order_id": order_id}, {"_id": 0})
        if po:
            plan = await db.plans.find_one({"id": po["plan_id"]}, {"_id": 0}) or {}
            tid = po["tenant_id"]
            await db.subscriptions.update_many({"tenant_id": tid, "status": "active"}, {"$set": {"status": "cancelled"}})
            await db.subscriptions.insert_one({
                "id": str(uuid.uuid4()),
                "tenant_id": tid,
                "plan_id": po["plan_id"],
                "plan_name": plan.get("name", ""),
                "price": plan.get("price", 0),
                "interval": plan.get("interval", "month"),
                "status": "active",
                "razorpay_payment_id": payment_id,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "via": "webhook",
            })
            await db.payment_orders.update_one(
                {"razorpay_order_id": order_id},
                {"$set": {"status": "paid", "razorpay_payment_id": payment_id, "paid_at": datetime.now(timezone.utc).isoformat()}},
            )
    return {"ok": True, "event": event_type}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def seed_super_admin():
    existing = await db.users.find_one({"email": ADMIN_EMAIL.lower()})
    if not existing:
        uid = str(uuid.uuid4())
        await db.users.insert_one({
            "id": uid,
            "email": ADMIN_EMAIL.lower(),
            "password": hash_pw(ADMIN_PASSWORD),
            "full_name": "Super Admin",
            "role": "super_admin",
            "tenant_id": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info("Seeded super_admin: %s", ADMIN_EMAIL)
    else:
        await db.users.update_one({"email": ADMIN_EMAIL.lower()}, {"$set": {"role": "super_admin"}})
        logger.info("Super admin already exists; role ensured.")

    # Seed default subscription plans idempotently
    defaults = [
        {"name": "Monthly", "price": 499.0, "interval": "month",
         "features": ["Unlimited menu items", "Unlimited orders", "KDS", "Billing with UPI QR"]},
        {"name": "Yearly", "price": 4999.0, "interval": "year",
         "features": ["Everything in Monthly", "2 months free", "Priority support"]},
    ]
    for p in defaults:
        exists = await db.plans.find_one({"name": p["name"], "interval": p["interval"]})
        if not exists:
            await db.plans.insert_one({
                "id": str(uuid.uuid4()), **p, "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            logger.info("Seeded plan: %s / %s", p["name"], p["interval"])


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
