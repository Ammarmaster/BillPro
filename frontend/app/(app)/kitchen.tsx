import { useCallback, useEffect, useState, useRef } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl, SafeAreaView, StatusBar, Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { useAudioPlayer } from "expo-audio";
import { api } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/theme";

type Order = {
  id: string;
  order_number?: string;
  table_number: string;
  items: { name: string; quantity: number; notes: string }[];
  status: string;
  subtotal: number;
  created_at: string;
  notes: string;
};

const NEXT: Record<string, string | null> = {
  placed: "in_kitchen",
  in_kitchen: "ready",
  ready: "served",
  served: null,
  cancelled: null,
};

const BUTTON_LABEL: Record<string, string> = {
  placed: "Start Cooking →",
  in_kitchen: "Mark Ready →",
  ready: "Mark Served →",
};

const BUTTON_BG: Record<string, string> = {
  placed: "#F59E0B",
  in_kitchen: "#635BFF",
  ready: "#10B981",
};

const BADGE_BG: Record<string, string> = {
  placed: "#FEF3C7",
  in_kitchen: "#ECEBFF",
  ready: "#DCFCE7",
};

const BADGE_TEXT: Record<string, string> = {
  placed: "#F59E0B",
  in_kitchen: "#635BFF",
  ready: "#10B981",
};

const STATUS_TEXT: Record<string, string> = {
  placed: "PENDING",
  in_kitchen: "COOKING",
  ready: "READY",
};

const CARD_BORDER: Record<string, string> = {
  placed: "#FDE68A",
  in_kitchen: "#C7D2FE",
  ready: "#FCA5A5",
};

import { useTheme } from "@/src/context/ThemeContext";

