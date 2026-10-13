import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { subscribeToSyncQueue, getPendingSyncCount, getSyncQueue, SyncAction } from "@/src/lib/offlineSync";
import { api } from "@/src/lib/api";
import { colors, radius, spacing } from "@/src/theme";
import { useTheme } from "@/src/context/ThemeContext";

export default function SyncStatusIndicator({ compact = false }: { compact?: boolean }) {
  const { theme, isDark } = useTheme();
  const [pendingCount, setPendingCount] = useState<number>(() => getPendingSyncCount());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [syncSuccessToast, setSyncSuccessToast] = useState<boolean>(false);

  useEffect(() => {
    // 1. Subscribe to offline sync queue
    const unsubscribe = subscribeToSyncQueue((queue: SyncAction[], syncing: boolean) => {
      setPendingCount(queue.length);
      setIsSyncing(syncing);
      if (!syncing && queue.length === 0 && pendingCount > 0) {
        setSyncSuccessToast(true);
        setTimeout(() => setSyncSuccessToast(false), 3000);
      }
    });

    // 2. Network listener on Web
    if (Platform.OS === "web" && typeof window !== "undefined") {
      setIsOnline(window.navigator.onLine !== false);
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
      return () => {
        unsubscribe();
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }

    return () => unsubscribe();
  }, [pendingCount]);

  // Automatic sync when online and pending items exist
  useEffect(() => {
    if (isOnline && pendingCount > 0 && !isSyncing) {
      api.syncOfflineQueue().catch(() => {});
    }
  }, [isOnline, pendingCount, isSyncing]);

  const handleManualSync = async () => {
    if (isSyncing) return;
    try {
      await api.syncOfflineQueue();
    } catch {}
  };

  if (compact) {
    // Keep background sync running completely silent without any annoying badges or text
    return null;
  }

  // Non-compact view: completely clean and silent
  if (!isOnline) {
    return (
      <View style={[styles.pill, { backgroundColor: isDark ? "rgba(239, 68, 68, 0.12)" : "#FEF2F2", borderColor: isDark ? "rgba(239, 68, 68, 0.3)" : "#FECACA" }]}>
        <View style={[styles.dot, { backgroundColor: "#EF4444" }]} />
        <Text style={[styles.text, { color: "#DC2626" }]}>Offline Mode</Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  syncBtnBadge: {
    backgroundColor: "#D97706",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 2,
  },
  syncBtnText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
});
