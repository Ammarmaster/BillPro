import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { BillingEngine } from "./billingEngine";

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

interface OutboxAction {
  operationId: string;
  path: string;
  method: string;
  body?: any;
  timestamp: number;
  tempId?: string;
}

let outboxQueue: OutboxAction[] = [];
let isSyncing = false;

async function saveOutbox() {
  await setItem("disk_outbox_queue", JSON.stringify(outboxQueue));
}

// Hydrate outbox queue on startup
if (Platform.OS === "web" && typeof window !== "undefined") {
  try {
    const v = window.localStorage.getItem("disk_outbox_queue");
    if (v) {
      outboxQueue = JSON.parse(v);
      setTimeout(() => startSyncRunner(), 1000);
    }
  } catch {}
} else if (Platform.OS !== "web") {
  SecureStore.getItemAsync("disk_outbox_queue").then(v => {
    if (v) {
      outboxQueue = JSON.parse(v);
      setTimeout(() => startSyncRunner(), 1000);
    }
  }).catch(() => {});
}

export async function startSyncRunner() {
  if (isSyncing || outboxQueue.length === 0) return;
  isSyncing = true;
  try {
    while (outboxQueue.length > 0) {
      const action = outboxQueue[0];
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Operation-ID": action.operationId
      };
      const t = await getAccess();
      if (t) headers["Authorization"] = `Bearer ${t}`;

      const res = await fetch(`${BASE}/api${action.path}`, {
        method: action.method,
        headers,
        body: action.body ? JSON.stringify(action.body) : undefined
      });

      if (!res.ok) {
        if (res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 403) {
          console.warn("Outbox item failed with client error, skipping:", action.path, res.status);
          outboxQueue.shift();
          await saveOutbox();
          continue;
        }
        break;
      }

      const serverData = await res.json();
      if (action.tempId && serverData && serverData.id) {
        tempIdMap[action.tempId] = serverData.id;
        for (const queued of outboxQueue) {
          if (queued.body) {
            let bodyStr = JSON.stringify(queued.body);
            bodyStr = bodyStr.split(action.tempId).join(serverData.id);
            queued.body = JSON.parse(bodyStr);
          }
        }
        rewriteCacheTempIds(action.tempId, serverData.id);
      }

      outboxQueue.shift();
      await saveOutbox();
    }
  } catch (err) {
    console.warn("Sync runner network failure:", err);
  } finally {
    isSyncing = false;
  }
}

function rewriteCacheTempIds(tempId: string, realId: string) {
  for (const k in memoryCache) {
    const list = memoryCache[k];
    if (Array.isArray(list)) {
      const updated = list.map((item: any) => {
        let str = JSON.stringify(item);
        if (str.includes(tempId)) {
          str = str.split(tempId).join(realId);
          return JSON.parse(str);
        }
        return item;
      });
      memoryCache[k] = updated;
      setItem("disk_cache_" + k, JSON.stringify(updated)).catch(() => {});
    }
  }
}

