import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, FlatList, ActivityIndicator, SafeAreaView, StatusBar, PanResponder, Dimensions, Animated as RNAnimated, Alert,
} from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeInDown, FadeInUp, useAnimatedStyle, useSharedValue, withSpring,
} from "react-native-reanimated";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { menuItemImageSource } from "@/src/lib/foodImage";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/context/ThemeContext";
import { useNotifications } from "@/src/context/NotificationContext";
import { colors, spacing, radius } from "@/src/theme";
import { getPrinterSettings, printKitchenKOT } from "@/src/lib/print";
import OrderQRScannerModal from "@/src/components/OrderQRScannerModal";
type Cat = { id: string; name: string };
type Item = { id: string; category_id: string; name: string; price: number; description: string; image_base64?: string; image_url?: string };
type Table = { id: string; label: string; seats: number };
type Line = { menu_item_id: string; name: string; price: number; quantity: number; notes: string };

const AnimText = Animated.createAnimatedComponent(Text);

export default function WaiterScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { logout } = useAuth();
  const { theme, isDark } = useTheme();
  const { table: tableParam } = useLocalSearchParams<{ table?: string }>();

  const [cats, setCats] = useState<Cat[]>(() => api.getCachedCategories() || []);
  const [items, setItems] = useState<Item[]>(() => api.getCachedMenu() || []);
  const [tables, setTables] = useState<Table[]>(() => {
    const cached = api.getCachedTables();
    if (cached && cached.length > 0) return cached;
    return [
      { id: "tbl-1", label: "1", seats: 4 },
      { id: "tbl-2", label: "2", seats: 4 },
      { id: "tbl-3", label: "3", seats: 6 },
      { id: "tbl-4", label: "4", seats: 2 },
      { id: "tbl-5", label: "5", seats: 4 },
      { id: "tbl-6", label: "6", seats: 4 },
    ];
  });
  const [orders, setOrders] = useState<any[]>(() => api.getCachedOrders() || []);
  const [bills, setBills] = useState<any[]>(() => api.getCachedBills() || []);
  
  const [selCat, setSelCat] = useState<string | "all">("all");
  const [search, setSearch] = useState("");
  const [table, setTable] = useState(tableParam || "");
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false); // 0ms Instant table display
  useEffect(() => {
    const { subscribeToCache } = require("@/src/lib/api");
    const unsubscribe = subscribeToCache((path: string, data: any) => {
      if (path === "/categories" && data) setCats(data);
      if (path === "/menu-items" && data) setItems(data);
      if (path === "/tables" && data) setTables(data);
      if (path === "/orders" && data) setOrders(data);
      if (path === "/bills" && data) setBills(data);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Guest session tracking for multi-customer tables
  const [currentGuestName, setCurrentGuestName] = useState("Guest 1");
  const [currentSessionId, setCurrentSessionId] = useState("");
  const [showGuestPicker, setShowGuestPicker] = useState(false);

  // Scanner modal state for Customer Web Order QR handoff
  const [showScanner, setShowScanner] = useState(false);

  // View state: 'tables' | 'order_details' | 'menu_order'
  const [viewMode, setViewMode] = useState<"tables" | "order_details" | "menu_order">("tables");
  const [selectedTableObj, setSelectedTableObj] = useState<Table | null>(null);
  const [activeOrder, setActiveOrder] = useState<any | null>(null);

  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handleScanImport = async (confirmedOrder: any) => {
    setShowScanner(false);
    
    // Optimistically insert/update the confirmed order in local state
    setOrders(prev => {
      const filtered = prev.filter(o => o.id !== confirmedOrder.id);
      return [confirmedOrder, ...filtered];
    });

    // Mark the table as occupied locally
    if (confirmedOrder.table_number) {
      setTables(prev =>
        prev.map(t =>
          String(t.label).toLowerCase() === String(confirmedOrder.table_number).toLowerCase()
            ? { ...t, status: "occupied" }
            : t
        )
      );

      // Instantly open the table details view with 0ms delay!
      const targetTbl = tables.find(
        t => String(t.label).toLowerCase() === String(confirmedOrder.table_number).toLowerCase()
      );
      if (targetTbl) {
        setSelectedTableObj(targetTbl);
        setViewMode("order_details");
      }
    }

    Alert.alert("Order Attached", "Customer order confirmed and attached successfully!");

    // Trigger a silent load in background to reconcile state
    load().catch(() => {});
  };

  // Priority 1: Fast table & order synchronization
  const load = useCallback(async () => {
    setErr(null);
    try {
      // Sync tables & active orders with highest priority
      const [t, o] = await Promise.all([
        api.listTables().catch(() => null),
        api.listOrders().catch(() => null),
      ]);
      if (t && t.length > 0) setTables(t);
      if (o) setOrders(o);

      // Background lazy sync for menu and bills without blocking tables UI
      api.listMenu().then(m => { if (m?.length) setItems(m); }).catch(() => {});
      api.listCategories().then(c => { if (c?.length) setCats(c); }).catch(() => {});
      api.listBills().then(b => { if (b) setBills(b); }).catch(() => {});
    } catch (e: any) { 
      setErr(e.message); 
    }
  }, []);

  useFocusEffect(useCallback(() => {
    // Re-hydrate local state from cache immediately on tab focus
    const cachedOrders = api.getCachedOrders();
    if (cachedOrders) setOrders(cachedOrders);
    const cachedBills = api.getCachedBills();
    if (cachedBills) setBills(cachedBills);

    load();
    setViewMode("tables");
  }, [load]));

  // Auto-handle table route param if passed
  useEffect(() => {
    if (tableParam && tables.length > 0) {
      const matched = tables.find(t => isSameTable(t.label, tableParam));
      if (matched) {
        onSelectTable(matched);
      } else {
        setTable(tableParam);
        setCurrentGuestName("Guest 1");
        setCurrentSessionId("tsess_" + Math.random().toString(36).substring(2, 9));
        setViewMode("menu_order");
      }
    }
  }, [tableParam, tables]);

  const { subscribe } = useNotifications();

  // Instant WebSocket State Reconciliation
  useEffect(() => {
    return subscribe((notif) => {
      // 0ms instant table state update on payment / order completion
      const data = notif.data;
      if (data) {
        const { order_id, status, table_number, event } = data;
        if (event === "TABLE_SETTLED") {
          setOrders(prev => prev.map(o => (table_number && isSameTable(o.table_number, table_number)) ? { ...o, status: "served" } : o));
        } else if (order_id && (event === "ORDER_SERVED" || event === "ORDER_PAID" || status === "served" || status === "paid")) {
          setOrders(prev => prev.map(o => o.id === order_id ? { ...o, status: "served" } : o));
        } else if (order_id && status) {
          setOrders(prev => prev.map(o => o.id === order_id ? { ...o, status } : o));
        }
      }

      // Refresh local cache and states from server to stay 100% consistent across all devices
      if (notif.category === "kitchen" || notif.category === "payment" || notif.category === "waiter") {
        api.listOrders().then(fresh => { if (fresh) setOrders(fresh); }).catch(() => {});
        api.listBills().then(fresh => { if (fresh) setBills(fresh); }).catch(() => {});
      }
    });
  }, [subscribe]);

// Table number matching normalizer to guarantee table orders are never lost
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

// Helper to determine table status & matching active orders
const getTableStatusInfo = (tblLabel: string, ordersList: any[], billsList: any[]) => {
  const matchingOrders = ordersList.filter(
    (o: any) => isSameTable(o.table_number, tblLabel) && o.status !== "served" && o.status !== "cancelled" && o.status !== "pending_scan"
  );
  if (matchingOrders.length === 0) return { status: "Available", orders: [], bill: null, isWeb: false, activeCount: 0 };

  const matchingBill = billsList.find((b: any) => matchingOrders.some((o: any) => o.id === b.order_id) && b.status !== "paid");
  if (matchingBill) return { status: "Billed", orders: matchingOrders, bill: matchingBill, isWeb: false, activeCount: matchingOrders.length };

  const allWeb = matchingOrders.every((o: any) => o.created_by === "guest" || o.order_source === "qr_web" || billsList.some((b: any) => b.order_id === o.id && b.status === "paid"));

  return { 
    status: allWeb ? "Web Paid" : "Occupied", 
    orders: matchingOrders, 
    bill: null, 
    isWeb: allWeb, 
    activeCount: matchingOrders.length 
  };
};

  const counts = tables.reduce(
    (acc, t) => {
      const { status } = getTableStatusInfo(t.label, orders, bills);
      if (status === "Available") acc.available += 1;
      else if (status === "Occupied" || status === "Web Paid") acc.occupied += 1;
      else if (status === "Billed") acc.billed += 1;
      else if (status === "Reserved") acc.reserved += 1;
      return acc;
    },
    { available: 0, occupied: 0, billed: 0, reserved: 0 }
  );

  const onSelectTable = (tbl: Table) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setSelectedTableObj(tbl);
    setTable(tbl.label);
    const { status, orders: tblOrders } = getTableStatusInfo(tbl.label, orders, bills);

    if (tblOrders.length > 0) {
      setActiveOrder(tblOrders[0]);
      setViewMode("order_details");
    } else {
      setActiveOrder(null);
      setCurrentGuestName("Guest 1");
      setCurrentSessionId("tsess_" + Math.random().toString(36).substring(2, 9));
      setLines([]);
      setViewMode("menu_order");
    }
  };

  const filtered = useMemo(() => {
    let list = items;
    if (selCat !== "all") list = list.filter(i => i.category_id === selCat);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i => i.name.toLowerCase().includes(q));
    }
    return list;
  }, [items, selCat, search]);

  const pulse = () => {
    scale.value = withSpring(1.12, { damping: 8 }, () => { scale.value = withSpring(1); });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const add = (it: Item) => {
    pulse();
    setLines(prev => {
      const idx = prev.findIndex(l => l.menu_item_id === it.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + 1 };
        return copy;
      }
      return [...prev, { menu_item_id: it.id, name: it.name, price: it.price, quantity: 1, notes: "" }];
    });
  };
  const inc = (id: string) => { pulse(); setLines(p => p.map(l => l.menu_item_id === id ? { ...l, quantity: l.quantity + 1 } : l)); };
  const dec = (id: string) => { pulse(); setLines(p => p.flatMap(l => l.menu_item_id === id ? (l.quantity > 1 ? [{ ...l, quantity: l.quantity - 1 }] : []) : [l])); };
  const remove = (id: string) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); setLines(p => p.filter(l => l.menu_item_id !== id)); };

  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.price * l.quantity, 0), [lines]);
  const totalQty = useMemo(() => lines.reduce((s, l) => s + l.quantity, 0), [lines]);


  const submitOrder = async () => {
    if (!table.trim()) { setErr("Choose a table."); return; }
    if (lines.length === 0) { setErr("Add at least one item."); return; }
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const isEdit = !!activeOrder;
      const guestName = currentGuestName || activeOrder?.customer_name || "Guest 1";
      const sessId = currentSessionId || activeOrder?.session_id || "tsess_" + Math.random().toString(36).substring(2, 9);
      const tblLabel = table.trim();

      let realOrder: any;
      if (isEdit) {
        realOrder = await api.updateOrder(activeOrder.id, { items: lines, notes: "", customer_name: guestName });
      } else {
        realOrder = await api.createOrder({ table_number: tblLabel, items: lines, notes: "", session_id: sessId, customer_name: guestName });
      }

      setOrders(prev => [realOrder, ...prev.filter(o => o.id !== realOrder.id && !String(o.id).startsWith("temp-"))]);
      setTables(prev => prev.map(t => isSameTable(t.label, tblLabel) ? { ...t, status: "occupied" } : t));
      
      setLines([]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      
      const tblObj = tables.find(t => isSameTable(t.label, tblLabel)) || { id: "temp-tbl", label: tblLabel, status: "occupied", seats: 4 };
      setSelectedTableObj(tblObj);
      setTable(tblLabel);
      setActiveOrder(realOrder);
      setViewMode("order_details");

      const settings = await getPrinterSettings("kitchen");
      if (settings && settings.type !== "none" && settings.auto_print) {
        await printKitchenKOT(realOrder);
      }
    } catch (e: any) {
      setErr(e.message || "Failed to place order.");
    } finally {
      setBusy(false);
    }
  };

  // -------------------------------------------------------------
  // VIEW 1: OCCUPIED TABLE / MULTI-CUSTOMER ORDER DETAILS SCREEN
  // -------------------------------------------------------------
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());

  const tableOrders = selectedTableObj
    ? orders.filter(
        (o: any) => isSameTable(o.table_number, selectedTableObj.label) && o.status !== "served" && o.status !== "cancelled" && o.status !== "pending_scan"
      )
    : [];

  const totalTableAmount = tableOrders.reduce((sum: number, o: any) => sum + (o.subtotal || 0), 0);
  const uniqueGuests = Array.from(new Set(tableOrders.map((o: any) => o.customer_name || "Guest 1")));

  if (viewMode === "order_details" && selectedTableObj) {
    const allWebPaid = tableOrders.length > 0 && tableOrders.every((o: any) => o.created_by === "guest" || o.order_source === "qr_web" || bills.some((b: any) => b.order_id === o.id && b.status === "paid"));

    const completeIndividualOrder = async (orderIdToComplete: string) => {
      if (completingIds.has(orderIdToComplete)) return;
      setCompletingIds(prev => new Set(prev).add(orderIdToComplete));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      
      // Optimistic local state update
      setOrders(prev => prev.map(o => o.id === orderIdToComplete ? { ...o, status: "served" } : o));
      
      const remaining = tableOrders.filter((o: any) => o.id !== orderIdToComplete && o.status !== "served");
      if (remaining.length === 0) {
        setViewMode("tables");
      }

      try {
        await api.updateOrderStatus(orderIdToComplete, "served");
      } catch (e: any) {
        console.warn("Failed to complete order:", e);
        await load();
      } finally {
        setCompletingIds(prev => {
          const next = new Set(prev);
          next.delete(orderIdToComplete);
          return next;
        });
      }
    };

    const completeAllTableOrders = async () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setOrders(prev => prev.map(o => tableOrders.some(to => to.id === o.id) ? { ...o, status: "served" } : o));
      setViewMode("tables");

      try {
        await Promise.all(tableOrders.map(o => api.updateOrderStatus(o.id, "served")));
      } catch (e: any) {
        console.warn("Failed to complete all orders:", e);
        await load();
      }
    };

    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.surface }]}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.surface} />
        <View style={[styles.wrap, { paddingTop: insets.top, backgroundColor: theme.surface }]}>
          
          {/* Header Bar */}
          <View style={styles.detailsHeader}>
            <Pressable onPress={() => setViewMode("tables")} style={styles.backBtn} hitSlop={12}>
              <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
            </Pressable>
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={styles.detailsTitle}>Table {selectedTableObj.label}</Text>
              <Text style={styles.detailsSub}>
                Main • {selectedTableObj.seats} seats • {tableOrders.length} {tableOrders.length === 1 ? "Order" : "Orders"} ({uniqueGuests.length} {uniqueGuests.length === 1 ? "Customer" : "Customers"})
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ fontSize: 11, color: theme.onSurfaceSecondary, fontWeight: "600" }}>ACTIVE TOTAL</Text>
              <Text style={{ fontSize: 17, fontWeight: "800", color: "#635BFF" }}>₹{totalTableAmount}</Text>
            </View>
          </View>

          {/* Orders Scrollable List */}
          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 180 + insets.bottom }} showsVerticalScrollIndicator={false}>
            {tableOrders.length === 0 ? (
              <View style={[styles.center, { paddingVertical: 60 }]}>
                <Ionicons name="checkmark-circle" size={48} color="#10B981" />
                <Text style={{ fontSize: 16, fontWeight: "700", color: theme.onSurface, marginTop: 12 }}>All orders completed!</Text>
                <Text style={{ fontSize: 13, color: theme.onSurfaceSecondary, marginTop: 4 }}>This table is ready for new guests.</Text>
                <Pressable
                  style={[styles.addOrderBtn, { marginTop: 20, width: "60%" }]}
                  onPress={() => setViewMode("tables")}
                >
                  <Text style={styles.addOrderBtnText}>Back to Tables</Text>
                </Pressable>
              </View>
            ) : (
              tableOrders.map((order: any, idx: number) => {
                const orderNum = order.order_number || order.id?.slice(-4) || `${idx + 1}`;
                const statusText = (order.status || "PLACED").toUpperCase();
                const isWebOrder = order.created_by === "guest" || order.order_source === "qr_web" || order.notes?.includes("Web Order");
                const custName = order.customer_name || `Guest ${idx + 1}`;
                const orderTotal = order.subtotal || (order.items || []).reduce((acc: number, x: any) => acc + (x.price * x.quantity), 0);

                return (
                  <View key={order.id || idx} style={[styles.orderCard, { marginBottom: spacing.md, backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
                    <View style={styles.orderCardHeader}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={[styles.orderCardNum, { color: "#635BFF", fontSize: 15 }]}>👤 {custName}</Text>
                        <Text style={[styles.orderCardNum, { fontSize: 13, color: theme.onSurfaceSecondary }]}>#{orderNum}</Text>
                      </View>
                      <View style={[styles.statusPill, { backgroundColor: isWebOrder ? (isDark ? "#065F46" : "#DCFCE7") : (order.status === "placed" ? "#EEF2FF" : "#ECFDF5") }]}>
                        <Text style={[styles.statusPillText, { color: isWebOrder ? (isDark ? "#34D399" : "#16A34A") : (order.status === "placed" ? "#635BFF" : "#10B981") }]}>
                          {isWebOrder ? "WEB QR" : statusText}
                        </Text>
                      </View>
                    </View>

                    {/* Items List */}
                    <View style={{ marginVertical: spacing.sm }}>
                      {(order.items || []).map((it: any, iIdx: number) => (
                        <View key={iIdx} style={styles.itemRow}>
                          <Text style={styles.itemQty}>{it.quantity}×</Text>
                          <Text style={[styles.itemTitle, { color: theme.onSurface }]}>{it.name}</Text>
                          <Text style={[styles.itemAmt, { color: theme.onSurface }]}>₹{it.price * it.quantity}</Text>
                        </View>
                      ))}
                    </View>

                    {/* Special Cooking Instructions / Notes */}
                    {order.notes ? (
                      <View style={[
                        styles.notesContainer, 
                        { 
                          backgroundColor: isDark ? "#2B2212" : "#FFFBEB", 
                          borderColor: isDark ? "#78350F" : "#FDE68A",
                          marginVertical: spacing.xs
                        }
                      ]}>
                        <Ionicons name="document-text-outline" size={14} color={isDark ? "#FBBF24" : "#D97706"} />
                        <Text style={[styles.notesText, { color: isDark ? "#FBBF24" : "#D97706", fontSize: 12 }]}>
                          {order.notes}
                        </Text>
                      </View>
                    ) : null}

                    {/* Footer / Subtotal + Actions */}
                    <View style={[styles.subtotalRow, { borderTopColor: theme.border }]}>
                      <View>
                        <Text style={[styles.subtotalLbl, { color: theme.onSurfaceSecondary }]}>Order Amount</Text>
                        <Text style={[styles.subtotalVal, { color: theme.onSurface }]}>₹{orderTotal}</Text>
                      </View>

                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <Pressable
                          style={[styles.guestActionBtn, { borderColor: theme.border, backgroundColor: theme.surfaceTertiary }]}
                          onPress={() => {
                            setActiveOrder(order);
                            setCurrentGuestName(custName);
                            setCurrentSessionId(order.session_id || "");
                            const mapped: Line[] = (order.items || []).map((it: any) => ({
                              menu_item_id: it.menu_item_id || it.id || "",
                              name: it.name,
                              price: it.price,
                              quantity: it.quantity,
                              notes: it.notes || "",
                            }));
                            setLines(mapped);
                            setViewMode("menu_order");
                          }}
                        >
                          <Ionicons name="create-outline" size={14} color="#635BFF" />
                          <Text style={{ fontSize: 12, fontWeight: "700", color: "#635BFF", marginLeft: 4 }}>Edit</Text>
                        </Pressable>

                        <Pressable
                          style={[styles.guestActionBtn, { backgroundColor: "#635BFF", borderColor: "#635BFF" }]}
                          onPress={() => router.push({ pathname: "/(app)/billing", params: { orderId: order.id, backTo: "/(app)/waiter" } })}
                        >
                          <Ionicons name="receipt-outline" size={14} color="#FFF" />
                          <Text style={{ fontSize: 12, fontWeight: "700", color: "#FFF", marginLeft: 4 }}>Bill Guest</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* Bottom Action Bar */}
          <View style={[styles.bottomActionBar, { backgroundColor: theme.surface, borderTopColor: theme.border, paddingBottom: Math.max(insets.bottom, 16) + spacing.md }]}>
            <Pressable
              style={styles.addOrderBtn}
              onPress={() => setShowGuestPicker(true)}
            >
              <Ionicons name="person-add-outline" size={18} color="#635BFF" />
              <Text style={styles.addOrderBtnText}>+ Add Order</Text>
            </Pressable>

            <Pressable
              style={styles.genBillBtn}
              onPress={() => {
                router.push({ pathname: "/(app)/billing", params: { tableNumber: selectedTableObj.label, backTo: "/(app)/waiter" } });
              }}
            >
              <View>
                <Text style={styles.genBillAmt}>₹{totalTableAmount}</Text>
                <Text style={styles.genBillSub}>Settle Entire Table</Text>
              </View>
              <Ionicons name="receipt-outline" size={22} color="#FFFFFF" />
            </Pressable>
          </View>

          {/* Guest Selector Modal */}
          {showGuestPicker && (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end", zIndex: 999 }]}>
              <View style={[styles.guestPickerSheet, { backgroundColor: theme.surface, paddingBottom: insets.bottom + 20 }]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <Text style={[styles.guestPickerTitle, { color: theme.onSurface }]}>Select Customer for Table {selectedTableObj.label}</Text>
                  <Pressable onPress={() => setShowGuestPicker(false)} hitSlop={12}>
                    <Ionicons name="close" size={22} color={theme.onSurfaceSecondary} />
                  </Pressable>
                </View>

                {uniqueGuests.map((gName, gIdx) => (
                  <Pressable
                    key={gIdx}
                    style={[styles.guestPickerOption, { borderColor: theme.border, backgroundColor: theme.surfaceSecondary }]}
                    onPress={() => {
                      setShowGuestPicker(false);
                      setActiveOrder(null);
                      setCurrentGuestName(gName);
                      setCurrentSessionId("tsess_" + Math.random().toString(36).substring(2, 9));
                      setLines([]);
                      setViewMode("menu_order");
                    }}
                  >
                    <Ionicons name="person" size={18} color="#635BFF" />
                    <Text style={[styles.guestPickerOptionText, { color: theme.onSurface }]}>Add items for {gName}</Text>
                  </Pressable>
                ))}

                <Pressable
                  style={[styles.guestPickerOption, { borderColor: "#635BFF", backgroundColor: isDark ? "rgba(99,91,255,0.15)" : "#EEF2FF" }]}
                  onPress={() => {
                    setShowGuestPicker(false);
                    setActiveOrder(null);
                    const newGuestLabel = `Guest ${uniqueGuests.length + 1}`;
                    setCurrentGuestName(newGuestLabel);
                    setCurrentSessionId("tsess_" + Math.random().toString(36).substring(2, 9));
                    setLines([]);
                    setViewMode("menu_order");
                  }}
                >
                  <Ionicons name="add-circle" size={20} color="#635BFF" />
                  <Text style={[styles.guestPickerOptionText, { color: "#635BFF", fontWeight: "700" }]}>+ New Customer (Guest {uniqueGuests.length + 1})</Text>
                </Pressable>
              </View>
            </View>
          )}

        </View>
      </SafeAreaView>
    );
  }

  // -------------------------------------------------------------
  // VIEW 2: TABLES SELECTION GRID (MAIN WAITER ENTRY SCREEN)
  // -------------------------------------------------------------
  if (viewMode === "tables") {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.surface }]}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.surface} />
        <View style={[styles.wrap, { paddingTop: insets.top, backgroundColor: theme.surface }]} testID="waiter-screen">
          
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={[styles.title, { color: theme.onSurface, marginBottom: 0 }]}>Tables</Text>
                <View style={{ backgroundColor: "rgba(16, 185, 129, 0.15)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#10B981" }} />
                  <Text style={{ fontSize: 9, color: "#10B981", fontWeight: "700" }}>Live</Text>
                </View>
              </View>
              <Text style={[styles.subtitle, { color: theme.onSurfaceSecondary, marginTop: 2 }]}>Tap a table to take order & view status</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Pressable
                style={[styles.logoutPill, { backgroundColor: isDark ? "rgba(99,91,255,0.15)" : "#EEF2FF", borderColor: "#635BFF" }]}
                onPress={() => setShowScanner(true)}
              >
                <Ionicons name="qr-code-outline" size={18} color="#635BFF" />
                <Text style={[styles.logoutText, { color: "#635BFF" }]}>Scan Order</Text>
              </Pressable>
              <Pressable style={styles.logoutPill} onPress={logout} testID="waiter-logout-btn">
                <Ionicons name="log-out-outline" size={18} color="#EF4444" />
                <Text style={styles.logoutText}>Logout</Text>
              </Pressable>
            </View>
          </View>

          {/* Legend Summary Row */}
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: "#10B981" }]} />
              <Text style={[styles.legendText, { color: theme.onSurfaceSecondary }]}>Available • <Text style={[styles.legendCount, { color: theme.onSurface }]}>{counts.available}</Text></Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: "#F59E0B" }]} />
              <Text style={[styles.legendText, { color: theme.onSurfaceSecondary }]}>Occupied • <Text style={[styles.legendCount, { color: theme.onSurface }]}>{counts.occupied}</Text></Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: "#EF4444" }]} />
              <Text style={[styles.legendText, { color: theme.onSurfaceSecondary }]}>Billed • <Text style={[styles.legendCount, { color: theme.onSurface }]}>{counts.billed}</Text></Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: "#3B82F6" }]} />
              <Text style={[styles.legendText, { color: theme.onSurfaceSecondary }]}>Reserved • <Text style={[styles.legendCount, { color: theme.onSurface }]}>{counts.reserved}</Text></Text>
            </View>
          </View>

          {/* Main Section Title */}
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.onSurface }]}>Main</Text>
          </View>

          {loading ? (
            <View style={styles.center}><ActivityIndicator size="large" color="#635BFF" /></View>
          ) : tables.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="grid-outline" size={48} color={theme.onSurfaceTertiary} />
              <Text style={{ color: theme.onSurfaceSecondary, marginTop: 8, fontSize: 15 }}>No tables found.</Text>
            </View>
          ) : (
            <FlatList
              data={tables}
              keyExtractor={t => t.id}
              numColumns={3}
              columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
              contentContainerStyle={{ paddingTop: spacing.xs, paddingBottom: spacing.xxxl, gap: spacing.md }}
              showsVerticalScrollIndicator={false}
              renderItem={({ item, index }) => {
                const { status } = getTableStatusInfo(item.label, orders, bills);
                let bgColor = isDark ? "#161C2E" : "#ECFDF5";
                let borderColor = isDark ? "#065F46" : "#A7F3D0";
                let textColor = isDark ? "#34D399" : "#10B981";
                let iconName: any = "checkmark-circle-outline";

                if (status === "Web Paid") {
                  bgColor = isDark ? "#13232C" : "#F0FDF4";
                  borderColor = isDark ? "#065F46" : "#86EFAC";
                  textColor = isDark ? "#34D399" : "#10B981";
                  iconName = "globe-outline";
                } else if (status === "Billed") {
                  bgColor = isDark ? "#161C2E" : "#FEF2F2";
                  borderColor = isDark ? "#7F1D1D" : "#FECACA";
                  textColor = isDark ? "#F87171" : "#EF4444";
                  iconName = "square";
                } else if (status === "Occupied") {
                  bgColor = isDark ? "#161C2E" : "#FFFBEB";
                  borderColor = isDark ? "#78350F" : "#FDE68A";
                  textColor = isDark ? "#FBBF24" : "#F59E0B";
                  iconName = "flame-outline";
                } else if (status === "Reserved") {
                  bgColor = isDark ? "#161C2E" : "#EFF6FF";
                  borderColor = isDark ? "#1E3A8A" : "#BAE6FD";
                  textColor = isDark ? "#60A5FA" : "#3B82F6";
                  iconName = "bookmark-outline";
                }

                return (
                  <Animated.View entering={FadeInDown.delay(index * 40).springify()} style={{ flex: 1 }}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.tableCard,
                        { backgroundColor: bgColor, borderColor: borderColor },
                        pressed && styles.cardPressed,
                      ]}
                      onPress={() => onSelectTable(item)}
                      testID={`waiter-table-${item.id}`}
                    >
                      <View style={[styles.badgeIconBox, { backgroundColor: borderColor }]}>
                        <Ionicons name={iconName} size={14} color={textColor} />
                      </View>

                      <Text style={[styles.cardLabel, { color: theme.onSurface }]}>{item.label}</Text>
                      <Text style={[styles.cardSeats, { color: theme.onSurfaceSecondary }]}>{item.seats} seats</Text>
                      <Text style={[styles.cardStatus, { color: textColor }]}>{status}</Text>
                    </Pressable>
                  </Animated.View>
                );
              }}
            />
          )}

          {/* Customer Order QR Scanner Modal with Camera & Manual Fallback */}
          <OrderQRScannerModal
            visible={showScanner}
            onClose={() => setShowScanner(false)}
            onScanSuccess={handleScanImport}
          />

        </View>
      </SafeAreaView>
    );
  }

  // -------------------------------------------------------------
  // VIEW 3: MENU DISH SELECTION / ORDER CREATION SCREEN
  // -------------------------------------------------------------
  const displayGuests = [...uniqueGuests];
  if (currentGuestName && !displayGuests.includes(currentGuestName)) {
    displayGuests.push(currentGuestName);
  }

  return (
    <View style={[styles.wrap, { paddingTop: insets.top, backgroundColor: theme.surface }]} testID="waiter-screen">
      
      {/* Top Header with Back to Details */}
      <View style={[styles.menuHeaderBar, { backgroundColor: theme.surface }]}>
        <Pressable onPress={() => setViewMode("order_details")} style={[styles.backBtn, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={theme.onSurface} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <Text style={[styles.detailsTitle, { color: theme.onSurface }]}>Table {selectedTableObj?.label || table}</Text>
          <Text style={[styles.detailsSub, { color: theme.onSurfaceSecondary }]}>
            Main • {selectedTableObj?.seats || 4} seats • {tableOrders.length} open {tableOrders.length === 1 ? "order" : "orders"}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Redesigned Add Order - Guest/Customer Selector */}
      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.border, backgroundColor: theme.surface }}>
        <Text style={{ fontSize: 11, fontWeight: "700", color: theme.onSurfaceSecondary, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>Select Guest to Add Items</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
          {displayGuests.map((gName, idx) => {
            const isActive = gName === currentGuestName;
            const matchedOrder = tableOrders.find((o: any) => (o.customer_name || "Guest 1") === gName);
            const orderAmt = matchedOrder ? matchedOrder.subtotal || 0 : 0;
            return (
              <Pressable
                key={gName + idx}
                style={[
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 12,
                    borderWidth: 1,
                    gap: 6
                  },
                  isActive
                    ? { backgroundColor: "#635BFF", borderColor: "#635BFF" }
                    : { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }
                ]}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setCurrentGuestName(gName);
                  if (matchedOrder) {
                    setActiveOrder(matchedOrder);
                    setCurrentSessionId(matchedOrder.session_id);
                    setLines((matchedOrder.items || []).map((it: any) => ({
                      menu_item_id: it.menu_item_id || it.id || "",
                      name: it.name,
                      price: it.price,
                      quantity: it.quantity,
                      notes: it.notes || "",
                    })));
                  } else {
                    setActiveOrder(null);
                    setLines([]);
                  }
                }}
              >
                <Ionicons name="person" size={14} color={isActive ? "#FFF" : theme.onSurfaceSecondary} />
                <Text style={{ fontSize: 13, fontWeight: "700", color: isActive ? "#FFF" : theme.onSurface }}>
                  {gName} {orderAmt > 0 ? `(₹${orderAmt})` : ""}
                </Text>
              </Pressable>
            );
          })}
          
          <Pressable
            style={[
              {
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#635BFF",
                backgroundColor: isDark ? "rgba(99,91,255,0.15)" : "#EEF2FF",
                gap: 6
              }
            ]}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setActiveOrder(null);
              const nextNum = uniqueGuests.length + 1;
              const nextLabel = `Guest ${nextNum}`;
              setCurrentGuestName(nextLabel);
              setCurrentSessionId("tsess_" + Math.random().toString(36).substring(2, 9));
              setLines([]);
            }}
          >
            <Ionicons name="add-circle" size={16} color="#635BFF" />
            <Text style={{ fontSize: 13, fontWeight: "800", color: "#635BFF" }}>
              + Add Guest
            </Text>
          </Pressable>
        </ScrollView>
      </View>

      <View style={[styles.orderPane, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
        <View style={styles.orderHeader}>
          <Text style={[styles.paneTitle, { color: theme.onSurface }]}>Current Order Items</Text>
          <AnimText style={[styles.subVal, animStyle, { color: theme.onSurface }]} testID="waiter-subtotal">₹{subtotal.toFixed(0)}</AnimText>
        </View>
        {lines.length === 0 ? (
          <View style={styles.emptyOrder}>
            <Ionicons name="cart-outline" size={26} color={theme.onSurfaceTertiary} />
            <Text style={{ color: theme.onSurfaceTertiary, marginTop: 6 }}>No items added</Text>
          </View>
        ) : (
          <FlatList
            data={lines}
            keyExtractor={l => l.menu_item_id}
            renderItem={({ item }) => (
              <Animated.View entering={FadeInDown.springify()} style={[styles.line, { backgroundColor: theme.surfaceTertiary, borderColor: theme.border }]} testID={`order-line-${item.menu_item_id}`}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.lineName, { color: theme.onSurface }]}>{item.name}</Text>
                  <Text style={[styles.linePrice, { color: theme.onSurfaceSecondary }]}>₹{item.price} × {item.quantity} = ₹{(item.price * item.quantity).toFixed(0)}</Text>
                </View>
                <Pressable onPress={() => dec(item.menu_item_id)} style={[styles.qBtn, { backgroundColor: theme.surfaceSecondary }]} testID={`order-dec-${item.menu_item_id}`}>
                  <Ionicons name="remove" size={16} color={theme.onSurface} />
                </Pressable>
                <Text style={[styles.qty, { color: theme.onSurface }]}>{item.quantity}</Text>
                <Pressable onPress={() => inc(item.menu_item_id)} style={[styles.qBtn, { backgroundColor: theme.surfaceSecondary }]} testID={`order-inc-${item.menu_item_id}`}>
                  <Ionicons name="add" size={16} color={theme.onSurface} />
                </Pressable>
                <Pressable onPress={() => remove(item.menu_item_id)} style={{ marginLeft: 6 }} testID={`order-del-${item.menu_item_id}`} hitSlop={8}>
                  <Ionicons name="trash" size={18} color={colors.onError} />
                </Pressable>
              </Animated.View>
            )}
          />
        )}
      </View>

      <View style={[styles.menuPane, { backgroundColor: theme.surface }]}>
        <View style={[styles.searchRow, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
          <Ionicons name="search" size={16} color={theme.onSurfaceTertiary} />
          <TextInput
            value={search} onChangeText={setSearch} placeholder="Search dishes"
            placeholderTextColor={theme.onSurfaceTertiary} style={[styles.search, { color: theme.onSurface }]}
            testID="waiter-search-input"
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsWrap} contentContainerStyle={styles.chipsRow}>
          <Chip label="All" active={selCat === "all"} onPress={() => setSelCat("all")} testID="wchip-all" />
          {cats.map(c => (
            <Chip key={c.id} label={c.name} active={selCat === c.id} onPress={() => setSelCat(c.id)} testID={`wchip-${c.id}`} />
          ))}
        </ScrollView>
        {loading ? (
          <View style={styles.empty}><ActivityIndicator color={colors.brand} /></View>
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ color: colors.onSurfaceTertiary }}>No items. Add via Menu tab.</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={i => i.id}
            numColumns={2}
            columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
            contentContainerStyle={{ paddingBottom: 140, paddingTop: spacing.md, gap: spacing.md }}
            renderItem={({ item, index }) => (
              <Animated.View entering={FadeInUp.delay(index * 30).springify()} style={{ flex: 1 }}>
                <Pressable style={styles.menuCard} onPress={() => add(item)} testID={`waiter-add-${item.id}`}>
                  <Image source={menuItemImageSource(item)} style={styles.menuImg} contentFit="cover" transition={200} />
                  <View style={styles.menuOverlay}>
                    <Text style={styles.menuName} numberOfLines={2}>{item.name}</Text>
                    <Text style={styles.menuPrice}>₹{item.price}</Text>
                  </View>
                  <View style={styles.plus}><Ionicons name="add" size={16} color={colors.onBrand} /></View>
                </Pressable>
              </Animated.View>
            )}
          />
        )}
      </View>

      {err && <Text style={styles.err} testID="waiter-error">{err}</Text>}

      {totalQty > 0 && (
        <View style={[styles.cta, { bottom: insets.bottom + 12 }]}>
          <SlideToOrder 
            onSlideComplete={submitOrder} 
            busy={busy} 
            totalQty={totalQty} 
            subtotal={subtotal} 
          />
        </View>
      )}
    </View>
  );
}

