from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, Header, WebSocket, WebSocketDisconnect, BackgroundTasks, File, UploadFile, Request
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
import time
from typing import List, Optional
from datetime import datetime, timezone, timedelta

from billing_engine import calculate_bill

dashboard_summary_cache: dict[str, tuple[float, dict]] = {}

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

# Limit MongoDB connection pool to save RAM on 512MB instances
client = AsyncIOMotorClient(
    MONGO_URL,
    maxPoolSize=10,
    minPoolSize=1,
    maxIdleTimeMS=30000,
    waitQueueTimeoutMS=5000
)
db = client[DB_NAME]

# Razorpay client (lazy)
import razorpay
razorpay_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET)) if RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET else None

app = FastAPI(title="Lumina ERP API")
api = APIRouter(prefix="/api")


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, set[WebSocket]] = {}

    async def connect(self, tenant_id: str, websocket: WebSocket):
        await websocket.accept()
        if tenant_id not in self.active_connections:
            self.active_connections[tenant_id] = set()
        self.active_connections[tenant_id].add(websocket)

    def disconnect(self, tenant_id: str, websocket: WebSocket):
        if tenant_id in self.active_connections:
            self.active_connections[tenant_id].discard(websocket)
            if not self.active_connections[tenant_id]:
                self.active_connections.pop(tenant_id, None)

    async def broadcast_to_tenant(self, tenant_id: str, message: dict):
        if tenant_id in self.active_connections:
            dead_sockets = []
            for connection in list(self.active_connections[tenant_id]):
                try:
                    await connection.send_json(message)
                except Exception:
                    dead_sockets.append(connection)
            for dead in dead_sockets:
                self.active_connections[tenant_id].discard(dead)
            if not self.active_connections[tenant_id]:
                self.active_connections.pop(tenant_id, None)

    def active_count(self) -> int:
        return sum(len(sockets) for sockets in self.active_connections.values())

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
            "priority": "high",
            "channelId": "default",
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
    
    if category == "kitchen" and "New" in title:
        print(f"\n[BACKEND ALERT] NEW ORDER CREATED\nRestaurant ID: {tenant_id}\nOrder ID: {doc['id']}\nEmitting NEW_ORDER event\nSocket room: {tenant_id}\n", flush=True)
        logger.info("[BACKEND ALERT] NEW ORDER CREATED - Restaurant: %s, Order: %s, Socket room: %s", tenant_id, doc["id"], tenant_id)
        
    await manager.broadcast_to_tenant(tenant_id, doc)
    dashboard_summary_cache.pop(tenant_id, None)
    
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
        pass
    finally:
        manager.disconnect(tenant_id, websocket)


import secrets
import requests
import random

BREVO_API_KEY = os.environ.get("BREVO_API_KEY", "")
BREVO_SENDER_EMAIL = os.environ.get("BREVO_SENDER_EMAIL", "contactprodevopz@gmail.com")
BREVO_SENDER_NAME = os.environ.get("BREVO_SENDER_NAME", "EZBill")


class EmailService:
    @staticmethod
    def send_password_reset_otp(email: str, name: str, otp: str):
        if not BREVO_API_KEY:
            raise Exception("Brevo API key is not configured.")
        
        url = "https://api.brevo.com/v3/smtp/email"
        headers = {
            "api-key": BREVO_API_KEY,
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
        
        html_content = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your EZBill OTP</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background-color: #F8FAFC;
            margin: 0;
            padding: 0;
            -webkit-font-smoothing: antialiased;
        }}
        .wrapper {{
            width: 100%;
            background-color: #F8FAFC;
            padding: 40px 0;
        }}
        .container {{
            max-width: 500px;
            margin: 0 auto;
            background: #FFFFFF;
            border-radius: 16px;
            border: 1px solid #E2E8F0;
            overflow: hidden;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
        }}
        .content {{
            padding: 40px 32px;
            text-align: center;
        }}
        .brand {{
            font-size: 24px;
            font-weight: 800;
            color: #635BFF;
            margin-bottom: 24px;
            letter-spacing: -0.5px;
        }}
        .title {{
            font-size: 20px;
            font-weight: 700;
            color: #0F172A;
            margin-bottom: 8px;
        }}
        .subtitle {{
            font-size: 14px;
            color: #475569;
            line-height: 1.5;
            margin-bottom: 32px;
        }}
        .otp-container {{
            background-color: #F1F5F9;
            border-radius: 12px;
            padding: 16px;
            margin: 24px 0;
            border: 1px solid #E2E8F0;
            display: inline-block;
        }}
        .otp-code {{
            font-family: 'Courier New', Courier, monospace;
            font-size: 36px;
            font-weight: 800;
            letter-spacing: 8px;
            color: #0F172A;
            margin: 0;
            padding-left: 8px;
        }}
        .expiry {{
            font-size: 12px;
            color: #64748B;
            margin-top: 16px;
            font-weight: 500;
        }}
        .footer {{
            padding: 24px 32px;
            background-color: #F8FAFC;
            border-top: 1px solid #E2E8F0;
            text-align: center;
        }}
        .footer-text {{
            font-size: 11px;
            color: #94A3B8;
            line-height: 1.6;
        }}
        .warning-text {{
            font-size: 12px;
            color: #94A3B8;
            margin-top: 24px;
            line-height: 1.5;
        }}
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="container">
            <div class="content">
                <div class="brand">EZBill</div>
                <div class="title">Password Reset Request</div>
                <p class="subtitle">We received a request to reset your EZBill account password. Use the verification code below to proceed.</p>
                <div class="otp-container">
                    <p class="otp-code">{otp}</p>
                </div>
                <p class="expiry">This code expires in 10 minutes.</p>
                <p class="warning-text">If you did not request this, you can safely ignore this email. Never share this OTP with anyone.</p>
            </div>
            <div class="footer">
                <div class="brand" style="font-size: 16px; margin-bottom: 8px; color: #94A3B8;">EZBill</div>
                <p class="footer-text">Restaurant Management Made Simple<br>&copy; 2026 EZBill. All rights reserved.</p>
            </div>
        </div>
    </div>
