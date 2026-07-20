# Lumina Restaurant ERP — Product Requirements

## Vision
Luxury, Apple-inspired Restaurant ERP SaaS (mobile + tablet). Multi-tenant, JWT-secured, dynamic light/dark themes, no hardcoded business data.

## Delivered — Phase 1 (Foundation)
### Backend (FastAPI + MongoDB, all `/api/*`)
- JWT auth: register/login/me/refresh (bcrypt, access 60 min, refresh 14 d)
- Idempotent super_admin seed on startup (`Ammar@prodevopz.in` from env)
- Multi-tenant models: User, Restaurant, Category, MenuItem, Order, Bill
- RBAC: super_admin / owner / manager / waiter / kitchen
- Restaurant CRUD (POST /restaurant, GET /restaurant) — first save assigns `tenant_id` to owner
- Categories + Menu Items CRUD scoped by tenant
- Orders create / list / status transitions (placed → in_kitchen → ready → served / cancelled)
- Bills: generate with tax %, discount; produces UPI deep-link (`upi://pay?pa=...`)
- Mark-paid also completes the order
- Dashboard summary: revenue today / total, open orders, menu count

### Frontend (Expo Router, dark-first "Glass / Luxe" theme)
- Cinematic landing with marble backdrop
- Login / Register screens
- Protected `(app)` tab group: Dashboard, Menu, Waiter, Kitchen, More
- Dashboard: welcome, onboarding CTA, metric cards, quick actions
- Menu manager: horizontal category chips, item cards, modal creates
- Waiter split-screen: top 35 % active order, bottom 65 % menu grid with search + chips, live subtotal, "Send to Kitchen" CTA
- Kitchen Display: high-contrast cards with color-coded status, one-tap "Advance", auto-refresh every 6 s
- Billing: receipt view, tax/discount inputs, UPI QR (via api.qrserver.com), Mark Paid
- Settings (More): restaurant registration form + sign-out

### Auth Credentials (Seeded)
See `/app/memory/test_credentials.md`.

## Delivered — Phase 2 (Owner CRUD + Super Admin + Printing)
### Backend additions
- `phone` and `gst_enabled` fields on Restaurant
- Tables CRUD: `POST/GET/DELETE /api/tables` (owner/manager)
- Waiters CRUD: `POST/GET/DELETE /api/staff/waiters` (owner/manager). Waiter has plaintext tenant-scoped `pin` for staff-login.
- Staff Login: `POST /api/auth/staff-login` { phone, pin } → JWT tied to tenant
- Menu items: `PATCH /api/menu-items/{id}` (image / fields update)
- Bills: `gst_enabled` splits tax into CGST + SGST; snapshot of restaurant (name/address/phone/gst/fssai/logo) embedded
- Super Admin Console endpoints (all `require_roles("super_admin")`):
  - `GET /api/admin/summary` — total restaurants/users/owners/waiters, active subs, MRR, ARR
  - `GET /api/admin/restaurants` + `/{id}` + `DELETE {id}` (cascade)
  - `GET /api/admin/users` + `POST /{id}/reset-password` + `DELETE /{id}` (no self-delete)
  - `GET/POST/DELETE /api/admin/plans`
  - `POST/DELETE /api/admin/restaurants/{tid}/subscription`
  - Public `GET /api/plans` (active plans)
- Idempotent seed of default plans on startup: Monthly ₹499, Yearly ₹4999

### Frontend additions
- Landing: 3 CTAs (Owner Sign In / Staff Sign In / Create Restaurant)
- `/staff-login` screen (phone + 4-6 digit PIN)
- More screen: logo picker (base64 or gold monogram default), phone field, GST toggle, links to Tables & Waiters
- Tables screen: grid CRUD with seat count
- Waiters screen: create with name + PIN, banner showing PIN post-create, delete
- Menu: image picker per item + auto-fetch food image by name (LoremFlickr) fallback; `FadeInUp` animation
- Waiter: table chips from API, `FadeInUp/FadeInDown` animations, animated bouncing subtotal, haptic feedback on add/remove
- Billing: GST toggle → CGST/SGST rows, restaurant logo + snapshot, **Print** (expo-print system dialog / thermal via Android print service) and **Share PDF** (expo-sharing on native, browser print on web)
- Super Admin Console (dashboard when role=super_admin): metrics grid + nav to Restaurants / Users & Passwords / Subscription Plans
- Admin Restaurants: list w/ name+phone+address+plan badge, detail modal with orders/revenue, assign plan, cancel sub, delete
- Admin Users: role filter chips, reset password (validates PIN for waiters), delete
- Admin Plans: seeded plans + create/delete with features list
- Tabs hide non-admin sections when signed in as super_admin

### Verified
- 21/21 Phase 1 pytest still green + 20/21 Phase 2 pytest → **41/42 backend**
- Full frontend flows validated by testing_agent

## Roadmap — Deferred to Later Phases
- Real OTP phone login (Twilio / MSG91 / Firebase) — user chose to defer
- Razorpay recurring billing (user will provide API keys later)
- Real-time WebSocket KDS updates (polling suffices for now)
- Native Bluetooth thermal driver (58/80mm ESC/POS) — needs published build + real hardware
- FCM/APNs push notifications — needs `google-services.json` + published build
- Inventory, CRM, loyalty, reports & analytics
- Offline sync, audit logs, RBAC user-management UI for owners

## Non-goals for Phase 2
Real OTP, real Razorpay charge, thermal ESC/POS driver, push notifications.
