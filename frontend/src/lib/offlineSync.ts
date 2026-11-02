import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

export type SyncActionType =
  | "CREATE_CATEGORY"
  | "DELETE_CATEGORY"
  | "CREATE_MENU_ITEM"
  | "UPDATE_MENU_ITEM"
  | "DELETE_MENU_ITEM"
  | "CREATE_TABLE"
  | "UPDATE_TABLE"
  | "DELETE_TABLE"
  | "SAVE_RESTAURANT"
  | "CREATE_ORDER"
  | "UPDATE_ORDER"
  | "UPDATE_ORDER_STATUS"
  | "CREATE_BILL"
  | "MARK_BILL_PAID"
  | "SETTLE_TABLE"
  | "OPEN_CASH_SESSION"
  | "RECORD_CASH_MOVEMENT"
  | "CLOSE_CASH_SESSION";

export interface SyncAction {
  id: string;
  type: SyncActionType;
  payload: any;
  localId?: string;
  createdAt: string;
}

const QUEUE_STORAGE_KEY = "disk_local_sync_queue";
const LAST_MIDNIGHT_SYNC_KEY = "disk_last_midnight_sync_date";

let syncQueue: SyncAction[] = [];
let isSyncing = false;
let isInitialized = false;

// Active runner references for instant 0ms background sync execution
let runnerReqFn: ((path: string, opts?: RequestInit, auth?: boolean) => Promise<any>) | null = null;
let runnerIdMap: Record<string, string> | null = null;
let runnerUpdateCacheFn: ((type: SyncActionType, localId: string | undefined, realObj: any) => void) | null = null;

type QueueListener = (queue: SyncAction[], syncing: boolean) => void;
const queueListeners: Set<QueueListener> = new Set();

export function subscribeToSyncQueue(cb: QueueListener) {
  queueListeners.add(cb);
  cb(syncQueue, isSyncing);
  return () => {
    queueListeners.delete(cb);
  };
}

function notifyQueueListeners() {
  for (const cb of queueListeners) {
    try {
      cb([...syncQueue], isSyncing);
    } catch {}
  }
}

// Storage helpers
async function saveQueueToDisk(queue: SyncAction[]) {
  const serialized = JSON.stringify(queue);
  if (Platform.OS === "web" && typeof window !== "undefined") {
    try {
      window.localStorage.setItem(QUEUE_STORAGE_KEY, serialized);
    } catch {}
    return;
  }
  try {
    await AsyncStorage.setItem(QUEUE_STORAGE_KEY, serialized);
  } catch {}
}