function SlideToOrder({ onSlideComplete, busy, totalQty, subtotal }: { onSlideComplete: () => void; busy: boolean; totalQty: number; subtotal: number }) {
  const onSlideCompleteRef = useRef(onSlideComplete);
  useEffect(() => {
    onSlideCompleteRef.current = onSlideComplete;
  }, [onSlideComplete]);

  const pan = useRef(new RNAnimated.Value(0)).current;
  const [completed, setCompleted] = useState(false);
  const [trackWidth, setTrackWidth] = useState(Dimensions.get("window").width - 32);

  const thumbSize = 48;
  const maxDistance = Math.max(0, trackWidth - thumbSize - 8);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !busy && !completed,
      onMoveShouldSetPanResponder: () => !busy && !completed,
      onPanResponderMove: (e, gestureState) => {
        const x = Math.max(0, Math.min(maxDistance, gestureState.dx));
        pan.setValue(x);
      },
      onPanResponderRelease: (e, gestureState) => {
        if (gestureState.dx >= maxDistance * 0.75) {
          setCompleted(true);
          RNAnimated.spring(pan, {
            toValue: maxDistance,
            useNativeDriver: true,
            bounciness: 0,
          }).start(() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            onSlideCompleteRef.current();
            setTimeout(() => {
              RNAnimated.spring(pan, {
                toValue: 0,
                useNativeDriver: true,
              }).start(() => {
                setCompleted(false);
              });
            }, 1000);
          });
        } else {
          RNAnimated.spring(pan, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  const textOpacity = pan.interpolate({
    inputRange: [0, maxDistance * 0.5],
    outputRange: [1, 0.1],
    extrapolate: "clamp",
  });

  return (
    <View 
      style={styles.slideTrack}
      onLayout={(e) => {
        const width = e.nativeEvent.layout.width;
        if (width > 0) setTrackWidth(width);
      }}
      testID="waiter-send-btn"
    >
      <RNAnimated.Text style={[styles.slideText, { opacity: textOpacity }]}>
        👉 Slide to Place Order ({totalQty} • ₹{subtotal.toFixed(0)})
      </RNAnimated.Text>

      <RNAnimated.View
        {...panResponder.panHandlers}
        style={[
          styles.slideThumb,
          {
            transform: [{ translateX: pan }],
          },
        ]}
      >
        {busy ? (
          <ActivityIndicator color="#635BFF" size="small" />
        ) : (
          <Ionicons name="chevron-forward" size={24} color="#635BFF" />
        )}
      </RNAnimated.View>
    </View>
  );
}

function Chip({ label, active, onPress, testID }: { label: string; active: boolean; onPress: () => void; testID: string }) {
  const { theme } = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.chip, { backgroundColor: active ? "#635BFF" : theme.surfaceSecondary, borderColor: active ? "#635BFF" : theme.border }, { flexShrink: 0 }]} testID={testID}>
      <Text style={[styles.chipText, { color: active ? "#FFFFFF" : theme.onSurfaceSecondary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  wrap: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  title: { color: colors.onSurface, fontSize: 28, fontWeight: "900" },
  subtitle: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 2, fontWeight: "500" },
  logoutPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FEF2F2", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: "#FECACA" },
  logoutText: { color: "#EF4444", fontSize: 13, fontWeight: "800" },
  legendRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, paddingHorizontal: spacing.lg, marginVertical: spacing.md },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "600" },
  legendCount: { color: colors.onSurface, fontWeight: "800" },
  sectionHeader: { paddingHorizontal: spacing.lg, marginBottom: spacing.xs },
  sectionTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "800" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  
  tableCard: {
    flex: 1,
    aspectRatio: 0.85,
    padding: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    alignItems: "flex-start",
    justifyContent: "space-between",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  cardPressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
  badgeIconBox: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  cardLabel: { color: colors.onSurface, fontSize: 22, fontWeight: "900", marginTop: 4 },
  cardSeats: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "600" },
  cardStatus: { fontSize: 13, fontWeight: "800", marginTop: 2 },

  // Details View Styles (Matching Screenshot)
  detailsHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, justifyContent: "center", alignItems: "center" },
  detailsTitle: { color: colors.onSurface, fontSize: 24, fontWeight: "900" },
  detailsSub: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 2, fontWeight: "500" },
  orderCard: {
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
  orderCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderCardNum: { color: colors.onSurface, fontSize: 20, fontWeight: "900" },
  statusPill: { backgroundColor: "#ECEBFF", paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill },
  statusPillText: { color: "#635BFF", fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
  itemRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.xs },
  itemQty: { color: "#635BFF", fontSize: 15, fontWeight: "800", width: 30 },
  itemTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "600", flex: 1 },
  itemAmt: { color: colors.onSurface, fontSize: 16, fontWeight: "700" },
  subtotalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: "#F1F5F9" },
  subtotalLbl: { color: colors.onSurfaceSecondary, fontSize: 14, fontWeight: "500" },
  subtotalVal: { color: colors.onSurface, fontSize: 18, fontWeight: "900" },

  bottomActionBar: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#FFFFFF", flexDirection: "row", padding: spacing.lg, gap: spacing.md, borderTopWidth: 1, borderTopColor: "#E2E8F0" },
  addOrderBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 16, borderRadius: radius.lg, backgroundColor: "#F1F0FF", borderWidth: 1, borderColor: "rgba(99,91,255,0.2)" },
  addOrderBtnText: { color: "#635BFF", fontSize: 15, fontWeight: "800" },
  genBillBtn: { flex: 1.3, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: 12, borderRadius: radius.lg, backgroundColor: "#635BFF" },
  genBillAmt: { color: "#FFFFFF", fontSize: 18, fontWeight: "900" },
  genBillSub: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "600" },

  // Menu Order Mode Styles
  menuHeaderBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  menuHeaderTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "800" },
  orderPane: { height: "32%", backgroundColor: colors.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  orderHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  paneTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "700" },
  tableChipsWrap: { maxHeight: 44, minHeight: 44 },
  tableChipsRow: { gap: spacing.sm, alignItems: "center", paddingRight: spacing.md },
  tableInputInline: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 8, color: colors.onSurface, minWidth: 100, borderWidth: 1, borderColor: colors.border },
  emptyOrder: { flex: 1, alignItems: "center", justifyContent: "center" },
  line: { flexDirection: "row", alignItems: "center", paddingVertical: 8, gap: 6 },
  lineName: { color: colors.onSurface, fontSize: 14, fontWeight: "600" },
  linePrice: { color: colors.onSurfaceSecondary, fontSize: 11 },
  qBtn: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  qty: { color: colors.onSurface, minWidth: 20, textAlign: "center", fontWeight: "600" },
  subVal: { color: colors.brand, fontSize: 22, fontWeight: "700" },

  menuPane: { flex: 1 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surfaceSecondary, marginHorizontal: spacing.lg, marginTop: spacing.md, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  search: { flex: 1, color: colors.onSurface, paddingVertical: 10 },
  chipsWrap: { maxHeight: 56, minHeight: 56, marginTop: spacing.sm },
  chipsRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: "center" },
  chip: { paddingHorizontal: 14, height: 36, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, justifyContent: "center" },
  chipActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brand },
  chipText: { color: colors.onSurfaceSecondary, fontSize: 13 },
  chipTextActive: { color: colors.brand, fontWeight: "600" },
  menuCard: { aspectRatio: 0.95, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  menuImg: { flex: 1, width: "100%" },
  menuOverlay: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "rgba(13,13,13,0.75)", padding: spacing.sm },
  menuName: { color: colors.onSurface, fontSize: 13, fontWeight: "600" },
  menuPrice: { color: colors.brand, fontSize: 15, fontWeight: "700", marginTop: 2 },
  plus: { position: "absolute", right: 8, top: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  cta: { position: "absolute", left: spacing.lg, right: spacing.lg, backgroundColor: "transparent", overflow: "visible" },
  slideTrack: {
    height: 56,
    borderRadius: 28,
    backgroundColor: "#635BFF",
    paddingHorizontal: 4,
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
    width: "100%",
    shadowColor: "#635BFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  slideText: {
    position: "absolute",
    alignSelf: "center",
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  slideThumb: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  ctaText: { color: colors.onBrand, fontWeight: "700", fontSize: 15, letterSpacing: 0.3 },
  err: { position: "absolute", left: spacing.lg, right: spacing.lg, bottom: 140, color: colors.onError, backgroundColor: colors.error, padding: spacing.md, borderRadius: radius.md, textAlign: "center" },
  notesContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  notesText: {
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
  },
  guestActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  guestPickerSheet: {
    padding: spacing.xl,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  guestPickerTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  guestPickerOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: 10,
  },
  guestPickerOptionText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
