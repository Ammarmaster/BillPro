import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const BASE = (process.env.EXPO_PUBLIC_BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");

const KEYS = { access: "lumina_access", refresh: "lumina_refresh" };

// In-memory cache for ultra-fast instant UI rendering
const memoryCache: Record<string, any> = {};

// Synchronous disk hydration on Web and startup
if (Platform.OS === "web" && typeof window !== "undefined") {
  try {
    const keys = ["/dashboard/summary", "/tables", "/orders", "/bills", "/restaurant", "/categories", "/menu-items", "/dashboard/feedback", "/admin/summary", "/admin/restaurants"];
    for (const k of keys) {
      const v = window.localStorage.getItem("disk_cache_" + k);
      if (v) memoryCache[k] = JSON.parse(v);
    }
  } catch {}
} else if (Platform.OS !== "web") {
  // Asynchronous pre-hydration on Native
  const keys = ["/dashboard/summary", "/tables", "/orders", "/bills", "/restaurant", "/categories", "/menu-items", "/dashboard/feedback", "/admin/summary", "/admin/restaurants"];
  for (const k of keys) {
    SecureStore.getItemAsync("disk_cache_" + k).then(v => {
      if (v) {
        try { memoryCache[k] = JSON.parse(v); } catch {}
      }
    }).catch(() => {});
  }
}

// Temporary client-side ID mapping for instant optimistic transitions
const tempIdMap: Record<string, string> = {};

export function clearCachePrefix(prefix: string) {
  for (const k in memoryCache) {
    if (k.startsWith(prefix)) {
      memoryCache[k] = null;
      delItem("disk_cache_" + k).catch(() => {});
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

export async function saveTokens(access: string, refresh: string, user?: any) {
  await setItem(KEYS.access, access);
  await setItem(KEYS.refresh, refresh);
  if (user) {
    await setItem("lumina_user", JSON.stringify(user));
  }
}

export async function getStoredUser(): Promise<any | null> {
  const str = await getItem("lumina_user");
  if (!str) return null;
  try { return JSON.parse(str); } catch { return null; }
}

export async function clearTokens() {
  clearCachePrefix("/restaurant");
  clearCachePrefix("/tables");
  clearCachePrefix("/orders");
  clearCachePrefix("/bills");
  clearCachePrefix("/menu-items");
  clearCachePrefix("/subscriptions/mine");
  await delItem(KEYS.access);
  await delItem(KEYS.refresh);
  await delItem("lumina_user");
  await delItem("cached_sub");
}
export async function getAccess() { return getItem(KEYS.access); }
export async function getRefresh() { return getItem(KEYS.refresh); }

let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

async function doRefreshToken(): Promise<string | null> {
  if (isRefreshing && refreshPromise) return refreshPromise;
  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const rToken = await getRefresh();
      if (!rToken) return null;
      const res = await fetch(`${BASE}/api/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${rToken}`
        }
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          // Genuinely expired refresh token
          await clearTokens();
        }
        return null;
      }
      const data = await res.json();
      if (data && data.access_token) {
        await saveTokens(data.access_token, data.refresh_token || rToken, data.user);
        return data.access_token;
      }
      return null;
    } catch (e) {
      // Network drop: do not clear tokens
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

const inFlightRequests: Record<string, Promise<any> | undefined> = {};

async function req(path: string, opts: RequestInit = {}, auth = true, isRetry = false): Promise<any> {
  const isGet = !opts.method || opts.method.toUpperCase() === "GET";
  
  if (isGet && !isRetry) {
    const existing = inFlightRequests[path];
    if (existing !== undefined) {
      return existing;
    }
  }

  const execute = async () => {
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
      return memoryCache[path];
    }

    let res: Response;
    try {
      res = await fetch(`${BASE}/api${path}`, { ...opts, headers });
    } catch (netErr: any) {
      // Network drop / offline: return cached data if available for GET
      if (isGet && memoryCache[path]) {
        return memoryCache[path];
      }
      throw new Error(netErr.message || "Network connection unavailable.");
    }

    // Automatic silent token refresh on 401 for authenticated requests
    if (res.status === 401 && auth && !isRetry && path !== "/auth/refresh" && path !== "/auth/login" && path !== "/auth/staff-login") {
      const newAccess = await doRefreshToken();
      if (newAccess) {
        return req(path, opts, auth, true);
      }
    }

    const text = await res.text();
    const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
    if (!res.ok) {
      const msg = (data && (data.detail || data.message)) || `HTTP ${res.status}`;
      const err: any = new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
      err.status = res.status;
      throw err;
    }

    if (isGet) {
      memoryCache[path] = data;
      if (data) {
        setItem("disk_cache_" + path, JSON.stringify(data)).catch(() => {});
      }
    }
    return data;
  };

  if (isGet && !isRetry) {
    inFlightRequests[path] = execute().finally(() => {
      delete inFlightRequests[path];
    });
    return inFlightRequests[path];
  }

  return execute();
}

export const api = {
  login: (email: string, password: string) =>
    req("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }, false),
  staffLogin: (phone: string, pin: string) =>
    req("/auth/staff-login", { method: "POST", body: JSON.stringify({ phone, pin }) }, false),
  register: (email: string, password: string, full_name: string, role = "owner", terms_accepted = false) =>
    req("/auth/register", { method: "POST", body: JSON.stringify({ email, password, full_name, role, terms_accepted }) }, false),
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
    let resolvedId = tempIdMap[id] || id;

    const res = await req(`/bills/${resolvedId}/pay`, { method: "PATCH", body: JSON.stringify({ payment_method: paymentMethod }) });
    const bList = memoryCache["/bills"] || [];
    memoryCache["/bills"] = bList.map((b: any) => (b.id === resolvedId || b.id === id) ? { ...b, ...res, status: "paid" } : b);
    
    // Also mark ONLY the target order(s) as served in the cached orders
    const oList = memoryCache["/orders"] || [];
    memoryCache["/orders"] = oList.map((o: any) => {
      if (o.id === res.order_id || (res.order_ids && res.order_ids.includes(o.id))) {
        return { ...o, status: "served" };
      }
      return o;
    });
    
    clearCachePrefix("/tables");
    clearCachePrefix("/dashboard/summary");
    return res;
  },
  settleTable: async (tableNumber: string, paymentMethod = "UPI") => {
    const res = await req("/bills/settle-table", { method: "POST", body: JSON.stringify({ table_number: tableNumber, payment_method: paymentMethod }) });
    const oList = memoryCache["/orders"] || [];
    memoryCache["/orders"] = oList.map((o: any) => {
      if (String(o.table_number).toLowerCase() === String(tableNumber).toLowerCase()) {
        return { ...o, status: "served" };
      }
      return o;
    });
    clearCachePrefix("/tables");
    clearCachePrefix("/dashboard/summary");
    clearCachePrefix("/bills");
    return res;
  },
  listBills: () => req("/bills"),
  dashboardSummary: () => req("/dashboard/summary"),
  getFeedback: () => req("/dashboard/feedback"),
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
  mySubscription: async () => {
    const cacheKey = "/subscriptions/mine";
    if (memoryCache[cacheKey]) {
      return memoryCache[cacheKey];
    }
    let storedSub: any = null;
    try {
      const val = await getItem("cached_sub");
      if (val) {
        storedSub = JSON.parse(val);
        memoryCache[cacheKey] = storedSub;
      }
    } catch {}
    try {
      const res = await req("/subscriptions/mine");
      memoryCache[cacheKey] = res;
      try {
        await setItem("cached_sub", JSON.stringify(res));
      } catch {}
      return res;
    } catch (e) {
      if (storedSub) return storedSub;
      throw e;
    }
  },
  publicPlans: () => req("/plans"),
  checkout: (plan_id: string) => req("/subscriptions/checkout", { method: "POST", body: JSON.stringify({ plan_id }) }),
  verifyPayment: async (payload: any) => {
    clearCachePrefix("/subscriptions/mine");
    await delItem("cached_sub");
    return req("/subscriptions/verify", { method: "POST", body: JSON.stringify(payload) });
  },
  deleteAccount: () => req("/auth/delete-account", { method: "DELETE" }),

  // Notifications API bindings
  listNotifications: (category?: string) => {
    const qs = category ? `?category=${category}` : "";
    return req(`/notifications${qs}`);
  },
  readNotification: (nid: string) => req(`/notifications/${nid}/read`, { method: "PATCH" }),
  readAllNotifications: () => req("/notifications/read-all", { method: "POST" }),
  deleteNotification: (nid: string) => req(`/notifications/${nid}`, { method: "DELETE" }),
  clearNotifications: () => req("/notifications", { method: "DELETE" }),
  savePushToken: (token: string) => req("/users/push-token", { method: "POST", body: JSON.stringify({ push_token: token }) }),

  // QR Web Order Import
  scanImportOrder: (qr_data: string, table_number?: string) => {
    clearCachePrefix("/orders");
    clearCachePrefix("/tables");
    return req("/orders/scan-import", { method: "POST", body: JSON.stringify({ qr_data, table_number }) });
  },

  // AI Menu OCR & Bulk Import
  ocrProcessMenu: (images: string[]) => {
    return req("/menu/ocr-process", { method: "POST", body: JSON.stringify({ images }) });
  },
  bulkImportMenu: (categories: any[]) => {
    clearCachePrefix("/categories");
    clearCachePrefix("/menu-items");
    return req("/menu/bulk-import", { method: "POST", body: JSON.stringify({ categories }) });
  },
  rollbackBulkImport: (itemIds: string[], categoryIds: string[]) => {
    clearCachePrefix("/categories");
    clearCachePrefix("/menu-items");
    return req("/menu/bulk-import/rollback", { method: "POST", body: JSON.stringify({ item_ids: itemIds, category_ids: categoryIds }) });
  },
  
  // Cache utilities
  getCachedOrders: () => memoryCache['/orders'] || null,
  getCachedBills: () => memoryCache['/bills'] || null,
  getCachedRestaurant: () => memoryCache['/restaurant'] || null,
  getCachedCategories: () => memoryCache['/categories'] || null,
  getCachedMenu: () => memoryCache['/menu-items'] || null,
  getCachedTables: () => memoryCache['/tables'] || null,
  getCachedSummary: () => memoryCache['/dashboard/summary'] || null,
  getCachedFeedback: () => memoryCache['/dashboard/feedback'] || null,
  getCachedAdminSummary: () => memoryCache['/admin/summary'] || null,
  getCachedAdminRestaurants: () => memoryCache['/admin/restaurants'] || null,
  
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
  setCachedOrders: (orders: any[]) => {
    memoryCache["/orders"] = orders;
  },
  setCachedSummary: (summary: any) => {
    memoryCache["/dashboard/summary"] = summary;
  },
};
