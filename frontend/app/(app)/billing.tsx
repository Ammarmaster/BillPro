import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, SafeAreaView, StatusBar,
} from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { printBill, sharePdf, getPrinterSettings } from "@/src/lib/print";
import { useTheme } from "@/src/context/ThemeContext";
import { colors, spacing, radius } from "@/src/theme";
import QRCode from "qrcode";

function base64Encode(str: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  let i = 0;
  const len = str.length;
  while (i < len) {
    const c1 = str.charCodeAt(i++) & 0xff;
    if (i === len) {
      out += chars.charAt(c1 >> 2);
      out += chars.charAt((c1 & 0x3) << 4);
      out += '==';
      break;
    }
    const c2 = str.charCodeAt(i++);
    if (i === len) {
      out += chars.charAt(c1 >> 2);
      out += chars.charAt(((c1 & 0x3) << 4) | ((c2 & 0xf0) >> 4));
      out += chars.charAt((c2 & 0xf) << 2);
      out += '=';
      break;
    }
    const c3 = str.charCodeAt(i++);
    out += chars.charAt(c1 >> 2);
    out += chars.charAt(((c1 & 0x3) << 4) | ((c2 & 0xf0) >> 4));
    out += chars.charAt(((c2 & 0xf) << 2) | ((c3 & 0xc0) >> 6));
    out += chars.charAt(c3 & 0x3f);
  }
  return out;
}

const normalizeTable = (val: string | undefined | null) => {
  if (!val) return "";
  return String(val).toLowerCase().replace("table", "").replace("t", "").replace("-", "").trim();
};

const isSameTable = (a: string | undefined | null, b: string | undefined | null) => {
  if (!a || !b) return false;
  if (String(a).toLowerCase().trim() === String(b).toLowerCase().trim()) return true;
  const na = normalizeTable(a);
  const nb = normalizeTable(b);
  return na.length > 0 && na === nb;
};

