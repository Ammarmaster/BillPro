import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput, Platform,
} from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { printBill, sharePdf } from "@/src/lib/print";
import { colors, spacing, radius } from "@/src/theme";

export default function Billing() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();

  const [order, setOrder] = useState<any>(null);
  const [restaurant, setRestaurant] = useState<any>(null);
  const [bill, setBill] = useState<any>(null);
  const [tax, setTax] = useState("5");
  const [discount, setDiscount] = useState("0");
  const [gstEnabled, setGstEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [orders, bills, r] = await Promise.all([api.listOrders(), api.listBills(), api.getRestaurant()]);
      setRestaurant(r);
      const o = orders.find((x: any) => x.id === orderId);
      setOrder(o || null);
      const b = bills.find((x: any) => x.order_id === orderId);
      if (b) setBill(b);
      if (r && !bill) setGstEnabled(!!r.gst_enabled);
    } catch (e: any) { setErr(e.message); }
  }, [orderId, bill]);

  useEffect(() => { if (orderId) load(); }, [orderId, load]);

  const generate = async () => {
    setBusy(true); setErr(null);
    try {
      const b = await api.createBill({
        order_id: orderId, tax_percent: parseFloat(tax) || 0,
        discount: parseFloat(discount) || 0, gst_enabled: gstEnabled,
      });
      setBill(b);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const markPaid = async () => {
    if (!bill) return;
    setBusy(true);
    try {
      const b = await api.markBillPaid(bill.id);
      setBill(b);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const doPrint = async () => {
    if (!bill) return;
    try { await printBill(bill); }
    catch (e: any) { setErr(`Print failed: ${e.message}`); }
  };
  const doShare = async () => {
    if (!bill) return;
    try { await sharePdf(bill); }
    catch (e: any) { setErr(`Share failed: ${e.message}`); }
  };

  if (!order) {
    return (
      <View style={[styles.wrap, { paddingTop: insets.top, justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={colors.brand} />
        <Text style={{ color: colors.onSurfaceSecondary, marginTop: spacing.md }}>Loading order…</Text>
      </View>
    );
  }

  const qrUri = bill
    ? `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(bill.upi_url)}&size=320x320&bgcolor=1a1a1a&color=d4af37&margin=8`
    : null;

  const restaurantName = (bill?.restaurant_snapshot?.name) || restaurant?.name || "Restaurant";
  const restaurantLogo = (bill?.restaurant_snapshot?.logo_base64) || restaurant?.logo_base64;

  return (
    <ScrollView
      style={[styles.wrap, { paddingTop: insets.top }]}
      contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl }}
      testID="billing-screen"
    >
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} testID="billing-back-btn" hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Billing</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.brandRow}>
        {restaurantLogo ? (
          <Image source={{ uri: `data:image/jpeg;base64,${restaurantLogo}` }} style={styles.logoImg} contentFit="cover" />
        ) : (
          <View style={styles.logoFallback}><Text style={styles.logoFallbackText}>{restaurantName.charAt(0).toUpperCase()}</Text></View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.restaurantName}>{restaurantName}</Text>
          {!!restaurant?.address && <Text style={styles.restaurantAddr}>{restaurant.address}</Text>}
        </View>
      </View>

      <View style={styles.receipt}>
        <Text style={styles.receiptTable}>Table {order.table_number}</Text>
        <Text style={styles.receiptId}>#{order.id.slice(0, 8).toUpperCase()}</Text>
        <View style={styles.divider} />
        {order.items.map((it: any, idx: number) => (
          <View key={idx} style={styles.receiptLine}>
            <Text style={styles.receiptItem}>{it.quantity}× {it.name}</Text>
            <Text style={styles.receiptItem}>₹{(it.price * it.quantity).toFixed(0)}</Text>
          </View>
        ))}
        <View style={styles.divider} />
        <View style={styles.receiptLine}>
          <Text style={styles.receiptSub}>Subtotal</Text>
          <Text style={styles.receiptSub}>₹{order.subtotal.toFixed(0)}</Text>
        </View>
      </View>

      {!bill ? (
        <>
          <Text style={styles.section}>Charges</Text>
          <Pressable style={styles.gstToggleRow} onPress={() => setGstEnabled(v => !v)} testID="bill-gst-toggle">
            <Ionicons name={gstEnabled ? "checkbox" : "square-outline"} size={22} color={gstEnabled ? colors.brand : colors.onSurfaceSecondary} />
            <Text style={styles.gstToggleText}>Apply GST (CGST + SGST)</Text>
          </Pressable>
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>GST %</Text>
              <TextInput value={tax} onChangeText={setTax} keyboardType="decimal-pad" style={[styles.input, !gstEnabled && { opacity: 0.4 }]} editable={gstEnabled} testID="bill-tax-input" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Discount ₹</Text>
              <TextInput value={discount} onChangeText={setDiscount} keyboardType="decimal-pad" style={styles.input} testID="bill-discount-input" />
            </View>
          </View>
          <Pressable style={styles.primaryBtn} onPress={generate} disabled={busy} testID="bill-generate-btn">
            {busy ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.primaryText}>Generate Bill</Text>}
          </Pressable>
        </>
      ) : (
        <>
          <View style={styles.totalCard}>
            <View style={styles.receiptLine}>
              <Text style={styles.receiptSub}>Subtotal</Text>
              <Text style={styles.receiptSub}>₹{bill.subtotal.toFixed(0)}</Text>
            </View>
            {bill.gst_enabled && (
              <>
                <View style={styles.receiptLine}>
                  <Text style={styles.receiptSub}>CGST</Text>
                  <Text style={styles.receiptSub}>₹{bill.cgst.toFixed(2)}</Text>
                </View>
                <View style={styles.receiptLine}>
                  <Text style={styles.receiptSub}>SGST</Text>
                  <Text style={styles.receiptSub}>₹{bill.sgst.toFixed(2)}</Text>
                </View>
              </>
            )}
            {!!bill.discount && (
              <View style={styles.receiptLine}>
                <Text style={styles.receiptSub}>Discount</Text>
                <Text style={styles.receiptSub}>-₹{bill.discount.toFixed(0)}</Text>
              </View>
            )}
            <View style={styles.divider} />
            <View style={styles.receiptLine}>
              <Text style={styles.totalLabel}>TOTAL</Text>
              <Text style={styles.totalVal} testID="bill-total">₹{bill.total.toFixed(0)}</Text>
            </View>
            <Text style={[styles.status, { color: bill.status === "paid" ? colors.onSuccess : colors.brand }]} testID="bill-status">
              {bill.status.toUpperCase()}
            </Text>
          </View>

          <Text style={styles.section}>Pay via UPI</Text>
          <View style={styles.qrCard}>
            {qrUri && (
              <Image source={{ uri: qrUri }} style={{ width: 260, height: 260 }} contentFit="contain" testID="bill-qr-image" />
            )}
            <Text style={styles.upiHint}>Scan with any UPI app</Text>
          </View>

          <Text style={styles.section}>Actions</Text>
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <Pressable style={styles.actionBtn} onPress={doPrint} testID="bill-print-btn">
              <Ionicons name="print" size={22} color={colors.brand} />
              <Text style={styles.actionText}>Print</Text>
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={doShare} testID="bill-share-btn">
              <Ionicons name="share-social" size={22} color={colors.brand} />
              <Text style={styles.actionText}>Share PDF</Text>
            </Pressable>
          </View>
          {Platform.OS !== "web" && (
            <Text style={styles.printHint}>
              Print uses the system print sheet (AirPrint/Android). For 58/80 mm Bluetooth thermal printers, generate a build after Publish.
            </Text>
          )}

          {bill.status !== "paid" && (
            <Pressable style={styles.primaryBtn} onPress={markPaid} disabled={busy} testID="bill-mark-paid-btn">
              {busy ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.primaryText}>Mark as Paid</Text>}
            </Pressable>
          )}
        </>
      )}

      {err && <Text style={styles.err} testID="billing-error">{err}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.lg },
  title: { color: colors.onSurface, fontSize: 22, fontFamily: "serif" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  logoImg: { width: 48, height: 48, borderRadius: radius.md },
  logoFallback: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  logoFallbackText: { color: colors.onBrand, fontSize: 22, fontFamily: "serif" },
  restaurantName: { color: colors.onSurface, fontSize: 18, fontFamily: "serif" },
  restaurantAddr: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  receipt: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  receiptTable: { color: colors.onSurface, fontSize: 22, fontFamily: "serif" },
  receiptId: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  receiptLine: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  receiptItem: { color: colors.onSurface, fontSize: 14 },
  receiptSub: { color: colors.onSurfaceSecondary, fontSize: 14 },
  section: { color: colors.onSurfaceSecondary, fontSize: 13, letterSpacing: 1, textTransform: "uppercase", marginTop: spacing.xl, marginBottom: spacing.md },
  gstToggleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  gstToggleText: { color: colors.onSurface, fontSize: 14 },
  label: { color: colors.onSurfaceSecondary, fontSize: 12, marginBottom: 6 },
  input: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 12, color: colors.onSurface, borderWidth: 1, borderColor: colors.border },
  primaryBtn: { backgroundColor: colors.brand, paddingVertical: 16, borderRadius: radius.lg, alignItems: "center", marginTop: spacing.xl },
  primaryText: { color: colors.onBrand, fontWeight: "600", fontSize: 15, letterSpacing: 0.5 },
  totalCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.md, borderWidth: 1, borderColor: colors.brandTertiary },
  totalLabel: { color: colors.onSurface, fontSize: 16, letterSpacing: 1 },
  totalVal: { color: colors.brand, fontSize: 26, fontFamily: "serif" },
  status: { textAlign: "center", marginTop: spacing.md, letterSpacing: 2, fontSize: 12 },
  qrCard: { alignItems: "center", padding: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.md },
  upiHint: { color: colors.onSurfaceSecondary, fontSize: 12 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingVertical: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceSecondary },
  actionText: { color: colors.onSurface, fontSize: 14, fontWeight: "600" },
  printHint: { color: colors.onSurfaceTertiary, fontSize: 11, marginTop: spacing.md, lineHeight: 16, textAlign: "center" },
  err: { color: colors.onError, backgroundColor: colors.error, padding: spacing.md, borderRadius: radius.md, marginTop: spacing.lg },
});