export default function Kitchen() {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  
  // Kitchen Alert Audio Engine (using official expo-audio hook)
  const [soundEnabled, setSoundEnabled] = useState(true);
  const isRingingRef = useRef(false);

  const player = useAudioPlayer("https://assets.mixkit.co/active_storage/sfx/2869/2869-200.wav", {
    loop: true,
  });

  // Load sound preference on mount
  useEffect(() => {
    if (Platform.OS === "web") {
      try {
        const val = window.localStorage.getItem("kitchen_sound_pref");
        if (val !== null) setSoundEnabled(val === "true");
      } catch {}
      return;
    }
    SecureStore.getItemAsync("kitchen_sound_pref").then(val => {
      if (val !== null) {
        setSoundEnabled(val === "true");
      }
    }).catch(() => {});
  }, []);

  const toggleSound = async () => {
    const nextVal = !soundEnabled;
    setSoundEnabled(nextVal);
    
    if (Platform.OS === "web") {
      try { window.localStorage.setItem("kitchen_sound_pref", String(nextVal)); } catch {}
    } else {
      await SecureStore.setItemAsync("kitchen_sound_pref", String(nextVal));
    }
    
    if (!nextVal && player) {
      try {
        player.pause();
        player.seek(0);
      } catch {}
    }
  };

  // Sync audio status based on active placed orders list changes
  useEffect(() => {
    const hasPlaced = orders.some(o => o.status === "placed");
    if (hasPlaced && soundEnabled) {
      if (!isRingingRef.current && player) {
        isRingingRef.current = true;
        try {
          player.play();
        } catch (e) {
          console.warn("Failed to play alert sound:", e);
        }
      }
    } else {
      if (isRingingRef.current && player) {
        isRingingRef.current = false;
        try {
          player.pause();
          player.seek(0);
        } catch (e) {
          console.warn("Failed to stop alert sound:", e);
        }
      }
    }
  }, [orders, soundEnabled, player]);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const o = await api.listOrders();
      setOrders(o.filter((x: Order) => x.status !== "served" && x.status !== "cancelled"));
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Live timer tick every 1s
  useEffect(() => {
    const iv = setInterval(() => { setNow(Date.now()); }, 1000);
    return () => clearInterval(iv);
  }, []);

  // Poll backend every 6s for background sync
  useEffect(() => {
    const iv = setInterval(load, 6000);
    return () => clearInterval(iv);
  }, [load]);

  // 0ms Optimistic Update + Haptics + Background Sync
  const advanceOptimistic = async (id: string, currentStatus: string) => {
    const next = NEXT[currentStatus];
    if (!next) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    // 1. INSTANT 0ms local state update (automatically stops sound if no pending orders remain)
    if (next === "served") {
      setOrders(prev => prev.filter(o => o.id !== id));
    } else {
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status: next } : o));
    }

    // 2. Background API sync
    try {
      await api.updateOrderStatus(id, next);
    } catch (e: any) {
      setErr(e.message);
      await load(); // revert on failure
    }
  };

  const getElapsedTimeStr = (created_at: string) => {
    if (!created_at) return "0s";
    try {
      const diffSec = Math.max(0, Math.floor((now - new Date(created_at).getTime()) / 1000));
      if (diffSec < 60) return `${diffSec}s`;
      const m = Math.floor(diffSec / 60);
      const s = diffSec % 60;
      return `${m}m ${s}s`;
    } catch { return "0s"; }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.surface }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.surface} />
      <View style={[styles.wrap, { paddingTop: insets.top, backgroundColor: theme.surface }]} testID="kitchen-screen">
        
        {/* Header with Sound Toggle and LIVE status */}
        <View style={styles.header}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <Text style={[styles.title, { color: theme.onSurface }]}>Kitchen Display</Text>
            <Pressable onPress={toggleSound} style={styles.soundBtn} hitSlop={12}>
              <Ionicons
                name={soundEnabled ? "volume-high-outline" : "volume-mute-outline"}
                size={22}
                color={soundEnabled ? "#FF5E2B" : "#64748B"}
              />
            </Pressable>
          </View>
          
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color="#635BFF" /></View>
        ) : orders.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="checkmark-done-circle" size={64} color="#10B981" />
            <Text style={[styles.emptyTitle, { color: theme.onSurface }]}>All Caught Up</Text>
            <Text style={[styles.emptySub, { color: theme.onSurfaceSecondary }]}>No pending tickets in kitchen.</Text>
          </View>
        ) : (
          <FlatList
            data={orders}
            keyExtractor={(o, idx) => `${o.id}-${idx}`}
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl tintColor="#635BFF" refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
            renderItem={({ item }) => {
              const orderNum = item.order_number || item.id.slice(-2);
              const statusKey = item.status in STATUS_TEXT ? item.status : "placed";
              const nextStatus = NEXT[item.status];
              const elapsedTime = getElapsedTimeStr(item.created_at);

              return (
                <Animated.View entering={FadeInDown.springify()} style={[styles.ticketCard, { backgroundColor: theme.surfaceSecondary, borderColor: CARD_BORDER[statusKey] || "#FCA5A5" }]} testID={`ticket-${item.id}`}>
                  
                  {/* Card Header Row */}
                  <View style={styles.cardHeaderRow}>
                    <View style={styles.leftNumBox}>
                      <Text style={[styles.orderNum, { color: theme.onSurface }]}>#{orderNum}</Text>
                      <View style={[styles.statusPill, { backgroundColor: BADGE_BG[statusKey] || "#FEF3C7" }]}>
                        <Text style={[styles.statusText, { color: BADGE_TEXT[statusKey] || "#F59E0B" }]}>
                          {STATUS_TEXT[statusKey] || "PENDING"}
                        </Text>
                      </View>
                    </View>

                    {/* Live Timer */}
                    <View style={styles.timerBox}>
                      <Ionicons name="time-outline" size={15} color={theme.onSurfaceSecondary} />
                      <Text style={[styles.timerText, { color: theme.onSurfaceSecondary }]}>{elapsedTime}</Text>
                    </View>
                  </View>

                  <Text style={[styles.tableName, { color: theme.onSurfaceSecondary }]}>Table {item.table_number}</Text>

                  {/* Items List */}
                  <View style={styles.itemsList}>
                    {item.items.map((it, idx) => (
                      <View key={idx} style={styles.itemRow}>
                        <Text style={styles.itemQty}>{it.quantity}×</Text>
                        <Text style={[styles.itemName, { color: theme.onSurface }]}>{it.name}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Action Button */}
                  {nextStatus && (
                    <Pressable
                      style={[styles.actionBtn, { backgroundColor: BUTTON_BG[statusKey] || colors.brand }]}
                      onPress={() => advanceOptimistic(item.id, item.status)}
                      testID={`ticket-advance-${item.id}`}
                    >
                      <Text style={styles.actionBtnText}>{BUTTON_LABEL[statusKey] || "Advance Order →"}</Text>
                    </Pressable>
                  )}

                </Animated.View>
              );
            }}
          />
        )}

        {err && <Text style={styles.err} testID="kitchen-error">{err}</Text>}

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  wrap: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  title: { color: colors.onSurface, fontSize: 26, fontWeight: "900" },
  soundBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
  },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#FEE2E2", paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#EF4444" },
  liveText: { color: "#EF4444", fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.xs },
  emptyTitle: { color: colors.onSurface, fontSize: 22, fontWeight: "800", marginTop: spacing.sm },
  emptySub: { color: colors.onSurfaceSecondary, fontSize: 14 },
  ticketCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "rgba(0,0,0,0.03)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 3,
  },
  cardHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  leftNumBox: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  orderNum: { color: colors.onSurface, fontSize: 22, fontWeight: "900" },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  statusText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  timerBox: { flexDirection: "row", alignItems: "center", gap: 4 },
  timerText: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "700" },
  tableName: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 4, fontWeight: "500" },
  itemsList: { marginVertical: spacing.md, gap: 6 },
  itemRow: { flexDirection: "row", alignItems: "center" },
  itemQty: { color: "#635BFF", fontSize: 15, fontWeight: "800", width: 28 },
  itemName: { color: colors.onSurface, fontSize: 15, fontWeight: "600", flex: 1 },
  actionBtn: {
    paddingVertical: 14,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  actionBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800", letterSpacing: 0.3 },
  err: { color: colors.onError, backgroundColor: colors.error, margin: spacing.lg, padding: spacing.md, borderRadius: radius.md },
});