async function handleOfflineMutation(path: string, opts: RequestInit): Promise<any> {
  const method = opts.method || "POST";
  const body = typeof opts.body === "string" ? JSON.parse(opts.body) : {};
  const operationId = "op_" + Math.random().toString(36).substring(2, 10) + "_" + Date.now();

  if (path === "/orders" && method === "POST") {
    const tempId = "temp-order-" + Math.random().toString(36).substring(2, 10) + "_" + Date.now();
    const newOrder = {
      id: tempId,
      tenant_id: "local_tenant",
      table_number: body.table_number,
      session_id: body.session_id || tempId,
      customer_name: body.customer_name || "Guest 1",
      items: body.items || [],
      notes: body.notes || "",
      subtotal: (body.items || []).reduce((s: number, i: any) => s + (i.price * i.quantity), 0),
      status: "placed",
      order_source: "waiter",
      created_by: "waiter",
      created_at: new Date().toISOString(),
      operationId
    };
    outboxQueue.push({ operationId, path, method, body, timestamp: Date.now(), tempId });
    await saveOutbox();

    const oList = memoryCache["/orders"] || [];
    memoryCache["/orders"] = [newOrder, ...oList.filter((o: any) => o.id !== tempId)];
    await setItem("disk_cache_/orders", JSON.stringify(memoryCache["/orders"]));
    clearCachePrefix("/tables");
    return newOrder;
  }

  if (path.startsWith("/orders/") && method === "PATCH") {
    const orderId = path.split("/")[2];
    const isStatus = path.endsWith("/status");
    outboxQueue.push({ operationId, path, method, body, timestamp: Date.now() });
    await saveOutbox();

    const oList = memoryCache["/orders"] || [];
    const updated = oList.map((o: any) => {
      if (o.id === orderId) {
        if (isStatus) return { ...o, status: body.status };
        return { ...o, ...body };
      }
      return o;
    });
    memoryCache["/orders"] = updated;
    await setItem("disk_cache_/orders", JSON.stringify(updated));
    clearCachePrefix("/tables");
    return updated.find((o: any) => o.id === orderId) || { id: orderId, ...body };
  }

  if (path === "/bills" && method === "POST") {
    const tempId = "temp-bill-" + Math.random().toString(36).substring(2, 10) + "_" + Date.now();
    let combinedItems: any[] = [];
    let subtotal = 0;
    let tableNum = body.table_number || "Takeaway";
    const orderIds = body.order_ids || (body.order_id ? [body.order_id] : []);

    const oList = memoryCache["/orders"] || [];
    const targetOrders = oList.filter((o: any) => orderIds.includes(o.id));
    if (targetOrders.length > 0) {
      tableNum = targetOrders[0].table_number;
      for (const o of targetOrders) {
        combinedItems.push(...(o.items || []));
        subtotal += o.subtotal || 0;
      }
    }

    let localSeq = parseInt((await getItem("local_bill_seq")) || "0", 10) + 1;
    await setItem("local_bill_seq", String(localSeq));
    const billNo = `EZ-${new Date().getFullYear()}-OFFLINE-${String(localSeq).padStart(4, "0")}`;

    const calc = BillingEngine.calculate({
      items: combinedItems,
      discount: body.discount || 0,
      taxPercent: body.tax_percent || 5.0,
      gstEnabled: body.gst_enabled !== false
    });

    const newBill = {
      id: tempId,
      bill_number: billNo,
      order_id: orderIds[0] || tempId,
      order_ids: orderIds,
      table_number: tableNum,
      items: combinedItems,
      subtotal: calc.subtotal,
      tax_percent: body.tax_percent || 5.0,
      tax: calc.tax,
      cgst: calc.cgst,
      sgst: calc.sgst,
      gst_enabled: body.gst_enabled !== false,
      discount: calc.discount,
      total: calc.total,
      status: "pending",
      created_at: new Date().toISOString(),
      operationId
    };

    outboxQueue.push({ operationId, path, method, body, timestamp: Date.now(), tempId });
    await saveOutbox();

    const bList = memoryCache["/bills"] || [];
    memoryCache["/bills"] = [newBill, ...bList.filter((b: any) => b.id !== tempId)];
    await setItem("disk_cache_/bills", JSON.stringify(memoryCache["/bills"]));
    return newBill;
  }

  if (path.endsWith("/pay") && method === "PATCH") {
    const billId = path.split("/")[2];
    outboxQueue.push({ operationId, path, method, body, timestamp: Date.now() });
    await saveOutbox();

    const bList = memoryCache["/bills"] || [];
    const updated = bList.map((b: any) => {
      if (b.id === billId) return { ...b, status: "paid", payment_method: body.payment_method };
      return b;
    });
    memoryCache["/bills"] = updated;
    await setItem("disk_cache_/bills", JSON.stringify(updated));
    return updated.find((b: any) => b.id === billId) || { id: billId, status: "paid" };
  }

  if (path === "/bills/settle-table" && method === "POST") {
    outboxQueue.push({ operationId, path, method, body, timestamp: Date.now() });
    await saveOutbox();
    const targetTbl = body.table_number;

    const oList = memoryCache["/orders"] || [];
    const updatedOrders = oList.map((o: any) => {
      if (o.table_number === targetTbl) return { ...o, status: "served" };
      return o;
    });
    memoryCache["/orders"] = updatedOrders;
    await setItem("disk_cache_/orders", JSON.stringify(updatedOrders));

    const bList = memoryCache["/bills"] || [];
    const updatedBills = bList.map((b: any) => {
      if (b.table_number === targetTbl) return { ...b, status: "paid", payment_method: body.payment_method };
      return b;
    });
    memoryCache["/bills"] = updatedBills;
    await setItem("disk_cache_/bills", JSON.stringify(updatedBills));
    clearCachePrefix("/tables");
    return { success: true };
  }

  if (path === "/categories" && method === "POST") {
    const tempId = "temp-cat-" + Math.random().toString(36).substring(2, 10) + "_" + Date.now();
    const newCat = { id: tempId, name: body.name, sort_order: body.sort_order || 0, created_at: new Date().toISOString() };
    outboxQueue.push({ operationId, path, method, body, timestamp: Date.now(), tempId });
    await saveOutbox();

    const cList = memoryCache["/categories"] || [];
    memoryCache["/categories"] = [...cList, newCat];
    await setItem("disk_cache_/categories", JSON.stringify(memoryCache["/categories"]));
    return newCat;
  }

  if (path.startsWith("/categories/") && method === "DELETE") {
    const catId = path.split("/")[2];
    outboxQueue.push({ operationId, path, method, timestamp: Date.now() });
    await saveOutbox();

    const cList = memoryCache["/categories"] || [];
    memoryCache["/categories"] = cList.filter((c: any) => c.id !== catId);
    await setItem("disk_cache_/categories", JSON.stringify(memoryCache["/categories"]));
    return { success: true };
  }

  if (path === "/menu-items" && method === "POST") {
    const tempId = "temp-item-" + Math.random().toString(36).substring(2, 10) + "_" + Date.now();
    const newItem = {
      id: tempId,
      category_id: body.category_id,
      name: body.name,
      price: body.price,
      description: body.description || "",
      is_veg: body.is_veg || false,
      is_active: true,
      created_at: new Date().toISOString()
    };
    outboxQueue.push({ operationId, path, method, body, timestamp: Date.now(), tempId });
    await saveOutbox();

    const mList = memoryCache["/menu-items"] || [];
    memoryCache["/menu-items"] = [...mList, newItem];
    await setItem("disk_cache_/menu-items", JSON.stringify(memoryCache["/menu-items"]));
    return newItem;
  }

  if (path.startsWith("/menu-items/") && (method === "PATCH" || method === "DELETE")) {
    const itemId = path.split("/")[2];
    outboxQueue.push({ operationId, path, method, body, timestamp: Date.now() });
    await saveOutbox();

    const mList = memoryCache["/menu-items"] || [];
    if (method === "DELETE") {
      memoryCache["/menu-items"] = mList.filter((m: any) => m.id !== itemId);
    } else {
      memoryCache["/menu-items"] = mList.map((m: any) => m.id === itemId ? { ...m, ...body } : m);
    }
    await setItem("disk_cache_/menu-items", JSON.stringify(memoryCache["/menu-items"]));
    return { success: true };
  }

  return { id: "temp-" + Math.random().toString(36).substring(2, 10), ...body };
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
      if (isGet) {
        if (memoryCache[path]) return memoryCache[path];
        throw new Error(netErr.message || "Network connection unavailable.");
      } else {
        return await handleOfflineMutation(path, opts);
      }
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
      // Replay outbox changes reactively
      startSyncRunner().catch(() => {});
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
  getPendingSyncCount: () => outboxQueue.length,
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
