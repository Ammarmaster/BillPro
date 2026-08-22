import { useCallback, useState, useMemo, useEffect } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Modal, ScrollView, SafeAreaView, StatusBar,
} from "react-native";
import { useFocusEffect, useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { printBill, sharePdf } from "@/src/lib/print";
import { colors, spacing, radius } from "@/src/theme";
import { useTheme } from "@/src/context/ThemeContext";
import * as Haptics from "expo-haptics";

export default function BillsHistory() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ filter?: string }>();
  const { theme, isDark } = useTheme();

  const [activeFilter, setActiveFilter] = useState<"today" | "all">(() => params.filter === "today" ? "today" : "all");
  const [bills, setBills] = useState<any[]>(() => api.getCachedBills() || []);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selBill, setSelBill] = useState<any>(null);

  useEffect(() => {
    if (params.filter === "today") {
      setActiveFilter("today");
    }
  }, [params.filter]);

  useEffect(() => {
    const { subscribeToCache } = require("@/src/lib/api");
    const unsubscribe = subscribeToCache((path: string, data: any) => {
      if (path === "/bills" && data) {
        setBills(data);
      }
    });
    return () => unsubscribe();
  }, []);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const data = await api.listBills();
      if (data) setBills(data);
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const formatTimestamp = (ts: string) => {
    if (!ts) return "";
    try {
      const d = new Date(ts);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const time = d.toTimeString().split(' ')[0];
      return `${day}/${month}/${year}, ${time}`;
    } catch { return ts; }
  };

  // Restaurant Business Day matching (Daily shift resets after 1:00 AM local time)
  const isToday = (ts?: string) => {
    if (!ts) return false;
    try {
      const billDate = new Date(ts);
      const now = new Date();
      
      // Calculate 1:00 AM cutoff for current business cycle
      const cutoff = new Date(now);
      if (now.getHours() >= 1) {
        cutoff.setHours(1, 0, 0, 0);
      } else {
        cutoff.setDate(cutoff.getDate() - 1);
        cutoff.setHours(1, 0, 0, 0);
      }
      
      return billDate.getTime() >= cutoff.getTime();
    } catch {
      return false;
    }
  };

  const filteredBills = useMemo(() => {
    if (activeFilter === "all") return bills;
    return bills.filter(b => b.status === "paid" && isToday(b.paid_at || b.created_at));
  }, [bills, activeFilter]);

  const todayPaidBills = useMemo(() => {
    return bills.filter(b => b.status === "paid" && isToday(b.paid_at || b.created_at));
  }, [bills]);

  const todayTotal = useMemo(() => {
    return todayPaidBills.reduce((sum, b) => sum + Number(b.total || 0), 0);
  }, [todayPaidBills]);

  const todayFormula = useMemo(() => {
    if (todayPaidBills.length === 0) return "No paid sales recorded today yet";
    if (todayPaidBills.length === 1) return `1 bill: ₹${todayPaidBills[0].total} = ₹${todayPaidBills[0].total}`;
    const formulaStr = todayPaidBills.map(b => `₹${b.total}`).join(" + ");
    return `${formulaStr} = ₹${todayTotal.toLocaleString("en-IN")}`;
  }, [todayPaidBills, todayTotal]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.surface }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.surface} />
      <View style={[styles.wrap, { paddingTop: insets.top, backgroundColor: theme.surface }]}>
        
        {/* Header Bar */}
        <View style={styles.header}>
          <Pressable onPress={() => router.push("/(app)/more")} style={[styles.backBtn, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={theme.onSurface} />
          </Pressable>
          <Text style={[styles.title, { color: theme.onSurface }]}>Bills & Sales History</Text>
          <Pressable onPress={load} style={[styles.backBtn, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]} hitSlop={12}>
            <Ionicons name="refresh" size={18} color={colors.brand} />
          </Pressable>
        </View>

        {/* Filter Tabs */}
        <View style={styles.filterRow}>
          <Pressable
            style={[styles.filterTab, activeFilter === "today" && styles.filterTabActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setActiveFilter("today");
            }}
          >
            <Text style={[styles.filterTabText, activeFilter === "today" ? styles.filterTabTextActive : { color: theme.onSurfaceSecondary }]}>
              Today's Live Sales (₹{todayTotal.toLocaleString("en-IN")})
            </Text>
          </Pressable>

          <Pressable
            style={[styles.filterTab, activeFilter === "all" && styles.filterTabActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setActiveFilter("all");
            }}
          >
            <Text style={[styles.filterTabText, activeFilter === "all" ? styles.filterTabTextActive : { color: theme.onSurfaceSecondary }]}>
              All Bills ({bills.length})
            </Text>
          </Pressable>
        </View>

        {/* Today's Sales Calculation Breakdown Banner */}
        {activeFilter === "today" && (
          <View style={[styles.breakdownCard, { backgroundColor: isDark ? "#131927" : "#EEF2FF", borderColor: isDark ? "#1F293D" : "#C7D2FE" }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={styles.liveDot} />
                <Text style={styles.breakdownTitle}>LIVE SALES BREAKDOWN</Text>
              </View>
              <Text style={[styles.breakdownTotal, { color: colors.brand }]}>Total: ₹{todayTotal.toLocaleString("en-IN")}</Text>
            </View>
            <Text style={[styles.breakdownFormula, { color: theme.onSurfaceSecondary }]} numberOfLines={2}>
              {todayFormula}
            </Text>
          </View>
        )}

        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
        ) : filteredBills.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="receipt-outline" size={48} color={theme.onSurfaceTertiary} />
            <Text style={{ color: theme.onSurfaceSecondary, marginTop: 8, fontSize: 15 }}>
              {activeFilter === "today" ? "No paid bills recorded today yet." : "No past bills recorded yet."}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredBills}
            keyExtractor={item => item.id}
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item, index }) => {
              const isPaid = item.status === "paid";
              const billNo = item.bill_number || (bills.length - index);
              const tableLabel = item.table_number ? (item.table_number === "Takeaway" ? "Takeaway" : `Table ${item.table_number}`) : "Takeaway";
              const payMode = item.payment_method ? item.payment_method.toUpperCase() : "UNPAID";
              const dateStr = formatTimestamp(item.paid_at || item.created_at);

              return (
                <Pressable
                  style={({ pressed }) => [
                    styles.billCard,
                    { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
                    pressed && styles.cardPressed
                  ]}
                  onPress={() => setSelBill(item)}
                >
                  <View style={styles.billLeftRow}>
                    <View style={[styles.statusDot, { backgroundColor: isPaid ? "#10B981" : "#F59E0B" }]} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.billTitle, { color: theme.onSurface }]} numberOfLines={1}>
                        #{billNo} • {tableLabel}
                      </Text>
                      <Text style={[styles.billSubtitle, { color: theme.onSurfaceSecondary }]} numberOfLines={1}>
                        {dateStr} {payMode ? `• ${payMode}` : ""}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.billRightRow}>
                    <Text style={[styles.billAmount, { color: colors.brand }]}>₹{item.total ?? 0}</Text>
                    <Ionicons name="chevron-forward" size={18} color={theme.onSurfaceSecondary} />
                  </View>
                </Pressable>
              );
            }}
          />
        )}

        {err && <Text style={styles.err}>{err}</Text>}

        {/* Bill Detail Modal */}
        <Modal transparent visible={!!selBill} animationType="slide" onRequestClose={() => setSelBill(null)}>
          <Pressable style={styles.modalBg} onPress={() => setSelBill(null)}>
            <Pressable style={[styles.modalCard, { backgroundColor: theme.surfaceSecondary, paddingBottom: insets.bottom + spacing.xl }]} onPress={() => {}}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={[styles.modalTitle, { color: theme.onSurface }]}>Bill #{selBill?.bill_number || ""}</Text>
                  <Text style={[styles.modalSub, { color: theme.onSurfaceSecondary }]}>
                    {selBill?.table_number ? (selBill.table_number === "Takeaway" ? "Takeaway" : `Table ${selBill.table_number}`) : "Takeaway"}
                  </Text>
                </View>
                <Pressable onPress={() => setSelBill(null)} hitSlop={12}>
                  <Ionicons name="close" size={24} color={theme.onSurfaceSecondary} />
                </Pressable>
              </View>

              <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
                {selBill?.items?.map((it: any, idx: number) => (
                  <View key={idx} style={[styles.itemRow, { borderBottomColor: theme.border }]}>
                    <Text style={[styles.itemName, { color: theme.onSurface }]}>{it.name} x{it.quantity}</Text>
                    <Text style={[styles.itemPrice, { color: theme.onSurface }]}>₹{it.price * it.quantity}</Text>
                  </View>
                ))}
              </ScrollView>

              <View style={[styles.totalRow, { borderTopColor: theme.border }]}>
                <Text style={[styles.totalLbl, { color: theme.onSurface }]}>Total Amount</Text>
                <Text style={[styles.totalVal, { color: colors.brand }]}>₹{selBill?.total ?? 0}</Text>
              </View>

              <View style={styles.modalActions}>
                <Pressable
                  style={[styles.actionBtn, { backgroundColor: theme.surfaceTertiary }]}
                  onPress={() => selBill && sharePdf(selBill)}
                >
                  <Ionicons name="share-social-outline" size={18} color={theme.onSurface} />
                  <Text style={[styles.actionBtnText, { color: theme.onSurface }]}>Share</Text>
                </Pressable>

                <Pressable
                  style={[styles.actionBtn, { backgroundColor: colors.brand }]}
                  onPress={() => selBill && printBill(selBill)}
                >
                  <Ionicons name="print-outline" size={18} color="#FFFFFF" />
                  <Text style={[styles.actionBtnText, { color: "#FFFFFF" }]}>Print Bill</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: radius.pill, borderWidth: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 20, fontWeight: "900" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  
  filterRow: { flexDirection: "row", paddingHorizontal: spacing.lg, gap: 10, marginBottom: spacing.xs },
  filterTab: { flex: 1, paddingVertical: 10, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.04)" },
  filterTabActive: { backgroundColor: colors.brand },
  filterTabText: { fontSize: 12, fontWeight: "700" },
  filterTabTextActive: { color: "#FFFFFF" },

  breakdownCard: { marginHorizontal: spacing.lg, marginTop: spacing.xs, marginBottom: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#10B981" },
  breakdownTitle: { color: "#10B981", fontSize: 11, fontWeight: "900", letterSpacing: 0.8 },
  breakdownTotal: { fontSize: 14, fontWeight: "900" },
  breakdownFormula: { fontSize: 12, marginTop: 4, fontWeight: "600" },

  billCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1 },
  cardPressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  billLeftRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, flex: 1, minWidth: 0, paddingRight: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  billTitle: { fontSize: 16, fontWeight: "800" },
  billSubtitle: { fontSize: 12, marginTop: 2 },
  billRightRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  billAmount: { fontSize: 16, fontWeight: "900" },
  err: { color: "#EF4444", padding: spacing.md, textAlign: "center" },

  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  modalCard: { padding: spacing.xl, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  modalTitle: { fontSize: 20, fontWeight: "900" },
  modalSub: { fontSize: 13, marginTop: 2 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.sm, borderBottomWidth: 1 },
  itemName: { fontSize: 14, fontWeight: "600" },
  itemPrice: { fontSize: 14, fontWeight: "700" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, paddingTop: spacing.md, marginTop: spacing.sm },
  totalLbl: { fontSize: 16, fontWeight: "800" },
  totalVal: { fontSize: 18, fontWeight: "900" },
  modalActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: radius.md },
  actionBtnText: { fontSize: 14, fontWeight: "800" },
});
