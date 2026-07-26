import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const BASE = (process.env.EXPO_PUBLIC_BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");

const KEYS = { access: "lumina_access", refresh: "lumina_refresh" };

// In-memory cache for ultra-fast instant UI rendering
const memoryCache: Record<string, any> = {};

// SecureStore is unreliable on web -> fallback to localStorage
async function setItem(k: string, v: string) {
  if (Platform.OS === "web") {
    try { window.localStorage.setItem(k, v); } catch {}
    return;
  }
  await SecureStore.setItemAsync(k, v);
}
async function getItem(k: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try { return window.localStorage.getItem(k); } catch { return null; }
  }
  return await SecureStore.getItemAsync(k);
}
async function delItem(k: string) {
  if (Platform.OS === "web") {
    try { window.localStorage.removeItem(k); } catch {}
    return;
  }
  await SecureStore.deleteItemAsync(k);
}

export async function saveTokens(access: string, refresh: string) {
  await setItem(KEYS.access, access);
  await setItem(KEYS.refresh, refresh);
}
export async function clearTokens() {
  memoryCache['/restaurant'] = null;
  memoryCache['/tables'] = null;
  memoryCache['/orders'] = null;
  memoryCache['/bills'] = null;
  memoryCache['/menu-items'] = null;
  await delItem(KEYS.access);
  await delItem(KEYS.refresh);
}
export async function getAccess() { return getItem(KEYS.access); }
export async function getRefresh() { return getItem(KEYS.refresh); }

