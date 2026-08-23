import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { Platform, Vibration, Alert } from "react-native";
import * as Haptics from "expo-haptics";
import { storage } from "@/src/utils/storage";
import { useAuth } from "@/src/context/AuthContext";
import { api, clearCachePrefix } from "@/src/lib/api";

let Notifications: any = null;
if (Platform.OS !== "web") {
  try {
    Notifications = require("expo-notifications");
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  } catch (e) {
    console.warn("Failed to load expo-notifications:", e);
  }
}

let createAudioPlayer: any = null;
try {
  createAudioPlayer = require("expo-audio").createAudioPlayer;
} catch {}

export interface Notification {
  id: string;
  category: "sales" | "kitchen" | "waiter" | "cashier" | "system" | "payment";
  title: string;
  message: string;
  data?: any;
  is_read: boolean;
  created_at: string;
}

export interface NotificationPreferences {
  sound_enabled: boolean;
  vibration_enabled: boolean;
  categories: {
    sales: boolean;
    kitchen: boolean;
    waiter: boolean;
    cashier: boolean;
    system: boolean;
    payment: boolean;
  };
  quiet_hours: boolean;
  quiet_start: string; // "22:00"
  quiet_end: string;   // "07:00"
}

interface NotificationContextProps {
  notifications: Notification[];
  unreadCount: number;
  banner: Notification | null;
  preferences: NotificationPreferences;
  dismissBanner: () => void;
  updatePreferences: (prefs: Partial<NotificationPreferences>) => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  deleteNotif: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
  fetchNotifications: () => Promise<void>;
  subscribe: (listener: (notif: Notification) => void) => () => void;
}

const NotificationContext = createContext<NotificationContextProps | undefined>(undefined);

const PREFS_KEY = "lumina_notification_preferences";
const BACKEND_BASE = (process.env.EXPO_PUBLIC_BACKEND_URL && !process.env.EXPO_PUBLIC_BACKEND_URL.includes("0.0.0.0") ? process.env.EXPO_PUBLIC_BACKEND_URL : "https://billpro-wulv.onrender.com").replace(/\/$/, "");
const KITCHEN_ALERT_SOUND_URL = `${BACKEND_BASE}/static/sounds/kitchen-alert.wav`;
const PAYMENT_MONEY_SOUND_URL = `${BACKEND_BASE}/static/sounds/payment-money.wav`;
const GENERAL_NOTIFICATION_SOUND_URL = `${BACKEND_BASE}/static/sounds/notification.wav`;


const defaultPrefs: NotificationPreferences = {
  sound_enabled: true,
  vibration_enabled: true,
  categories: {
    sales: true,
    kitchen: true,
    waiter: true,
    cashier: true,
    system: true,
    payment: true
  },
  quiet_hours: false,
  quiet_start: "22:00",
  quiet_end: "07:00"
};

const getRoleDefaultPrefs = (role: string | undefined): NotificationPreferences => {
  return {
    sound_enabled: true,
    vibration_enabled: true,
    categories: {
      sales: role ? ["owner", "manager", "cashier"].includes(role) : true,
      kitchen: true, // Default ON for all roles (waiter, owner, kitchen, cashier)
      waiter: role ? ["waiter", "manager", "owner"].includes(role) : true,
      cashier: role ? ["cashier", "manager", "owner"].includes(role) : true,
      system: true,
      payment: role ? ["owner", "manager", "cashier"].includes(role) : true,
    },
    quiet_hours: false,
    quiet_start: "22:00",
    quiet_end: "07:00"
  };
};

