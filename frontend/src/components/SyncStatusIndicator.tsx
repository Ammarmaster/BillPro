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

  if (pendingCount === 0 && isOnline && !syncSuccessToast) {
    if (compact) return null;
    return (
      <View style={[styles.pill, { backgroundColor: isDark ? "rgba(16, 185, 129, 0.12)" : "#ECFDF5", borderColor: isDark ? "rgba(16, 185, 129, 0.3)" : "#A7F3D0" }]}>
        <View style={[styles.dot, { backgroundColor: "#10B981" }]} />
        <Text style={[styles.text, { color: "#059669" }]}>Online & Synced</Text>
      </View>
    );
  }

  if (syncSuccessToast) {
    return (
      <View style={[styles.pill, { backgroundColor: "#ECFDF5", borderColor: "#6EE7B7" }]}>
        <Ionicons name="checkmark-circle" size={14} color="#10B981" />
        <Text style={[styles.text, { color: "#059669", fontWeight: "800" }]}>All Changes Synced!</Text>
      </View>
    );
  }

  if (isSyncing) {
    return (
      <View style={[styles.pill, { backgroundColor: isDark ? "rgba(99, 91, 255, 0.15)" : "#EEF2FF", borderColor: isDark ? "rgba(99, 91, 255, 0.35)" : "#C7D2FE" }]}>
        <ActivityIndicator size="small" color="#635BFF" style={{ transform: [{ scale: 0.75 }] }} />
        <Text style={[styles.text, { color: "#635BFF", fontWeight: "800" }]}>
          Syncing {pendingCount > 0 ? `(${pendingCount})` : ""}...
        </Text>
      </View>
    );
  }

  if (!isOnline || pendingCount > 0) {
    return (
      <Pressable
        onPress={handleManualSync}
        style={({ pressed }) => [
          styles.pill,
          {
            backgroundColor: isDark ? "rgba(245, 158, 11, 0.15)" : "#FFFBEB",
            borderColor: isDark ? "rgba(245, 158, 11, 0.35)" : "#FDE68A",
            opacity: pressed ? 0.75 : 1,
          },
        ]}
      >
        <Ionicons name={isOnline ? "cloud-upload-outline" : "cloud-offline"} size={14} color="#D97706" />
        <Text style={[styles.text, { color: "#B45309", fontWeight: "800" }]}>
          {!isOnline ? "Offline" : "Pending Sync"} {pendingCount > 0 ? `(${pendingCount})` : ""}
        </Text>
        {isOnline && pendingCount > 0 && (
          <View style={styles.syncBtnBadge}>
            <Text style={styles.syncBtnText}>Sync Now</Text>
          </View>
        )}
      </Pressable>
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
