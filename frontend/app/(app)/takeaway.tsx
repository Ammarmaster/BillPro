import { useCallback, useState, useMemo, useEffect } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput, ActivityIndicator, SafeAreaView, StatusBar, ScrollView,
} from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { menuItemImageSource } from "@/src/lib/foodImage";
import { useTheme } from "@/src/context/ThemeContext";
import { colors, spacing, radius } from "@/src/theme";
import { useResponsive } from "@/src/hooks/useResponsive";
import { isTodayBusinessDay, formatDateTime } from "@/src/lib/dateUtils";
import { printBill, printKitchenKOT } from "@/src/lib/print";

type Cat = { id: string; name: string };
type Item = { id: string; category_id: string; name: string; price: number; description: string };
type Line = { menu_item_id: string; name: string; price: number; quantity: number; notes: string };

export default function TakeawayScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const { isDesktop, isLargeDesktop } = useResponsive();

  const [activeTab, setActiveTab] = useState<"menu" | "unpaid">("menu");
  const [cats, setCats] = useState<Cat[]>(() => api.getCachedCategories() || []);
  const [items, setItems] = useState<Item[]>(() => api.getCachedMenu() || []);
  const [bills, setBills] = useState<any[]>(() => api.getCachedBills() || []);
  const [orders, setOrders] = useState<any[]>(() => api.getCachedOrders() || []);
  const [selCat, setSelCat] = useState<string | "all">("all");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Line[]>([]);
  const [loading, setLoading] = useState(() => {
    const m = api.getCachedMenu();
    return !m || m.length === 0;
  });
  const [busy, setBusy] = useState(false);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (cats.length === 0 || items.length === 0) {
      setLoading(true);
    }
    setErr(null);
    try {
      const [c, m, b, o] = await Promise.all([
        api.listCategories().catch(() => []),
        api.listMenu().catch(() => []),
        api.listBills().catch(() => []),
        api.listOrders().catch(() => []),
      ]);
      setCats(c || []);
      setItems(m || []);
      if (b) setBills(b);
      if (o) setOrders(o);
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, [cats.length, items.length]);

  useEffect(() => {
    const { subscribeToCache } = require("@/src/lib/api");
    const unsubscribe = subscribeToCache((path: string, data: any) => {
      if (path === "/categories" && data) setCats(data);
      if (path === "/menu-items" && data) setItems(data);
      if (path === "/bills" && data) setBills(data);
      if (path === "/orders" && data) setOrders(data);
    });
    return () => unsubscribe();
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // -------------------------------------------------------------
  // TODAY'S UNPAID TAKEAWAY BILLS & ORDERS
  // -------------------------------------------------------------
  const todaysUnpaidTakeaways = useMemo(() => {
    const list: any[] = [];
    const seenOrderIds = new Set<string>();

    // 1. Pending takeaway bills for today
    const unpaidBills = bills.filter((b: any) => {
      if (!b) return false;
      const isTblTakeaway = String(b.table_number || "").toLowerCase() === "takeaway";
      const isPaid = String(b.status || "").toLowerCase() === "paid" || String(b.status || "").toLowerCase() === "completed";
      if (isPaid) return false;
      const isToday = isTodayBusinessDay(b.created_at || b.paid_at);
      return isTblTakeaway && isToday;
    });

    for (const b of unpaidBills) {
      if (b.order_id) seenOrderIds.add(b.order_id);
      if (Array.isArray(b.order_ids)) b.order_ids.forEach((id: string) => seenOrderIds.add(id));
      list.push({
        type: "bill",
        id: b.id,
        order_id: b.order_id || (b.order_ids && b.order_ids.length > 0 ? b.order_ids[0] : b.id),
        bill_number: b.bill_number || `Bill #${String(b.id).slice(-4)}`,
        items: b.items || [],
        total: Number(b.total ?? b.subtotal ?? 0),
        created_at: b.created_at || new Date().toISOString(),
        customer_name: b.customer_name || "Guest",
        status: "unpaid",
        raw: b
      });
    }

    // 2. Active takeaway orders for today that do not have a paid bill
    const activeOrders = orders.filter((o: any) => {
      if (!o) return false;
      const isTblTakeaway = String(o.table_number || "").toLowerCase() === "takeaway";
      const isPaid = String(o.status || "").toLowerCase() === "paid" || String(o.status || "").toLowerCase() === "completed" || String(o.status || "").toLowerCase() === "cancelled";
      if (isPaid) return false;
      const hasPaidBill = bills.some((b: any) => (b.order_id === o.id || (b.order_ids && b.order_ids.includes(o.id))) && (String(b.status).toLowerCase() === "paid" || String(b.status).toLowerCase() === "completed"));
      if (hasPaidBill) return false;
      const isToday = isTodayBusinessDay(o.created_at);
      return isTblTakeaway && isToday && !seenOrderIds.has(o.id);
    });

    for (const o of activeOrders) {
      const oTotal = Number(o.subtotal || 0) || (o.items || []).reduce((acc: number, it: any) => acc + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
      list.push({
        type: "order",
        id: o.id,
        order_id: o.id,
        bill_number: o.order_number ? `Order #${o.order_number}` : `Takeaway #${String(o.id).slice(-4)}`,
        items: o.items || [],
        total: oTotal,
        created_at: o.created_at || new Date().toISOString(),
        customer_name: o.customer_name || "Guest",
        status: "unpaid",
        raw: o
      });
    }

    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [bills, orders]);

  const handleSettleBill = (item: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    router.push({
      pathname: "/(app)/billing",
      params: {
        orderId: item.order_id || item.id,
        backTo: "/(app)/takeaway"
      }
    });
  };

  const handlePrintBill = async (item: any) => {
    try {
      setPrintingId(item.id);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      const r = api.getCachedRestaurant();
      const printable = {
        ...item.raw,
        items: item.items || [],
        total: item.total,
        subtotal: item.total,
        bill_number: item.bill_number,
        table_number: "Takeaway",
        restaurant_snapshot: item.raw?.restaurant_snapshot || r
      };
      await printBill(printable);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (err: any) {
      console.warn("Print receipt error:", err);
    } finally {
      setPrintingId(null);
    }
  };

  const handlePrintKOT = async (item: any) => {
    try {
      setPrintingId(`kot_${item.id}`);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      await printKitchenKOT(item.raw);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (err: any) {
      console.warn("Print KOT error:", err);
    } finally {
      setPrintingId(null);
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

  const add = (it: Item) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setCart(prev => {
      const idx = prev.findIndex(l => l.menu_item_id === it.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + 1 };
        return copy;
      }
      return [...prev, { menu_item_id: it.id, name: it.name, price: it.price, quantity: 1, notes: "" }];
    });
  };

  const inc = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setCart(p => p.map(l => l.menu_item_id === id ? { ...l, quantity: l.quantity + 1 } : l));
  };

  const dec = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setCart(p => p.flatMap(l => l.menu_item_id === id ? (l.quantity > 1 ? [{ ...l, quantity: l.quantity - 1 }] : []) : [l]));
  };

  const subtotal = useMemo(() => cart.reduce((s, l) => s + l.price * l.quantity, 0), [cart]);
  const totalQty = useMemo(() => cart.reduce((s, l) => s + l.quantity, 0), [cart]);

  // Generate Bill Workflow (Creates order & bill and navigates to payment with 0ms instant transition)
  const handleGenerateBill = async () => {
    if (cart.length === 0) { setErr("Add items to generate bill."); return; }
    setErr(null);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const cartItems = [...cart];
      const isLocal = api.isLocalProcessingMode && api.isLocalProcessingMode();

      if (isLocal) {
        setBusy(true);
        const realOrder = await api.createOrder({ table_number: "Takeaway", items: cartItems, notes: "Takeaway" });
        setCart([]);
        setBusy(false);
        router.push({ pathname: "/(app)/billing", params: { orderId: realOrder.id, backTo: "/(app)/takeaway" } });
        return;
      }

      // Optimistic 0ms instant transition for all cloud plans!
      const tempId = "temp-" + Date.now();
      const calculatedSubtotal = cartItems.reduce((acc, it) => acc + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
      const optimisticOrder = {
        id: tempId,
        order_number: String(Math.floor(100 + Math.random() * 900)),
        table_number: "Takeaway",
        items: cartItems,
        subtotal: calculatedSubtotal,
        status: "placed",
        created_at: new Date().toISOString()
      };

      // 1. Inject optimistic order immediately into cache
      api.injectCachedOrder(optimisticOrder);

      // 2. Fire KOT auto-print in background
      (async () => {
        try {
          const { getPrinterSettings, printKitchenKOT } = require("@/src/lib/print");
          const kSettings = await getPrinterSettings("kitchen");
          const cSettings = await getPrinterSettings("cashier");
          const isKitchenConfigured = kSettings && kSettings.type !== "none" && kSettings.type !== "system";
          const isCashierConfigured = cSettings && cSettings.type !== "none" && cSettings.type !== "system";
          const shouldPrint = isKitchenConfigured ? !!kSettings?.auto_print : (isCashierConfigured ? !!cSettings?.auto_print : false);
          if (shouldPrint) {
            await printKitchenKOT(optimisticOrder);
          }
        } catch {}
      })();

      // 3. Sync order to server in background
      (async () => {
        try {
          const realOrder = await api.createOrder({ table_number: "Takeaway", items: cartItems, notes: "Takeaway" });
          if (realOrder && realOrder.id) {
            api.setTempIdMapping(tempId, realOrder.id);
            api.injectCachedOrder(realOrder);
          }
        } catch (syncErr: any) {
          console.warn("Takeaway order background sync error:", syncErr);
        }
      })();

      // 4. Reset cart and redirect immediately with 0ms delay!
      setCart([]);
      router.push({ pathname: "/(app)/billing", params: { orderId: tempId, backTo: "/(app)/takeaway" } });
    } catch (e: any) { 
      setErr(e.message || "Failed to create order"); 
    } finally {
      setBusy(false);
    }
  };

  // -------------------------------------------------------------
  // UNPAID BILLS LIST RENDERER (Shared across Desktop & Mobile)
  // -------------------------------------------------------------
  const renderUnpaidBillsView = (cols: number) => {
    if (todaysUnpaidTakeaways.length === 0) {
      return (
        <View style={styles.emptyUnpaidWrap}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="checkmark-done-circle" size={60} color="#10B981" />
          </View>
          <Text style={[styles.emptyUnpaidTitle, { color: theme.onSurface }]}>All Takeaway Bills Settled</Text>
          <Text style={[styles.emptyUnpaidSub, { color: theme.onSurfaceSecondary }]}>
            There are no unpaid or pending takeaway orders recorded today.
          </Text>
          <Pressable style={styles.newOrderActionBtn} onPress={() => setActiveTab("menu")}>
            <Ionicons name="add-circle" size={18} color="#FFFFFF" />
            <Text style={styles.newOrderActionText}>Create New Takeaway Order</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <FlatList
        data={todaysUnpaidTakeaways}
        keyExtractor={i => i.id}
        numColumns={cols}
        key={`unpaid-grid-${cols}`}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140, gap: spacing.md }}
        columnWrapperStyle={cols > 1 ? { gap: spacing.md } : undefined}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const isPrintingThis = printingId === item.id || printingId === `kot_${item.id}`;
          return (
            <View style={[styles.unpaidCard, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }, cols > 1 && { flex: 1 }]}>
              <View style={styles.unpaidCardHeader}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="receipt-outline" size={16} color="#635BFF" />
                    <Text style={[styles.unpaidCardNumber, { color: theme.onSurface }]}>{item.bill_number}</Text>
                  </View>
                  <Text style={[styles.unpaidCardTime, { color: theme.onSurfaceSecondary }]}>
                    {formatDateTime(item.created_at)} · {item.customer_name}
                  </Text>
                </View>
                <View style={styles.unpaidBadge}>
                  <Text style={styles.unpaidBadgeText}>UNPAID</Text>
                </View>
              </View>

              <View style={[styles.unpaidItemsBox, { backgroundColor: theme.surfaceTertiary, borderColor: theme.border }]}>
                {(item.items || []).slice(0, 4).map((it: any, idx: number) => (
                  <View key={idx} style={styles.unpaidItemRow}>
                    <Text style={[styles.unpaidItemName, { color: theme.onSurface }]} numberOfLines={1}>
                      {it.quantity}x {it.name}
                    </Text>
                    <Text style={[styles.unpaidItemPrice, { color: theme.onSurfaceSecondary }]}>
                      ₹{Number(it.price || 0) * Number(it.quantity || 1)}
                    </Text>
                  </View>
                ))}
                {(item.items || []).length > 4 && (
                  <Text style={{ fontSize: 11, color: theme.onSurfaceTertiary, fontStyle: "italic", marginTop: 2 }}>
                    + {(item.items || []).length - 4} more items
                  </Text>
                )}
              </View>

              <View style={styles.unpaidFooterRow}>
                <View>
                  <Text style={[styles.unpaidTotalLabel, { color: theme.onSurfaceSecondary }]}>Total Amount</Text>
                  <Text style={styles.unpaidTotalVal}>₹{item.total}</Text>
                </View>

                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Pressable
                    style={[styles.printIconBtn, { backgroundColor: theme.surfaceTertiary, borderColor: theme.border }]}
                    onPress={() => handlePrintKOT(item)}
                    disabled={isPrintingThis}
                    hitSlop={8}
                  >
                    <Ionicons name="restaurant-outline" size={16} color={theme.onSurface} />
                  </Pressable>

                  <Pressable
                    style={[styles.printIconBtn, { backgroundColor: theme.surfaceTertiary, borderColor: theme.border }]}
                    onPress={() => handlePrintBill(item)}
                    disabled={isPrintingThis}
                    hitSlop={8}
                  >
                    <Ionicons name="print-outline" size={16} color={theme.onSurface} />
                  </Pressable>

                  <Pressable
                    style={styles.settleCardBtn}
                    onPress={() => handleSettleBill(item)}
                  >
                    <Ionicons name="card" size={14} color="#FFFFFF" />
                    <Text style={styles.settleCardBtnText}>Settle & Pay</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          );
        }}
      />
    );
  };

  // -------------------------------------------------------------
  // DESKTOP LAYOUT
  // -------------------------------------------------------------
  if (isDesktop) {
    const dishCols = isLargeDesktop ? 2 : 1;
    const unpaidGridCols = isLargeDesktop ? 3 : 2;

    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.surface }]}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.surface} />
        <View style={[styles.wrap, { paddingTop: insets.top, backgroundColor: theme.surface }]}>
          
          {/* Top Bar with Tab Switcher */}
          <View style={[styles.headerRow, { borderBottomWidth: 1, borderBottomColor: theme.border, paddingBottom: spacing.sm }]}>
            <View>
              <Text style={[styles.title, { color: theme.onSurface }]}>Takeaway</Text>
              <Text style={[styles.sub, { color: theme.onSurfaceSecondary }]}>Walk-in / pickup orders</Text>
            </View>

            <View style={styles.tabToggle}>
              <Pressable
                style={[styles.tabBtn, activeTab === "menu" && styles.tabBtnActive]}
                onPress={() => setActiveTab("menu")}
              >
                <Ionicons name="restaurant" size={14} color={activeTab === "menu" ? "#FFF" : theme.onSurfaceSecondary} />
                <Text style={[styles.tabBtnText, { color: activeTab === "menu" ? "#FFF" : theme.onSurfaceSecondary }]}>New Order</Text>
              </Pressable>
              <Pressable
                style={[styles.tabBtn, activeTab === "unpaid" && styles.tabBtnActive, { position: "relative" }]}
                onPress={() => setActiveTab("unpaid")}
              >
                <Ionicons name="receipt" size={14} color={activeTab === "unpaid" ? "#FFF" : theme.onSurfaceSecondary} />
                <Text style={[styles.tabBtnText, { color: activeTab === "unpaid" ? "#FFF" : theme.onSurfaceSecondary }]}>
                  Unpaid Bills ({todaysUnpaidTakeaways.length})
                </Text>
                {todaysUnpaidTakeaways.length > 0 && activeTab !== "unpaid" && (
                  <View style={styles.badgeDot} />
                )}
              </Pressable>
            </View>
          </View>

          {activeTab === "unpaid" ? (
            <View style={{ flex: 1 }}>
              {renderUnpaidBillsView(unpaidGridCols)}
            </View>
          ) : (
            <View style={{ flex: 1, flexDirection: "row" }}>
              {/* Left Column: Menu Items */}
              <View style={{ flex: 1, borderRightWidth: 1, borderRightColor: theme.border }}>
                
                {/* Quick Unpaid Alert Banner if any pending today */}
                {todaysUnpaidTakeaways.length > 0 && (
                  <Pressable
                    style={styles.unpaidBanner}
                    onPress={() => setActiveTab("unpaid")}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                      <Ionicons name="time" size={16} color="#D97706" />
                      <Text style={{ color: "#92400E", fontWeight: "700", fontSize: 13 }}>
                        {todaysUnpaidTakeaways.length} Unpaid Takeaway Bill{todaysUnpaidTakeaways.length > 1 ? "s" : ""} Today
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Text style={{ color: "#B45309", fontWeight: "800", fontSize: 12 }}>View & Settle</Text>
                      <Ionicons name="chevron-forward" size={14} color="#B45309" />
                    </View>
                  </Pressable>
                )}

                <View style={[styles.searchRow, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
                  <Ionicons name="search" size={18} color={theme.onSurfaceTertiary} />
                  <TextInput
                    value={search} onChangeText={setSearch} placeholder="Search items..."
                    placeholderTextColor={theme.onSurfaceTertiary} style={[styles.search, { color: theme.onSurface }]}
                  />
                </View>

                <View style={styles.chipContainer}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
                    <Pressable style={[styles.chip, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }, selCat === "all" && styles.chipActive]} onPress={() => setSelCat("all")}>
                      <Text style={[styles.chipText, { color: theme.onSurfaceSecondary }, selCat === "all" && styles.chipTextActive]}>All</Text>
                    </Pressable>
                    {cats.map(c => (
                      <Pressable key={c.id} style={[styles.chip, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }, selCat === c.id && styles.chipActive]} onPress={() => setSelCat(c.id)}>
                        <Text style={[styles.chipText, { color: theme.onSurfaceSecondary }, selCat === c.id && styles.chipTextActive]}>{c.name}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>

                {loading ? (
                  <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
                ) : (
                  <FlatList
                    key={`takeaway-grid-${dishCols}`}
                    data={filtered}
                    keyExtractor={i => i.id}
                    numColumns={dishCols}
                    contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40, gap: spacing.md }}
                    columnWrapperStyle={dishCols > 1 ? { gap: spacing.md } : undefined}
                    showsVerticalScrollIndicator={false}
                    renderItem={({ item }) => {
                      const inCartLine = cart.find(l => l.menu_item_id === item.id);
                      const qty = inCartLine ? inCartLine.quantity : 0;

                      return (
                        <Pressable
                          style={({ pressed }) => [
                            styles.itemCard,
                            dishCols > 1 && { flex: 1 },
                            { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
                            pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] },
                          ]}
                          onPress={() => add(item)}
                        >
                          <View style={styles.itemLeftRow}>
                            <Image source={menuItemImageSource(item)} style={styles.itemThumbImg} contentFit="cover" />
                            <View style={{ flex: 1 }}>
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                <View style={styles.redSquare} />
                                <Text style={[styles.itemName, { color: theme.onSurface }]}>{item.name}</Text>
                              </View>
                              <Text style={[styles.itemMeta, { color: theme.onSurfaceSecondary }]}>₹{item.price} · GST 0%</Text>
                            </View>
                          </View>

                          {qty > 0 ? (
                            <View style={styles.counterPill}>
                              <Pressable onPress={() => dec(item.id)} style={styles.counterBtn} hitSlop={8}>
                                <Ionicons name="remove" size={16} color="#635BFF" />
                              </Pressable>
                              <Text style={styles.counterText}>{qty}</Text>
                              <Pressable onPress={() => inc(item.id)} style={styles.counterBtn} hitSlop={8}>
                                <Ionicons name="add" size={16} color="#635BFF" />
                              </Pressable>
                            </View>
                          ) : (
                            <View style={styles.addCircleBtn}>
                              <Ionicons name="add" size={22} color="#FFFFFF" />
                            </View>
                          )}
                        </Pressable>
                      );
                    }}
                  />
                )}
              </View>

              {/* Right Column: Takeaway Cart Ticket */}
              <View style={{ width: 380, backgroundColor: theme.surfaceSecondary, display: "flex", flexDirection: "column" }}>
                <View style={{ padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: theme.border }}>
                  <Text style={{ fontSize: 18, fontWeight: "900", color: theme.onSurface }}>Takeaway Order</Text>
                  <Text style={{ fontSize: 12, color: theme.onSurfaceSecondary, marginTop: 2 }}>Current items in cart</Text>
                </View>

                <View style={{ flex: 1 }}>
                  {cart.length === 0 ? (
                    <View style={styles.center}>
                      <Ionicons name="bag-handle-outline" size={36} color={theme.onSurfaceTertiary} />
                      <Text style={{ color: theme.onSurfaceTertiary, marginTop: 8, fontSize: 14 }}>Cart is empty</Text>
                    </View>
                  ) : (
                    <FlatList
                      data={cart}
                      keyExtractor={l => l.menu_item_id}
                      contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
                      renderItem={({ item }) => (
                        <View style={[styles.itemCard, { backgroundColor: theme.surfaceTertiary, borderColor: theme.border, padding: 12 }]}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.itemName, { color: theme.onSurface, fontSize: 14 }]}>{item.name}</Text>
                            <Text style={[styles.itemMeta, { color: theme.onSurfaceSecondary, fontSize: 12 }]}>₹{item.price} × {item.quantity} = ₹{item.price * item.quantity}</Text>
                          </View>
                          <View style={styles.counterPill}>
                            <Pressable onPress={() => dec(item.menu_item_id)} style={styles.counterBtn} hitSlop={8}>
                              <Ionicons name="remove" size={14} color="#635BFF" />
                            </Pressable>
                            <Text style={[styles.counterText, { fontSize: 13 }]}>{item.quantity}</Text>
                            <Pressable onPress={() => inc(item.menu_item_id)} style={styles.counterBtn} hitSlop={8}>
                              <Ionicons name="add" size={14} color="#635BFF" />
                            </Pressable>
                          </View>
                        </View>
                      )}
                    />
                  )}
                </View>

                {/* Action Panel */}
                <View style={{ padding: spacing.lg, borderTopWidth: 1, borderTopColor: theme.border, backgroundColor: theme.surface }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: theme.onSurfaceSecondary }}>Total ({totalQty} items)</Text>
                    <Text style={{ fontSize: 22, fontWeight: "900", color: "#635BFF" }}>₹{subtotal}</Text>
                  </View>

                  {err && <Text style={{ color: colors.onError, backgroundColor: colors.error, padding: 8, borderRadius: 8, marginBottom: 8, fontSize: 12, textAlign: "center" }}>{err}</Text>}

                  <Pressable
                    style={[
                      {
                        backgroundColor: cart.length > 0 ? "#635BFF" : theme.surfaceTertiary,
                        paddingVertical: 14,
                        borderRadius: 12,
                        alignItems: "center",
                        justifyContent: "center",
                        flexDirection: "row",
                        gap: 8,
                      }
                    ]}
                    disabled={cart.length === 0 || busy}
                    onPress={handleGenerateBill}
                  >
                    {busy ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <>
                        <Text style={{ color: cart.length > 0 ? "#FFFFFF" : theme.onSurfaceTertiary, fontWeight: "800", fontSize: 15 }}>
                          {cart.length > 0 ? "Generate Bill & Settle" : "Add items to generate bill"}
                        </Text>
                        <Ionicons name="arrow-forward" size={18} color={cart.length > 0 ? "#FFFFFF" : theme.onSurfaceTertiary} />
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // -------------------------------------------------------------
  // MOBILE / TABLET LAYOUT
  // -------------------------------------------------------------
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.surface }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.surface} />
      <View style={[styles.wrap, { paddingTop: insets.top, backgroundColor: theme.surface }]}>
        
        {/* Header with Segmented Tab Switcher */}
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.title, { color: theme.onSurface }]}>Takeaway</Text>
            <Text style={[styles.sub, { color: theme.onSurfaceSecondary }]}>Walk-in / pickup orders</Text>
          </View>

          <View style={styles.tabToggle}>
            <Pressable
              style={[styles.tabBtn, activeTab === "menu" && styles.tabBtnActive]}
              onPress={() => setActiveTab("menu")}
            >
              <Ionicons name="restaurant" size={13} color={activeTab === "menu" ? "#FFF" : theme.onSurfaceSecondary} />
              <Text style={[styles.tabBtnText, { color: activeTab === "menu" ? "#FFF" : theme.onSurfaceSecondary }]}>New Order</Text>
            </Pressable>
            <Pressable
              style={[styles.tabBtn, activeTab === "unpaid" && styles.tabBtnActive, { position: "relative" }]}
              onPress={() => setActiveTab("unpaid")}
            >
              <Ionicons name="receipt" size={13} color={activeTab === "unpaid" ? "#FFF" : theme.onSurfaceSecondary} />
              <Text style={[styles.tabBtnText, { color: activeTab === "unpaid" ? "#FFF" : theme.onSurfaceSecondary }]}>
                Unpaid ({todaysUnpaidTakeaways.length})
              </Text>
              {todaysUnpaidTakeaways.length > 0 && activeTab !== "unpaid" && (
                <View style={styles.badgeDot} />
              )}
            </Pressable>
          </View>
        </View>

        {activeTab === "unpaid" ? (
          <View style={{ flex: 1 }}>
            {renderUnpaidBillsView(1)}
          </View>
        ) : (
          <>
            {/* Quick Unpaid Alert Banner if any pending today */}
            {todaysUnpaidTakeaways.length > 0 && (
              <Pressable
                style={styles.unpaidBanner}
                onPress={() => setActiveTab("unpaid")}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                  <Ionicons name="time" size={16} color="#D97706" />
                  <Text style={{ color: "#92400E", fontWeight: "700", fontSize: 13 }}>
                    {todaysUnpaidTakeaways.length} Unpaid Takeaway Bill{todaysUnpaidTakeaways.length > 1 ? "s" : ""} Today
                  </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Text style={{ color: "#B45309", fontWeight: "800", fontSize: 12 }}>View & Settle</Text>
                  <Ionicons name="chevron-forward" size={14} color="#B45309" />
                </View>
              </Pressable>
            )}

            {/* Search Bar */}
            <View style={[styles.searchRow, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
              <Ionicons name="search" size={18} color={theme.onSurfaceTertiary} />
              <TextInput
                value={search} onChangeText={setSearch} placeholder="Search items..."
                placeholderTextColor={theme.onSurfaceTertiary} style={[styles.search, { color: theme.onSurface }]}
              />
            </View>

            {/* Category Chips */}
            <View style={styles.chipContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipScroll}
              >
                <Pressable style={[styles.chip, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }, selCat === "all" && styles.chipActive]} onPress={() => setSelCat("all")}>
                  <Text style={[styles.chipText, { color: theme.onSurfaceSecondary }, selCat === "all" && styles.chipTextActive]}>All</Text>
                </Pressable>
                {cats.map(c => (
                  <Pressable key={c.id} style={[styles.chip, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }, selCat === c.id && styles.chipActive]} onPress={() => setSelCat(c.id)}>
                    <Text style={[styles.chipText, { color: theme.onSurfaceSecondary }, selCat === c.id && styles.chipTextActive]}>{c.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Items List */}
            {loading ? (
              <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={i => i.id}
                contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 160, gap: spacing.md }}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => {
                  const inCartLine = cart.find(l => l.menu_item_id === item.id);
                  const qty = inCartLine ? inCartLine.quantity : 0;

                  return (
                    <Pressable
                      style={({ pressed }) => [
                        styles.itemCard,
                        { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
                        pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] },
                      ]}
                      onPress={() => add(item)}
                    >
                      <View style={styles.itemLeftRow}>
                        <Image source={menuItemImageSource(item)} style={styles.itemThumbImg} contentFit="cover" />
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <View style={styles.redSquare} />
                            <Text style={[styles.itemName, { color: theme.onSurface }]}>{item.name}</Text>
                          </View>
                          <Text style={[styles.itemMeta, { color: theme.onSurfaceSecondary }]}>₹{item.price} · GST 0%</Text>
                        </View>
                      </View>

                      {qty > 0 ? (
                        <View style={styles.counterPill}>
                          <Pressable onPress={() => dec(item.id)} style={styles.counterBtn} hitSlop={8}>
                            <Ionicons name="remove" size={16} color="#635BFF" />
                          </Pressable>
                          <Text style={styles.counterText}>{qty}</Text>
                          <Pressable onPress={() => inc(item.id)} style={styles.counterBtn} hitSlop={8}>
                            <Ionicons name="add" size={16} color="#635BFF" />
                          </Pressable>
                        </View>
                      ) : (
                        <View style={styles.addCircleBtn}>
                          <Ionicons name="add" size={22} color="#FFFFFF" />
                        </View>
                      )}
                    </Pressable>
                  );
                }}
              />
            )}

            {err && <Text style={styles.err}>{err}</Text>}

            {/* Bottom Cart Pill */}
            {cart.length > 0 && (
              <View style={[styles.bottomBarWrap, { paddingBottom: insets.bottom + spacing.md }]}>
                <View style={styles.purpleBottomPill}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pillQty}>{totalQty} items</Text>
                    <Text style={styles.pillPrice}>₹{subtotal}</Text>
                  </View>

                  <Pressable style={styles.genBillPillBtn} onPress={handleGenerateBill} disabled={busy}>
                    {busy ? (
                      <ActivityIndicator color="#635BFF" />
                    ) : (
                      <>
                        <Text style={styles.genBillPillText}>Generate Bill</Text>
                        <Ionicons name="arrow-forward" size={18} color="#635BFF" />
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            )}
          </>
        )}

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F8F9FD" },
  wrap: { flex: 1, backgroundColor: "#F8F9FD" },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  title: { color: "#0F172A", fontSize: 26, fontWeight: "900" },
  sub: { color: "#64748B", fontSize: 13, marginTop: 2, fontWeight: "500" },
  
  tabToggle: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    padding: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  tabBtnActive: {
    backgroundColor: "#635BFF",
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  badgeDot: {
    position: "absolute",
    top: 5,
    right: 5,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#EF4444",
  },

  unpaidBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FEF3C7",
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#FCD34D",
  },

  searchRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#FFFFFF", marginHorizontal: spacing.lg, marginTop: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radius.xl, borderWidth: 1, borderColor: "#E2E8F0" },
  search: { flex: 1, color: "#0F172A", paddingVertical: 12, fontSize: 15 },
  chipContainer: { marginVertical: spacing.md, minHeight: 48 },
  chipScroll: { paddingHorizontal: spacing.lg, gap: spacing.md, alignItems: "center" },
  chip: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2E8F0" },
  chipActive: { backgroundColor: "#635BFF", borderColor: "#635BFF" },
  chipText: { color: "#64748B", fontSize: 14, fontWeight: "600" },
  chipTextActive: { color: "#FFFFFF", fontWeight: "700" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "rgba(0,0,0,0.02)",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 1,
  },
  itemLeftRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, flex: 1 },
  itemThumbImg: { width: 44, height: 44, borderRadius: radius.md },
  redSquare: { width: 14, height: 14, borderRadius: 3, backgroundColor: "#EF4444" },
  itemName: { color: "#0F172A", fontSize: 16, fontWeight: "800" },
  itemMeta: { color: "#64748B", fontSize: 13, marginTop: 2, fontWeight: "500" },
  
  addCircleBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#635BFF", alignItems: "center", justifyContent: "center" },
  counterPill: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#F1F0FF", paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  counterBtn: { padding: 2 },
  counterText: { color: "#635BFF", fontWeight: "900", fontSize: 15 },

  // Unpaid Bills View Styles
  unpaidCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: spacing.lg,
    shadowColor: "rgba(0,0,0,0.03)",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
  },
  unpaidCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.sm,
  },
  unpaidCardNumber: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0F172A",
  },
  unpaidCardTime: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
    fontWeight: "500",
  },
  unpaidBadge: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "#FCD34D",
  },
  unpaidBadgeText: {
    color: "#B45309",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  unpaidItemsBox: {
    backgroundColor: "#F8FAFC",
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    marginVertical: spacing.sm,
    gap: 4,
  },
  unpaidItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  unpaidItemName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
    flex: 1,
    marginRight: 8,
  },
  unpaidItemPrice: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748B",
  },
  unpaidFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  unpaidTotalLabel: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "600",
  },
  unpaidTotalVal: {
    fontSize: 20,
    fontWeight: "900",
    color: "#635BFF",
  },
  printIconBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  settleCardBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#635BFF",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    shadowColor: "#635BFF",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  settleCardBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  emptyUnpaidWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xxl,
    marginTop: 40,
  },
  emptyIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  emptyUnpaidTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0F172A",
    textAlign: "center",
  },
  emptyUnpaidSub: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    marginTop: 6,
    maxWidth: 320,
    lineHeight: 20,
  },
  newOrderActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#635BFF",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: radius.pill,
    marginTop: spacing.xl,
  },
  newOrderActionText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },

  err: { color: colors.onError, backgroundColor: colors.error, margin: spacing.lg, padding: spacing.md, borderRadius: radius.md },
  bottomBarWrap: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: spacing.lg, backgroundColor: "transparent" },
  purpleBottomPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#635BFF",
    paddingHorizontal: spacing.xl,
    paddingVertical: 14,
    borderRadius: radius.pill,
    shadowColor: "#635BFF",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  pillQty: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "600" },
  pillPrice: { color: "#FFFFFF", fontSize: 20, fontWeight: "900" },
  genBillPillBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FFFFFF", paddingHorizontal: 18, paddingVertical: 10, borderRadius: radius.pill },
  genBillPillText: { color: "#635BFF", fontSize: 15, fontWeight: "800" },
});
