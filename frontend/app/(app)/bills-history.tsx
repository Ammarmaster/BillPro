import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Modal, ScrollView, SafeAreaView, StatusBar,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { printBill, sharePdf } from "@/src/lib/print";
import { colors, spacing, radius } from "@/src/theme";

export default function BillsHistory() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selBill, setSelBill] = useState<any>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const data = await api.listBills();
      setBills(data || []);
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

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F9FD" />
      <View style={[styles.wrap, { paddingTop: insets.top }]}>
        
        {/* Header Bar */}
        <View style={styles.header}>
          <Pressable onPress={() => router.push("/(app)/more")} style={styles.backBtn} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.title}>Bills</Text>
          <View style={{ width: 40 }} />
        </View>

        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
        ) : bills.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="receipt-outline" size={48} color={colors.onSurfaceTertiary} />
            <Text style={{ color: colors.onSurfaceSecondary, marginTop: 8, fontSize: 15 }}>No past bills recorded yet.</Text>
          </View>
        ) : (
          <FlatList
            data={bills}
            keyExtractor={item => item.id}
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item, index }) => {
              const isPaid = item.status === "paid";
              const billNo = item.bill_number || (bills.length - index);
              const tableLabel = item.table_number ? `Table ${item.table_number}` : "Takeaway";
              const payMode = item.payment_method ? item.payment_method.toUpperCase() : "UNPAID";
              const dateStr = formatTimestamp(item.paid_at || item.created_at);

              return (
                <Pressable
                  style={({ pressed }) => [styles.billCard, pressed && styles.cardPressed]}
                  onPress={() => setSelBill(item)}
                >
                  <View style={styles.billLeftRow}>
                    <View style={[styles.statusDot, { backgroundColor: isPaid ? "#10B981" : "#F59E0B" }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.billTitle}>#{billNo} • {tableLabel}</Text>
                      <Text style={styles.billSubtitle}>{dateStr} {payMode ? `• ${payMode}` : ""}</Text>
                    </View>
                  </View>

                  <View style={styles.billRightRow}>
                    <Text style={styles.billAmount}>₹{item.total ?? 0}</Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} />
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
            <Pressable style={[styles.modalCard, { paddingBottom: insets.bottom + spacing.xl }]} onPress={() => {}}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>Bill #{selBill?.bill_number || ""}</Text>
                  <Text style={styles.modalSub}>{selBill?.table_number ? `Table ${selBill.table_number}` : "Takeaway"}</Text>
                </View>
                <Pressable onPress={() => setSelBill(null)} hitSlop={12}>
                  <Ionicons name="close" size={24} color={colors.onSurfaceSecondary} />
                </Pressable>
              </View>

              <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
                {selBill?.items?.map((it: any, idx: number) => (
                  <View key={idx} style={styles.itemRow}>
                    <Text style={styles.itemName}>{it.quantity}x {it.name}</Text>
                    <Text style={styles.itemPrice}>₹{it.price * it.quantity}</Text>
                  </View>
                ))}
                
                <View style={styles.divider} />
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLbl}>Subtotal</Text>
                  <Text style={styles.summaryVal}>₹{selBill?.subtotal ?? 0}</Text>
                </View>
                {!!selBill?.tax && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLbl}>Tax ({selBill?.tax_percent || 0}%)</Text>
                    <Text style={styles.summaryVal}>+₹{selBill?.tax}</Text>
                  </View>
                )}
                {!!selBill?.discount && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLbl}>Discount</Text>
                    <Text style={styles.summaryVal}>-₹{selBill?.discount}</Text>
                  </View>
                )}
                <View style={[styles.summaryRow, { marginTop: 6 }]}>
                  <Text style={styles.totalLbl}>Total</Text>
                  <Text style={styles.totalVal}>₹{selBill?.total ?? 0}</Text>
                </View>
              </ScrollView>

              <View style={styles.modalActions}>
                <Pressable style={styles.actionBtnOutline} onPress={() => selBill && sharePdf(selBill)}>
                  <Ionicons name="share-outline" size={18} color={colors.brand} />
                  <Text style={styles.actionBtnOutlineText}>Share PDF</Text>
                </Pressable>
                <Pressable style={styles.actionBtnSolid} onPress={() => selBill && printBill(selBill)}>
                  <Ionicons name="print-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.actionBtnSolidText}>Print Bill</Text>
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
  safe: { flex: 1, backgroundColor: colors.surface },
  wrap: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: "center",
    alignItems: "center",
  },
  title: { color: colors.onSurface, fontSize: 24, fontWeight: "800" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  billCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "rgba(99, 91, 255, 0.04)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 2,
  },
  cardPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  billLeftRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, flex: 1 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  billTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "800" },
  billSubtitle: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2, fontWeight: "500" },
  billRightRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  billAmount: { color: colors.onSurface, fontSize: 17, fontWeight: "900" },
  err: { color: colors.onError, backgroundColor: colors.error, margin: spacing.lg, padding: spacing.md, borderRadius: radius.md },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.surfaceSecondary, padding: spacing.xl, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, gap: spacing.md },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { color: colors.onSurface, fontSize: 22, fontWeight: "800" },
  modalSub: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 2 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  itemName: { color: colors.onSurface, fontSize: 15, fontWeight: "600" },
  itemPrice: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.md },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  summaryLbl: { color: colors.onSurfaceSecondary, fontSize: 14 },
  summaryVal: { color: colors.onSurface, fontSize: 14, fontWeight: "600" },
  totalLbl: { color: colors.onSurface, fontSize: 16, fontWeight: "800" },
  totalVal: { color: colors.brand, fontSize: 20, fontWeight: "900" },
  modalActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  actionBtnOutline: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.brand,
    backgroundColor: "rgba(99, 91, 255, 0.05)",
  },
  actionBtnOutlineText: { color: colors.brand, fontWeight: "700", fontSize: 15 },
  actionBtnSolid: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.brand,
  },
  actionBtnSolidText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
});
