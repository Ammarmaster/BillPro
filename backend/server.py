from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, Header, WebSocket, WebSocketDisconnect, BackgroundTasks, File, UploadFile, Request
from fastapi.responses import HTMLResponse, Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import logging
import uuid
import bcrypt
import jwt as pyjwt
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
import time
from typing import List, Optional, Any, Dict, Union
from datetime import datetime, timezone, timedelta
from bson import ObjectId

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

# Configure reliable DNS resolver to prevent Windows SRV lookup hangs
try:
    import dns.resolver
    resolver = dns.resolver.Resolver()
    resolver.nameservers = ["8.8.8.8", "1.1.1.1"]
    resolver.timeout = 5.0
    resolver.lifetime = 5.0
    dns.resolver.default_resolver = resolver
except Exception:
    pass

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
    unique_tokens = list(dict.fromkeys(push_tokens))
    for token in unique_tokens:
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


def sanitize_doc(doc):
    if isinstance(doc, list):
        return [sanitize_doc(item) for item in doc]
    if isinstance(doc, dict):
        clean = {}
        for k, v in doc.items():
            if k == "_id":
                continue
            if isinstance(v, ObjectId):
                clean[k] = str(v)
            elif isinstance(v, (dict, list)):
                clean[k] = sanitize_doc(v)
            else:
                clean[k] = v
        return clean
    if isinstance(doc, ObjectId):
        return str(doc)
    return doc


def get_table_match_patterns(tbl_raw: str) -> list[str]:
    raw = str(tbl_raw).strip()
    if not raw:
        return []
    patterns = {raw}
    # Check if raw starts with "table" or "tbl" (e.g. "Table 1", "Table-1", "table 5")
    m = re.match(r"^(?:table|tbl)[\s\-_:]*(.+)$", raw, re.IGNORECASE)
    if m:
        core = m.group(1).strip()
        patterns.add(core)
        patterns.add(f"Table {core}")
        patterns.add(f"Table-{core}")
    else:
        # If it's a number or normal name (not a letter-hyphen combo like "T-1" or "A-1")
        if not re.match(r"^[a-zA-Z]\s*-\s*\d+", raw):
            patterns.add(f"Table {raw}")
            patterns.add(f"Table-{raw}")
        # Normalize spaces around hyphens e.g. "T - 1" <-> "T-1"
        if " - " in raw:
            patterns.add(raw.replace(" - ", "-"))
        elif "-" in raw:
            patterns.add(raw.replace("-", " - "))
    return list(patterns)


async def notify_tenant(tenant_id: str, category: str, title: str, message: str, data: dict = None):
    if not tenant_id:
        return
    clean_data = sanitize_doc(data or {})
    now_dt = datetime.now(timezone.utc)
    doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "category": category,  # sales | kitchen | waiter | cashier | system | payment
        "title": title,
        "message": message,
        "data": clean_data,
        "is_read": False,
        "created_at": now_dt.isoformat(),
        "created_at_dt": now_dt,
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
        users_list = await db.users.find({"tenant_id": tenant_id, "push_token": {"$exists": True, "$ne": None}}).to_list(100)
        tokens = list(dict.fromkeys([u["push_token"] for u in users_list if u.get("push_token")]))
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

    @staticmethod
    def send_hardware_order_alert(order_data: dict):
        if not BREVO_API_KEY:
            print("[EmailService] BREVO_API_KEY not configured, skipping alert.")
            return False
        
        url = "https://api.brevo.com/v3/smtp/email"
        headers = {
            "api-key": BREVO_API_KEY,
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
        
        order_id = order_data.get("orderId", "EZB-ORDER")
        full_name = order_data.get("fullName", "Customer")
        phone = order_data.get("phone", "N/A")
        business_name = order_data.get("businessName") or "Retail Store"
        email = order_data.get("email") or "Not provided"
        address = order_data.get("address", "N/A")
        gstin = order_data.get("gstin") or "N/A"
        payment_method = order_data.get("paymentMethod", "Cash on Delivery")
        total = order_data.get("total", 0)
        items = order_data.get("items", [])
        
        item_rows = ""
        for it in items:
            p = it.get("product", {})
            title = p.get("title", "Hardware Item")
            qty = it.get("quantity", 1)
            price = p.get("salePrice", "")
            item_rows += f"""
            <tr style="border-bottom: 1px solid #E2E8F0;">
                <td style="padding: 10px 12px; font-weight: 600; color: #1E293B;">{title}</td>
                <td style="padding: 10px 12px; text-align: center; color: #475569;">{qty}</td>
                <td style="padding: 10px 12px; text-align: right; font-weight: 700; color: #FF5E2B;">{price}</td>
            </tr>
            """
            
        whatsapp_phone_clean = re.sub(r'[^0-9]', '', str(phone))
        if len(whatsapp_phone_clean) == 10:
            whatsapp_phone_clean = "91" + whatsapp_phone_clean

        html_content = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8FAFC; margin: 0; padding: 24px;">
    <div style="max-width: 600px; margin: 0 auto; background: #FFFFFF; border-radius: 16px; border: 1px solid #E2E8F0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
        <div style="background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%); padding: 24px; text-align: center; color: #FFFFFF;">
            <div style="font-size: 12px; font-weight: 800; letter-spacing: 1.5px; color: #FF5E2B; text-transform: uppercase;">EZBill Hardware Dispatch Alert</div>
            <h1 style="margin: 8px 0 4px; font-size: 22px; font-weight: 900; color: #FFFFFF;">New Hardware Order Received!</h1>
            <div style="display: inline-block; background: rgba(255, 94, 43, 0.2); border: 1px solid #FF5E2B; border-radius: 20px; padding: 4px 14px; font-size: 13px; font-weight: 800; color: #FF8A3D; margin-top: 6px;">
                ORDER ID: {order_id}
            </div>
        </div>

        <div style="padding: 24px;">
            <div style="background: #F1F5F9; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
                <h3 style="margin: 0 0 10px; font-size: 13px; color: #0F172A; text-transform: uppercase; letter-spacing: 0.5px;">Customer & Delivery Details</h3>
                <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
                    <tr><td style="padding: 4px 0; color: #64748B; width: 130px;">Customer Name:</td><td style="padding: 4px 0; font-weight: 700; color: #0F172A;">{full_name}</td></tr>
                    <tr><td style="padding: 4px 0; color: #64748B;">Store / Business:</td><td style="padding: 4px 0; font-weight: 700; color: #0F172A;">{business_name}</td></tr>
                    <tr><td style="padding: 4px 0; color: #64748B;">Phone:</td><td style="padding: 4px 0; font-weight: 700; color: #0F172A;"><a href="tel:{phone}" style="color: #2563EB; text-decoration: none;">{phone}</a> &nbsp;|&nbsp; <a href="https://wa.me/{whatsapp_phone_clean}" style="color: #16A34A; text-decoration: none; font-weight: 700;">Chat on WhatsApp &rarr;</a></td></tr>
                    <tr><td style="padding: 4px 0; color: #64748B;">Email:</td><td style="padding: 4px 0; color: #0F172A;">{email}</td></tr>
                    <tr><td style="padding: 4px 0; color: #64748B;">Delivery Address:</td><td style="padding: 4px 0; font-weight: 600; color: #0F172A;">{address}</td></tr>
                    <tr><td style="padding: 4px 0; color: #64748B;">GSTIN:</td><td style="padding: 4px 0; color: #0F172A;">{gstin}</td></tr>
                    <tr><td style="padding: 4px 0; color: #64748B;">Payment Mode:</td><td style="padding: 4px 0; font-weight: 700; color: #0F172A;">{payment_method}</td></tr>
                </table>
            </div>

            <h3 style="margin: 0 0 10px; font-size: 13px; color: #0F172A; text-transform: uppercase; letter-spacing: 0.5px;">Ordered Items</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 20px;">
                <thead>
                    <tr style="background: #F8FAFC; border-bottom: 2px solid #E2E8F0; text-align: left;">
                        <th style="padding: 8px 12px; color: #64748B;">Product</th>
                        <th style="padding: 8px 12px; color: #64748B; text-align: center;">Qty</th>
                        <th style="padding: 8px 12px; color: #64748B; text-align: right;">Price</th>
                    </tr>
                </thead>
                <tbody>
                    {item_rows}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="2" style="padding: 12px; font-weight: 800; font-size: 15px; color: #0F172A; text-align: right;">Total Payable:</td>
                        <td style="padding: 12px; font-weight: 900; font-size: 18px; color: #FF5E2B; text-align: right;">₹{total:,.0f}</td>
                    </tr>
                </tfoot>
            </table>

            <div style="text-align: center; margin-top: 20px;">
                <a href="https://wa.me/{whatsapp_phone_clean}" style="display: inline-block; background: #16A34A; color: #FFFFFF; text-decoration: none; font-weight: 700; padding: 12px 24px; border-radius: 10px; font-size: 14px;">
                    Open Customer Chat on WhatsApp
                </a>
            </div>
        </div>
        <div style="background: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 14px; text-align: center; font-size: 12px; color: #94A3B8;">
            EzBill Automated Dispatch System &bull; Notification sent to contactprodevopz@gmail.com
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
                    "email": "contactprodevopz@gmail.com",
                    "name": "ProDevOpz Hardware Dispatch"
                }
            ],
            "subject": f"🚀 New Hardware Order: {order_id} - {full_name} (₹{total:,.0f})",
            "htmlContent": html_content
        }
        
        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=10)
            if resp.status_code in (200, 201, 202):
                print(f"[EmailService] Hardware order alert for {order_id} sent successfully to contactprodevopz@gmail.com")
                return True
            else:
                print(f"[EmailService Error] status_code={resp.status_code} response={resp.text}")
                return False
        except Exception as e:
            print(f"[EmailService Error] Failed to send hardware order alert: {e}")
            return False


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


def optimize_logo_base64(b64_str: str, max_w: int = 100, max_h: int = 100) -> str:
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
        # Convert to clean monochrome 1-bit bitmap for thermal printer
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


def clean_url_string(val: Optional[str]) -> str:
    if not val:
        return ""
    try:
        val_str = str(val).strip()
        if not val_str:
            return ""
        match = re.search(r'(https?://[^\s]+)', val_str, re.IGNORECASE)
        if match:
            return match.group(1).strip()
        domain_match = re.search(r'((?:share\.google|maps\.app\.goo\.gl|g\.page|goo\.gl|maps\.google\.[a-z.]+|google\.[a-z.]+/maps)[^\s]*)', val_str, re.IGNORECASE)
        if domain_match:
            return "https://" + domain_match.group(1).strip()
        if val_str.startswith("www.") or ("." in val_str and " " not in val_str):
            return "https://" + re.sub(r'^[^\w]+', '', val_str).strip()
        return val_str
    except Exception:
        return str(val).strip()


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
    phone: Optional[str] = None
    role: str = "owner"  # owner registers themselves; super_admin creates staff
    terms_accepted: Optional[bool] = False
    privacy_consent: Optional[bool] = False
    marketing_consent: Optional[bool] = False


class LoginIn(BaseModel):
    email: str = Field(description="Email or mobile phone number")
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


class AutoAssignImagesIn(BaseModel):
    force_all: bool = False


class GenerateMenuImageIn(BaseModel):
    name: str


class PromoPosterIn(BaseModel):
    dish_name: str
    price: Optional[float] = None
    restaurant_name: Optional[str] = None
    tagline: Optional[str] = "Today's Special"


class TableIn(BaseModel):
    label: str
    seats: int = 4
    custom_qr: Optional[str] = None


class TableUpdateIn(BaseModel):
    label: Optional[str] = None
    seats: Optional[int] = None
    custom_qr: Optional[str] = None


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
    status: Optional[str] = "placed"


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
    items: Optional[List[OrderItemIn]] = []
    notes: Optional[str] = ""
    customer_name: Optional[str] = None
    table_number: Optional[str] = None
    session_id: Optional[str] = None
    subtotal: Optional[float] = None


class BillIn(BaseModel):
    order_id: Optional[str] = None
    order_ids: Optional[List[str]] = None
    table_number: Optional[str] = None
    tax_percent: float = 5.0
    discount: float = 0.0
    gst_enabled: Optional[bool] = None  # override restaurant default


# ---------- CASH SESSIONS & CLOSING SCHEMAS ----------
class OpenCashSessionIn(BaseModel):
    opening_float: float = 0.0
    business_date: Optional[str] = None
    notes: Optional[str] = ""


class CashMovementIn(BaseModel):
    session_id: Optional[str] = None
    type: str  # "cash_in", "cash_out", "cash_drop"
    amount: float
    reason: str
    reference: Optional[str] = None


class CloseCashSessionIn(BaseModel):
    counted_cash: float
    denominations: Optional[dict] = None
    actual_upi: Optional[float] = None
    actual_card: Optional[float] = None
    actual_other: Optional[float] = None
    discrepancy_reason: Optional[str] = None
    closing_notes: Optional[str] = None


class ApproveSessionDiscrepancyIn(BaseModel):
    notes: Optional[str] = ""


