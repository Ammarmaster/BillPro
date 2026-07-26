import { useCallback, useState, useMemo } from "react";
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

type Cat = { id: string; name: string };
type Item = { id: string; category_id: string; name: string; price: number; description: string };
type Line = { menu_item_id: string; name: string; price: number; quantity: number; notes: string };

export default function TakeawayScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme, isDark } = useTheme();

  const [cats, setCats] = useState<Cat[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [selCat, setSelCat] = useState<string | "all">("all");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Line[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [c, m] = await Promise.all([api.listCategories(), api.listMenu()]);
      setCats(c || []);
      setItems(m || []);
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

  // Generate Bill Workflow (Navigates to Bill Detail & Payment Method Selection)
  const handleGenerateBill = async () => {
    if (cart.length === 0) { setErr("Add items to generate bill."); return; }
    setBusy(true); setErr(null);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // 1. Create order
      const order = await api.createOrder({ table_number: "Takeaway", items: cart, notes: "Takeaway" });
      // 2. Create bill
      await api.createBill({ order_id: order.id, tax_percent: 5, discount: 0, gst_enabled: true });
      // 3. Clear cart and navigate to bill detail
      setCart([]);
      router.push({ pathname: "/(app)/billing", params: { orderId: order.id } });
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.surface }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.surface} />
      <View style={[styles.wrap, { paddingTop: insets.top, backgroundColor: theme.surface }]}>
        
        {/* Header matching Image 5 */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.onSurface }]}>Takeaway</Text>
          <Text style={[styles.sub, { color: theme.onSurfaceSecondary }]}>Walk-in / pickup orders</Text>
        </View>

        {/* Search Bar */}
        <View style={[styles.searchRow, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
          <Ionicons name="search" size={18} color={theme.onSurfaceTertiary} />
          <TextInput
            value={search} onChangeText={setSearch} placeholder="Search items..."
            placeholderTextColor={theme.onSurfaceTertiary} style={[styles.search, { color: theme.onSurface }]}
          />
        </View>

        {/* Spacious Category Chips */}
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

        {/* Items List matching Image 5 */}
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
                    pressed && styles.cardPressed,
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

        {/* Bottom CTA Bar matching Image 5 */}
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

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F8F9FD" },
  wrap: { flex: 1, backgroundColor: "#F8F9FD" },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  title: { color: "#0F172A", fontSize: 28, fontWeight: "900" },
  sub: { color: "#64748B", fontSize: 13, marginTop: 2, fontWeight: "500" },
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
