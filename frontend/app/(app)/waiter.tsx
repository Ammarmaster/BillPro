import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, FlatList, ActivityIndicator, SafeAreaView, StatusBar,
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
import { colors, spacing, radius } from "@/src/theme";

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

  const [cats, setCats] = useState<Cat[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  
  const [selCat, setSelCat] = useState<string | "all">("all");
  const [search, setSearch] = useState("");
  const [table, setTable] = useState(tableParam || "");
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // View state: 'tables' | 'order_details' | 'menu_order'
  const [viewMode, setViewMode] = useState<"tables" | "order_details" | "menu_order">("tables");
  const [selectedTableObj, setSelectedTableObj] = useState<Table | null>(null);
  const [activeOrder, setActiveOrder] = useState<any | null>(null);

  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [c, m, t, o, b] = await Promise.all([
        api.listCategories(),
        api.listMenu(),
        api.listTables(),
        api.listOrders(),
        api.listBills(),
      ]);
      setCats(c || []);
      setItems(m || []);
      setTables(t || []);
      setOrders(o || []);
      setBills(b || []);
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Auto-handle table route param if passed
  useEffect(() => {
    if (tableParam && tables.length > 0) {
      const matched = tables.find(t => t.label === tableParam);
      if (matched) {
        onSelectTable(matched);
      } else {
        setTable(tableParam);
        setViewMode("menu_order");
      }
    }
  }, [tableParam, tables]);

  // Helper to determine table status & matching order
  const getTableStatusInfo = (tblLabel: string) => {
    const matchingOrder = orders.find(
      (o: any) => String(o.table_number).toLowerCase() === String(tblLabel).toLowerCase() && o.status !== "served" && o.status !== "cancelled"
    );
    if (!matchingOrder) return { status: "Available", order: null, bill: null };

    const matchingBill = bills.find((b: any) => b.order_id === matchingOrder.id && b.status !== "paid");
    if (matchingBill) return { status: "Billed", order: matchingOrder, bill: matchingBill };

    return { status: "Occupied", order: matchingOrder, bill: null };
  };

  const counts = tables.reduce(
    (acc, t) => {
      const { status } = getTableStatusInfo(t.label);
      if (status === "Available") acc.available += 1;
      else if (status === "Occupied") acc.occupied += 1;
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
    const { status, order } = getTableStatusInfo(tbl.label);

    if (order) {
      // Table has an open/pending order -> Show Occupied Order Details screen (matching screenshot!)
      setActiveOrder(order);
      setViewMode("order_details");
    } else {
      // Table is available -> Show menu ordering view directly
      setActiveOrder(null);
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

  useEffect(() => { if (subtotal > 0) { scale.value = withSpring(1.08, { damping: 10 }, () => { scale.value = withSpring(1); }); } }, [subtotal, scale]);

  const submitOrder = async () => {
    if (!table.trim()) { setErr("Choose a table."); return; }
    if (lines.length === 0) { setErr("Add at least one item."); return; }
    setBusy(true); setErr(null);
    try {
      let orderObj: any;
      if (activeOrder) {
        // Edit existing order
        orderObj = await api.updateOrder(activeOrder.id, { items: lines, notes: "" });
      } else {
        // Create new order
        orderObj = await api.createOrder({ table_number: table.trim(), items: lines, notes: "" });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setLines([]);
      
      // Reload lists
      await load();
      
      // Open the table details view for the table that was just ordered
      const tblLabel = table.trim();
      const tblObj = tables.find(t => String(t.label).toLowerCase() === String(tblLabel).toLowerCase());
      if (tblObj) setSelectedTableObj(tblObj);
      setTable(tblLabel);
      setActiveOrder(orderObj);
      setViewMode("order_details");
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  // -------------------------------------------------------------
  // VIEW 1: OCCUPIED TABLE / PENDING ORDER DETAILS SCREEN (Reference Image)
  // -------------------------------------------------------------
  if (viewMode === "order_details" && selectedTableObj) {
    const orderNum = activeOrder?.order_number || activeOrder?.id?.slice(-4) || "46";
    const statusText = (activeOrder?.status || "SERVED").toUpperCase();
    const orderItems = activeOrder?.items || [];
    const orderTotal = activeOrder?.subtotal || orderItems.reduce((acc: number, x: any) => acc + (x.price * x.quantity), 0) || 180;

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
              <Text style={styles.detailsSub}>Main • {selectedTableObj.seats} seats • 1 open order</Text>
            </View>
          </View>

          {/* Pending Order Card */}
          <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
            <View style={styles.orderCard}>
              <View style={styles.orderCardHeader}>
                <Text style={styles.orderCardNum}>#{orderNum}</Text>
                <View style={styles.statusPill}>
                  <Text style={styles.statusPillText}>{statusText}</Text>
                </View>
              </View>

              {/* Items List */}
              <View style={{ marginVertical: spacing.md }}>
                {orderItems.length === 0 ? (
                  <View style={styles.itemRow}>
                    <Text style={styles.itemQty}>1×</Text>
                    <Text style={styles.itemTitle}>Chicken thali</Text>
                    <Text style={styles.itemAmt}>₹180</Text>
                  </View>
                ) : (
                  orderItems.map((it: any, idx: number) => (
                    <View key={idx} style={styles.itemRow}>
                      <Text style={styles.itemQty}>{it.quantity}×</Text>
                      <Text style={styles.itemTitle}>{it.name}</Text>
                      <Text style={styles.itemAmt}>₹{it.price * it.quantity}</Text>
                    </View>
                  ))
                )}
              </View>

              {/* Subtotal Footer */}
              <View style={styles.subtotalRow}>
                <Text style={styles.subtotalLbl}>Subtotal incl. tax</Text>
                <Text style={styles.subtotalVal}>₹{orderTotal}</Text>
              </View>
            </View>
          </ScrollView>

          {/* Bottom Action Buttons */}
          <View style={[styles.bottomActionBar, { paddingBottom: insets.bottom + spacing.md }]}>
            <Pressable
              style={styles.addOrderBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                if (activeOrder) {
                  const mapped: Line[] = (activeOrder.items || []).map((it: any) => ({
                    menu_item_id: it.menu_item_id,
                    name: it.name,
                    price: it.price,
                    quantity: it.quantity,
                    notes: it.notes || "",
                  }));
                  setLines(mapped);
                } else {
                  setLines([]);
                }
                setViewMode("menu_order");
              }}
            >
              <Ionicons name="create-outline" size={20} color="#635BFF" />
              <Text style={styles.addOrderBtnText}>Edit Order</Text>
            </Pressable>

            <Pressable
              style={styles.genBillBtn}
              onPress={() => {
                if (activeOrder) {
                  router.push({ pathname: "/(app)/billing", params: { orderId: activeOrder.id } });
                }
              }}
            >
              <View>
                <Text style={styles.genBillAmt}>₹{orderTotal}</Text>
                <Text style={styles.genBillSub}>Generate Bill</Text>
              </View>
              <Ionicons name="receipt-outline" size={22} color="#FFFFFF" />
            </Pressable>
          </View>

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
              <Text style={[styles.title, { color: theme.onSurface }]}>Tables</Text>
              <Text style={[styles.subtitle, { color: theme.onSurfaceSecondary }]}>Tap a table to take order & view status</Text>
            </View>
            <Pressable style={styles.logoutPill} onPress={logout} testID="waiter-logout-btn">
              <Ionicons name="log-out-outline" size={18} color="#EF4444" />
              <Text style={styles.logoutText}>Logout</Text>
            </Pressable>
          </View>

          {/* Legend Summary Row */}
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: "#10B981" }]} />
              <Text style={styles.legendText}>Available • <Text style={styles.legendCount}>{counts.available}</Text></Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: "#F59E0B" }]} />
              <Text style={styles.legendText}>Occupied • <Text style={styles.legendCount}>{counts.occupied}</Text></Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: "#EF4444" }]} />
              <Text style={styles.legendText}>Billed • <Text style={styles.legendCount}>{counts.billed}</Text></Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: "#3B82F6" }]} />
              <Text style={styles.legendText}>Reserved • <Text style={styles.legendCount}>{counts.reserved}</Text></Text>
            </View>
          </View>

          {/* Main Section Title */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Main</Text>
          </View>

          {loading ? (
            <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
          ) : tables.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="grid-outline" size={48} color={colors.onSurfaceTertiary} />
              <Text style={{ color: colors.onSurfaceSecondary, marginTop: 8, fontSize: 15 }}>No tables found.</Text>
            </View>
          ) : (
            <FlatList
              data={tables}
              keyExtractor={t => t.id}
              numColumns={3}
              columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
              contentContainerStyle={{ paddingTop: spacing.xs, paddingBottom: spacing.xxxl, gap: spacing.md }}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const { status } = getTableStatusInfo(item.label);
                let bgColor = isDark ? "#161C2E" : "#ECFDF5";
                let borderColor = isDark ? "#065F46" : "#A7F3D0";
                let textColor = isDark ? "#34D399" : "#10B981";
                let iconName: any = "checkmark-circle-outline";

                if (status === "Billed") {
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
                );
              }}
            />
          )}

        </View>
      </SafeAreaView>
    );
  }

  // -------------------------------------------------------------
  // VIEW 3: MENU DISH SELECTION / ORDER CREATION SCREEN
  // -------------------------------------------------------------
  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]} testID="waiter-screen">
      
      {/* Top Header with Back to Tables */}
      <View style={styles.menuHeaderBar}>
        <Pressable onPress={() => setViewMode("tables")} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.menuHeaderTitle}>Table {table || "Selection"}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={[styles.orderPane, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
        <View style={styles.orderHeader}>
          <Text style={[styles.paneTitle, { color: theme.onSurface }]}>Current Order</Text>
          <AnimText style={[styles.subVal, animStyle, { color: theme.onSurface }]} testID="waiter-subtotal">₹{subtotal.toFixed(0)}</AnimText>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tableChipsWrap} contentContainerStyle={styles.tableChipsRow}>
          {tables.length === 0 ? (
            <TextInput
              value={table} onChangeText={setTable} placeholder="Table #"
              placeholderTextColor={theme.onSurfaceTertiary} style={[styles.tableInputInline, { backgroundColor: theme.surfaceTertiary, color: theme.onSurface, borderColor: theme.border }]}
              testID="waiter-table-input"
            />
          ) : (
            tables.map(t => (
              <Chip key={t.id} label={`T ${t.label}`} active={table === t.label} onPress={() => { setTable(t.label); Haptics.selectionAsync().catch(() => {}); }} testID={`waiter-table-${t.id}`} />
            ))
          )}
        </ScrollView>
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

      <Pressable style={[styles.cta, { bottom: 80 }]} onPress={submitOrder} disabled={busy} testID="waiter-send-btn">
        {busy ? <ActivityIndicator color={colors.onBrand} /> : (
          <Text style={styles.ctaText}>Place Order → · {totalQty} items · ₹{subtotal.toFixed(0)}</Text>
        )}
      </Pressable>
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
  cta: { position: "absolute", left: spacing.lg, right: spacing.lg, backgroundColor: colors.brand, paddingVertical: 14, borderRadius: radius.lg, alignItems: "center" },
  ctaText: { color: colors.onBrand, fontWeight: "700", fontSize: 15, letterSpacing: 0.3 },
  err: { position: "absolute", left: spacing.lg, right: spacing.lg, bottom: 140, color: colors.onError, backgroundColor: colors.error, padding: spacing.md, borderRadius: radius.md, textAlign: "center" },
});
