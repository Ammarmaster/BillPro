import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { BillingEngine } from "./billingEngine";

const BASE = (process.env.EXPO_PUBLIC_BACKEND_URL && !process.env.EXPO_PUBLIC_BACKEND_URL.includes("0.0.0.0") ? process.env.EXPO_PUBLIC_BACKEND_URL : "https://billpro-wulv.onrender.com").replace(/\/$/, "");

const KEYS = { access: "lumina_access", refresh: "lumina_refresh" };

// In-memory cache for ultra-fast instant UI rendering
const memoryCache: Record<string, any> = {};

// Cache subscription list for local-first reactive rendering
type CacheListener = (path: string, data: any) => void;
const cacheListeners: Set<CacheListener> = new Set();

export function subscribeToCache(cb: CacheListener) {
  cacheListeners.add(cb);
  return () => {
    cacheListeners.delete(cb);
  };
}

export function notifyCacheUpdate(path: string, data: any) {
  for (const cb of cacheListeners) {
    try { cb(path, data); } catch {}
  }
}

// Disk cache helper using AsyncStorage (supports unlimited size on Android, Web, and iOS)
async function setDiskCache(k: string, v: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    try { window.localStorage.setItem(k, v); } catch {}
    return;
  }
  try { await AsyncStorage.setItem(k, v); } catch {}
}

async function getDiskCache(k: string): Promise<string | null> {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    try { return window.localStorage.getItem(k); } catch { return null; }
  }
  try { return await AsyncStorage.getItem(k); } catch { return null; }
}

async function delDiskCache(k: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    try { window.localStorage.removeItem(k); } catch {}
    return;
  }
  try { await AsyncStorage.removeItem(k); } catch {}
}

function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function sanitizeSummaryForNewDay(summary: any): any {
  if (!summary || typeof summary !== "object") return summary;
  const todayStr = getTodayDateString();
  const cacheDate = summary.__cache_date || summary.business_date;
  if (cacheDate && cacheDate !== todayStr) {
    return {
      ...summary,
      revenue_today: 0,
      orders_today: 0,
      orders_open: 0,
      pending_count: 0,
      cooking_count: 0,
      ready_count: 0,
      revenue_web_today: 0,
      avg_bill: 0,
      business_date: todayStr,
      __cache_date: todayStr
    };
  }
  return { ...summary, __cache_date: todayStr };
}

