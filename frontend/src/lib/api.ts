import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { BillingEngine } from "./billingEngine";
import { isTodayBusinessDay, safeParseDate } from "./dateUtils";
import {
  enqueueSyncAction,
  getPendingSyncCount,
  clearSyncQueue,
  processSyncQueue,
  startOfflineSyncRunner,
  subscribeToSyncQueue,
  SyncActionType,
} from "./offlineSync";

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

function normalizeTable(val: string | undefined | null): string {
  if (!val) return "";
  return String(val).toLowerCase().replace("table", "").replace("t", "").replace("-", "").trim();
}

function isSameTable(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false;
  if (String(a).toLowerCase().trim() === String(b).toLowerCase().trim()) return true;
  const na = normalizeTable(a);
  const nb = normalizeTable(b);
  return na.length > 0 && na === nb;
}

function isTodayDate(ts?: any): boolean {
  if (!ts) return true;
  return isTodayBusinessDay(ts);
}

export function computeLocalSummary(): any {
  const bList = (memoryCache["/bills"] || []).filter((b: any) => b && !String(b.id).startsWith("temp-"));
  const oList = (memoryCache["/orders"] || []).filter((o: any) => o && !String(o.id).startsWith("temp-"));
  const todayStr = getTodayDateString();

  const isPaid = (status?: any) => {
    const s = String(status || "").toLowerCase().trim();
    return s === "paid" || s === "completed" || s === "settled" || s === "served";
  };

  // 1. Paid bills today
  const paidBillsToday = bList.filter(
    (b: any) =>
      isPaid(b.status) &&
      isTodayDate(b.paid_at || b.created_at)
  );

  const seenOrderIds = new Set<string>();

  let revenue_today = paidBillsToday.reduce(
    (sum: number, b: any) => {
      if (b.order_id) seenOrderIds.add(b.order_id);
      if (Array.isArray(b.order_ids)) b.order_ids.forEach((id: string) => seenOrderIds.add(id));
      const amt = Number(b.total ?? b.subtotal ?? 0) || (b.items || []).reduce((acc: number, it: any) => acc + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
      return sum + amt;
    },
    0
  );

  // 2. Also sum any paid orders today that do not have a counted bill
  const todayOrders = oList.filter((o: any) => isTodayDate(o.created_at || o.updated_at));
  const unbilledPaidOrders = todayOrders.filter(
    (o: any) => isPaid(o.status) && !seenOrderIds.has(o.id)
  );

  const unbilledRevenue = unbilledPaidOrders.reduce(
    (sum: number, o: any) => {
      const amt = Number(o.subtotal || 0) || (o.items || []).reduce((acc: number, it: any) => acc + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
      return sum + amt;
    },
    0
  );

  revenue_today += unbilledRevenue;

  const orders_today = todayOrders.length;
  const orders_open = todayOrders.filter(
    (o: any) =>
      !isPaid(o.status) &&
      o.status !== "cancelled"
  ).length;
  const pending_count = todayOrders.filter((o: any) => o.status === "placed").length;
  const cooking_count = todayOrders.filter(
    (o: any) => o.status === "cooking" || o.status === "preparing"
  ).length;
  const ready_count = todayOrders.filter((o: any) => o.status === "ready").length;

  const webPaidOrdersToday = todayOrders.filter(
    (o: any) =>
      (o.created_by === "guest" || o.order_source === "qr_web") &&
      isPaid(o.status)
  );
  const revenue_web_today = webPaidOrdersToday.reduce(
    (sum: number, o: any) => {
      const amt = Number(o.subtotal || 0) || (o.items || []).reduce((acc: number, it: any) => acc + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
      return sum + amt;
    },
    0
  );

  const totalPaidCount = paidBillsToday.length + unbilledPaidOrders.length;
  const avg_bill =
    totalPaidCount > 0
      ? Math.round((revenue_today / totalPaidCount) * 100) / 100
      : 0;

  const currentSummary = memoryCache["/dashboard/summary"] || {};

  // Build Last 7 days with today's revenue placed on today
  const last_7_days = [6, 5, 4, 3, 2, 1, 0].map(daysAgo => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const dateLabel = `${m}-${day}`;
    if (daysAgo === 0) {
      return { date: dateLabel, revenue: revenue_today };
    }
    const existingDay = (currentSummary.last_7_days || []).find((x: any) => x.date === dateLabel);
    return { date: dateLabel, revenue: existingDay ? Number(existingDay.revenue || 0) : 0 };
  });

  const summary = {
    ...currentSummary,
    revenue_today,
    revenue_total: Math.max(revenue_today, Number(currentSummary.revenue_total || 0)),
    orders_today,
    orders_open,
    orders_total: Math.max(todayOrders.length, Number(currentSummary.orders_total || 0)),
    pending_count,
    cooking_count,
    ready_count,
    revenue_web_today,
    revenue_web_total: Math.max(revenue_web_today, Number(currentSummary.revenue_web_total || 0)),
    avg_bill,
    last_7_days,
    business_date: todayStr,
    __cache_date: todayStr,
  };

  memoryCache["/dashboard/summary"] = summary;
  setDiskCache("disk_cache_/dashboard/summary", JSON.stringify(summary)).catch(() => {});
  return summary;
}

function sanitizeHydratedData(key: string, parsed: any): any {
  if (key === "/dashboard/summary") {
    return sanitizeSummaryForNewDay(parsed);
  }
  if (key === "/orders" && Array.isArray(parsed)) {
    return parsed.filter((o: any) => o && !String(o.id).startsWith("temp-"));
  }
  if (key === "/bills" && Array.isArray(parsed)) {
    return parsed.filter((b: any) => b && !String(b.id).startsWith("temp-"));
  }
  return parsed;
}

// Synchronous disk hydration on Web and startup
if (Platform.OS === "web" && typeof window !== "undefined") {
  try {
    const keys = ["/dashboard/summary", "/tables", "/orders", "/bills", "/restaurant", "/categories", "/menu-items", "/dashboard/feedback", "/admin/summary", "/admin/restaurants", "/subscriptions/mine"];
    for (const k of keys) {
      const v = window.localStorage.getItem("disk_cache_" + k);
      if (v) {
        const parsed = JSON.parse(v);
        memoryCache[k] = sanitizeHydratedData(k, parsed);
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
          memoryCache[k] = sanitizeHydratedData(k, parsed);
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
      if (api.isLocalProcessingMode && api.isLocalProcessingMode()) {
        if (path === "/dashboard/summary") {
          return computeLocalSummary();
        }
        if (path === "/orders" || path === "/bills" || path === "/tables" || path === "/categories" || path === "/menu-items") {
          const localList = memoryCache[path];
          if (Array.isArray(localList) && localList.length > 0) {
            return localList;
          }
        }
      }
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
  getPendingSyncCount: () => getPendingSyncCount(),
  subscribeToSyncQueue: (cb: any) => subscribeToSyncQueue(cb),
  syncOfflineQueue: () => processSyncQueue((p, o, a) => req(p, o, a), tempIdMap, updateCacheFromSync),
  clearSyncQueue: () => clearSyncQueue(),
  login: (email: string, password: string) =>
    req("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }, false),
  staffLogin: (phone: string, pin: string) =>
    req("/auth/staff-login", { method: "POST", body: JSON.stringify({ phone, pin }) }, false),
  register: (email: string, password: string, full_name: string, role = "owner", terms_accepted = false, privacy_consent = false, marketing_consent = false) =>
    req("/auth/register", { method: "POST", body: JSON.stringify({ email, password, full_name, role, terms_accepted, privacy_consent, marketing_consent }) }, false),
  me: () => req("/auth/me"),
  updateConsent: (consent_type: string, status: "accepted" | "withdrawn") =>
    req("/users/consent", { method: "POST", body: JSON.stringify({ consent_type, status }) }),
  getRestaurant: async () => {
    if (api.isLocalProcessingMode && api.isLocalProcessingMode() && memoryCache["/restaurant"]) {
      return memoryCache["/restaurant"];
    }
    const cached = memoryCache["/restaurant"];
    const ttl = getCacheTTL("/restaurant");
    const lastFetch = cacheTimestamps["/restaurant"] || 0;
    if (cached && (Date.now() - lastFetch < ttl)) {
      return cached;
    }
    return req("/restaurant");
  },
  saveRestaurant: async (payload: any) => {
    if (api.isLocalProcessingMode()) {
      const existing = memoryCache["/restaurant"] || {};
      const updated = { ...existing, ...payload, updated_at: new Date().toISOString() };
      memoryCache["/restaurant"] = updated;
      cacheTimestamps["/restaurant"] = Date.now();
      setDiskCache("disk_cache_/restaurant", JSON.stringify(updated)).catch(() => {});
      notifyCacheUpdate("/restaurant", updated);
      await enqueueSyncAction("SAVE_RESTAURANT", payload);
      return updated;
    }
    clearCachePrefix("/restaurant");
    const res = await req("/restaurant", { method: "POST", body: JSON.stringify(payload) });
    if (res) {
      memoryCache["/restaurant"] = res;
      cacheTimestamps["/restaurant"] = Date.now();
      setDiskCache("disk_cache_/restaurant", JSON.stringify(res)).catch(() => {});
      notifyCacheUpdate("/restaurant", res);
    }
    return res;
  },
  listCategories: async () => {
    if (api.isLocalProcessingMode && api.isLocalProcessingMode() && memoryCache["/categories"]) {
      return memoryCache["/categories"];
    }
    return req("/categories");
  },
  createCategory: async (payload: any) => {
    if (api.isLocalProcessingMode()) {
      const localId = "cat_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
      const newCat = { id: localId, name: payload.name, sort_order: payload.sort_order ?? 0 };
      const list = memoryCache["/categories"] || [];
      const updated = [...list, newCat];
      memoryCache["/categories"] = updated;
      setDiskCache("disk_cache_/categories", JSON.stringify(updated)).catch(() => {});
      notifyCacheUpdate("/categories", updated);
      await enqueueSyncAction("CREATE_CATEGORY", payload, localId);
      return newCat;
    }
    clearCachePrefix("/categories");
    return req("/categories", { method: "POST", body: JSON.stringify(payload) });
  },
  deleteCategory: async (id: string) => {
    if (api.isLocalProcessingMode()) {
      const list = memoryCache["/categories"] || [];
      const updated = list.filter((c: any) => c.id !== id);
      memoryCache["/categories"] = updated;
      setDiskCache("disk_cache_/categories", JSON.stringify(updated)).catch(() => {});
      notifyCacheUpdate("/categories", updated);
      await enqueueSyncAction("DELETE_CATEGORY", { id });
      return { ok: true };
    }
    clearCachePrefix("/categories");
    return req(`/categories/${id}`, { method: "DELETE" });
  },
  listMenu: async () => {
    if (api.isLocalProcessingMode && api.isLocalProcessingMode() && memoryCache["/menu-items"]) {
      return memoryCache["/menu-items"];
    }
    return req("/menu-items");
  },
  createMenuItem: async (payload: any) => {
    if (api.isLocalProcessingMode()) {
      const localId = "item_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
      const newItem = { id: localId, is_active: true, ...payload };
      const list = memoryCache["/menu-items"] || [];
      const updated = [...list, newItem];
      memoryCache["/menu-items"] = updated;
      setDiskCache("disk_cache_/menu-items", JSON.stringify(updated)).catch(() => {});
      notifyCacheUpdate("/menu-items", updated);
      await enqueueSyncAction("CREATE_MENU_ITEM", payload, localId);
      return newItem;
    }
    clearCachePrefix("/menu-items");
    return req("/menu-items", { method: "POST", body: JSON.stringify(payload) });
  },
  updateMenuItem: async (id: string, payload: any) => {
    if (api.isLocalProcessingMode()) {
      const list = memoryCache["/menu-items"] || [];
      let updatedItem: any = null;
      const updated = list.map((m: any) => {
        if (m.id === id) {
          updatedItem = { ...m, ...payload };
          return updatedItem;
        }
        return m;
      });
      memoryCache["/menu-items"] = updated;
      setDiskCache("disk_cache_/menu-items", JSON.stringify(updated)).catch(() => {});
      notifyCacheUpdate("/menu-items", updated);
      await enqueueSyncAction("UPDATE_MENU_ITEM", { id, ...payload });
      return updatedItem || { id, ...payload };
    }
    clearCachePrefix("/menu-items");
    return req(`/menu-items/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
  },
  deleteMenuItem: async (id: string) => {
    if (api.isLocalProcessingMode()) {
      const list = memoryCache["/menu-items"] || [];
      const updated = list.filter((m: any) => m.id !== id);
      memoryCache["/menu-items"] = updated;
      setDiskCache("disk_cache_/menu-items", JSON.stringify(updated)).catch(() => {});
      notifyCacheUpdate("/menu-items", updated);
      await enqueueSyncAction("DELETE_MENU_ITEM", { id });
      return { ok: true };
    }
    clearCachePrefix("/menu-items");
    return req(`/menu-items/${id}`, { method: "DELETE" });
  },
  listTables: async () => {
    if (api.isLocalProcessingMode && api.isLocalProcessingMode()) {
      return memoryCache["/tables"] || [];
    }
    return req("/tables");
  },
  createTable: async (payload: any) => {
    if (api.isLocalProcessingMode()) {
      const localId = "tbl_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
      const newTable = { id: localId, label: payload.label, seats: payload.seats ?? 4, status: "vacant" };
      const list = memoryCache["/tables"] || [];
      const updated = [...list, newTable];
      memoryCache["/tables"] = updated;
      setDiskCache("disk_cache_/tables", JSON.stringify(updated)).catch(() => {});
      notifyCacheUpdate("/tables", updated);
      await enqueueSyncAction("CREATE_TABLE", payload, localId);
      return newTable;
    }
    clearCachePrefix("/tables");
    return req("/tables", { method: "POST", body: JSON.stringify(payload) });
  },
  deleteTable: async (id: string) => {
    if (api.isLocalProcessingMode()) {
      const list = memoryCache["/tables"] || [];
      const updated = list.filter((t: any) => t.id !== id);
      memoryCache["/tables"] = updated;
      setDiskCache("disk_cache_/tables", JSON.stringify(updated)).catch(() => {});
      notifyCacheUpdate("/tables", updated);
      await enqueueSyncAction("DELETE_TABLE", { id });
      return { ok: true };
    }
    clearCachePrefix("/tables");
    return req(`/tables/${id}`, { method: "DELETE" });
  },
  updateTable: async (id: string, payload: any) => {
    if (api.isLocalProcessingMode && api.isLocalProcessingMode()) {
      const list = memoryCache["/tables"] || [];
      const updated = list.map((t: any) => t.id === id ? { ...t, ...payload } : t);
      memoryCache["/tables"] = updated;
      setDiskCache("disk_cache_/tables", JSON.stringify(updated)).catch(() => {});
      notifyCacheUpdate("/tables", updated);
      await enqueueSyncAction("UPDATE_TABLE", { id, ...payload });
      return updated.find((t: any) => t.id === id);
    }
    clearCachePrefix("/tables");
    return req(`/tables/${id}`, { method: "PUT", body: JSON.stringify(payload) });
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
  
  isLocalProcessingMode: () => {
    const sub = memoryCache["/subscriptions/mine"];
    if (sub) {
      if (sub.is_local_mode || sub.limits?.is_local_mode) return true;
      const price = Number(sub.price || 0);
      if (price === 299 || price === 2999) return true;
      const pName = String(sub.plan_name || sub.plan_id || "").toLowerCase();
      if (pName.includes("starter") || pName.includes("basic") || pName.includes("299")) return true;
    }
    try {
      if (Platform.OS === "web" && typeof window !== "undefined") {
        const cachedSub = window.localStorage.getItem("cached_sub") || window.localStorage.getItem("disk_cache_/subscriptions/mine");
        if (cachedSub) {
          const s = JSON.parse(cachedSub);
          if (s.is_local_mode || s.limits?.is_local_mode) return true;
          const p = Number(s.price || 0);
          if (p === 299 || p === 2999) return true;
          const n = String(s.plan_name || s.plan_id || "").toLowerCase();
          if (n.includes("starter") || n.includes("basic") || n.includes("299")) return true;
        }
        const userStr = window.localStorage.getItem("lumina_user");
        if (userStr) {
          const u = JSON.parse(userStr);
          const p = Number(u.subscription?.price || u.price || 0);
          if (p === 299 || p === 2999) return true;
          const n = String(u.subscription?.plan_name || u.plan_id || "").toLowerCase();
          if (n.includes("starter") || n.includes("basic") || n.includes("299")) return true;
        }
      }
    } catch {}
    return false;
  },

  createOrder: async (payload: any) => {
    const isLocal = api.isLocalProcessingMode();
    if (isLocal) {
      const localId = "ord_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
      const nowIso = new Date().toISOString();
      const items = payload.items || [];
      const computedSubtotal = payload.subtotal !== undefined
        ? Number(payload.subtotal)
        : items.reduce((sum: number, it: any) => sum + (Number(it.price || 0) * Number(it.quantity || 1)), 0);

      const localOrder = {
        id: localId,
        ...payload,
        items,
        subtotal: computedSubtotal,
        status: payload.status || "placed",
        created_at: nowIso,
        updated_at: nowIso,
      };

      // 1. Instant local cache update - Purge any temp- orders from the list
      const list = memoryCache["/orders"] || [];
      const cleanedList = list.filter((o: any) => !String(o.id).startsWith("temp-") && o.id !== localId);
      memoryCache["/orders"] = [localOrder, ...cleanedList];
      setDiskCache("disk_cache_/orders", JSON.stringify(memoryCache["/orders"])).catch(() => {});
      notifyCacheUpdate("/orders", memoryCache["/orders"]);

      // 2. Instant table occupied status
      if (payload.table_number) {
        const tList = memoryCache["/tables"] || [];
        const updatedTables = tList.map((t: any) => 
          isSameTable(t.label, payload.table_number)
            ? { ...t, status: "occupied" }
            : t
        );
        memoryCache["/tables"] = updatedTables;
        setDiskCache("disk_cache_/tables", JSON.stringify(updatedTables)).catch(() => {});
        notifyCacheUpdate("/tables", updatedTables);
      }

      // 3. Instant dashboard summary bump
      const summary = computeLocalSummary();
      notifyCacheUpdate("/dashboard/summary", summary);

      // 4. Enqueue into persistent offline sync queue
      await enqueueSyncAction("CREATE_ORDER", { ...payload, subtotal: computedSubtotal }, localId);

      return localOrder;
    }

    const res = await req("/orders", { method: "POST", body: JSON.stringify(payload) });
    const list = memoryCache["/orders"] || [];
    memoryCache["/orders"] = [res, ...list.filter((o: any) => o.id !== res.id && !String(o.id).startsWith("temp-"))];
    clearCachePrefix("/tables");
    clearCachePrefix("/dashboard/summary");
    return res;
  },
  updateOrder: async (id: string, payload: any) => {
    const resolvedId = tempIdMap[id] || id;
    const isLocal = api.isLocalProcessingMode();
    if (isLocal) {
      const list = memoryCache["/orders"] || [];
      const updated = list
        .filter((o: any) => !String(o.id).startsWith("temp-") || o.id === resolvedId || o.id === id)
        .map((o: any) => {
          if (o.id === resolvedId || o.id === id) {
            const items = payload.items || o.items || [];
            const computedSubtotal = payload.subtotal !== undefined
              ? Number(payload.subtotal)
              : items.reduce((sum: number, it: any) => sum + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
            return {
              ...o,
              ...payload,
              items,
              subtotal: computedSubtotal,
              updated_at: new Date().toISOString()
            };
          }
          return o;
        });
      memoryCache["/orders"] = updated;
      setDiskCache("disk_cache_/orders", JSON.stringify(updated)).catch(() => {});
      notifyCacheUpdate("/orders", updated);

      const summary = computeLocalSummary();
      notifyCacheUpdate("/dashboard/summary", summary);

      await enqueueSyncAction("UPDATE_ORDER", { id: resolvedId, ...payload });

      return updated.find((o: any) => o.id === resolvedId || o.id === id) || { id: resolvedId, ...payload };
    }

    const res = await req(`/orders/${resolvedId}`, { method: "PATCH", body: JSON.stringify(payload) });
    const list = memoryCache["/orders"] || [];
    memoryCache["/orders"] = list.map((o: any) => o.id === resolvedId ? res : o);
    clearCachePrefix("/tables");
    clearCachePrefix("/dashboard/summary");
    return res;
  },
  listOrders: async (status?: string) => {
    if (api.isLocalProcessingMode && api.isLocalProcessingMode()) {
      const list = (memoryCache["/orders"] || []).filter((o: any) => o && !String(o.id).startsWith("temp-"));
      if (status) {
        return list.filter((o: any) => o.status === status);
      }
      return list;
    }
    return req(`/orders${status ? `?status_filter=${status}` : ""}`);
  },
  updateOrderStatus: async (id: string, status: string) => {
    const resolvedId = tempIdMap[id] || id;
    const isLocal = api.isLocalProcessingMode();
    if (isLocal) {
      api.updateOrderStatusInCache(resolvedId, status);
      await enqueueSyncAction("UPDATE_ORDER_STATUS", { id: resolvedId, status });
      return { id: resolvedId, status };
    }

    const res = await req(`/orders/${resolvedId}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
    clearCachePrefix("/dashboard/summary");
    return res;
  },
  
  createBill: async (payload: any) => {
    const isLocal = api.isLocalProcessingMode();
    if (isLocal) {
      const localId = "bill_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
      const nowIso = new Date().toISOString();

      let items = payload.items;
      let tableNumber = payload.table_number;
      const orderId = payload.order_id;
      const orderIds = payload.order_ids || (orderId ? [orderId] : []);

      const oList = memoryCache["/orders"] || [];

      // If items not provided in payload, look up from cached order(s)
      if (!items || items.length === 0) {
        if (orderIds.length > 0) {
          const matchedOrders = oList.filter((o: any) => orderIds.includes(o.id));
          items = matchedOrders.flatMap((o: any) => o.items || []);
          if (!tableNumber && matchedOrders.length > 0) {
            tableNumber = matchedOrders[0].table_number;
          }
        } else if (tableNumber) {
          const matchedOrders = oList.filter((o: any) =>
            isSameTable(o.table_number, tableNumber) &&
            o.status !== "paid" && o.status !== "completed" && o.status !== "cancelled"
          );
          items = matchedOrders.flatMap((o: any) => o.items || []);
        }
      }

      items = items || [];

      const r = memoryCache["/restaurant"];
      const gstEnabled = payload.gst_enabled !== undefined ? !!payload.gst_enabled : !!r?.gst_enabled;
      const taxPercent = payload.tax_percent !== undefined ? Number(payload.tax_percent) : (gstEnabled ? Number(r?.gst_rate ?? 5) : 0);
      const discount = Number(payload.discount || 0);
      const serviceChargePercent = Number(payload.service_charge_percent || 0);

      const calc = BillingEngine.calculate({
        items,
        discount,
        taxPercent,
        gstEnabled,
        serviceChargePercent
      });

      const localBill = {
        id: localId,
        bill_number: `EZ-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        order_id: orderId || (orderIds.length > 0 ? orderIds[0] : undefined),
        order_ids: orderIds,
        table_number: tableNumber || "Takeaway",
        customer_name: payload.customer_name || "Guest",
        items,
        subtotal: calc.subtotal,
        discount: calc.discount,
        taxable_amount: calc.taxableAmount,
        tax: calc.tax,
        cgst: calc.cgst,
        sgst: calc.sgst,
        service_charge: calc.serviceCharge,
        round_off: calc.roundOff,
        total: calc.total,
        gst_enabled: gstEnabled,
        tax_percent: taxPercent,
        status: "unpaid",
        created_at: nowIso,
        payment_method: payload.payment_method || "UPI",
        restaurant_snapshot: r,
      };

      const bList = memoryCache["/bills"] || [];
      const filteredBills = bList.filter((b: any) => {
        if (orderId && b.order_id === orderId && b.status !== "paid") return false;
        return true;
      });
      memoryCache["/bills"] = [localBill, ...filteredBills];
      setDiskCache("disk_cache_/bills", JSON.stringify(memoryCache["/bills"])).catch(() => {});
      notifyCacheUpdate("/bills", memoryCache["/bills"]);

      await enqueueSyncAction("CREATE_BILL", {
        ...payload,
        items,
        table_number: tableNumber,
        subtotal: calc.subtotal,
        total: calc.total,
        tax: calc.tax,
        discount: calc.discount,
      }, localId);

      return localBill;
    }

    const res = await req("/bills", { method: "POST", body: JSON.stringify(payload) });
    const list = memoryCache["/bills"] || [];
    memoryCache["/bills"] = [res, ...list.filter((b: any) => b.id !== res.id)];
    clearCachePrefix("/dashboard/summary");
    return res;
  },
  markBillPaid: async (idOrBill: string | any, paymentMethod = "UPI") => {
    const passedObj = typeof idOrBill === "object" && idOrBill !== null ? idOrBill : null;
    const rawId = passedObj ? (passedObj.id || passedObj.order_id || "") : String(idOrBill || "");
    let resolvedId = tempIdMap[rawId] || rawId;
    const isLocal = api.isLocalProcessingMode();

    if (isLocal) {
      const bList = (memoryCache["/bills"] || []).filter((b: any) => !String(b.id).startsWith("temp-") || b.id === rawId || b.id === resolvedId);
      const oList = (memoryCache["/orders"] || []).filter((o: any) => !String(o.id).startsWith("temp-"));
      let targetBill: any = null;
      let found = false;

      const updatedBills = bList.map((b: any) => {
        const isMatch =
          (resolvedId && b.id === resolvedId) ||
          (rawId && b.id === rawId) ||
          (b.order_id && ((resolvedId && b.order_id === resolvedId) || (rawId && b.order_id === rawId))) ||
          (b.order_ids && ((resolvedId && b.order_ids.includes(resolvedId)) || (rawId && b.order_ids.includes(rawId)))) ||
          (passedObj && passedObj.order_id && (b.order_id === passedObj.order_id || (b.order_ids && b.order_ids.includes(passedObj.order_id))));

        if (isMatch) {
          found = true;
          const items = b.items && b.items.length > 0 ? b.items : (passedObj?.items || []);
          const subtotal = Number(b.subtotal ?? b.total ?? 0) || Number(passedObj?.subtotal ?? passedObj?.total ?? 0) || items.reduce((sum: number, it: any) => sum + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
          const total = Number(b.total ?? b.subtotal ?? 0) || Number(passedObj?.total ?? passedObj?.subtotal ?? 0) || subtotal;

          // Always ensure a permanent bill_ ID (never keep temp- ID on paid bill)
          const realBillId = (b.id && !String(b.id).startsWith("temp-"))
            ? b.id
            : (passedObj?.id && !String(passedObj.id).startsWith("temp-"))
              ? passedObj.id
              : ("bill_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7));

          const billNumber = (b.bill_number && !b.bill_number.includes("OFFLINE"))
            ? b.bill_number
            : (passedObj?.bill_number && !passedObj.bill_number.includes("OFFLINE"))
              ? passedObj.bill_number
              : `EZ-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

          targetBill = {
            ...b,
            id: realBillId,
            bill_number: billNumber,
            items,
            subtotal,
            total,
            status: "paid",
            payment_method: paymentMethod,
            paid_at: new Date().toISOString()
          };
          return targetBill;
        }
        return b;
      });

      if (!found) {
        const matchingOrder = oList.find((o: any) =>
          (resolvedId && o.id === resolvedId) ||
          (rawId && o.id === rawId) ||
          (passedObj && (o.id === passedObj.order_id || (passedObj.order_ids && passedObj.order_ids.includes(o.id))))
        );

        const items = (passedObj && passedObj.items && passedObj.items.length > 0)
          ? passedObj.items
          : (matchingOrder?.items || []);

        const subtotal = Number(passedObj?.subtotal || 0) ||
          Number(matchingOrder?.subtotal || 0) ||
          items.reduce((sum: number, it: any) => sum + (Number(it.price || 0) * Number(it.quantity || 1)), 0);

        const total = Number(passedObj?.total || 0) || subtotal;
        const tableNum = passedObj?.table_number || matchingOrder?.table_number || "Takeaway";
        const orderIds = passedObj?.order_ids || (passedObj?.order_id ? [passedObj.order_id] : (matchingOrder ? [matchingOrder.id] : (resolvedId && !resolvedId.startsWith("temp-") ? [resolvedId] : [])));

        const billId = (rawId && !rawId.startsWith("temp-"))
          ? rawId
          : (passedObj?.id && !String(passedObj.id).startsWith("temp-"))
            ? passedObj.id
            : ("bill_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7));

        const billNumber = (passedObj?.bill_number && !passedObj.bill_number.includes("OFFLINE"))
          ? passedObj.bill_number
          : `EZ-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

        targetBill = {
          id: billId,
          bill_number: billNumber,
          order_id: orderIds[0] || matchingOrder?.id || billId,
          order_ids: orderIds,
          table_number: tableNum,
          customer_name: passedObj?.customer_name || matchingOrder?.customer_name || "Guest",
          items,
          subtotal,
          total,
          status: "paid",
          payment_method: paymentMethod,
          paid_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        };
        updatedBills.unshift(targetBill);
      }

      const finalCleanBills = updatedBills.filter((b: any) => b && !String(b.id).startsWith("temp-"));
      memoryCache["/bills"] = finalCleanBills;
      setDiskCache("disk_cache_/bills", JSON.stringify(finalCleanBills)).catch(() => {});
      notifyCacheUpdate("/bills", finalCleanBills);

      const orderIdsToSettle = targetBill?.order_ids || (targetBill?.order_id ? [targetBill.order_id] : [resolvedId]);
      const updatedOrders = oList.map((o: any) => {
        if (orderIdsToSettle.includes(o.id) || (targetBill?.table_number && targetBill.table_number !== "Takeaway" && isSameTable(o.table_number, targetBill.table_number))) {
          return { ...o, status: "paid" };
        }
        return o;
      });
      memoryCache["/orders"] = updatedOrders;
      setDiskCache("disk_cache_/orders", JSON.stringify(updatedOrders)).catch(() => {});
      notifyCacheUpdate("/orders", updatedOrders);

      if (targetBill?.table_number && targetBill.table_number !== "Takeaway") {
        api.settleTableInCache(targetBill.table_number);
      }

      const summary = computeLocalSummary();
      notifyCacheUpdate("/dashboard/summary", summary);

      await enqueueSyncAction("MARK_BILL_PAID", {
        id: targetBill.id,
        order_id: targetBill.order_id,
        order_ids: targetBill.order_ids,
        table_number: targetBill.table_number,
        total: targetBill.total,
        subtotal: targetBill.subtotal,
        payment_method: paymentMethod
      });

      return targetBill || { id: resolvedId, status: "paid", payment_method: paymentMethod };
    }

    const res = await req(`/bills/${resolvedId}/pay`, { method: "PATCH", body: JSON.stringify({ payment_method: paymentMethod }) });
    const bList = memoryCache["/bills"] || [];
    memoryCache["/bills"] = bList.map((b: any) => (b.id === resolvedId || b.id === rawId) ? { ...b, ...res, status: "paid" } : b);
    
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
    const isLocal = api.isLocalProcessingMode();

    if (isLocal) {
      const oList = (memoryCache["/orders"] || []).filter((o: any) => !String(o.id).startsWith("temp-"));
      const cleanOrderIds = (orderIds || []).filter((id: string) => id && !String(id).startsWith("temp-"));

      // 1. Filter ONLY the active (unpaid/uncompleted) orders currently on this table
      const activeTableOrders = oList.filter((o: any) =>
        (cleanOrderIds.length > 0 ? cleanOrderIds.includes(o.id) : isSameTable(o.table_number, tableNumber)) &&
        o.status !== "paid" && o.status !== "completed" && o.status !== "cancelled" && o.status !== "settled"
      );

      const ordersToSettle = activeTableOrders.length > 0
        ? activeTableOrders
        : oList.filter((o: any) => (cleanOrderIds.length > 0 ? cleanOrderIds.includes(o.id) : isSameTable(o.table_number, tableNumber)) && o.status !== "cancelled");

      const targetOrderIds = ordersToSettle.map((o: any) => o.id);

      // 2. Mark ONLY these target orders as paid
      const updatedOrders = oList.map((o: any) => {
        if (targetOrderIds.includes(o.id) || isSameTable(o.table_number, tableNumber)) {
          return { ...o, status: "paid" };
        }
        return o;
      });
      memoryCache["/orders"] = updatedOrders;
      setDiskCache("disk_cache_/orders", JSON.stringify(updatedOrders)).catch(() => {});
      notifyCacheUpdate("/orders", updatedOrders);

      // 3. Compute accurate items and subtotal from only the orders being settled
      const combinedItems = ordersToSettle.flatMap((o: any) => o.items || []);
      const computedSubtotal = ordersToSettle.reduce((sum: number, o: any) => {
        const sub = Number(o.subtotal || 0) || (o.items || []).reduce((acc: number, it: any) => acc + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
        return sum + sub;
      }, 0);
      const finalTotal = total !== undefined && total > 0 ? total : computedSubtotal;

      // 4. Update or create bill for this settlement
      const bList = (memoryCache["/bills"] || []).filter((b: any) => !String(b.id).startsWith("temp-"));
      let foundMatchingBill = false;
      const updatedBills = bList.map((b: any) => {
        const isMatch =
          (targetOrderIds.length > 0 && (targetOrderIds.includes(b.order_id) || (b.order_ids && b.order_ids.some((id: string) => targetOrderIds.includes(id))))) ||
          (isSameTable(b.table_number, tableNumber) && b.status !== "paid");

        if (isMatch) {
          foundMatchingBill = true;
          const billTotal = Number(b.total ?? b.subtotal ?? 0) || finalTotal;
          return { ...b, total: billTotal, status: "paid", payment_method: paymentMethod, paid_at: new Date().toISOString() };
        }
        return b;
      });

      if (!foundMatchingBill) {
        const localBillId = "bill_settle_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
        const newBill = {
          id: localBillId,
          bill_number: `EZ-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
          order_id: targetOrderIds[0] || localBillId,
          order_ids: targetOrderIds,
          table_number: tableNumber,
          customer_name: ordersToSettle[0]?.customer_name || "Guest",
          items: combinedItems,
          subtotal: computedSubtotal,
          total: finalTotal,
          status: "paid",
          payment_method: paymentMethod,
          paid_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        };
        updatedBills.unshift(newBill);
      }

      memoryCache["/bills"] = updatedBills;
      setDiskCache("disk_cache_/bills", JSON.stringify(updatedBills)).catch(() => {});
      notifyCacheUpdate("/bills", updatedBills);

      // 5. Update table status to available in cache
      const tList = memoryCache["/tables"] || [];
      const updatedTables = tList.map((t: any) =>
        isSameTable(t.label, tableNumber)
          ? { ...t, status: "available" }
          : t
      );
      memoryCache["/tables"] = updatedTables;
      setDiskCache("disk_cache_/tables", JSON.stringify(updatedTables)).catch(() => {});
      notifyCacheUpdate("/tables", updatedTables);

      // 6. Recalculate local dashboard summary
      const summary = computeLocalSummary();
      notifyCacheUpdate("/dashboard/summary", summary);

      await enqueueSyncAction("SETTLE_TABLE", {
        table_number: tableNumber,
        payment_method: paymentMethod,
        order_ids: targetOrderIds,
        total: finalTotal
      });

      return { ok: true, table_number: tableNumber, status: "settled" };
    }

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
  listBills: async () => {
    if (api.isLocalProcessingMode && api.isLocalProcessingMode()) {
      return (memoryCache["/bills"] || []).filter((b: any) => b && !String(b.id).startsWith("temp-"));
    }
    return req("/bills");
  },
  dashboardSummary: async () => {
    if (api.isLocalProcessingMode()) {
      const summary = computeLocalSummary();
      notifyCacheUpdate("/dashboard/summary", summary);
      return summary;
    }
    return req("/dashboard/summary");
  },
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
  adminListPayments: (params?: { status?: string; search?: string; page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.append("status", params.status);
    if (params?.search) q.append("search", params.search);
    if (params?.page) q.append("page", String(params.page));
    if (params?.limit) q.append("limit", String(params.limit));
    const qs = q.toString();
    return req(`/admin/payments${qs ? `?${qs}` : ""}`);
  },
  adminRecordManualPayment: (payload: { tenant_id: string; plan_id: string; amount: number; payment_method?: string; reference_id?: string; valid_days?: number; notes?: string }) =>
    req("/admin/payments/record-manual", { method: "POST", body: JSON.stringify(payload) }),
  adminRefundPayment: (pid: string, payload?: { refund_reason?: string; cancel_subscription?: boolean }) =>
    req(`/admin/payments/${pid}/refund`, { method: "POST", body: JSON.stringify(payload || {}) }),
  adminBusinessSummary: () => req("/admin/reports/business-summary"),
  adminExportBusinessReportUrl: () => `${API_URL}/api/admin/reports/export`,
  
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
    if (api.isLocalProcessingMode()) {
      return computeLocalSummary();
    }
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
    let updated: any[];
    if (!String(order.id).startsWith("temp-")) {
      updated = [order, ...list.filter((o: any) => !String(o.id).startsWith("temp-") && o.id !== order.id)];
    } else {
      updated = [order, ...list.filter((o: any) => o.id !== order.id)];
    }
    memoryCache["/orders"] = updated;
    setDiskCache("disk_cache_/orders", JSON.stringify(updated)).catch(() => {});
    notifyCacheUpdate("/orders", updated);
  },
  injectCachedBill: (bill: any) => {
    if (!bill || !bill.id) return;
    const list = memoryCache["/bills"] || [];
    let updated: any[];
    if (!String(bill.id).startsWith("temp-")) {
      updated = [bill, ...list.filter((b: any) => !String(b.id).startsWith("temp-") && b.id !== bill.id)];
    } else {
      updated = [bill, ...list.filter((b: any) => b.id !== bill.id)];
    }
    memoryCache["/bills"] = updated;
    setDiskCache("disk_cache_/bills", JSON.stringify(updated)).catch(() => {});
    notifyCacheUpdate("/bills", updated);
  },
  updateCachedOrder: (id: string, realOrder: any) => {
    if (!realOrder || !realOrder.id) return;
    const list = memoryCache["/orders"] || [];
    const updated = [realOrder, ...list.filter((o: any) => o.id !== id && o.id !== realOrder.id && !String(o.id).startsWith("temp-"))];
    memoryCache["/orders"] = updated;
    setDiskCache("disk_cache_/orders", JSON.stringify(updated)).catch(() => {});
    notifyCacheUpdate("/orders", updated);
  },
  updateCachedBill: (id: string, realBill: any) => {
    if (!realBill || !realBill.id) return;
    const list = memoryCache["/bills"] || [];
    const updated = [realBill, ...list.filter((b: any) => b.id !== id && b.id !== realBill.id && !String(b.id).startsWith("temp-"))];
    memoryCache["/bills"] = updated;
    setDiskCache("disk_cache_/bills", JSON.stringify(updated)).catch(() => {});
    notifyCacheUpdate("/bills", updated);
  },
  setCachedOrders: (orders: any[]) => {
    const clean = (Array.isArray(orders) ? orders : []).filter((o: any) => o && !String(o.id).startsWith("temp-"));
    memoryCache["/orders"] = clean;
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
    const updated = list
      .filter((o: any) => !String(o.id).startsWith("temp-") || o.id === resolvedId || o.id === orderId)
      .map((o: any) => (o.id === resolvedId || o.id === orderId) ? { ...o, status } : o);
    memoryCache["/orders"] = updated;
    setDiskCache("disk_cache_/orders", JSON.stringify(updated)).catch(() => {});
    notifyCacheUpdate("/orders", updated);
  },
  settleTableInCache: (tableNumber: string) => {
    const list = memoryCache["/orders"] || [];
    const updated = list
      .filter((o: any) => !String(o.id).startsWith("temp-"))
      .map((o: any) => 
        isSameTable(o.table_number, tableNumber)
          ? { ...o, status: "paid" }
          : o
      );
    memoryCache["/orders"] = updated;
    setDiskCache("disk_cache_/orders", JSON.stringify(updated)).catch(() => {});
    notifyCacheUpdate("/orders", updated);
    
    // Also mark bills as paid
    const billsList = memoryCache["/bills"] || [];
    const updatedBills = billsList
      .filter((b: any) => !String(b.id).startsWith("temp-"))
      .map((b: any) => 
        isSameTable(b.table_number, tableNumber) || updated.some((o: any) => o.id === b.order_id && o.status === "paid")
          ? { ...b, status: "paid", paid_at: b.paid_at || new Date().toISOString() }
          : b
      );
    memoryCache["/bills"] = updatedBills;
    setDiskCache("disk_cache_/bills", JSON.stringify(updatedBills)).catch(() => {});
    notifyCacheUpdate("/bills", updatedBills);

    // Free the table
    const tList = memoryCache["/tables"] || [];
    const updatedTables = tList.map((t: any) =>
      isSameTable(t.label, tableNumber) ? { ...t, status: "available" } : t
    );
    memoryCache["/tables"] = updatedTables;
    setDiskCache("disk_cache_/tables", JSON.stringify(updatedTables)).catch(() => {});
    notifyCacheUpdate("/tables", updatedTables);
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

// Sync reconciliation callback to update local caches when cloud entities are confirmed
function updateCacheFromSync(type: SyncActionType, localId: string | undefined, realObj: any) {
  if (!realObj || !realObj.id || !localId) return;
  if (type === "CREATE_CATEGORY") {
    const list = memoryCache["/categories"] || [];
    const updated = list.map((c: any) => (c.id === localId ? realObj : c));
    memoryCache["/categories"] = updated;
    setDiskCache("disk_cache_/categories", JSON.stringify(updated)).catch(() => {});
    notifyCacheUpdate("/categories", updated);
  } else if (type === "CREATE_MENU_ITEM") {
    const list = memoryCache["/menu-items"] || [];
    const updated = list.map((m: any) => (m.id === localId ? realObj : m));
    memoryCache["/menu-items"] = updated;
    setDiskCache("disk_cache_/menu-items", JSON.stringify(updated)).catch(() => {});
    notifyCacheUpdate("/menu-items", updated);
  } else if (type === "CREATE_TABLE") {
    const list = memoryCache["/tables"] || [];
    const updated = list.map((t: any) => (t.id === localId ? realObj : t));
    memoryCache["/tables"] = updated;
    setDiskCache("disk_cache_/tables", JSON.stringify(updated)).catch(() => {});
    notifyCacheUpdate("/tables", updated);
  } else if (type === "CREATE_ORDER") {
    api.updateCachedOrder(localId, realObj);
  } else if (type === "CREATE_BILL") {
    api.updateCachedBill(localId, realObj);
  }
}

// Auto-start offline sync scheduler safely after module initialization
setTimeout(() => {
  try {
    startOfflineSyncRunner(
      (path, opts, auth) => req(path, opts, auth),
      tempIdMap,
      () => (api.isLocalProcessingMode ? api.isLocalProcessingMode() : false),
      updateCacheFromSync
    );
  } catch (err) {
    console.warn("[OfflineSync] Failed to initialize runner:", err);
  }
}, 1000);

