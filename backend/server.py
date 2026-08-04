from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, Header, WebSocket, WebSocketDisconnect, BackgroundTasks
from fastapi.responses import HTMLResponse
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
ACCESS_TTL_MIN = int(os.environ.get("ACCESS_TTL_MIN", "52560000"))
REFRESH_TTL_DAYS = int(os.environ.get("REFRESH_TTL_DAYS", "36500"))
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


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, list[WebSocket]] = {}

    async def connect(self, tenant_id: str, websocket: WebSocket):
        await websocket.accept()
        if tenant_id not in self.active_connections:
            self.active_connections[tenant_id] = []
        self.active_connections[tenant_id].append(websocket)

    def disconnect(self, tenant_id: str, websocket: WebSocket):
        if tenant_id in self.active_connections:
            if websocket in self.active_connections[tenant_id]:
                self.active_connections[tenant_id].remove(websocket)
            if not self.active_connections[tenant_id]:
                del self.active_connections[tenant_id]

    async def broadcast_to_tenant(self, tenant_id: str, message: dict):
        if tenant_id in self.active_connections:
            for connection in self.active_connections[tenant_id]:
                try:
                    await connection.send_json(message)
                except Exception:
                    pass

manager = ConnectionManager()


import urllib.request
import json
import asyncio

def _sync_send_push(messages: list):
    try:
        url = "https://exp.host/--/api/v2/push/send"
        req_data = json.dumps(messages).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=req_data,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=5) as response:
            response.read()
    except Exception as e:
        print("Failed to send push:", e)


async def send_expo_push_notifications(push_tokens: list[str], title: str, body: str, category: str, data: dict = None):
    messages = []
    for token in push_tokens:
        if not token or not (token.startswith("ExponentPushToken") or token.startswith("ExpoPushToken")):
            continue
        messages.append({
            "to": token,
            "sound": "default",
            "title": title,
            "body": body,
            "data": {
                "category": category,
                **(data or {})
            }
        })
    if not messages:
        return
    try:
        loop = asyncio.get_running_loop()
        loop.run_in_executor(None, _sync_send_push, messages)
    except Exception as e:
        print("Failed to dispatch push notification task:", e)


async def notify_tenant(tenant_id: str, category: str, title: str, message: str, data: dict = None):
    if not tenant_id:
        return
    doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "category": category,  # sales | kitchen | waiter | cashier | system | payment
        "title": title,
        "message": message,
        "data": data or {},
        "is_read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.notifications.insert_one(doc)
    doc.pop("_id", None)
    await manager.broadcast_to_tenant(tenant_id, doc)
    
    # Query all users under this tenant who have registered push tokens
    try:
        cursor = db.users.find({"tenant_id": tenant_id, "push_token": {"$exists": True, "$ne": None}})
        users_list = await cursor.to_list(length=100)
        tokens = [u["push_token"] for u in users_list if u.get("push_token")]
        if tokens:
            await send_expo_push_notifications(tokens, title, message, category, data)
    except Exception as e:
        print("Failed to send push notification alert:", e)


