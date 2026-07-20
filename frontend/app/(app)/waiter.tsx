import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, FlatList, ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeInDown, FadeInUp, useAnimatedStyle, useSharedValue, withSpring,
} from "react-native-reanimated";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { menuItemImageSource } from "@/src/lib/foodImage";
import { colors, spacing, radius } from "@/src/theme";

type Cat = { id: string; name: string };
type Item = { id: string; category_id: string; name: string; price: number; description: string; image_base64?: string; image_url?: string };
type Table = { id: string; label: string; seats: number };
type Line = { menu_item_id: string; name: string; price: number; quantity: number; notes: string };

const AnimText = Animated.createAnimatedComponent(Text);

export default function Waiter() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [cats, setCats] = useState<Cat[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [selCat, setSelCat] = useState<string | "all">("all");
  const [search, setSearch] = useState("");
  const [table, setTable] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, m, t] = await Promise.all([api.listCategories(), api.listMenu(), api.listTables()]);
      setCats(c); setItems(m); setTables(t);
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

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

  // trigger pulse on subtotal change
  useEffect(() => { if (subtotal > 0) { scale.value = withSpring(1.08, { damping: 10 }, () => { scale.value = withSpring(1); }); } }, [subtotal, scale]);

  const submitOrder = async () => {
    if (!table.trim()) { setErr("Choose a table."); return; }
    if (lines.length === 0) { setErr("Add at least one item."); return; }
    setBusy(true); setErr(null);
    try {
      const order = await api.createOrder({ table_number: table.trim(), items: lines, notes: "" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setLines([]); setTable("");
      router.push({ pathname: "/(app)/billing", params: { orderId: order.id } });
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]} testID="waiter-screen">
      <View style={styles.orderPane}>
        <View style={styles.orderHeader}>
          <Text style={styles.paneTitle}>Current Order</Text>
          <AnimText style={[styles.subVal, animStyle]} testID="waiter-subtotal">₹{subtotal.toFixed(0)}</AnimText>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tableChipsWrap} contentContainerStyle={styles.tableChipsRow}>
          {tables.length === 0 ? (
            <TextInput
              value={table} onChangeText={setTable} placeholder="Table #"
              placeholderTextColor={colors.onSurfaceTertiary} style={styles.tableInputInline}
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
            <Ionicons name="cart-outline" size={26} color={colors.onSurfaceTertiary} />
            <Text style={{ color: colors.onSurfaceTertiary, marginTop: 6 }}>No items added</Text>
          </View>
        ) : (
          <FlatList
            data={lines}
            keyExtractor={l => l.menu_item_id}
            renderItem={({ item }) => (
              <Animated.View entering={FadeInDown.springify()} style={styles.line} testID={`order-line-${item.menu_item_id}`}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lineName}>{item.name}</Text>
                  <Text style={styles.linePrice}>₹{item.price} × {item.quantity} = ₹{(item.price * item.quantity).toFixed(0)}</Text>
                </View>
                <Pressable onPress={() => dec(item.menu_item_id)} style={styles.qBtn} testID={`order-dec-${item.menu_item_id}`}>
                  <Ionicons name="remove" size={16} color={colors.onSurface} />
                </Pressable>
                <Text style={styles.qty}>{item.quantity}</Text>
                <Pressable onPress={() => inc(item.menu_item_id)} style={styles.qBtn} testID={`order-inc-${item.menu_item_id}`}>
                  <Ionicons name="add" size={16} color={colors.onSurface} />
                </Pressable>
                <Pressable onPress={() => remove(item.menu_item_id)} style={{ marginLeft: 6 }} testID={`order-del-${item.menu_item_id}`} hitSlop={8}>
                  <Ionicons name="trash" size={18} color={colors.onError} />
                </Pressable>
              </Animated.View>
            )}
          />
        )}
      </View>

      <View style={styles.menuPane}>
        <View style={styles.searchRow}>
          <Ionicons name="search" size={16} color={colors.onSurfaceTertiary} />
          <TextInput
            value={search} onChangeText={setSearch} placeholder="Search dishes"
            placeholderTextColor={colors.onSurfaceTertiary} style={styles.search}
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
          <Text style={styles.ctaText}>Send to Kitchen · {totalQty} items · ₹{subtotal.toFixed(0)}</Text>
        )}
      </Pressable>
    </View>
  );
}

function Chip({ label, active, onPress, testID }: { label: string; active: boolean; onPress: () => void; testID: string }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive, { flexShrink: 0 }]} testID={testID}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  orderPane: { height: "35%", backgroundColor: colors.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  orderHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  paneTitle: { color: colors.onSurface, fontSize: 18, fontFamily: "serif" },
  tableChipsWrap: { maxHeight: 44, minHeight: 44 },
  tableChipsRow: { gap: spacing.sm, alignItems: "center", paddingRight: spacing.md },
  tableInputInline: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 8, color: colors.onSurface, minWidth: 100 },
  emptyOrder: { flex: 1, alignItems: "center", justifyContent: "center" },
  line: { flexDirection: "row", alignItems: "center", paddingVertical: 8, gap: 6 },
  lineName: { color: colors.onSurface, fontSize: 14 },
  linePrice: { color: colors.onSurfaceSecondary, fontSize: 11 },
  qBtn: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  qty: { color: colors.onSurface, minWidth: 20, textAlign: "center" },
  subVal: { color: colors.brand, fontSize: 22, fontFamily: "serif" },

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
  menuName: { color: colors.onSurface, fontSize: 13 },
  menuPrice: { color: colors.brand, fontSize: 15, fontFamily: "serif", marginTop: 2 },
  plus: { position: "absolute", right: 8, top: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  cta: { position: "absolute", left: spacing.lg, right: spacing.lg, backgroundColor: colors.brand, paddingVertical: 14, borderRadius: radius.lg, alignItems: "center" },
  ctaText: { color: colors.onBrand, fontWeight: "600", fontSize: 15, letterSpacing: 0.5 },
  err: { position: "absolute", left: spacing.lg, right: spacing.lg, bottom: 140, color: colors.onError, backgroundColor: colors.error, padding: spacing.md, borderRadius: radius.md, textAlign: "center" },
});