async function req(path: string, opts: RequestInit = {}, auth = true): Promise<any> {
  const isGet = !opts.method || opts.method.toUpperCase() === "GET";
  
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((opts.headers as any) || {}),
  };
  if (auth) {
    const t = await getAccess();
    if (t) headers["Authorization"] = `Bearer ${t}`;
  }

  // Fast cache check for GET requests
  if (isGet && memoryCache[path] !== undefined && memoryCache[path] !== null) {
    // Return cached immediately, trigger background refresh
    fetch(`${BASE}/api${path}`, { ...opts, headers })
      .then(res => res.text())
      .then(text => {
        if (text) {
          try { memoryCache[path] = JSON.parse(text); } catch {}
        }
      })
      .catch(() => {});
    return memoryCache[path];
  }

  const res = await fetch(`${BASE}/api${path}`, { ...opts, headers });
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) {
    const msg = (data && (data.detail || data.message)) || `HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }

  if (isGet) {
    memoryCache[path] = data;
  }
  return data;
}

export const api = {
  login: (email: string, password: string) =>
    req("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }, false),
  staffLogin: (phone: string, pin: string) =>
    req("/auth/staff-login", { method: "POST", body: JSON.stringify({ phone, pin }) }, false),
  register: (email: string, password: string, full_name: string, role = "owner") =>
    req("/auth/register", { method: "POST", body: JSON.stringify({ email, password, full_name, role }) }, false),
  me: () => req("/auth/me"),
  getRestaurant: () => req("/restaurant"),
  saveRestaurant: (payload: any) => {
    memoryCache['/restaurant'] = null;
    return req("/restaurant", { method: "POST", body: JSON.stringify(payload) });
  },
  listCategories: () => req("/categories"),
  createCategory: (payload: any) => {
    memoryCache['/categories'] = null;
    return req("/categories", { method: "POST", body: JSON.stringify(payload) });
  },
  deleteCategory: (id: string) => {
    memoryCache['/categories'] = null;
    return req(`/categories/${id}`, { method: "DELETE" });
  },
  listMenu: () => req("/menu-items"),
  createMenuItem: (payload: any) => {
    memoryCache['/menu-items'] = null;
    return req("/menu-items", { method: "POST", body: JSON.stringify(payload) });
  },
  updateMenuItem: (id: string, payload: any) => {
    memoryCache['/menu-items'] = null;
    return req(`/menu-items/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
  },
  deleteMenuItem: (id: string) => {
    memoryCache['/menu-items'] = null;
    return req(`/menu-items/${id}`, { method: "DELETE" });
  },
  listTables: () => req("/tables"),
  createTable: (payload: any) => {
    memoryCache['/tables'] = null;
    return req("/tables", { method: "POST", body: JSON.stringify(payload) });
  },
  deleteTable: (id: string) => {
    memoryCache['/tables'] = null;
    return req(`/tables/${id}`, { method: "DELETE" });
  },
  listWaiters: () => req("/staff/waiters"),
  createWaiter: (payload: any) => {
    memoryCache['/staff/waiters'] = null;
    return req("/staff/waiters", { method: "POST", body: JSON.stringify(payload) });
  },
  deleteWaiter: (id: string) => {
    memoryCache['/staff/waiters'] = null;
    return req(`/staff/waiters/${id}`, { method: "DELETE" });
  },
  createOrder: (payload: any) => {
    memoryCache['/orders'] = null;
    memoryCache['/tables'] = null;
    memoryCache['/dashboard/summary'] = null;
    return req("/orders", { method: "POST", body: JSON.stringify(payload) });
  },
  listOrders: (status?: string) => req(`/orders${status ? `?status_filter=${status}` : ""}`),
  updateOrderStatus: (id: string, status: string) => {
    memoryCache['/orders'] = null;
    memoryCache['/dashboard/summary'] = null;
    return req(`/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
  },
  createBill: (payload: any) => {
    memoryCache['/bills'] = null;
    memoryCache['/dashboard/summary'] = null;
    return req("/bills", { method: "POST", body: JSON.stringify(payload) });
  },
  markBillPaid: (id: string, paymentMethod = "UPI") => {
    memoryCache['/bills'] = null;
    memoryCache['/tables'] = null;
    memoryCache['/orders'] = null;
    memoryCache['/dashboard/summary'] = null;
    return req(`/bills/${id}/pay`, { method: "PATCH", body: JSON.stringify({ payment_method: paymentMethod }) });
  },
  listBills: () => req("/bills"),
  dashboardSummary: () => req("/dashboard/summary"),
  // Super admin
  adminSummary: () => req("/admin/summary"),
  adminListRestaurants: () => req("/admin/restaurants"),
  adminRestaurantDetail: (id: string) => req(`/admin/restaurants/${id}`),
  adminDeleteRestaurant: (id: string) => req(`/admin/restaurants/${id}`, { method: "DELETE" }),
  adminListUsers: () => req("/admin/users"),
  adminCreateUser: (payload: any) => req("/admin/users", { method: "POST", body: JSON.stringify(payload) }),
  adminUpdateUser: (uid: string, payload: any) => req(`/admin/users/${uid}`, { method: "PATCH", body: JSON.stringify(payload) }),
  adminResetPassword: (uid: string, new_password: string) =>
    req(`/admin/users/${uid}/reset-password`, { method: "POST", body: JSON.stringify({ new_password }) }),
  adminDeleteUser: (uid: string) => req(`/admin/users/${uid}`, { method: "DELETE" }),
  adminMarkRestaurantRead: (tid: string) => req(`/admin/restaurants/${tid}/read`, { method: "POST" }),
  adminListPlans: () => req("/admin/plans"),
  adminCreatePlan: (payload: any) => req("/admin/plans", { method: "POST", body: JSON.stringify(payload) }),
  adminDeletePlan: (id: string) => req(`/admin/plans/${id}`, { method: "DELETE" }),
  adminAssignSubscription: (tid: string, plan_id: string) =>
    req(`/admin/restaurants/${tid}/subscription`, { method: "POST", body: JSON.stringify({ plan_id, status: "active" }) }),
  adminCancelSubscription: (tid: string) => req(`/admin/restaurants/${tid}/subscription`, { method: "DELETE" }),
  // Razorpay subscription flow (owner)
  mySubscription: () => req("/subscriptions/mine"),
  publicPlans: () => req("/plans"),
  checkout: (plan_id: string) => req("/subscriptions/checkout", { method: "POST", body: JSON.stringify({ plan_id }) }),
  verifyPayment: (payload: any) => {
    memoryCache['/subscriptions/mine'] = null;
    return req("/subscriptions/verify", { method: "POST", body: JSON.stringify(payload) });
  },
  deleteAccount: () => req("/auth/delete-account", { method: "DELETE" }),
};

