import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const BASE = (process.env.EXPO_PUBLIC_BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");

const KEYS = { access: "lumina_access", refresh: "lumina_refresh" };

// In-memory cache for ultra-fast instant UI rendering
const memoryCache: Record<string, any> = {};

// Temporary client-side ID mapping for instant optimistic transitions
const tempIdMap: Record<string, string> = {};

function clearCachePrefix(prefix: string) {
  for (const k in memoryCache) {
    if (k.startsWith(prefix)) {
      memoryCache[k] = null;
    }
  }
}

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
  clearCachePrefix("/restaurant");
  clearCachePrefix("/tables");
  clearCachePrefix("/orders");
  clearCachePrefix("/bills");
  clearCachePrefix("/menu-items");
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
    clearCachePrefix("/restaurant");
    return req("/restaurant", { method: "POST", body: JSON.stringify(payload) });
  },
  listCategories: () => req("/categories"),
  createCategory: (payload: any) => {
    clearCachePrefix("/categories");
    return req("/categories", { method: "POST", body: JSON.stringify(payload) });
  },
  deleteCategory: (id: string) => {
    clearCachePrefix("/categories");
    return req(`/categories/${id}`, { method: "DELETE" });
  },
  listMenu: () => req("/menu-items"),
  createMenuItem: (payload: any) => {
    clearCachePrefix("/menu-items");
    return req("/menu-items", { method: "POST", body: JSON.stringify(payload) });
  },
  updateMenuItem: (id: string, payload: any) => {
    clearCachePrefix("/menu-items");
    return req(`/menu-items/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
  },
  deleteMenuItem: (id: string) => {
    clearCachePrefix("/menu-items");
    return req(`/menu-items/${id}`, { method: "DELETE" });
  },
  listTables: () => req("/tables"),
  createTable: (payload: any) => {
    clearCachePrefix("/tables");
    return req("/tables", { method: "POST", body: JSON.stringify(payload) });
  },
  deleteTable: (id: string) => {
    clearCachePrefix("/tables");
    return req(`/tables/${id}`, { method: "DELETE" });
  },
  listWaiters: () => req("/staff/waiters"),
  createWaiter: (payload: any) => {
    clearCachePrefix("/staff/waiters");
    return req("/staff/waiters", { method: "POST", body: JSON.stringify(payload) });
  },
  deleteWaiter: (id: string) => {
    clearCachePrefix("/staff/waiters");
    return req(`/staff/waiters/${id}`, { method: "DELETE" });
  },
  
  createOrder: async (payload: any) => {
    const res = await req("/orders", { method: "POST", body: JSON.stringify(payload) });
    const list = memoryCache["/orders"] || [];
    memoryCache["/orders"] = [res, ...list.filter((o: any) => o.id !== res.id)];
    clearCachePrefix("/tables");
    clearCachePrefix("/dashboard/summary");
    return res;
  },
  updateOrder: async (id: string, payload: any) => {
    const resolvedId = tempIdMap[id] || id;
    const res = await req(`/orders/${resolvedId}`, { method: "PATCH", body: JSON.stringify(payload) });
    const list = memoryCache["/orders"] || [];
    memoryCache["/orders"] = list.map((o: any) => o.id === resolvedId ? res : o);
    clearCachePrefix("/tables");
    clearCachePrefix("/dashboard/summary");
    return res;
  },
  listOrders: (status?: string) => req(`/orders${status ? `?status_filter=${status}` : ""}`),
  updateOrderStatus: (id: string, status: string) => {
    const resolvedId = tempIdMap[id] || id;
    clearCachePrefix("/orders");
    clearCachePrefix("/dashboard/summary");
    return req(`/orders/${resolvedId}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
  },
  
  createBill: async (payload: any) => {
    const res = await req("/bills", { method: "POST", body: JSON.stringify(payload) });
    const list = memoryCache["/bills"] || [];
    memoryCache["/bills"] = [res, ...list.filter((b: any) => b.id !== res.id)];
    clearCachePrefix("/dashboard/summary");
    return res;
  },
  markBillPaid: async (id: string, paymentMethod = "UPI") => {
    let resolvedId = tempIdMap[id];
    if (!resolvedId && id.startsWith("temp-")) {
      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 100));
        resolvedId = tempIdMap[id];
        if (resolvedId) break;
      }
    }
    if (!resolvedId) resolvedId = id;

    const res = await req(`/bills/${resolvedId}/pay`, { method: "PATCH", body: JSON.stringify({ payment_method: paymentMethod }) });
    const bList = memoryCache["/bills"] || [];
    memoryCache["/bills"] = bList.map((b: any) => b.id === resolvedId ? res : b);
    
    // Also mark the corresponding order status as served in the cached orders!
    const oList = memoryCache["/orders"] || [];
    memoryCache["/orders"] = oList.map((o: any) => o.id === res.order_id ? { ...o, status: "served" } : o);
    
    clearCachePrefix("/tables");
    clearCachePrefix("/dashboard/summary");
    return res;
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
    clearCachePrefix("/subscriptions/mine");
    return req("/subscriptions/verify", { method: "POST", body: JSON.stringify(payload) });
  },
  deleteAccount: () => req("/auth/delete-account", { method: "DELETE" }),
  
  // Cache utilities
  getCachedOrders: () => memoryCache['/orders'] || null,
  getCachedBills: () => memoryCache['/bills'] || null,
  getCachedRestaurant: () => memoryCache['/restaurant'] || null,
  getCachedCategories: () => memoryCache['/categories'] || null,
  getCachedMenu: () => memoryCache['/menu-items'] || null,
  
  // Client-side temp ID resolution
  resolveTempId: (id: string) => tempIdMap[id] || id,
  setTempIdMapping: (tempId: string, realId: string) => {
    tempIdMap[tempId] = realId;
  },
  injectCachedOrder: (order: any) => {
    const list = memoryCache["/orders"] || [];
    memoryCache["/orders"] = [order, ...list.filter((o: any) => o.id !== order.id)];
  },
  injectCachedBill: (bill: any) => {
    const list = memoryCache["/bills"] || [];
    memoryCache["/bills"] = [bill, ...list.filter((b: any) => b.id !== bill.id)];
  },
  updateCachedOrder: (id: string, realOrder: any) => {
    const list = memoryCache["/orders"] || [];
    memoryCache["/orders"] = list.map((o: any) => o.id === id ? realOrder : o);
  },
  updateCachedBill: (id: string, realBill: any) => {
    const list = memoryCache["/bills"] || [];
    memoryCache["/bills"] = list.map((b: any) => b.id === id ? realBill : b);
  },
};
