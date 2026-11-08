import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { BillingEngine } from "./billingEngine";
import { isTodayBusinessDay, safeParseDate, setDayClosedAtGetter, getBusinessDayKey } from "./dateUtils";
import {
  enqueueSyncAction,
  getPendingSyncCount,
  clearSyncQueue,
  processSyncQueue,
  startOfflineSyncRunner,
  subscribeToSyncQueue,
  triggerOfflineSyncImmediate,
  SyncActionType,
} from "./offlineSync";

const DEFAULT_BACKEND_URL = (process.env.EXPO_PUBLIC_BACKEND_URL && !process.env.EXPO_PUBLIC_BACKEND_URL.includes("0.0.0.0") ? process.env.EXPO_PUBLIC_BACKEND_URL : "https://billpro-wulv.onrender.com").replace(/\/$/, "");

let activeBackendUrl = DEFAULT_BACKEND_URL;

// Which server is the main one: the one the super admin picked for every app wins, then one saved on
// this device only, then the one built into the app.
const MAIN_FOR_EVERYONE_KEY = "global_backend_url";
let mainForEveryone: string | null = null;
let deviceUrl: string | null = null;

// The old AWS server (api2.jobsio.in) is down: ignore it if a device or the admin setting still points there
const RETIRED_SERVERS = ["api2.jobsio.in"];
const cleanUrl = (url?: string | null) => {
  const u = url && url.trim() ? url.trim().replace(/\/+$/, "") : null;
  return u && RETIRED_SERVERS.some(r => u.includes(r)) ? null : u;
};

function pickMainServer() {
  activeBackendUrl = mainForEveryone || deviceUrl || DEFAULT_BACKEND_URL;
}

// Load saved choices synchronously on Web or asynchronously on native
if (Platform.OS === "web" && typeof window !== "undefined") {
  try {
    mainForEveryone = cleanUrl(window.localStorage.getItem(MAIN_FOR_EVERYONE_KEY));
    deviceUrl = cleanUrl(window.localStorage.getItem("custom_backend_url"));
    pickMainServer();
  } catch {}
} else {
  Promise.all([AsyncStorage.getItem(MAIN_FOR_EVERYONE_KEY), AsyncStorage.getItem("custom_backend_url")]).then(([main, device]) => {
    if (mainForEveryone === null) mainForEveryone = cleanUrl(main); // the server's answer may already be here
    deviceUrl = cleanUrl(device);
    pickMainServer();
  }).catch(() => {});
}

export function getBackendUrl(): string {
  return activeBackendUrl;
}

export function getDefaultBackendUrl(): string {
  return DEFAULT_BACKEND_URL;
}

export async function setCustomBackendUrl(url: string): Promise<string> {
  let cleaned = (url || "").trim();
  if (!cleaned) throw new Error("Backend URL cannot be empty.");
  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = `https://${cleaned}`;
  }
  cleaned = cleaned.replace(/\/$/, "");
  clearFailover(); // a server picked by hand is used straight away, even while on a backup
  deviceUrl = cleaned;
  pickMainServer();
  await setDiskCache("custom_backend_url", cleaned);
  notifyCacheUpdate("/system/backend-url", { url: activeBackendUrl });
  return activeBackendUrl;
}

export async function resetCustomBackendUrl(): Promise<string> {
  clearFailover();
  deviceUrl = null;
  pickMainServer();
  await delDiskCache("custom_backend_url");
  notifyCacheUpdate("/system/backend-url", { url: activeBackendUrl });
  return activeBackendUrl;
}

export function getMainServerForEveryone(): string | null {
  return mainForEveryone;
}

// Uses the main server the super admin picked for every app. Every app learns it with the backup list.
async function applyMainServerForEveryone(url: string | null) {
  const next = cleanUrl(url);
  if (next === mainForEveryone) return;
  mainForEveryone = next;
  if (next) await setDiskCache(MAIN_FOR_EVERYONE_KEY, next);
  else await delDiskCache(MAIN_FOR_EVERYONE_KEY);
  const before = activeBackendUrl;
  pickMainServer();
  if (activeBackendUrl !== before) {
    clearFailover();
    notifyCacheUpdate("/system/backend-url", { url: activeBackendUrl });
  }
}

// Super admin only. Moves every restaurant's app to this server (null: back to the built-in one).
// This device's own saved address is dropped, so it follows the same choice.
export async function saveMainServerForEveryone(url: string | null): Promise<string> {
  const data = await req("/admin/main-server", { method: "PUT", body: JSON.stringify({ url }) });
  if (deviceUrl) {
    deviceUrl = null;
    await delDiskCache("custom_backend_url");
    pickMainServer();
  }
  const before = activeBackendUrl;
  await applyMainServerForEveryone(data?.main_url ?? null);
  if (activeBackendUrl === before) notifyCacheUpdate("/system/backend-url", { url: activeBackendUrl });
  return activeBackendUrl;
}

export async function testBackendHealth(targetUrl?: string): Promise<{ ok: boolean; status?: string; latencyMs: number; error?: string }> {
  const urlToTest = (targetUrl || activeBackendUrl).trim().replace(/\/$/, "");
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    let res: Response | null = null;
    try {
      res = await fetch(`${urlToTest}/health`, {
        method: "GET",
        signal: controller.signal,
      });
    } catch {
      res = await fetch(`${urlToTest}/api/health`, {
        method: "GET",
        signal: controller.signal,
      });
    }
    clearTimeout(timeout);
    const latencyMs = Date.now() - start;
    if (res && res.ok) {
      let status = "online";
      try {
        const json = await res.json();
        status = json.status || "online";
      } catch {}
      return { ok: true, status, latencyMs };
    }
    return { ok: false, error: res ? `HTTP ${res.status}: ${res.statusText}` : "No response", latencyMs };
  } catch (e: any) {
    return {
      ok: false,
      error: e.name === "AbortError" ? "Connection timed out (6s)" : (e.message || "Failed to connect to server"),
      latencyMs: Date.now() - start,
    };
  }
}

// ---------- Backup servers ----------
// The super admin saves a named list of backup servers on the server, and every app keeps a copy.
// When the usual server stops answering, the app moves to the first backup that works, and comes back
// once the usual server is up again. Only where requests go changes; screens, printing and data do not.
export type BackupServer = { name: string; url: string };
export type ServerCheck = "ok" | "login" | "down";

const BACKUP_SERVERS_KEY = "backup_backend_servers";
let backupServers: BackupServer[] = [];
let gotServerList = false;
let failoverUrl: string | null = null;
let failoverSearch: Promise<boolean> | null = null;
let lastSearchAt = 0;
let returnTimer: ReturnType<typeof setInterval> | null = null;