async function loadQueueFromDisk(): Promise<SyncAction[]> {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(QUEUE_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  }
  try {
    const raw = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

// Hydrate queue on module load
if (Platform.OS === "web" && typeof window !== "undefined") {
  try {
    const raw = window.localStorage.getItem(QUEUE_STORAGE_KEY);
    if (raw) {
      syncQueue = JSON.parse(raw);
      isInitialized = true;
    }
  } catch {}
} else if (Platform.OS !== "web") {
  try {
    loadQueueFromDisk()
      .then((q) => {
        syncQueue = q || [];
        isInitialized = true;
        notifyQueueListeners();
      })
      .catch(() => {});
  } catch {}
}

export function getSyncQueue(): SyncAction[] {
  return [...syncQueue];
}

export function getPendingSyncCount(): number {
  return syncQueue.length;
}

export async function enqueueSyncAction(
  type: SyncActionType,
  payload: any,
  localId?: string
): Promise<SyncAction> {
  if (!isInitialized) {
    const fromDisk = await loadQueueFromDisk();
    if (fromDisk.length > 0 && syncQueue.length === 0) {
      syncQueue = fromDisk;
    }
    isInitialized = true;
  }

  const action: SyncAction = {
    id: "sync_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8),
    type,
    payload,
    localId,
    createdAt: new Date().toISOString(),
  };

  syncQueue.push(action);
  await saveQueueToDisk(syncQueue);
  notifyQueueListeners();

  // 0ms INSTANT BACKGROUND FLUSH — sync immediately if online without waiting for interval
  if (runnerReqFn && runnerIdMap && !isSyncing) {
    processSyncQueue(runnerReqFn, runnerIdMap, runnerUpdateCacheFn || undefined).catch(() => {});
  }

  return action;
}

export function triggerOfflineSyncImmediate() {
  if (runnerReqFn && runnerIdMap && !isSyncing && syncQueue.length > 0) {
    processSyncQueue(runnerReqFn, runnerIdMap, runnerUpdateCacheFn || undefined).catch(() => {});
  }
}

export async function clearSyncQueue() {
  syncQueue = [];
  await saveQueueToDisk([]);
  notifyQueueListeners();
}

/**
 * Sequential queue processor with temporary-to-cloud ID resolution.
 */
export async function processSyncQueue(
  reqFn: (path: string, opts?: RequestInit, auth?: boolean) => Promise<any>,
  idMap: Record<string, string>,
  updateCacheFn?: (type: SyncActionType, localId: string | undefined, realObj: any) => void
): Promise<{ success: number; failed: number }> {
  if (isSyncing || syncQueue.length === 0) {
    return { success: 0, failed: 0 };
  }

  isSyncing = true;
  notifyQueueListeners();

  // 1. ATOMIC BULK BATCH SYNC: Upload all queued changes to cloud all at once in a single request
  const batchToSync = [...syncQueue];
  try {
    const batchRes = await reqFn("/sync/batch", {
      method: "POST",
      body: JSON.stringify({
        actions: batchToSync,
        client_timestamp: new Date().toISOString()
      }),
    });

    if (batchRes && batchRes.ok) {
      if (batchRes.id_map) {
        Object.assign(idMap, batchRes.id_map);
      }
      syncQueue = [];
      await saveQueueToDisk([]);
      isSyncing = false;
      notifyQueueListeners();
      return { success: batchToSync.length, failed: 0 };
    }
  } catch (batchErr: any) {
    console.warn("[SyncQueue] Batch sync endpoint unavailable or failed, attempting sequential replay:", batchErr?.message);
  }

  let successCount = 0;
  let failCount = 0;

  try {
    while (syncQueue.length > 0) {
      const action = syncQueue[0];
      const payload = { ...(action.payload || {}) };

      try {
        let res: any = null;

        switch (action.type) {
          case "CREATE_CATEGORY": {
            res = await reqFn("/categories", {
              method: "POST",
              body: JSON.stringify({
                name: payload.name,
                sort_order: payload.sort_order,
              }),
            });
            if (res && res.id && action.localId) {
              idMap[action.localId] = res.id;
              if (updateCacheFn) updateCacheFn("CREATE_CATEGORY", action.localId, res);
            }
            break;
          }

          case "DELETE_CATEGORY": {
            const catId = idMap[payload.id] || payload.id;
            res = await reqFn(`/categories/${catId}`, { method: "DELETE" });
            break;
          }

          case "CREATE_MENU_ITEM": {
            const mappedCatId = idMap[payload.category_id] || payload.category_id;
            res = await reqFn("/menu-items", {
              method: "POST",
              body: JSON.stringify({
                ...payload,
                category_id: mappedCatId,
              }),
            });
            if (res && res.id && action.localId) {
              idMap[action.localId] = res.id;
              if (updateCacheFn) updateCacheFn("CREATE_MENU_ITEM", action.localId, res);
            }
            break;
          }

          case "UPDATE_MENU_ITEM": {
            const itemId = idMap[payload.id] || payload.id;
            const mappedCatId = payload.category_id
              ? idMap[payload.category_id] || payload.category_id
              : undefined;
            const updatePayload = { ...payload };
            if (mappedCatId) updatePayload.category_id = mappedCatId;
            delete updatePayload.id;

            res = await reqFn(`/menu-items/${itemId}`, {
              method: "PATCH",
              body: JSON.stringify(updatePayload),
            });
            break;
          }

          case "DELETE_MENU_ITEM": {
            const itemId = idMap[payload.id] || payload.id;
            res = await reqFn(`/menu-items/${itemId}`, { method: "DELETE" });
            break;
          }

          case "CREATE_TABLE": {
            res = await reqFn("/tables", {
              method: "POST",
              body: JSON.stringify({
                label: payload.label,
                seats: payload.seats,
              }),
            });
            if (res && res.id && action.localId) {
              idMap[action.localId] = res.id;
              if (updateCacheFn) updateCacheFn("CREATE_TABLE", action.localId, res);
            }
            break;
          }

          case "DELETE_TABLE": {
            const tableId = idMap[payload.id] || payload.id;
            res = await reqFn(`/tables/${tableId}`, { method: "DELETE" });
            break;
          }

          case "UPDATE_TABLE": {
            const tableId = idMap[payload.id] || payload.id;
            const { id, ...rest } = payload;
            res = await reqFn(`/tables/${tableId}`, {
              method: "PUT",
              body: JSON.stringify(rest),
            });
            break;
          }

          case "SAVE_RESTAURANT": {
            res = await reqFn("/restaurant", {
              method: "POST",
              body: JSON.stringify(payload),
            });
            break;
          }

          case "CREATE_ORDER": {
            res = await reqFn("/orders", {
              method: "POST",
              body: JSON.stringify(payload),
            });
            if (res && res.id && action.localId) {
              idMap[action.localId] = res.id;
              if (updateCacheFn) updateCacheFn("CREATE_ORDER", action.localId, res);
            }
            break;
          }

          case "UPDATE_ORDER": {
            const orderId = idMap[payload.id] || payload.id;
            const updatePayload = { ...payload };
            delete updatePayload.id;
            res = await reqFn(`/orders/${orderId}`, {
              method: "PATCH",
              body: JSON.stringify(updatePayload),
            });
            break;
          }

          case "UPDATE_ORDER_STATUS": {
            const orderId = idMap[payload.id] || payload.id;
            res = await reqFn(`/orders/${orderId}/status`, {
              method: "PATCH",
              body: JSON.stringify({ status: payload.status }),
            });
            break;
          }

          case "CREATE_BILL": {
            const mappedOrderId = payload.order_id
              ? idMap[payload.order_id] || payload.order_id
              : undefined;
            const mappedOrderIds = Array.isArray(payload.order_ids)
              ? payload.order_ids.map((oid: string) => idMap[oid] || oid)
              : mappedOrderId
              ? [mappedOrderId]
              : [];

            res = await reqFn("/bills", {
              method: "POST",
              body: JSON.stringify({
                ...payload,
                order_id: mappedOrderId,
                order_ids: mappedOrderIds,
              }),
            });
            if (res && res.id && action.localId) {
              idMap[action.localId] = res.id;
              if (updateCacheFn) updateCacheFn("CREATE_BILL", action.localId, res);
            }
            break;
          }

          case "MARK_BILL_PAID": {
            const billId = idMap[payload.id] || payload.id;
            res = await reqFn(`/bills/${billId}/pay`, {
              method: "PATCH",
              body: JSON.stringify({ payment_method: payload.payment_method || "UPI", discount: payload.discount || undefined }),
            });
            break;
          }

          case "SETTLE_TABLE": {
            const mappedOrderIds = Array.isArray(payload.order_ids)
              ? payload.order_ids.map((oid: string) => idMap[oid] || oid)
              : undefined;
            res = await reqFn("/bills/settle-table", {
              method: "POST",
              body: JSON.stringify({
                table_number: payload.table_number,
                payment_method: payload.payment_method || "UPI",
                order_ids: mappedOrderIds,
                total: payload.total,
                discount: payload.discount || undefined,
              }),
            });
            break;
          }

          case "OPEN_CASH_SESSION": {
            res = await reqFn("/cash-sessions/open", {
              method: "POST",
              body: JSON.stringify(payload),
            });
            if (res && res.id && action.localId) {
              idMap[action.localId] = res.id;
              if (updateCacheFn) updateCacheFn("OPEN_CASH_SESSION", action.localId, res);
            }
            break;
          }

          case "RECORD_CASH_MOVEMENT": {
            const mappedSessionId = payload.session_id
              ? idMap[payload.session_id] || payload.session_id
              : undefined;
            res = await reqFn("/cash-sessions/movement", {
              method: "POST",
              body: JSON.stringify({
                ...payload,
                session_id: mappedSessionId,
              }),
            });
            break;
          }

          case "CLOSE_CASH_SESSION": {
            res = await reqFn("/cash-sessions/close", {
              method: "POST",
              body: JSON.stringify(payload),
            });
            if (res && res.id && action.localId) {
              idMap[action.localId] = res.id;
              if (updateCacheFn) updateCacheFn("CLOSE_CASH_SESSION", action.localId, res);
            }
            break;
          }

          default:
            break;
        }

        // Successfully synced this action -> shift from queue
        syncQueue.shift();
        await saveQueueToDisk(syncQueue);
        successCount++;
        notifyQueueListeners();
      } catch (itemErr: any) {
        const msg = String(itemErr?.message || "").toLowerCase();
        const status = itemErr?.status;

        const isNetworkErr =
          !status &&
          (msg.includes("network") ||
           msg.includes("failed to fetch") ||
           msg.includes("offline") ||
           msg.includes("unavailable") ||
           msg.includes("connection") ||
           msg.includes("load failed"));

        // If server actually responded with HTTP status (4xx client rejection or handled), skip so queue doesn't lock
        const isClientError = status && status >= 400 && status < 500;
        (action as any)._retries = ((action as any)._retries || 0) + 1;

        if (
          isClientError ||
          msg.includes("already exists") ||
          msg.includes("not found") ||
          (action as any)._retries >= 3
        ) {
          console.warn(`[SyncQueue] Skipping invalid/expired action (${action.type}):`, msg || status);
          syncQueue.shift();
          await saveQueueToDisk(syncQueue);
          notifyQueueListeners();
          continue;
        }

        if (isNetworkErr) {
          // Genuinely offline: pause queue and exit
          console.warn(`[SyncQueue] Offline during ${action.type}. Will retry on reconnect:`, itemErr?.message);
          failCount++;
          break;
        }

        // Server responded with 500 or unknown error: advance after logging to prevent indefinite deadlock
        console.warn(`[SyncQueue] Action ${action.type} failed with server response:`, msg || status);
        syncQueue.shift();
        await saveQueueToDisk(syncQueue);
        notifyQueueListeners();
        continue;
      }
    }
  } finally {
    isSyncing = false;
    notifyQueueListeners();
  }

  return { success: successCount, failed: failCount };
}

/**
 * Checks if midnight sync should run (12:00 AM or new calendar day)
 */
function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function shouldRunMidnightSync(): Promise<boolean> {
  const today = getTodayDateString();
  let lastSyncDate = "";

  if (Platform.OS === "web" && typeof window !== "undefined") {
    try {
      lastSyncDate = window.localStorage.getItem(LAST_MIDNIGHT_SYNC_KEY) || "";
    } catch {}
  } else {
    try {
      lastSyncDate = (await AsyncStorage.getItem(LAST_MIDNIGHT_SYNC_KEY)) || "";
    } catch {}
  }

  if (lastSyncDate !== today) {
    return true;
  }
  return false;
}

async function markMidnightSyncComplete() {
  const today = getTodayDateString();
  if (Platform.OS === "web" && typeof window !== "undefined") {
    try {
      window.localStorage.setItem(LAST_MIDNIGHT_SYNC_KEY, today);
    } catch {}
    return;
  }
  try {
    await AsyncStorage.setItem(LAST_MIDNIGHT_SYNC_KEY, today);
  } catch {}
}

import { AppState } from "react-native";

/**
 * Starts the background sync listener for:
 * 1. Immediate automatic sync on internet reconnect (Web & Native)
 * 2. Automatic sync on app focus / foreground resume
 * 3. Fast background periodic flush (every 5 seconds when pending queue exists)
 * 4. 12:00 AM Midnight sync
 */
export function startOfflineSyncRunner(
  reqFn: (path: string, opts?: RequestInit, auth?: boolean) => Promise<any>,
  idMap: Record<string, string>,
  isLocalModeFn: () => boolean,
  updateCacheFn?: (type: SyncActionType, localId: string | undefined, realObj: any) => void
) {
  runnerReqFn = reqFn;
  runnerIdMap = idMap;
  if (updateCacheFn) runnerUpdateCacheFn = updateCacheFn;

  const triggerSync = async () => {
    try {
      if (syncQueue.length === 0 || isSyncing) return;
      await processSyncQueue(reqFn, idMap, updateCacheFn);
    } catch {}
  };

  const triggerMidnightSync = async () => {
    try {
      const isLocal = isLocalModeFn && isLocalModeFn();
      if (!isLocal) return;
      const shouldSync = await shouldRunMidnightSync();
      if (shouldSync) {
        console.log("[MidnightSync] Running scheduled 12:00 AM cloud synchronization...");
        const result = await processSyncQueue(reqFn, idMap, updateCacheFn);
        if (result && result.failed === 0) {
          await markMidnightSyncComplete();
        }
      }
    } catch {}
  };

  // 1. Web network reconnection & tab focus listeners: automatic instant silent sync
  if (Platform.OS === "web" && typeof window !== "undefined") {
    try {
      window.addEventListener("online", () => {
        console.log("[OfflineSync] Network reconnected — automatically uploading all offline data...");
        triggerSync().catch(() => {});
      });
      window.addEventListener("focus", () => {
        triggerSync().catch(() => {});
      });
    } catch {}
  }

  // 2. React Native AppState listener (Mobile): sync on foreground resume
  let appStateSub: any;
  try {
    appStateSub = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        triggerSync().catch(() => {});
      }
    });
  } catch {}

  // 3. Fast periodic auto-sync runner (every 2 seconds if pending items exist)
  const syncInterval = setInterval(() => {
    if (syncQueue.length > 0 && !isSyncing) {
      triggerSync().catch(() => {});
    }
  }, 2000);

  // 4. Periodic check for 12:00 AM Midnight scheduled cloud sync
  const midnightInterval = setInterval(() => {
    triggerMidnightSync().catch(() => {});
  }, 60000);

  // Immediate startup sync check
  setTimeout(() => {
    triggerSync().catch(() => {});
    triggerMidnightSync().catch(() => {});
  }, 500);

  return () => {
    try {
      clearInterval(syncInterval);
      clearInterval(midnightInterval);
      if (appStateSub?.remove) appStateSub.remove();
    } catch {}
  };
}
