import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/theme";

type Order = {
  id: string;
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
const LABEL: Record<string, string> = {
  placed: "Start Cooking",
  in_kitchen: "Mark Ready",
  ready: "Mark Served",
};
const BG: Record<string, string> = {
  placed: colors.surfaceSecondary,
  in_kitchen: colors.warning,
  ready: colors.success,
  served: colors.surfaceTertiary,
  cancelled: colors.error,
};

export default function Kitchen() {
  const insets = useSafeAreaInsets();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const o = await api.listOrders();
      // active only in KDS
      setOrders(o.filter((x: Order) => x.status !== "served" && x.status !== "cancelled"));
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    const iv = setInterval(load, 6000);
    return () => clearInterval(iv);
  }, [load]);

  const advance = async (id: string, status: string) => {
    const next = NEXT[status];
    if (!next) return;
    try {
      await api.updateOrderStatus(id, next);
      await load();
    } catch (e: any) { setErr(e.message); }
  };

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]} testID="kitchen-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Kitchen</Text>
        <Text style={styles.count}>{orders.length} active</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : orders.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="checkmark-done-circle" size={60} color={colors.brand} />
          <Text style={styles.emptyTitle}>All Caught Up</Text>
          <Text style={styles.emptySub}>No pending tickets.</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={o => o.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md }}
          refreshControl={<RefreshControl tintColor={colors.brand} refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          renderItem={({ item }) => (
            <View style={[styles.ticket, { backgroundColor: BG[item.status] }]} testID={`ticket-${item.id}`}>
              <View style={styles.ticketHead}>
                <Text style={styles.ticketTable}>Table {item.table_number}</Text>
                <Text style={styles.ticketStatus}>{item.status.replace("_", " ").toUpperCase()}</Text>
              </View>
              {item.items.map((it, idx) => (
                <View key={idx} style={styles.itemRow}>
                  <Text style={styles.itemQty}>{it.quantity}×</Text>
                  <Text style={styles.itemText}>{it.name}</Text>
                </View>
              ))}
              {NEXT[item.status] && (
                <Pressable style={styles.advanceBtn} onPress={() => advance(item.id, item.status)} testID={`ticket-advance-${item.id}`}>
                  <Text style={styles.advanceText}>{LABEL[item.status]}</Text>
                </Pressable>
              )}
            </View>
          )}
        />
      )}
      {err && <Text style={styles.err} testID="kitchen-error">{err}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  title: { color: colors.onSurface, fontSize: 28, fontFamily: "serif" },
  count: { color: colors.brand, fontSize: 14 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm },
  emptyTitle: { color: colors.onSurface, fontSize: 22, fontFamily: "serif", marginTop: spacing.sm },
  emptySub: { color: colors.onSurfaceSecondary },
  ticket: { borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  ticketHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  ticketTable: { color: colors.onSurface, fontSize: 22, fontFamily: "serif" },
  ticketStatus: { color: colors.onSurface, fontSize: 12, letterSpacing: 1, opacity: 0.85 },
  itemRow: { flexDirection: "row", gap: spacing.md, paddingVertical: 4 },
  itemQty: { color: colors.brand, fontSize: 20, fontWeight: "700", minWidth: 40 },
  itemText: { color: colors.onSurface, fontSize: 18, flex: 1 },
  advanceBtn: { marginTop: spacing.md, backgroundColor: colors.surface, paddingVertical: 14, borderRadius: radius.md, alignItems: "center", borderWidth: 1, borderColor: colors.borderStrong },
  advanceText: { color: colors.onSurface, fontWeight: "600", letterSpacing: 0.5 },
  err: { color: colors.onError, backgroundColor: colors.error, margin: spacing.lg, padding: spacing.md, borderRadius: radius.md },
});
