import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { Platform, Vibration } from "react-native";
import * as Haptics from "expo-haptics";
import { storage } from "@/src/utils/storage";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/lib/api";

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
}

const NotificationContext = createContext<NotificationContextProps | undefined>(undefined);

const PREFS_KEY = "lumina_notification_preferences";
const SOUND_URL = "https://assets.mixkit.co/active_storage/sfx/2869/2869-200.wav";

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

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [banner, setBanner] = useState<Notification | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreferences>(defaultPrefs);

  const ws = useRef<WebSocket | null>(null);
  const audioPlayer = useRef<any>(null);
  const reconnectTimer = useRef<any>(null);

  useEffect(() => {
    loadPreferences();
  }, []);

  const registerForPushNotificationsAsync = async () => {
    if (Platform.OS === "web" || !Notifications) return;
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== "granted") {
        console.warn("Failed to get push token for notification!");
        return;
      }
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: "a99f95ae-d53d-4601-9b28-eb2305abab3e",
      });
      const pushToken = tokenData.data;
      if (pushToken) {
        await api.savePushToken(pushToken);
      }
    } catch (e) {
      console.warn("Error setting up expo-notifications:", e);
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
    const data = await storage.getItem<string>(PREFS_KEY, "");
    if (data) {
      try {
        setPreferences({ ...defaultPrefs, ...JSON.parse(data) });
      } catch {}
    }
  };

  const updatePreferences = async (newPrefs: Partial<NotificationPreferences>) => {
    const updated = { ...preferences, ...newPrefs };
    setPreferences(updated);
    await storage.setItem(PREFS_KEY, JSON.stringify(updated));
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
    if (ws.current) return;

    const base = (process.env.EXPO_PUBLIC_BACKEND_URL || "http://localhost:8000")
      .replace(/\/$/, "")
      .replace(/^http/, "ws");
    
    const wsUrl = `${base}/ws/${user.tenant_id}`;
    console.log("[WS] Connecting to:", wsUrl);
    
    const socket = new WebSocket(wsUrl);
    let pingInterval: any = null;

    const cleanup = () => {
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
    };

    socket.onopen = () => {
      console.log("[WS] Connected successfully");
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
      ws.current = null;
      if (user?.tenant_id) {
        reconnectTimer.current = setTimeout(connectWebSocket, 5000);
      }
    };

    socket.onerror = (e) => {
      console.warn("[WS] Socket error:", e);
      cleanup();
      socket.close();
    };

    ws.current = socket;
  };

  const disconnectWebSocket = () => {
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
  };

  const isQuietHours = (): boolean => {
    if (!preferences.quiet_hours) return false;
    try {
      const now = new Date();
      const currentMin = now.getHours() * 60 + now.getMinutes();

      const [sh, sm] = preferences.quiet_start.split(":").map(Number);
      const [eh, em] = preferences.quiet_end.split(":").map(Number);

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
    // 1. Check if category preference is enabled
    const enabled = preferences.categories[notif.category] ?? true;
    if (!enabled) return;

    // 2. Add to active states
    setNotifications((prev) => [notif, ...prev]);
    setUnreadCount((prev) => prev + 1);

    // 3. Show premium banner overlay
    setBanner(notif);

    // 4. Alert alerts sound & vibration (unless quiet hours are on)
    if (isQuietHours()) return;

    // 5. Trigger native OS heads-up drop-down notification (like WhatsApp)
    if (Platform.OS !== "web" && Notifications) {
      Notifications.scheduleNotificationAsync({
        content: {
          title: notif.title,
          body: notif.message,
          sound: preferences.sound_enabled ? "default" : undefined,
          badge: unreadCount + 1,
        },
        trigger: null,
      }).catch((e) => console.warn("Failed to schedule local notification:", e));
    }

    if (preferences.sound_enabled) {
      playSound();
    }
    if (preferences.vibration_enabled) {
      if (Platform.OS === "web") {
        try { window.navigator.vibrate(300); } catch {}
      } else {
        Vibration.vibrate(300);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      }
    }
  };

  const playSound = () => {
    if (Platform.OS === "web") {
      try {
        const audio = new window.Audio(SOUND_URL);
        audio.volume = 0.8;
        audio.play();
      } catch (e) {
        console.warn("Web notification audio failed:", e);
      }
    } else if (createAudioPlayer) {
      try {
        if (!audioPlayer.current) {
          audioPlayer.current = createAudioPlayer(SOUND_URL);
          audioPlayer.current.volume = 0.8;
        }
        audioPlayer.current.play();
      } catch (e) {
        console.warn("Native notification audio failed:", e);
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
        fetchNotifications
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