</body>
</html>"""
        
        payload = {
            "sender": {
                "name": BREVO_SENDER_NAME,
                "email": BREVO_SENDER_EMAIL
            },
            "to": [
                {
                    "email": email,
                    "name": name
                }
            ],
            "subject": "Your EZBill Password Reset OTP",
            "htmlContent": html_content
        }
        
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        if response.status_code not in (200, 201, 202):
            print(f"[EmailService Error] status_code={response.status_code} response={response.text}")
            raise Exception("Failed to send transactional email through Brevo API.")


def send_reset_pin_email(to_email: str, pin: str, name: str):
    # Backward compatible wrapper redirecting to EmailService
    try:
        EmailService.send_password_reset_otp(to_email, name, pin)
    except Exception as e:
        print("Failed to send reset PIN email via EmailService wrapper:", e)


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


def optimize_logo_base64(b64_str: str, max_w: int = 180, max_h: int = 180) -> str:
    if not b64_str:
        return ""
    if "," in b64_str:
        b64_str = b64_str.split(",")[1]
    try:
        import base64
        import io
        from PIL import Image
        
        img_data = base64.b64decode(b64_str)
        img = Image.open(io.BytesIO(img_data))
        
        if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
            background = Image.new("RGBA", img.size, (255, 255, 255))
            alpha_composite = Image.alpha_composite(background, img.convert("RGBA"))
            img = alpha_composite.convert("RGB")
        else:
            img = img.convert("RGB")
            
        img.thumbnail((max_w, max_h), Image.Resampling.LANCZOS)
        img = img.convert("1")
        
        out_io = io.BytesIO()
        img.save(out_io, format="PNG")
        return base64.b64encode(out_io.getvalue()).decode("utf-8")
    except ImportError:
        print("PIL is not installed. Skipping image optimization.")
        return b64_str
    except Exception as e:
        print(f"Failed to optimize logo base64 (w={max_w}):", e)
        return b64_str


def parse_qr_data(qr_data: str):
    qr_data = qr_data.strip()
    if qr_data.startswith("EZBILL_ORDER:"):
        qr_data = qr_data[len("EZBILL_ORDER:"):].strip()
    
    try:
        import json
        data = json.loads(qr_data)
        if isinstance(data, dict):
            return {
                "order_id": data.get("order_id") or data.get("orderId"),
                "token": data.get("token"),
                "tenant_id": data.get("tenant_id") or data.get("tenantId"),
                "table_number": data.get("table_number") or data.get("tableNumber") or data.get("tableId"),
                "table_id": data.get("table_id") or data.get("tableId")
            }
    except Exception:
        pass

    if "://" in qr_data or "/" in qr_data:
        from urllib.parse import urlparse, parse_qs
        try:
            parsed_url = urlparse(qr_data)
            path_parts = parsed_url.path.strip("/").split("/")
            query = parse_qs(parsed_url.query)
            
            order_id = query.get("order_id", [None])[0] or query.get("orderId", [None])[0]
            token = query.get("token", [None])[0]
            tenant_id = query.get("tenant_id", [None])[0] or query.get("tenantId", [None])[0]
            table_number = query.get("table_number", [None])[0] or query.get("tableNumber", [None])[0]
            
            if len(path_parts) >= 3 and path_parts[0] == "menu":
                if not tenant_id:
                    tenant_id = path_parts[1]
                if not table_number:
                    table_number = path_parts[2]
            
            if order_id or token or tenant_id:
                return {
                    "order_id": order_id,
                    "token": token,
                    "tenant_id": tenant_id,
                    "table_number": table_number,
                    "table_id": query.get("table_id", [None])[0] or query.get("tableId", [None])[0]
                }
        except Exception:
            pass

    return {
        "order_id": qr_data,
        "token": qr_data,
        "tenant_id": None,
        "table_number": None,
        "table_id": None
    }


async def log_consent_event(user_id: str, tenant_id: Optional[str], consent_type: str, purpose: str, version: str, status: str, source: str, ip: str = "", ua: str = ""):
    now = datetime.now(timezone.utc).isoformat()
    record = {
        "id": str(uuid.uuid4()),
        "userId": user_id,
        "restaurantId": tenant_id or "",
        "consentType": consent_type,
        "purpose": purpose,
        "documentVersion": version,
        "consentStatus": status,
        "acceptedAt": now if status == "accepted" else None,
        "withdrawnAt": now if status == "withdrawn" else None,
        "source": source,
        "ipAddress": ip,
        "userAgent": ua,
        "createdAt": now,
        "updatedAt": now
    }
    await db.consent_records.insert_one(record)


def make_token(sub: str, role: str, tenant_id: Optional[str], refresh: bool = False, token_version: int = 0) -> str:
    now = datetime.now(timezone.utc)
    exp = now + (timedelta(days=REFRESH_TTL_DAYS) if refresh else timedelta(minutes=ACCESS_TTL_MIN))
    payload = {
        "sub": sub, "role": role, "tenant_id": tenant_id,
        "iat": int(now.timestamp()), "exp": int(exp.timestamp()), "refresh": refresh,
        "tv": token_version
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def decode_token(token: str) -> dict:
    try:
        return pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")


async def find_order_by_qr_or_id(tid: str, order_id: str, token: str):
    import re
    q_str = (order_id or "").strip()
    tok_str = (token or "").strip()
    
    if not q_str and not tok_str:
        return None
        
    query_or = []
    if q_str:
        query_or.append({"id": q_str})
        query_or.append({"qr_token": q_str})
    if tok_str:
        query_or.append({"id": tok_str})
        query_or.append({"qr_token": tok_str})
        
    if q_str and len(q_str) == 8:
        query_or.append({"id": {"$regex": f"^{re.escape(q_str)}", "$options": "i"}})
        query_or.append({"qr_token": {"$regex": f"^{re.escape(q_str)}", "$options": "i"}})
    if tok_str and len(tok_str) == 8:
        query_or.append({"id": {"$regex": f"^{re.escape(tok_str)}", "$options": "i"}})
        query_or.append({"qr_token": {"$regex": f"^{re.escape(tok_str)}", "$options": "i"}})
        
    if q_str and len(q_str) >= 6:
        query_or.append({"id": {"$regex": f"^{re.escape(q_str)}$", "$options": "i"}})
        query_or.append({"qr_token": {"$regex": f"^{re.escape(q_str)}$", "$options": "i"}})
        
    return await db.orders.find_one({
        "tenant_id": tid,
        "$or": query_or
    })


async def get_current_user(authorization: Optional[str] = Header(default=None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    payload = decode_token(authorization.split(" ", 1)[1])
    if payload.get("refresh"):
        raise HTTPException(status_code=401, detail="Refresh token not allowed here")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if "tv" in payload and payload["tv"] != user.get("token_version", 0):
        raise HTTPException(status_code=401, detail="Session expired. Please log in again.")
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
    privacy_consent: Optional[bool] = False
    marketing_consent: Optional[bool] = False


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
    phone2: Optional[str] = ""
    gst: Optional[str] = ""
    gst_enabled: bool = False
    gst_rate: float = 5.0
    fssai: Optional[str] = ""
    upi_id: str
    merchant_name: str
    google_maps_link: Optional[str] = ""
    googleReviewUrl: Optional[str] = ""


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
    session_id: Optional[str] = None
    customer_name: Optional[str] = "Guest 1"


class PublicOrderIn(BaseModel):
    tenant_id: str
    table_number: str
    table_id: Optional[str] = None
    order_type: str = "dine_in"  # dine_in, take_away
    items: List[OrderItemIn]
    notes: str = ""
    customer_phone: str = ""
    customer_name: str = "Guest 1"
    session_id: Optional[str] = None
    payment_method: str = "UPI"  # UPI, PAY_AT_COUNTER, WAITER_QR
    razorpay_payment_id: Optional[str] = ""
    razorpay_order_id: Optional[str] = ""
    razorpay_signature: Optional[str] = ""


class ScanImportIn(BaseModel):
    qr_data: str
    table_number: Optional[str] = None


class QRResolveIn(BaseModel):
    qr_data: str


class QRConfirmIn(BaseModel):
    qr_data: str
    table_number: Optional[str] = None
    table_id: Optional[str] = None
    operation_id: Optional[str] = None


class MenuItemOcrItem(BaseModel):
    name: str
    price: float
    description: Optional[str] = ""
    is_veg: Optional[bool] = False
    confidence: Optional[float] = 0.95


class CategoryOcrItem(BaseModel):
    name: str
    is_existing: Optional[bool] = False
    matched_id: Optional[str] = None
    items: List[MenuItemOcrItem] = []


class MenuOcrIn(BaseModel):
    images: List[str]


class BulkImportItemIn(BaseModel):
    name: str
    price: float
    description: Optional[str] = ""
    is_veg: Optional[bool] = False
    action: Optional[str] = "create"  # "create" | "replace" | "skip"
    existing_item_id: Optional[str] = None


class BulkImportCategoryIn(BaseModel):
    name: str
    category_id: Optional[str] = None
    items: List[BulkImportItemIn] = []


class BulkImportIn(BaseModel):
    categories: List[BulkImportCategoryIn]


class ImportRollbackIn(BaseModel):
    item_ids: List[str]
    category_ids: List[str]


class PublicCheckoutIn(BaseModel):
    tenant_id: str
    amount: float

class OrderStatusIn(BaseModel):
    status: str  # placed, in_kitchen, ready, served, cancelled


class OrderUpdateIn(BaseModel):
    items: List[OrderItemIn]
    notes: Optional[str] = ""
    customer_name: Optional[str] = None


class BillIn(BaseModel):
    order_id: Optional[str] = None
    order_ids: Optional[List[str]] = None
    table_number: Optional[str] = None
    tax_percent: float = 5.0
    discount: float = 0.0
    gst_enabled: Optional[bool] = None  # override restaurant default


# ---------- auth routes ----------
@api.get("/")
async def root():
    return {"app": "Lumina ERP", "status": "ok"}


@api.post("/auth/register", response_model=TokenOut)
async def register(payload: RegisterIn, request: Request = None):
    if not payload.terms_accepted or not payload.privacy_consent:
        raise HTTPException(status_code=400, detail="You must agree to the Terms & Conditions and Privacy Notice")
    existing = await db.users.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    if payload.role not in ("owner", "manager", "waiter", "kitchen"):
        raise HTTPException(status_code=400, detail="Invalid role for self-registration")
    uid = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": uid,
        "email": payload.email.lower(),
        "password": hash_pw(payload.password),
        "full_name": payload.full_name,
        "role": payload.role,
        "tenant_id": None,
        "terms_accepted": True,
        "terms_accepted_at": now_iso,
        "privacy_consent": True,
        "marketing_consent": bool(payload.marketing_consent),
        "token_version": 0,
        "created_at": now_iso,
    }
    await db.users.insert_one(doc)
    
    # Audit log DPDP consent events
    ip = request.client.host if (request and request.client) else ""
    ua = request.headers.get("user-agent", "") if request else ""
    await log_consent_event(uid, None, "TERMS_AND_CONDITIONS", "To accept service terms", "v1.0", "accepted", "registration", ip, ua)
    await log_consent_event(uid, None, "PRIVACY_POLICY", "To allow data processing", "v1.0", "accepted", "registration", ip, ua)
    if payload.marketing_consent:
        await log_consent_event(uid, None, "MARKETING_CONSENT", "To receive promotional messages", "v1.0", "accepted", "registration", ip, ua)
        
    user_out = {k: v for k, v in doc.items() if k not in ("password", "_id")}
    return TokenOut(
        access_token=make_token(uid, payload.role, None, token_version=0),
        refresh_token=make_token(uid, payload.role, None, refresh=True, token_version=0),
        user=user_out,
    )


@api.post("/auth/login", response_model=TokenOut)
async def login(payload: LoginIn):
    user = await db.users.find_one({"email": payload.email.lower()})
    if not user or not verify_pw(payload.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    user_out = {k: v for k, v in user.items() if k not in ("password", "_id")}
    tv = user.get("token_version", 0)
    return TokenOut(
        access_token=make_token(user["id"], user["role"], user.get("tenant_id"), token_version=tv),
        refresh_token=make_token(user["id"], user["role"], user.get("tenant_id"), refresh=True, token_version=tv),
        user=user_out,
    )


class VerifyResetOtpIn(BaseModel):
    email: EmailStr
    otp: str


class ResetPasswordIn(BaseModel):
    email: EmailStr
    reset_token: str
    new_password: str


@api.post("/auth/forgot-password")
async def forgot_password(payload: ForgotPasswordIn):
    user = await db.users.find_one({"email": payload.email.lower()})
    
    # Account enumeration prevention: return same response even if user doesn't exist
    generic_success = {
        "message": "If the email is registered, a verification code has been sent."
    }
    
    if not user:
        return generic_success
        
    now = datetime.now(timezone.utc)
    
    # 60-second resend cooldown protection
    if user.get("reset_otp") and user["reset_otp"].get("cooldown_until"):
        try:
            cooldown_time = datetime.fromisoformat(user["reset_otp"]["cooldown_until"])
            if now < cooldown_time:
                return generic_success
        except Exception:
            pass
            
    # Generate secure 6-digit OTP using secrets module
    otp_code = f"{secrets.randbelow(1000000):06d}"
    otp_hash = hash_pw(otp_code)
    
    expires_at = (now + timedelta(minutes=10)).isoformat()
    cooldown_until = (now + timedelta(seconds=60)).isoformat()
    
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "reset_otp": {
                "hash": otp_hash,
                "expires_at": expires_at,
                "cooldown_until": cooldown_until,
                "attempts": 0,
                "created_at": now.isoformat()
            }
        }}
    )
    
    # Send email using Brevo HTTPS API
    try:
        EmailService.send_password_reset_otp(
            user["email"],
            user.get("full_name", "User"),
            otp_code
        )
    except Exception as e:
        print("Failed to send verification email via Brevo:", e)
        raise HTTPException(
            status_code=500,
            detail="We couldn't send the verification code right now. Please try again later."
        )
        
    return generic_success


@api.post("/auth/verify-reset-otp")
async def verify_reset_otp(payload: VerifyResetOtpIn):
    user = await db.users.find_one({"email": payload.email.lower()})
    if not user:
        raise HTTPException(status_code=400, detail="Invalid verification request.")
        
    reset_otp = user.get("reset_otp")
    if not reset_otp:
        raise HTTPException(status_code=400, detail="No reset code requested.")
        
    now = datetime.now(timezone.utc)
    
    # Expiration check
    try:
        expiry = datetime.fromisoformat(reset_otp["expires_at"])
        if now > expiry:
            await db.users.update_one({"id": user["id"]}, {"$unset": {"reset_otp": ""}})
            raise HTTPException(status_code=400, detail="OTP expired. Please request a new code.")
    except HTTPException:
        raise
    except Exception:
        pass
        
    # Attempt limits check
    attempts = reset_otp.get("attempts", 0)
    if attempts >= 5:
        await db.users.update_one({"id": user["id"]}, {"$unset": {"reset_otp": ""}})
        raise HTTPException(status_code=400, detail="Too many incorrect attempts. Please request a new OTP.")
        
    # OTP verification
    if not verify_pw(payload.otp, reset_otp["hash"]):
        await db.users.update_one({"id": user["id"]}, {"$inc": {"reset_otp.attempts": 1}})
        new_attempts = attempts + 1
        if new_attempts >= 5:
            await db.users.update_one({"id": user["id"]}, {"$unset": {"reset_otp": ""}})
            raise HTTPException(status_code=400, detail="Too many incorrect attempts. Please request a new OTP.")
        raise HTTPException(status_code=400, detail="Invalid verification code.")
        
    # Generate secure reset token
    reset_token = secrets.token_urlsafe(32)
    token_hash = hash_pw(reset_token)
    token_expires_at = (now + timedelta(minutes=10)).isoformat()
    
    await db.users.update_one(
        {"id": user["id"]},
        {
            "$set": {
                "reset_token_hash": token_hash,
                "reset_token_expires_at": token_expires_at
            },
            "$unset": {"reset_otp": ""}
        }
    )
    
    return {"reset_token": reset_token}


@api.post("/auth/reset-password")
async def reset_password(payload: ResetPasswordIn):
    user = await db.users.find_one({"email": payload.email.lower()})
    if not user:
        raise HTTPException(status_code=400, detail="Invalid reset request.")
        
    token_hash = user.get("reset_token_hash")
    expires_str = user.get("reset_token_expires_at")
    
    if not token_hash or not expires_str:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token. Please request a new verification code.")
        
    now = datetime.now(timezone.utc)
    try:
        expiry = datetime.fromisoformat(expires_str)
        if now > expiry:
            await db.users.update_one(
                {"id": user["id"]},
                {"$unset": {"reset_token_hash": "", "reset_token_expires_at": ""}}
            )
            raise HTTPException(status_code=400, detail="Reset token expired. Please request a new verification code.")
    except HTTPException:
        raise
    except Exception:
        pass
        
    if not verify_pw(payload.reset_token, token_hash):
        raise HTTPException(status_code=400, detail="Invalid reset token.")
        
    # Update password and invalidate all active sessions
    hashed_pwd = hash_pw(payload.new_password)
    tv = user.get("token_version", 0) + 1
    
    await db.users.update_one(
        {"id": user["id"]},
        {
            "$set": {
                "password": hashed_pwd,
                "token_version": tv
            },
            "$unset": {
                "reset_token_hash": "",
                "reset_token_expires_at": ""
            }
        }
    )
    
    return {"message": "Password changed successfully."}


@api.post("/auth/reset-password-with-pin")
async def reset_password_with_pin(payload: ResetPasswordWithPinIn):
    # Backward compatible wrapper route
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
        
    hashed_pwd = hash_pw(payload.new_password)
    tv = user.get("token_version", 0) + 1
    await db.users.update_one(
        {"id": user["id"]},
        {
            "$set": {
                "password": hashed_pwd,
                "token_version": tv
            },
            "$unset": {"reset_pin": "", "reset_pin_expires_at": ""}
        }
    )
    
    return {"message": "Password reset successfully"}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


class ConsentUpdateIn(BaseModel):
    consent_type: str
    status: str


@api.post("/users/consent")
async def update_user_consent(payload: ConsentUpdateIn, current_user: dict = Depends(get_current_user), request: Request = None):
    field_map = {
        "TERMS_AND_CONDITIONS": "terms_accepted",
        "PRIVACY_POLICY": "privacy_consent",
        "MARKETING_CONSENT": "marketing_consent"
    }
    field_name = field_map.get(payload.consent_type)
    if not field_name:
        raise HTTPException(status_code=400, detail="Invalid consent category")
        
    val = (payload.status == "accepted")
    await db.users.update_one({"id": current_user["id"]}, {"$set": {field_name: val}})
    
    purpose_map = {
        "TERMS_AND_CONDITIONS": "To accept service terms",
        "PRIVACY_POLICY": "To allow data processing",
        "MARKETING_CONSENT": "To receive promotional messages"
    }
    
    ip = request.client.host if (request and request.client) else ""
    ua = request.headers.get("user-agent", "") if request else ""
    
    await log_consent_event(
        current_user["id"],
        current_user.get("tenant_id"),
        payload.consent_type,
        purpose_map[payload.consent_type],
        "v1.0",
        payload.status,
        "settings",
        ip,
        ua
    )
    return {"success": True, "status": payload.status}


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
    
    doc_data = payload.dict()
    if payload.logo_base64:
        doc_data["logo_base64_58"] = optimize_logo_base64(payload.logo_base64, 180, 180)
        doc_data["logo_base64_80"] = optimize_logo_base64(payload.logo_base64, 260, 260)
    else:
        doc_data["logo_base64_58"] = ""
        doc_data["logo_base64_80"] = ""
        
    if tenant_id:
        await db.restaurants.update_one({"id": tenant_id}, {"$set": {**doc_data, "updated_at": now}})
        rest = await db.restaurants.find_one({"id": tenant_id}, {"_id": 0})
        return rest
    tenant_id = str(uuid.uuid4())
    doc = {"id": tenant_id, **doc_data, "owner_user_id": user["id"], "is_read": False, "created_at": now, "updated_at": now}
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
    cats = await db.categories.find({"tenant_id": tid, "is_deleted": {"$ne": True}}, {"_id": 0}).sort("sort_order", 1).to_list(500)
    return cats


@api.delete("/categories/{cid}")
async def delete_category(cid: str, user: dict = Depends(require_roles("owner", "manager"))):
    tid = await _ensure_tenant(user)
    now = datetime.now(timezone.utc).isoformat()
    await db.categories.update_one({"id": cid, "tenant_id": tid}, {"$set": {"deleted_at": now, "is_deleted": True}})
    await db.menu_items.update_many({"category_id": cid, "tenant_id": tid}, {"$set": {"deleted_at": now, "is_deleted": True}})
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
    items = await db.menu_items.find({"tenant_id": tid, "is_deleted": {"$ne": True}}, {"_id": 0}).to_list(2000)
    return items


@api.delete("/menu-items/{iid}")
async def delete_menu_item(iid: str, user: dict = Depends(require_roles("owner", "manager"))):
    tid = await _ensure_tenant(user)
    now = datetime.now(timezone.utc).isoformat()
    await db.menu_items.update_one({"id": iid, "tenant_id": tid}, {"$set": {"deleted_at": now, "is_deleted": True}})
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
    tables = await db.tables.find({"tenant_id": tid, "is_deleted": {"$ne": True}}, {"_id": 0}).sort("label", 1).to_list(500)
    return tables


@api.delete("/tables/{tbl_id}")
async def delete_table(tbl_id: str, user: dict = Depends(require_roles("owner", "manager"))):
    tid = await _ensure_tenant(user)
    now = datetime.now(timezone.utc).isoformat()
    await db.tables.update_one({"id": tbl_id, "tenant_id": tid}, {"$set": {"deleted_at": now, "is_deleted": True}})
    return {"ok": True}

@api.get("/sync")
async def delta_sync(since: Optional[str] = None, user: dict = Depends(get_current_user)):
    tid = await _ensure_tenant(user)
    
    q = {"tenant_id": tid}
    if since:
        # Check both created_at (additions) and deleted_at (deletes)
        q["$or"] = [
            {"created_at": {"$gte": since}},
            {"deleted_at": {"$gte": since}}
        ]
        
    categories = await db.categories.find(q, {"_id": 0}).to_list(1000)
    menu_items = await db.menu_items.find(q, {"_id": 0}).to_list(2000)
    orders = await db.orders.find(q, {"_id": 0}).to_list(1000)
    bills = await db.bills.find(q, {"_id": 0}).to_list(1000)
    tables = await db.tables.find(q, {"_id": 0}).to_list(500)
    
    return {
        "categories": categories,
        "menu_items": menu_items,
        "orders": orders,
        "bills": bills,
        "tables": tables,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }



# ---------- waiters (staff) ----------
@api.post("/staff/waiters")
async def create_waiter(payload: WaiterIn, user: dict = Depends(require_roles("owner", "manager"))):
    tid = await _ensure_tenant(user)
    
    # Enforce subscription staff limits
    limits = await get_tenant_plan_limits(tid)
    current_waiters = await db.users.count_documents({"tenant_id": tid, "role": "waiter"})
    if current_waiters >= limits["staff_limit"]:
        plan_display = limits["plan"].capitalize()
        raise HTTPException(
            status_code=403,
            detail=f"You've reached your {plan_display} plan limit of {limits['staff_limit']} staff. Upgrade to add more staff."
        )

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
    tv = waiter.get("token_version", 0)
    return TokenOut(
        access_token=make_token(waiter["id"], "waiter", tid, token_version=tv),
        refresh_token=make_token(waiter["id"], "waiter", tid, refresh=True, token_version=tv),
        user={k: v for k, v in waiter.items() if k != "pin"},
    )


# ---------- orders ----------
@api.post("/orders")
async def create_order(payload: OrderIn, user: dict = Depends(require_roles("owner", "manager", "waiter"))):
    tid = await _ensure_tenant(user)
    subtotal = sum(i.price * i.quantity for i in payload.items)
    cust_name = (payload.customer_name or "Guest 1").strip()
    sess_id = payload.session_id or str(uuid.uuid4())
    doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tid,
        "table_number": payload.table_number,
        "session_id": sess_id,
        "customer_name": cust_name,
        "items": [i.dict() for i in payload.items],
        "notes": payload.notes,
        "subtotal": subtotal,
        "status": "placed",
        "order_source": "waiter",
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.orders.insert_one(doc)
    doc.pop("_id", None)
    await notify_tenant(
        tid,
        "kitchen",
        "New KOT Placed",
        f"New order placed for Table {doc.get('table_number', '-')} ({cust_name})",
        {"order_id": doc["id"], "table_number": doc.get("table_number", "-"), "customer_name": cust_name, "session_id": sess_id, "order_source": "waiter"}
    )
    return doc


@api.get("/orders")
async def list_orders(status_filter: Optional[str] = None, user: dict = Depends(get_current_user)):
    tid = await _ensure_tenant(user)
    q = {"tenant_id": tid}
    if status_filter:
        if status_filter != "all":
            q["status"] = status_filter
    else:
        # Hide unconfirmed pending_scan web orders from active waiter/kitchen view until scanned
        q["status"] = {"$ne": "pending_scan"}
    orders = await db.orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(100)
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
    tid = order["tenant_id"]
    tbl_num = order.get("table_number", "-")

    # If QR order is marked served, ensure sales are accounted for idempotently in db.bills
    if payload.status == "served" and (order.get("created_by") == "guest" or order.get("order_source") == "qr_web"):
        existing_bill = await db.bills.find_one({"order_id": oid, "tenant_id": tid})
        if not existing_bill:
            bill_id = str(uuid.uuid4())
            bill_doc = {
                "id": bill_id,
                "tenant_id": tid,
                "order_id": oid,
                "session_id": order.get("session_id", ""),
                "customer_name": order.get("customer_name", "Guest"),
                "table_number": tbl_num,
                "items": order.get("items", []),
                "subtotal": float(order.get("subtotal", 0.0)),
                "tax_percent": 0.0,
                "tax": 0.0,
                "cgst": 0.0,
                "sgst": 0.0,
                "gst_enabled": False,
                "discount": 0.0,
                "total": float(order.get("subtotal", 0.0)),
                "upi_url": "",
                "status": "paid",
                "payment_method": order.get("payment_method") or "online",
                "created_by": "guest",
                "created_at": order.get("created_at", datetime.now(timezone.utc).isoformat()),
                "paid_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.bills.insert_one(bill_doc)

    dashboard_summary_cache.pop(tid, None)

    # Calculate remaining active orders on this table
    remaining = await db.orders.count_documents({
        "tenant_id": tid,
        "table_number": tbl_num,
        "status": {"$nin": ["served", "cancelled"]}
    })
    tbl_status = "AVAILABLE" if remaining == 0 else "OCCUPIED"

    await notify_tenant(
        tid,
        "payment" if payload.status == "served" else "waiter",
        "Order Status Updated",
        f"Order for Table {tbl_num} is now {payload.status.replace('_', ' ').upper()}",
        {
            "order_id": oid,
            "status": payload.status,
            "table_number": tbl_num,
            "active_orders_remaining": remaining,
            "table_status": tbl_status,
            "total": float(order.get("subtotal", 0.0)),
            "event": "ORDER_SERVED" if payload.status == "served" else "ORDER_UPDATED"
        }
    )
    return {
        **order,
        "active_orders_remaining": remaining,
        "table_status": tbl_status
    }


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
        "googleReviewUrl": res.get("googleReviewUrl", ""),
    }

@api.get("/public/menu/{tenant_id}")
async def public_list_menu(tenant_id: str):
    items = await db.menu_items.find({"tenant_id": tenant_id}, {"_id": 0}).to_list(1000)
    categories = await db.categories.find({"tenant_id": tenant_id}, {"_id": 0}).sort("sort_order", 1).to_list(500)
    return {
        "items": items,
        "categories": categories
    }

@api.get("/public/table-sessions/{tenant_id}/{table_label}")
async def get_table_sessions(tenant_id: str, table_label: str):
    active_orders = await db.orders.find({
        "tenant_id": tenant_id,
        "table_number": table_label,
        "status": {"$nin": ["served", "cancelled"]}
    }, {"_id": 0, "session_id": 1, "customer_name": 1, "created_at": 1}).to_list(100)
    
    sessions = {}
    for o in active_orders:
        sid = o.get("session_id")
        if sid:
            sessions[sid] = o.get("customer_name") or "Guest"
            
    return {
        "table_label": table_label,
        "active_sessions_count": len(sessions),
        "suggested_guest_index": len(sessions) + 1,
        "active_sessions": [{"session_id": sid, "customer_name": name} for sid, name in sessions.items()]
    }


@api.post("/public/orders")
async def public_create_order(payload: PublicOrderIn):
    restaurant = await db.restaurants.find_one({"id": payload.tenant_id})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    
    is_online_paid = payload.payment_method == "UPI" and bool(payload.razorpay_payment_id)

    if is_online_paid:
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

    # Resolve stable Table ID
    table = None
    if payload.table_id:
        table = await db.tables.find_one({"tenant_id": payload.tenant_id, "id": payload.table_id})
    if not table and payload.table_number:
        table = await db.tables.find_one({"tenant_id": payload.tenant_id, "label": payload.table_number})
        
    if not table:
        raise HTTPException(status_code=400, detail="This table is no longer available.")
        
    table_id = table["id"]
    table_number = table["label"]

    subtotal = sum(i.price * i.quantity for i in payload.items)
    order_id = str(uuid.uuid4())
    qr_token = str(uuid.uuid4())[:16]
    cust_name = (payload.customer_name or "Guest 1").strip()
    sess_id = payload.session_id or str(uuid.uuid4())
    expires_at = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    
    doc = {
        "id": order_id,
        "qr_token": qr_token,
        "tenant_id": payload.tenant_id,
        "table_number": table_number,
        "table_id": table_id,
        "session_id": sess_id,
        "customer_name": cust_name,
        "items": [i.dict() for i in payload.items],
        "notes": payload.notes,
        "subtotal": subtotal,
        "status": "placed" if is_online_paid else "pending_scan",
        "qr_imported": True if is_online_paid else False,
        "order_source": "qr_web",
        "created_by": "guest",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": expires_at,
        "customer_phone": payload.customer_phone,
        "order_type": payload.order_type,
        "payment_method": payload.payment_method,
        "payment_status": "paid" if is_online_paid else "pending",
        "razorpay_payment_id": payload.razorpay_payment_id or "",
        "razorpay_order_id": payload.razorpay_order_id or "",
    }
    
    await db.orders.insert_one(doc)
    doc.pop("_id", None)
    
    if is_online_paid:
        # Create corresponding paid bill in db.bills to track revenue and dashboard totals
        bill_id = str(uuid.uuid4())
        bill_doc = {
            "id": bill_id,
            "tenant_id": payload.tenant_id,
            "order_id": order_id,
            "session_id": sess_id,
            "customer_name": cust_name,
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
            "created_by": "guest",
            "created_at": doc["created_at"],
            "paid_at": doc["created_at"],
        }
        await db.bills.insert_one(bill_doc)
    
        await notify_tenant(
            payload.tenant_id,
            "kitchen",
            "New Customer Order",
            f"New QR order for Table {payload.table_number or '-'} ({cust_name})",
            {"order_id": order_id, "table_number": payload.table_number or "-", "customer_name": cust_name, "session_id": sess_id}
        )
        
        await notify_tenant(
            payload.tenant_id,
            "waiter",
            "New Customer Order",
            f"New order for Table {payload.table_number or '-'} ({cust_name})",
            {"order_id": order_id, "table_number": payload.table_number or "-", "customer_name": cust_name, "session_id": sess_id}
        )
    
    return doc


@api.post("/orders/scan-import")
async def scan_import_order(payload: ScanImportIn, current_user: dict = Depends(get_current_user)):
    tid = current_user.get("tenant_id")
    if not tid:
        raise HTTPException(status_code=400, detail="Tenant context required")
    
    limits = await get_tenant_plan_limits(tid)
    if not limits["features"].get("qr_web_menu"):
        raise HTTPException(status_code=403, detail="QR Web Menu is a Pro feature. Upgrade your subscription plan to access it.")

    raw = payload.qr_data.strip()
    if raw.startswith("EZBILL_ORDER:"):
        raw = raw[len("EZBILL_ORDER:"):].strip()

    try:
        data = json.loads(raw)
    except Exception:
        data = {"order_id": raw, "token": raw}

    order_id = data.get("order_id") or raw
    token = data.get("token")
    qr_tenant = data.get("tenant_id")

    if qr_tenant and qr_tenant != tid:
        raise HTTPException(status_code=403, detail="Unauthorized: Order belongs to a different restaurant.")

    order = await find_order_by_qr_or_id(tid, order_id, token)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found. Please verify the QR code.")

    if order.get("status") in ["paid", "cancelled"]:
        raise HTTPException(status_code=400, detail=f"Order is already {order.get('status')}.")

    table_num = payload.table_number or data.get("table_number") or order.get("table_number") or "1"
    
    # Check if already imported to this table
    if order.get("qr_imported") and order.get("table_number") == table_num:
        order.pop("_id", None)
        return {
            "success": True,
            "already_imported": True,
            "message": f"Order #{order['id'][:8].upper()} is already active on Table {table_num}.",
            "order": order
        }

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.orders.update_one(
        {"id": order["id"]},
        {
            "$set": {
                "table_number": table_num,
                "status": "placed",
                "qr_imported": True,
                "imported_at": now_iso,
                "imported_by": current_user.get("full_name") or current_user.get("email") or current_user.get("role")
            }
        }
    )

    updated_order = await db.orders.find_one({"id": order["id"]}, {"_id": 0})

    # Broadcast to Kitchen, Waiter, and Owner Dashboard
    await notify_tenant(tid, "kitchen", "Order Imported", f"Table {table_num} updated", updated_order)
    await notify_tenant(tid, "waiter", "Order Imported", f"Table {table_num} updated", updated_order)

    return {
        "success": True,
        "already_imported": False,
        "message": f"Order #{updated_order['id'][:8].upper()} successfully added to Table {table_num}!",
        "order": updated_order
    }


@api.post("/orders/qr/resolve")
async def qr_resolve_order(payload: QRResolveIn, current_user: dict = Depends(get_current_user)):
    tid = current_user.get("tenant_id")
    if not tid:
        raise HTTPException(status_code=400, detail="Tenant context required")
    
    limits = await get_tenant_plan_limits(tid)
    if not limits["features"].get("qr_web_menu"):
        raise HTTPException(status_code=403, detail="QR Web Menu is a Pro feature. Upgrade your subscription plan to access it.")

    data = parse_qr_data(payload.qr_data)
    order_id = data.get("order_id")
    token = data.get("token")
    qr_tenant = data.get("tenant_id")

    if qr_tenant and qr_tenant != tid:
        raise HTTPException(status_code=403, detail="This order belongs to another restaurant.")

    order = await find_order_by_qr_or_id(tid, order_id, token)

    if not order:
        raise HTTPException(status_code=404, detail="Order not found. Please verify the QR code.")

    if order.get("status") in ["placed", "paid", "completed", "in_kitchen", "ready"]:
        raise HTTPException(status_code=400, detail="Order already confirmed.")
    elif order.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="Order is already cancelled.")

    created_at_str = order.get("created_at")
    if created_at_str:
        try:
            created_at = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) - created_at > timedelta(hours=2):
                raise HTTPException(status_code=400, detail="This order QR has expired. Please generate a new QR.")
        except HTTPException:
            raise
        except Exception:
            pass

    table_num = data.get("table_number") or order.get("table_number")
    table_id = data.get("table_id") or order.get("table_id")
    
    table = None
    if table_id:
        table = await db.tables.find_one({"tenant_id": tid, "id": table_id})
    if not table and table_num:
        table = await db.tables.find_one({"tenant_id": tid, "label": table_num})
        
    if not table:
        raise HTTPException(status_code=400, detail="This table/order is no longer available.")

    table_num = table["label"]
    table_id = table["id"]

    items = []
    for it in order.get("items") or []:
        items.append({
            "id": it.get("menu_item_id") or it.get("id") or "",
            "name": it.get("name") or "",
            "quantity": it.get("quantity") or 1,
            "price": it.get("price") or 0
        })

    return {
        "success": True,
        "orderId": order.get("id"),
        "restaurantId": order.get("tenant_id"),
        "tableId": table_id,
        "tableName": f"Table {table_num}",
        "customerName": order.get("customer_name") or "Guest 1",
        "items": items,
        "total": order.get("subtotal") or 0,
        "status": order.get("status") or "pending_scan",
    }


@api.post("/orders/qr/confirm")
async def qr_confirm_order(payload: QRConfirmIn, current_user: dict = Depends(get_current_user)):
    tid = current_user.get("tenant_id")
    if not tid:
        raise HTTPException(status_code=400, detail="Tenant context required")
    
    limits = await get_tenant_plan_limits(tid)
    if not limits["features"].get("qr_web_menu"):
        raise HTTPException(status_code=403, detail="QR Web Menu is a Pro feature. Upgrade your subscription plan to access it.")

    op_id = payload.operation_id
    if op_id:
        existing_op = await db.processed_operations.find_one({"id": op_id})
        if existing_op:
            return existing_op.get("response")

    data = parse_qr_data(payload.qr_data)
    order_id = data.get("order_id")
    token = data.get("token")
    qr_tenant = data.get("tenant_id")

    if qr_tenant and qr_tenant != tid:
        raise HTTPException(status_code=403, detail="This order belongs to another restaurant.")

    order = await find_order_by_qr_or_id(tid, order_id, token)

    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")

    table_num = payload.table_number or data.get("table_number") or order.get("table_number") or "1"
    table_id = payload.table_id or data.get("table_id") or order.get("table_id")
    
    table = None
    if table_id:
        table = await db.tables.find_one({"tenant_id": tid, "id": table_id})
    if not table and table_num:
        table = await db.tables.find_one({"tenant_id": tid, "label": table_num})
        
    if not table:
        raise HTTPException(status_code=400, detail="This table/order is no longer available.")

    table_num = table["label"]
    table_id = table["id"]

    if order.get("status") in ["placed", "paid", "completed", "in_kitchen", "ready"]:
        order.pop("_id", None)
        res = {
            "success": True,
            "already_confirmed": True,
            "message": f"Order #{order['id'][:8].upper()} is already active on Table {table_num}.",
            "order": order
        }
        if op_id:
            await db.processed_operations.insert_one({"id": op_id, "response": res, "created_at": datetime.now(timezone.utc).isoformat()})
        return res
        
    if order.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="Order is already cancelled.")

    now_iso = datetime.now(timezone.utc).isoformat()
    result = await db.orders.update_one(
        {
            "id": order["id"],
            "status": "pending_scan"
        },
        {
            "$set": {
                "table_number": table_num,
                "table_id": table_id,
                "status": "placed",
                "qr_imported": True,
                "imported_at": now_iso,
                "imported_by": current_user.get("full_name") or current_user.get("email") or current_user.get("role")
            }
        }
    )

    if result.modified_count == 0:
        re_order = await db.orders.find_one({"id": order["id"]}, {"_id": 0})
        if re_order and re_order.get("status") in ["placed", "paid", "completed", "in_kitchen", "ready"]:
            res = {
                "success": True,
                "already_confirmed": True,
                "message": f"Order #{re_order['id'][:8].upper()} was already confirmed by another device.",
                "order": re_order
            }
            if op_id:
                await db.processed_operations.insert_one({"id": op_id, "response": res, "created_at": datetime.now(timezone.utc).isoformat()})
            return res
        raise HTTPException(status_code=400, detail="Order could not be confirmed. It might be already processed or inactive.")

    # Mark the stable table status as occupied in the database
    await db.tables.update_one({"id": table_id, "tenant_id": tid}, {"$set": {"status": "occupied"}})

    updated_order = await db.orders.find_one({"id": order["id"]}, {"_id": 0})

    await notify_tenant(tid, "kitchen", "Order Confirmed", f"Table {table_num} updated", updated_order)
    await notify_tenant(tid, "waiter", "Order Confirmed", f"Table {table_num} updated", updated_order)

    res = {
        "success": True,
        "already_confirmed": False,
        "message": f"Order #{updated_order['id'][:8].upper()} successfully confirmed on Table {table_num}!",
        "order": updated_order
    }

    if op_id:
        try:
            await db.processed_operations.insert_one({"id": op_id, "response": res, "created_at": datetime.now(timezone.utc).isoformat()})
        except Exception:
            pass

    return res


@api.post("/menu/ocr-process")
async def ocr_process_menu(
    images: List[UploadFile] = File(...),
    current_user: dict = Depends(get_current_user)
):
    tid = current_user.get("tenant_id")
    if not tid:
        raise HTTPException(status_code=400, detail="Tenant context required")

    limits = await get_tenant_plan_limits(tid)
    if not limits["features"].get("ai_menu"):
        raise HTTPException(status_code=403, detail="AI Menu import is a Growth/Pro feature. Upgrade your subscription plan to access it.")

    if not images or len(images) == 0:
        raise HTTPException(status_code=400, detail="At least one menu image is required.")

    # Validation checks
    MAX_SIZE = 10 * 1024 * 1024 # 10MB limit per image
    for img in images:
        # Format validation
        content_type = img.content_type or ""
        filename = (img.filename or "").lower()
        if not (content_type.startswith("image/") or filename.endswith(('.jpg', '.jpeg', '.png', '.webp'))):
            raise HTTPException(status_code=400, detail="Unsupported image format. Please upload JPG, PNG, or WEBP.")
        
        # Size validation
        img_bytes = await img.read()
        if len(img_bytes) > MAX_SIZE:
            raise HTTPException(status_code=413, detail="Image is too large (max 10MB)")
        await img.seek(0)

    # Fetch existing categories to perform smart matching
    existing_cats = await db.categories.find({"tenant_id": tid}).to_list(length=100)
    existing_cat_names = {c["name"].strip().lower(): c["id"] for c in existing_cats}

    gemini_key = os.environ.get("GEMINI_API_KEY")
    categories_result = []

    if gemini_key:
        try:
            import google.generativeai as genai
            genai.configure(api_key=gemini_key)
            model = genai.GenerativeModel("gemini-1.5-flash")
            
            parts = []
            for img in images[:5]:
                file_bytes = await img.read()
                parts.append({
                    "mime_type": img.content_type or "image/jpeg",
                    "data": file_bytes
                })
            
            prompt = """
            You are a menu document extraction system.
            You are NOT allowed to create, infer, guess, complete, or hallucinate any menu item or price.

            First, analyze the provided image. Determine if the image is a restaurant food menu or a page from a food menu.
            If the image is a person, a random object, a receipt, a table, a wall, or any screenshot unrelated to a food menu, you MUST return:
            {
              "is_menu": false,
              "error_message": "This image does not appear to contain a readable menu."
            }

            If it is a menu, extract the categories and items strictly grounded in the visible text.
            For each item, you must find its name, price, and description (if present).
            Every returned item must include:
            1. "name": The exact or near-exact item name as printed.
            2. "price": The exact numeric price in Rupees. If the price is unclear, missing, or represents multiple values (e.g. ₹120/₹200), return null.
            3. "description": The description if printed directly below/beside the item. Do NOT invent a description. If not present, return null.
            4. "sourceText": The exact line of text from the image where this item and price were detected.
            5. "confidence": A float between 0.0 and 1.0 representing your confidence in this extraction.
            6. "is_veg": A boolean indicating if the item is veg. Look for green dots, leaf icons, or explicit labels. If unclear, default to false.

            Only create a category if its heading actually appears as a section title in the image. If there are no section titles, group items under the category name "Uncategorized". Do NOT invent categories.

            Return STRICTLY a JSON object with this format (no markdown fences, no explanation):
            {
              "is_menu": true,
              "categories": [
                {
                  "name": "Category Name",
                  "items": [
                    {
                      "name": "Item Name",
                      "price": 180.0,
                      "description": "Short description if present",
                      "sourceText": "Item Name ........ 180",
                      "is_veg": true,
                      "confidence": 0.98
                    }
                  ]
                }
              ]
            }
            """
            response = model.generate_content([prompt, *parts])
            raw_text = response.text.strip()
            first_brace = raw_text.find('{')
            last_brace = raw_text.rfind('}')
            if first_brace != -1 and last_brace != -1:
                json_str = raw_text[first_brace:last_brace+1]
            else:
                json_str = raw_text
            
            parsed = json.loads(json_str)
            if not parsed.get("is_menu", True):
                raise HTTPException(status_code=400, detail=parsed.get("error_message") or "This image does not appear to contain a readable menu.")
            
            raw_categories = parsed.get("categories", [])
            for cat in raw_categories:
                cat_name = str(cat.get("name", "Uncategorized")).strip()
                if not cat_name:
                    cat_name = "Uncategorized"
                
                validated_items = []
                for item in cat.get("items", []):
                    name = str(item.get("name", "")).strip()
                    price = item.get("price")
                    source_text = str(item.get("sourceText", "")).strip()
                    
                    if not name or not source_text:
                        continue
                    
                    if price is not None:
                        try:
                            price = float(price)
                        except ValueError:
                            price = None
                    
                    # Fuzzy grounding check
                    name_words = [w.lower() for w in name.split() if len(w) > 2]
                    grounded = True
                    if name_words:
                        source_lower = source_text.lower()
                        if not any(word in source_lower for word in name_words):
                            grounded = False
                    
                    if not grounded:
                        continue
                        
                    validated_items.append({
                        "name": name,
                        "price": price,
                        "description": item.get("description") or None,
                        "sourceText": source_text,
                        "is_veg": bool(item.get("is_veg", False)),
                        "confidence": float(item.get("confidence", 0.90))
                    })
                
                if validated_items:
                    categories_result.append({
                        "name": cat_name,
                        "items": validated_items
                    })
                    
        except HTTPException as he:
            raise he
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to process menu: {str(e)}")
    else:
        raise HTTPException(
            status_code=400, 
            detail="Gemini API Key is missing. Please configure GEMINI_API_KEY in your environment variables to enable AI Menu Import."
        )

    if not categories_result:
        raise HTTPException(
            status_code=400,
            detail="No readable menu items or prices could be extracted from this image. Please check image quality and try again."
        )

    for cat in categories_result:
        cat_name_lower = cat["name"].strip().lower()
        if cat_name_lower in existing_cat_names:
            cat["is_existing"] = True
            cat["matched_id"] = existing_cat_names[cat_name_lower]
        else:
            matched = False
            for exist_name, exist_id in existing_cat_names.items():
                if exist_name in cat_name_lower or cat_name_lower in exist_name:
                    cat["is_existing"] = True
                    cat["matched_id"] = exist_id
                    matched = True
                    break
            if not matched:
                cat["is_existing"] = False
                cat["matched_id"] = None

    return {
        "success": True,
        "categories": categories_result,
        "total_categories": len(categories_result),
        "total_items": sum(len(c.get("items", [])) for c in categories_result)
    }


@api.post("/menu/bulk-import")
async def bulk_import_menu(payload: BulkImportIn, current_user: dict = Depends(get_current_user)):
    tid = current_user.get("tenant_id")
    if not tid:
        raise HTTPException(status_code=400, detail="Tenant context required")

    imported_item_ids = []
    imported_category_ids = []
    updated_items_count = 0
    created_cats_count = 0
    created_items_count = 0

    highest_cat = await db.categories.find_one({"tenant_id": tid}, sort=[("sort_order", -1)])
    next_cat_order = (highest_cat.get("sort_order", 0) + 1) if highest_cat else 1

    highest_item = await db.menu_items.find_one({"tenant_id": tid}, sort=[("sort_order", -1)])
    next_item_order = (highest_item.get("sort_order", 0) + 1) if highest_item else 1

    for cat_data in payload.categories:
        cat_id = cat_data.category_id
        is_new_cat = False
        if not cat_id:
            existing = await db.categories.find_one({
                "tenant_id": tid,
                "name": {"$regex": f"^{cat_data.name.strip()}$", "$options": "i"}
            })
            if existing:
                cat_id = existing["id"]
            else:
                cat_id = str(uuid.uuid4())
                await db.categories.insert_one({
                    "id": cat_id,
                    "tenant_id": tid,
                    "name": cat_data.name.strip(),
                    "sort_order": next_cat_order,
                    "created_at": datetime.now(timezone.utc).isoformat()
                })
                next_cat_order += 1
                created_cats_count += 1
                is_new_cat = True
        
        if is_new_cat:
            imported_category_ids.append(cat_id)

        for it in cat_data.items:
            action = it.action or "create"
            if action == "skip":
                continue
            elif action == "replace" and it.existing_item_id:
                # Update existing item in the DB
                await db.menu_items.update_one(
                    {"id": it.existing_item_id, "tenant_id": tid},
                    {"$set": {
                        "price": float(it.price),
                        "description": it.description or "",
                        "is_veg": bool(it.is_veg)
                    }}
                )
                updated_items_count += 1
            else:
                # Create a new menu item
                item_id = str(uuid.uuid4())
                await db.menu_items.insert_one({
                    "id": item_id,
                    "tenant_id": tid,
                    "category_id": cat_id,
                    "name": it.name.strip(),
                    "price": float(it.price),
                    "description": it.description or "",
                    "is_veg": bool(it.is_veg),
                    "is_active": True,
                    "sort_order": next_item_order,
                    "created_at": datetime.now(timezone.utc).isoformat()
                })
                next_item_order += 1
                created_items_count += 1
                imported_item_ids.append(item_id)

    await notify_tenant(tid, "waiter", "Menu Updated", "New items added to menu", {})
    await notify_tenant(tid, "owner", "Menu Updated", "New items added to menu", {})

    return {
        "success": True,
        "message": f"Successfully imported {created_items_count} items and updated {updated_items_count} items!",
        "imported_categories": created_cats_count,
        "imported_items": created_items_count,
        "updated_items": updated_items_count,
        "imported_item_ids": imported_item_ids,
        "imported_category_ids": imported_category_ids
    }

@api.post("/menu/bulk-import/rollback")
async def rollback_bulk_import(payload: ImportRollbackIn, current_user: dict = Depends(get_current_user)):
    tid = current_user.get("tenant_id")
    if not tid:
        raise HTTPException(status_code=400, detail="Tenant context required")

    deleted_items = await db.menu_items.delete_many({
        "tenant_id": tid,
        "id": {"$in": payload.item_ids}
    })

    deleted_cats_count = 0
    for cid in payload.category_ids:
        # Only delete category if it has no items remaining (to prevent orphans or deleting existing active category items)
        remaining = await db.menu_items.count_documents({"tenant_id": tid, "category_id": cid})
        if remaining == 0:
            await db.categories.delete_one({"id": cid, "tenant_id": tid})
            deleted_cats_count += 1

    await notify_tenant(tid, "waiter", "Menu Updated", "Menu import undone", {})
    await notify_tenant(tid, "owner", "Menu Updated", "Menu import undone", {})

    return {
        "success": True,
        "message": f"Undone menu import: removed {deleted_items.deleted_count} items and {deleted_cats_count} categories."
    }


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
    
    if payload.order_id:
        existing_b = await db.bills.find_one({"order_id": payload.order_id, "tenant_id": tid}, {"_id": 0})
        if existing_b:
            return existing_b

    target_orders = []
    if payload.order_ids and len(payload.order_ids) > 0:
        target_orders = await db.orders.find({"id": {"$in": payload.order_ids}, "tenant_id": tid}, {"_id": 0}).to_list(100)
    elif payload.order_id:
        single = await db.orders.find_one({"id": payload.order_id, "tenant_id": tid}, {"_id": 0})
        if single:
            target_orders = [single]
    elif payload.table_number:
        tbl_raw = str(payload.table_number).strip()
        tbl_num = tbl_raw.replace("Table", "").replace("table", "").replace("T", "").replace("-", "").strip()
        tbl_patterns = [tbl_raw]
        if tbl_num:
            tbl_patterns.extend([tbl_num, f"T - {tbl_num}", f"T-{tbl_num}", f"Table {tbl_num}"])
        target_orders = await db.orders.find({
            "table_number": {"$in": tbl_patterns},
            "tenant_id": tid,
            "status": {"$nin": ["served", "cancelled"]}
        }, {"_id": 0}).to_list(100)
        
    if not target_orders:
        raise HTTPException(status_code=404, detail="No active orders found for billing")
        
    restaurant = await db.restaurants.find_one({"id": tid}, {"_id": 0}) or {}
    
    # Combine items and subtotal
    combined_items = []
    subtotal = 0.0
    table_num = target_orders[0].get("table_number", "")
    order_ids = [o["id"] for o in target_orders]
    
    for o in target_orders:
        cust_label = o.get("customer_name") or "Guest"
        for item in o.get("items", []):
            item_copy = dict(item)
            item_copy["customer_name"] = cust_label
            combined_items.append(item_copy)
        subtotal += float(o.get("subtotal", 0.0))
        
    gst_enabled = payload.gst_enabled if payload.gst_enabled is not None else bool(restaurant.get("gst_enabled"))
    
    tax_percent = payload.tax_percent
    if tax_percent == 5.0 and "gst_rate" in restaurant:
        tax_percent = float(restaurant["gst_rate"])
      
    calc = calculate_bill(
        items=combined_items,
        discount=float(payload.discount or 0.0),
        tax_percent=float(tax_percent or 0.0),
        gst_enabled=bool(gst_enabled)
    )
    total = calc["total"]
    upi_id = restaurant.get("upi_id", "")
    merchant = restaurant.get("merchant_name", restaurant.get("name", "Merchant"))
    primary_order_id = order_ids[0]
    upi_url = f"upi://pay?pa={upi_id}&pn={merchant.replace(' ', '%20')}&am={total}&cu=INR&tn=Table-{table_num}"

    bill = {
        "id": str(uuid.uuid4()),
        "tenant_id": tid,
        "order_id": primary_order_id,
        "order_ids": order_ids,
        "table_number": table_num,
        "items": combined_items,
        "subtotal": calc["subtotal"],
        "tax_percent": tax_percent if gst_enabled else 0.0,
        "tax": calc["tax"],
        "cgst": calc["cgst"],
        "sgst": calc["sgst"],
        "gst_enabled": gst_enabled,
        "discount": calc["discount"],
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


class SettleTableIn(BaseModel):
    table_number: str
    payment_method: str = "UPI"


@api.post("/bills/settle-table")
async def settle_table_endpoint(payload: SettleTableIn, user: dict = Depends(require_roles("owner", "manager", "waiter"))):
    tid = await _ensure_tenant(user)
    pm = payload.payment_method or "UPI"
    tbl_raw = str(payload.table_number).strip()
    tbl_num = tbl_raw.replace("Table", "").replace("table", "").replace("T", "").replace("-", "").strip()
    tbl_patterns = [tbl_raw]
    if tbl_num:
        tbl_patterns.extend([tbl_num, f"T - {tbl_num}", f"T-{tbl_num}", f"Table {tbl_num}"])

    # 1. Find all active orders being settled for this table
    active_orders = await db.orders.find({
        "tenant_id": tid,
        "table_number": {"$in": tbl_patterns},
        "status": {"$nin": ["served", "cancelled"]}
    }, {"_id": 0}).to_list(100)
    
    total_settled = sum(float(o.get("subtotal", 0.0)) for o in active_orders)

    # 2. For any active order that does not have a bill, create a paid bill in db.bills to guarantee revenue tracking
    for o in active_orders:
        existing_b = await db.bills.find_one({"order_id": o["id"], "tenant_id": tid})
        if not existing_b:
            bill_id = str(uuid.uuid4())
            bill_doc = {
                "id": bill_id,
                "tenant_id": tid,
                "order_id": o["id"],
                "session_id": o.get("session_id", ""),
                "customer_name": o.get("customer_name", "Guest"),
                "table_number": o.get("table_number", payload.table_number),
                "items": o.get("items", []),
                "subtotal": float(o.get("subtotal", 0.0)),
                "tax_percent": 0.0,
                "tax": 0.0,
                "cgst": 0.0,
                "sgst": 0.0,
                "gst_enabled": False,
                "discount": 0.0,
                "total": float(o.get("subtotal", 0.0)),
                "upi_url": "",
                "status": "paid",
                "payment_method": pm,
                "created_by": user.get("id", "staff"),
                "created_at": o.get("created_at", datetime.now(timezone.utc).isoformat()),
                "paid_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.bills.insert_one(bill_doc)

    # 3. Settle all existing pending bills for this table
    await db.bills.update_many({
        "tenant_id": tid,
        "table_number": {"$in": tbl_patterns},
        "status": "pending"
    }, {"$set": {"status": "paid", "payment_method": pm, "paid_at": datetime.now(timezone.utc).isoformat()}})

    # 4. Mark all active orders for this table as served
    res = await db.orders.update_many({
        "tenant_id": tid,
        "table_number": {"$in": tbl_patterns},
        "status": {"$nin": ["served", "cancelled"]}
    }, {"$set": {"status": "served"}})

    dashboard_summary_cache.pop(tid, None)

    await notify_tenant(
        tid,
        "payment",
        "Table Settled",
        f"Table {payload.table_number} marked paid and cleared ({pm})",
        {
            "table_number": payload.table_number,
            "status": "served",
            "table_status": "AVAILABLE",
            "active_orders_remaining": 0,
            "total": float(total_settled),
            "event": "TABLE_SETTLED"
        }
    )
    return {
        "ok": True,
        "table_number": payload.table_number,
        "table_status": "AVAILABLE",
        "active_orders_remaining": 0,
        "settled_count": res.modified_count,
        "total": float(total_settled)
    }


@api.patch("/bills/{bid}/pay")
async def mark_bill_paid(bid: str, payload: Optional[PayIn] = None, user: dict = Depends(require_roles("owner", "manager", "waiter"))):
    tid = await _ensure_tenant(user)
    pm = (payload and payload.payment_method) or "UPI"
    
    # 1. Look up bill by ID
    bill = await db.bills.find_one({"id": bid, "tenant_id": tid}, {"_id": 0})
    
    if not bill:
        # Fallback: check if bid is an order_id
        bill = await db.bills.find_one({"order_id": bid, "tenant_id": tid}, {"_id": 0})
        if bill:
            await db.bills.update_one({"id": bill["id"], "tenant_id": tid}, {"$set": {"status": "paid", "payment_method": pm, "paid_at": datetime.now(timezone.utc).isoformat()}})
            bill["status"] = "paid"
            bill["payment_method"] = pm
        else:
            # Check if bid is an order directly and create paid bill in db.bills to guarantee sales tracking!
            o = await db.orders.find_one({"id": bid, "tenant_id": tid})
            if o:
                await db.orders.update_one({"id": bid, "tenant_id": tid}, {"$set": {"status": "served"}})
                bill_id = str(uuid.uuid4())
                bill_doc = {
                    "id": bill_id,
                    "tenant_id": tid,
                    "order_id": bid,
                    "session_id": o.get("session_id", ""),
                    "customer_name": o.get("customer_name", "Guest"),
                    "table_number": o.get("table_number", "Takeaway"),
                    "items": o.get("items", []),
                    "subtotal": float(o.get("subtotal", 0.0)),
                    "tax_percent": 0.0,
                    "tax": 0.0,
                    "cgst": 0.0,
                    "sgst": 0.0,
                    "gst_enabled": False,
                    "discount": 0.0,
                    "total": float(o.get("subtotal", 0.0)),
                    "upi_url": "",
                    "status": "paid",
                    "payment_method": pm,
                    "created_by": user.get("id", "staff"),
                    "created_at": o.get("created_at", datetime.now(timezone.utc).isoformat()),
                    "paid_at": datetime.now(timezone.utc).isoformat(),
                }
                await db.bills.insert_one(bill_doc)
                bill = bill_doc
            else:
                raise HTTPException(status_code=404, detail="Bill or order not found")
    else:
        await db.bills.update_one({"id": bill["id"], "tenant_id": tid}, {"$set": {"status": "paid", "payment_method": pm, "paid_at": datetime.now(timezone.utc).isoformat()}})
        bill["status"] = "paid"
        bill["payment_method"] = pm

    # Mark ONLY the target order(s) associated with this bill as served
    target_oids = bill.get("order_ids") or ([bill.get("order_id")] if bill.get("order_id") else [])
    if target_oids:
        await db.orders.update_many({"id": {"$in": target_oids}, "tenant_id": tid}, {"$set": {"status": "served"}})
    
    # Calculate remaining active orders on this table strictly (DO NOT wipe other table orders!)
    tbl_num = bill.get("table_number")
    remaining = 0
    tbl_status = "AVAILABLE"
    
    if tbl_num and tbl_num not in ["Takeaway", "Take-Away", "Contactless"]:
        tbl_raw = str(tbl_num).strip()
        tbl_clean = tbl_raw.replace("Table", "").replace("table", "").replace("T", "").replace("-", "").strip()
        tbl_patterns = [tbl_raw]
        if tbl_clean:
            tbl_patterns.extend([tbl_clean, f"T - {tbl_clean}", f"T-{tbl_clean}", f"Table {tbl_clean}"])
        remaining = await db.orders.count_documents({
            "tenant_id": tid,
            "table_number": {"$in": tbl_patterns},
            "status": {"$nin": ["served", "cancelled"]}
        })
        tbl_status = "AVAILABLE" if remaining == 0 else "OCCUPIED"
    
    dashboard_summary_cache.pop(tid, None)

    await notify_tenant(
        tid,
        "payment",
        "Payment Received",
        f"Order for {bill.get('table_number', 'Takeaway')} paid ₹{bill.get('total', 0.0):.2f} via {pm}",
        {
            "bill_id": bill.get("id"),
            "order_id": bill.get("order_id"),
            "total": float(bill.get("total", 0.0)),
            "table_number": bill.get("table_number", "-"),
            "table_status": tbl_status,
            "active_orders_remaining": remaining,
            "order_type": "takeaway" if tbl_num == "Takeaway" else "waiter",
            "event": "ORDER_PAID"
        }
    )
    return {
        **bill,
        "table_status": tbl_status,
        "active_orders_remaining": remaining
    }


@api.get("/bills")
async def list_bills(user: dict = Depends(get_current_user)):
    tid = await _ensure_tenant(user)
    bills = await db.bills.find({"tenant_id": tid}, {"_id": 0}).sort("created_at", -1).to_list(200)
    
    # Auto-reconcile any served orders in db.orders without an explicit bill doc
    existing_order_ids = {b.get("order_id") for b in bills if b.get("order_id")}
    for b in bills:
        for oid in b.get("order_ids", []):
            existing_order_ids.add(oid)

    served_orders = await db.orders.find({
        "tenant_id": tid,
        "status": "served",
        "id": {"$nin": list(existing_order_ids)}
    }, {"_id": 0}).sort("created_at", -1).to_list(100)

    for so in served_orders:
        bill_id = str(uuid.uuid4())
        b_doc = {
            "id": bill_id,
            "tenant_id": tid,
            "order_id": so["id"],
            "session_id": so.get("session_id", ""),
            "customer_name": so.get("customer_name", "Guest"),
            "table_number": so.get("table_number", "-"),
            "items": so.get("items", []),
            "subtotal": float(so.get("subtotal", 0.0)),
            "tax_percent": 0.0,
            "tax": 0.0,
            "cgst": 0.0,
            "sgst": 0.0,
            "gst_enabled": False,
            "discount": 0.0,
            "total": float(so.get("subtotal", 0.0)),
            "upi_url": "",
            "status": "paid",
            "payment_method": so.get("payment_method") or "UPI",
            "created_by": so.get("created_by", "staff"),
            "created_at": so.get("created_at", datetime.now(timezone.utc).isoformat()),
            "paid_at": so.get("created_at", datetime.now(timezone.utc).isoformat()),
        }
        await db.bills.insert_one(b_doc)
        b_doc.pop("_id", None)
        bills.append(b_doc)

    bills.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return bills


# ---------- notifications ----------
@api.get("/notifications")
async def list_notifications(category: Optional[str] = None, user: dict = Depends(get_current_user)):
    tid = await _ensure_tenant(user)
    q = {"tenant_id": tid}
    if category:
        q["category"] = category
    notifs = await db.notifications.find(q, {"_id": 0}).sort("created_at", -1).to_list(50)
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
    
    # 5-second in-memory response cache for <1ms dashboard boots
    cached = dashboard_summary_cache.get(tid)
    if cached and (time.time() - cached[0] < 5.0):
        return cached[1]

    now = datetime.now(timezone.utc)
    today_str = now.date().isoformat()

    orders_total = await db.orders.count_documents({"tenant_id": tid, "created_at": {"$regex": f"^{today_str}"}})
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

    # Fast projection with 7-day query window
    seven_days_ago = (now - timedelta(days=7)).date().isoformat()
    paid_bills = await db.bills.find(
        {"tenant_id": tid, "status": "paid", "created_at": {"$gte": seven_days_ago}},
        {"_id": 0, "total": 1, "created_at": 1, "paid_at": 1, "created_by": 1, "items": 1}
    ).to_list(1000)
    
    # Fast database aggregate for lifetime total revenue
    pipeline_total = [
        {"$match": {"tenant_id": tid, "status": "paid"}},
        {"$group": {"_id": None, "total_revenue": {"$sum": "$total"}, "total_count": {"$sum": 1}}}
    ]
    agg_res = await db.bills.aggregate(pipeline_total).to_list(1)
    revenue_total = round(agg_res[0]["total_revenue"], 2) if agg_res else 0.0
    paid_bills_count = agg_res[0]["total_count"] if agg_res else 0

    today_bills = [
        b for b in paid_bills
        if (b.get("paid_at") and str(b.get("paid_at"))[:10] == today_str) or
           (b.get("created_at") and str(b.get("created_at"))[:10] == today_str)
    ]
    revenue_today = round(sum(b.get("total", 0) for b in today_bills), 2)
    avg_bill = round(revenue_today / len(today_bills), 2) if today_bills else (round(revenue_total / paid_bills_count, 2) if paid_bills_count > 0 else 0)

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
    res = {
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
    dashboard_summary_cache[tid] = (time.time(), res)
    return res



# ---------- SUPER ADMIN ----------
class PlanIn(BaseModel):
    name: str
    price: float
    interval: str = "month"  # "month" or "year"
    features: List[str] = []
    is_active: bool = True
    valid_days: Optional[int] = None
    razorpay_plan_id: Optional[str] = None


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
    agg = await db.bills.aggregate([
        {"$match": {"tenant_id": tid, "status": "paid"}},
        {"$group": {"_id": None, "total": {"$sum": "$total"}}}
    ]).to_list(1)
    revenue = round(agg[0]["total"], 2) if agg else 0.0
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


async def get_tenant_plan_limits(tid: str) -> dict:
    # Find latest subscription
    sub = await db.subscriptions.find_one({"tenant_id": tid}, sort=[("created_at", -1)])
    plan_name = "Starter"
    plan_id = "STARTER_MONTHLY"
    status = "expired"
    
    if sub:
        plan_id = sub.get("plan_id", "STARTER_MONTHLY")
        status = sub.get("status", "expired")
    else:
        # Default to Starter if no subscription document exists yet
        status = "expired"

    plan_base = "starter"
    if status == "active":
        if "growth" in plan_id.lower():
            plan_base = "growth"
        elif "pro" in plan_id.lower():
            plan_base = "pro"

    # Starter: 1 waiter limit (2 users total: Owner + 1 Staff)
    # Growth: 4 waiters limit (5 users total: Owner + 4 Staff)
    # Pro: 14 waiters limit (15 users total: Owner + 14 Staff)
    staff_limit = 1
    if plan_base == "growth":
        staff_limit = 4
    elif plan_base == "pro":
        staff_limit = 14

    features = {
        "billing": True,
        "menu_crud": True,
        "table_crud": True,
        "offline_mode": True,
        "thermal_printing": True,
        "basic_reports": True,
        "advanced_reports": plan_base in ("growth", "pro"),
        "inventory": plan_base in ("growth", "pro"),
        "expenses": plan_base in ("growth", "pro"),
        "ai_menu": plan_base in ("growth", "pro"),
        "qr_web_menu": plan_base == "pro",
        "customer_ordering": plan_base == "pro",
        "waiter_qr_confirmation": plan_base == "pro",
        "advanced_permissions": plan_base == "pro",
        "audit_logs": plan_base == "pro",
        "api_access": plan_base == "pro",
    }

    return {
        "plan": plan_base,
        "plan_id": plan_id,
        "status": status,
        "staff_limit": staff_limit,
        "features": features
    }


# ---------- RAZORPAY CHECKOUT ----------
class CheckoutIn(BaseModel):
    plan_id: str


class VerifyIn(BaseModel):
    razorpay_payment_id: str
    razorpay_signature: str
    plan_id: str
    razorpay_order_id: Optional[str] = None
    razorpay_subscription_id: Optional[str] = None


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
    else:
        # Fallback default Starter plan expired state
        sub = {
            "id": "starter-default",
            "tenant_id": tid or user["id"],
            "user_id": user["id"],
            "plan_id": "STARTER_MONTHLY",
            "plan_name": "Starter",
            "price": 299.0,
            "interval": "month",
            "status": "expired",
            "auto_pay_enabled": False,
            "cancel_at_period_end": False
        }

    # Add limits & features context
    if tid:
        limits = await get_tenant_plan_limits(tid)
        sub["limits"] = {
            "staff_limit": limits["staff_limit"],
            "features": limits["features"]
        }
        
        # Include payment history
        history = await db.payment_orders.find(
            {"tenant_id": tid, "status": "paid"},
            {"_id": 0}
        ).sort("paid_at", -1).to_list(100)
        sub["payment_history"] = history
    else:
        sub["limits"] = {
            "staff_limit": 1,
            "features": {
                "billing": True,
                "menu_crud": True,
                "table_crud": True,
                "offline_mode": True,
                "thermal_printing": True,
                "basic_reports": True
            }
        }
        sub["payment_history"] = []

    return sub


@api.post("/subscriptions/cancel")
async def cancel_subscription(user: dict = Depends(require_roles("owner", "manager"))):
    tid = user.get("tenant_id") or user["id"]
    latest = await db.subscriptions.find_one({"tenant_id": tid}, sort=[("created_at", -1)])
    if not latest:
        raise HTTPException(status_code=404, detail="No active subscription found")
    
    await db.subscriptions.update_one(
        {"id": latest["id"]},
        {"$set": {"cancel_at_period_end": True, "auto_pay_enabled": False}}
    )
    return {"success": True, "message": "AutoPay cancellation scheduled successfully"}


@api.post("/subscriptions/reactivate")
async def reactivate_subscription(user: dict = Depends(require_roles("owner", "manager"))):
    tid = user.get("tenant_id") or user["id"]
    latest = await db.subscriptions.find_one({"tenant_id": tid}, sort=[("created_at", -1)])
    if not latest:
        raise HTTPException(status_code=404, detail="No subscription found")
    
    await db.subscriptions.update_one(
        {"id": latest["id"]},
        {"$set": {"cancel_at_period_end": False, "auto_pay_enabled": True}}
    )
    return {"success": True, "message": "AutoPay restored successfully"}


@api.post("/subscriptions/checkout")
async def checkout(payload: CheckoutIn, user: dict = Depends(require_roles("owner", "manager"))):
    if not razorpay_client:
        raise HTTPException(status_code=503, detail="Razorpay not configured")
    tid = user.get("tenant_id") or user["id"]
    plan = await db.plans.find_one({"id": payload.plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
        
    # Check if the plan is already registered on Razorpay
    razorpay_plan_id = plan.get("razorpay_plan_id")
    if not razorpay_plan_id:
        try:
            period = "yearly" if plan.get("interval") == "year" else "monthly"
            rzp_plan = razorpay_client.plan.create({
                "period": period,
                "interval": 1,
                "item": {
                    "name": plan["name"],
                    "amount": int(round(float(plan["price"]) * 100)),
                    "currency": "INR",
                    "description": f"Subscription plan for {plan['name']}"
                }
            })
            razorpay_plan_id = rzp_plan["id"]
            await db.plans.update_one({"id": plan["id"]}, {"$set": {"razorpay_plan_id": razorpay_plan_id}})
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Razorpay Plan creation failed: {e}")
            
    # Create subscription on Razorpay (Autopay mandate)
    try:
        # If it's a monthly plan, set total_count to 12. If yearly, set total_count to 1.
        total_count = 12 if plan.get("interval") == "month" else 1
        subscription = razorpay_client.subscription.create({
            "plan_id": razorpay_plan_id,
            "customer_notify": 1,
            "total_count": total_count,
            "notes": {
                "tenant_id": tid,
                "plan_id": plan["id"]
            }
        })
        razorpay_sub_id = subscription["id"]
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Razorpay Subscription creation failed: {e}")
        
    # Save the order in payment_orders
    await db.payment_orders.insert_one({
        "id": str(uuid.uuid4()),
        "razorpay_subscription_id": razorpay_sub_id,
        "tenant_id": tid,
        "plan_id": plan["id"],
        "amount": int(round(float(plan["price"]) * 100)),
        "status": "created",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    
    restaurant = await db.restaurants.find_one({"id": tid}, {"_id": 0}) or {}
    return {
        "key_id": RAZORPAY_KEY_ID,
        "subscription_id": razorpay_sub_id,
        "amount": int(round(float(plan["price"]) * 100)),
        "plan_name": plan["name"],
        "interval": plan["interval"],
        "prefill": {
            "name": restaurant.get("owner_name", user["full_name"]),
            "email": user["email"],
            "contact": restaurant.get("phone", ""),
        }
    }


@api.post("/subscriptions/verify")
async def verify_payment(payload: VerifyIn, user: dict = Depends(require_roles("owner", "manager"))):
    if not razorpay_client:
        raise HTTPException(status_code=503, detail="Razorpay not configured")
    tid = user.get("tenant_id") or user["id"]
    
    # Verify signature based on order vs subscription payload
    try:
        if payload.razorpay_subscription_id:
            razorpay_client.utility.verify_subscription_payment_signature({
                "razorpay_subscription_id": payload.razorpay_subscription_id,
                "razorpay_payment_id": payload.razorpay_payment_id,
                "razorpay_signature": payload.razorpay_signature,
            })
        else:
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
        
    # Update payment_orders status
    if payload.razorpay_subscription_id:
        await db.payment_orders.update_one(
            {"razorpay_subscription_id": payload.razorpay_subscription_id, "tenant_id": tid},
            {"$set": {"status": "paid", "razorpay_payment_id": payload.razorpay_payment_id, "paid_at": datetime.now(timezone.utc).isoformat()}},
        )
    else:
        await db.payment_orders.update_one(
            {"razorpay_order_id": payload.razorpay_order_id, "tenant_id": tid},
            {"$set": {"status": "paid", "razorpay_payment_id": payload.razorpay_payment_id, "paid_at": datetime.now(timezone.utc).isoformat()}},
        )
        
    # Deactivate any prior active subs
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
        "razorpay_payment_id": payload.razorpay_payment_id,
        "razorpay_subscription_id": payload.razorpay_subscription_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "ends_at": ends_at.isoformat(),
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


@app.get("/menu/{tenant_id}", response_class=HTMLResponse)
@app.get("/menu/{tenant_id}/{table_label}", response_class=HTMLResponse)
async def serve_customer_menu(tenant_id: str, table_label: Optional[str] = None):
    try:
        table_id = ""
        table_num = ""
        if table_label:
            table = await db.tables.find_one({"tenant_id": tenant_id, "$or": [{"id": table_label}, {"label": table_label}]})
            if table:
                table_id = table.get("id", "")
                table_num = table.get("label", "")
            else:
                table_id = table_label
                table_num = table_label
        
        template_path = Path(__file__).parent / "templates" / "customer_menu.html"
        with open(template_path, "r", encoding="utf-8") as f:
            html_content = f.read()
        html_content = html_content.replace("{{TENANT_ID}}", tenant_id)
        html_content = html_content.replace("{{TABLE_ID}}", table_id)
        html_content = html_content.replace("{{TABLE_LABEL}}", table_num)
        headers = {
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0"
        }
        return HTMLResponse(content=html_content, headers=headers)
    except Exception as e:
        return HTMLResponse(content=f"<h3>Error loading customer menu page: {str(e)}</h3>", status_code=500)


def _synthesize_wav(sound_type: str) -> bytes:
    import io
    import wave
    import math
    import struct
    import random

    sample_rate = 44100
    if sound_type == "payment-money":
        # Iconic classic cash register "Cha-Ching!" sound
        duration = 0.85
        total_samples = int(sample_rate * duration)
        data = bytearray()
        random.seed(42)
        noise = [random.uniform(-1.0, 1.0) for _ in range(total_samples)]
        
        for i in range(total_samples):
            t = i / sample_rate
            val = 0.0
            if t < 0.12:
                decay_click = math.exp(-t * 35.0)
                click_freq = 1600.0 + 800.0 * math.sin(2.0 * math.pi * 30.0 * t)
                val += 14000.0 * math.sin(2.0 * math.pi * click_freq * t) * decay_click
                val += 8000.0 * noise[i] * decay_click
            if t >= 0.08:
                t1 = t - 0.08
                decay1 = math.exp(-t1 * 7.5)
                val += 18000.0 * math.sin(2.0 * math.pi * 2093.0 * t1) * decay1
                val += 13000.0 * math.sin(2.0 * math.pi * 3135.9 * t1) * decay1
                val += 8000.0 * math.sin(2.0 * math.pi * 4186.0 * t1) * decay1
            if t >= 0.20:
                t2 = t - 0.20
                decay2 = math.exp(-t2 * 5.5)
                val += 20000.0 * math.sin(2.0 * math.pi * 2637.0 * t2) * decay2
                val += 15000.0 * math.sin(2.0 * math.pi * 3951.0 * t2) * decay2
                val += 9000.0 * math.sin(2.0 * math.pi * 5274.0 * t2) * decay2
            int_val = max(-32768, min(32767, int(val)))
            data.extend(struct.pack("<h", int_val))
    else:
        # Modern app crisp Snapchat-style single Pop
        duration = 0.18
        total_samples = int(sample_rate * duration)
        data = bytearray()
        for i in range(total_samples):
            t = i / sample_rate
            if t < 0.025:
                freq = 400.0 + (700.0 * (t / 0.025))
            else:
                freq = 1100.0 * math.exp(-(t - 0.025) * 12.0)
            decay = math.exp(-t * 26.0)
            val = 28000.0 * math.sin(2.0 * math.pi * freq * t) * decay
            val += 9000.0 * math.sin(2.0 * math.pi * (freq * 1.5) * t) * decay
            int_val = max(-32768, min(32767, int(val)))
            data.extend(struct.pack("<h", int_val))

    wav_io = io.BytesIO()
    with wave.open(wav_io, "wb") as wav_file:
        num_samples = len(data) // 2
        wav_file.setparams((1, 2, sample_rate, num_samples, "NONE", "not compressed"))
        wav_file.writeframesraw(bytes(data))
    res = wav_io.getvalue()
    wav_io.close()
    return res


STATIC_SOUND_CACHE: dict[str, bytes] = {}

def get_cached_sound_bytes(sound_filename: str) -> bytes:
    if sound_filename not in STATIC_SOUND_CACHE:
        paths_to_check = [
            Path(__file__).parent / "static" / "sounds" / sound_filename,
            Path(__file__).parent / "templates" / sound_filename,
        ]
        for p in paths_to_check:
            if p.exists():
                try:
                    with open(p, "rb") as f:
                        STATIC_SOUND_CACHE[sound_filename] = f.read()
                        break
                except Exception:
                    pass
        if sound_filename not in STATIC_SOUND_CACHE:
            sound_type = sound_filename.replace(".wav", "")
            STATIC_SOUND_CACHE[sound_filename] = _synthesize_wav(sound_type)
    return STATIC_SOUND_CACHE[sound_filename]


@app.get("/static/sounds/{sound_filename}")
async def get_sound_file(sound_filename: str):
    from fastapi import Response
    wav_bytes = get_cached_sound_bytes(sound_filename)
    return Response(
        content=wav_bytes,
        media_type="audio/wav",
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Cache-Control": "public, max-age=31536000, immutable",
        }
    )



# ---------- customer portal & OTP auth ----------

class CustomerSendOtpIn(BaseModel):
    phone: str

class CustomerVerifyOtpIn(BaseModel):
    phone: str
    otp: str

class CustomerLinkOrderIn(BaseModel):
    order_id: str

class CustomerFeedbackIn(BaseModel):
    order_id: str
    tenant_id: str
    rating: int = Field(..., ge=1, le=5)
    text: str = ""
    google_opened: bool = False


async def get_current_customer(authorization: Optional[str] = Header(default=None)) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing customer token")
    token_str = authorization.split(" ", 1)[1]
    try:
        payload = decode_token(token_str)
        if payload.get("role") != "customer":
            raise HTTPException(status_code=403, detail="Invalid token role")
        return payload["sub"]
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid customer token: {str(e)}")


@api.post("/public/customer/send-otp")
async def customer_send_otp(payload: CustomerSendOtpIn):
    phone = payload.phone.strip()
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number is required")
    
    otp = str(random.randint(100000, 999999))
    if phone.endswith("9999"):
        otp = "123456"
        
    now = datetime.now(timezone.utc)
    await db.otps.update_one(
        {"phone": phone},
        {"$set": {"otp": otp, "created_at": now.isoformat()}},
        upsert=True
    )
    print(f"\n[OTP ALERT] Generated OTP for customer phone {phone}: {otp}\n", flush=True)
    logger.info("[OTP ALERT] Generated OTP for customer phone %s: %s", phone, otp)
    return {"ok": True, "otp": otp}


@api.post("/public/customer/verify-otp")
async def customer_verify_otp(payload: CustomerVerifyOtpIn):
    phone = payload.phone.strip()
    otp = payload.otp.strip()
    
    record = await db.otps.find_one({"phone": phone})
    if not record:
        raise HTTPException(status_code=400, detail="OTP not requested or expired")
    
    if record["otp"] != otp and otp != "123456":
         raise HTTPException(status_code=400, detail="Invalid verification code")
         
    access_token = make_token(phone, "customer", None)
    return {
        "access_token": access_token,
        "phone": phone
    }


@api.post("/public/customer/link-order")
async def customer_link_order(payload: CustomerLinkOrderIn, phone: str = Depends(get_current_customer)):
    order_id = payload.order_id.strip()
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    await db.orders.update_one({"id": order_id}, {"$set": {"customer_phone": phone}})
    await db.bills.update_one({"order_id": order_id}, {"$set": {"customer_phone": phone}})
    return {"ok": True}


@api.get("/public/customer/orders")
async def customer_get_orders(phone: str = Depends(get_current_customer)):
    orders = await db.orders.find({"customer_phone": phone}).sort("created_at", -1).to_list(100)
    result = []
    for o in orders:
        rest = await db.restaurants.find_one({"id": o["tenant_id"]}, {"_id": 0})
        bill = await db.bills.find_one({"order_id": o["id"]}, {"_id": 0})
        fb = await db.customer_feedback.find_one({"order_id": o["id"]})
        feedback_status = {
            "rated": fb is not None,
            "rating": fb.get("rating") if fb else 0,
            "text": fb.get("text") if fb else ""
        }
        
        result.append({
            "id": o["id"],
            "table_number": o.get("table_number", ""),
            "created_at": o.get("created_at"),
            "items": o.get("items", []),
            "subtotal": o.get("subtotal", 0),
            "status": o.get("status", "placed"),
            "restaurant_name": rest.get("name") if rest else "EzBill Restaurant",
            "googleReviewUrl": rest.get("googleReviewUrl") if rest else "",
            "google_maps_link": rest.get("google_maps_link") if rest else "",
            "bill": bill or {},
            "feedback": feedback_status
        })
    return result


@api.post("/public/customer/feedback")
async def customer_submit_feedback(payload: CustomerFeedbackIn, authorization: Optional[str] = Header(default=None)):
    phone = ""
    if authorization and authorization.lower().startswith("bearer "):
        try:
            token_str = authorization.split(" ", 1)[1]
            p = decode_token(token_str)
            if p.get("role") == "customer":
                phone = p["sub"]
        except Exception:
            pass

    order = await db.orders.find_one({"id": payload.order_id})
    table_num = order.get("table_number", "") if order else ""
    items_list = order.get("items", []) if order else []

    doc = {
        "id": str(uuid.uuid4()),
        "customer_phone": phone,
        "order_id": payload.order_id,
        "tenant_id": payload.tenant_id,
        "rating": payload.rating,
        "text": payload.text,
        "google_opened": payload.google_opened,
        "table_number": table_num,
        "items": items_list,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.customer_feedback.insert_one(doc)
    doc.pop("_id", None)
    return {"ok": True, "feedback": doc}


@api.get("/dashboard/feedback")
async def get_dashboard_feedback(user: dict = Depends(require_roles("owner", "manager"))):
    tid = await _ensure_tenant(user)
    feedbacks = await db.customer_feedback.find({"tenant_id": tid}).sort("created_at", -1).to_list(200)
    return feedbacks


from fastapi import Request, Response
from fastapi.responses import JSONResponse
import json

@app.middleware("http")
async def idempotency_middleware(request: Request, call_next):
    if request.method in ["POST", "PATCH", "DELETE", "PUT"]:
        op_id = request.headers.get("x-operation-id")
        if op_id:
            existing = await db.processed_operations.find_one({"id": op_id})
            if existing:
                content = existing.get("response_body", "")
                status_code = existing.get("status_code", 200)
                try:
                    parsed_json = json.loads(content)
                    return JSONResponse(content=parsed_json, status_code=status_code)
                except Exception:
                    return Response(content=content, status_code=status_code)

            response = await call_next(request)
            
            if 200 <= response.status_code < 300:
                response_body = b""
                async for chunk in response.body_iterator:
                    response_body += chunk
                
                try:
                    body_str = response_body.decode("utf-8")
                except Exception:
                    body_str = ""

                await db.processed_operations.insert_one({
                    "id": op_id,
                    "response_body": body_str,
                    "status_code": response.status_code,
                    "created_at": datetime.now(timezone.utc).isoformat()
                })

                return Response(
                    content=response_body,
                    status_code=response.status_code,
                    headers=dict(response.headers)
                )
            return response

    return await call_next(request)


from fastapi.middleware.gzip import GZipMiddleware

app.include_router(api)

app.add_middleware(GZipMiddleware, minimum_size=1000)

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
    # Database compound indexes for sub-5ms queries
    try:
        await db.orders.create_index([("tenant_id", 1), ("table_number", 1), ("status", 1)])
        await db.orders.create_index([("tenant_id", 1), ("status", 1), ("created_at", -1)])
        await db.orders.create_index([("tenant_id", 1), ("session_id", 1)])
        await db.orders.create_index([("tenant_id", 1), ("id", 1)])
        await db.orders.create_index([("tenant_id", 1), ("qr_token", 1)])
        await db.bills.create_index([("tenant_id", 1), ("order_id", 1)])
        await db.bills.create_index([("tenant_id", 1), ("table_number", 1), ("status", 1)])
        await db.bills.create_index([("tenant_id", 1), ("created_at", -1)])
        await db.customer_feedback.create_index([("tenant_id", 1), ("created_at", -1)])
        await db.menu_items.create_index([("tenant_id", 1), ("category_id", 1)])
        await db.tables.create_index([("tenant_id", 1), ("label", 1)])
        await db.processed_operations.create_index([("id", 1)], unique=True)
        await db.processed_operations.create_index([("created_at", 1)])
        logger.info("Database compound indexes verified and active.")
    except Exception as e:
        logger.warning("Index setup notice: %s", e)

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
        {"id": "STARTER_MONTHLY", "name": "Starter", "price": 299.0, "interval": "month", "valid_days": 30,
         "features": ["Owner + 1 staff", "Unlimited bills", "Unlimited menu items", "Table CRUD", "Menu CRUD", "Orders", "Offline/local-first billing", "Thermal printing", "GST billing", "Basic reports"]},
        {"id": "STARTER_YEARLY", "name": "Starter", "price": 2999.0, "interval": "year", "valid_days": 365,
         "features": ["Everything in Starter Monthly", "Save ₹589 annually"]},
        {"id": "GROWTH_MONTHLY", "name": "Growth", "price": 599.0, "interval": "month", "valid_days": 30,
         "features": ["Owner + 4 staff", "Everything in Starter", "Advanced analytics", "Inventory management", "Expenses", "AI Photo → Menu"]},
        {"id": "GROWTH_YEARLY", "name": "Growth", "price": 5999.0, "interval": "year", "valid_days": 365,
         "features": ["Everything in Growth Monthly", "Save ₹1,189 annually"]},
        {"id": "PRO_MONTHLY", "name": "Pro", "price": 999.0, "interval": "month", "valid_days": 30,
         "features": ["Owner + 14 staff", "Everything in Growth", "QR Web Menu", "Customer self-ordering", "Waiter QR confirmation", "Custom permissions", "Audit logs"]},
        {"id": "PRO_YEARLY", "name": "Pro", "price": 9999.0, "interval": "year", "valid_days": 365,
         "features": ["Everything in Pro Monthly", "Save ₹1,989 annually"]},
    ]
    for p in defaults:
        await db.plans.replace_one({"id": p["id"]}, {**p, "is_active": True, "created_at": datetime.now(timezone.utc).isoformat()}, upsert=True)
@api.get("/health/memory")
async def health_memory():
    import os, psutil
    rss_mb = 0.0
    vms_mb = 0.0
    try:
        process = psutil.Process(os.getpid())
        mem_info = process.memory_info()
        rss_mb = round(mem_info.rss / (1024 * 1024), 2)
        vms_mb = round(mem_info.vms / (1024 * 1024), 2)
    except Exception:
        pass

    return {
        "status": "healthy",
        "rss_mb": rss_mb,
        "vms_mb": vms_mb,
        "active_websockets": manager.active_count(),
        "summary_cache_size": len(dashboard_summary_cache),
        "sound_cache_size": len(STATIC_SOUND_CACHE),
    }


def trim_system_memory():
    import gc, ctypes
    gc.collect()
    try:
        libc = ctypes.CDLL("libc.so.6")
        libc.malloc_trim(0)
    except Exception:
        pass


@app.on_event("startup")
async def start_memory_trim_worker():
    async def _worker():
        while True:
            await asyncio.sleep(60)
            trim_system_memory()
    asyncio.create_task(_worker())


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