function keepBackupServers(list: any) {
  backupServers = Array.isArray(list)
    ? list
        .filter((s) => s && typeof s.name === "string" && typeof s.url === "string" && /^https:\/\//i.test(s.url))
        .map((s) => ({ name: s.name, url: s.url.trim().replace(/\/+$/, "") }))
    : [];
}

// Where requests go right now: a backup while the usual server is down. getBackendUrl() stays the usual
// server, so menu links and table QR codes keep pointing at it.
export function getLiveBackendUrl(): string {
  return failoverUrl || activeBackendUrl;
}

export function getBackupServers(): BackupServer[] {
  return backupServers;
}

async function timedFetch(url: string, init: RequestInit = {}, ms = 5000): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function isServerUp(url: string): Promise<boolean> {
  const res = await timedFetch(`${url}/api/health`);
  const data = res?.ok ? await res.json().catch(() => null) : null;
  return data?.status === "online";
}

// "login" means the server is up but does not accept this login: it needs the same database and
// secret key as the main server. The app never moves to such a server.
export async function checkServer(url: string): Promise<ServerCheck> {
  if (!(await isServerUp(url))) return "down";
  const token = await getAccess();
  if (!token) return "ok";
  const res = await timedFetch(`${url}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res) return "down";
  return res.ok ? "ok" : res.status === 401 ? "login" : "down";
}

export async function refreshBackupServers(): Promise<BackupServer[]> {
  const res = await timedFetch(`${getLiveBackendUrl()}/api/backend-servers`, {}, 10000);
  if (!res?.ok) throw new Error(res ? `HTTP ${res.status}` : "Server not reachable");
  const data = await res.json();
  gotServerList = true;
  keepBackupServers(data?.servers);
  await setDiskCache(BACKUP_SERVERS_KEY, JSON.stringify(backupServers));
  if (data && "main_url" in data) await applyMainServerForEveryone(data.main_url); // older servers do not send it
  return backupServers;
}

export async function saveBackupServers(list: BackupServer[]): Promise<BackupServer[]> {
  const data = await req("/admin/backend-servers", { method: "PUT", body: JSON.stringify({ servers: list }) });
  gotServerList = true;
  keepBackupServers(data?.servers);
  await setDiskCache(BACKUP_SERVERS_KEY, JSON.stringify(backupServers));
  return backupServers;
}

function clearFailover() {
  failoverUrl = null;
  if (returnTimer) {
    clearInterval(returnTimer);
    returnTimer = null;
  }
}

function switchServer(url: string) {
  clearFailover();
  if (url !== activeBackendUrl) {
    failoverUrl = url;
    returnTimer = setInterval(async () => {
      if (failoverUrl && (await isServerUp(activeBackendUrl))) {
        switchServer(activeBackendUrl);
      }
    }, 60000);
  }
  notifyCacheUpdate("/system/backend-url", { url: getLiveBackendUrl() });
}

// Called when a request to failedUrl got no answer. Moves only if failedUrl really is down, so one slow
// request never moves the app, and only to a server that accepts this login. With no backups saved,
// nothing extra is sent.
async function moveOffFailedServer(failedUrl: string): Promise<boolean> {
  if (getLiveBackendUrl() !== failedUrl) return true; // another request already moved
  if (failoverSearch) return failoverSearch;
  const candidates = [activeBackendUrl, ...backupServers.map((s) => s.url)]
    .filter((url, i, all) => url !== failedUrl && all.indexOf(url) === i);
  if (!candidates.length || Date.now() - lastSearchAt < 30000) return false;
  lastSearchAt = Date.now();
  failoverSearch = Promise.all([isServerUp(failedUrl), Promise.all(candidates.map((url) => checkServer(url)))])
    .then(([failedIsUp, checks]) => {
      const next = failedIsUp ? undefined : candidates[checks.indexOf("ok")];
      if (next) switchServer(next);
      return !!next;
    })
    .catch(() => false)
    .finally(() => {
      failoverSearch = null;
    });
  return failoverSearch;
}

// Hosting gateways answer with an HTML error page when the server behind them is down.
// The app's own errors are JSON, so those never count.
function looksLikeServerDown(res: Response): boolean {
  if (res.status !== 502 && res.status !== 503 && res.status !== 504) return false;
  return !(res.headers.get("content-type") || "").includes("application/json");
}

// Sends one request. If the server is down it moves to a backup; requests that are safe to repeat
// (reads and sign-in) are sent once more there. Others fail as before and go to the offline queue,
// which later sends them to the new server.
async function fetchFromLiveServer(path: string, init: RequestInit, safeToResend: boolean): Promise<Response> {
  const base = getLiveBackendUrl();
  let res: Response | null = null;
  let error: any = null;
  try {
    res = await fetch(`${base}/api${path}`, init);
    if (!looksLikeServerDown(res)) return res;
  } catch (e) {
    error = e;
  }
  const moving = moveOffFailedServer(base);
  if (!safeToResend || !(await moving)) {
    if (error) throw error;
    return res as Response;
  }
  return fetch(`${getLiveBackendUrl()}/api${path}`, init);
}

if (Platform.OS !== "web" || typeof window !== "undefined") {
  getDiskCache(BACKUP_SERVERS_KEY).then((saved) => {
    if (saved && !gotServerList) {
      try { keepBackupServers(JSON.parse(saved)); } catch {}
    }
  });
  const refresh = () => { refreshBackupServers().catch(() => {}); };
  setTimeout(refresh, 4000);
  setInterval(refresh, 10 * 60 * 1000);
}

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

let fallbackDayClosedAt: string | null = null;
setDayClosedAtGetter(() => {
  const r = memoryCache["/restaurant"];
  const fromRestaurant = r && typeof r === "object" ? r.day_closed_at : null;
  if (fromRestaurant && fallbackDayClosedAt) return fromRestaurant > fallbackDayClosedAt ? fromRestaurant : fallbackDayClosedAt;
  return fromRestaurant || fallbackDayClosedAt;
});

function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function sanitizeSummaryForNewDay(summary: any): any {
  if (!summary || typeof summary !== "object") return summary;
  // Key of the current counter day (changes on Close Counter or at 3:30 AM, not at 12 AM)
  const todayStr = getBusinessDayKey();
  const cacheDate = summary.__cache_date;
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
      __cache_date: todayStr
    };
  }
  return { ...summary, __cache_date: todayStr };
}

function normalizeTable(val: string | undefined | null): string {
  if (!val) return "";
  let s = String(val).trim().toLowerCase();
  s = s.replace(/^(table|tbl)[\s\-_:]*/i, "");
  s = s.replace(/\s*-\s*/g, "-").replace(/\s+/g, " ").trim();
  return s;
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
  const todayStr = getBusinessDayKey();

  const isPaid = (status?: any) => {
    const s = String(status || "").toLowerCase().trim();
    return s === "paid" || s === "completed" || s === "settled"; // "served" = food delivered, not paid
  };

  // 1. Paid bills today
  const paidBillsToday = bList.filter(
    (b: any) =>
      isPaid(b.status) &&
      isTodayDate(b.paid_at || b.created_at)
  );

  const seenOrderIds = new Set<string>();
  const r = memoryCache["/restaurant"] || null;
  const gst = r?.gst_enabled;
  const gstRate = Number(r?.gst_rate ?? 5);

  let revenue_today = paidBillsToday.reduce(
    (sum: number, b: any) => {
      if (b.order_id) seenOrderIds.add(b.order_id);
      if (Array.isArray(b.order_ids)) b.order_ids.forEach((id: string) => seenOrderIds.add(id));
      const sub = Number(b.subtotal ?? 0) || (b.items || []).reduce((acc: number, it: any) => acc + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
      let amt = Number(b.total ?? 0);
      if (!amt || (amt === sub && (b.gst_enabled || gst))) {
        const rate = Number(b.tax_percent ?? gstRate);
        const tax = (b.gst_enabled ?? gst) ? Math.round(sub * (rate / 100) * 100) / 100 : 0;
        amt = Math.round((sub + tax) * 100) / 100;
      }
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
      const sub = Number(o.subtotal || 0) || (o.items || []).reduce((acc: number, it: any) => acc + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
      let amt = Number(o.total || 0);
      if (!amt || (amt === sub && (o.gst_enabled || gst))) {
        const rate = Number(o.tax_percent ?? gstRate);
        const tax = (o.gst_enabled ?? gst) ? Math.round(sub * (rate / 100) * 100) / 100 : 0;
        amt = Math.round((sub + tax) * 100) / 100;
      }
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
    // Sales before 3:30 AM belong to the day before
    const d = new Date(Date.now() - 3.5 * 3600 * 1000);
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
const pendingOrderCreations: Record<string, Promise<any> | undefined> = {};

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

// The server answers 402 when the restaurant has no active plan. That is not "no internet",
// so the order or bill must not be saved on the device; the app asks the owner to subscribe instead.
const subscriptionNeededListeners = new Set<(message: string) => void>();
export function onSubscriptionNeeded(cb: (message: string) => void) {
  subscriptionNeededListeners.add(cb);
  return () => { subscriptionNeededListeners.delete(cb); };
}
export function askToSubscribe(message = "Subscription needed") {
  subscriptionNeededListeners.forEach(cb => cb(message));
}
// Set by the app layout: true while an owner or manager has no active plan
let planLocked = false;
export function setPlanLocked(locked: boolean) { planLocked = locked; }
export function isPlanLocked() { return planLocked; }
function stopIfSubscriptionNeeded(err: any) {
  if (err?.status !== 402) return;
  subscriptionNeededListeners.forEach(cb => cb(err.message || "Subscription needed"));
  throw err;
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
      const res = await fetch(`${getLiveBackendUrl()}/api/auth/refresh`, {
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

// The website uploads phone photos at full size, which is slow and can pass the server's limit. Gemini reads up to about 3000px anyway.
async function shrinkPhotoForUpload(photo: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(photo);
    const scale = Math.min(1, 3000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const smaller = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return smaller && smaller.size < photo.size ? smaller : photo;
  } catch {
    return photo; // A format this browser cannot draw, such as HEIC, goes up unchanged
  }
}

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
    const isFormData = opts.body instanceof FormData || (opts.body && typeof opts.body === "object" && "_parts" in (opts.body as any));
    if (!isFormData) {
      headers["Content-Type"] = "application/json";
    }
    if (auth) {
      const t = await getAccess();
      if (t) headers["Authorization"] = `Bearer ${t}`;
    }

    let res: Response;
    try {
      const safeToResend = isGet || path === "/auth/login" || path === "/auth/staff-login";
      res = await fetchFromLiveServer(path, { ...opts, headers }, safeToResend);
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
        data.__cache_date = getBusinessDayKey();
      }
      memoryCache[path] = data;
      cacheTimestamps[path] = Date.now();
      if (data) {
        setDiskCache("disk_cache_" + path, JSON.stringify(data)).catch(() => {});
      }
      notifyCacheUpdate(path, data);
    }
    if (path !== "/sync/batch" && getPendingSyncCount() > 0) {
      triggerOfflineSyncImmediate();
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
  register: (email: string, password: string, full_name: string, role = "owner", terms_accepted = false, privacy_consent = false, marketing_consent = false, phone?: string) =>
    req("/auth/register", { method: "POST", body: JSON.stringify({ email, password, full_name, role, terms_accepted, privacy_consent, marketing_consent, phone }) }, false),
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
    try {
      clearCachePrefix("/restaurant");
      const res = await req("/restaurant", { method: "POST", body: JSON.stringify(payload) });
      if (res) {
        memoryCache["/restaurant"] = res;
        cacheTimestamps["/restaurant"] = Date.now();
        setDiskCache("disk_cache_/restaurant", JSON.stringify(res)).catch(() => {});
        notifyCacheUpdate("/restaurant", res);
      }
      return res;
    } catch (netErr: any) {
      const existing = memoryCache["/restaurant"] || {};
      const updated = { ...existing, ...payload, updated_at: new Date().toISOString() };
      memoryCache["/restaurant"] = updated;
      cacheTimestamps["/restaurant"] = Date.now();
      setDiskCache("disk_cache_/restaurant", JSON.stringify(updated)).catch(() => {});
      notifyCacheUpdate("/restaurant", updated);
      await enqueueSyncAction("SAVE_RESTAURANT", payload);
      return updated;
    }
  },
  listCategories: async () => {
    try {
      const res = await req("/categories");
      return res;
    } catch (netErr) {
      return memoryCache["/categories"] || [];
    }
  },
  createCategory: async (payload: any) => {
    try {
      clearCachePrefix("/categories");
      const res = await req("/categories", { method: "POST", body: JSON.stringify(payload) });
      const list = memoryCache["/categories"] || [];
      const updated = [...list.filter((c: any) => c.id !== res.id), res];
      memoryCache["/categories"] = updated;
      setDiskCache("disk_cache_/categories", JSON.stringify(updated)).catch(() => {});
      notifyCacheUpdate("/categories", updated);
      return res;
    } catch (netErr: any) {
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
  },
  deleteCategory: async (id: string) => {
    try {
      clearCachePrefix("/categories");
      const res = await req(`/categories/${id}`, { method: "DELETE" });
      const list = memoryCache["/categories"] || [];
      const updated = list.filter((c: any) => c.id !== id);
      memoryCache["/categories"] = updated;
      setDiskCache("disk_cache_/categories", JSON.stringify(updated)).catch(() => {});
      notifyCacheUpdate("/categories", updated);
      return res;
    } catch (netErr: any) {
      const list = memoryCache["/categories"] || [];
      const updated = list.filter((c: any) => c.id !== id);
      memoryCache["/categories"] = updated;
      setDiskCache("disk_cache_/categories", JSON.stringify(updated)).catch(() => {});
      notifyCacheUpdate("/categories", updated);
      await enqueueSyncAction("DELETE_CATEGORY", { id });
      return { ok: true };
    }
  },
  listMenu: async () => {
    try {
      const res = await req("/menu-items");
      return res;
    } catch (netErr) {
      return memoryCache["/menu-items"] || [];
    }
  },
  createMenuItem: async (payload: any) => {
    try {
      clearCachePrefix("/menu-items");
      const res = await req("/menu-items", { method: "POST", body: JSON.stringify(payload) });
      const list = memoryCache["/menu-items"] || [];
      const updated = [...list.filter((m: any) => m.id !== res.id), res];
      memoryCache["/menu-items"] = updated;
      setDiskCache("disk_cache_/menu-items", JSON.stringify(updated)).catch(() => {});
      notifyCacheUpdate("/menu-items", updated);
      return res;
    } catch (netErr: any) {
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
  },
  updateMenuItem: async (id: string, payload: any) => {
    try {
      clearCachePrefix("/menu-items");
      const res = await req(`/menu-items/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
      const list = memoryCache["/menu-items"] || [];
      const updated = list.map((m: any) => m.id === id ? { ...m, ...res } : m);
      memoryCache["/menu-items"] = updated;
      setDiskCache("disk_cache_/menu-items", JSON.stringify(updated)).catch(() => {});
      notifyCacheUpdate("/menu-items", updated);
      return res;
    } catch (netErr: any) {
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
  },
  deleteMenuItem: async (id: string) => {
    try {
      clearCachePrefix("/menu-items");
      const res = await req(`/menu-items/${id}`, { method: "DELETE" });
      const list = memoryCache["/menu-items"] || [];
      const updated = list.filter((m: any) => m.id !== id);
      memoryCache["/menu-items"] = updated;
      setDiskCache("disk_cache_/menu-items", JSON.stringify(updated)).catch(() => {});
      notifyCacheUpdate("/menu-items", updated);
      return res;
    } catch (netErr: any) {
      const list = memoryCache["/menu-items"] || [];
      const updated = list.filter((m: any) => m.id !== id);
      memoryCache["/menu-items"] = updated;
      setDiskCache("disk_cache_/menu-items", JSON.stringify(updated)).catch(() => {});
      notifyCacheUpdate("/menu-items", updated);
      await enqueueSyncAction("DELETE_MENU_ITEM", { id });
      return { ok: true };
    }
  },
  importMenuJson: async (payload: { tenant_id?: string; replace_existing?: boolean; data?: any; raw_json?: string }) => {
    clearCachePrefix("/menu-items");
    clearCachePrefix("/categories");
    return req("/menu/import-json", { method: "POST", body: JSON.stringify(payload) });
  },
  autoAssignMenuImages: async (forceAll: boolean = false) => {
    clearCachePrefix("/menu-items");
    return req("/menu/auto-assign-images", { method: "POST", body: JSON.stringify({ force_all: forceAll }) });
  },
  generateMenuImage: async (name: string) => {
    return req("/menu/generate-image", { method: "POST", body: JSON.stringify({ name }) });
  },
  getPromoQuota: async () => {
    return req("/marketing/promo-quota");
  },
  generatePromoPoster: async (payload: { dish_name: string; price?: number; restaurant_name?: string; tagline?: string }) => {
    return req("/marketing/generate-promo-poster", { method: "POST", body: JSON.stringify(payload) });
  },
  listTables: async () => {
    try {
      const res = await req("/tables");
      if (Array.isArray(res)) {
        const seen = new Set<string>();
        const deduped = res.filter((t: any) => {
          const k = String(t?.label || t?.id).trim().toLowerCase();
          if (!k || seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        memoryCache["/tables"] = deduped;
        setDiskCache("disk_cache_/tables", JSON.stringify(deduped)).catch(() => {});
        return deduped;
      }
      return res;
    } catch (netErr) {
      const raw = memoryCache["/tables"] || [];
      const seen = new Set<string>();
      return raw.filter((t: any) => {
        const k = String(t?.label || t?.id).trim().toLowerCase();
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }
  },
  createTable: async (payload: any) => {
    try {
      clearCachePrefix("/tables");
      const res = await req("/tables", { method: "POST", body: JSON.stringify(payload) });
      const list = memoryCache["/tables"] || [];
      const cleanLabel = String(res.label || payload.label).trim().toLowerCase();
      const updated = [...list.filter((t: any) => t.id !== res.id && String(t?.label).trim().toLowerCase() !== cleanLabel), res];
      memoryCache["/tables"] = updated;
      setDiskCache("disk_cache_/tables", JSON.stringify(updated)).catch(() => {});
      notifyCacheUpdate("/tables", updated);
      return res;
    } catch (netErr: any) {
      const localId = "tbl_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
      const newTable = { id: localId, label: payload.label, seats: payload.seats ?? 4, status: "vacant" };
      const list = memoryCache["/tables"] || [];
      const cleanLabel = String(payload.label).trim().toLowerCase();
      const updated = [...list.filter((t: any) => String(t?.label).trim().toLowerCase() !== cleanLabel), newTable];
      memoryCache["/tables"] = updated;
      setDiskCache("disk_cache_/tables", JSON.stringify(updated)).catch(() => {});
      notifyCacheUpdate("/tables", updated);
      await enqueueSyncAction("CREATE_TABLE", payload, localId);
      return newTable;
    }
  },
  deleteTable: async (id: string) => {
    try {
      clearCachePrefix("/tables");
      const res = await req(`/tables/${id}`, { method: "DELETE" });
      const list = memoryCache["/tables"] || [];
      const updated = list.filter((t: any) => t.id !== id);
      memoryCache["/tables"] = updated;
      setDiskCache("disk_cache_/tables", JSON.stringify(updated)).catch(() => {});
      notifyCacheUpdate("/tables", updated);
      return res;
    } catch (netErr: any) {
      const list = memoryCache["/tables"] || [];
      const updated = list.filter((t: any) => t.id !== id);
      memoryCache["/tables"] = updated;
      setDiskCache("disk_cache_/tables", JSON.stringify(updated)).catch(() => {});
      notifyCacheUpdate("/tables", updated);
      await enqueueSyncAction("DELETE_TABLE", { id });
      return { ok: true };
    }
  },
  updateTable: async (id: string, payload: any) => {
    try {
      clearCachePrefix("/tables");
      const res = await req(`/tables/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      const list = memoryCache["/tables"] || [];
      const updated = list.map((t: any) => t.id === id ? { ...t, ...res } : t);
      memoryCache["/tables"] = updated;
      setDiskCache("disk_cache_/tables", JSON.stringify(updated)).catch(() => {});
      notifyCacheUpdate("/tables", updated);
      return res;
    } catch (netErr: any) {
      const list = memoryCache["/tables"] || [];
      const updated = list.map((t: any) => t.id === id ? { ...t, ...payload } : t);
      memoryCache["/tables"] = updated;
      setDiskCache("disk_cache_/tables", JSON.stringify(updated)).catch(() => {});
      notifyCacheUpdate("/tables", updated);
      await enqueueSyncAction("UPDATE_TABLE", { id, ...payload });
      return updated.find((t: any) => t.id === id);
    }
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
    return false;
  },

  createOrder: async (payload: any, tempTrackingId?: string) => {
    if (tempTrackingId && pendingOrderCreations[tempTrackingId] !== undefined) {
      return pendingOrderCreations[tempTrackingId];
    }
    if (tempTrackingId && tempIdMap[tempTrackingId] !== undefined) {
      const mappedId = tempIdMap[tempTrackingId];
      const orders = memoryCache["/orders"] || [];
      const found = orders.find((o: any) => o.id === mappedId);
      if (found) return found;
    }

    const orderPromise = (async () => {
      try {
        const res = await req("/orders", { method: "POST", body: JSON.stringify(payload) });
        if (tempTrackingId && res && res.id) {
          tempIdMap[tempTrackingId] = res.id;
        }
        const list = memoryCache["/orders"] || [];
        const existing = list.find((o: any) => o.id === res.id || (tempTrackingId && (o.id === tempTrackingId || tempIdMap[o.id] === res.id)));
        const bList = memoryCache["/bills"] || [];
        const isPaid = (existing && (existing.status === "paid" || existing.status === "completed")) ||
          bList.some((b: any) => 
            (b.status === "paid" || b.status === "completed") && 
            (b.order_id === res.id || (tempTrackingId && b.order_id === tempTrackingId) || (b.order_ids && (b.order_ids.includes(res.id) || (tempTrackingId && b.order_ids.includes(tempTrackingId)))))
          );

        const finalOrder = isPaid ? { ...res, status: "paid" } : res;
        if (isPaid && res.status !== "paid") {
          api.markBillPaid(res.id).catch(() => {});
        }

        memoryCache["/orders"] = [finalOrder, ...list.filter((o: any) => o.id !== res.id && (tempTrackingId ? o.id !== tempTrackingId : true) && !String(o.id).startsWith("temp-"))];
        clearCachePrefix("/tables");
        clearCachePrefix("/dashboard/summary");
        notifyCacheUpdate("/orders", memoryCache["/orders"]);
        return finalOrder;
      } catch (netErr: any) {
        stopIfSubscriptionNeeded(netErr);
        console.warn("[api.createOrder] Server request failed, activating offline local persistence:", netErr.message);
        const localId = "ord_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
        if (tempTrackingId) {
          tempIdMap[tempTrackingId] = localId;
        }
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

        const list = memoryCache["/orders"] || [];
        const cleanedList = list.filter((o: any) => !String(o.id).startsWith("temp-") && o.id !== localId && (tempTrackingId ? o.id !== tempTrackingId : true));
        memoryCache["/orders"] = [localOrder, ...cleanedList];
        setDiskCache("disk_cache_/orders", JSON.stringify(memoryCache["/orders"])).catch(() => {});
        notifyCacheUpdate("/orders", memoryCache["/orders"]);

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

        const summary = computeLocalSummary();
        notifyCacheUpdate("/dashboard/summary", summary);

        await enqueueSyncAction("CREATE_ORDER", { ...payload, subtotal: computedSubtotal }, localId);
        return localOrder;
      }
    })();

    if (tempTrackingId) {
      pendingOrderCreations[tempTrackingId] = orderPromise;
      // The caller handles a failed order; this copy only cleans up, so its failure must not surface as "Uncaught Error"
      orderPromise.finally(() => {
        delete pendingOrderCreations[tempTrackingId];
      }).catch(() => {});
    }

    return orderPromise;
  },
  updateOrder: async (id: string, payload: any) => {
    let resolvedId = tempIdMap[id] || id;

    // If resolvedId is still a temporary ID (starts with temp- or ord_), try to find real cloud ID in cached orders
    if (resolvedId.startsWith("temp-") || resolvedId.startsWith("ord_")) {
      const oList = memoryCache["/orders"] || [];
      const cloudMatch = oList.find((o: any) =>
        o && !String(o.id).startsWith("temp-") && !String(o.id).startsWith("ord_") &&
        ((payload.session_id && o.session_id === payload.session_id) ||
         (payload.table_number && isSameTable(o.table_number, payload.table_number) && o.status !== "paid"))
      );
      if (cloudMatch) {
        resolvedId = cloudMatch.id;
        tempIdMap[id] = cloudMatch.id;
      }
    }

    try {
      const res = await req(`/orders/${resolvedId}`, { method: "PATCH", body: JSON.stringify(payload) });
      if (res && res.id) {
        if (res.id !== id) tempIdMap[id] = res.id;
        if (res.id !== resolvedId) tempIdMap[resolvedId] = res.id;
      }
      const list = memoryCache["/orders"] || [];
      const updated = list.map((o: any) => (o.id === resolvedId || o.id === id || (res?.id && o.id === res.id)) ? { ...o, ...res } : o);
      memoryCache["/orders"] = updated;
      setDiskCache("disk_cache_/orders", JSON.stringify(updated)).catch(() => {});
      notifyCacheUpdate("/orders", updated);
      clearCachePrefix("/tables");
      clearCachePrefix("/dashboard/summary");
      return res;
    } catch (netErr: any) {
      console.warn("[api.updateOrder] Server update failed, falling back to local edit & sync:", netErr.message);

      // If server returned 404 and we have table info and items, try creating it directly on the server
      if (payload.table_number && (payload.items || []).length > 0) {
        try {
          const created = await req("/orders", {
            method: "POST",
            body: JSON.stringify({
              table_number: payload.table_number,
              items: payload.items,
              notes: payload.notes || "",
              session_id: payload.session_id || "",
              customer_name: payload.customer_name || "Guest 1"
            })
          });
          if (created && created.id) {
            tempIdMap[id] = created.id;
            tempIdMap[resolvedId] = created.id;
            const list = memoryCache["/orders"] || [];
            const updated = [created, ...list.filter((o: any) => o.id !== id && o.id !== resolvedId && o.id !== created.id)];
            memoryCache["/orders"] = updated;
            setDiskCache("disk_cache_/orders", JSON.stringify(updated)).catch(() => {});
            notifyCacheUpdate("/orders", updated);
            clearCachePrefix("/tables");
            clearCachePrefix("/dashboard/summary");
            return created;
          }
        } catch {}
      }

      const list = memoryCache["/orders"] || [];
      const updated = list.map((o: any) => {
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
  },
  // Online only, with no offline fallback, so an order and its unpaid bill can't end up with different totals.
  editOrderItems: async (id: string, items: any[]) => {
    const orderId = tempIdMap[id] || id;
    if (String(orderId).startsWith("temp-")) {
      throw new Error("This order is still saving. Please wait a moment and try again.");
    }
    const fetchFresh = (path: string) => {
      cacheTimestamps[path] = 0;
      delete inFlightRequests[path];
      return req(path);
    };
    const isClosed = (status: any) => ["paid", "completed", "cancelled"].includes(String(status).toLowerCase());
    const [orders, bills] = await Promise.all([fetchFresh("/orders"), fetchFresh("/bills")]);
    const order = (orders || []).find((o: any) => o && o.id === orderId);
    if (!order) throw new Error("This order could not be found. Please refresh and try again.");
    const hasClosedBill = (bills || []).some((b: any) =>
      b && isClosed(b.status) && (b.order_id === orderId || (b.order_ids || []).includes(orderId))
    );
    if (isClosed(order.status) || hasClosedBill) {
      throw new Error("This order is already paid or closed, so it can't be edited.");
    }

    // The server clears notes when they are left out, so the existing notes are sent back.
    const res = await req(`/orders/${orderId}`, {
      method: "PATCH",
      body: JSON.stringify({ items, notes: order.notes ?? "" }),
    });
    const updated = (memoryCache["/orders"] || []).map((o: any) => (o && o.id === orderId ? { ...o, ...res } : o));
    memoryCache["/orders"] = updated;
    setDiskCache("disk_cache_/orders", JSON.stringify(updated)).catch(() => {});
    notifyCacheUpdate("/orders", updated);
    clearCachePrefix("/tables");
    clearCachePrefix("/dashboard/summary");
    await fetchFresh("/bills").catch(() => {});
    return res;
  },
  listOrders: async (status?: string) => {
    try {
      const res = await req(`/orders${status ? `?status_filter=${status}` : ""}`);
      return res;
    } catch (netErr) {
      const list = (memoryCache["/orders"] || []).filter((o: any) => o && !String(o.id).startsWith("temp-"));
      if (status) {
        return list.filter((o: any) => o.status === status);
      }
      return list;
    }
  },
  updateOrderStatus: async (id: string, status: string) => {
    const resolvedId = tempIdMap[id] || id;
    try {
      const res = await req(`/orders/${resolvedId}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      api.updateOrderStatusInCache(resolvedId, status);
      clearCachePrefix("/dashboard/summary");
      return res;
    } catch (netErr: any) {
      api.updateOrderStatusInCache(resolvedId, status);
      await enqueueSyncAction("UPDATE_ORDER_STATUS", { id: resolvedId, status });
      return { id: resolvedId, status };
    }
  },
  
  createBill: async (payload: any) => {
    const oList = memoryCache["/orders"] || [];
    const bList = memoryCache["/bills"] || [];
    const orderId = payload.order_id;
    const orderIds = payload.order_ids || (orderId ? [orderId] : []);
    const checkOids = orderIds.length > 0 ? orderIds : (orderId ? [orderId] : []);

    if (checkOids.length > 0) {
      const existingPaid = bList.find((b: any) =>
        (b.status === "paid" || b.status === "completed") &&
        (checkOids.includes(b.order_id) || (b.order_ids && b.order_ids.some((id: string) => checkOids.includes(id))))
      );
      if (existingPaid) return existingPaid;

      const orderIsPaid = oList.some((o: any) => checkOids.includes(o.id) && (o.status === "paid" || o.status === "completed"));
      if (orderIsPaid) {
        const anyBill = bList.find((b: any) => checkOids.includes(b.order_id) || (b.order_ids && b.order_ids.some((id: string) => checkOids.includes(id))));
        if (anyBill) return { ...anyBill, status: "paid" };
      }
    }

    const handleLocalBill = async () => {
      const localId = "bill_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
      const nowIso = new Date().toISOString();

      let items = payload.items;
      let tableNumber = payload.table_number;

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

      const orderIsPaid = oList.some((o: any) => checkOids.includes(o.id) && (o.status === "paid" || o.status === "completed"));

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
        status: orderIsPaid ? "paid" : "unpaid",
        created_at: nowIso,
        payment_method: payload.payment_method || "UPI",
        restaurant_snapshot: r,
      };

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
    };

    try {
      const res = await req("/bills", { method: "POST", body: JSON.stringify(payload) });
      const list = memoryCache["/bills"] || [];
      memoryCache["/bills"] = [res, ...list.filter((b: any) => b.id !== res.id)];
      clearCachePrefix("/dashboard/summary");
      notifyCacheUpdate("/bills", memoryCache["/bills"]);
      return res;
    } catch (netErr: any) {
      stopIfSubscriptionNeeded(netErr);
      console.warn("[api.createBill] Server bill creation failed, creating local bill:", netErr.message);
      return handleLocalBill();
    }
  },
  markBillPaid: async (idOrBill: string | any, paymentMethod = "UPI", discount?: number) => {
    const passedObj = typeof idOrBill === "object" && idOrBill !== null ? idOrBill : null;
    const rawId = passedObj ? (passedObj.id || passedObj.order_id || "") : String(idOrBill || "");
    let resolvedId = tempIdMap[rawId] || rawId;

    const handleLocalMarkPaid = async () => {
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
          discount: discount ?? passedObj?.discount ?? 0,
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
        discount: discount ?? targetBill.discount,
        payment_method: paymentMethod
      });

      return targetBill || { id: resolvedId, status: "paid", payment_method: paymentMethod };
    };

    try {
      const res = await req(`/bills/${resolvedId}/pay`, { method: "PATCH", body: JSON.stringify({ payment_method: paymentMethod, discount: discount ?? passedObj?.discount }) });
      const bList = memoryCache["/bills"] || [];
      const targetOids = res.order_ids || (res.order_id ? [res.order_id] : [resolvedId]);
      const isMatchingBill = (b: any) =>
        b.id === resolvedId ||
        b.id === rawId ||
        b.id === res.id ||
        (b.order_id && targetOids.includes(b.order_id)) ||
        (b.order_ids && b.order_ids.some((id: string) => targetOids.includes(id)));

      const foundInBills = bList.some(isMatchingBill);
      const updatedBills = foundInBills
        ? bList.map((b: any) => isMatchingBill(b) ? { ...b, ...res, status: "paid" } : b)
        : [res, ...bList];
      memoryCache["/bills"] = updatedBills;
      setDiskCache("disk_cache_/bills", JSON.stringify(updatedBills)).catch(() => {});
      notifyCacheUpdate("/bills", updatedBills);
      
      const oList = memoryCache["/orders"] || [];
      const updatedOrders = oList.map((o: any) => {
        if (targetOids.includes(o.id) || o.id === resolvedId || o.id === rawId) {
          return { ...o, status: "paid" };
        }
        return o;
      });
      memoryCache["/orders"] = updatedOrders;
      setDiskCache("disk_cache_/orders", JSON.stringify(updatedOrders)).catch(() => {});
      notifyCacheUpdate("/orders", updatedOrders);

      if (res.table_number && res.table_number !== "Takeaway" && res.table_status === "AVAILABLE") {
        const tList = memoryCache["/tables"] || [];
        const updatedTables = tList.map((t: any) =>
          isSameTable(t.label, res.table_number) ? { ...t, status: "available" } : t
        );
        memoryCache["/tables"] = updatedTables;
        setDiskCache("disk_cache_/tables", JSON.stringify(updatedTables)).catch(() => {});
        notifyCacheUpdate("/tables", updatedTables);
      }
      
      clearCachePrefix("/dashboard");
      clearCachePrefix("/tables");
      clearCachePrefix("/bills");
      api.dashboardSummary().catch(() => {});
      api.listBills().catch(() => {});
      return res;
    } catch (netErr: any) {
      console.warn("[api.markBillPaid] Server pay request failed, marking paid offline locally:", netErr.message);
      return handleLocalMarkPaid();
    }
  },
  removeOrders: async (orderIds: string[]) => {
    const ids = orderIds.map((id: string) => tempIdMap[id] || id);
    if (ids.some((id: string) => String(id).startsWith("temp-"))) {
      throw new Error("This order is still saving. Please wait a moment and try again.");
    }
    const res = await req("/orders/remove", { method: "POST", body: JSON.stringify({ order_ids: ids }) });
    clearCachePrefix("/orders");
    clearCachePrefix("/bills");
    clearCachePrefix("/dashboard/summary");
    return res;
  },
  settleTable: async (tableNumber: string, paymentMethod = "UPI", orderIds?: string[], total?: number, discount?: number) => {
    const handleLocalSettle = async () => {
      const oList = (memoryCache["/orders"] || []).filter((o: any) => !String(o.id).startsWith("temp-"));
      const cleanOrderIds = (orderIds || []).filter((id: string) => id && !String(id).startsWith("temp-"));

      const activeTableOrders = oList.filter((o: any) =>
        (cleanOrderIds.length > 0 ? cleanOrderIds.includes(o.id) : isSameTable(o.table_number, tableNumber)) &&
        o.status !== "paid" && o.status !== "completed" && o.status !== "cancelled" && o.status !== "settled"
      );

      const ordersToSettle = activeTableOrders.length > 0
        ? activeTableOrders
        : oList.filter((o: any) => (cleanOrderIds.length > 0 ? cleanOrderIds.includes(o.id) : isSameTable(o.table_number, tableNumber)) && o.status !== "cancelled");

      const targetOrderIds = ordersToSettle.map((o: any) => o.id);

      const updatedOrders = oList.map((o: any) => {
        if (targetOrderIds.includes(o.id) || isSameTable(o.table_number, tableNumber)) {
          return { ...o, status: "paid" };
        }
        return o;
      });
      memoryCache["/orders"] = updatedOrders;
      setDiskCache("disk_cache_/orders", JSON.stringify(updatedOrders)).catch(() => {});
      notifyCacheUpdate("/orders", updatedOrders);

      const combinedItems = ordersToSettle.flatMap((o: any) => o.items || []);
      const computedSubtotal = ordersToSettle.reduce((sum: number, o: any) => {
        const sub = Number(o.subtotal || 0) || (o.items || []).reduce((acc: number, it: any) => acc + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
        return sum + sub;
      }, 0);
      const r = memoryCache["/restaurant"] || api.getCachedRestaurant();
      const gst = r?.gst_enabled;
      const gstRate = Number(r?.gst_rate ?? 5);
      const tax = gst ? Math.round(computedSubtotal * (gstRate / 100) * 100) / 100 : 0;
      const finalTotal = total !== undefined && total > 0 ? total : Math.round((computedSubtotal + tax) * 100) / 100;

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
          tax: tax,
          tax_percent: gst ? gstRate : 0,
          cgst: gst ? Math.round((tax / 2) * 100) / 100 : 0,
          sgst: gst ? Math.round((tax - Math.round((tax / 2) * 100) / 100) * 100) / 100 : 0,
          gst_enabled: !!gst,
          discount: discount || 0,
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

      const tList = memoryCache["/tables"] || [];
      const updatedTables = tList.map((t: any) =>
        isSameTable(t.label, tableNumber)
          ? { ...t, status: "available" }
          : t
      );
      memoryCache["/tables"] = updatedTables;
      setDiskCache("disk_cache_/tables", JSON.stringify(updatedTables)).catch(() => {});
      notifyCacheUpdate("/tables", updatedTables);

      const summary = computeLocalSummary();
      notifyCacheUpdate("/dashboard/summary", summary);

      await enqueueSyncAction("SETTLE_TABLE", {
        table_number: tableNumber,
        payment_method: paymentMethod,
        order_ids: targetOrderIds,
        total: finalTotal,
        discount
      });

      return { ok: true, table_number: tableNumber, status: "settled" };
    };

    try {
      const res = await req("/bills/settle-table", {
        method: "POST",
        body: JSON.stringify({
          table_number: tableNumber,
          payment_method: paymentMethod,
          order_ids: orderIds,
          total,
          discount
        })
      });
      const oList = memoryCache["/orders"] || [];
      const updatedOrders = oList.map((o: any) => {
        if ((orderIds && orderIds.includes(o.id)) || (!orderIds && isSameTable(o.table_number, tableNumber))) {
          return { ...o, status: "paid" };
        }
        return o;
      });
      memoryCache["/orders"] = updatedOrders;
      setDiskCache("disk_cache_/orders", JSON.stringify(updatedOrders)).catch(() => {});
      notifyCacheUpdate("/orders", updatedOrders);

      const bList = memoryCache["/bills"] || [];
      const updatedBills = bList.map((b: any) => {
        if (isSameTable(b.table_number, tableNumber) || (orderIds && (orderIds.includes(b.order_id) || (b.order_ids && b.order_ids.some((id: string) => orderIds.includes(id)))))) {
          return { ...b, status: "paid", payment_method: paymentMethod, paid_at: new Date().toISOString() };
        }
        return b;
      });
      memoryCache["/bills"] = updatedBills;
      setDiskCache("disk_cache_/bills", JSON.stringify(updatedBills)).catch(() => {});
      notifyCacheUpdate("/bills", updatedBills);

      const tList = memoryCache["/tables"] || [];
      const updatedTables = tList.map((t: any) =>
        isSameTable(t.label, tableNumber) ? { ...t, status: "available" } : t
      );
      memoryCache["/tables"] = updatedTables;
      setDiskCache("disk_cache_/tables", JSON.stringify(updatedTables)).catch(() => {});
      notifyCacheUpdate("/tables", updatedTables);

      clearCachePrefix("/dashboard");
      clearCachePrefix("/tables");
      clearCachePrefix("/bills");
      api.dashboardSummary().catch(() => {});
      api.listBills().catch(() => {});
      return res;
    } catch (netErr: any) {
      console.warn("[api.settleTable] Server settle request failed, settling table locally offline:", netErr.message);
      return handleLocalSettle();
    }
  },
  listBills: async () => {
    try {
      const res = await req("/bills");
      return res;
    } catch (netErr) {
      return (memoryCache["/bills"] || []).filter((b: any) => b && !String(b.id).startsWith("temp-"));
    }
  },
  dashboardSummary: async () => {
    try {
      const res = await req("/dashboard/summary");
      return res;
    } catch (netErr) {
      const summary = computeLocalSummary();
      notifyCacheUpdate("/dashboard/summary", summary);
      return summary;
    }
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
  getBackendUrl: () => getBackendUrl(),
  getLiveBackendUrl: () => getLiveBackendUrl(),
  getDefaultBackendUrl: () => getDefaultBackendUrl(),
  setCustomBackendUrl: (url: string) => setCustomBackendUrl(url),
  resetCustomBackendUrl: () => resetCustomBackendUrl(),
  testBackendHealth: (url?: string) => testBackendHealth(url),
  adminExportBusinessReportUrl: () => `${getBackendUrl()}/api/admin/reports/export`,
  adminGetRestaurantMenu: (tid: string) => req(`/admin/restaurants/${tid}/menu`),
  adminImportRestaurantMenuJson: (tid: string, payload: { replace_existing?: boolean; data?: any; raw_json?: string }) =>
    req(`/admin/restaurants/${tid}/menu/import-json`, { method: "POST", body: JSON.stringify(payload) }),
  adminClearRestaurantMenu: (tid: string) => req(`/admin/restaurants/${tid}/menu`, { method: "DELETE" }),
  adminAutoAssignMenuImages: (tid: string, forceAll: boolean = false) =>
    req(`/admin/restaurants/${tid}/menu/auto-assign-images`, { method: "POST", body: JSON.stringify({ force_all: forceAll }) }),
  
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
  ocrProcessMenu: async (images: string[]) => {
    const formData = new FormData();
    for (let idx = 0; idx < images.length; idx++) {
      const uri = images[idx];
      const cleanUri = uri.split("?")[0];
      const rawName = (!uri.startsWith("data:") && cleanUri.split("/").pop()) || `menu_page_${idx + 1}.jpg`;
      const match = /\.(\w+)$/.exec(rawName);
      const ext = match ? match[1].toLowerCase() : "jpg";
      const filename = rawName.includes(".") ? rawName : `${rawName}.${ext}`;
      const type = `image/${ext === "png" ? "png" : ext === "webp" ? "webp" : "jpeg"}`;

      if (Platform.OS === "web") {
        try {
          const res = await fetch(uri);
          const blob = await res.blob();
          formData.append("images", await shrinkPhotoForUpload(blob), filename);
        } catch {
          if (uri.startsWith("data:")) {
            try {
              const parts = uri.split(",");
              const mime = parts[0].match(/:(.*?);/)?.[1] || "image/jpeg";
              const bstr = atob(parts[1]);
              const n = bstr.length;
              const u8arr = new Uint8Array(n);
              for (let i = 0; i < n; i++) {
                u8arr[i] = bstr.charCodeAt(i);
              }
              const blob = new Blob([u8arr], { type: mime });
              formData.append("images", blob, filename);
            } catch {
              formData.append("images", { uri, name: filename, type } as any);
            }
          } else {
            formData.append("images", { uri, name: filename, type } as any);
          }
        }
      } else {
        formData.append("images", {
          uri,
          name: filename,
          type,
        } as any);
      }
    }
    return req("/menu/ocr-process", { method: "POST", body: formData });
  },
  // Caches clear after the save, so a screen refreshing during the save cannot keep the old menu
  bulkImportMenu: async (categories: any[]) => {
    const res = await req("/menu/bulk-import", { method: "POST", body: JSON.stringify({ categories }) });
    clearCachePrefix("/categories");
    clearCachePrefix("/menu-items");
    return res;
  },
  rollbackBulkImport: async (itemIds: string[], categoryIds: string[]) => {
    const res = await req("/menu/bulk-import/rollback", { method: "POST", body: JSON.stringify({ item_ids: itemIds, category_ids: categoryIds }) });
    clearCachePrefix("/categories");
    clearCachePrefix("/menu-items");
    return res;
  },
  
  // Cache utilities
  getCachedOrders: () => memoryCache['/orders'] || null,
  getCachedBills: () => memoryCache['/bills'] || null,
  getCachedRestaurant: () => memoryCache['/restaurant'] || null,
  getCachedCategories: () => memoryCache['/categories'] || null,
  getCachedMenu: () => memoryCache['/menu-items'] || null,
  getCachedTables: () => {
    const raw = memoryCache['/tables'] || null;
    if (!Array.isArray(raw)) return raw;
    const seen = new Set<string>();
    return raw.filter((t: any) => {
      const k = String(t?.label || t?.id).trim().toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  },
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
  // Close Counter: ends the counter day; the dashboard starts again from ₹0. Unpaid orders stay open.
  dayStatus: () => req("/day/status"),
  closeCounter: async () => {
    const res: any = await req("/day/close", { method: "POST" });
    api.markDayClosed(res?.closed_at);
    return res;
  },
  markDayClosed: (closedAt?: string) => {
    if (!closedAt) return;
    const r = memoryCache["/restaurant"];
    if (r && typeof r === "object") {
      memoryCache["/restaurant"] = { ...r, day_closed_at: closedAt };
      setDiskCache("disk_cache_/restaurant", JSON.stringify(memoryCache["/restaurant"])).catch(() => {});
    } else {
      fallbackDayClosedAt = closedAt;
    }
    api.resetDailySalesCache();
  },
  resetDailySalesCache: () => {
    const cached = memoryCache['/dashboard/summary'];
    const todayStr = getBusinessDayKey();
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
  resolvePendingOrder: async (tempId: string): Promise<any> => {
    if (pendingOrderCreations[tempId] !== undefined) {
      try {
        return await pendingOrderCreations[tempId];
      } catch {
        return null;
      }
    }
    const realId = tempIdMap[tempId];
    if (realId && realId !== tempId) {
      const orders = memoryCache["/orders"] || [];
      return orders.find((o: any) => o.id === realId) || { id: realId };
    }
    return null;
  },
  injectCachedOrder: (order: any) => {
    if (!order || !order.id) return;
    const list = memoryCache["/orders"] || [];
    const bList = memoryCache["/bills"] || [];
    
    // Check if this order or any linked bill is already marked paid
    const existingInCache = list.find((o: any) => o.id === order.id || (order.id && tempIdMap[o.id] === order.id));
    const isPaidInCache = existingInCache && (existingInCache.status === "paid" || existingInCache.status === "completed");
    const hasPaidBill = bList.some((b: any) => 
      (b.status === "paid" || b.status === "completed") && 
      (b.order_id === order.id || (b.order_ids && b.order_ids.includes(order.id)))
    );

    if ((isPaidInCache || hasPaidBill) && order.status !== "paid") {
      order = { ...order, status: "paid" };
    }

    let updated: any[];
    if (!String(order.id).startsWith("temp-")) {
      updated = [order, ...list.filter((o: any) => !String(o.id).startsWith("temp-") && o.id !== order.id && (!order.id || tempIdMap[o.id] !== order.id))];
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
    const existing = list.find((o: any) => o.id === id || o.id === realOrder.id);
    const finalOrder = (existing && existing.status === "paid" && realOrder.status !== "paid")
      ? { ...realOrder, status: "paid" }
      : realOrder;
    const updated = [finalOrder, ...list.filter((o: any) => o.id !== id && o.id !== realOrder.id && !String(o.id).startsWith("temp-"))];
    memoryCache["/orders"] = updated;
    setDiskCache("disk_cache_/orders", JSON.stringify(updated)).catch(() => {});
    notifyCacheUpdate("/orders", updated);
  },
  updateCachedBill: (id: string, realBill: any) => {
    if (!realBill || !realBill.id) return;
    const list = memoryCache["/bills"] || [];
    const isMatching = (b: any) =>
      b.id === id ||
      b.id === realBill.id ||
      (realBill.order_id && b.order_id === realBill.order_id) ||
      (realBill.order_ids && b.order_id && realBill.order_ids.includes(b.order_id)) ||
      (b.order_ids && realBill.order_id && b.order_ids.includes(realBill.order_id)) ||
      (b.order_ids && realBill.order_ids && b.order_ids.some((x: string) => realBill.order_ids.includes(x)));

    const existing = list.find(isMatching);
    const finalBill = (existing && existing.status === "paid" && realBill.status !== "paid")
      ? { ...realBill, status: "paid", payment_method: existing.payment_method || realBill.payment_method }
      : realBill;
    const updated = [finalBill, ...list.filter((b: any) => !isMatching(b) && !String(b.id).startsWith("temp-"))];
    memoryCache["/bills"] = updated;
    setDiskCache("disk_cache_/bills", JSON.stringify(updated)).catch(() => {});
    notifyCacheUpdate("/bills", updated);
  },
  setCachedOrders: (orders: any[]) => {
    const clean = (Array.isArray(orders) ? orders : []).filter((o: any) => o && !String(o.id).startsWith("temp-"));
    memoryCache["/orders"] = clean;
  },
  setCachedTables: (tables: any[]) => {
    if (!Array.isArray(tables)) {
      memoryCache["/tables"] = tables;
      return;
    }
    const seen = new Set<string>();
    const deduped = tables.filter((t: any) => {
      const k = String(t?.label || t?.id).trim().toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    memoryCache["/tables"] = deduped;
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
  // ---------- END-OF-DAY CASHIER SESSIONS & RECONCILIATION ----------
  getCurrentCashSession: async () => {
    try {
      const res = await req("/cash-sessions/current");
      if (res && res.active_session) {
        memoryCache["/cash-sessions/current"] = res.active_session;
        setDiskCache("disk_cache_/cash-sessions/current", JSON.stringify(res.active_session)).catch(() => {});
        notifyCacheUpdate("/cash-sessions/current", res.active_session);
      }
      return res;
    } catch (netErr: any) {
      // Offline fallback: compute local session metrics from memoryCache
      const cached = memoryCache["/cash-sessions/current"];
      if (cached && cached.status === "open") {
        return { has_open_session: true, active_session: cached };
      }
      return { has_open_session: false, active_session: null };
    }
  },

  openCashSession: async (payload: { opening_float: number; business_date?: string; cashier_name?: string; notes?: string }) => {
    try {
      const res = await req("/cash-sessions/open", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (res) {
        memoryCache["/cash-sessions/current"] = res;
        setDiskCache("disk_cache_/cash-sessions/current", JSON.stringify(res)).catch(() => {});
        notifyCacheUpdate("/cash-sessions/current", res);
      }
      return res;
    } catch (netErr: any) {
      // Offline fallback
      const localId = "sess_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
      const nowIso = new Date().toISOString();
      const localSess = {
        id: localId,
        opened_at: nowIso,
        status: "open",
        cashier_name: payload.cashier_name || "Cashier",
        opening_float: Number(payload.opening_float || 0),
        business_date: payload.business_date || getTodayDateString(),
        notes: payload.notes || "",
        created_at: nowIso,
        expected_cash: Number(payload.opening_float || 0),
        cash_sales: 0,
        upi_sales: 0,
        card_sales: 0,
        other_sales: 0,
        gross_sales: 0,
        net_sales: 0,
        movements: [],
      };
      memoryCache["/cash-sessions/current"] = localSess;
      setDiskCache("disk_cache_/cash-sessions/current", JSON.stringify(localSess)).catch(() => {});
      notifyCacheUpdate("/cash-sessions/current", localSess);

      await enqueueSyncAction("OPEN_CASH_SESSION", payload, localId);
      return localSess;
    }
  },

  recordCashMovement: async (payload: {
    type: "cash_in" | "cash_out" | "cash_drop";
    amount: number;
    reason: string;
    reference?: string;
    session_id?: string;
  }) => {
    try {
      const res = await req("/cash-sessions/movement", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return res;
    } catch (netErr: any) {
      // Offline fallback
      const localId = "mov_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
      const localMov = {
        id: localId,
        ...payload,
        created_at: new Date().toISOString(),
      };
      const activeSess = memoryCache["/cash-sessions/current"];
      if (activeSess) {
        activeSess.movements = [...(activeSess.movements || []), localMov];
        if (payload.type === "cash_in") activeSess.cash_in_total = (activeSess.cash_in_total || 0) + Number(payload.amount);
        if (payload.type === "cash_out") activeSess.cash_out_total = (activeSess.cash_out_total || 0) + Number(payload.amount);
        if (payload.type === "cash_drop") activeSess.cash_drop_total = (activeSess.cash_drop_total || 0) + Number(payload.amount);
        activeSess.expected_cash = Number(activeSess.opening_float || 0) + Number(activeSess.cash_sales || 0) + Number(activeSess.cash_in_total || 0) - Number(activeSess.cash_out_total || 0) - Number(activeSess.cash_drop_total || 0);
        notifyCacheUpdate("/cash-sessions/current", activeSess);
      }
      await enqueueSyncAction("RECORD_CASH_MOVEMENT", payload, localId);
      return localMov;
    }
  },

  closeCashSession: async (payload: {
    counted_cash?: number;
    actual_cash_counted?: number;
    denominations?: Record<string, number>;
    cash_denominations?: Record<string, number>;
    actual_upi?: number;
    actual_card?: number;
    actual_other?: number;
    reconciled_upi_count?: number;
    reconciled_upi_total?: number;
    reconciled_card_count?: number;
    reconciled_card_total?: number;
    discrepancy_reason?: string;
    closing_notes?: string;
  }) => {
    const countedCashVal = payload.counted_cash ?? payload.actual_cash_counted ?? 0;
    const bodyPayload = {
      ...payload,
      counted_cash: countedCashVal,
      actual_upi: payload.actual_upi ?? payload.reconciled_upi_total,
      actual_card: payload.actual_card ?? payload.reconciled_card_total,
      denominations: payload.denominations ?? payload.cash_denominations,
    };
    try {
      const res = await req("/cash-sessions/close", {
        method: "POST",
        body: JSON.stringify(bodyPayload),
      });
      memoryCache["/cash-sessions/current"] = null;
      delDiskCache("disk_cache_/cash-sessions/current").catch(() => {});
      notifyCacheUpdate("/cash-sessions/current", null);
      return res;
    } catch (netErr: any) {
      // Offline fallback
      const activeSess = memoryCache["/cash-sessions/current"] || {};
      const closedDoc = {
        ...activeSess,
        status: "closed",
        closed_at: new Date().toISOString(),
        counted_cash: countedCashVal,
        denominations: bodyPayload.denominations,
        actual_upi: bodyPayload.actual_upi,
        actual_card: bodyPayload.actual_card,
        actual_other: payload.actual_other,
        discrepancy_reason: payload.discrepancy_reason,
        closing_notes: payload.closing_notes,
      };
      memoryCache["/cash-sessions/current"] = null;
      delDiskCache("disk_cache_/cash-sessions/current").catch(() => {});
      notifyCacheUpdate("/cash-sessions/current", null);

      await enqueueSyncAction("CLOSE_CASH_SESSION", bodyPayload, activeSess.id);
      return closedDoc;
    }
  },

  listCashSessionsHistory: (limit = 50) => req(`/cash-sessions/history?limit=${limit}`),
  getCashSessionDetail: (sessionId: string) => req(`/cash-sessions/${sessionId}`),
  approveCashSessionDiscrepancy: (sessionId: string, payload: { notes?: string; approval_notes?: string }) => {
    const bodyPayload = { notes: payload.notes || payload.approval_notes || "" };
    return req(`/cash-sessions/${sessionId}/approve`, { method: "POST", body: JSON.stringify(bodyPayload) });
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
          "staff_management", "multi_user", "realtime_sync", "notifications", "analytics", "advanced_reports", "inventory", "expenses", "ai_menu", "cash_closing"
        ];
        return growthFeatures.includes(featureName);
      }
      // Starter Tier
      const starterFeatures = [
        "billing", "menu_crud", "table_crud", "basic_orders", "thermal_printing", "gst", "cloud_backup", "cash_closing"
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
  } else if (type === "OPEN_CASH_SESSION") {
    memoryCache["/cash-sessions/current"] = realObj;
    setDiskCache("disk_cache_/cash-sessions/current", JSON.stringify(realObj)).catch(() => {});
    notifyCacheUpdate("/cash-sessions/current", realObj);
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