@app.websocket("/ws/{tenant_id}")
async def websocket_endpoint(websocket: WebSocket, tenant_id: str):
    await manager.connect(tenant_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except Exception:
        manager.disconnect(tenant_id, websocket)


import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import random

SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 465
SMTP_USER = "contactprodevopz@gmail.com"
SMTP_PASSWORD = "ydqm zvap zecd xsql"


def send_reset_pin_email(to_email: str, pin: str, name: str):
    try:
        subject = "Reset Your ProDevOpz POS Password"
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Reset Password</title>
            <style>
                body {{
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background-color: #f8fafc;
                    margin: 0;
                    padding: 0;
                }}
                .container {{
                    max-width: 600px;
                    margin: 40px auto;
                    background: #ffffff;
                    border-radius: 16px;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
                    overflow: hidden;
                    border: 1px solid #e2e8f0;
                }}
                .header {{
                    background-color: #FF5E2B;
                    padding: 30px;
                    text-align: center;
                }}
                .header h1 {{
                    color: #ffffff;
                    margin: 0;
                    font-size: 24px;
                    font-weight: 700;
                }}
                .content {{
                    padding: 40px 30px;
                    color: #334155;
                    line-height: 1.6;
                }}
                .content h2 {{
                    color: #0f172a;
                    font-size: 20px;
                    margin-top: 0;
                }}
                .pin-box {{
                    background-color: #f1f5f9;
                    border-radius: 12px;
                    padding: 20px;
                    text-align: center;
                    margin: 30px 0;
                    border: 1px dashed #cbd5e1;
                }}
                .pin-code {{
                    font-size: 32px;
                    font-weight: 800;
                    letter-spacing: 6px;
                    color: #FF5E2B;
                    margin: 0;
                }}
                .footer {{
                    background-color: #f8fafc;
                    padding: 20px;
                    text-align: center;
                    font-size: 12px;
                    color: #64748b;
                    border-top: 1px solid #e2e8f0;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>ProDevOpz ERP</h1>
                </div>
                <div class="content">
                    <h2>Hello {name},</h2>
                    <p>We received a request to reset the password for your account. Use the verification code below to set a new password. This code is valid for 15 minutes.</p>
                    <div class="pin-box">
                        <p class="pin-code">{pin}</p>
                    </div>
                    <p>If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
                    <p>Best regards,<br><strong>ProDevOpz Support Team</strong></p>
                </div>
                <div class="footer">
                    <p>This is an automated email. Please do not reply to this message.</p>
                </div>
            </div>
        </body>
        </html>
        """
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"ProDevOpz POS <{SMTP_USER}>"
        msg["To"] = to_email
        part_html = MIMEText(html_content, "html")
        msg.attach(part_html)
        
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT) as server:
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_USER, to_email, msg.as_string())
    except Exception as e:
        print("Failed to send reset PIN email:", e)


# ---------- helpers ----------
def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_pw(pw: str, hashed: str) -> bool:
    try:
        if bcrypt.checkpw(pw.encode(), hashed.encode()):
            return True
    except Exception:
        pass
    return pw == hashed


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
    terms_accepted: Optional[bool] = False


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordWithPinIn(BaseModel):
    email: EmailStr
    pin: str = Field(min_length=6, max_length=6)
    new_password: str = Field(min_length=6)


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
    gst_rate: float = 5.0
    fssai: Optional[str] = ""
    upi_id: str
    merchant_name: str
    google_maps_link: Optional[str] = ""


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


class PublicOrderIn(BaseModel):
    tenant_id: str
    table_number: str
    order_type: str = "dine_in"  # dine_in, take_away
    items: List[OrderItemIn]
    notes: str = ""
    customer_phone: str = ""
    customer_name: str = ""
    payment_method: str = "UPI"  # UPI
    razorpay_payment_id: str
    razorpay_order_id: str
    razorpay_signature: str


class PublicCheckoutIn(BaseModel):
    tenant_id: str
    amount: float

class OrderStatusIn(BaseModel):
    status: str  # placed, in_kitchen, ready, served, cancelled


class OrderUpdateIn(BaseModel):
    items: List[OrderItemIn]
    notes: Optional[str] = ""


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
    if not payload.terms_accepted:
        raise HTTPException(status_code=400, detail="You must agree to the Terms & Conditions and Privacy Policy")
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
        "terms_accepted": True,
        "terms_accepted_at": datetime.now(timezone.utc).isoformat(),
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


@api.post("/auth/forgot-password")
async def forgot_password(payload: ForgotPasswordIn, background_tasks: BackgroundTasks):
    user = await db.users.find_one({"email": payload.email.lower()})
    if not user:
        raise HTTPException(status_code=404, detail="Email address not found")
    
    # Generate 6-digit PIN
    pin = f"{random.randint(100000, 999999)}"
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
    
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "reset_pin": pin,
            "reset_pin_expires_at": expires_at.isoformat()
        }}
    )
    
    # Send email in background task
    background_tasks.add_task(
        send_reset_pin_email,
        user["email"],
        pin,
        user.get("full_name", "User")
    )
    
    return {
        "message": "Verification code sent successfully"
    }


@api.post("/auth/reset-password-with-pin")
async def reset_password_with_pin(payload: ResetPasswordWithPinIn):
    user = await db.users.find_one({"email": payload.email.lower()})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    saved_pin = user.get("reset_pin")
    expires_str = user.get("reset_pin_expires_at")
    
    if not saved_pin or not expires_str:
        raise HTTPException(status_code=400, detail="No reset code requested")
        
    if saved_pin != payload.pin:
        raise HTTPException(status_code=400, detail="Invalid verification code")
        
    expires_at = datetime.fromisoformat(expires_str)
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=400, detail="Verification code has expired")
        
    # Update password
    hashed_pwd = hash_pw(payload.new_password)
    await db.users.update_one(
        {"id": user["id"]},
        {
            "$set": {"password": hashed_pwd},
            "$unset": {"reset_pin": "", "reset_pin_expires_at": ""}
        }
    )
    
    return {"message": "Password reset successfully"}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@api.delete("/auth/delete-account")
async def delete_my_account(user: dict = Depends(get_current_user)):
    uid = user["id"]
    tid = user.get("tenant_id")
    if user["role"] == "owner" and tid:
        await db.restaurants.delete_one({"id": tid})
        await db.categories.delete_many({"tenant_id": tid})
        await db.menu_items.delete_many({"tenant_id": tid})
        await db.tables.delete_many({"tenant_id": tid})
        await db.orders.delete_many({"tenant_id": tid})
        await db.bills.delete_many({"tenant_id": tid})
        await db.subscriptions.delete_many({"tenant_id": tid})
        await db.users.delete_many({"tenant_id": tid})
    else:
        await db.users.delete_one({"id": uid})
    return {"ok": True}


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
    doc = {"id": tenant_id, **payload.dict(), "owner_user_id": user["id"], "is_read": False, "created_at": now, "updated_at": now}
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
    await notify_tenant(
        tid,
        "kitchen",
        "New KOT Placed",
        f"New order placed for Table {doc.get('table_number', '-')}",
        {"order_id": doc["id"], "table_number": doc.get("table_number", "-")}
    )
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
    valid = {"placed", "in_kitchen", "ready", "served", "cancelled"}
    if payload.status not in valid:
        raise HTTPException(status_code=400, detail="Invalid status")
    res = await db.orders.update_one({"id": oid}, {"$set": {"status": payload.status}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Order not found")
    order = await db.orders.find_one({"id": oid}, {"_id": 0})
    await notify_tenant(
        order["tenant_id"],
        "waiter" if payload.status in ("in_kitchen", "ready") else "cashier",
        "Order Status Updated",
        f"Order for Table {order.get('table_number', '-')} is now {payload.status.replace('_', ' ').upper()}",
        {"order_id": oid, "status": payload.status, "table_number": order.get("table_number", "-")}
    )
    return order


@api.patch("/orders/{oid}")
async def update_order(oid: str, payload: OrderUpdateIn, user: dict = Depends(require_roles("owner", "manager", "waiter"))):
    order = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    tid = order["tenant_id"]
    subtotal = sum(i.price * i.quantity for i in payload.items)
    await db.orders.update_one(
        {"id": oid},
        {"$set": {
            "items": [i.dict() for i in payload.items],
            "notes": payload.notes,
            "subtotal": subtotal,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Recalculate pending bill if it exists
    bill = await db.bills.find_one({"order_id": oid})
    if bill and bill.get("status") == "pending":
        restaurant = await db.restaurants.find_one({"id": tid}, {"_id": 0}) or {}
        gst_enabled = bill.get("gst_enabled", bool(restaurant.get("gst_enabled")))
        tax_percent = bill.get("tax_percent", float(restaurant.get("gst_rate", 5.0)))
        discount = bill.get("discount", 0.0)
        
        tax = round(subtotal * (tax_percent / 100), 2) if gst_enabled else 0.0
        cgst = round(tax / 2, 2) if gst_enabled else 0.0
        sgst = round(tax - cgst, 2) if gst_enabled else 0.0
        total = round(subtotal + tax - discount, 2)
        
        upi_id = restaurant.get("upi_id", "")
        merchant = restaurant.get("merchant_name", restaurant.get("name", "Merchant"))
        upi_url = f"upi://pay?pa={upi_id}&pn={merchant.replace(' ', '%20')}&am={total}&cu=INR&tn=Order-{oid[:8]}"
        
        await db.bills.update_one(
            {"id": bill["id"]},
            {"$set": {
                "items": [i.dict() for i in payload.items],
                "subtotal": subtotal,
                "tax": tax,
                "cgst": cgst,
                "sgst": sgst,
                "total": total,
                "upi_url": upi_url
            }}
        )
    await notify_tenant(
        tid,
        "kitchen",
        "KOT Order Modified",
        f"Items updated for Table {order.get('table_number', '-')}",
        {"order_id": oid, "table_number": order.get("table_number", "-")}
    )
    return await db.orders.find_one({"id": oid}, {"_id": 0})


# ---------- public guest api ----------
@api.get("/public/restaurant/{tenant_id}")
async def public_get_restaurant(tenant_id: str):
    res = await db.restaurants.find_one({"id": tenant_id}, {"_id": 0})
    if not res:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    return {
        "id": res.get("id"),
        "name": res.get("name"),
        "owner_name": res.get("owner_name"),
        "bio": res.get("bio"),
        "logo_base64": res.get("logo_base64"),
        "address": res.get("address"),
        "phone": res.get("phone"),
        "upi_id": res.get("upi_id"),
        "merchant_name": res.get("merchant_name"),
        "google_maps_link": res.get("google_maps_link", ""),
    }

@api.get("/public/menu/{tenant_id}")
async def public_list_menu(tenant_id: str):
    items = await db.menu_items.find({"tenant_id": tenant_id}, {"_id": 0}).to_list(1000)
    categories = await db.categories.find({"tenant_id": tenant_id}, {"_id": 0}).sort("sort_order", 1).to_list(500)
    return {
        "items": items,
        "categories": categories
    }

@api.post("/public/orders")
async def public_create_order(payload: PublicOrderIn):
    restaurant = await db.restaurants.find_one({"id": payload.tenant_id})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    
    # Verify Razorpay signature to prevent scam/fake orders
    if not razorpay_client:
        raise HTTPException(status_code=500, detail="Razorpay is not configured on server")
        
    try:
        razorpay_client.utility.verify_payment_signature({
            "razorpay_order_id": payload.razorpay_order_id,
            "razorpay_payment_id": payload.razorpay_payment_id,
            "razorpay_signature": payload.razorpay_signature,
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Payment signature verification failed: {str(e)}")

    subtotal = sum(i.price * i.quantity for i in payload.items)
    order_id = str(uuid.uuid4())
    
    doc = {
        "id": order_id,
        "tenant_id": payload.tenant_id,
        "table_number": payload.table_number,
        "items": [i.dict() for i in payload.items],
        "notes": payload.notes,
        "subtotal": subtotal,
        "status": "placed",
        "created_by": "guest",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "customer_phone": payload.customer_phone,
        "customer_name": payload.customer_name,
        "order_type": payload.order_type,
        "payment_method": payload.payment_method,
        "razorpay_payment_id": payload.razorpay_payment_id,
        "razorpay_order_id": payload.razorpay_order_id,
    }
    
    await db.orders.insert_one(doc)
    doc.pop("_id", None)
    
    # Create corresponding paid bill in db.bills to track revenue and dashboard totals
    bill_id = str(uuid.uuid4())
    bill_doc = {
        "id": bill_id,
        "tenant_id": payload.tenant_id,
        "order_id": order_id,
        "table_number": payload.table_number or "",
        "items": [i.dict() for i in payload.items],
        "subtotal": float(subtotal),
        "tax_percent": 0.0,
        "tax": 0.0,
        "cgst": 0.0,
        "sgst": 0.0,
        "gst_enabled": False,
        "discount": 0.0,
        "total": float(subtotal),
        "upi_url": "",
        "status": "paid",
        "payment_method": payload.payment_method or "online",
        "created_by": "guest", # Indicates web QR guest billing
        "created_at": doc["created_at"],
        "paid_at": doc["created_at"],
    }
    await db.bills.insert_one(bill_doc)
    
    await notify_tenant(
        payload.tenant_id,
        "kitchen",
        "New Contactless Order",
        f"New QR order for Table {payload.table_number or '-'}",
        {"order_id": order_id, "table_number": payload.table_number or "-"}
    )
    
    return doc


@api.post("/public/orders/checkout")
async def public_orders_checkout(payload: PublicCheckoutIn):
    if not razorpay_client:
        raise HTTPException(status_code=500, detail="Razorpay is not configured on server")
    try:
        order = razorpay_client.order.create({
            "amount": int(payload.amount * 100),
            "currency": "INR",
            "payment_capture": 1
        })
        return {
            "razorpay_order_id": order["id"],
            "amount": order["amount"],
            "currency": order["currency"],
            "key_id": RAZORPAY_KEY_ID
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
    
    tax_percent = payload.tax_percent
    if tax_percent == 5.0 and "gst_rate" in restaurant:
      tax_percent = float(restaurant["gst_rate"])
      
    tax = round(subtotal * (tax_percent / 100), 2) if gst_enabled else 0.0
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
        "tax_percent": tax_percent if gst_enabled else 0.0,
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


class PayIn(BaseModel):
    payment_method: str = "UPI"


@api.patch("/bills/{bid}/pay")
async def mark_bill_paid(bid: str, payload: Optional[PayIn] = None, user: dict = Depends(require_roles("owner", "manager", "waiter"))):
    tid = await _ensure_tenant(user)
    pm = (payload and payload.payment_method) or "UPI"
    res = await db.bills.update_one({"id": bid, "tenant_id": tid}, {"$set": {"status": "paid", "payment_method": pm, "paid_at": datetime.now(timezone.utc).isoformat()}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Bill not found")
    bill = await db.bills.find_one({"id": bid}, {"_id": 0})
    await db.orders.update_one({"id": bill["order_id"], "tenant_id": tid}, {"$set": {"status": "served"}})
    
    await notify_tenant(
        tid,
        "payment",
        "Payment Received",
        f"Table {bill.get('table_number', '-')} paid ₹{bill.get('total', 0.0):.2f} via {pm}",
        {"bill_id": bid, "total": bill.get("total", 0.0), "table_number": bill.get("table_number", "-")}
    )
    return bill


@api.get("/bills")
async def list_bills(user: dict = Depends(get_current_user)):
    tid = await _ensure_tenant(user)
    bills = await db.bills.find({"tenant_id": tid}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return bills


# ---------- notifications ----------
@api.get("/notifications")
async def list_notifications(category: Optional[str] = None, user: dict = Depends(get_current_user)):
    tid = await _ensure_tenant(user)
    q = {"tenant_id": tid}
    if category:
        q["category"] = category
    notifs = await db.notifications.find(q, {"_id": 0}).sort("created_at", -1).to_list(100)
    return notifs


@api.patch("/notifications/{nid}/read")
async def read_notification(nid: str, user: dict = Depends(get_current_user)):
    tid = await _ensure_tenant(user)
    res = await db.notifications.update_one({"id": nid, "tenant_id": tid}, {"$set": {"is_read": True}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"status": "success"}


@api.post("/notifications/read-all")
async def read_all_notifications(user: dict = Depends(get_current_user)):
    tid = await _ensure_tenant(user)
    await db.notifications.update_many({"tenant_id": tid}, {"$set": {"is_read": True}})
    return {"status": "success"}


@api.delete("/notifications/{nid}")
async def delete_notification(nid: str, user: dict = Depends(get_current_user)):
    tid = await _ensure_tenant(user)
    res = await db.notifications.delete_one({"id": nid, "tenant_id": tid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"status": "success"}


@api.delete("/notifications")
async def clear_notifications(user: dict = Depends(get_current_user)):
    tid = await _ensure_tenant(user)
    await db.notifications.delete_many({"tenant_id": tid})
    return {"status": "success"}


class PushTokenIn(BaseModel):
    push_token: str


@api.post("/users/push-token")
async def save_push_token(payload: PushTokenIn, user: dict = Depends(get_current_user)):
    await db.users.update_one({"id": user["id"]}, {"$set": {"push_token": payload.push_token}})
    return {"status": "success"}


@api.post("/notifications/test-push")
async def test_push_notification(payload: dict, user: dict = Depends(get_current_user)):
    tid = await _ensure_tenant(user)
    cursor = db.users.find({"tenant_id": tid, "push_token": {"$exists": True, "$ne": None}})
    users_list = await cursor.to_list(length=100)
    tokens = [u["push_token"] for u in users_list if u.get("push_token")]
    
    title = payload.get("title", "Test Alert")
    msg = payload.get("message", "This is a test notification from your ProDevOpz POS server!")
    
    if tokens:
        await send_expo_push_notifications(tokens, title, msg, "system")
    return {
        "status": "success",
        "tokens_found": len(tokens),
        "tokens": tokens,
        "recipient_count": len(tokens)
    }


# ---------- dashboard ----------
@api.get("/dashboard/summary")
async def dashboard_summary(user: dict = Depends(get_current_user)):
    tid = await _ensure_tenant(user)
    now = datetime.now(timezone.utc)
    today_str = now.date().isoformat()

    orders_total = await db.orders.count_documents({"tenant_id": tid})
    open_orders = await db.orders.count_documents({"tenant_id": tid, "status": {"$in": ["placed", "in_kitchen", "ready"]}})
    pending_count = await db.orders.count_documents({"tenant_id": tid, "status": "placed"})
    cooking_count = await db.orders.count_documents({"tenant_id": tid, "status": "in_kitchen"})
    ready_count = await db.orders.count_documents({"tenant_id": tid, "status": "ready"})

    total_tables = await db.tables.count_documents({"tenant_id": tid})
    
    # Calculate occupied tables dynamically from active orders (status placed/in_kitchen/ready) to count web orders
    active_orders = await db.orders.find(
        {"tenant_id": tid, "status": {"$in": ["placed", "in_kitchen", "ready"]}},
        {"table_number": 1}
    ).to_list(1000)
    occupied_table_labels = {o["table_number"] for o in active_orders if o.get("table_number") and o.get("table_number") not in ["Takeaway", "Take-Away", "Contactless"]}
    occupied_tables = len(occupied_table_labels)
    tables_free = max(0, total_tables - occupied_tables) if total_tables > 0 else 5

    paid_bills = await db.bills.find({"tenant_id": tid, "status": "paid"}, {"_id": 0}).to_list(2000)
    revenue_total = round(sum(b.get("total", 0) for b in paid_bills), 2)

    today_bills = [
        b for b in paid_bills
        if (b.get("paid_at") and str(b.get("paid_at"))[:10] == today_str) or
           (b.get("created_at") and str(b.get("created_at"))[:10] == today_str)
    ]
    revenue_today = round(sum(b.get("total", 0) for b in today_bills), 2)
    avg_bill = round(revenue_today / len(today_bills), 2) if today_bills else (round(revenue_total / len(paid_bills), 2) if paid_bills else 0)

    # Calculate web payments (created_by == "guest")
    revenue_web_today = round(sum(b.get("total", 0) for b in today_bills if b.get("created_by") == "guest"), 2)
    revenue_web_total = round(sum(b.get("total", 0) for b in paid_bills if b.get("created_by") == "guest"), 2)

    # Last 7 days revenue calculation
    last_7_days = []
    for i in range(6, -1, -1):
        day_date = (now - timedelta(days=i)).date()
        day_str = day_date.isoformat()
        day_label = day_date.strftime("%m-%d")
        day_rev = round(sum(
            b.get("total", 0) for b in paid_bills
            if (b.get("paid_at") and str(b.get("paid_at"))[:10] == day_str) or
               (b.get("created_at") and str(b.get("created_at"))[:10] == day_str)
        ), 2)
        last_7_days.append({"date": day_label, "revenue": day_rev})

    # Top selling items calculation
    item_sales = {}
    for b in today_bills:
        for item in b.get("items", []):
            name = item.get("name", "Item")
            qty = item.get("quantity", 1)
            price = item.get("price", 0) * qty
            if name not in item_sales:
                item_sales[name] = {"name": name, "sold": 0, "amount": 0}
            item_sales[name]["sold"] += qty
            item_sales[name]["amount"] += price

    top_selling = sorted(list(item_sales.values()), key=lambda x: x["sold"], reverse=True)[:5]

    menu_count = await db.menu_items.count_documents({"tenant_id": tid})
    return {
        "orders_total": orders_total,
        "orders_open": open_orders,
        "pending_count": pending_count,
        "cooking_count": cooking_count,
        "ready_count": ready_count,
        "tables_free": tables_free,
        "revenue_total": revenue_total,
        "revenue_today": revenue_today,
        "revenue_web_today": revenue_web_today,
        "revenue_web_total": revenue_web_total,
        "avg_bill": avg_bill,
        "menu_count": menu_count,
        "last_7_days": last_7_days,
        "top_selling": top_selling,
    }



# ---------- SUPER ADMIN ----------
class PlanIn(BaseModel):
    name: str
    price: float
    interval: str = "month"  # "month" or "year"
    features: List[str] = []
    is_active: bool = True
    valid_days: Optional[int] = None


class SubscribeIn(BaseModel):
    plan_id: str
    status: str = "active"  # active / cancelled


class ResetPasswordIn(BaseModel):
    new_password: str = Field(min_length=4)


@api.get("/admin/summary")
async def admin_summary(user: dict = Depends(require_roles("super_admin", "admin_employee"))):
    try:
        total_restaurants = await db.restaurants.count_documents({})
        total_users = await db.users.count_documents({})
        total_owners = await db.users.count_documents({"role": "owner"})
        total_waiters = await db.users.count_documents({"role": "waiter"})
        active_subs = await db.subscriptions.find({"status": "active"}, {"_id": 0}).to_list(2000)
        # Compute MRR safely: monthly plans + yearly plans / 12
        mrr = 0.0
        for s in active_subs:
            try:
                price = float(s.get("price") or 0)
                interval = s.get("interval", "month")
                if interval == "year":
                    mrr += price / 12
                else:
                    mrr += price
            except:
                pass
        return {
            "total_restaurants": total_restaurants,
            "total_users": total_users,
            "total_owners": total_owners,
            "total_waiters": total_waiters,
            "active_subscriptions": len(active_subs),
            "mrr": round(mrr, 2),
            "arr": round(mrr * 12, 2),
        }
    except Exception as e:
        logger.error(f"Error in admin_summary: {e}")
        return {
            "total_restaurants": 0,
            "total_users": 0,
            "total_owners": 0,
            "total_waiters": 0,
            "active_subscriptions": 0,
            "mrr": 0.0,
            "arr": 0.0,
        }


@api.get("/admin/restaurants")
async def admin_list_restaurants(user: dict = Depends(require_roles("super_admin", "admin_employee"))):
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
            "is_read": r.get("is_read", False),
        })
    return out


@api.get("/admin/restaurants/{tid}")
async def admin_restaurant_detail(tid: str, user: dict = Depends(require_roles("super_admin", "admin_employee"))):
    r = await db.restaurants.find_one({"id": tid}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    orders_total = await db.orders.count_documents({"tenant_id": tid})
    paid = await db.bills.find({"tenant_id": tid, "status": "paid"}, {"_id": 0}).to_list(5000)
    revenue = round(sum(b.get("total", 0) for b in paid), 2)
    sub = await db.subscriptions.find_one({"tenant_id": tid}, {"_id": 0}, sort=[("created_at", -1)])
    return {**r, "orders_total": orders_total, "revenue_total": revenue, "subscription": sub}


@api.post("/admin/restaurants/{tid}/read")
async def admin_mark_restaurant_read(tid: str, user: dict = Depends(require_roles("super_admin", "admin_employee"))):
    await db.restaurants.update_one({"id": tid}, {"$set": {"is_read": True}})
    return {"ok": True}


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


class CreateUserIn(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: str


@api.post("/admin/users")
async def admin_create_user(payload: CreateUserIn, user: dict = Depends(require_roles("super_admin"))):
    exists = await db.users.find_one({"email": payload.email.lower()})
    if exists:
        raise HTTPException(status_code=400, detail="Email already registered")
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
    doc.pop("_id", None)
    doc.pop("password", None)
    return doc


class UpdateUserIn(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    role: Optional[str] = None


@api.patch("/admin/users/{uid}")
async def admin_update_user(uid: str, payload: UpdateUserIn, user: dict = Depends(require_roles("super_admin"))):
    upd = {k: v for k, v in payload.dict(exclude_unset=True).items() if v is not None}
    if "email" in upd:
        upd["email"] = upd["email"].lower()
        exists = await db.users.find_one({"email": upd["email"], "id": {"$ne": uid}})
        if exists:
            raise HTTPException(status_code=400, detail="Email already in use")
    res = await db.users.update_one({"id": uid}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    target = await db.users.find_one({"id": uid}, {"_id": 0, "password": 0})
    return target


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
        
    valid_days = plan.get("valid_days")
    if not valid_days:
        valid_days = 365 if plan.get("interval") == "year" else 30
    ends_at = datetime.now(timezone.utc) + timedelta(days=int(valid_days))

    # Cancel previous active subscriptions
    await db.subscriptions.update_many(
        {"tenant_id": tid, "status": "active"},
        {"$set": {"status": "cancelled"}}
    )

    doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tid,
        "plan_id": plan["id"],
        "plan_name": plan["name"],
        "price": plan["price"],
        "interval": plan["interval"],
        "status": payload.status,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "ends_at": ends_at.isoformat() if payload.status == "active" else None
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
    tid = user.get("tenant_id")
    sub = await db.subscriptions.find_one(
        {"$or": [{"tenant_id": tid}, {"user_id": user["id"]}]} if tid else {"user_id": user["id"]},
        {"_id": 0},
        sort=[("created_at", -1)]
    )
    if sub:
        if tid and sub.get("tenant_id") != tid:
            await db.subscriptions.update_many(
                {"user_id": user["id"]},
                {"$set": {"tenant_id": tid}}
            )
            sub["tenant_id"] = tid
            
        # Check if subscription has expired
        ends_at_str = sub.get("ends_at")
        if ends_at_str and sub.get("status") == "active":
            ends_at = datetime.fromisoformat(ends_at_str.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) > ends_at:
                sub["status"] = "expired"
                await db.subscriptions.update_one({"id": sub["id"]}, {"$set": {"status": "expired"}})
    return sub


@api.post("/subscriptions/checkout")
async def checkout(payload: CheckoutIn, user: dict = Depends(require_roles("owner", "manager"))):
    tid = user.get("tenant_id") or user["id"]
    plan = await db.plans.find_one({"id": payload.plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
        
    # Deactivate prior subscriptions
    await db.subscriptions.update_many(
        {"$or": [{"tenant_id": tid}, {"user_id": user["id"]}], "status": "active"},
        {"$set": {"status": "cancelled"}}
    )
    
    # Calculate ends_at based on plan valid_days
    valid_days = plan.get("valid_days")
    if not valid_days:
        valid_days = 365 if plan.get("interval") == "year" else 30
    ends_at = datetime.now(timezone.utc) + timedelta(days=int(valid_days))
    
    sub = {
        "id": str(uuid.uuid4()),
        "tenant_id": user.get("tenant_id") or tid,
        "user_id": user["id"],
        "plan_id": plan["id"],
        "plan_name": plan["name"],
        "price": plan["price"],
        "interval": plan["interval"],
        "status": "active",
        "payment_method": "auto_pay",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "ends_at": ends_at.isoformat(),
    }
    await db.subscriptions.insert_one(sub)
    sub.pop("_id", None)
    return {"status": "success", "subscription": sub}


@api.post("/subscriptions/verify")
async def verify_payment(payload: VerifyIn, user: dict = Depends(require_roles("owner", "manager"))):
    if not razorpay_client:
        raise HTTPException(status_code=503, detail="Razorpay not configured")
    tid = user.get("tenant_id") or user["id"]
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
    await db.subscriptions.update_many(
        {"$or": [{"tenant_id": tid}, {"user_id": user["id"]}], "status": "active"},
        {"$set": {"status": "cancelled"}}
    )
    sub = {
        "id": str(uuid.uuid4()),
        "tenant_id": user.get("tenant_id"),
        "user_id": user["id"],
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


@app.get("/menu/{tenant_id}", response_class=HTMLResponse)
@app.get("/menu/{tenant_id}/{table_label}", response_class=HTMLResponse)
async def serve_customer_menu(tenant_id: str, table_label: Optional[str] = None):
    try:
        template_path = Path(__file__).parent / "templates" / "customer_menu.html"
        with open(template_path, "r", encoding="utf-8") as f:
            html_content = f.read()
        html_content = html_content.replace("{{TENANT_ID}}", tenant_id)
        html_content = html_content.replace("{{TABLE_LABEL}}", table_label or "")
        headers = {
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0"
        }
        return HTMLResponse(content=html_content, headers=headers)
    except Exception as e:
        return HTMLResponse(content=f"<h3>Error loading customer menu page: {str(e)}</h3>", status_code=500)

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
        {"name": "Monthly", "price": 499.0, "interval": "month", "valid_days": 30,
         "features": ["Unlimited menu items", "Unlimited orders", "KDS", "Billing with UPI QR"]},
        {"name": "Yearly", "price": 4999.0, "interval": "year", "valid_days": 365,
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