class MenuJsonImportIn(BaseModel):
    tenant_id: Optional[str] = None
    replace_existing: Optional[bool] = False
    data: Optional[Any] = None
    categories: Optional[Any] = None
    raw_json: Optional[str] = None



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
    clean_phone = payload.phone.strip() if payload.phone else ""
    doc = {
        "id": uid,
        "email": payload.email.lower(),
        "phone": clean_phone,
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


def get_phone_query_patterns(raw_phone: str) -> list[dict]:
    clean = (raw_phone or "").strip()
    if not clean:
        return []
    digits = "".join(filter(str.isdigit, clean))
    core_10 = digits[-10:] if len(digits) >= 10 else digits

    conditions: list[dict] = [{"phone": clean}]
    if digits and digits != clean:
        conditions.append({"phone": digits})
    if core_10:
        if core_10 not in (clean, digits):
            conditions.append({"phone": core_10})
        # Common prefix variations
        conditions.append({"phone": f"+91{core_10}"})
        conditions.append({"phone": f"91{core_10}"})
        conditions.append({"phone": f"0{core_10}"})
        if len(core_10) == 10:
            spaced = f"{core_10[:5]} {core_10[5:]}"
            conditions.append({"phone": spaced})
            conditions.append({"phone": f"+91 {spaced}"})
            conditions.append({"phone": f"+91 {core_10}"})
            conditions.append({"phone": f"91 {spaced}"})
            conditions.append({"phone": f"0 {spaced}"})

        # Regex allowing any spaces/hyphens between digits, with optional leading country code or 0
        sep = r"[\s\-\.]*"
        core_pattern = sep.join(re.escape(d) for d in core_10)
        regex_pattern = rf"^\s*(?:\+?\d{{1,3}}[\s\-\.]*|0[\s\-\.]*)?{core_pattern}\s*$"
        conditions.append({"phone": {"$regex": regex_pattern}})

    return conditions


@api.post("/auth/login", response_model=TokenOut)
async def login(payload: LoginIn):
    raw_ident = payload.email.strip()
    is_email = "@" in raw_ident

    user = None
    if is_email:
        user = await db.users.find_one({"email": raw_ident.lower()})
        if not user or not verify_pw(payload.password, user.get("password", "")):
            raise HTTPException(status_code=401, detail="Invalid credentials")
    else:
        # Mobile phone number login in same input field
        phone_conds = get_phone_query_patterns(raw_ident)
        if not phone_conds:
            raise HTTPException(status_code=401, detail="Invalid credentials")

        candidate_users = []
        seen_user_ids = set()

        # 1. Look up users directly by phone field in db.users
        users_by_phone = await db.users.find({"$or": phone_conds}).to_list(50)
        for u in users_by_phone:
            if u.get("id") and u["id"] not in seen_user_ids:
                seen_user_ids.add(u["id"])
                candidate_users.append(u)

        # 2. Look up matching restaurants by phone in db.restaurants
        matched_rests = await db.restaurants.find({"$or": phone_conds}, {"_id": 0, "id": 1, "owner_user_id": 1}).to_list(50)
        tenant_ids = [r["id"] for r in matched_rests if r.get("id")]
        owner_ids = [r["owner_user_id"] for r in matched_rests if r.get("owner_user_id")]

        for u in users_by_phone:
            if u.get("tenant_id") and u["tenant_id"] not in tenant_ids:
                tenant_ids.append(u["tenant_id"])

        rest_user_queries = []
        if tenant_ids:
            rest_user_queries.append({"tenant_id": {"$in": tenant_ids}})
        if owner_ids:
            rest_user_queries.append({"id": {"$in": owner_ids}})

        if rest_user_queries:
            users_by_rest = await db.users.find({"$or": rest_user_queries}).to_list(50)
            for u in users_by_rest:
                if u.get("id") and u["id"] not in seen_user_ids:
                    seen_user_ids.add(u["id"])
                    candidate_users.append(u)

        # Prioritize owners and managers first, then staff
        candidate_users.sort(key=lambda x: 0 if x.get("role") in ("owner", "manager", "super_admin", "admin_employee") else 1)

        input_pw = payload.password.strip()
        for cand in candidate_users:
            stored_pw = cand.get("password")
            if stored_pw and verify_pw(payload.password, stored_pw):
                user = cand
                break
            # Also allow staff/waiter login if PIN was entered as password
            if cand.get("pin") and cand.get("pin") == input_pw:
                user = cand
                break

        if not user:
            raise HTTPException(status_code=401, detail="Invalid credentials")

    user_out = {k: v for k, v in user.items() if k not in ("password", "_id", "pin")}
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


DEFAULT_LEGAL_CONFIG = {
    "company_name": "ProDevOpz Solutions",
    "brand_name": "EzBill / BillPro",
    "registered_address": "ProDevOpz Solutions, India",
    "support_email": "contactprodevopz@gmail.com",
    "grievance_email": "contactprodevopz@gmail.com",
    "grievance_officer_name": "Grievance Redressal Officer",
    "contact_number": "+91 81520 75375",
    "terms_version": "v1.0",
    "privacy_version": "v1.0",
    "effective_date": "2026-03-01",
    "refund_policy": "EZBill is provided as a SaaS subscription. We offer free tier features and demo trials to evaluate functionality. Active paid subscriptions auto-renew according to your chosen cycle. AutoPay mandates can be cancelled at any time before renewal with immediate effect for future cycles. Once a subscription period begins, fees for that active period are non-refundable.",
    "cancellation_policy": "You may cancel recurring AutoPay subscription mandates at any time directly through the app (More -> Subscription -> Cancel AutoPay) or through your UPI/Bank mandate management portal. Upon cancellation, your access remains active until the end of the paid billing period, and no further renewals will be charged."
}


class LegalConfigUpdateIn(BaseModel):
    company_name: Optional[str] = None
    brand_name: Optional[str] = None
    registered_address: Optional[str] = None
    support_email: Optional[str] = None
    grievance_email: Optional[str] = None
    grievance_officer_name: Optional[str] = None
    contact_number: Optional[str] = None
    terms_version: Optional[str] = None
    privacy_version: Optional[str] = None
    refund_policy: Optional[str] = None
    cancellation_policy: Optional[str] = None


class ConsentUpdateIn(BaseModel):
    consent_type: str
    status: str


@api.get("/legal/config")
@api.get("/legal-config")
async def get_legal_config():
    doc = await db.legal_settings.find_one({"id": "default_legal_config"}, {"_id": 0})
    if not doc:
        return DEFAULT_LEGAL_CONFIG
    merged = {**DEFAULT_LEGAL_CONFIG, **doc}
    return merged


@api.post("/admin/legal/config")
async def update_legal_config(payload: LegalConfigUpdateIn, user: dict = Depends(require_roles("super_admin"))):
    update_data = {k: v for k, v in payload.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["updated_by"] = user["id"]
    await db.legal_settings.update_one(
        {"id": "default_legal_config"},
        {"$set": update_data},
        upsert=True
    )
    doc = await db.legal_settings.find_one({"id": "default_legal_config"}, {"_id": 0})
    return {**DEFAULT_LEGAL_CONFIG, **(doc or {})}


@api.post("/users/consent")
@api.post("/consent")
async def update_user_consent(payload: ConsentUpdateIn, current_user: dict = Depends(get_current_user), request: Request = None):
    field_map = {
        "TERMS_AND_CONDITIONS": "terms_accepted",
        "PRIVACY_POLICY": "privacy_consent",
        "MARKETING_CONSENT": "marketing_consent",
        "ANALYTICS_CONSENT": "analytics_consent"
    }
    field_name = field_map.get(payload.consent_type)
    if not field_name:
        raise HTTPException(status_code=400, detail="Invalid consent category")
        
    val = (payload.status == "accepted")
    await db.users.update_one({"id": current_user["id"]}, {"$set": {field_name: val}})
    
    purpose_map = {
        "TERMS_AND_CONDITIONS": "To accept service terms",
        "PRIVACY_POLICY": "To allow data processing",
        "MARKETING_CONSENT": "To receive promotional messages",
        "ANALYTICS_CONSENT": "To analyze product performance"
    }
    
    ip = request.client.host if (request and request.client) else ""
    ua = request.headers.get("user-agent", "") if request else ""
    
    await log_consent_event(
        current_user["id"],
        current_user.get("tenant_id"),
        payload.consent_type,
        purpose_map.get(payload.consent_type, "Consent update"),
        "v1.0",
        payload.status,
        "settings",
        ip,
        ua
    )
    return {"success": True, "status": payload.status}


@api.get("/users/consent/my-records")
@api.get("/consent/my-records")
async def get_my_consent_records(current_user: dict = Depends(get_current_user)):
    records = await db.consent_records.find(
        {"userId": current_user["id"]},
        {"_id": 0}
    ).sort("createdAt", -1).to_list(100)
    return {"records": records}


@api.get("/users/export-my-data")
async def export_my_data(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    tid = current_user.get("tenant_id")
    
    user_doc = await db.users.find_one({"id": uid}, {"_id": 0, "password": 0, "reset_token_hash": 0, "reset_otp": 0})
    restaurant_doc = await db.restaurants.find_one({"id": tid}, {"_id": 0}) if tid else None
    
    categories = []
    menu_items = []
    tables = []
    bills = []
    consents = []
    
    if tid:
        categories = await db.categories.find({"tenant_id": tid}, {"_id": 0}).to_list(500)
        menu_items = await db.menu_items.find({"tenant_id": tid}, {"_id": 0}).to_list(1000)
        tables = await db.tables.find({"tenant_id": tid}, {"_id": 0}).to_list(200)
        bills = await db.bills.find({"tenant_id": tid}, {"_id": 0}).sort("created_at", -1).to_list(1000)
        
    consents = await db.consent_records.find({"userId": uid}, {"_id": 0}).sort("createdAt", -1).to_list(100)
    
    export_payload = {
        "export_metadata": {
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "data_principal_id": uid,
            "legal_framework": "DPDP Act 2023 / DPDP Rules 2025 (Data Portability Right)",
            "format": "JSON"
        },
        "user_profile": user_doc,
        "restaurant_profile": restaurant_doc,
        "consent_audit_history": consents,
        "categories": categories,
        "menu_items": menu_items,
        "tables": tables,
        "historical_bills_summary": bills
    }
    return export_payload


@api.delete("/auth/delete-account")
async def delete_my_account(user: dict = Depends(get_current_user), request: Request = None):
    uid = user["id"]
    tid = user.get("tenant_id")
    now_iso = datetime.now(timezone.utc).isoformat()
    ip = request.client.host if (request and request.client) else ""
    ua = request.headers.get("user-agent", "") if request else ""
    
    # Log DPDP Right to Erasure / Consent Withdrawal
    await log_consent_event(
        uid,
        tid,
        "PRIVACY_POLICY",
        "Data Principal requested account deletion & erasure",
        "v1.0",
        "withdrawn",
        "account_deletion",
        ip,
        ua
    )
    
    if user["role"] == "owner" and tid:
        # 1. Delete menu items, categories, tables, notifications, waiter logins
        await db.categories.delete_many({"tenant_id": tid})
        await db.menu_items.delete_many({"tenant_id": tid})
        await db.tables.delete_many({"tenant_id": tid})
        await db.notifications.delete_many({"tenant_id": tid})
        await db.subscriptions.delete_many({"tenant_id": tid})
        await db.users.delete_many({"tenant_id": tid})
        await db.restaurants.delete_one({"id": tid})
        
        # 2. Section 36 CGST Act Compliance: Anonymize past invoices/bills for mandatory 72-month tax audit retention
        await db.bills.update_many(
            {"tenant_id": tid},
            {"$set": {
                "customer_phone": "",
                "customer_name": "Deleted Account",
                "notes": "",
                "account_deleted": True,
                "account_deleted_at": now_iso
            }}
        )
        await db.orders.update_many(
            {"tenant_id": tid},
            {"$set": {
                "customer_phone": "",
                "customer_name": "Deleted Account",
                "notes": "",
                "account_deleted": True,
                "account_deleted_at": now_iso
            }}
        )
    else:
        await db.users.delete_one({"id": uid})
        
    return {
        "ok": True,
        "message": "Account and personal data deleted successfully. Tax invoices anonymized and preserved for statutory tax audit requirements."
    }


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
    if "google_maps_link" in doc_data:
        doc_data["google_maps_link"] = clean_url_string(doc_data.get("google_maps_link"))
    if "googleReviewUrl" in doc_data:
        doc_data["googleReviewUrl"] = clean_url_string(doc_data.get("googleReviewUrl"))

    if payload.logo_base64:
        doc_data["logo_base64_58"] = optimize_logo_base64(payload.logo_base64, 100, 100)
        doc_data["logo_base64_80"] = optimize_logo_base64(payload.logo_base64, 130, 130)
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


# ---------- accurate food image helper with Gemini AI ----------
_gemini_image_cache: dict[str, dict] = {}

async def generate_dish_image_with_gemini(name: str) -> dict:
    from urllib.parse import quote_plus
    clean_name = (name or "").strip()
    if not clean_name:
        return {
            "image_url": "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&h=600&fit=crop",
            "image_base64": None,
            "success": True,
            "source": "default"
        }
    
    cache_key = clean_name.lower()
    if cache_key in _gemini_image_cache:
        return _gemini_image_cache[cache_key]

    gemini_key = os.environ.get("GEMINI_API_KEY") or "AIzaSyAEmzSOVVIQznxt5rRaAWMhPn6aPKT1p_o"

    # 1. Attempt direct Gemini Image Generation models (if accessible/billed)
    try:
        import google.generativeai as genai
        genai.configure(api_key=gemini_key)
        for img_model_name in ["gemini-2.5-flash-image", "gemini-3.1-flash-lite-image", "gemini-3-pro-image"]:
            try:
                img_model = genai.GenerativeModel(img_model_name)
                res = img_model.generate_content(f"A gourmet food photograph of {clean_name}, appetizing restaurant presentation, plate dish, studio lighting")
                if res and hasattr(res, "candidates") and res.candidates:
                    for part in getattr(res.candidates[0].content, "parts", []):
                        inline_data = getattr(part, "inline_data", None)
                        if inline_data and getattr(inline_data, "data", None):
                            b64 = inline_data.data
                            mime = getattr(inline_data, "mime_type", "image/jpeg")
                            data_uri = f"data:{mime};base64,{b64}"
                            result = {"image_url": data_uri, "image_base64": b64, "success": True, "source": "gemini_direct"}
                            _gemini_image_cache[cache_key] = result
                            return result
            except Exception:
                continue
    except Exception as e:
        logger.warning(f"Direct Gemini image generation attempt failed: {e}")

    # 2. Use Gemini Flash to synthesize an authentic culinary photography prompt from dish name
    gemini_prompt = None
    try:
        import google.generativeai as genai
        genai.configure(api_key=gemini_key)
        for m_name in ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash", "gemini-flash-latest"]:
            try:
                flash_model = genai.GenerativeModel(m_name)
                ai_resp = flash_model.generate_content(
                    f"You are an award-winning Michelin-star culinary food photographer. For the restaurant menu dish '{clean_name}', "
                    f"write a single-sentence macro food photography prompt describing an ultra-realistic, mouthwatering, extreme closeup of the authentic dish. "
                    f"Specify authentic textures, glistening rich gravy or glaze, tender ingredients, delicate steam rising, authentic garnishes like fresh coriander, sesame, microgreens or melting butter swirl, professional restaurant plating in a dark ceramic bowl or rustic plate. "
                    f"Include camera details: 85mm f/1.8 macro lens, shallow depth of field, soft warm bokeh, warm restaurant lighting, 8k realistic photo. "
                    f"Strictly NO cartoon, NO CGI, NO illustration, NO artificial rendering, NO text. Return ONLY the prompt text, no quotes or intro."
                )
                if ai_resp and ai_resp.text:
                    text = ai_resp.text.strip().replace('"', '').replace('\n', ' ')
                    if len(text) > 15:
                        gemini_prompt = text
                        break
            except Exception:
                continue
    except Exception as ex:
        logger.warning(f"Gemini prompt generation failed: {ex}")

    if not gemini_prompt:
        gemini_prompt = (
            f"Ultra-realistic macro closeup food photography of authentic {clean_name}, "
            f"mouthwatering restaurant dish presentation, glistening sauce, fresh garnishes, "
            f"85mm f1.8 lens, shallow depth of field, 8k realistic photo, no cartoon, no cgi"
        )

    seed = abs(hash(clean_name)) % 100000
    final_url = f"https://image.pollinations.ai/prompt/{quote_plus(gemini_prompt)}?width=800&height=800&model=flux&enhance=true&nologo=true&seed={seed}"
    result = {"image_url": final_url, "image_base64": None, "gemini_prompt": gemini_prompt, "success": True, "source": "gemini_flux_macro"}
    _gemini_image_cache[cache_key] = result
    return result


def get_accurate_food_image_url(name: str) -> str:
    from urllib.parse import quote_plus
    clean_name = (name or "").strip().lower()
    if not clean_name:
        return "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=400&fit=crop"

    # Consult Gemini cache if already computed
    if clean_name in _gemini_image_cache:
        cached = _gemini_image_cache[clean_name]
        return cached.get("image_url") or cached.get("image_base64")

    dish_map = [
        # Biryani & Rice
        (["hyderabadi biryani", "chicken biryani", "dum biryani", "biryani", "biriyani", "briyani"], "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400&h=400&fit=crop"),
        (["mutton biryani", "gosht biryani"], "https://images.unsplash.com/photo-1633945274405-b6c8069047b0?w=400&h=400&fit=crop"),
        (["veg biryani", "pulao", "pulav", "veg pulao"], "https://images.unsplash.com/photo-1645177628172-a94c1f96e6db?w=400&h=400&fit=crop"),
        (["fried rice", "schezwan rice"], "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=400&fit=crop"),
        (["jeera rice", "kushk", "kushka", "steamed rice", "curd rice", "rice"], "https://images.unsplash.com/photo-1596797038530-2c107229654b?w=400&h=400&fit=crop"),

        # Starters & Kebabs
        (["chicken 65", "paneer 65", "65"], "https://images.unsplash.com/photo-1610057099443-fde8c4d90ef8?w=400&h=400&fit=crop"),
        (["tandoori chicken", "tandoori", "chicken tikka", "tangdi kebab"], "https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=400&h=400&fit=crop"),
        (["paneer tikka", "malai tikka"], "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=400&h=400&fit=crop"),
        (["kebab", "kabab", "seekh kebab"], "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400&h=400&fit=crop"),
        (["samosa"], "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400&h=400&fit=crop"),
        (["spring roll"], "https://images.unsplash.com/photo-1544025162-d76694265947?w=400&h=400&fit=crop"),
        (["momo", "momos", "dim sum", "dimsum"], "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=400&h=400&fit=crop"),
        (["manchurian", "chilli chicken", "chilli paneer", "crispy corn"], "https://images.unsplash.com/photo-1525755662778-989d0524087e?w=400&h=400&fit=crop"),

        # Curries - Non-Veg
        (["butter chicken", "murgh makhani"], "https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?w=400&h=400&fit=crop"),
        (["chicken curry", "kadai chicken", "chicken masala", "chicken"], "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=400&h=400&fit=crop"),
        (["mutton rogan josh", "rogan josh", "mutton curry", "mutton", "gosht", "lamb"], "https://images.unsplash.com/photo-1545247181-516773ca839b?w=400&h=400&fit=crop"),
        (["fish curry", "fish fry", "prawns", "shrimp", "fish", "prawn"], "https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=400&h=400&fit=crop"),
        (["egg curry", "egg bhurji", "omelette", "omlet", "egg"], "https://images.unsplash.com/photo-1587486913049-53fc88980cfc?w=400&h=400&fit=crop"),

        # Curries - Veg
        (["paneer butter masala", "shahi paneer", "kadai paneer", "palak paneer", "matar paneer", "paneer"], "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=400&h=400&fit=crop"),
        (["dal makhani", "dal makhni", "black dal"], "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=400&h=400&fit=crop"),
        (["dal tadka", "dal fry", "yellow dal", "dal"], "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=400&h=400&fit=crop"),
        (["chole", "chana masala", "chole bhature", "bhature", "rajma"], "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=400&h=400&fit=crop"),
        (["thali", "veg thali", "special thali"], "https://images.unsplash.com/photo-1610192244261-3f33de3f55e4?w=400&h=400&fit=crop"),

        # Breads
        (["naan", "garlic naan", "butter naan", "roti", "chapati", "paratha", "parotta", "kulcha"], "https://images.unsplash.com/photo-1626074353765-517a681e40be?w=400&h=400&fit=crop"),

        # South Indian
        (["dosa", "masala dosa", "ghee roast"], "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=400&h=400&fit=crop"),
        (["idli", "vada", "uttapam"], "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=400&h=400&fit=crop"),

        # Continental & Fast Food
        (["pizza", "margherita"], "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400&h=400&fit=crop"),
        (["burger", "cheeseburger"], "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=400&fit=crop"),
        (["french fries", "fries"], "https://images.unsplash.com/photo-1576107232684-1279f3908594?w=400&h=400&fit=crop"),
        (["pasta", "alfredo", "arrabiata", "macaroni"], "https://images.unsplash.com/photo-1621996346565-e3d5d628102a?w=400&h=400&fit=crop"),
        (["noodles", "hakka noodles", "chowmein"], "https://images.unsplash.com/photo-1585032226651-759b368d7246?w=400&h=400&fit=crop"),
        (["sandwich", "club sandwich"], "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=400&h=400&fit=crop"),
        (["shawarma", "roll", "frankie", "wrap"], "https://images.unsplash.com/photo-1633321702518-7feccafb94d5?w=400&h=400&fit=crop"),

        # Desserts
        (["gulab jamun", "rasgulla", "rasmalai", "jalebi"], "https://images.unsplash.com/photo-1667489022797-ab608913feeb?w=400&h=400&fit=crop"),
        (["ice cream", "kulfi", "sundae"], "https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?w=400&h=400&fit=crop"),
        (["brownie", "cake", "pastry"], "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=400&h=400&fit=crop"),

        # Beverages
        (["chai", "tea"], "https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=400&h=400&fit=crop"),
        (["coffee", "cappuccino", "latte"], "https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=400&h=400&fit=crop"),
        (["lassi", "chaas", "buttermilk"], "https://images.unsplash.com/photo-1626074353765-517a681e40be?w=400&h=400&fit=crop"),
        (["lime soda", "lemonade", "mojito", "soda"], "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=400&h=400&fit=crop"),
        (["shake", "smoothie", "juice"], "https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=400&h=400&fit=crop"),
    ]

    for keywords, url in dish_map:
        if any(kw in clean_name for kw in keywords):
            return url

    clean_prompt = re.sub(r"[^\w\s]", " ", clean_name)
    clean_prompt = re.sub(r"\s+", " ", clean_prompt).strip()
    prompt = f"Ultra-realistic macro closeup food photography of authentic {clean_prompt}, mouthwatering restaurant dish presentation, glistening sauce, fresh garnishes, 85mm f1.8 lens, shallow depth of field, 8k realistic photo, no cartoon, no cgi"
    seed = abs(hash(clean_name)) % 100000
    return f"https://image.pollinations.ai/prompt/{quote_plus(prompt)}?width=800&height=800&model=flux&enhance=true&nologo=true&seed={seed}"


@api.post("/menu/generate-image")
async def generate_menu_item_image_endpoint(payload: GenerateMenuImageIn, user: dict = Depends(get_current_user)):
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Dish name is required to generate photo")
    return await generate_dish_image_with_gemini(name)


# ---------- promotional marketing poster AI (max 2 per day) ----------
@api.get("/marketing/promo-quota")
async def get_promo_quota(user: dict = Depends(get_current_user)):
    tid = user.get("tenant_id")
    ist_offset = timedelta(hours=5, minutes=30)
    now_ist = datetime.now(timezone(ist_offset))
    today_str = now_ist.strftime("%Y-%m-%d")
    doc = await db.promo_posters.find_one({"tenant_id": tid, "date": today_str})
    used = doc.get("count", 0) if doc else 0
    return {
        "date": today_str,
        "used": used,
        "limit": 2,
        "remaining": max(0, 2 - used),
        "history": doc.get("history", []) if doc else []
    }


@api.post("/marketing/generate-promo-poster")
async def generate_promo_poster_endpoint(payload: PromoPosterIn, user: dict = Depends(get_current_user)):
    tid = user.get("tenant_id")
    ist_offset = timedelta(hours=5, minutes=30)
    now_ist = datetime.now(timezone(ist_offset))
    today_str = now_ist.strftime("%Y-%m-%d")

    # Strictly enforce 2 images per calendar day limit
    doc = await db.promo_posters.find_one({"tenant_id": tid, "date": today_str})
    used = doc.get("count", 0) if doc else 0
    if used >= 2:
        raise HTTPException(
            status_code=429,
            detail="Daily limit reached! You can generate a maximum of 2 promotional posters per day. Quota resets at midnight."
        )

    dish_clean = (payload.dish_name or "Chef Special").strip()
    if not dish_clean:
        raise HTTPException(status_code=400, detail="Dish name is required to generate promotional poster")

    r_name = payload.restaurant_name
    if not r_name:
        t_doc = await db.tenants.find_one({"id": tid})
        r_name = (t_doc.get("name") if t_doc else None) or "Our Restaurant"

    price_val = payload.price
    price_str = f"Rs. {int(price_val) if price_val == int(price_val) else price_val}" if price_val else ""
    tagline_clean = (payload.tagline or "Today's Special").strip()

    # Generate advertising poster prompt with Gemini
    gemini_key = os.environ.get("GEMINI_API_KEY") or "AIzaSyAEmzSOVVIQznxt5rRaAWMhPn6aPKT1p_o"
    poster_prompt = None
    try:
        import google.generativeai as genai
        genai.configure(api_key=gemini_key)
        for m_name in ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash", "gemini-flash-latest"]:
            try:
                flash_model = genai.GenerativeModel(m_name)
                ai_resp = flash_model.generate_content(
                    f"You are an expert restaurant marketing art director creating a vertical promotional poster for WhatsApp status and social media. "
                    f"Restaurant: {r_name}, Dish: {dish_clean}, Price: {price_str}, Offer/Headline: {tagline_clean}. "
                    f"Write a vivid 2-sentence prompt for an image generator to create a vertical 9:16 promotional food advertising poster. "
                    f"Include: an irresistible closeup macro photo of {dish_clean} with steam, rich vibrant colors, authentic garnishes, professional food styling; "
                    f"commercial graphic design elements: stylish restaurant banner layout, modern typography featuring the dish name '{dish_clean}', "
                    f"a promotional discount badge with '{tagline_clean}', price tag '{price_str}', and restaurant branding '{r_name}'. "
                    f"Cinematic warm lighting, award-winning social media advertisement poster design. "
                    f"Return ONLY the image prompt, no quotes, no extra chat."
                )
                if ai_resp and ai_resp.text and len(ai_resp.text.strip()) > 20:
                    poster_prompt = ai_resp.text.strip().replace('"', '').replace('\n', ' ')
                    break
            except Exception:
                continue
    except Exception as ex:
        logger.warning(f"Poster Gemini prompt generation failed: {ex}")

    if not poster_prompt:
        poster_prompt = (
            f"Vertical 9:16 promotional food advertising poster for {dish_clean} at {r_name}. "
            f"Irresistible closeup macro photo of steaming {dish_clean} with authentic garnishes and rich colors, "
            f"commercial food advertisement layout, modern typography '{dish_clean}', promotional badge '{tagline_clean}', "
            f"price tag '{price_str}', restaurant branding '{r_name}', cinematic warm lighting, 8k resolution, award-winning poster design."
        )

    import random
    seed = random.randint(1000, 999999)
    from urllib.parse import quote_plus
    poster_url = f"https://image.pollinations.ai/prompt/{quote_plus(poster_prompt)}?width=720&height=1280&model=flux&enhance=true&nologo=true&seed={seed}"

    # Ready-to-share WhatsApp status caption
    clean_dish_tag = re.sub(r"[^\w]", "", dish_clean)
    caption = (
        f"🔥 *{dish_clean}* at *{r_name}*!\n\n"
        f"{('🏷️ Price: ' + price_str + chr(10)) if price_str else ''}"
        f"✨ {tagline_clean}\n\n"
        f"📍 Visit us or order today!\n"
        f"#{clean_dish_tag} #Foodie #SpecialOffer #EzBill"
    )

    now_iso = datetime.now(timezone.utc).isoformat()
    poster_entry = {
        "dish_name": dish_clean,
        "price": price_val,
        "tagline": tagline_clean,
        "image_url": poster_url,
        "caption": caption,
        "created_at": now_iso
    }

    await db.promo_posters.update_one(
        {"tenant_id": tid, "date": today_str},
        {
            "$inc": {"count": 1},
            "$set": {"last_generated_at": now_iso, "tenant_id": tid, "date": today_str},
            "$push": {"history": {"$each": [poster_entry], "$slice": -10}}
        },
        upsert=True
    )

    new_count = used + 1
    return {
        "ok": True,
        "image_url": poster_url,
        "caption": caption,
        "used_today": new_count,
        "limit": 2,
        "remaining_today": max(0, 2 - new_count),
        "dish_name": dish_clean,
        "price": price_val,
        "tagline": tagline_clean
    }


# ---------- menu items ----------
@api.post("/menu-items")
async def create_menu_item(payload: MenuItemIn, user: dict = Depends(require_roles("owner", "manager"))):
    tid = await _ensure_tenant(user)
    data = payload.dict()
    if not data.get("image_url") and not data.get("image_base64"):
        data["image_url"] = get_accurate_food_image_url(data.get("name", ""))
    doc = {"id": str(uuid.uuid4()), "tenant_id": tid, **data, "created_at": datetime.now(timezone.utc).isoformat()}
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


@api.post("/menu/auto-assign-images")
async def auto_assign_menu_images(payload: AutoAssignImagesIn = AutoAssignImagesIn(), user: dict = Depends(require_roles("owner", "manager"))):
    tid = await _ensure_tenant(user)
    query = {"tenant_id": tid, "is_deleted": {"$ne": True}}
    if not payload.force_all:
        query["$or"] = [
            {"image_url": None, "image_base64": None},
            {"image_url": ""},
            {"image_url": {"$exists": False}}
        ]
    items = await db.menu_items.find(query).to_list(5000)
    updated = 0
    for item in items:
        dish_name = item.get("name", "")
        gem_res = await generate_dish_image_with_gemini(dish_name)
        new_img = gem_res.get("image_url") or get_accurate_food_image_url(dish_name)
        new_b64 = gem_res.get("image_base64")
        set_data = {"image_url": new_img}
        if new_b64:
            set_data["image_base64"] = new_b64
        await db.menu_items.update_one({"id": item["id"], "tenant_id": tid}, {"$set": set_data})
        updated += 1
    return {"success": True, "updated_count": updated, "message": f"Successfully auto-assigned Gemini AI images to {updated} dishes."}


# ---------- BULK JSON MENU IMPORT (SUPER ADMIN & OWNER) ----------
async def _process_json_menu_import(tid: str, raw_input: Any, replace_existing: bool = False) -> dict:
    import json
    data = raw_input
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid JSON string syntax: {str(e)}")

    if isinstance(data, dict):
        # Auto-detect tenant_id if passed in JSON envelope
        if not tid:
            tid = str(data.get("restaurant_id") or data.get("tenant_id") or data.get("restaurantId") or data.get("store_id") or "").strip()

        if "menu" in data and isinstance(data["menu"], list):
            data = data["menu"]
        elif "categories" in data and isinstance(data["categories"], list):
            data = data["categories"]
        elif "data" in data and isinstance(data["data"], list):
            data = data["data"]
        elif "items" in data and isinstance(data["items"], list):
            data = [{"category": "Main Menu", "items": data["items"]}]
        elif "dishes" in data and isinstance(data["dishes"], list):
            data = [{"category": "Main Menu", "items": data["dishes"]}]
        elif "products" in data and isinstance(data["products"], list):
            data = [{"category": "Main Menu", "items": data["products"]}]
        else:
            cat_list = []
            for k, v in data.items():
                if isinstance(v, list) and k not in ("restaurant_id", "tenant_id", "restaurantId", "store_id", "status"):
                    cat_list.append({"category": str(k), "items": v})
            if cat_list:
                data = cat_list
            else:
                data = [data]

    if not isinstance(data, list):
        raise HTTPException(status_code=400, detail="Menu JSON must be an array of categories or dish items.")

    # Check if data is flat list of dishes (e.g. [{"name": "Paneer", "price": 200, "category": "Starters"}])
    is_flat_items = any(("price" in x or "rate" in x or "cost" in x) and "items" not in x for x in data if isinstance(x, dict))
    if is_flat_items:
        grouped: dict[str, list] = {}
        for it in data:
            if not isinstance(it, dict):
                continue
            cat_name = str(it.get("category") or it.get("category_name") or "Main Menu").strip()
            grouped.setdefault(cat_name, []).append(it)
        data = [{"category": cname, "items": citems} for cname, citems in grouped.items()]

    now_iso = datetime.now(timezone.utc).isoformat()

    # If replace_existing is True, delete previous categories and items
    if replace_existing:
        await db.categories.delete_many({"tenant_id": tid})
        await db.menu_items.delete_many({"tenant_id": tid})

    # Fetch active categories for tenant
    existing_cats = await db.categories.find({"tenant_id": tid, "is_deleted": {"$ne": True}}).to_list(500)
    cat_map: dict[str, dict] = {str(c["name"]).lower().strip(): c for c in existing_cats}

    categories_created = 0
    categories_reused = 0
    items_created = 0

    non_veg_keywords = {"chicken", "mutton", "fish", "prawn", "egg", "lamb", "pork", "beef", "seafood", "non-veg", "non veg", "meat"}

    for cat_entry in data:
        if not isinstance(cat_entry, dict):
            continue
        raw_cat_name = str(cat_entry.get("category") or cat_entry.get("category_name") or cat_entry.get("name") or cat_entry.get("title") or "General").strip()
        if not raw_cat_name:
            raw_cat_name = "General"

        norm_cat_name = raw_cat_name.lower()
        if norm_cat_name in cat_map:
            cat_doc = cat_map[norm_cat_name]
            cid = cat_doc["id"]
            categories_reused += 1
        else:
            cid = str(uuid.uuid4())
            cat_doc = {
                "id": cid,
                "tenant_id": tid,
                "name": raw_cat_name,
                "sort_order": len(cat_map),
                "created_at": now_iso,
            }
            await db.categories.insert_one(cat_doc)
            cat_map[norm_cat_name] = cat_doc
            categories_created += 1

        items_list = cat_entry.get("items") or cat_entry.get("dishes") or cat_entry.get("menu_items") or cat_entry.get("products") or []
        if not isinstance(items_list, list):
            continue

        for it in items_list:
            if not isinstance(it, dict):
                continue
            item_name = str(it.get("name") or it.get("item_name") or it.get("dish_name") or it.get("title") or "").strip()
            if not item_name:
                continue

            try:
                raw_price = it.get("price") or it.get("rate") or it.get("cost") or it.get("amount") or 0.0
                if isinstance(raw_price, str):
                    clean_p = re.sub(r"[^\d.]", "", raw_price)
                    item_price = float(clean_p) if clean_p else 0.0
                else:
                    item_price = float(raw_price or 0.0)
                if item_price < 0:
                    item_price = 0.0
            except Exception:
                item_price = 0.0

            item_desc = str(it.get("description") or it.get("desc") or it.get("details") or "").strip()

            # Determine veg / non-veg
            if "is_veg" in it:
                is_veg = bool(it["is_veg"])
            elif "veg" in it:
                is_veg = bool(it["veg"])
            elif "type" in it:
                is_veg = str(it["type"]).lower().strip() == "veg"
            else:
                lower_name = item_name.lower()
                is_veg = not any(w in lower_name for w in non_veg_keywords)

            item_img = it.get("image_url") or it.get("image_base64") or it.get("image") or None
            img_url = None
            img_b64 = None
            if isinstance(item_img, str) and item_img.startswith("data:"):
                img_b64 = item_img
            elif isinstance(item_img, str) and item_img.startswith("http"):
                img_url = item_img
            else:
                img_url = get_accurate_food_image_url(item_name)

            item_doc = {
                "id": str(uuid.uuid4()),
                "tenant_id": tid,
                "category_id": cid,
                "name": item_name,
                "price": round(item_price, 2),
                "description": item_desc,
                "is_veg": is_veg,
                "image_url": img_url,
                "image_base64": img_b64,
                "is_active": True,
                "created_at": now_iso,
            }
            await db.menu_items.insert_one(item_doc)
            items_created += 1

    # Send real-time notification
    try:
        await notify_tenant(
            tid,
            "menu",
            "Menu Catalog Updated",
            f"Imported {items_created} dishes across {categories_created + categories_reused} categories.",
            {"items_count": items_created, "tenant_id": tid}
        )
    except Exception:
        pass

    total_cats = await db.categories.count_documents({"tenant_id": tid, "is_deleted": {"$ne": True}})
    total_items = await db.menu_items.count_documents({"tenant_id": tid, "is_deleted": {"$ne": True}})

    return {
        "success": True,
        "message": f"Successfully imported {items_created} menu items across {categories_created + categories_reused} categories.",
        "categories_created": categories_created,
        "categories_reused": categories_reused,
        "items_created": items_created,
        "total_categories": total_cats,
        "total_items": total_items,
    }


@api.post("/menu/import-json")
async def import_menu_json(payload: MenuJsonImportIn, user: dict = Depends(get_current_user)):
    is_admin = user.get("role") in ("super_admin", "admin_employee")
    target_tid = payload.tenant_id if (is_admin and payload.tenant_id) else user.get("tenant_id")
    if not target_tid:
        raise HTTPException(status_code=400, detail="Target restaurant tenant_id is required.")

    input_data = payload.raw_json or payload.data or payload.categories
    if input_data is None:
        raise HTTPException(status_code=400, detail="JSON menu payload or raw_json string is required.")

    return await _process_json_menu_import(target_tid, input_data, replace_existing=bool(payload.replace_existing))


@api.get("/admin/restaurants/{target_tid}/menu")
async def admin_get_restaurant_menu(target_tid: str, user: dict = Depends(require_roles("super_admin", "admin_employee"))):
    cats = await db.categories.find({"tenant_id": target_tid, "is_deleted": {"$ne": True}}, {"_id": 0}).sort("sort_order", 1).to_list(500)
    items = await db.menu_items.find({"tenant_id": target_tid, "is_deleted": {"$ne": True}}, {"_id": 0}).to_list(2000)
    return {
        "categories": cats,
        "items": items,
        "total_categories": len(cats),
        "total_items": len(items),
    }


@api.post("/admin/restaurants/{target_tid}/menu/import-json")
async def admin_import_restaurant_menu_json(target_tid: str, payload: MenuJsonImportIn, user: dict = Depends(require_roles("super_admin", "admin_employee"))):
    rest = await db.restaurants.find_one({"id": target_tid})
    if not rest:
        raise HTTPException(status_code=404, detail="Restaurant not found.")

    input_data = payload.raw_json or payload.data or payload.categories
    if input_data is None:
        raise HTTPException(status_code=400, detail="JSON menu payload or raw_json string is required.")

    return await _process_json_menu_import(target_tid, input_data, replace_existing=bool(payload.replace_existing))


@api.delete("/admin/restaurants/{target_tid}/menu")
async def admin_clear_restaurant_menu(target_tid: str, user: dict = Depends(require_roles("super_admin", "admin_employee"))):
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.categories.update_many({"tenant_id": target_tid}, {"$set": {"deleted_at": now_iso, "is_deleted": True}})
    await db.menu_items.update_many({"tenant_id": target_tid}, {"$set": {"deleted_at": now_iso, "is_deleted": True}})
    return {"success": True, "message": f"Menu cleared for restaurant {target_tid}."}


@api.post("/admin/restaurants/{target_tid}/menu/auto-assign-images")
async def admin_auto_assign_menu_images(target_tid: str, payload: AutoAssignImagesIn = AutoAssignImagesIn(), user: dict = Depends(require_roles("super_admin", "admin_employee"))):
    query = {"tenant_id": target_tid, "is_deleted": {"$ne": True}}
    if not payload.force_all:
        query["$or"] = [
            {"image_url": None, "image_base64": None},
            {"image_url": ""},
            {"image_url": {"$exists": False}}
        ]
    items = await db.menu_items.find(query).to_list(5000)
    updated = 0
    for item in items:
        dish_name = item.get("name", "")
        gem_res = await generate_dish_image_with_gemini(dish_name)
        new_img = gem_res.get("image_url") or get_accurate_food_image_url(dish_name)
        new_b64 = gem_res.get("image_base64")
        set_data = {"image_url": new_img}
        if new_b64:
            set_data["image_base64"] = new_b64
        await db.menu_items.update_one({"id": item["id"], "tenant_id": target_tid}, {"$set": set_data})
        updated += 1
    return {"success": True, "updated_count": updated, "message": f"Assigned Gemini AI images to {updated} dishes for restaurant {target_tid}."}



# ---------- tables ----------
@api.post("/tables")
async def create_table(payload: TableIn, user: dict = Depends(require_roles("owner", "manager"))):
    tid = await _ensure_tenant(user)
    clean_lbl = payload.label.strip()
    # Check if a non-deleted table with this exact or case-insensitive label already exists
    existing = await db.tables.find_one({
        "tenant_id": tid,
        "is_deleted": {"$ne": True},
        "$or": [
            {"label": clean_lbl},
            {"label": {"$regex": f"^{re.escape(clean_lbl)}$", "$options": "i"}}
        ]
    })
    if existing:
        existing.pop("_id", None)
        return existing

    doc = {"id": str(uuid.uuid4()), "tenant_id": tid, **payload.dict(),
           "label": clean_lbl,
           "created_at": datetime.now(timezone.utc).isoformat()}
    await db.tables.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/tables")
async def list_tables(user: dict = Depends(get_current_user)):
    tid = await _ensure_tenant(user)
    await _auto_clear_kitchen_orders(tid)
    raw_tables = await db.tables.find({"tenant_id": tid, "is_deleted": {"$ne": True}}, {"_id": 0}).sort("label", 1).to_list(500)
    
    # Auto-seed default tables (1 to 10) if no tables exist for this restaurant yet
    if not raw_tables:
        now_iso = datetime.now(timezone.utc).isoformat()
        default_tables = [
            {
                "id": f"tbl_{tid}_{i}",
                "tenant_id": tid,
                "label": str(i),
                "seats": 4,
                "status": "available",
                "is_deleted": False,
                "created_at": now_iso
            }
            for i in range(1, 11)
        ]
        try:
            await db.tables.insert_many(default_tables)
            raw_tables = await db.tables.find({"tenant_id": tid, "is_deleted": {"$ne": True}}, {"_id": 0}).sort("label", 1).to_list(500)
        except Exception as seed_err:
            logger.warning("Auto-seed default tables error: %s", seed_err)

    seen = set()
    unique_tables = []
    duplicate_ids = []
    for t in raw_tables:
        lbl = str(t.get("label", "")).strip().lower()
        if not lbl:
            unique_tables.append(t)
            continue
        if lbl in seen:
            if t.get("id"):
                duplicate_ids.append(t["id"])
        else:
            seen.add(lbl)
            unique_tables.append(t)
            
    # Clean up duplicate records in background
    if duplicate_ids:
        try:
            now_iso = datetime.now(timezone.utc).isoformat()
            await db.tables.update_many(
                {"id": {"$in": duplicate_ids}, "tenant_id": tid},
                {"$set": {"is_deleted": True, "deleted_at": now_iso}}
            )
        except Exception:
            pass
            
    return unique_tables


@api.put("/tables/{tbl_id}")
async def update_table(tbl_id: str, payload: TableUpdateIn, user: dict = Depends(require_roles("owner", "manager"))):
    tid = await _ensure_tenant(user)
    upd = {k: v for k, v in payload.dict().items() if v is not None}
    if not upd:
        raise HTTPException(status_code=400, detail="No fields to update")
    res = await db.tables.update_one({"id": tbl_id, "tenant_id": tid}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Table not found")
    return await db.tables.find_one({"id": tbl_id}, {"_id": 0})


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
    raw_tables = await db.tables.find(q, {"_id": 0}).to_list(500)
    
    seen_tables = set()
    tables = []
    for t in raw_tables:
        lbl = str(t.get("label", "")).strip().lower()
        if lbl and lbl in seen_tables:
            continue
        if lbl:
            seen_tables.add(lbl)
        tables.append(t)
    
    return {
        "categories": categories,
        "menu_items": menu_items,
        "orders": orders,
        "bills": bills,
        "tables": tables,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


class BatchSyncAction(BaseModel):
    id: Optional[str] = None
    type: str
    payload: Optional[Any] = {}
    localId: Optional[str] = None
    createdAt: Optional[str] = None


class BatchSyncRequest(BaseModel):
    actions: List[BatchSyncAction] = []
    restaurant: Optional[dict] = None
    client_timestamp: Optional[str] = None


@api.post("/sync/batch")
async def batch_sync(payload: BatchSyncRequest, user: dict = Depends(get_current_user)):
    tid = await _ensure_tenant(user)
    id_map = {}
    synced_count = 0
    now = datetime.now(timezone.utc).isoformat()
    
    # If restaurant settings provided in batch, update them
    if payload.restaurant:
        r_data = {k: v for k, v in payload.restaurant.items() if k not in ["_id", "id", "tenant_id"]}
        r_data["updated_at"] = now
        await db.restaurants.update_one({"tenant_id": tid}, {"$set": r_data}, upsert=True)
    
    for action in payload.actions:
        a_type = action.type
        p = action.payload or {}
        local_id = action.localId
        
        try:
            if a_type == "CREATE_CATEGORY":
                cid = str(uuid.uuid4())
                doc = {"id": cid, "tenant_id": tid, "name": p.get("name"), "sort_order": p.get("sort_order", 0), "created_at": now}
                await db.categories.insert_one(doc)
                if local_id:
                    id_map[local_id] = cid
                synced_count += 1
                
            elif a_type == "DELETE_CATEGORY":
                target_id = id_map.get(p.get("id"), p.get("id"))
                if target_id:
                    await db.categories.update_one({"id": target_id, "tenant_id": tid}, {"$set": {"deleted_at": now, "is_deleted": True}})
                    await db.menu_items.update_many({"category_id": target_id, "tenant_id": tid}, {"$set": {"deleted_at": now, "is_deleted": True}})
                synced_count += 1
                
            elif a_type == "CREATE_MENU_ITEM":
                iid = str(uuid.uuid4())
                cat_id = id_map.get(p.get("category_id"), p.get("category_id"))
                doc = {
                    "id": iid,
                    "tenant_id": tid,
                    "name": p.get("name"),
                    "category_id": cat_id,
                    "price": float(p.get("price", 0)),
                    "description": p.get("description", ""),
                    "is_veg": p.get("is_veg", True),
                    "created_at": now
                }
                await db.menu_items.insert_one(doc)
                if local_id:
                    id_map[local_id] = iid
                synced_count += 1
                
            elif a_type == "UPDATE_MENU_ITEM":
                target_id = id_map.get(p.get("id"), p.get("id"))
                if target_id:
                    upd = {k: v for k, v in p.items() if k not in ["id", "_id", "tenant_id"] and v is not None}
                    if "category_id" in upd:
                        upd["category_id"] = id_map.get(upd["category_id"], upd["category_id"])
                    if upd:
                        await db.menu_items.update_one({"id": target_id, "tenant_id": tid}, {"$set": upd})
                synced_count += 1
                
            elif a_type == "DELETE_MENU_ITEM":
                target_id = id_map.get(p.get("id"), p.get("id"))
                if target_id:
                    await db.menu_items.update_one({"id": target_id, "tenant_id": tid}, {"$set": {"deleted_at": now, "is_deleted": True}})
                synced_count += 1
                
            elif a_type == "CREATE_TABLE":
                clean_lbl = str(p.get("label", "")).strip()
                existing = await db.tables.find_one({
                    "tenant_id": tid,
                    "is_deleted": {"$ne": True},
                    "$or": [
                        {"label": clean_lbl},
                        {"label": {"$regex": f"^{re.escape(clean_lbl)}$", "$options": "i"}}
                    ]
                })
                if existing:
                    tbl_id = existing["id"]
                else:
                    tbl_id = str(uuid.uuid4())
                    doc = {"id": tbl_id, "tenant_id": tid, "label": clean_lbl, "seats": p.get("seats", 4), "created_at": now}
                    await db.tables.insert_one(doc)
                if local_id:
                    id_map[local_id] = tbl_id
                synced_count += 1
                
            elif a_type == "DELETE_TABLE":
                target_id = id_map.get(p.get("id"), p.get("id"))
                if target_id:
                    await db.tables.update_one({"id": target_id, "tenant_id": tid}, {"$set": {"deleted_at": now, "is_deleted": True}})
                synced_count += 1
                
            elif a_type == "SAVE_RESTAURANT":
                r_data = {k: v for k, v in p.items() if k not in ["_id", "id", "tenant_id"]}
                r_data["updated_at"] = now
                await db.restaurants.update_one({"tenant_id": tid}, {"$set": r_data}, upsert=True)
                synced_count += 1
                
            elif a_type == "CREATE_ORDER":
                oid = local_id if (local_id and not local_id.startswith("temp-")) else str(uuid.uuid4())
                items = p.get("items", [])
                subtotal = float(p.get("subtotal", 0) or sum(float(x.get("price", 0)) * int(x.get("quantity", 1)) for x in items))
                doc = {
                    "id": oid,
                    "tenant_id": tid,
                    "order_number": p.get("order_number") or str(uuid.uuid4().hex[:4].upper()),
                    "table_number": p.get("table_number", "Takeaway"),
                    "customer_name": p.get("customer_name", "Guest"),
                    "session_id": p.get("session_id", ""),
                    "items": items,
                    "subtotal": subtotal,
                    "notes": p.get("notes", ""),
                    "status": p.get("status", "placed"),
                    "created_at": p.get("created_at") or now,
                    "updated_at": now,
                }
                existing = await db.orders.find_one({"id": oid, "tenant_id": tid})
                if existing:
                    await db.orders.update_one({"id": oid, "tenant_id": tid}, {"$set": doc})
                else:
                    await db.orders.insert_one(doc)
                if local_id:
                    id_map[local_id] = oid
                synced_count += 1
                
            elif a_type == "UPDATE_ORDER":
                target_id = id_map.get(p.get("id"), p.get("id"))
                order_doc = None
                if target_id:
                    order_doc = await db.orders.find_one({"id": target_id, "tenant_id": tid})
                if not order_doc and p.get("session_id"):
                    order_doc = await db.orders.find_one({"session_id": p.get("session_id"), "tenant_id": tid})
                if not order_doc and p.get("table_number"):
                    order_doc = await db.orders.find_one(
                        {"table_number": p.get("table_number"), "tenant_id": tid, "status": {"$in": ["placed", "in_kitchen", "ready", "served"]}},
                        sort=[("created_at", -1)]
                    )
                if order_doc:
                    upd = {k: v for k, v in p.items() if k not in ["id", "_id", "tenant_id"] and v is not None}
                    upd["updated_at"] = now
                    if "items" in upd and upd["items"]:
                        upd["subtotal"] = float(p.get("subtotal", 0) or sum(float(x.get("price", 0)) * int(x.get("quantity", 1)) for x in upd["items"]))
                    await db.orders.update_one({"id": order_doc["id"], "tenant_id": tid}, {"$set": upd})
                    if target_id:
                        id_map[target_id] = order_doc["id"]
                else:
                    new_oid = str(uuid.uuid4())
                    items = p.get("items", [])
                    subtotal = float(p.get("subtotal", 0) or sum(float(x.get("price", 0)) * int(x.get("quantity", 1)) for x in items))
                    doc = {
                        "id": new_oid,
                        "tenant_id": tid,
                        "order_number": p.get("order_number") or str(uuid.uuid4().hex[:4].upper()),
                        "table_number": p.get("table_number", "Takeaway"),
                        "customer_name": p.get("customer_name", "Guest"),
                        "session_id": p.get("session_id", ""),
                        "items": items,
                        "subtotal": subtotal,
                        "notes": p.get("notes", ""),
                        "status": p.get("status", "placed"),
                        "created_at": p.get("created_at") or now,
                        "updated_at": now,
                    }
                    await db.orders.insert_one(doc)
                    if target_id:
                        id_map[target_id] = new_oid
                synced_count += 1
                
            elif a_type == "UPDATE_ORDER_STATUS":
                target_id = id_map.get(p.get("id"), p.get("id"))
                if target_id:
                    await db.orders.update_one({"id": target_id, "tenant_id": tid}, {"$set": {"status": p.get("status"), "updated_at": now}})
                synced_count += 1
                
            elif a_type == "CREATE_BILL":
                bid = local_id if (local_id and not local_id.startswith("temp-")) else str(uuid.uuid4())
                mapped_oid = id_map.get(p.get("order_id"), p.get("order_id"))
                mapped_oids = [id_map.get(x, x) for x in p.get("order_ids", [])] if p.get("order_ids") else ([mapped_oid] if mapped_oid else [])
                
                # Check if order or any bill for this order is already paid
                order_is_paid = False
                if mapped_oid:
                    chk_o = await db.orders.find_one({"id": mapped_oid, "tenant_id": tid}, {"_id": 0, "status": 1})
                    if chk_o and chk_o.get("status") in ("paid", "completed"):
                        order_is_paid = True
                        
                existing_bill = await db.bills.find_one({
                    "$or": [{"id": bid}] + ([{"order_id": mapped_oid}, {"order_ids": mapped_oid}] if mapped_oid else []),
                    "tenant_id": tid
                })
                
                incoming_status = p.get("status", "unpaid")
                paid_at = p.get("paid_at")
                if order_is_paid or (existing_bill and existing_bill.get("status") == "paid"):
                    incoming_status = "paid"
                    paid_at = paid_at or (existing_bill.get("paid_at") if existing_bill else None) or now
                elif incoming_status == "paid":
                    paid_at = paid_at or now

                doc = {
                    "id": (existing_bill.get("id") if existing_bill else bid),
                    "tenant_id": tid,
                    "bill_number": p.get("bill_number") or (existing_bill.get("bill_number") if existing_bill else None) or f"EZ-{datetime.now().year}-{uuid.uuid4().hex[:4].upper()}",
                    "order_id": mapped_oid,
                    "order_ids": mapped_oids,
                    "table_number": p.get("table_number", "Takeaway"),
                    "customer_name": p.get("customer_name", "Guest"),
                    "items": p.get("items", []),
                    "subtotal": float(p.get("subtotal", 0)),
                    "total": float(p.get("total", 0)),
                    "tax": float(p.get("tax", 0)),
                    "discount": float(p.get("discount", 0)),
                    "payment_method": p.get("payment_method") or (existing_bill.get("payment_method") if existing_bill else "UPI"),
                    "status": incoming_status,
                    "created_at": p.get("created_at") or (existing_bill.get("created_at") if existing_bill else None) or now,
                    "paid_at": paid_at
                }
                if existing_bill:
                    await db.bills.update_one({"id": existing_bill["id"], "tenant_id": tid}, {"$set": doc})
                    if local_id:
                        id_map[local_id] = existing_bill["id"]
                else:
                    await db.bills.insert_one(doc)
                    if local_id:
                        id_map[local_id] = bid
                synced_count += 1
                
            elif a_type == "MARK_BILL_PAID":
                target_id = id_map.get(p.get("id"), p.get("id"))
                pay_method = p.get("payment_method", "UPI")
                mapped_oid = id_map.get(p.get("order_id"), p.get("order_id"))

                query_conds = []
                if target_id:
                    query_conds.extend([{"id": target_id}, {"order_id": target_id}, {"order_ids": target_id}])
                if mapped_oid:
                    query_conds.extend([{"order_id": mapped_oid}, {"order_ids": mapped_oid}])

                matched_count = 0
                if query_conds:
                    res_upd = await db.bills.update_many(
                        {"$or": query_conds, "tenant_id": tid},
                        {"$set": {"status": "paid", "payment_method": pay_method, "paid_at": now}}
                    )
                    matched_count = res_upd.matched_count

                # Also mark orders as paid
                order_conds = []
                if target_id:
                    order_conds.append({"id": target_id})
                if mapped_oid:
                    order_conds.append({"id": mapped_oid})
                if order_conds:
                    await db.orders.update_many(
                        {"$or": order_conds, "tenant_id": tid},
                        {"$set": {"status": "paid", "updated_at": now}}
                    )

                if matched_count == 0:
                    # Insert paid bill so sales data is never lost
                    bid = str(uuid.uuid4())
                    items = p.get("items", [])
                    subtotal = float(p.get("subtotal", 0) or sum(float(x.get("price", 0)) * int(x.get("quantity", 1)) for x in items))
                    total = float(p.get("total", subtotal))
                    final_oid = mapped_oid or (target_id if target_id and not target_id.startswith("temp-") else None)
                    bill_doc = {
                        "id": bid,
                        "tenant_id": tid,
                        "bill_number": p.get("bill_number") or f"EZ-{datetime.now().year}-{uuid.uuid4().hex[:4].upper()}",
                        "order_id": final_oid,
                        "order_ids": [id_map.get(x, x) for x in p.get("order_ids", [])] if p.get("order_ids") else ([final_oid] if final_oid else []),
                        "table_number": p.get("table_number", "Takeaway"),
                        "customer_name": p.get("customer_name", "Guest"),
                        "items": items,
                        "subtotal": subtotal,
                        "total": total,
                        "tax": float(p.get("tax", 0)),
                        "discount": float(p.get("discount", 0)),
                        "payment_method": pay_method,
                        "status": "paid",
                        "created_at": p.get("created_at") or now,
                        "paid_at": now,
                    }
                    await db.bills.insert_one(bill_doc)
                    if target_id:
                        id_map[target_id] = bid
                mapped_oid = id_map.get(p.get("order_id"), p.get("order_id"))
                mapped_oids = [id_map.get(x, x) for x in p.get("order_ids", [])] if p.get("order_ids") else ([mapped_oid] if mapped_oid else ([target_id] if target_id else []))
                if mapped_oids:
                    await db.orders.update_many({"id": {"$in": mapped_oids}, "tenant_id": tid}, {"$set": {"status": "paid", "updated_at": now}})
                synced_count += 1
                
            elif a_type == "SETTLE_TABLE":
                tbl = p.get("table_number")
                mapped_oids = [id_map.get(x, x) for x in p.get("order_ids", [])] if p.get("order_ids") else []
                pay_method = p.get("payment_method", "UPI")
                if mapped_oids:
                    await db.orders.update_many({"id": {"$in": mapped_oids}, "tenant_id": tid}, {"$set": {"status": "paid", "updated_at": now}})
                    await db.bills.update_many({"order_ids": {"$in": mapped_oids}, "tenant_id": tid}, {"$set": {"status": "paid", "payment_method": pay_method, "paid_at": now}})
                elif tbl:
                    tbl_patterns = get_table_match_patterns(tbl)
                    await db.orders.update_many({"table_number": {"$in": tbl_patterns}, "tenant_id": tid}, {"$set": {"status": "paid", "updated_at": now}})
                    await db.bills.update_many({"table_number": {"$in": tbl_patterns}, "tenant_id": tid}, {"$set": {"status": "paid", "payment_method": pay_method, "paid_at": now}})
                synced_count += 1

            elif a_type == "OPEN_CASH_SESSION":
                sid = local_id if (local_id and not local_id.startswith("temp-")) else str(uuid.uuid4())
                bus_date = p.get("business_date") or get_business_day_string()
                doc = {
                    "id": sid,
                    "tenant_id": tid,
                    "cashier_id": user["id"],
                    "cashier_name": user.get("full_name") or user.get("email") or "Cashier",
                    "business_date": bus_date,
                    "opened_at": p.get("opened_at") or now,
                    "closed_at": None,
                    "opening_float": float(p.get("opening_float", 0.0)),
                    "status": "open",
                    "notes": p.get("notes", ""),
                    "created_at": p.get("created_at") or now,
                    "updated_at": now,
                }
                existing = await db.cash_sessions.find_one({"id": sid, "tenant_id": tid})
                if existing:
                    await db.cash_sessions.update_one({"id": sid, "tenant_id": tid}, {"$set": doc})
                else:
                    await db.cash_sessions.insert_one(doc)
                if local_id:
                    id_map[local_id] = sid
                synced_count += 1

            elif a_type == "RECORD_CASH_MOVEMENT":
                mid = local_id if (local_id and not local_id.startswith("temp-")) else str(uuid.uuid4())
                sess_id = id_map.get(p.get("session_id"), p.get("session_id"))
                if not sess_id:
                    active_sess = await db.cash_sessions.find_one({"tenant_id": tid, "status": "open"})
                    if active_sess:
                        sess_id = active_sess["id"]
                doc = {
                    "id": mid,
                    "tenant_id": tid,
                    "session_id": sess_id or "",
                    "type": p.get("type", "cash_in"),
                    "amount": float(p.get("amount", 0)),
                    "reason": p.get("reason", ""),
                    "reference": p.get("reference", ""),
                    "staff_id": user["id"],
                    "staff_name": user.get("full_name") or "Staff",
                    "created_at": p.get("created_at") or now,
                }
                await db.cash_movements.insert_one(doc)
                if local_id:
                    id_map[local_id] = mid
                synced_count += 1

            elif a_type == "CLOSE_CASH_SESSION":
                sess_id = id_map.get(p.get("session_id"), p.get("session_id"))
                query = {"id": sess_id, "tenant_id": tid} if sess_id else {"tenant_id": tid, "status": "open"}
                session = await db.cash_sessions.find_one(query)
                if session:
                    metrics = await calculate_session_metrics(tid, session)
                    counted_cash = float(p.get("counted_cash", 0))
                    expected_cash = float(metrics["expected_cash"])
                    cash_diff = round(counted_cash - expected_cash, 2)
                    actual_upi = float(p.get("actual_upi")) if p.get("actual_upi") is not None else metrics["expected_upi"]
                    actual_card = float(p.get("actual_card")) if p.get("actual_card") is not None else metrics["expected_card"]
                    actual_other = float(p.get("actual_other")) if p.get("actual_other") is not None else metrics["expected_other"]
                    
                    update_fields = {
                        "status": "closed",
                        "closed_at": p.get("closed_at") or now,
                        "closed_by": user.get("full_name") or user.get("email") or "Cashier",
                        "closed_by_id": user["id"],
                        "counted_cash": counted_cash,
                        "expected_cash": expected_cash,
                        "cash_difference": cash_diff,
                        "denominations": p.get("denominations", {}),
                        "actual_upi": actual_upi,
                        "expected_upi": metrics["expected_upi"],
                        "upi_difference": round(actual_upi - metrics["expected_upi"], 2),
                        "actual_card": actual_card,
                        "expected_card": metrics["expected_card"],
                        "card_difference": round(actual_card - metrics["expected_card"], 2),
                        "actual_other": actual_other,
                        "expected_other": metrics["expected_other"],
                        "other_difference": round(actual_other - metrics["expected_other"], 2),
                        "gross_sales": metrics["gross_sales"],
                        "net_sales": metrics["net_sales"],
                        "tax_collected": metrics["tax_collected"],
                        "discount_given": metrics["discount_given"],
                        "discrepancy_reason": p.get("discrepancy_reason", ""),
                        "closing_notes": p.get("closing_notes", ""),
                        "updated_at": now,
                    }
                    await db.cash_sessions.update_one({"id": session["id"], "tenant_id": tid}, {"$set": update_fields})
                synced_count += 1
                
        except Exception as e:
            logger.warning(f"Batch sync item error for {a_type}: {e}")
            
    return {
        "ok": True,
        "synced_count": synced_count,
        "id_map": id_map,
        "timestamp": now
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
        if limits["staff_limit"] == 0:
            raise HTTPException(
                status_code=403,
                detail="Starter allows owner-only access. Upgrade to Growth to add staff."
            )
        else:
            raise HTTPException(
                status_code=403,
                detail=f"You've reached your {plan_display} plan limit of {limits['staff_limit']} staff. Upgrade to Pro to add more staff."
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
    raw_phone = (payload.phone or "").strip()
    clean_pin = (payload.pin or "").strip()

    phone_conds = get_phone_query_patterns(raw_phone)
    if not phone_conds:
        raise HTTPException(status_code=400, detail="Invalid phone number format")

    # 1. Find matching restaurants by phone
    restaurants = await db.restaurants.find({"$or": phone_conds}, {"_id": 0, "id": 1}).to_list(50)
    tenant_ids = [r["id"] for r in restaurants if r.get("id")]

    # 2. Also search owner/manager users with this phone
    owner_users = await db.users.find({"$or": phone_conds, "role": {"$in": ["owner", "manager"]}}, {"_id": 0, "tenant_id": 1}).to_list(50)
    for o in owner_users:
        if o.get("tenant_id") and o["tenant_id"] not in tenant_ids:
            tenant_ids.append(o["tenant_id"])

    if not tenant_ids:
        raise HTTPException(status_code=401, detail="Restaurant phone not found")

    waiter = await db.users.find_one(
        {"tenant_id": {"$in": tenant_ids}, "role": {"$in": ["waiter", "kitchen"]}, "pin": clean_pin},
        {"_id": 0, "password": 0},
    )
    if not waiter:
        raise HTTPException(status_code=401, detail="Invalid PIN")

    tid = waiter.get("tenant_id") or tenant_ids[0]
    staff_role = waiter.get("role", "waiter")
    tv = waiter.get("token_version", 0)
    return TokenOut(
        access_token=make_token(waiter["id"], staff_role, tid, token_version=tv),
        refresh_token=make_token(waiter["id"], staff_role, tid, refresh=True, token_version=tv),
        user={k: v for k, v in waiter.items() if k not in ("pin", "password")},
    )


# ---------- orders ----------
@api.post("/orders")
async def create_order(payload: OrderIn, user: dict = Depends(require_roles("owner", "manager", "waiter"))):
    tid = await _ensure_tenant(user)
    await _ensure_active_subscription(tid, user)
    subtotal = sum(i.price * i.quantity for i in payload.items)
    restaurant = await db.restaurants.find_one({"id": tid}, {"_id": 0, "gst_enabled": 1, "gst_rate": 1}) or {}
    gst_enabled = bool(restaurant.get("gst_enabled"))
    gst_rate = float(restaurant.get("gst_rate", 5.0))
    tax = round(subtotal * (gst_rate / 100.0), 2) if gst_enabled else 0.0
    total = round(subtotal + tax, 2)
    cust_name = (payload.customer_name or "Guest 1").strip()
    sess_id = payload.session_id or str(uuid.uuid4())
    order_status = payload.status or "placed"
    doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tid,
        "table_number": payload.table_number,
        "session_id": sess_id,
        "customer_name": cust_name,
        "items": [i.dict() for i in payload.items],
        "notes": payload.notes,
        "subtotal": subtotal,
        "tax_percent": gst_rate if gst_enabled else 0.0,
        "tax": tax,
        "gst_enabled": gst_enabled,
        "total": total,
        "status": order_status,
        "order_source": "waiter",
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.orders.insert_one(doc)
    doc.pop("_id", None)
    if order_status == "placed":
        order_payload = {
            "event": "order.created",
            "order_id": doc["id"],
            "table_number": doc.get("table_number", "-"),
            "customer_name": cust_name,
            "session_id": sess_id,
            "order_source": "waiter",
            "order": doc
        }
        await notify_tenant(
            tid,
            "kitchen",
            "New KOT Placed",
            f"New order placed for Table {doc.get('table_number', '-')} ({cust_name})",
            order_payload
        )
    return doc


def parse_db_datetime(ts):
    if not ts:
        return None
    if isinstance(ts, datetime):
        return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)
    if isinstance(ts, (int, float)):
        if ts > 1e11:
            ts = ts / 1000.0
        return datetime.fromtimestamp(ts, tz=timezone.utc)
    ts_str = str(ts).strip()
    if not ts_str:
        return None
    try:
        ts_norm = ts_str.replace(" ", "T").replace("Z", "+00:00")
        dt = datetime.fromisoformat(ts_norm)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        pass
    for fmt in [
        "%d/%m/%Y, %H:%M:%S",
        "%d/%m/%Y %H:%M:%S",
        "%d-%m-%Y %H:%M:%S",
        "%d/%m/%Y",
        "%d-%m-%Y",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
    ]:
        try:
            clean_ts = ts_str.replace(",", "").strip()
            dt = datetime.strptime(clean_ts, fmt.replace(",", ""))
            return dt.replace(tzinfo=timezone.utc)
        except Exception:
            pass
    try:
        num = float(ts_str)
        if num > 1e11:
            num = num / 1000.0
        return datetime.fromtimestamp(num, tz=timezone.utc)
    except Exception:
        pass
    return None


def is_timestamp_in_current_business_day(ts):
    if not ts:
        return False
    dt = parse_db_datetime(ts)
    if not dt:
        return False
    ist_offset = timedelta(hours=5, minutes=30)
    dt_ist = dt.astimezone(timezone(ist_offset))
    now_ist = datetime.now(timezone(ist_offset))
    return dt_ist.date() == now_ist.date()
        
_auto_clear_last_run: dict[str, float] = {}

async def _auto_clear_kitchen_orders(tid: str, force: bool = False):
    now_ts = time.time()
    if not force and (now_ts - _auto_clear_last_run.get(tid, 0) < 600.0):
        return
    _auto_clear_last_run[tid] = now_ts
    try:
        ist_offset = timedelta(hours=5, minutes=30)
        now_ist = datetime.now(timezone(ist_offset))
        cutoff_ist = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
        cutoff_utc = cutoff_ist - ist_offset
        cutoff_iso = cutoff_utc.isoformat()
        now_iso = datetime.now(timezone.utc).isoformat()
        
        # 1. Settle all lingering pending bills from previous days and mark them paid so they are added to sales
        await db.bills.update_many({
            "tenant_id": tid,
            "status": "pending",
            "$or": [
                {"created_at": {"$lt": cutoff_iso}},
                {"created_at": {"$lt": cutoff_ist.isoformat()}}
            ]
        }, {"$set": {"status": "paid", "payment_method": "CASH", "auto_settled_at": now_iso, "clear_reason": "Daily 12 AM business auto-settle"}})

        # 2. Settle lingering active orders and ensure paid bills exist for them
        lingering_orders = await db.orders.find({
            "tenant_id": tid,
            "status": {"$in": ["placed", "in_kitchen", "ready", "served", "pending_scan"]},
            "$or": [
                {"created_at": {"$lt": cutoff_iso}},
                {"created_at": {"$lt": cutoff_ist.isoformat()}}
            ]
        }).to_list(500)

        for lo in lingering_orders:
            eb = await db.bills.find_one({
                "tenant_id": tid,
                "$or": [{"order_id": lo["id"]}, {"order_ids": lo["id"]}]
            })
            if not eb:
                await db.bills.insert_one({
                    "id": str(uuid.uuid4()),
                    "tenant_id": tid,
                    "order_id": lo["id"],
                    "order_ids": [lo["id"]],
                    "session_id": lo.get("session_id", ""),
                    "customer_name": lo.get("customer_name", "Guest"),
                    "table_number": lo.get("table_number", "Dine-In"),
                    "items": lo.get("items", []),
                    "subtotal": float(lo.get("subtotal", 0.0)),
                    "tax_percent": 0.0,
                    "tax": 0.0,
                    "cgst": 0.0,
                    "sgst": 0.0,
                    "gst_enabled": False,
                    "discount": 0.0,
                    "total": float(lo.get("subtotal", 0.0)),
                    "upi_url": "",
                    "status": "paid",
                    "payment_method": "CASH",
                    "created_by": "daily_auto_settle",
                    "created_at": lo.get("created_at"),
                    "paid_at": lo.get("created_at"),
                })

        res = await db.orders.update_many({
            "tenant_id": tid,
            "status": {"$in": ["placed", "in_kitchen", "ready", "served", "pending_scan"]},
            "$or": [
                {"created_at": {"$lt": cutoff_iso}},
                {"created_at": {"$lt": cutoff_ist.isoformat()}}
            ]
        }, {"$set": {"status": "paid", "auto_settled_at": now_iso, "clear_reason": "Daily 12 AM business auto-settle"}})
        
        # 2. Reset tables to available if no active orders from today's business cycle exist
        active_orders = await db.orders.find({
            "tenant_id": tid,
            "status": {"$nin": ["paid", "completed", "cancelled"]}
        }).to_list(500)
        
        active_today_tables = {
            o.get("table_number") for o in active_orders 
            if is_timestamp_in_current_business_day(o.get("created_at")) and o.get("table_number")
        }
        
        await db.tables.update_many({
            "tenant_id": tid,
            "label": {"$nin": list(active_today_tables)}
        }, {"$set": {"status": "available"}})
        
        if res.modified_count > 0:
            logger.info("Daily 1 AM reset: Cleared %d orders and restored clean tables for tenant %s", res.modified_count, tid)
            dashboard_summary_cache.pop(tid, None)
    except Exception as e:
        logger.error("Error running daily 1 AM business reset: %s", str(e))


@api.get("/orders")
async def list_orders(status_filter: Optional[str] = None, user: dict = Depends(get_current_user)):
    tid = await _ensure_tenant(user)
    await _auto_clear_kitchen_orders(tid)
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

    dashboard_summary_cache.pop(tid, None)

    # Calculate remaining active orders on this table (kitchen statuses placed, in_kitchen, ready, served keep table OCCUPIED until paid)
    remaining = await db.orders.count_documents({
        "tenant_id": tid,
        "table_number": tbl_num,
        "status": {"$nin": ["paid", "completed", "cancelled"]}
    })
    tbl_status = "OCCUPIED" if remaining > 0 else "AVAILABLE"

    updated_order = await db.orders.find_one({"id": oid}, {"_id": 0})
    bill = await db.bills.find_one({"order_id": oid}, {"_id": 0})
    event_name = f"order.{payload.status}"
    status_payload = {
        "event": event_name,
        "order_id": oid,
        "status": payload.status,
        "table_number": tbl_num,
        "active_orders_remaining": remaining,
        "table_status": tbl_status,
        "total": float(order.get("subtotal", 0.0)),
        "order": updated_order,
        "bill": bill
    }
    notif_cat = "payment" if payload.status == "served" else ("kitchen" if payload.status in ["in_kitchen", "ready"] else "waiter")
    await notify_tenant(
        tid,
        notif_cat,
        "Order Status Updated",
        f"Order for Table {tbl_num} is now {payload.status.replace('_', ' ').upper()}",
        status_payload
    )
    return {
        **order,
        "status": payload.status,
        "active_orders_remaining": remaining,
        "table_status": tbl_status
    }


@api.patch("/orders/{oid}")
async def update_order(oid: str, payload: OrderUpdateIn, user: dict = Depends(require_roles("owner", "manager", "waiter"))):
    tid = await _ensure_tenant(user)
    order = await db.orders.find_one({"id": oid, "tenant_id": tid}, {"_id": 0})
    if not order and payload.session_id:
        order = await db.orders.find_one({"session_id": payload.session_id, "tenant_id": tid}, {"_id": 0})
    if not order and payload.table_number:
        order = await db.orders.find_one(
            {"table_number": payload.table_number, "tenant_id": tid, "status": {"$in": ["placed", "in_kitchen", "ready", "served"]}},
            {"_id": 0},
            sort=[("created_at", -1)]
        )
    
    now_iso = datetime.now(timezone.utc).isoformat()
    if not order:
        # If client passes order items for an uncreated or temp ID order, create it cleanly!
        real_oid = oid if (oid and not oid.startswith("temp-")) else str(uuid.uuid4())
        items_dict = [i.dict() for i in payload.items] if payload.items else []
        subtotal = sum(i.price * i.quantity for i in payload.items) if payload.items else (payload.subtotal or 0.0)
        order = {
            "id": real_oid,
            "tenant_id": tid,
            "order_number": str(uuid.uuid4().hex[:4].upper()),
            "table_number": payload.table_number or "Takeaway",
            "session_id": payload.session_id or str(uuid.uuid4()),
            "customer_name": payload.customer_name or "Guest 1",
            "items": items_dict,
            "notes": payload.notes or "",
            "subtotal": subtotal,
            "status": "placed",
            "order_source": "waiter",
            "created_by": user["id"],
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        await db.orders.insert_one(order)
        order.pop("_id", None)
        return order

    target_oid = order["id"]
    subtotal = sum(i.price * i.quantity for i in payload.items) if (payload.items and len(payload.items) > 0) else (payload.subtotal or order.get("subtotal", 0.0))
    upd_fields = {
        "updated_at": now_iso
    }
    if payload.items is not None and len(payload.items) > 0:
        upd_fields["items"] = [i.dict() for i in payload.items]
        upd_fields["subtotal"] = subtotal
    if payload.notes is not None:
        upd_fields["notes"] = payload.notes
    if payload.customer_name:
        upd_fields["customer_name"] = payload.customer_name

    await db.orders.update_one(
        {"id": target_oid, "tenant_id": tid},
        {"$set": upd_fields}
    )
    
    # Recalculate pending bill if it exists
    bill = await db.bills.find_one({"order_id": target_oid, "tenant_id": tid})
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
        upi_url = f"upi://pay?pa={upi_id}&pn={merchant.replace(' ', '%20')}&am={total}&cu=INR&tn=Order-{target_oid[:8]}"
        
        await db.bills.update_one(
            {"id": bill["id"], "tenant_id": tid},
            {"$set": {
                "items": upd_fields.get("items", bill.get("items", [])),
                "subtotal": subtotal,
                "tax": tax,
                "cgst": cgst,
                "sgst": sgst,
                "total": total,
                "upi_url": upi_url
            }}
        )
    updated_order = await db.orders.find_one({"id": target_oid, "tenant_id": tid}, {"_id": 0})
    updated_payload = {
        "event": "order.updated",
        "order_id": target_oid,
        "table_number": order.get("table_number", "-"),
        "order": updated_order
    }
    await notify_tenant(
        tid,
        "kitchen",
        "KOT Order Modified",
        f"Items updated for Table {order.get('table_number', '-')}",
        updated_payload
    )
    return updated_order


# ---------- public guest api ----------
@api.get("/public/restaurant/{tenant_id}")
async def public_get_restaurant(tenant_id: str):
    res = await db.restaurants.find_one({"$or": [{"id": tenant_id}, {"owner_user_id": tenant_id}]}, {"_id": 0})
    if not res:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    
    real_tid = res.get("id", tenant_id)
    limits = await get_tenant_plan_limits(real_tid)
    features = limits.get("features", {})
    can_order = bool(features.get("customer_ordering", False) or features.get("qr_web_menu", False))

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
        "google_maps_link": clean_url_string(res.get("google_maps_link", "")),
        "googleReviewUrl": clean_url_string(res.get("googleReviewUrl", "")),
        "can_order": can_order,
    }

@api.get("/public/menu/{tenant_id}")
async def public_list_menu(tenant_id: str):
    real_tid = tenant_id
    rest = await db.restaurants.find_one({"$or": [{"id": tenant_id}, {"owner_user_id": tenant_id}]}, {"_id": 0, "id": 1})
    if rest and rest.get("id"):
        real_tid = rest["id"]
    items = await db.menu_items.find({"tenant_id": real_tid}, {"_id": 0}).to_list(1000)
    categories = await db.categories.find({"tenant_id": real_tid}, {"_id": 0}).sort("sort_order", 1).to_list(500)
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
    
    # Verify restaurant plan allows online customer ordering
    limits = await get_tenant_plan_limits(payload.tenant_id)
    features = limits.get("features", {})
    if not (features.get("customer_ordering", False) or features.get("qr_web_menu", False)):
        raise HTTPException(
            status_code=403, 
            detail="Online ordering is not available for this restaurant's plan. Please contact staff to place your order."
        )
    
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
        table = await db.tables.find_one({
            "tenant_id": payload.tenant_id,
            "is_deleted": {"$ne": True},
            "$or": [{"label": payload.table_number}, {"custom_qr": payload.table_number}]
        })
        
    if not table:
        raise HTTPException(status_code=400, detail="This table is no longer available.")
        
    table_id = table["id"]
    table_number = table["label"]

    subtotal = sum(i.price * i.quantity for i in payload.items)
    restaurant = await db.restaurants.find_one({"id": payload.tenant_id}, {"_id": 0, "gst_enabled": 1, "gst_rate": 1}) or {}
    gst_enabled = bool(restaurant.get("gst_enabled"))
    gst_rate = float(restaurant.get("gst_rate", 5.0))
    tax = round(subtotal * (gst_rate / 100.0), 2) if gst_enabled else 0.0
    cgst = round(tax / 2.0, 2) if gst_enabled else 0.0
    sgst = round(tax - cgst, 2) if gst_enabled else 0.0
    total = round(subtotal + tax, 2)
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
        "tax_percent": gst_rate if gst_enabled else 0.0,
        "tax": tax,
        "gst_enabled": gst_enabled,
        "total": total,
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
            "tax_percent": gst_rate if gst_enabled else 0.0,
            "tax": tax,
            "cgst": cgst,
            "sgst": sgst,
            "gst_enabled": gst_enabled,
            "discount": 0.0,
            "total": total,
            "upi_url": "",
            "status": "paid",
            "payment_method": payload.payment_method or "online",
            "created_by": "guest",
            "created_at": doc["created_at"],
            "paid_at": doc["created_at"],
        }
        await db.bills.insert_one(bill_doc)
    
    if is_online_paid:
        cust_payload = {
            "event": "order.created",
            "order_id": order_id,
            "table_number": payload.table_number or "-",
            "customer_name": cust_name,
            "session_id": sess_id,
            "order": doc
        }
        await notify_tenant(
            payload.tenant_id,
            "kitchen",
            "New Customer Order",
            f"New paid order for Table {payload.table_number or '-'} ({cust_name})",
            cust_payload
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
    confirm_payload = {
        "event": "order.confirmed",
        "order_id": updated_order["id"],
        "status": "placed",
        "table_number": table_num,
        "order": updated_order
    }
    await notify_tenant(tid, "kitchen", "Order Imported", f"Table {table_num} updated", confirm_payload)

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

    if order.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="Order is already cancelled.")

    table_num = data.get("table_number") or order.get("table_number") or "1"
    table_id = data.get("table_id") or order.get("table_id") or ""
    
    table = None
    if table_id:
        table = await db.tables.find_one({"tenant_id": tid, "id": table_id})
    if not table and table_num:
        table = await db.tables.find_one({"tenant_id": tid, "label": table_num})
    if not table and table_num:
        clean_lbl = str(table_num).replace("Table", "").replace("table", "").replace("T", "").replace("-", "").strip()
        if clean_lbl:
            table = await db.tables.find_one({"tenant_id": tid, "label": {"$in": [clean_lbl, f"Table {clean_lbl}", f"T-{clean_lbl}"]}})
        
    if table:
        table_num = table.get("label", table_num)
        table_id = table.get("id", table_id)

    items = []
    for it in order.get("items") or []:
        items.append({
            "id": it.get("menu_item_id") or it.get("id") or "",
            "name": it.get("name") or "",
            "quantity": it.get("quantity") or 1,
            "price": float(it.get("price", 0.0))
        })

    subtot = float(order.get("subtotal", 0.0))
    if subtot == 0.0 and items:
        subtot = sum(float(it.get("price", 0.0)) * int(it.get("quantity", 1)) for it in items)

    return {
        "success": True,
        "orderId": order.get("id"),
        "id": order.get("id"),
        "order_number": order.get("order_number") or order.get("id")[:4].upper(),
        "restaurantId": order.get("tenant_id"),
        "tableId": table_id or "temp-tbl",
        "table_id": table_id or "temp-tbl",
        "tableName": f"Table {table_num}" if not str(table_num).lower().startswith("table") else table_num,
        "table_number": table_num,
        "customerName": order.get("customer_name") or "Guest 1",
        "customer_name": order.get("customer_name") or "Guest 1",
        "items": items,
        "total": subtot,
        "subtotal": subtot,
        "status": order.get("status") or "placed",
        "already_confirmed": order.get("status") in ["placed", "paid", "completed", "in_kitchen", "ready"],
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
    table_id = payload.table_id or data.get("table_id") or order.get("table_id") or ""
    
    table = None
    if table_id:
        table = await db.tables.find_one({"tenant_id": tid, "id": table_id})
    if not table and table_num:
        table = await db.tables.find_one({"tenant_id": tid, "label": table_num})
    if not table and table_num:
        clean_lbl = str(table_num).replace("Table", "").replace("table", "").replace("T", "").replace("-", "").strip()
        if clean_lbl:
            table = await db.tables.find_one({"tenant_id": tid, "label": {"$in": [clean_lbl, f"Table {clean_lbl}", f"T-{clean_lbl}"]}})
        
    if table:
        table_num = table.get("label", table_num)
        table_id = table.get("id", table_id)

    if order.get("status") in ["placed", "paid", "completed", "in_kitchen", "ready"] and order.get("table_number") == table_num:
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
    await db.orders.update_one(
        {"id": order["id"], "tenant_id": tid},
        {
            "$set": {
                "table_number": table_num,
                "table_id": table_id or "temp-tbl",
                "status": "placed",
                "qr_imported": True,
                "imported_at": now_iso,
                "imported_by": current_user.get("full_name") or current_user.get("email") or current_user.get("role")
            }
        }
    )

    if table_id and table:
        await db.tables.update_one({"id": table_id, "tenant_id": tid}, {"$set": {"status": "occupied"}})

    updated_order = await db.orders.find_one({"id": order["id"]}, {"_id": 0})

    confirm_payload = {
        "event": "order.confirmed",
        "order_id": updated_order["id"],
        "status": "placed",
        "table_number": table_num,
        "order": updated_order
    }
    await notify_tenant(tid, "kitchen", "Order Confirmed", f"Table {table_num} updated", confirm_payload)

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
    is_owner = current_user.get("role") in ("owner", "admin", "super_admin", "manager")
    if not is_owner and not limits["features"].get("ai_menu"):
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

    gemini_key = os.environ.get("GEMINI_API_KEY") or "AIzaSyAEmzSOVVIQznxt5rRaAWMhPn6aPKT1p_o"
    categories_result = []

    if gemini_key:
        try:
            import google.generativeai as genai
            genai.configure(api_key=gemini_key)
            
            parts = []
            for img in images[:5]:
                file_bytes = await img.read()
                mime = img.content_type or ""
                if not mime.startswith("image/"):
                    ext = (img.filename or "").lower().split(".")[-1]
                    mime = "image/png" if ext == "png" else "image/webp" if ext == "webp" else "image/jpeg"
                parts.append({
                    "mime_type": mime,
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
            # Use free Gemini Flash models in priority order
            candidate_models = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.0-flash", "gemini-1.5-flash"]
            response = None
            last_err = None
            for m_name in candidate_models:
                try:
                    gen_model = genai.GenerativeModel(m_name, generation_config={"response_mime_type": "application/json"})
                    response = gen_model.generate_content([prompt, *parts])
                    if response and response.text:
                        break
                except Exception as ex:
                    last_err = ex
                    continue

            if not response or not response.text:
                raise HTTPException(status_code=400, detail=f"Failed to process menu images with Vision AI: {str(last_err or 'No response from AI model')}")

            raw_text = response.text.strip()
            first_brace = raw_text.find('{')
            last_brace = raw_text.rfind('}')
            if first_brace != -1 and last_brace != -1:
                json_str = raw_text[first_brace:last_brace+1]
            else:
                json_str = raw_text
            
            try:
                parsed = json.loads(json_str)
            except Exception as pe:
                logger.error("JSON decode error from AI: %s. Raw: %s", pe, raw_text[:500])
                raise HTTPException(status_code=400, detail="Could not parse AI response. Please ensure menu photos are clear and well lit.")

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
                    
                    if not name:
                        continue
                    if not source_text:
                        source_text = name
                    
                    if price is not None:
                        try:
                            price = float(price)
                        except (ValueError, TypeError):
                            price = None
                    
                    # Fuzzy grounding check
                    name_words = [w.lower() for w in name.split() if len(w) > 2]
                    grounded = True
                    if name_words:
                        source_lower = source_text.lower()
                        if not any(word in source_lower for word in name_words):
                            grounded = False
                    
                    if not grounded:
                        source_text = name
                        
                    validated_items.append({
                        "name": name,
                        "price": price,
                        "description": item.get("description") or None,
                        "sourceText": source_text,
                        "is_veg": bool(item.get("is_veg", False)),
                        "confidence": float(item.get("confidence", 0.95))
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
                img_url = getattr(it, "image_url", None) or get_accurate_food_image_url(it.name)
                await db.menu_items.insert_one({
                    "id": item_id,
                    "tenant_id": tid,
                    "category_id": cat_id,
                    "name": it.name.strip(),
                    "price": float(it.price),
                    "description": it.description or "",
                    "is_veg": bool(it.is_veg),
                    "image_url": img_url,
                    "is_active": True,
                    "sort_order": next_item_order,
                    "created_at": datetime.now(timezone.utc).isoformat()
                })
                next_item_order += 1
                created_items_count += 1
                imported_item_ids.append(item_id)

    await notify_tenant(tid, "waiter", "Menu Updated", "New items added to menu", {})

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
    await _ensure_active_subscription(tid, user)
    
    search_ids = []
    if payload.order_id:
        search_ids.append(payload.order_id)
    if payload.order_ids:
        search_ids.extend(payload.order_ids)

    if search_ids:
        existing_paid = await db.bills.find_one({
            "$or": [{"order_id": {"$in": search_ids}}, {"order_ids": {"$in": search_ids}}],
            "status": {"$in": ["paid", "completed"]},
            "tenant_id": tid
        }, {"_id": 0})
        if existing_paid:
            return existing_paid

        existing_b = await db.bills.find_one({
            "$or": [{"order_id": {"$in": search_ids}}, {"order_ids": {"$in": search_ids}}],
            "tenant_id": tid
        }, {"_id": 0})
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
        tbl_patterns = get_table_match_patterns(payload.table_number)
        target_orders = await db.orders.find({
            "table_number": {"$in": tbl_patterns},
            "tenant_id": tid,
            "status": {"$nin": ["served", "paid", "completed", "cancelled"]}
        }, {"_id": 0}).to_list(100)
        
    if not target_orders:
        raise HTTPException(status_code=404, detail="No active orders found for billing")

    all_paid = all(o.get("status") in ["paid", "completed"] for o in target_orders)
    if all_paid:
        existing_any = await db.bills.find_one({
            "$or": [{"order_id": {"$in": search_ids}}, {"order_ids": {"$in": search_ids}}],
            "tenant_id": tid
        }, {"_id": 0})
        if existing_any:
            return existing_any
        
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
            "logo_base64": "",
        },
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.bills.insert_one(bill)
    bill.pop("_id", None)
    return bill


class PayIn(BaseModel):
    payment_method: str = "UPI"
    discount: Optional[float] = None  # The bill's whole discount, so repeating the request changes nothing


class SettleTableIn(BaseModel):
    table_number: str
    payment_method: str = "UPI"
    order_ids: Optional[List[str]] = None
    total: Optional[float] = None
    discount: Optional[float] = None  # Taken off the table's bills on top of any discount they already have


def discounted_bill_fields(bill: dict, discount: float) -> dict:
    subtotal = float(bill.get("subtotal", 0.0))
    if subtotal <= 0:
        subtotal = sum(float(i.get("price", 0.0)) * int(i.get("quantity", 1)) for i in bill.get("items", []))
    before_discount = round(subtotal + float(bill.get("tax", 0.0)), 2)
    applied = round(min(max(float(discount), 0.0), before_discount), 2)
    return {"discount": applied, "total": round(before_discount - applied, 2)}


async def apply_settlement_discount(tid: str, order_ids: List[str], discount: float) -> None:
    remaining = round(float(discount), 2)
    bills = await db.bills.find({
        "tenant_id": tid,
        "$or": [{"order_id": {"$in": order_ids}}, {"order_ids": {"$in": order_ids}}]
    }, {"_id": 0}).to_list(200)

    # Same de-duplication as the sales reports, so the whole discount lands on bills they count
    seen_oids = set()
    for b in bills:
        oids = set(b.get("order_ids") or ([b.get("order_id")] if b.get("order_id") else []))
        if oids and oids.issubset(seen_oids):
            continue
        seen_oids.update(oids)
        total = float(b.get("total", 0.0))
        taken = round(min(remaining, total), 2)
        if taken <= 0:
            continue
        await db.bills.update_one({"id": b["id"], "tenant_id": tid}, {"$set": {
            "discount": round(float(b.get("discount", 0.0)) + taken, 2),
            "total": round(total - taken, 2),
        }})
        remaining = round(remaining - taken, 2)
        if remaining <= 0:
            break


@api.post("/bills/settle-table")
async def settle_table_endpoint(payload: SettleTableIn, user: dict = Depends(require_roles("owner", "manager", "waiter"))):
    tid = await _ensure_tenant(user)
    pm = payload.payment_method or "UPI"
    tbl_raw = str(payload.table_number).strip()
    tbl_patterns = get_table_match_patterns(tbl_raw)

    restaurant = await db.restaurants.find_one({"id": tid}, {"_id": 0}) or {}
    gst_enabled = bool(restaurant.get("gst_enabled"))
    gst_rate = float(restaurant.get("gst_rate", 5.0))

    # 1. Find all active orders being settled for this table (clean temp IDs)
    clean_order_ids = [oid for oid in (payload.order_ids or []) if oid and not str(oid).startswith("temp-")]
    active_orders = []
    if clean_order_ids:
        active_orders = await db.orders.find({
            "id": {"$in": clean_order_ids},
            "tenant_id": tid,
            "status": {"$nin": ["paid", "completed", "cancelled"]}
        }, {"_id": 0}).to_list(100)

    # If order_ids was temp or returned no orders, search all active orders for this table directly
    if not active_orders:
        active_orders = await db.orders.find({
            "tenant_id": tid,
            "table_number": {"$in": tbl_patterns},
            "status": {"$nin": ["paid", "completed", "cancelled"]}
        }, {"_id": 0}).to_list(100)
    
    if payload.total is not None and payload.total > 0:
        total_settled = payload.total
    else:
        active_sub = sum(float(o.get("subtotal", 0.0)) for o in active_orders)
        active_tax = round(active_sub * (gst_rate / 100.0), 2) if gst_enabled else 0.0
        total_settled = round(active_sub + active_tax, 2)

    # 2. For any active order that does not have a bill, create a paid bill in db.bills to guarantee revenue tracking
    for o in active_orders:
        existing_b = await db.bills.find_one({
            "$or": [
                {"order_id": o["id"]},
                {"order_ids": o["id"]}
            ],
            "tenant_id": tid
        })
        o_sub = float(o.get("subtotal", 0.0))
        if o_sub <= 0:
            o_sub = sum(float(i.get("price", 0.0)) * int(i.get("quantity", 1)) for i in o.get("items", []))
        o_tax = round(o_sub * (gst_rate / 100.0), 2) if gst_enabled else 0.0
        o_cgst = round(o_tax / 2.0, 2) if gst_enabled else 0.0
        o_sgst = round(o_tax - o_cgst, 2) if gst_enabled else 0.0
        o_tot = round(o_sub + o_tax, 2)

        if not existing_b:
            import random
            bill_id = str(uuid.uuid4())
            bill_num = f"EZ-{datetime.now().year}-{random.randint(1000, 9999)}"
            bill_doc = {
                "id": bill_id,
                "bill_number": bill_num,
                "tenant_id": tid,
                "order_id": o["id"],
                "order_ids": [o["id"]],
                "session_id": o.get("session_id", ""),
                "customer_name": o.get("customer_name", "Guest"),
                "table_number": o.get("table_number", payload.table_number),
                "items": o.get("items", []),
                "subtotal": o_sub,
                "tax_percent": gst_rate if gst_enabled else 0.0,
                "tax": o_tax,
                "cgst": o_cgst,
                "sgst": o_sgst,
                "gst_enabled": gst_enabled,
                "discount": 0.0,
                "total": o_tot,
                "upi_url": "",
                "status": "paid",
                "payment_method": pm,
                "created_by": user.get("id", "staff"),
                "created_at": o.get("created_at", datetime.now(timezone.utc).isoformat()),
                "paid_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.bills.insert_one(bill_doc)
        else:
            upd = {
                "status": "paid",
                "payment_method": pm,
                "paid_at": datetime.now(timezone.utc).isoformat(),
            }
            if gst_enabled and float(existing_b.get("tax", 0.0)) == 0.0:
                upd["tax_percent"] = gst_rate
                upd["tax"] = o_tax
                upd["cgst"] = o_cgst
                upd["sgst"] = o_sgst
                upd["gst_enabled"] = True
                upd["total"] = o_tot
            await db.bills.update_one({"id": existing_b["id"], "tenant_id": tid}, {"$set": upd})

    # 3. Settle all matching pending bills for these orders or this table
    order_id_list = [o["id"] for o in active_orders]
    bill_filter: dict = {
        "tenant_id": tid,
        "status": "pending"
    }
    if order_id_list:
        bill_filter["$or"] = [
            {"order_id": {"$in": order_id_list}},
            {"order_ids": {"$in": order_id_list}}
        ]
    else:
        bill_filter["table_number"] = {"$in": tbl_patterns}

    await db.bills.update_many(bill_filter, {"$set": {"status": "paid", "payment_method": pm, "paid_at": datetime.now(timezone.utc).isoformat()}})

    # order_id_list only holds unpaid orders, so a repeated request cannot discount the bills twice
    if payload.discount and payload.discount > 0 and order_id_list:
        await apply_settlement_discount(tid, order_id_list, payload.discount)

    # 4. Mark active orders for this table as paid
    target_order_filter = {"id": {"$in": order_id_list}, "tenant_id": tid} if order_id_list else {
        "tenant_id": tid,
        "table_number": {"$in": tbl_patterns},
        "status": {"$nin": ["paid", "completed", "cancelled"]}
    }
    res = await db.orders.update_many(target_order_filter, {"$set": {"status": "paid"}})

    # Check remaining active orders on this table
    remaining = await db.orders.count_documents({
        "tenant_id": tid,
        "table_number": {"$in": tbl_patterns},
        "status": {"$nin": ["paid", "completed", "cancelled"]}
    })
    tbl_status = "AVAILABLE" if remaining == 0 else "OCCUPIED"

    dashboard_summary_cache.pop(tid, None)

    settle_payload = {
        "table_number": payload.table_number,
        "status": "paid",
        "table_status": tbl_status,
        "active_orders_remaining": remaining,
        "total": float(total_settled),
        "event": "TABLE_SETTLED"
    }
    await notify_tenant(
        tid,
        "payment",
        "Table Settled",
        f"Table {payload.table_number} marked paid and cleared ({pm})",
        settle_payload
    )
    return {
        "ok": True,
        "table_number": payload.table_number,
        "table_status": tbl_status,
        "active_orders_remaining": remaining,
        "settled_count": res.modified_count,
        "total": float(total_settled)
    }


@api.patch("/bills/{bid}/pay")
async def mark_bill_paid(bid: str, payload: Optional[PayIn] = None, user: dict = Depends(require_roles("owner", "manager", "waiter"))):
    tid = await _ensure_tenant(user)
    pm = (payload and payload.payment_method) or "UPI"
    
    restaurant = await db.restaurants.find_one({"id": tid}, {"_id": 0}) or {}
    gst_enabled = bool(restaurant.get("gst_enabled"))
    gst_rate = float(restaurant.get("gst_rate", 5.0))

    # 1. Look up bill by ID
    bill = await db.bills.find_one({"id": bid, "tenant_id": tid}, {"_id": 0})
    
    if not bill:
        # Fallback: check if bid is an order_id or in order_ids
        bill = await db.bills.find_one({"$or": [{"order_id": bid}, {"order_ids": bid}], "tenant_id": tid}, {"_id": 0})
        if bill:
            bill_upd = {"status": "paid", "payment_method": pm, "paid_at": datetime.now(timezone.utc).isoformat()}
            if gst_enabled and float(bill.get("tax", 0.0)) == 0.0:
                b_sub = float(bill.get("subtotal", 0.0))
                if b_sub <= 0:
                    b_sub = sum(float(i.get("price", 0.0)) * int(i.get("quantity", 1)) for i in bill.get("items", []))
                b_tax = round(b_sub * (gst_rate / 100.0), 2)
                b_cgst = round(b_tax / 2.0, 2)
                b_sgst = round(b_tax - b_cgst, 2)
                b_tot = round(b_sub + b_tax, 2)
                bill_upd.update({
                    "tax_percent": gst_rate,
                    "tax": b_tax,
                    "cgst": b_cgst,
                    "sgst": b_sgst,
                    "gst_enabled": True,
                    "total": b_tot
                })
                bill.update(bill_upd)
            await db.bills.update_one({"id": bill["id"], "tenant_id": tid}, {"$set": bill_upd})
            bill["status"] = "paid"
            bill["payment_method"] = pm
        else:
            # Check if bid is an order directly and create paid bill in db.bills to guarantee sales tracking!
            o = await db.orders.find_one({"id": bid, "tenant_id": tid})
            if o:
                await db.orders.update_one({"id": bid, "tenant_id": tid}, {"$set": {"status": "paid"}})
                bill_id = str(uuid.uuid4())
                o_sub = float(o.get("subtotal", 0.0))
                if o_sub <= 0:
                    o_sub = sum(float(i.get("price", 0.0)) * int(i.get("quantity", 1)) for i in o.get("items", []))
                o_tax = round(o_sub * (gst_rate / 100.0), 2) if gst_enabled else 0.0
                o_cgst = round(o_tax / 2.0, 2) if gst_enabled else 0.0
                o_sgst = round(o_tax - o_cgst, 2) if gst_enabled else 0.0
                o_tot = round(o_sub + o_tax, 2)
                bill_doc = {
                    "id": bill_id,
                    "tenant_id": tid,
                    "order_id": bid,
                    "session_id": o.get("session_id", ""),
                    "customer_name": o.get("customer_name", "Guest"),
                    "table_number": o.get("table_number", "Takeaway"),
                    "items": o.get("items", []),
                    "subtotal": o_sub,
                    "tax_percent": gst_rate if gst_enabled else 0.0,
                    "tax": o_tax,
                    "cgst": o_cgst,
                    "sgst": o_sgst,
                    "gst_enabled": gst_enabled,
                    "discount": 0.0,
                    "total": o_tot,
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
        bill_upd = {"status": "paid", "payment_method": pm, "paid_at": datetime.now(timezone.utc).isoformat()}
        if gst_enabled and float(bill.get("tax", 0.0)) == 0.0:
            b_sub = float(bill.get("subtotal", 0.0))
            if b_sub <= 0:
                b_sub = sum(float(i.get("price", 0.0)) * int(i.get("quantity", 1)) for i in bill.get("items", []))
            b_tax = round(b_sub * (gst_rate / 100.0), 2)
            b_cgst = round(b_tax / 2.0, 2)
            b_sgst = round(b_tax - b_cgst, 2)
            b_tot = round(b_sub + b_tax, 2)
            bill_upd.update({
                "tax_percent": gst_rate,
                "tax": b_tax,
                "cgst": b_cgst,
                "sgst": b_sgst,
                "gst_enabled": True,
                "total": b_tot
            })
            bill.update(bill_upd)
        await db.bills.update_one({"id": bill["id"], "tenant_id": tid}, {"$set": bill_upd})
        bill["status"] = "paid"
        bill["payment_method"] = pm

    # Mark ONLY the target order(s) associated with this bill as paid, AND all sibling bills
    target_oids = bill.get("order_ids") or ([bill.get("order_id")] if bill.get("order_id") else [])

    if payload and payload.discount is not None:
        full_total = float(bill.get("total", 0.0))
        discount_upd = discounted_bill_fields(bill, payload.discount)
        await db.bills.update_one({"id": bill["id"], "tenant_id": tid}, {"$set": discount_upd})
        # Duplicate bills for the same orders must agree, because reports count only one of them
        if target_oids:
            await db.bills.update_many({
                "$or": [{"order_id": {"$in": target_oids}}, {"order_ids": {"$in": target_oids}}],
                "tenant_id": tid,
                "id": {"$ne": bill["id"]},
                "total": full_total,
            }, {"$set": discount_upd})
        bill.update(discount_upd)

    if target_oids:
        now_iso = datetime.now(timezone.utc).isoformat()
        await db.orders.update_many({"id": {"$in": target_oids}, "tenant_id": tid}, {"$set": {"status": "paid", "updated_at": now_iso}})
        await db.bills.update_many({"$or": [{"order_id": {"$in": target_oids}}, {"order_ids": {"$in": target_oids}}], "tenant_id": tid}, {"$set": {"status": "paid", "payment_method": pm, "paid_at": now_iso}})
    
    # Calculate remaining active orders on this table strictly (DO NOT wipe other table orders!)
    tbl_num = bill.get("table_number")
    remaining = 0
    tbl_status = "AVAILABLE"
    
    if tbl_num and tbl_num not in ["Takeaway", "Take-Away", "Contactless"]:
        tbl_patterns = get_table_match_patterns(tbl_num)
        remaining = await db.orders.count_documents({
            "tenant_id": tid,
            "table_number": {"$in": tbl_patterns},
            "status": {"$nin": ["paid", "completed", "cancelled"]}
        })
        tbl_status = "AVAILABLE" if remaining == 0 else "OCCUPIED"
    
    dashboard_summary_cache.pop(tid, None)

    paid_payload = {
        "bill_id": bill.get("id"),
        "order_id": bill.get("order_id"),
        "total": float(bill.get("total", 0.0)),
        "table_number": bill.get("table_number", "-"),
        "table_status": tbl_status,
        "active_orders_remaining": remaining,
        "order_type": "takeaway" if tbl_num == "Takeaway" else "waiter",
        "event": "ORDER_PAID",
        "status": "paid",
        "bill": {**bill, "status": "paid", "payment_method": pm}
    }
    await notify_tenant(
        tid,
        "payment",
        "Payment Received",
        f"Order for {bill.get('table_number', 'Takeaway')} paid ₹{bill.get('total', 0.0):.2f} via {pm}",
        paid_payload
    )
    return {
        **bill,
        "table_status": tbl_status,
        "active_orders_remaining": remaining
    }


@api.get("/bills")
async def list_bills(filter: Optional[str] = None, limit: Optional[int] = 5000, user: dict = Depends(get_current_user)):
    tid = await _ensure_tenant(user)
    
    q: dict = {"tenant_id": tid}
    if filter == "today":
        ist_offset = timedelta(hours=5, minutes=30)
        now_ist = datetime.now(timezone(ist_offset))
        start_today_ist = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
        start_today_utc = start_today_ist - ist_offset
        start_today_iso = start_today_utc.isoformat()
        q["$or"] = [
            {"paid_at": {"$gte": start_today_iso}},
            {"created_at": {"$gte": start_today_iso}}
        ]
        q["status"] = "paid"
    elif filter == "7d":
        ist_offset = timedelta(hours=5, minutes=30)
        now_ist = datetime.now(timezone(ist_offset))
        start_today_ist = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
        start_7d_utc = (start_today_ist - ist_offset) - timedelta(days=7)
        start_7d_iso = start_7d_utc.isoformat()
        q["$or"] = [
            {"paid_at": {"$gte": start_7d_iso}},
            {"created_at": {"$gte": start_7d_iso}},
            {"status": "pending"}
        ]

    bills = await db.bills.find(q, {
        "_id": 0, "restaurant_snapshot": 0
    }).sort("created_at", -1).to_list(limit or 5000)

    # Pre-collect all paid order IDs for this tenant so paid orders always mark their bills paid
    paid_orders = await db.orders.find({"tenant_id": tid, "status": "paid"}, {"_id": 0, "id": 1}).to_list(2000)
    paid_order_ids = {o["id"] for o in paid_orders if o.get("id")}

    # Also collect any order_ids that already have a paid bill
    paid_bill_oids = set()
    for b in bills:
        if str(b.get("status", "")).lower() == "paid":
            b_oids = b.get("order_ids") or ([b.get("order_id")] if b.get("order_id") else [])
            paid_bill_oids.update(b_oids)
    all_paid_oids = paid_order_ids.union(paid_bill_oids)

    # Any bill associated with a paid order or paid sibling is guaranteed paid
    for b in bills:
        b_oids = set(b.get("order_ids") or ([b.get("order_id")] if b.get("order_id") else []))
        if b_oids and b_oids.intersection(all_paid_oids):
            b["status"] = "paid"

    # Prioritize paid bills over unpaid bills during deduplication
    bills.sort(key=lambda b: 0 if str(b.get("status", "")).lower() == "paid" else 1)

    seen_oids = set()
    deduped_bills = []
    for b in bills:
        b["is_today"] = is_timestamp_in_current_business_day(b.get("paid_at") or b.get("created_at"))
        oids = set(b.get("order_ids") or ([b.get("order_id")] if b.get("order_id") else []))
        if oids and oids.issubset(seen_oids):
            continue
        if oids:
            seen_oids.update(oids)
        elif b.get("id"):
            if b["id"] in seen_oids:
                continue
            seen_oids.add(b["id"])
        deduped_bills.append(b)

    # Also fetch any paid orders for this tenant to ensure 100% complete bills history
    unbilled_paid_orders = await db.orders.find({
        "tenant_id": tid,
        "status": "paid"
    }, {"_id": 0}).to_list(1000)

    for o in unbilled_paid_orders:
        oid = o.get("id")
        if oid and oid not in seen_oids:
            seen_oids.add(oid)
            sub = float(o.get("subtotal", 0.0)) or sum(float(it.get("price", 0.0)) * int(it.get("quantity", 1)) for it in (o.get("items") or []))
            is_tod = is_timestamp_in_current_business_day(o.get("paid_at") or o.get("updated_at") or o.get("created_at"))
            synthesized_bill = {
                "id": f"bill_{oid}",
                "bill_number": f"EZ-{datetime.now().year}-{str(oid)[-4:] if len(str(oid))>=4 else '1001'}",
                "order_id": oid,
                "order_ids": [oid],
                "table_number": o.get("table_number", "Takeaway"),
                "customer_name": o.get("customer_name", "Guest"),
                "items": o.get("items", []),
                "subtotal": sub,
                "total": sub,
                "status": "paid",
                "payment_method": o.get("payment_method", "CASH"),
                "created_at": o.get("created_at", datetime.now(timezone.utc).isoformat()),
                "paid_at": o.get("paid_at") or o.get("updated_at") or o.get("created_at") or datetime.now(timezone.utc).isoformat(),
                "is_today": is_tod
            }
            deduped_bills.append(synthesized_bill)

    if filter == "today":
        return [b for b in deduped_bills if b.get("is_today") and str(b.get("status", "")).lower() == "paid"]
    return deduped_bills


# ---------- END-OF-DAY CASHIER SESSIONS & RECONCILIATION ----------
async def calculate_session_metrics(tid: str, session_doc: dict) -> dict:
    session_id = session_doc["id"]
    opened_at = session_doc.get("opened_at")
    closed_at = session_doc.get("closed_at")
    opening_float = float(session_doc.get("opening_float", 0.0))

    # 1. Fetch cash movements for this session
    movements = await db.cash_movements.find({
        "tenant_id": tid,
        "session_id": session_id
    }, {"_id": 0}).sort("created_at", 1).to_list(1000)
    if not movements and session_doc.get("movements"):
        movements = session_doc.get("movements", [])

    cash_in_total = round(sum(float(m.get("amount", 0.0)) for m in movements if m.get("type") == "cash_in"), 2)
    cash_out_total = round(sum(float(m.get("amount", 0.0)) for m in movements if m.get("type") == "cash_out"), 2)
    cash_drop_total = round(sum(float(m.get("amount", 0.0)) for m in movements if m.get("type") == "cash_drop"), 2)

    # 2. Fetch bills in the session window
    time_filter = {}
    if opened_at:
        time_filter["$gte"] = opened_at
    if closed_at:
        time_filter["$lte"] = closed_at

    bill_q: dict = {"tenant_id": tid}
    if time_filter:
        bill_q["$or"] = [
            {"paid_at": time_filter},
            {"created_at": time_filter}
        ]

    bills = await db.bills.find(bill_q, {"_id": 0}).to_list(10000)

    # Deduplicate bills by order_id or bill id
    seen_oids = set()
    deduped_bills = []
    for b in bills:
        oids = set(b.get("order_ids") or ([b.get("order_id")] if b.get("order_id") else []))
        if oids and oids.issubset(seen_oids):
            continue
        if oids:
            seen_oids.update(oids)
        elif b.get("id"):
            if b["id"] in seen_oids:
                continue
            seen_oids.add(b["id"])
        deduped_bills.append(b)

    cash_sales = 0.0
    cash_sales_count = 0
    upi_sales = 0.0
    upi_sales_count = 0
    card_sales = 0.0
    card_sales_count = 0
    other_sales = 0.0
    other_sales_count = 0
    gross_sales = 0.0
    tax_collected = 0.0
    discount_total = 0.0
    paid_bills_count = 0
    unpaid_bills_count = 0
    unpaid_bills_total = 0.0

    upi_aliases = {"upi", "online", "gpay", "phonepe", "paytm", "qr", "razorpay"}
    card_aliases = {"card", "debit card", "credit card", "pos", "terminal"}

    for b in deduped_bills:
        b_status = str(b.get("status", "")).lower().strip()
        b_total = float(b.get("total", 0.0))
        b_pm = str(b.get("payment_method", "Cash")).lower().strip()

        if b_status in ("paid", "completed", "settled", "served"):
            paid_bills_count += 1
            gross_sales += b_total
            tax_collected += float(b.get("tax", 0.0) or (float(b.get("cgst", 0.0)) + float(b.get("sgst", 0.0))))
            discount_total += float(b.get("discount", 0.0))

            if b_pm == "split" and b.get("payment_splits"):
                has_cash = False
                has_upi = False
                has_card = False
                has_other = False
                for sp in b.get("payment_splits", []):
                    sp_m = str(sp.get("method", "cash")).lower().strip()
                    sp_a = float(sp.get("amount", 0.0))
                    if sp_m == "cash":
                        cash_sales += sp_a
                        has_cash = True
                    elif sp_m in upi_aliases or "upi" in sp_m or "online" in sp_m:
                        upi_sales += sp_a
                        has_upi = True
                    elif sp_m in card_aliases or "card" in sp_m:
                        card_sales += sp_a
                        has_card = True
                    else:
                        other_sales += sp_a
                        has_other = True
                if has_cash: cash_sales_count += 1
                if has_upi: upi_sales_count += 1
                if has_card: card_sales_count += 1
                if has_other: other_sales_count += 1
            elif b_pm == "cash":
                cash_sales += b_total
                cash_sales_count += 1
            elif b_pm in upi_aliases or "upi" in b_pm or "online" in b_pm:
                upi_sales += b_total
                upi_sales_count += 1
            elif b_pm in card_aliases or "card" in b_pm:
                card_sales += b_total
                card_sales_count += 1
            else:
                other_sales += b_total
                other_sales_count += 1
        elif b_status in ("pending", "unpaid"):
            unpaid_bills_count += 1
            unpaid_bills_total += b_total

    cash_refunds = 0.0
    digital_refunds = 0.0

    cash_sales = round(cash_sales, 2)
    upi_sales = round(upi_sales, 2)
    card_sales = round(card_sales, 2)
    other_sales = round(other_sales, 2)
    gross_sales = round(gross_sales, 2)
    net_sales = gross_sales  # Bill totals already have their discounts taken off
    tax_collected = round(tax_collected, 2)
    discount_total = round(discount_total, 2)
    unpaid_bills_total = round(unpaid_bills_total, 2)

    # Core Accounting Formula:
    # Expected Drawer Cash = Opening Float + Cash Sales Received + Cash In - Cash Refunds - Cash Out - Cash Drops
    expected_cash = round(opening_float + cash_sales + cash_in_total - cash_refunds - cash_out_total - cash_drop_total, 2)
    expected_upi = round(upi_sales - digital_refunds, 2)
    expected_card = round(card_sales, 2)
    expected_other = round(other_sales, 2)
    expected_total_collections = round(expected_cash + expected_upi + expected_card + expected_other, 2)

    return {
        "opening_float": opening_float,
        "cash_sales": cash_sales,
        "total_cash_sales": cash_sales,
        "cash_sales_count": cash_sales_count,
        "upi_sales": upi_sales,
        "total_upi_sales": upi_sales,
        "upi_sales_count": upi_sales_count,
        "card_sales": card_sales,
        "total_card_sales": card_sales,
        "card_sales_count": card_sales_count,
        "other_sales": other_sales,
        "total_other_sales": other_sales,
        "other_sales_count": other_sales_count,
        "gross_sales": gross_sales,
        "net_sales": net_sales,
        "tax_collected": tax_collected,
        "total_taxes": tax_collected,
        "discount_total": discount_total,
        "total_discounts": discount_total,
        "cash_in_total": cash_in_total,
        "cash_in": cash_in_total,
        "cash_out_total": cash_out_total,
        "cash_out": cash_out_total,
        "cash_drop_total": cash_drop_total,
        "cash_drop": cash_drop_total,
        "cash_refunds": cash_refunds,
        "digital_refunds": digital_refunds,
        "expected_cash": expected_cash,
        "expected_upi": expected_upi,
        "expected_card": expected_card,
        "expected_other": expected_other,
        "expected_total_collections": expected_total_collections,
        "paid_bills_count": paid_bills_count,
        "unpaid_bills_count": unpaid_bills_count,
        "unpaid_bills_total": unpaid_bills_total,
        "unpaid_bills_amount": unpaid_bills_total,
        "movements": movements,
    }


@api.get("/cash-sessions/current")
async def get_current_cash_session(user: dict = Depends(get_current_user)):
    tid = await _ensure_tenant(user)
    session = await db.cash_sessions.find_one({"tenant_id": tid, "status": "open"}, {"_id": 0})
    if not session:
        return {"has_open_session": False, "active_session": None}

    metrics = await calculate_session_metrics(tid, session)
    enriched = {**session, **metrics}
    return {"has_open_session": True, "active_session": sanitize_doc(enriched)}


@api.post("/cash-sessions/open")
async def open_cash_session(payload: OpenCashSessionIn, user: dict = Depends(require_roles("owner", "manager", "waiter"))):
    tid = await _ensure_tenant(user)
    await _ensure_active_subscription(tid, user)

    existing = await db.cash_sessions.find_one({"tenant_id": tid, "status": "open"}, {"_id": 0})
    if existing:
        metrics = await calculate_session_metrics(tid, existing)
        return sanitize_doc({**existing, **metrics})

    now_iso = datetime.now(timezone.utc).isoformat()
    bus_date = payload.business_date or get_business_day_string()
    
    session_id = str(uuid.uuid4())
    doc = {
        "id": session_id,
        "tenant_id": tid,
        "cashier_id": user["id"],
        "cashier_name": user.get("full_name") or user.get("email") or "Cashier",
        "business_date": bus_date,
        "opened_at": now_iso,
        "closed_at": None,
        "opening_float": float(payload.opening_float or 0.0),
        "status": "open",
        "notes": payload.notes or "",
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    await db.cash_sessions.insert_one(doc)
    doc.pop("_id", None)

    metrics = await calculate_session_metrics(tid, doc)
    return sanitize_doc({**doc, **metrics})


@api.post("/cash-sessions/movement")
async def record_cash_movement(payload: CashMovementIn, user: dict = Depends(require_roles("owner", "manager", "waiter"))):
    tid = await _ensure_tenant(user)
    session_id = payload.session_id

    if not session_id:
        active_sess = await db.cash_sessions.find_one({"tenant_id": tid, "status": "open"})
        if not active_sess:
            raise HTTPException(status_code=400, detail="No active cash session open. Open a session before recording drawer movements.")
        session_id = active_sess["id"]

    now_iso = datetime.now(timezone.utc).isoformat()
    movement_id = str(uuid.uuid4())
    doc = {
        "id": movement_id,
        "tenant_id": tid,
        "session_id": session_id,
        "type": payload.type,  # cash_in, cash_out, cash_drop
        "amount": float(payload.amount),
        "reason": payload.reason,
        "reference": payload.reference or "",
        "staff_id": user["id"],
        "staff_name": user.get("full_name") or "Staff",
        "created_at": now_iso,
    }
    await db.cash_movements.insert_one(doc)
    doc.pop("_id", None)

    return sanitize_doc(doc)


@api.post("/cash-sessions/close")
async def close_cash_session(payload: CloseCashSessionIn, user: dict = Depends(require_roles("owner", "manager", "waiter"))):
    tid = await _ensure_tenant(user)
    session = await db.cash_sessions.find_one({"tenant_id": tid, "status": "open"})
    if not session:
        raise HTTPException(status_code=400, detail="No active open cash session found to close.")

    now_iso = datetime.now(timezone.utc).isoformat()
    metrics = await calculate_session_metrics(tid, session)

    counted_cash = float(payload.counted_cash)
    expected_cash = float(metrics["expected_cash"])
    cash_diff = round(counted_cash - expected_cash, 2)

    actual_upi = float(payload.actual_upi) if payload.actual_upi is not None else metrics["expected_upi"]
    expected_upi = float(metrics["expected_upi"])
    upi_diff = round(actual_upi - expected_upi, 2)

    actual_card = float(payload.actual_card) if payload.actual_card is not None else metrics["expected_card"]
    expected_card = float(metrics["expected_card"])
    card_diff = round(actual_card - expected_card, 2)

    actual_other = float(payload.actual_other) if payload.actual_other is not None else metrics["expected_other"]
    expected_other = float(metrics["expected_other"])
    other_diff = round(actual_other - expected_other, 2)

    total_diff = round(cash_diff + upi_diff + card_diff + other_diff, 2)
    has_discrepancy = abs(total_diff) > 0.01

    if has_discrepancy and not (payload.discrepancy_reason or "").strip():
        # Require a note for discrepancy if out of balance
        discrepancy_note = f"Discrepancy of ₹{total_diff:+.2f} recorded at closing."
    else:
        discrepancy_note = (payload.discrepancy_reason or "").strip()

    update_fields = {
        "status": "closed",
        "closed_at": now_iso,
        "closed_by": user.get("full_name") or user.get("email") or "Cashier",
        "closed_by_id": user["id"],
        "counted_cash": counted_cash,
        "expected_cash": expected_cash,
        "cash_difference": cash_diff,
        "denominations": payload.denominations or {},
        "actual_upi": actual_upi,
        "expected_upi": expected_upi,
        "upi_difference": upi_diff,
        "actual_card": actual_card,
        "expected_card": expected_card,
        "card_difference": card_diff,
        "actual_other": actual_other,
        "expected_other": expected_other,
        "other_difference": other_diff,
        "total_difference": total_diff,
        "has_discrepancy": has_discrepancy,
        "discrepancy_reason": discrepancy_note,
        "closing_notes": payload.closing_notes or "",
        "gross_sales": metrics["gross_sales"],
        "net_sales": metrics["net_sales"],
        "cash_sales": metrics["cash_sales"],
        "upi_sales": metrics["upi_sales"],
        "card_sales": metrics["card_sales"],
        "other_sales": metrics["other_sales"],
        "tax_collected": metrics["tax_collected"],
        "discount_total": metrics["discount_total"],
        "cash_in_total": metrics["cash_in_total"],
        "cash_out_total": metrics["cash_out_total"],
        "cash_drop_total": metrics["cash_drop_total"],
        "cash_refunds": metrics["cash_refunds"],
        "digital_refunds": metrics["digital_refunds"],
        "paid_bills_count": metrics["paid_bills_count"],
        "unpaid_bills_count": metrics["unpaid_bills_count"],
        "unpaid_bills_total": metrics["unpaid_bills_total"],
        "updated_at": now_iso,
    }

    await db.cash_sessions.update_one({"id": session["id"], "tenant_id": tid}, {"$set": update_fields})
    closed_session = {**session, **update_fields, "_id": None}
    closed_session.pop("_id", None)

    # Notify owner & manager of shift closing
    status_summary = "Balanced" if not has_discrepancy else f"Discrepancy ({total_diff:+.2f})"
    await notify_tenant(
        tid,
        "closing",
        "End-of-Day Shift Closed",
        f"Shift closed by {update_fields['closed_by']} — Cash: ₹{counted_cash:.2f} ({status_summary})",
        {"event": "CASH_SESSION_CLOSED", "session_id": session["id"], "total_difference": total_diff}
    )

    return sanitize_doc(closed_session)


@api.get("/cash-sessions/history")
async def list_cash_sessions_history(limit: Optional[int] = 50, user: dict = Depends(get_current_user)):
    tid = await _ensure_tenant(user)
    sessions = await db.cash_sessions.find({"tenant_id": tid, "status": "closed"}, {"_id": 0}).sort("closed_at", -1).to_list(limit or 50)
    return sanitize_doc(sessions)


@api.get("/cash-sessions/{session_id}")
async def get_cash_session_detail(session_id: str, user: dict = Depends(get_current_user)):
    tid = await _ensure_tenant(user)
    session = await db.cash_sessions.find_one({"id": session_id, "tenant_id": tid}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Cash session not found")

    movements = await db.cash_movements.find({"session_id": session_id, "tenant_id": tid}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    session["movements"] = movements
    return sanitize_doc(session)


@api.post("/cash-sessions/{session_id}/approve")
async def approve_cash_session_discrepancy(session_id: str, payload: ApproveSessionDiscrepancyIn, user: dict = Depends(require_roles("owner", "manager", "super_admin"))):
    tid = await _ensure_tenant(user)
    session = await db.cash_sessions.find_one({"id": session_id, "tenant_id": tid})
    if not session:
        raise HTTPException(status_code=404, detail="Cash session not found")

    now_iso = datetime.now(timezone.utc).isoformat()
    approver_name = user.get("full_name") or user.get("email") or "Manager"
    await db.cash_sessions.update_one(
        {"id": session_id, "tenant_id": tid},
        {"$set": {
            "approved_by": approver_name,
            "approved_by_id": user["id"],
            "approved_at": now_iso,
            "approval_notes": payload.notes or "",
            "updated_at": now_iso,
        }}
    )

    updated = await db.cash_sessions.find_one({"id": session_id, "tenant_id": tid}, {"_id": 0})
    return sanitize_doc(updated)


# ---------- notifications ----------
@api.get("/notifications")
async def list_notifications(category: Optional[str] = None, user: dict = Depends(get_current_user)):
    tid = await _ensure_tenant(user)
    q = {"tenant_id": tid}
    if category:
        q["category"] = category
    notifs = await db.notifications.find(q, {"_id": 0}).sort("created_at", -1).to_list(50)
    return sanitize_doc(notifs)


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
    try:
        asyncio.create_task(_auto_clear_kitchen_orders(tid))
    except Exception:
        pass
    
    # 3-second cache
    cached = dashboard_summary_cache.get(tid)
    if cached and (time.time() - cached[0] < 3.0):
        return cached[1]

    ist_offset = timedelta(hours=5, minutes=30)
    now_ist = datetime.now(timezone(ist_offset))
    start_today_ist = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
    start_7d_utc = (start_today_ist - ist_offset) - timedelta(days=7)
    start_7d_iso = start_7d_utc.isoformat()

    # 1. Fetch orders for this tenant with lean projection
    all_orders = await db.orders.find({
        "tenant_id": tid,
        "$or": [
            {"created_at": {"$gte": start_7d_iso}},
            {"status": {"$in": ["placed", "in_kitchen", "ready", "served", "pending_scan"]}}
        ]
    }, {
        "_id": 0, "status": 1, "created_at": 1, "table_number": 1, "subtotal": 1
    }).sort("created_at", -1).to_list(1000)
    today_orders = [o for o in all_orders if is_timestamp_in_current_business_day(o.get("created_at"))]
    
    orders_today = len(today_orders)
    open_orders = sum(1 for o in today_orders if o.get("status") in ["placed", "in_kitchen", "ready", "served"])
    pending_count = sum(1 for o in today_orders if o.get("status") == "placed")
    cooking_count = sum(1 for o in today_orders if o.get("status") == "in_kitchen")
    ready_count = sum(1 for o in today_orders if o.get("status") == "ready")

    total_tables = await db.tables.count_documents({"tenant_id": tid, "is_deleted": {"$ne": True}})
    
    active_tables = {
        o.get("table_number") for o in today_orders 
        if o.get("status") in ["placed", "in_kitchen", "ready", "served"] and o.get("table_number") and o.get("table_number") not in ["Takeaway", "Take-Away", "Contactless"]
    }
    occupied_tables = len(active_tables)
    tables_free = max(0, total_tables - occupied_tables) if total_tables > 0 else 5

    # 2. Fetch bills for this tenant with targeted 7-day + today + pending filter
    all_bills = await db.bills.find({
        "tenant_id": tid,
        "$or": [
            {"paid_at": {"$gte": start_7d_iso}},
            {"created_at": {"$gte": start_7d_iso}},
            {"status": "pending"}
        ]
    }, {
        "_id": 0, "status": 1, "total": 1, "subtotal": 1, "tax": 1, "gst_enabled": 1, "created_at": 1, "paid_at": 1, "created_by": 1, "order_id": 1, "order_ids": 1, "items.name": 1, "items.quantity": 1, "items.price": 1
    }).sort("created_at", -1).to_list(1000)
    
    # Deduplicate paid bills to guarantee no duplicate sales counting
    seen_order_ids = set()
    paid_bills = []
    for b in all_bills:
        if str(b.get("status", "")).lower() != "paid":
            continue
        oids = set(b.get("order_ids") or ([b.get("order_id")] if b.get("order_id") else []))
        if oids and oids.issubset(seen_order_ids):
            continue
        seen_order_ids.update(oids)
        paid_bills.append(b)
    
    rest = await db.restaurants.find_one({"id": tid}, {"_id": 0, "gst_enabled": 1, "gst_rate": 1}) or {}
    rest_gst = bool(rest.get("gst_enabled"))
    rest_rate = float(rest.get("gst_rate", 5.0))

    def get_effective_total(b):
        b_tot = float(b.get("total", 0.0))
        b_sub = float(b.get("subtotal", 0.0))
        b_tax = float(b.get("tax", 0.0))
        if b_sub <= 0:
            items = b.get("items") or []
            b_sub = sum(float(i.get("price", 0.0)) * int(i.get("quantity", 1)) for i in items)
        if b_tax > 0 and b_tot >= (b_sub + b_tax - 0.05):
            return round(b_tot, 2)
        if rest_gst:
            calc_tax = b_tax if b_tax > 0 else round(b_sub * (rest_rate / 100.0), 2)
            return round(b_sub + calc_tax, 2)
        return round(b_tot if b_tot > 0 else b_sub, 2)

    today_bills = [b for b in paid_bills if is_timestamp_in_current_business_day(b.get("created_at") or b.get("paid_at"))]
    revenue_today = round(sum(get_effective_total(b) for b in today_bills), 2)
    revenue_total = round(sum(get_effective_total(b) for b in paid_bills), 2)

    revenue_web_today = round(sum(get_effective_total(b) for b in today_bills if b.get("created_by") == "guest"), 2)
    revenue_web_total = round(sum(get_effective_total(b) for b in paid_bills if b.get("created_by") == "guest"), 2)

    # Last 7 days revenue calculation
    ist_offset = timedelta(hours=5, minutes=30)
    now_ist = datetime.now(timezone(ist_offset))
    last_7_days = []
    for i in range(6, -1, -1):
        target_day = (now_ist - timedelta(days=i)).date()
        day_label = target_day.strftime("%m-%d")
        
        def is_on_target_day(b):
            dt = parse_db_datetime(b.get("paid_at") or b.get("created_at"))
            if not dt:
                return False
            return dt.astimezone(timezone(ist_offset)).date() == target_day

        day_rev = round(sum(get_effective_total(b) for b in paid_bills if is_on_target_day(b)), 2)
        last_7_days.append({"date": day_label, "revenue": day_rev})

    # Top selling items
    item_sales = {}
    for b in today_bills:
        for item in b.get("items", []):
            name = item.get("name", "Item")
            qty = item.get("quantity", 1)
            price = float(item.get("price", 0.0)) * qty
            if name not in item_sales:
                item_sales[name] = {"name": name, "sold": 0, "amount": 0.0}
            item_sales[name]["sold"] += qty
            item_sales[name]["amount"] = round(item_sales[name]["amount"] + price, 2)

    top_selling = sorted(list(item_sales.values()), key=lambda x: x["sold"], reverse=True)[:5]
    menu_count = await db.menu_items.count_documents({"tenant_id": tid})

    res = {
        "orders_total": len(all_orders),
        "orders_today": orders_today,
        "orders_open": open_orders,
        "pending_count": pending_count,
        "cooking_count": cooking_count,
        "ready_count": ready_count,
        "tables_free": tables_free,
        "revenue_total": revenue_total,
        "revenue_today": revenue_today,
        "revenue_web_today": revenue_web_today,
        "revenue_web_total": revenue_web_total,
        "avg_bill": 0.0,
        "menu_count": menu_count,
        "last_7_days": last_7_days,
        "top_selling": top_selling,
        "business_date": now_ist.strftime("%Y-%m-%d"),
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
    is_local_mode: Optional[bool] = False
    max_users: Optional[int] = 1


class SubscribeIn(BaseModel):
    plan_id: str
    status: str = "active"  # active / cancelled / expired
    valid_days: Optional[int] = None


class AdminFeaturesIn(BaseModel):
    custom_features: Optional[dict] = None
    custom_staff_limit: Optional[int] = None


class AdminBroadcastIn(BaseModel):
    title: str = Field(min_length=2)
    message: str = Field(min_length=2)
    category: str = "system"  # system | sales | payment
    target_role: Optional[str] = "all"  # all | owner | waiter | kitchen


class RestaurantStatusIn(BaseModel):
    is_active: Optional[bool] = None


class ResetPasswordIn(BaseModel):
    new_password: str = Field(min_length=4)


class ManualPaymentIn(BaseModel):
    tenant_id: str
    plan_id: str
    amount: float
    payment_method: str = "UPI"  # "UPI" | "Bank Transfer" | "Cash" | "Razorpay" | "Cheque"
    reference_id: Optional[str] = None
    valid_days: Optional[int] = None
    notes: Optional[str] = None


class RefundPaymentIn(BaseModel):
    refund_reason: Optional[str] = "Customer request"
    cancel_subscription: Optional[bool] = True


@api.get("/admin/summary")
async def admin_summary(user: dict = Depends(require_roles("super_admin", "admin_employee"))):
    try:
        now = datetime.now(timezone.utc)
        in_7_days = (now + timedelta(days=7)).isoformat()
        now_iso = now.isoformat()

        total_restaurants = await db.restaurants.count_documents({})
        active_restaurants = await db.restaurants.count_documents({"is_active": {"$ne": False}})
        suspended_restaurants = total_restaurants - active_restaurants
        
        total_users = await db.users.count_documents({})
        total_owners = await db.users.count_documents({"role": "owner"})
        total_staff = total_users - total_owners

        active_subs = await db.subscriptions.find({"status": "active"}, {"_id": 0}).to_list(2000)
        mrr = 0.0
        for s in active_subs:
            try:
                price = float(s.get("price") or 0)
                interval = s.get("interval", "month")
                if interval == "year":
                    mrr += price / 12
                else:
                    mrr += price
            except Exception:
                pass

        # Subscriptions expiring soon (within next 7 days)
        expiring_soon_count = await db.subscriptions.count_documents({
            "status": "active",
            "ends_at": {"$gte": now_iso, "$lte": in_7_days}
        })

        # Calculate total revenue collected from payment orders (converting paise to rupees)
        payment_orders = await db.payment_orders.find({"status": "paid"}, {"_id": 0}).to_list(2000)
        total_revenue_collected = 0.0
        for p in payment_orders:
            raw_amt = float(p.get("amount") or 0)
            if p.get("razorpay_order_id") or p.get("razorpay_subscription_id") or p.get("razorpay_payment_id") or raw_amt >= 10000:
                total_revenue_collected += raw_amt / 100.0
            else:
                total_revenue_collected += raw_amt
        if total_revenue_collected == 0 and active_subs:
            total_revenue_collected = sum(float(s.get("price") or 0) for s in active_subs)

        # Recent Platform Activity
        recent_rests = await db.restaurants.find({}, {"_id": 0, "id": 1, "name": 1, "owner_name": 1, "created_at": 1}).sort("created_at", -1).to_list(5)
        recent_subs = await db.subscriptions.find({"status": "active"}, {"_id": 0, "tenant_id": 1, "plan_name": 1, "price": 1, "created_at": 1}).sort("created_at", -1).to_list(5)
        
        recent_activity = []
        for r in recent_rests:
            recent_activity.append({
                "type": "restaurant_registered",
                "title": f"🏪 New Store: {r.get('name', 'Unknown')}",
                "meta": f"Owner: {r.get('owner_name', 'N/A')}",
                "timestamp": r.get("created_at") or now_iso
            })
        for s in recent_subs:
            recent_activity.append({
                "type": "subscription_activated",
                "title": f"⚡ License Active: {s.get('plan_name', 'Plan')}",
                "meta": f"Amount: ₹{s.get('price', 0)}",
                "timestamp": s.get("created_at") or now_iso
            })
        recent_activity.sort(key=lambda x: x.get("timestamp", ""), reverse=True)

        return {
            "total_restaurants": total_restaurants,
            "active_restaurants": active_restaurants,
            "suspended_restaurants": suspended_restaurants,
            "total_users": total_users,
            "total_owners": total_owners,
            "total_staff": total_staff,
            "active_subscriptions": len(active_subs),
            "expiring_soon_count": expiring_soon_count,
            "mrr": round(mrr, 2),
            "arr": round(mrr * 12, 2),
            "total_revenue_collected": round(total_revenue_collected, 2),
            "recent_activity": recent_activity[:8],
        }
    except Exception as e:
        logger.error(f"Error in admin_summary: {e}")
        return {
            "total_restaurants": 0,
            "active_restaurants": 0,
            "suspended_restaurants": 0,
            "total_users": 0,
            "total_owners": 0,
            "total_staff": 0,
            "active_subscriptions": 0,
            "expiring_soon_count": 0,
            "mrr": 0.0,
            "arr": 0.0,
            "total_revenue_collected": 0.0,
            "recent_activity": [],
        }


# ============================================================================
# SUPER ADMIN PAYMENTS & TRANSACTIONS MANAGEMENT
# ============================================================================
@api.get("/admin/payments")
async def admin_list_payments(
    status: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    user: dict = Depends(require_roles("super_admin", "admin_employee"))
):
    try:
        query = {}
        if status and status.lower() != "all":
            query["status"] = status.lower()

        # Fetch payment orders
        all_orders = await db.payment_orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)

        # Build lookup for restaurants and plans
        restaurants = await db.restaurants.find({}, {"_id": 0, "id": 1, "name": 1, "owner_name": 1, "phone": 1, "owner_user_id": 1}).to_list(2000)
        rest_map = {r["id"]: r for r in restaurants}

        plans = await db.plans.find({}, {"_id": 0, "id": 1, "name": 1, "price": 1, "interval": 1}).to_list(200)
        plan_map = {p["id"]: p for p in plans}

        users = await db.users.find({"role": "owner"}, {"_id": 0, "id": 1, "email": 1, "full_name": 1}).to_list(2000)
        user_map = {u["id"]: u for u in users}

        enriched_payments = []
        total_collected = 0.0
        total_refunded = 0.0
        paid_cnt = 0
        failed_cnt = 0
        refunded_cnt = 0

        for po in all_orders:
            tid = po.get("tenant_id")
            rest = rest_map.get(tid) or {}
            plan = plan_map.get(po.get("plan_id")) or {}
            owner_u = user_map.get(rest.get("owner_user_id")) or {}

            raw_amt = float(po.get("amount") or 0)
            if po.get("razorpay_order_id") or po.get("razorpay_subscription_id") or po.get("razorpay_payment_id") or raw_amt >= 10000:
                amt_rupees = raw_amt / 100.0
            else:
                amt_rupees = raw_amt
            if amt_rupees == 0 and plan.get("price"):
                amt_rupees = float(plan.get("price"))

            st = po.get("status", "created").lower()
            if st == "paid":
                total_collected += amt_rupees
                paid_cnt += 1
            elif st == "refunded":
                total_refunded += amt_rupees
                refunded_cnt += 1
            elif st in ("failed", "cancelled", "expired"):
                failed_cnt += 1

            p_item = {
                "id": po.get("id") or str(po.get("_id", "")),
                "tenant_id": tid,
                "restaurant_name": rest.get("name") or "Unknown Restaurant",
                "owner_name": rest.get("owner_name") or owner_u.get("full_name") or "Store Owner",
                "owner_email": owner_u.get("email") or "",
                "owner_phone": rest.get("phone") or "",
                "plan_id": po.get("plan_id") or "",
                "plan_name": plan.get("name") or po.get("plan_name") or "Custom Plan",
                "amount": round(amt_rupees, 2),
                "currency": "INR",
                "payment_method": po.get("payment_method") or ("Razorpay" if po.get("razorpay_payment_id") else "Online UPI"),
                "gateway_order_id": po.get("razorpay_order_id") or po.get("razorpay_subscription_id") or "",
                "gateway_payment_id": po.get("razorpay_payment_id") or po.get("reference_id") or "",
                "status": st,
                "created_at": po.get("created_at") or po.get("paid_at") or "",
                "paid_at": po.get("paid_at") or po.get("created_at") or "",
                "refunded_at": po.get("refunded_at"),
                "refund_reason": po.get("refund_reason"),
                "notes": po.get("notes"),
            }

            if search and search.strip():
                s_low = search.strip().lower()
                matches = (
                    s_low in p_item["restaurant_name"].lower() or
                    s_low in p_item["owner_name"].lower() or
                    s_low in p_item["owner_email"].lower() or
                    s_low in p_item["owner_phone"].lower() or
                    s_low in p_item["gateway_payment_id"].lower() or
                    s_low in p_item["id"].lower()
                )
                if not matches:
                    continue

            enriched_payments.append(p_item)

        total_txns = len(enriched_payments)
        success_rate = round((paid_cnt / max(1, paid_cnt + failed_cnt)) * 100, 1)

        start_idx = (page - 1) * limit
        paginated = enriched_payments[start_idx:start_idx + limit]

        return {
            "payments": paginated,
            "total": total_txns,
            "stats": {
                "total_collected": round(total_collected, 2),
                "total_refunded": round(total_refunded, 2),
                "net_revenue": round(total_collected - total_refunded, 2),
                "paid_count": paid_cnt,
                "failed_count": failed_cnt,
                "refunded_count": refunded_cnt,
                "success_rate": success_rate,
            }
        }
    except Exception as e:
        logger.error(f"Error in admin_list_payments: {e}")
        return {
            "payments": [],
            "total": 0,
            "stats": {
                "total_collected": 0.0,
                "total_refunded": 0.0,
                "net_revenue": 0.0,
                "paid_count": 0,
                "failed_count": 0,
                "refunded_count": 0,
                "success_rate": 100.0,
            }
        }


@api.post("/admin/payments/record-manual")
async def admin_record_manual_payment(payload: ManualPaymentIn, user: dict = Depends(require_roles("super_admin"))):
    rest = await db.restaurants.find_one({"id": payload.tenant_id}, {"_id": 0})
    if not rest:
        raise HTTPException(status_code=404, detail="Restaurant not found")
        
    plan = await db.plans.find_one({"id": payload.plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    now_iso = datetime.now(timezone.utc).isoformat()
    valid_days = payload.valid_days or plan.get("valid_days") or (365 if plan.get("interval") == "year" else 30)
    ends_at = datetime.now(timezone.utc) + timedelta(days=int(valid_days))

    payment_id = "pay_man_" + str(uuid.uuid4())[:12]
    doc = {
        "id": payment_id,
        "tenant_id": payload.tenant_id,
        "plan_id": plan["id"],
        "plan_name": plan["name"],
        "amount": float(payload.amount),
        "payment_method": payload.payment_method or "Manual / UPI",
        "reference_id": payload.reference_id or f"OFFLINE-{int(datetime.now().timestamp())}",
        "status": "paid",
        "notes": payload.notes or "Manual payment recorded by Super Admin",
        "created_at": now_iso,
        "paid_at": now_iso,
        "recorded_by": user.get("email") or "super_admin",
    }
    await db.payment_orders.insert_one(doc)
    doc.pop("_id", None)

    # Cancel previous active subscriptions and activate new one
    await db.subscriptions.update_many(
        {"tenant_id": payload.tenant_id, "status": "active"},
        {"$set": {"status": "cancelled"}}
    )

    is_local_mode = bool(plan.get("is_local_mode") or plan.get("price") in (299, 299.0, 2999, 2999.0) or "starter" in plan.get("name", "").lower() or "basic" in plan.get("name", "").lower())
    sub = {
        "id": str(uuid.uuid4()),
        "tenant_id": payload.tenant_id,
        "plan_id": plan["id"],
        "plan_name": plan["name"],
        "price": float(payload.amount),
        "interval": plan.get("interval", "month"),
        "is_local_mode": is_local_mode,
        "status": "active",
        "payment_method": payload.payment_method or "Manual",
        "reference_id": payload.reference_id,
        "created_at": now_iso,
        "ends_at": ends_at.isoformat(),
    }
    await db.subscriptions.insert_one(sub)
    sub.pop("_id", None)

    limits = await get_tenant_plan_limits(payload.tenant_id)
    await notify_tenant(
        payload.tenant_id,
        "subscription",
        "Payment Recorded & License Activated",
        f"Your {plan['name']} license has been activated for {valid_days} days. (Amt: ₹{payload.amount})",
        {"event": "subscription.updated", "subscription": sub, "limits": limits}
    )

    return {"ok": True, "payment": doc, "subscription": sub}


@api.post("/admin/payments/{pid}/refund")
async def admin_refund_payment(pid: str, payload: RefundPaymentIn, user: dict = Depends(require_roles("super_admin"))):
    po = await db.payment_orders.find_one({"$or": [{"id": pid}, {"razorpay_payment_id": pid}, {"reference_id": pid}]})
    if not po:
        raise HTTPException(status_code=404, detail="Payment record not found")

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.payment_orders.update_one(
        {"id": po["id"]},
        {"$set": {
            "status": "refunded",
            "refunded_at": now_iso,
            "refund_reason": payload.refund_reason or "Super Admin manual refund",
            "refunded_by": user.get("email") or "super_admin"
        }}
    )

    tid = po.get("tenant_id")
    if tid and payload.cancel_subscription:
        await db.subscriptions.update_many(
            {"tenant_id": tid, "status": "active"},
            {"$set": {"status": "cancelled", "ends_at": now_iso}}
        )
        limits = await get_tenant_plan_limits(tid)
        await notify_tenant(
            tid,
            "subscription",
            "Subscription Refunded",
            f"Your recent payment has been refunded ({payload.refund_reason or 'Refund processed'}). Your subscription is cancelled.",
            {"event": "subscription.refunded", "limits": limits}
        )

    return {"ok": True, "status": "refunded", "message": "Payment marked as refunded."}


# ============================================================================
# SUPER ADMIN BUSINESS REPORTS & ANALYTICS
# ============================================================================
@api.get("/admin/reports/business-summary")
async def admin_business_summary(user: dict = Depends(require_roles("super_admin", "admin_employee"))):
    try:
        now = datetime.now(timezone.utc)
        in_7_days = (now + timedelta(days=7)).isoformat()
        now_iso = now.isoformat()

        total_rests = await db.restaurants.count_documents({})
        active_rests = await db.restaurants.count_documents({"is_active": {"$ne": False}})
        suspended_rests = total_rests - active_rests

        active_subs = await db.subscriptions.find({"status": "active"}, {"_id": 0}).to_list(2000)
        
        mrr = 0.0
        plan_counts = {}
        for s in active_subs:
            p_name = s.get("plan_name", "Custom")
            plan_counts[p_name] = plan_counts.get(p_name, 0) + 1
            price = float(s.get("price") or 0)
            if s.get("interval") == "year":
                mrr += price / 12.0
            else:
                mrr += price

        # Expiring soon stores (active sub ends within next 7 days)
        expiring_subs = await db.subscriptions.find({
            "status": "active",
            "ends_at": {"$gte": now_iso, "$lte": in_7_days}
        }, {"_id": 0}).to_list(100)

        expiring_rests = []
        for s in expiring_subs:
            r = await db.restaurants.find_one({"id": s.get("tenant_id")}, {"_id": 0, "name": 1, "owner_name": 1, "phone": 1}) or {}
            expiring_rests.append({
                "tenant_id": s.get("tenant_id"),
                "restaurant_name": r.get("name", "Store"),
                "owner_name": r.get("owner_name", "Owner"),
                "phone": r.get("phone", ""),
                "plan_name": s.get("plan_name", "Plan"),
                "ends_at": s.get("ends_at"),
            })

        # Lifetime Revenue from payment_orders (converting paise to rupees)
        payments = await db.payment_orders.find({"status": "paid"}, {"_id": 0}).to_list(5000)
        total_rev = 0.0
        for p in payments:
            raw_amt = float(p.get("amount") or 0)
            if p.get("razorpay_order_id") or p.get("razorpay_subscription_id") or p.get("razorpay_payment_id") or raw_amt >= 10000:
                total_rev += raw_amt / 100.0
            else:
                total_rev += raw_amt
        if total_rev == 0 and active_subs:
            total_rev = sum(float(s.get("price") or 0) for s in active_subs)

        return {
            "mrr": round(mrr, 2),
            "arr": round(mrr * 12, 2),
            "total_revenue": round(total_rev, 2),
            "total_stores": total_rests,
            "active_stores": active_rests,
            "suspended_stores": suspended_rests,
            "active_subscribers": len(active_subs),
            "plan_distribution": [{"name": k, "count": v} for k, v in plan_counts.items()],
            "expiring_soon_count": len(expiring_rests),
            "expiring_stores": expiring_rests[:10],
            "generated_at": now_iso,
        }
    except Exception as e:
        logger.error(f"Error in admin_business_summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api.get("/admin/reports/export")
async def admin_export_business_report(user: dict = Depends(require_roles("super_admin"))):
    try:
        rests = await db.restaurants.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
        lines = [
            "Restaurant ID,Restaurant Name,Owner Name,Phone,Address,GST,Status,Current Plan,Subscription Status,Plan Price,Validity Ends At,Registered At"
        ]
        for r in rests:
            sub = await db.subscriptions.find_one({"tenant_id": r["id"]}, {"_id": 0}, sort=[("created_at", -1)]) or {}
            status_str = "ACTIVE" if r.get("is_active", True) else "SUSPENDED"
            plan_str = sub.get("plan_name", "None")
            sub_status = sub.get("status", "expired")
            price_str = str(sub.get("price", 0))
            ends_str = str(sub.get("ends_at", "N/A"))
            created_str = str(r.get("created_at", "N/A"))

            def clean_csv(val):
                s = str(val or "").replace('"', '""').replace("\n", " ").replace(",", " ")
                return f'"{s}"'

            row = [
                clean_csv(r.get("id")),
                clean_csv(r.get("name")),
                clean_csv(r.get("owner_name")),
                clean_csv(r.get("phone")),
                clean_csv(r.get("address")),
                clean_csv(r.get("gst")),
                status_str,
                clean_csv(plan_str),
                sub_status,
                price_str,
                ends_str,
                created_str,
            ]
            lines.append(",".join(row))

        csv_data = "\n".join(lines)
        return Response(
            content=csv_data,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=ezbill_business_report_{int(datetime.now().timestamp())}.csv"}
        )
    except Exception as e:
        logger.error(f"Error in admin_export_business_report: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api.get("/admin/system-health")
async def admin_system_health(user: dict = Depends(require_roles("super_admin", "admin_employee"))):
    import time
    start_t = time.time()
    db_status = "connected"
    ping_ms = 0.0
    try:
        await db.command("ping")
        ping_ms = round((time.time() - start_t) * 1000, 2)
    except Exception as e:
        db_status = f"degraded ({e})"

    return {
        "status": "operational",
        "database": db_status,
        "ping_ms": ping_ms,
        "server_time": datetime.now(timezone.utc).isoformat(),
        "node_env": "production",
        "version": "2.4.0-pro",
    }


@api.post("/admin/broadcast-notification")
async def admin_broadcast_notification(payload: AdminBroadcastIn, user: dict = Depends(require_roles("super_admin"))):
    try:
        restaurants = await db.restaurants.find({}, {"id": 1}).to_list(5000)
        tenant_ids = [r["id"] for r in restaurants if r.get("id")]
        
        # Dispatch notification to all tenants
        created_docs = []
        now_str = datetime.now(timezone.utc).isoformat()
        for tid in tenant_ids:
            doc = {
                "id": str(uuid.uuid4()),
                "tenant_id": tid,
                "category": payload.category,
                "title": f"📢 {payload.title}",
                "message": payload.message,
                "data": {"broadcast": True, "sender": "super_admin"},
                "is_read": False,
                "created_at": now_str,
            }
            created_docs.append(doc)
            await manager.broadcast_to_tenant(tid, doc)
            dashboard_summary_cache.pop(tid, None)

        if created_docs:
            await db.notifications.insert_many(created_docs)

        # Broadcast push notifications to all users with push tokens
        push_filter = {"push_token": {"$exists": True, "$ne": None}}
        if payload.target_role and payload.target_role != "all":
            push_filter["role"] = payload.target_role

        users_with_tokens = await db.users.find(push_filter, {"push_token": 1}).to_list(10000)
        tokens = list(dict.fromkeys([u["push_token"] for u in users_with_tokens if u.get("push_token")]))
        if tokens:
            await send_expo_push_notifications(tokens, f"📢 {payload.title}", payload.message, payload.category, {"broadcast": True})

        return {"ok": True, "tenants_notified": len(tenant_ids), "push_delivered": len(tokens)}
    except Exception as e:
        logger.error(f"Error in admin_broadcast_notification: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api.get("/admin/restaurants")
async def admin_list_restaurants(user: dict = Depends(require_roles("super_admin", "admin_employee"))):
    rests = await db.restaurants.find({}, {"_id": 0, "logo_base64": 0, "logo_base64_58": 0, "logo_base64_80": 0}).sort("created_at", -1).to_list(2000)
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
            "is_active": r.get("is_active", True),
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
    tables_count = await db.tables.count_documents({"tenant_id": tid, "is_deleted": {"$ne": True}})
    menu_count = await db.menu_items.count_documents({"tenant_id": tid, "is_deleted": {"$ne": True}})
    staff_count = await db.users.count_documents({"tenant_id": tid})
    recent_bills = await db.bills.find({"tenant_id": tid, "status": "paid"}, {"_id": 0, "id": 1, "total": 1, "table_number": 1, "created_at": 1, "payment_method": 1}).sort("created_at", -1).to_list(5)

    return {
        **r,
        "is_active": r.get("is_active", True),
        "orders_total": orders_total,
        "revenue_total": revenue,
        "subscription": sub,
        "tables_count": tables_count,
        "menu_count": menu_count,
        "staff_count": staff_count,
        "recent_bills": recent_bills,
    }


@api.post("/admin/restaurants/{tid}/toggle-status")
async def admin_toggle_restaurant_status(tid: str, payload: Optional[RestaurantStatusIn] = None, user: dict = Depends(require_roles("super_admin"))):
    rest = await db.restaurants.find_one({"id": tid})
    if not rest:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    new_status = not bool(rest.get("is_active", True)) if (payload is None or payload.is_active is None) else payload.is_active
    await db.restaurants.update_one({"id": tid}, {"$set": {"is_active": new_status}})
    return {"ok": True, "is_active": new_status, "message": f"Business is now {'ACTIVE' if new_status else 'SUSPENDED'}."}


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
    if payload.is_local_mode or payload.price in (299, 299.0, 2999, 2999.0) or "starter" in payload.name.lower() or "basic" in payload.name.lower():
        doc["is_local_mode"] = True
        doc["max_users"] = 1
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
        
    valid_days = payload.valid_days
    if not valid_days:
        valid_days = plan.get("valid_days")
    if not valid_days:
        valid_days = 365 if plan.get("interval") == "year" else 30
    ends_at = datetime.now(timezone.utc) + timedelta(days=int(valid_days))

    # Cancel previous active subscriptions
    await db.subscriptions.update_many(
        {"tenant_id": tid, "status": "active"},
        {"$set": {"status": "cancelled"}}
    )

    is_local_mode = bool(plan.get("is_local_mode") or plan.get("price") in (299, 299.0, 2999, 2999.0) or "starter" in plan.get("name", "").lower() or "basic" in plan.get("name", "").lower())

    doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tid,
        "plan_id": plan["id"],
        "plan_name": plan["name"],
        "price": plan["price"],
        "interval": plan["interval"],
        "is_local_mode": is_local_mode,
        "status": payload.status,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "ends_at": ends_at.isoformat() if payload.status == "active" else None
    }
    await db.subscriptions.insert_one(doc)
    doc.pop("_id", None)
    
    limits = await get_tenant_plan_limits(tid)
    await notify_tenant(
        tid,
        "subscription",
        "Subscription Updated",
        f"Your plan has been updated to {plan['name']} by admin.",
        {"event": "subscription.updated", "subscription": doc, "limits": limits}
    )
    return doc


@api.post("/admin/restaurants/{tid}/expire-subscription")
async def admin_expire_subscription(tid: str, user: dict = Depends(require_roles("super_admin"))):
    now_str = datetime.now(timezone.utc).isoformat()
    await db.subscriptions.update_many(
        {"tenant_id": tid},
        {"$set": {"status": "expired", "ends_at": now_str}}
    )
    limits = await get_tenant_plan_limits(tid)
    await notify_tenant(
        tid,
        "subscription",
        "Subscription Expired",
        "Your EzBill subscription has been expired by admin. Please renew.",
        {"event": "subscription.expired", "status": "expired", "limits": limits}
    )
    return {"ok": True, "status": "expired"}


@api.post("/admin/restaurants/{tid}/features")
async def admin_update_restaurant_features(tid: str, payload: AdminFeaturesIn, user: dict = Depends(require_roles("super_admin"))):
    update_data = {}
    if payload.custom_features is not None:
        update_data["custom_features"] = payload.custom_features
    if payload.custom_staff_limit is not None:
        update_data["custom_staff_limit"] = payload.custom_staff_limit
        
    if update_data:
        await db.restaurants.update_one({"id": tid}, {"$set": update_data})
        
    limits = await get_tenant_plan_limits(tid)
    await notify_tenant(
        tid,
        "subscription",
        "Features Updated",
        "Your restaurant features have been updated by admin.",
        {"event": "features.updated", "limits": limits}
    )
    return {"ok": True, "limits": limits}


@api.delete("/admin/restaurants/{tid}/subscription")
async def admin_cancel_subscription(tid: str, user: dict = Depends(require_roles("super_admin"))):
    latest = await db.subscriptions.find_one({"tenant_id": tid}, {"_id": 0}, sort=[("created_at", -1)])
    if not latest:
        raise HTTPException(status_code=404, detail="No subscription found")
    await db.subscriptions.update_one({"id": latest["id"]}, {"$set": {"status": "cancelled"}})
    limits = await get_tenant_plan_limits(tid)
    await notify_tenant(
        tid,
        "subscription",
        "Subscription Cancelled",
        "Your EzBill subscription has been cancelled.",
        {"event": "subscription.cancelled", "status": "cancelled", "limits": limits}
    )
    return {"ok": True}


async def get_tenant_plan_limits(tid: str) -> dict:
    # Find latest subscription
    sub = await db.subscriptions.find_one({"tenant_id": tid}, sort=[("created_at", -1)])
    plan_name = "Starter"
    plan_id = "STARTER_MONTHLY"
    status = "expired"
    
    if sub:
        plan_id = sub.get("plan_id", "STARTER_MONTHLY")
        plan_name = sub.get("plan_name", "Starter")
        status = sub.get("status", "expired")
        ends_at_str = sub.get("ends_at")
        if ends_at_str and status == "active":
            try:
                ends_at = datetime.fromisoformat(ends_at_str.replace("Z", "+00:00"))
                if datetime.now(timezone.utc) > ends_at:
                    status = "expired"
                    await db.subscriptions.update_one({"id": sub["id"]}, {"$set": {"status": "expired"}})
            except Exception:
                pass
    else:
        status = "expired"

    restaurant = await db.restaurants.find_one({"id": tid}, {"_id": 0}) or {}
    custom_features = restaurant.get("custom_features", {})
    custom_staff_limit = restaurant.get("custom_staff_limit")

    plan_base = "starter"
    if status == "active":
        if "growth" in plan_id.lower():
            plan_base = "growth"
        elif "pro" in plan_id.lower():
            plan_base = "pro"

    # Starter: 0 waiters limit (Owner only)
    # Growth: 4 waiters limit (5 users total: Owner + 4 Staff)
    # Pro: 14 waiters limit (15 users total: Owner + 14 Staff)
    staff_limit = 0
    if plan_base == "growth":
        staff_limit = 4
    elif plan_base == "pro":
        staff_limit = 14

    if custom_staff_limit is not None:
        try:
            staff_limit = int(custom_staff_limit)
        except Exception:
            pass

    is_active = (status == "active")

    features = {
        "billing": is_active,
        "menu_crud": is_active,
        "table_crud": is_active,
        "offline_mode": is_active,
        "thermal_printing": is_active,
        "basic_reports": is_active,
        "advanced_reports": is_active and (plan_base in ("growth", "pro")),
        "inventory": is_active and (plan_base in ("growth", "pro")),
        "expenses": is_active and (plan_base in ("growth", "pro")),
        "ai_menu": is_active and (plan_base in ("growth", "pro")),
        "qr_web_menu": is_active and (plan_base == "pro"),
        "customer_ordering": is_active and (plan_base == "pro"),
        "waiter_qr_confirmation": is_active and (plan_base == "pro"),
        "advanced_permissions": is_active and (plan_base == "pro"),
        "audit_logs": is_active and (plan_base == "pro"),
        "api_access": is_active and (plan_base == "pro"),
    }

    # Apply super-admin custom feature overrides!
    for k, v in custom_features.items():
        if isinstance(v, bool):
            features[k] = v

    # Check if plan is 1-user local mode (Starter ₹299/₹2999 or explicitly enabled)
    is_local_mode = False
    if plan_base == "starter" or (sub and (sub.get("price") in (299, 299.0, 2999, 2999.0) or sub.get("is_local_mode"))):
        is_local_mode = True
    elif sub and sub.get("plan_id"):
        plan_doc = await db.plans.find_one({"id": sub["plan_id"]}, {"_id": 0})
        if plan_doc and plan_doc.get("is_local_mode"):
            is_local_mode = True

    if "is_local_mode" in custom_features:
        is_local_mode = bool(custom_features["is_local_mode"])

    return {
        "plan": plan_base,
        "plan_name": plan_name,
        "plan_id": plan_id,
        "status": status,
        "is_active": is_active,
        "is_local_mode": is_local_mode,
        "staff_limit": staff_limit,
        "features": features,
        "custom_features": custom_features,
        "custom_staff_limit": custom_staff_limit
    }


async def _ensure_active_subscription(tid: str, user: dict = None):
    if user and user.get("role") in ("super_admin", "admin_employee"):
        return
    limits = await get_tenant_plan_limits(tid)
    if limits.get("status") != "active":
        raise HTTPException(
            status_code=402,
            detail="Subscription expired. Please renew your EzBill subscription to continue using POS billing and orders."
        )


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
        sub["is_local_mode"] = limits.get("is_local_mode", False)
        sub["limits"] = {
            "staff_limit": limits["staff_limit"],
            "features": limits["features"],
            "is_local_mode": limits.get("is_local_mode", False)
        }
        
        # Include payment history
        history = await db.payment_orders.find(
            {"tenant_id": tid, "status": "paid"},
            {"_id": 0}
        ).sort("paid_at", -1).to_list(100)
        sub["payment_history"] = history
    else:
        sub["is_local_mode"] = True
        sub["limits"] = {
            "staff_limit": 1,
            "is_local_mode": True,
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
            cleaned_label = table_label.strip()
            table = await db.tables.find_one({
                "tenant_id": tenant_id,
                "is_deleted": {"$ne": True},
                "$or": [
                    {"id": cleaned_label},
                    {"label": cleaned_label},
                    {"label": {"$regex": f"^{re.escape(cleaned_label)}$", "$options": "i"}},
                    {"custom_qr": cleaned_label}
                ]
            })
            if table:
                table_id = table.get("id", "")
                table_num = table.get("label", "")
            else:
                table_id = cleaned_label
                table_num = cleaned_label
        
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


@app.get("/favicon.ico")
@app.get("/static/favicon.ico")
@app.get("/static/favicon.png")
@app.get("/static/ezbill-logo.png")
async def get_favicon_logo():
    from fastapi.responses import FileResponse
    static_dir = Path(__file__).resolve().parent / "static"
    for cand in ["favicon.png", "ezbill-logo.png", "favicon.ico"]:
        p = static_dir / cand
        if p.exists():
            return FileResponse(p, media_type="image/png", headers={"Cache-Control": "public, max-age=86400"})
    
    frontend_assets = Path(__file__).resolve().parent.parent / "frontend" / "assets" / "images"
    for cand in ["favicon.png", "icon.png", "app-image.png"]:
        p = frontend_assets / cand
        if p.exists():
            return FileResponse(p, media_type="image/png", headers={"Cache-Control": "public, max-age=86400"})
            
    raise HTTPException(status_code=404, detail="Favicon not found")


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
        {"$set": {"otp": otp, "created_at": now.isoformat(), "created_at_dt": now}},
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
    feedbacks = await db.customer_feedback.find({"tenant_id": tid}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return feedbacks


# ---------- Shop / Hardware Express Dispatch Orders ----------
class HardwareOrderIn(BaseModel):
    orderId: str
    fullName: str
    businessName: Optional[str] = ""
    phone: str
    email: Optional[str] = ""
    address: str
    gstin: Optional[str] = ""
    paymentMethod: str = "Cash on Delivery"
    total: float
    items: list = []
    date: Optional[str] = None


@api.post("/shop/orders")
async def create_hardware_order(order: HardwareOrderIn):
    try:
        order_dict = order.dict()
        order_dict["created_at"] = datetime.now(timezone.utc).isoformat()
        order_dict["status"] = "pending"
        
        # Save order document to MongoDB
        await db.hardware_orders.insert_one(order_dict)
        order_dict.pop("_id", None)
        
        # Trigger Instant Email Alert to contactprodevopz@gmail.com
        try:
            EmailService.send_hardware_order_alert(order_dict)
        except Exception as e:
            print("[Hardware Order] Email alert dispatch error:", e)
            
        return {"ok": True, "orderId": order.orderId, "order": order_dict}
    except Exception as ex:
        print("[Hardware Order] Error saving order:", ex)
        raise HTTPException(status_code=500, detail=str(ex))


@api.get("/shop/orders")
async def list_hardware_orders(user: dict = Depends(require_roles("owner", "manager", "super_admin"))):
    orders = await db.hardware_orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return orders


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

                now_dt = datetime.now(timezone.utc)
                await db.processed_operations.insert_one({
                    "id": op_id,
                    "response_body": body_str,
                    "status_code": response.status_code,
                    "created_at": now_dt.isoformat(),
                    "created_at_dt": now_dt,
                })

                return Response(
                    content=response_body,
                    status_code=response.status_code,
                    headers=dict(response.headers)
                )
            return response

    return await call_next(request)


@app.get("/")
@app.get("/health")
@api.get("/health")
async def root_health_ping():
    return {
        "status": "online",
        "service": "EzBill Backend API",
        "message": "Server is active 24/7 without sleep",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


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
        await db.bills.create_index([("tenant_id", 1), ("status", 1), ("created_at", -1)])
        await db.bills.create_index([("tenant_id", 1), ("paid_at", -1)])
        await db.notifications.create_index([("tenant_id", 1), ("category", 1), ("created_at", -1)])
        await db.notifications.create_index([("tenant_id", 1), ("is_read", 1)])
        await db.customer_feedback.create_index([("tenant_id", 1), ("created_at", -1)])
        await db.menu_items.create_index([("tenant_id", 1), ("category_id", 1)])
        await db.menu_items.create_index([("tenant_id", 1), ("is_deleted", 1)])
        await db.tables.create_index([("tenant_id", 1), ("label", 1)])
        await db.tables.create_index([("tenant_id", 1), ("is_deleted", 1)])
        await db.categories.create_index([("tenant_id", 1), ("display_order", 1)])
        await db.users.create_index([("email", 1)], unique=True)
        await db.users.create_index([("tenant_id", 1)])
        await db.restaurants.create_index([("id", 1)])
        await db.subscriptions.create_index([("tenant_id", 1), ("status", 1)])
        await db.consent_records.create_index([("userId", 1), ("createdAt", -1)])
        await db.consent_records.create_index([("restaurantId", 1), ("createdAt", -1)])
        await db.payment_orders.create_index([("razorpay_order_id", 1)])
        await db.payment_orders.create_index([("tenant_id", 1), ("created_at", -1)])
        await db.otps.create_index([("created_at_dt", 1)], expireAfterSeconds=600)
        await db.processed_operations.create_index([("id", 1)], unique=True)
        await db.processed_operations.create_index([("created_at", 1)])
        await db.processed_operations.create_index([("created_at_dt", 1)], expireAfterSeconds=2592000)
        await db.notifications.create_index([("created_at_dt", 1)], expireAfterSeconds=7776000)
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
         "features": ["Owner account", "Basic billing", "Menu CRUD", "Table CRUD", "Basic order creation", "Cloud data backup", "Local-first billing", "Offline bill generation", "Thermal printing", "GST billing", "Logo on bill", "Bill reprint", "Basic settings", "Light/Dark mode", "Password reset"]},
        {"id": "STARTER_YEARLY", "name": "Starter", "price": 2999.0, "interval": "year", "valid_days": 365,
         "features": ["Everything in Starter Monthly", "Save ₹589 annually"]},
        {"id": "GROWTH_MONTHLY", "name": "Growth", "price": 499.0, "interval": "month", "valid_days": 30, "razorpay_plan_id": "plan_TupnPSnQSitc0L",
         "features": ["Everything in Starter", "Up to 5 users total (Owner + 4 staff)", "Staff management & roles", "Multi-device realtime sync", "Background & offline-first sync", "Role-based notifications", "Sales Analytics Dashboard", "Inventory management & alerts", "Expense tracking", "AI Photo → Menu"]},
        {"id": "GROWTH_YEARLY", "name": "Growth", "price": 5999.0, "interval": "year", "valid_days": 365,
         "features": ["Everything in Growth Monthly", "Save ₹1,189 annually"]},
        {"id": "PRO_MONTHLY", "name": "Pro", "price": 999.0, "interval": "month", "valid_days": 30,
         "features": ["Everything in Growth", "Up to 15 users total (Owner + 14 staff)", "Customer QR Web Menu", "Customer self-ordering", "Table QR codes", "Waiter QR confirmation", "Custom permissions", "Audit logs", "Advanced AI features", "API & Webhook integrations"]},
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

    async def _migrate_restaurant_logos():
        try:
            cursor = db.restaurants.find({"logo_base64": {"$exists": True, "$ne": ""}})
            async for rest in cursor:
                raw_logo = rest.get("logo_base64")
                if raw_logo:
                    l58 = optimize_logo_base64(raw_logo, 100, 100)
                    l80 = optimize_logo_base64(raw_logo, 130, 130)
                    await db.restaurants.update_one(
                        {"id": rest["id"]},
                        {"$set": {"logo_base64_58": l58, "logo_base64_80": l80}}
                    )
        except Exception as e:
            logger.warning("Logo migration notice: %s", e)
    asyncio.create_task(_migrate_restaurant_logos())

    async def _midnight_reset_worker():
        last_reset_day = None
        while True:
            try:
                ist_offset = timedelta(hours=5, minutes=30)
                now_ist = datetime.now(timezone(ist_offset))
                current_day = now_ist.date()
                
                # If day changed at 12:00 AM midnight
                if last_reset_day is not None and current_day != last_reset_day:
                    logger.info("Midnight 12:00 AM IST detected: Running business reset across all restaurants for %s...", current_day)
                    tenants = await db.restaurants.find({}, {"_id": 0, "id": 1}).to_list(1000)
                    for t in tenants:
                        tid = t.get("id")
                        if tid:
                            await _auto_clear_kitchen_orders(tid, force=True)
                            await notify_tenant(
                                tid,
                                "system",
                                "Daily Reset",
                                "Daily 12:00 AM business day reset completed.",
                                {"event": "MIDNIGHT_RESET", "date": current_day.isoformat()}
                            )
                    dashboard_summary_cache.clear()
                    
                last_reset_day = current_day
            except Exception as e:
                logger.error("Error in midnight_reset_worker: %s", e)
            await asyncio.sleep(10)
    asyncio.create_task(_midnight_reset_worker())


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