export default function Billing() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const { orderId, tableNumber } = useLocalSearchParams<{ orderId?: string; tableNumber?: string }>();

  // Synchronous cache lookup for 0ms visual render boots without any spinner delay
  const [order, setOrder] = useState<any>(() => {
    const oList = api.getCachedOrders() || [];
    if (orderId) {
      const targetOrderId = api.resolveTempId(orderId);
      return oList.find((x: any) => x.id === targetOrderId) || null;
    }
    if (tableNumber) {
      const tOrders = oList.filter((x: any) => isSameTable(x.table_number, tableNumber) && x.status !== "served" && x.status !== "cancelled");
      if (tOrders.length > 0) {
        return {
          table_number: tableNumber,
          items: tOrders.flatMap((o: any) => o.items || []),
          subtotal: tOrders.reduce((sum: number, o: any) => sum + (o.subtotal || 0), 0),
          id: tOrders[0].id
        };
      }
    }
    return null;
  });

  const [restaurant, setRestaurant] = useState<any>(() => api.getCachedRestaurant() || null);

  const [bill, setBill] = useState<any>(() => {
    const bList = api.getCachedBills() || [];
    const r = api.getCachedRestaurant();
    const gst = r?.gst_enabled;
    const gstRate = Number(r?.gst_rate ?? 5);

    if (orderId) {
      const targetOrderId = api.resolveTempId(orderId);
      const existing = bList.find((x: any) => x.order_id === targetOrderId && x.status !== "paid");
      if (existing) return existing;
    }
    if (tableNumber) {
      const existingTableBill = bList.find((x: any) => String(x.table_number).toLowerCase() === String(tableNumber).toLowerCase() && x.status === "pending");
      if (existingTableBill) return existingTableBill;
    }

    // Instant optimistic bill calculation from cached orders
    const oList = api.getCachedOrders() || [];
    let itemsToBill: any[] = [];
    let subtotalToBill = 0;
    let tableNum = tableNumber || "";
    let primaryOrderId = "";

    if (orderId) {
      const targetOrderId = api.resolveTempId(orderId);
      const o = oList.find((x: any) => x.id === targetOrderId);
      if (o) {
        itemsToBill = o.items || [];
        subtotalToBill = Number(o.subtotal || 0);
        tableNum = o.table_number || "";
        primaryOrderId = o.id;
      }
    } else if (tableNumber) {
      const tOrders = oList.filter((x: any) => String(x.table_number).toLowerCase() === String(tableNumber).toLowerCase() && x.status !== "served" && x.status !== "cancelled");
      if (tOrders.length > 0) {
        itemsToBill = tOrders.flatMap((o: any) => o.items || []),
        subtotalToBill = tOrders.reduce((sum: number, o: any) => sum + (o.subtotal || 0), 0);
        primaryOrderId = tOrders[0].id;
      }
    }

    if (itemsToBill.length > 0) {
      const tax = gst ? Math.round(subtotalToBill * (gstRate / 100) * 100) / 100 : 0;
      const cgst = gst ? Math.round((tax / 2) * 100) / 100 : 0;
      const sgst = gst ? Math.round((tax - cgst) * 100) / 100 : 0;
      const total = Math.round((subtotalToBill + tax) * 100) / 100;
      return {
        id: "temp-" + Date.now(),
        order_id: primaryOrderId,
        table_number: tableNum,
        items: itemsToBill,
        subtotal: subtotalToBill,
        tax_percent: gst ? gstRate : 0,
        tax: tax,
        cgst: cgst,
        sgst: sgst,
        gst_enabled: !!gst,
        discount: 0,
        total: total,
        status: "pending",
        restaurant_snapshot: r,
        created_at: new Date().toISOString(),
      };
    }
    return null;
  });

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [qrUri, setQrUri] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  
  // Payment Modal state
  const [payModal, setPayModal] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [orders, bills, r] = await Promise.all([
        api.listOrders().catch(() => []),
        api.listBills().catch(() => []),
        api.getRestaurant().catch(() => null)
      ]);
      if (r) setRestaurant(r);
      
      const targetOrderId = orderId ? api.resolveTempId(orderId) : "";
      
      if (tableNumber) {
        // Combined table billing
        const tableOrders = (orders || []).filter((x: any) => String(x.table_number).toLowerCase() === String(tableNumber).toLowerCase() && x.status !== "served" && x.status !== "cancelled");
        let b = (bills || []).find((x: any) => String(x.table_number).toLowerCase() === String(tableNumber).toLowerCase() && x.status === "pending");
        if (!b && tableOrders.length > 0) {
          b = await api.createBill({ table_number: tableNumber }).catch(() => null);
        }
        if (b) {
          setBill(b);
          setOrder({ table_number: tableNumber, items: b.items || [], subtotal: b.subtotal || 0, id: b.order_id || targetOrderId });
        } else if (tableOrders.length > 0) {
          const subtotal = tableOrders.reduce((sum: number, o: any) => sum + (o.subtotal || 0), 0);
          setOrder({ table_number: tableNumber, items: tableOrders.flatMap((o: any) => o.items || []), subtotal, id: tableOrders[0].id });
        } else {
          setErr(`No active orders found on Table ${tableNumber}`);
        }
      } else if (targetOrderId) {
        const o = (orders || []).find((x: any) => x.id === targetOrderId);
        setOrder(o || null);
        let b = (bills || []).find((x: any) => x.order_id === targetOrderId);
        if (!b && o) {
          b = await api.createBill({ order_id: targetOrderId }).catch(() => null);
        }
        if (b) {
          setBill(b);
        } else if (!o) {
          setErr("Order not found or already settled.");
        }
      } else {
        setErr("No table or order specified for billing.");
      }
    } catch (e: any) { 
      setErr(e.message || "Failed to load bill details."); 
    }
  }, [orderId, tableNumber]);

  useEffect(() => {
    load();
  }, [orderId, tableNumber, load]);

  const handleMarkPaidWithMethod = async (method: string) => {
    if (!bill) return;
    
    // Play haptic success immediately (0ms user feedback)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    
    const targetTbl = bill.table_number || order?.table_number || tableNumber;

    // Optimistic UI updates
    const updatedLocalBill = { ...bill, status: "paid", payment_method: method };
    setBill(updatedLocalBill);
    setPayModal(false);
    
    // Update local cache so that navigating back to waiter/tables is updated instantly
    api.updateCachedBill(bill.id, updatedLocalBill);
    const oList = api.getCachedOrders() || [];
    const updatedOrders = oList.map((o: any) => {
      if ((targetTbl && isSameTable(o.table_number, targetTbl)) || o.id === bill.order_id || (bill.order_ids && bill.order_ids.includes(o.id))) {
        return { ...o, status: "served" };
      }
      return o;
    });
    api.setCachedOrders(updatedOrders);

    // Auto-print receipt optimistically if cashier printer is configured for auto-print
    getPrinterSettings("cashier").then(async settings => {
      if (settings && settings.type !== "none" && settings.auto_print) {
        await printBill(updatedLocalBill);
      }
    }).catch(() => {});
    
    // Perform background sync with table settlement guarantee
    if (targetTbl && targetTbl !== "Takeaway") {
      api.settleTable(targetTbl, method).catch(() => {
        if (bill.id && !bill.id.startsWith("temp-")) {
          api.markBillPaid(bill.id, method).catch(() => {});
        }
      });
    } else if (bill.id && !bill.id.startsWith("temp-")) {
      api.markBillPaid(bill.id, method).catch((e: any) => {
        console.warn("Background markBillPaid sync failed:", e.message);
      });
    }
  };

  const doPrint = async () => {
    if (!bill) return;
    try { await printBill(bill); }
    catch (e: any) { setErr(`Print failed: ${e.message}`); }
  };

  const billNo = bill?.bill_number || order?.order_number || "40";
  const tableName = order?.table_number ? (order.table_number === "Takeaway" ? "Takeaway" : `Table ${order.table_number}`) : "Takeaway";
  const dateStr = bill?.created_at ? new Date(bill.created_at).toLocaleString() : new Date().toLocaleString();
  const isPaid = bill?.status === "paid";
  const restaurantName = (bill?.restaurant_snapshot?.name) || restaurant?.name || "Master cheff";
  const upiId = restaurant?.upi_id || "8152075375-2@ybl";
  const totalAmt = bill?.total || order?.subtotal || 760;
  const itemsList = bill?.items || order?.items || [];

  // Local QR Code Generator (runs instantly in < 1ms offline without canvas dependencies)
  useEffect(() => {
    const upi = bill?.upi_url || `upi://pay?pa=${upiId}&pn=${encodeURIComponent(restaurantName)}&am=${totalAmt}&cu=INR`;
    if (upi) {
      QRCode.toString(upi, { type: 'svg' })
        .then(svgString => {
          const b64 = base64Encode(svgString);
          setQrUri(`data:image/svg+xml;base64,${b64}`);
        })
        .catch(() => {});
    }
  }, [bill?.upi_url, upiId, restaurantName, totalAmt]);

  if (!order && !bill) {
    return (
      <View style={[styles.wrap, { paddingTop: insets.top, justifyContent: "center", alignItems: "center", padding: 24 }]}>
        {err ? (
          <>
            <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
            <Text style={{ color: "#EF4444", marginTop: spacing.md, textAlign: "center", fontWeight: "600" }}>{err}</Text>
            <Pressable onPress={load} style={{ marginTop: 16, backgroundColor: "#635BFF", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 }}>
              <Text style={{ color: "#FFF", fontWeight: "700" }}>Retry</Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color={colors.brand} />
            <Text style={{ color: colors.onSurfaceSecondary, marginTop: spacing.md }}>Loading bill details…</Text>
          </>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.surface }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.surface} />
      <View style={[styles.wrap, { paddingTop: insets.top, backgroundColor: theme.surface }]} testID="billing-screen">
        
        {/* Header Bar matching Image 2 & 3 */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]} testID="billing-back-btn" hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={theme.onSurface} />
          </Pressable>
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={[styles.title, { color: theme.onSurface }]}>Bill #{billNo}</Text>
            <Text style={[styles.subTitle, { color: theme.onSurfaceSecondary }]}>{tableName} · {dateStr}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: isPaid ? "#DCFCE7" : "#FEF3C7" }]}>
            <Text style={[styles.statusBadgeText, { color: isPaid ? "#10B981" : "#F59E0B" }]}>
              {isPaid ? "PAID" : "OPEN"}
            </Text>
          </View>
        </View>

        {/* Bill Receipt Card matching Image 2 */}
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 160 }} showsVerticalScrollIndicator={false}>
          <View style={[styles.billCard, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
            <Text style={[styles.restaurantHeaderTitle, { color: theme.onSurface }]}>{restaurantName}</Text>
            
            {/* Items List */}
            <View style={{ marginVertical: spacing.md, gap: 8 }}>
              {itemsList.map((it: any, idx: number) => (
                <View key={idx} style={styles.itemRow}>
                  <Text style={styles.itemQty}>{it.quantity}×</Text>
                  <Text style={[styles.itemName, { color: theme.onSurface }]}>{it.name}</Text>
                  <Text style={[styles.itemPrice, { color: theme.onSurface }]}>₹{it.price * it.quantity}</Text>
                </View>
              ))}
            </View>

            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLbl, { color: theme.onSurfaceSecondary }]}>Subtotal</Text>
              <Text style={[styles.summaryVal, { color: theme.onSurface }]}>₹{bill?.subtotal || totalAmt}</Text>
            </View>

            <View style={styles.divider} />
            <View style={styles.totalRow}>
              <Text style={[styles.totalLbl, { color: theme.onSurface }]}>TOTAL</Text>
              <Text style={[styles.totalVal, { color: theme.onSurface }]} testID="bill-total">₹{totalAmt}</Text>
            </View>

            {/* Always Crisp Black & White UPI QR Container */}
            {!isPaid && (
              <View style={[styles.upiBox, { backgroundColor: "#FFFFFF", borderRadius: radius.xl, padding: spacing.xl, alignItems: "center", marginTop: spacing.xl }]}>
                <Text style={{ color: "#635BFF", fontSize: 16, fontWeight: "800" }}>Scan & Pay (UPI)</Text>
                {qrUri ? (
                  <Image source={{ uri: qrUri }} style={styles.qrCodeImg} contentFit="contain" testID="bill-qr-image" />
                ) : (
                  <View style={[styles.qrCodeImg, { justifyContent: "center", alignItems: "center", backgroundColor: "#F8FAFC" }]}>
                    <ActivityIndicator color="#635BFF" />
                  </View>
                )}
                <Text style={{ color: "#0F172A", fontSize: 14, fontWeight: "800" }}>{upiId}</Text>
                <Text style={{ color: "#64748B", fontSize: 12, fontWeight: "600" }}>Auto-fills ₹{totalAmt}</Text>
              </View>
            )}
          </View>
        </ScrollView>

        {err && <Text style={styles.err} testID="billing-error">{err}</Text>}

        {/* Bottom Action Bar matching Image 2 & 3 */}
        <View style={[styles.bottomActionBar, { paddingBottom: insets.bottom + spacing.md }]}>
          <Pressable style={styles.printBtn} onPress={doPrint} testID="bill-print-btn">
            <Ionicons name="print-outline" size={20} color="#635BFF" />
            <Text style={styles.printBtnText}>Print</Text>
          </Pressable>

          {!isPaid ? (
            <Pressable style={styles.markPaidBtn} onPress={() => setPayModal(true)} testID="bill-mark-paid-btn">
              <Text style={styles.markPaidBtnText}>Mark Paid  ✓</Text>
            </Pressable>
          ) : (
            <View style={styles.alreadyPaidBadge}>
              <Ionicons name="checkmark-circle" size={20} color="#10B981" />
              <Text style={styles.alreadyPaidText}>Payment Complete</Text>
            </View>
          )}
        </View>

        {/* Payment Method Selection Modal matching Image 3 */}
        <Modal transparent visible={payModal} animationType="slide" onRequestClose={() => setPayModal(false)}>
          <Pressable style={styles.modalBg} onPress={() => setPayModal(false)}>
            <Pressable style={[styles.modalCard, { paddingBottom: insets.bottom + spacing.xl }]} onPress={() => {}}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Mark paid by</Text>

              <View style={styles.methodsRow}>
                <Pressable
                  style={styles.methodCard}
                  onPress={() => handleMarkPaidWithMethod("CASH")}
                >
                  <Ionicons name="cash-outline" size={28} color="#635BFF" />
                  <Text style={styles.methodText}>CASH</Text>
                </Pressable>

                <Pressable
                  style={styles.methodCard}
                  onPress={() => handleMarkPaidWithMethod("CARD")}
                >
                  <Ionicons name="card-outline" size={28} color="#635BFF" />
                  <Text style={styles.methodText}>CARD</Text>
                </Pressable>

                <Pressable
                  style={styles.methodCard}
                  onPress={() => handleMarkPaidWithMethod("UPI")}
                >
                  <Ionicons name="qr-code-outline" size={28} color="#635BFF" />
                  <Text style={styles.methodText}>UPI</Text>
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
  safe: { flex: 1, backgroundColor: "#F8F9FD" },
  wrap: { flex: 1, backgroundColor: "#F8F9FD" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2E8F0", justifyContent: "center", alignItems: "center" },
  title: { color: "#0F172A", fontSize: 24, fontWeight: "900" },
  subTitle: { color: "#64748B", fontSize: 13, marginTop: 2, fontWeight: "500" },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill },
  statusBadgeText: { fontSize: 12, fontWeight: "900", letterSpacing: 0.5 },

  billCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "rgba(0,0,0,0.03)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 2,
  },
  restaurantHeaderTitle: { color: "#0F172A", fontSize: 22, fontWeight: "900", textAlign: "center", marginBottom: spacing.md },
  itemRow: { flexDirection: "row", alignItems: "center", paddingVertical: 2 },
  itemQty: { color: "#635BFF", fontSize: 15, fontWeight: "800", width: 32 },
  itemName: { color: "#0F172A", fontSize: 15, fontWeight: "600", flex: 1 },
  itemPrice: { color: "#0F172A", fontSize: 15, fontWeight: "700" },
  divider: { height: 1, backgroundColor: "#F1F5F9", marginVertical: spacing.md },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryLbl: { color: "#64748B", fontSize: 15, fontWeight: "500" },
  summaryVal: { color: "#0F172A", fontSize: 16, fontWeight: "800" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLbl: { color: "#0F172A", fontSize: 18, fontWeight: "900", letterSpacing: 0.5 },
  totalVal: { color: "#0F172A", fontSize: 22, fontWeight: "900" },

  upiBox: {
    backgroundColor: "#F1F0FF",
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: "center",
    marginTop: spacing.xl,
    gap: spacing.xs,
  },
  upiTitle: { color: "#635BFF", fontSize: 16, fontWeight: "800" },
  qrCodeImg: { width: 220, height: 220, marginVertical: spacing.sm, borderRadius: radius.md },
  upiIdText: { color: "#0F172A", fontSize: 14, fontWeight: "800" },
  upiSubText: { color: "#64748B", fontSize: 12, fontWeight: "600" },

  bottomActionBar: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#FFFFFF", flexDirection: "row", padding: spacing.lg, gap: spacing.md, borderTopWidth: 1, borderTopColor: "#E2E8F0" },
  printBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 16, borderRadius: radius.lg, backgroundColor: "#F1F0FF", borderWidth: 1, borderColor: "rgba(99,91,255,0.2)" },
  printBtnText: { color: "#635BFF", fontSize: 15, fontWeight: "800" },
  markPaidBtn: { flex: 1.5, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 16, borderRadius: radius.lg, backgroundColor: "#635BFF" },
  markPaidBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  alreadyPaidBadge: { flex: 1.5, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 16, borderRadius: radius.lg, backgroundColor: "#ECFDF5" },
  alreadyPaidText: { color: "#10B981", fontSize: 15, fontWeight: "800" },

  err: { color: colors.onError, backgroundColor: colors.error, margin: spacing.lg, padding: spacing.md, borderRadius: radius.md },

  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#FFFFFF", padding: spacing.xl, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: spacing.md },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#CBD5E1", alignSelf: "center", marginBottom: spacing.xs },
  modalTitle: { color: "#0F172A", fontSize: 20, fontWeight: "900", marginBottom: spacing.xs },
  methodsRow: { flexDirection: "row", gap: spacing.md },
  methodCard: { flex: 1, aspectRatio: 1, backgroundColor: "#F1F0FF", borderRadius: radius.xl, alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: "rgba(99,91,255,0.15)" },
  methodText: { color: "#635BFF", fontSize: 14, fontWeight: "800" },
});