// Synchronous disk hydration on Web and startup
if (Platform.OS === "web" && typeof window !== "undefined") {
  try {
    const keys = ["/dashboard/summary", "/tables", "/orders", "/bills", "/restaurant", "/categories", "/menu-items", "/dashboard/feedback", "/admin/summary", "/admin/restaurants", "/subscriptions/mine"];
    for (const k of keys) {
      const v = window.localStorage.getItem("disk_cache_" + k);
      if (v) {
        const parsed = JSON.parse(v);
        memoryCache[k] = k === "/dashboard/summary" ? sanitizeSummaryForNewDay(parsed) : parsed;
      }
    }
  } catch {}
} else if (Platform.OS !== "web") {
  // Asynchronous pre-hydration on Native
  const keys = ["/dashboard/summary", "/tables", "/orders", "/bills", "/restaurant", "/categories", "/menu-items", "/dashboard/feedback", "/admin/summary", "/admin/restaurants", "/subscriptions/mine"];
  for (const k of keys) {
    AsyncStorage.getItem("disk_cache_" + k).then(v => {
      if (v) {
        try {
          const parsed = JSON.parse(v);
          memoryCache[k] = k === "/dashboard/summary" ? sanitizeSummaryForNewDay(parsed) : parsed;
          notifyCacheUpdate(k, memoryCache[k]);
        } catch {}
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
      delete cacheTimestamps[k];
      delDiskCache("disk_cache_" + k).catch(() => {});
      notifyCacheUpdate(k, null);
    }
  }
}

const cacheTimestamps: Record<string, number> = {};

function getCacheTTL(path: string): number {
  if (path.startsWith("/tables") || path.startsWith("/orders")) {
    return 5000; // 5 seconds
  }
  if (path.startsWith("/restaurant") || path.startsWith("/categories") || path.startsWith("/menu-items") || path.startsWith("/plans") || path.startsWith("/staff")) {
    return 30000; // 30 seconds
  }
  return 0;
}

// Robust auth token storage with AsyncStorage and SecureStore fallback
async function setItem(k: string, v: string) {
  if (Platform.OS === "web") {
    try { window.localStorage.setItem(k, v); } catch {}
    return;
  }
  try { await AsyncStorage.setItem(k, v); } catch {}
  try { await SecureStore.setItemAsync(k, v); } catch {}
}
async function getItem(k: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try { return window.localStorage.getItem(k); } catch { return null; }
  }
  try {
    const val = await AsyncStorage.getItem(k);
    if (val) return val;
  } catch {}
  try {
    return await SecureStore.getItemAsync(k);
  } catch {
    return null;
  }
}
async function delItem(k: string) {
  if (Platform.OS === "web") {
    try { window.localStorage.removeItem(k); } catch {}
    return;
  }
  try { await AsyncStorage.removeItem(k); } catch {}
  try { await SecureStore.deleteItemAsync(k); } catch {}
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

let onUnauthorizedCallback: (() => void) | null = null;
export function setUnauthorizedCallback(cb: () => void) {
  onUnauthorizedCallback = cb;
}

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

// Purge any legacy disk outbox queue from storage on startup
if (Platform.OS === "web" && typeof window !== "undefined") {
  try {
    window.localStorage.removeItem("disk_outbox_queue");
  } catch {}
} else if (Platform.OS !== "web") {
  SecureStore.deleteItemAsync("disk_outbox_queue").catch(() => {});
}

export async function startSyncRunner() {
  // No-op: Direct live real-time sync active
}

const inFlightRequests: Record<string, Promise<any> | undefined> = {};

async function req(path: string, opts: RequestInit = {}, auth = true, isRetry = false): Promise<any> {
  const isGet = !opts.method || opts.method.toUpperCase() === "GET";
  const ttl = getCacheTTL(path);
  
  if (isGet && !isRetry && ttl > 0 && memoryCache[path] !== undefined && memoryCache[path] !== null) {
    const lastFetch = cacheTimestamps[path] || 0;
    if (Date.now() - lastFetch < ttl) {
      return memoryCache[path];
    }
  }

  if (isGet && !isRetry) {
    const existing = inFlightRequests[path];
    if (existing !== undefined) {
      return existing;
    }
  }

  const execute = async () => {
    const headers: Record<string, string> = {
      ...((opts.headers as any) || {}),
    };
    if (!(opts.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }
    if (auth) {
      const t = await getAccess();
      if (t) headers["Authorization"] = `Bearer ${t}`;
    }

    let res: Response;
    try {
      res = await fetch(`${BASE}/api${path}`, { ...opts, headers });
    } catch (netErr: any) {
      if (isGet && memoryCache[path] !== undefined && memoryCache[path] !== null) {
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
      if (res.status === 401) {
        await clearTokens();
        if (onUnauthorizedCallback) {
          onUnauthorizedCallback();
        }
      }
      if (isGet && memoryCache[path] !== undefined && memoryCache[path] !== null) {
        return memoryCache[path];
      }
      throw err;
    }

    if (isGet) {
      if (path === "/dashboard/summary" && data && typeof data === "object") {
        data.__cache_date = getTodayDateString();
      }
      memoryCache[path] = data;
      cacheTimestamps[path] = Date.now();
      if (data) {
        setDiskCache("disk_cache_" + path, JSON.stringify(data)).catch(() => {});
      }
      notifyCacheUpdate(path, data);
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
  clearCachePrefix: (prefix: string) => clearCachePrefix(prefix),
  getPendingSyncCount: () => 0,
  login: (email: string, password: string) =>
    req("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }, false),
  staffLogin: (phone: string, pin: string) =>
    req("/auth/staff-login", { method: "POST", body: JSON.stringify({ phone, pin }) }, false),
  register: (email: string, password: string, full_name: string, role = "owner", terms_accepted = false, privacy_consent = false, marketing_consent = false) =>
    req("/auth/register", { method: "POST", body: JSON.stringify({ email, password, full_name, role, terms_accepted, privacy_consent, marketing_consent }) }, false),
  me: () => req("/auth/me"),
  updateConsent: (consent_type: string, status: "accepted" | "withdrawn") =>
    req("/users/consent", { method: "POST", body: JSON.stringify({ consent_type, status }) }),
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
  updateOrderStatus: async (id: string, status: string) => {
    const resolvedId = tempIdMap[id] || id;
    const res = await req(`/orders/${resolvedId}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
    clearCachePrefix("/dashboard/summary");
    return res;
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
    
    // Also mark ONLY the target order(s) as paid in the cached orders
    const oList = memoryCache["/orders"] || [];
    memoryCache["/orders"] = oList.map((o: any) => {
      if (o.id === res.order_id || (res.order_ids && res.order_ids.includes(o.id))) {
        return { ...o, status: "paid" };
      }
      return o;
    });
    
    clearCachePrefix("/dashboard");
    clearCachePrefix("/tables");
    clearCachePrefix("/bills");
    api.dashboardSummary().catch(() => {});
    return res;
  },
  settleTable: async (tableNumber: string, paymentMethod = "UPI", orderIds?: string[], total?: number) => {
    const res = await req("/bills/settle-table", {
      method: "POST",
      body: JSON.stringify({
        table_number: tableNumber,
        payment_method: paymentMethod,
        order_ids: orderIds,
        total
      })
    });
    const oList = memoryCache["/orders"] || [];
    memoryCache["/orders"] = oList.map((o: any) => {
      if ((orderIds && orderIds.includes(o.id)) || (!orderIds && String(o.table_number).toLowerCase() === String(tableNumber).toLowerCase())) {
        return { ...o, status: "paid" };
      }
      return o;
    });

    clearCachePrefix("/dashboard");
    clearCachePrefix("/tables");
    clearCachePrefix("/bills");
    api.dashboardSummary().catch(() => {});
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
  adminAssignSubscription: (tid: string, plan_id: string, valid_days?: number, status?: string) =>
    req(`/admin/restaurants/${tid}/subscription`, { method: "POST", body: JSON.stringify({ plan_id, valid_days, status: status || "active" }) }),
  adminExpireSubscription: (tid: string) =>
    req(`/admin/restaurants/${tid}/expire-subscription`, { method: "POST" }),
  adminUpdateRestaurantFeatures: (tid: string, custom_features: any, custom_staff_limit?: number) =>
    req(`/admin/restaurants/${tid}/features`, { method: "POST", body: JSON.stringify({ custom_features, custom_staff_limit }) }),
  adminCancelSubscription: (tid: string) => req(`/admin/restaurants/${tid}/subscription`, { method: "DELETE" }),
  adminSystemHealth: () => req("/admin/system-health"),
  adminBroadcastNotification: (payload: { title: string; message: string; category?: string; target_role?: string }) =>
    req("/admin/broadcast-notification", { method: "POST", body: JSON.stringify(payload) }),
  adminToggleRestaurantStatus: (tid: string, is_active?: boolean) =>
    req(`/admin/restaurants/${tid}/toggle-status`, { method: "POST", body: JSON.stringify(is_active !== undefined ? { is_active } : {}) }),
  
  cancelSubscription: async () => {
    const res = await req("/subscriptions/cancel", { method: "POST" });
    clearCachePrefix("/subscriptions/mine");
    await delItem("cached_sub");
    return res;
  },
  reactivateSubscription: async () => {
    const res = await req("/subscriptions/reactivate", { method: "POST" });
    clearCachePrefix("/subscriptions/mine");
    await delItem("cached_sub");
    return res;
  },
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
  getLegalConfig: () => req("/legal/config"),
  adminUpdateLegalConfig: (payload: any) => req("/admin/legal/config", { method: "POST", body: JSON.stringify(payload) }),
  myConsentRecords: () => req("/users/consent/my-records"),
  exportMyData: () => req("/users/export-my-data"),

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
  resolveQrOrder: (qr_data: string) => {
    return req("/orders/qr/resolve", { method: "POST", body: JSON.stringify({ qr_data }) });
  },
  confirmQrOrder: (qr_data: string, table_number?: string, operation_id?: string, table_id?: string) => {
    clearCachePrefix("/orders");
    clearCachePrefix("/tables");
    return req("/orders/qr/confirm", { method: "POST", body: JSON.stringify({ qr_data, table_number, operation_id, table_id }) });
  },

  // AI Menu OCR & Bulk Import
  ocrProcessMenu: (images: string[]) => {
    const formData = new FormData();
    images.forEach((uri, idx) => {
      const filename = uri.split("/").pop() || `menu_page_${idx}.jpg`;
      const match = /\.(\w+)$/.exec(filename);
      const ext = match ? match[1] : "jpg";
      const type = `image/${ext === "png" ? "png" : ext === "webp" ? "webp" : "jpeg"}`;
      formData.append("images", {
        uri,
        name: filename,
        type,
      } as any);
    });
    return req("/menu/ocr-process", { method: "POST", body: formData });
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
  getCachedSummary: () => {
    const cached = memoryCache['/dashboard/summary'];
    if (!cached) return null;
    const sanitized = sanitizeSummaryForNewDay(cached);
    memoryCache['/dashboard/summary'] = sanitized;
    return sanitized;
  },
  resetDailySalesCache: () => {
    const cached = memoryCache['/dashboard/summary'];
    const todayStr = getTodayDateString();
    const reset = {
      ...(cached || {}),
      revenue_today: 0,
      orders_today: 0,
      orders_open: 0,
      pending_count: 0,
      cooking_count: 0,
      ready_count: 0,
      revenue_web_today: 0,
      avg_bill: 0,
      business_date: todayStr,
      __cache_date: todayStr
    };
    memoryCache['/dashboard/summary'] = reset;
    setDiskCache("disk_cache_/dashboard/summary", JSON.stringify(reset)).catch(() => {});
    notifyCacheUpdate('/dashboard/summary', reset);
  },
  getCachedFeedback: () => memoryCache['/dashboard/feedback'] || null,
  getCachedAdminSummary: () => memoryCache['/admin/summary'] || null,
  getCachedAdminRestaurants: () => memoryCache['/admin/restaurants'] || null,
  
  // Client-side temp ID resolution
  resolveTempId: (id: string) => tempIdMap[id] || id,
  setTempIdMapping: (tempId: string, realId: string) => {
    tempIdMap[tempId] = realId;
  },
  injectCachedOrder: (order: any) => {
    if (!order || !order.id) return;
    const list = memoryCache["/orders"] || [];
    const updated = [order, ...list.filter((o: any) => o.id !== order.id && !String(o.id).startsWith("temp-"))];
    memoryCache["/orders"] = updated;
    notifyCacheUpdate("/orders", updated);
  },
  injectCachedBill: (bill: any) => {
    if (!bill || !bill.id) return;
    const list = memoryCache["/bills"] || [];
    const updated = [bill, ...list.filter((b: any) => b.id !== bill.id && !String(b.id).startsWith("temp-"))];
    memoryCache["/bills"] = updated;
    notifyCacheUpdate("/bills", updated);
  },
  updateCachedOrder: (id: string, realOrder: any) => {
    if (!realOrder || !realOrder.id) return;
    const list = memoryCache["/orders"] || [];
    const exists = list.some((o: any) => o.id === realOrder.id);
    let updated: any[];
    if (exists) {
      updated = list.map((o: any) => o.id === realOrder.id ? realOrder : o).filter((o: any) => o.id !== id || o.id === realOrder.id);
    } else {
      updated = list.map((o: any) => o.id === id ? realOrder : o);
    }
    updated = updated.filter((o: any) => !String(o.id).startsWith("temp-"));
    memoryCache["/orders"] = updated;
    notifyCacheUpdate("/orders", updated);
  },
  updateCachedBill: (id: string, realBill: any) => {
    if (!realBill || !realBill.id) return;
    const list = memoryCache["/bills"] || [];
    const exists = list.some((b: any) => b.id === realBill.id);
    let updated: any[];
    if (exists) {
      updated = list.map((b: any) => b.id === realBill.id ? realBill : b).filter((b: any) => b.id !== id || b.id === realBill.id);
    } else {
      updated = list.map((b: any) => b.id === id ? realBill : b);
    }
    updated = updated.filter((b: any) => !String(b.id).startsWith("temp-"));
    memoryCache["/bills"] = updated;
    notifyCacheUpdate("/bills", updated);
  },
  setCachedOrders: (orders: any[]) => {
    memoryCache["/orders"] = orders;
  },
  setCachedTables: (tables: any[]) => {
    memoryCache["/tables"] = tables;
  },
  setCachedSummary: (summary: any) => {
    memoryCache["/dashboard/summary"] = summary;
  },
  updateOrderStatusInCache: (orderId: string, status: string) => {
    const list = memoryCache["/orders"] || [];
    const resolvedId = tempIdMap[orderId] || orderId;
    const updated = list.map((o: any) => o.id === resolvedId ? { ...o, status } : o);
    memoryCache["/orders"] = updated;
    notifyCacheUpdate("/orders", updated);
  },
  settleTableInCache: (tableNumber: string) => {
    const list = memoryCache["/orders"] || [];
    const updated = list.map((o: any) => 
      String(o.table_number).toLowerCase().trim() === String(tableNumber).toLowerCase().trim()
        ? { ...o, status: "served" }
        : o
    );
    memoryCache["/orders"] = updated;
    notifyCacheUpdate("/orders", updated);
    
    // Also mark bills as paid
    const billsList = memoryCache["/bills"] || [];
    const updatedBills = billsList.map((b: any) => 
      updated.some((o: any) => o.id === b.order_id && o.status === "served")
        ? { ...b, status: "paid" }
        : b
    );
    memoryCache["/bills"] = updatedBills;
    notifyCacheUpdate("/bills", updatedBills);
  },
  notifyCacheUpdate: (path: string, data: any) => {
    notifyCacheUpdate(path, data);
  },
  hasFeature: (featureName: string): boolean => {
    const sub = memoryCache["/subscriptions/mine"];
    if (!sub) return true; // Default permissive on boot while caching
    const status = String(sub.status || "").toLowerCase();
    if (status === "active" || status === "trialing" || !status) {
      const plan = String(sub.plan_id || sub.plan_name || sub.plan || "pro").toLowerCase();
      // Pro Tier contains everything from Starter + Growth + Pro (100% unlocked)
      if (plan.includes("pro")) {
        return true;
      }
      // Growth Tier contains Starter + Growth features
      if (plan.includes("growth")) {
        const growthFeatures = [
          "billing", "menu_crud", "table_crud", "basic_orders", "thermal_printing", "gst", "cloud_backup",
          "staff_management", "multi_user", "realtime_sync", "notifications", "analytics", "advanced_reports", "inventory", "expenses", "ai_menu"
        ];
        return growthFeatures.includes(featureName);
      }
      // Starter Tier
      const starterFeatures = [
        "billing", "menu_crud", "table_crud", "basic_orders", "thermal_printing", "gst", "cloud_backup"
      ];
      return starterFeatures.includes(featureName);
    }
    return false;
  },
};