const processedEventIds = new Set<string>();
const processedOrderCreatedIds = new Set<string>();
const processedPaymentIds = new Set<string>();

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [banner, setBanner] = useState<Notification | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreferences>(defaultPrefs);

  const preferencesRef = useRef<NotificationPreferences>(preferences);
  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);

  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const ws = useRef<WebSocket | null>(null);
  const isConnectingRef = useRef(false);
  const backoffAttemptsRef = useRef(0);
  const audioPlayer = useRef<any>(null);
  const reconnectTimer = useRef<any>(null);
  const listeners = useRef<Set<(notif: Notification) => void>>(new Set());

  const subscribe = useCallback((listener: (notif: Notification) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    loadPreferences();
    if (Platform.OS !== "web" && createAudioPlayer) {
      try {
        console.log("[Audio] Preloading notification sound player...");
        audioPlayer.current = createAudioPlayer(GENERAL_NOTIFICATION_SOUND_URL);
      } catch (e) {
        console.warn("[Audio] Failed to initialize preloaded player:", e);
      }
    }
  }, [user]);

  const hasRegisteredPushRef = useRef(false);
  const registerForPushNotificationsAsync = async () => {
    if (Platform.OS === "web") return;
    if (hasRegisteredPushRef.current) return;
    if (!Notifications) {
      console.warn("Notifications module is null! Expo-notifications is not compiled in the native build.");
      return;
    }
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== "granted") {
        return;
      }
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: "a99f95ae-d53d-4601-9b28-eb2305abab3e",
      }).catch((e: any) => {
        console.warn("Expo push token get error (non-fatal):", e?.message);
        return null;
      });
      const pushToken = tokenData?.data;
      if (pushToken) {
        hasRegisteredPushRef.current = true;
        await api.savePushToken(pushToken).catch(() => {});
      }
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "Default Alerts",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#FF5E2B",
          sound: "default",
        }).catch(() => {});
      }
    } catch (e: any) {
      console.warn("Error setting up expo-notifications (non-fatal):", e?.message);
    }
  };

  useEffect(() => {
    if (user?.tenant_id) {
      fetchNotifications();
      connectWebSocket();
      registerForPushNotificationsAsync();
    } else {
      disconnectWebSocket();
      setNotifications([]);
      setUnreadCount(0);
    }

    return () => {
      disconnectWebSocket();
    };
  }, [user]);

  const loadPreferences = async () => {
    const key = user ? `${PREFS_KEY}_${user.id}` : PREFS_KEY;
    const data = await storage.getItem<string>(key, "");
    const roleDefault = getRoleDefaultPrefs(user?.role);
    let loaded = roleDefault;
    if (data) {
      try {
        loaded = { ...roleDefault, ...JSON.parse(data) };
      } catch {
        loaded = roleDefault;
      }
    } else {
      loaded = roleDefault;
    }
    setPreferences(loaded);
    console.log("[KITCHEN SOUND] Loaded preference:", loaded.sound_enabled && (loaded.categories.kitchen ?? true));
  };

  const updatePreferences = async (newPrefs: Partial<NotificationPreferences>) => {
    const prev = preferences.sound_enabled && (preferences.categories.kitchen ?? true);
    const updated = { ...preferences, ...newPrefs };
    const next = updated.sound_enabled && (updated.categories.kitchen ?? true);

    console.log("[KITCHEN SOUND] Toggle clicked");
    console.log("[KITCHEN SOUND] Previous:", prev);
    console.log("[KITCHEN SOUND] New:", next);

    setPreferences(updated);
    const key = user ? `${PREFS_KEY}_${user.id}` : PREFS_KEY;
    await storage.setItem(key, JSON.stringify(updated));
  };

  const fetchNotifications = async () => {
    try {
      const list = await api.listNotifications();
      setNotifications(list);
      setUnreadCount(list.filter((n: any) => !n.is_read).length);
    } catch (e) {
      console.warn("Failed to load notifications:", e);
    }
  };

  const connectWebSocket = () => {
    if (!user || !user.tenant_id) return;
    if (ws.current || isConnectingRef.current) return;
    isConnectingRef.current = true;

    const base = BACKEND_BASE
      .replace(/\/$/, "")
      .replace(/^http/, "ws");
    
    const wsUrl = `${base}/ws/${user.tenant_id}`;
    console.log("[WS] Connecting to:", wsUrl);
    
    const socket = new WebSocket(wsUrl);
    ws.current = socket;
    let pingInterval: any = null;

    const cleanup = () => {
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
    };

    socket.onopen = () => {
      console.log("[WS] Connected successfully");
      isConnectingRef.current = false;
      backoffAttemptsRef.current = 0;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      
      // Keep connection active with 20s heartbeat ping
      pingInterval = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send("ping");
        }
      }, 20000);
    };

    socket.onmessage = (event) => {
      try {
        if (event.data === "pong") return;
        const notif: Notification = JSON.parse(event.data);
        handleIncomingNotification(notif);
      } catch (e) {
        console.warn("[WS] Error parsing websocket message:", e);
      }
    };

    socket.onclose = () => {
      console.log("[WS] Connection closed");
      cleanup();
      isConnectingRef.current = false;
      ws.current = null;
      if (userRef.current?.tenant_id) {
        backoffAttemptsRef.current += 1;
        const delay = Math.min(15000, 1000 * Math.pow(2, backoffAttemptsRef.current - 1));
        console.log(`[WS] Reconnecting in ${delay}ms...`);
        reconnectTimer.current = setTimeout(connectWebSocket, delay);
      }
    };

    socket.onerror = (e) => {
      console.warn("[WS] Socket error:", e);
      cleanup();
      isConnectingRef.current = false;
      try { socket.close(); } catch {}
    };
  };

  const disconnectWebSocket = () => {
    isConnectingRef.current = false;
    backoffAttemptsRef.current = 0;
    if (ws.current) {
      try { ws.current.close(); } catch {}
      ws.current = null;
    }
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
  };

  const isQuietHours = (): boolean => {
    const currentPrefs = preferencesRef.current;
    if (!currentPrefs.quiet_hours) return false;
    try {
      const now = new Date();
      const currentMin = now.getHours() * 60 + now.getMinutes();

      const [sh, sm] = currentPrefs.quiet_start.split(":").map(Number);
      const [eh, em] = currentPrefs.quiet_end.split(":").map(Number);

      const startMin = sh * 60 + sm;
      const endMin = eh * 60 + em;

      if (startMin < endMin) {
        return currentMin >= startMin && currentMin <= endMin;
      } else {
        // Quiet hours cross midnight
        return currentMin >= startMin || currentMin <= endMin;
      }
    } catch {
      return false;
    }
  };

  const handleIncomingNotification = (notif: Notification) => {
    const currentPrefs = preferencesRef.current;
    
    // Deduplication check to prevent duplicate order / billing / UI alerts
    if (processedEventIds.has(notif.id)) {
      console.log("[WS] Ignored duplicate event:", notif.id);
      return;
    }
    processedEventIds.add(notif.id);
    if (processedEventIds.size > 200) {
      const first = processedEventIds.values().next().value;
      if (first !== undefined) processedEventIds.delete(first);
    }

    // Direct Real-Time Cache Updates (0ms latency, NO full API refresh)
    const data = notif.data;
    if (data) {
      const eventName = data.event || notif.category;
      
      // 1. Inject order directly if present
      if (data.order) {
        api.injectCachedOrder(data.order);
        
        // Mark corresponding table status as occupied instantly
        if (data.table_number) {
          const tList = api.getCachedTables() || [];
          const updated = tList.map((t: any) => 
            String(t.label).toLowerCase().trim() === String(data.table_number).toLowerCase().trim()
              ? { ...t, status: "occupied" }
              : t
          );
          api.setCachedTables(updated);
          api.notifyCacheUpdate("/tables", updated);
        }

        // Automatic instant KOT thermal print ONLY on initial order placement / creation
        const isNewOrderCreation = 
          eventName === "order.created" || 
          eventName === "order.confirmed" || 
          eventName === "ORDER_CREATED" ||
          notif.title === "New KOT Placed" ||
          notif.title === "Order Confirmed" ||
          notif.title === "New Order Placed";

        const isPlacedStatus = 
          data.order?.status === "placed" || 
          data.order?.status === "new" || 
          !data.order?.status;

        const isStatusChange = 
          eventName === "ORDER_STATUS_CHANGED" ||
          eventName === "order.status_changed" ||
          notif.title === "Order Status Updated" ||
          (notif.title && notif.title.includes("now IN KITCHEN")) ||
          (notif.title && notif.title.includes("now READY")) ||
          (notif.title && notif.title.includes("now SERVED"));

        const isPendingScan = data.order?.status === "pending_scan";
        const hasItems = Array.isArray(data.order?.items) && data.order.items.length > 0;

        if (isNewOrderCreation && isPlacedStatus && !isStatusChange && !isPendingScan && hasItems && data.order) {
          (async () => {
            try {
              const { getPrinterSettings, printKitchenKOT } = require("@/src/lib/print");
              const kSettings = await getPrinterSettings("kitchen");
              const cSettings = await getPrinterSettings("cashier");
              const shouldPrint = (kSettings && kSettings.type !== "none" && kSettings.auto_print) ||
                                  (cSettings && cSettings.type !== "none" && cSettings.auto_print);
              if (shouldPrint) {
                await printKitchenKOT(data.order);
              }
            } catch (pErr) {
              console.warn("WebSocket KOT auto-print error:", pErr);
            }
          })();
        }
      }

      // 2. Inject bill directly if present
      if (data.bill) {
        api.injectCachedBill(data.bill);
      }

      // 3. Handle order status updates in cache directly
      if (data.order_id && data.status) {
        api.updateOrderStatusInCache(data.order_id, data.status);
        
        // Also update table to Available if no active orders remain
        if (data.active_orders_remaining === 0 && data.table_number) {
          const tList = api.getCachedTables() || [];
          const updated = tList.map((t: any) => 
            String(t.label).toLowerCase().trim() === String(data.table_number).toLowerCase().trim()
              ? { ...t, status: "available" }
              : t
          );
          api.setCachedTables(updated);
          api.notifyCacheUpdate("/tables", updated);
        }
      }

      // 4. Settle tables in cache directly
      if (eventName === "TABLE_SETTLED") {
        api.settleTableInCache(data.table_number);
      }

      // 5. Instantly increment dashboard totals on payment / creation
      if (eventName === "order.created") {
        const orderId = data.order_id || (data.order && data.order.id);
        if (orderId && !processedOrderCreatedIds.has(orderId)) {
          processedOrderCreatedIds.add(orderId);
          if (processedOrderCreatedIds.size > 200) {
            const first = processedOrderCreatedIds.values().next().value;
            if (first !== undefined) processedOrderCreatedIds.delete(first);
          }
          const summary = api.getCachedSummary();
          if (summary) {
            summary.orders_total = (summary.orders_total || 0) + 1;
            summary.orders_open = (summary.orders_open || 0) + 1;
            api.setCachedSummary({ ...summary });
            api.notifyCacheUpdate("/dashboard/summary", summary);
          }
        }
      }
      if (data.status === "served" || data.status === "paid" || eventName === "ORDER_PAID" || eventName === "TABLE_SETTLED" || notif.category === "payment") {
        const paidAmt = Number(data.total || data.bill?.total || 0);
        const billOrOrderId = data.bill_id || data.order_id || (data.bill && data.bill.id) || (data.table_number ? `tbl_${data.table_number}_${paidAmt}_${Date.now()}` : null);
        
        if (data.bill) {
          api.injectCachedBill(data.bill);
        }

        if (data.table_number && (data.active_orders_remaining === 0 || data.table_status === "AVAILABLE")) {
          api.settleTableInCache(data.table_number);
        }

        if (billOrOrderId && !processedPaymentIds.has(billOrOrderId)) {
          processedPaymentIds.add(billOrOrderId);
          if (processedPaymentIds.size > 200) {
            const first = processedPaymentIds.values().next().value;
            if (first !== undefined) processedPaymentIds.delete(first);
          }
          clearCachePrefix("/dashboard");
          clearCachePrefix("/bills");
          api.dashboardSummary().catch(() => {});
        }
      }
    }

    // Notify all active screen subscribers immediately
    listeners.current.forEach(fn => {
      try { fn(notif); } catch (e) { console.warn("Listener notification error:", e); }
    });

    if (notif.category === "kitchen") {
      console.log("\n[DEVICE ALERT] NEW_ORDER RECEIVED");
      console.log("[KITCHEN SOUND] Current enabled state:", currentPrefs.sound_enabled && (currentPrefs.categories.kitchen ?? true));
    }

    // 1. Check if category preference is enabled
    const enabled = currentPrefs.categories[notif.category] ?? true;
    if (!enabled) return;

    // 2. Add to active states
    setNotifications((prev) => [notif, ...prev]);
    setUnreadCount((prev) => prev + 1);

    // 3. Show premium banner overlay
    setBanner(notif);

    // 4. Alert alerts sound & vibration (unless quiet hours are on)
    if (isQuietHours()) return;

    if (Platform.OS !== "web" && Notifications) {
      Notifications.scheduleNotificationAsync({
        content: {
          title: notif.title,
          body: notif.message,
          sound: currentPrefs.sound_enabled ? "default" : undefined,
          badge: unreadCount + 1,
          android: {
            channelId: "default",
          },
        },
        trigger: null,
      }).catch((e: any) => console.warn("Failed to schedule local notification:", e));
    }

    if (currentPrefs.sound_enabled) {
      playSound(notif);
    }
    if (currentPrefs.vibration_enabled) {
      if (Platform.OS === "web") {
        try {
          if (typeof window !== "undefined" && window.navigator && typeof window.navigator.vibrate === "function") {
            // Only trigger if user has interacted with document
            if ((window.navigator as any).userActivation ? (window.navigator as any).userActivation.hasBeenActive : true) {
              window.navigator.vibrate(300);
            }
          }
        } catch {}
      } else {
        Vibration.vibrate(300);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      }
    }
  };

  const playSound = (notif?: Notification) => {
    let targetSoundUrl = GENERAL_NOTIFICATION_SOUND_URL;

    if (notif) {
      const isNewOrder = notif.category === "kitchen" && (
        notif.title.toLowerCase().includes("new") ||
        notif.title.toLowerCase().includes("placed") ||
        notif.data?.status === "placed" ||
        notif.data?.action === "new_order"
      );

      const isPayment = notif.category === "payment" ||
        notif.title.toLowerCase().includes("payment") ||
        notif.title.toLowerCase().includes("paid") ||
        notif.data?.status === "paid";

      if (isPayment) {
        targetSoundUrl = PAYMENT_MONEY_SOUND_URL;
      } else if (isNewOrder) {
        targetSoundUrl = KITCHEN_ALERT_SOUND_URL;
      } else {
        targetSoundUrl = GENERAL_NOTIFICATION_SOUND_URL;
      }
    }

    if (Platform.OS === "web") {
      try {
        const audio = new window.Audio(targetSoundUrl);
        audio.volume = 1.0;
        const p = audio.play();
        if (p && typeof p.then === "function") {
          p.then(() => {
            console.log("[ALERT SOUND] Single playback completed successfully");
          }).catch((err: any) => {
            if (err?.name === "NotAllowedError") {
              console.log("[ALERT SOUND] Autoplay paused until first user touch/click interaction on page.");
            } else {
              console.warn("[ALERT SOUND] Playback issue:", err);
            }
          });
        } else {
          console.log("[ALERT SOUND] Single playback started");
        }
      } catch (e: any) {
        console.warn("[ALERT SOUND] Audio error:", e);
      }
    } else {
      try {
        if (createAudioPlayer) {
          const nativePlayer = createAudioPlayer(targetSoundUrl);
          nativePlayer.play();
          console.log("[ALERT SOUND] Single playback started (native)");
        }
      } catch (e: any) {
        console.warn("[ALERT SOUND] Error:", e);
      }
    }
  };

  const dismissBanner = () => {
    setBanner(null);
  };

  const markAsRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await api.readNotification(id);
    } catch {}
  };

  const markAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
    try {
      await api.readAllNotifications();
    } catch {}
  };

  const deleteNotif = async (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    try {
      await api.deleteNotification(id);
      fetchNotifications();
    } catch {}
  };

  const clearAll = async () => {
    setNotifications([]);
    setUnreadCount(0);
    try {
      await api.clearNotifications();
    } catch {}
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        banner,
        preferences,
        dismissBanner,
        updatePreferences,
        markAsRead,
        markAllRead,
        deleteNotif,
        clearAll,
        fetchNotifications,
        subscribe
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
};
