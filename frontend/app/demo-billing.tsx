// Demo of the real EzBill app with sample data. It looks and works like the app
// (same sidebar, tabs, Takeaway, Tables and Kitchen screens), nothing is saved,
// and anything that needs a real restaurant asks the person to subscribe.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, StatusBar, Modal, TextInput, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/context/ThemeContext";
import { useAuth } from "@/src/context/AuthContext";
import { useResponsive } from "@/src/hooks/useResponsive";
import { api } from "@/src/lib/api";
import { foodImageUrl } from "@/src/lib/foodImage";
import { vegMarkColor } from "@/src/lib/vegDish";
import { radius, spacing } from "@/src/theme";

type Tab = "dashboard" | "tables" | "pos" | "kitchen" | "more";
type IconName = keyof typeof Ionicons.glyphMap;
type Dish = { id: string; name: string; price: number; cat: string };
type Line = { id: string; name: string; price: number; qty: number };
type TicketStatus = "placed" | "in_kitchen" | "ready";
type Ticket = { id: string; num: number; table: string; items: { name: string; qty: number }[]; status: TicketStatus; at: number; note?: string };
type DemoTable = { id: string; label: string; seats: number; status: "Available" | "Occupied" | "Billed"; lines: Line[] };
type Bill = { no: number; table: string; lines: Line[]; subtotal: number; gst: number; cgst: number; sgst: number; total: number; mode: string; secs: number | null };
type Wall = { title: string; sub: string; icon?: IconName };

const BRAND = "#635BFF";
const PRICE = 299;

const MENU: Dish[] = [
  { id: "d1", name: "Chicken Dum Biryani", price: 220, cat: "Biryani" },
  { id: "d2", name: "Veg Biryani", price: 160, cat: "Biryani" },
  { id: "d3", name: "Paneer Tikka", price: 240, cat: "Starters" },
  { id: "d4", name: "Chicken 65", price: 210, cat: "Starters" },
  { id: "d5", name: "Butter Chicken", price: 280, cat: "Main Course" },
  { id: "d6", name: "Paneer Butter Masala", price: 230, cat: "Main Course" },
  { id: "d7", name: "Dal Makhani", price: 170, cat: "Main Course" },
  { id: "d8", name: "Butter Naan", price: 45, cat: "Breads" },
  { id: "d9", name: "Garlic Naan", price: 55, cat: "Breads" },
  { id: "d10", name: "Masala Dosa", price: 120, cat: "South Indian" },
  { id: "d11", name: "Mango Lassi", price: 90, cat: "Drinks" },
  { id: "d12", name: "Masala Chai", price: 30, cat: "Drinks" },
  { id: "d13", name: "Gulab Jamun", price: 80, cat: "Desserts" },
];
const CATS = ["Biryani", "Starters", "Main Course", "Breads", "South Indian", "Drinks", "Desserts"];

const line = (id: string, qty: number): Line => {
  const d = MENU.find(m => m.id === id)!;
  return { id: d.id, name: d.name, price: d.price, qty };
};

const START_TABLES: DemoTable[] = [
  { id: "t1", label: "T1", seats: 4, status: "Available", lines: [] },
  { id: "t2", label: "T2", seats: 4, status: "Occupied", lines: [line("d1", 2), line("d11", 2)] },
  { id: "t3", label: "T3", seats: 2, status: "Available", lines: [] },
  { id: "t4", label: "T4", seats: 6, status: "Available", lines: [] },
  { id: "t5", label: "T5", seats: 4, status: "Occupied", lines: [line("d6", 1), line("d8", 4), line("d7", 1)] },
  { id: "t6", label: "T6", seats: 2, status: "Available", lines: [] },
  { id: "t7", label: "T7", seats: 4, status: "Billed", lines: [line("d5", 1), line("d9", 3), line("d13", 2)] },
  { id: "t8", label: "T8", seats: 8, status: "Available", lines: [] },
];

const START_TICKETS = (): Ticket[] => [
  { id: "k101", num: 101, table: "T2", items: [{ name: "Chicken Dum Biryani", qty: 2 }, { name: "Mango Lassi", qty: 2 }], status: "in_kitchen", at: Date.now() - 6 * 60000 },
  { id: "k102", num: 102, table: "T5", items: [{ name: "Paneer Butter Masala", qty: 1 }, { name: "Butter Naan", qty: 4 }, { name: "Dal Makhani", qty: 1 }], status: "placed", at: Date.now() - 2 * 60000, note: "Less spicy" },
];

// What each locked screen would do for the restaurant once subscribed
const LOCKED: { key: string; name: string; icon: IconName; group: "ops" | "catalog" | "system"; why: string }[] = [
  { key: "register", name: "Billing Register", icon: "receipt-outline", group: "ops", why: "See and reprint every bill you have made." },
  { key: "history", name: "Bills History", icon: "file-tray-full-outline", group: "ops", why: "Find any old bill by date, table or amount." },
  { key: "cash", name: "Cash Closing & EOD", icon: "wallet-outline", group: "ops", why: "Close the day and match cash, UPI and card in one tap." },
  { key: "menu", name: "Menu Catalog", icon: "fast-food-outline", group: "catalog", why: "Add your own dishes, prices and photos." },
  { key: "tablesetup", name: "Table Setup", icon: "grid-outline", group: "catalog", why: "Set up your own tables and seats." },
  { key: "staff", name: "Waiters & Staff", icon: "people-outline", group: "catalog", why: "Give waiters and the kitchen their own logins." },
  { key: "analytics", name: "Sales Analytics", icon: "bar-chart-outline", group: "catalog", why: "Know your best dishes and busiest hours." },
  { key: "ai", name: "AI Menu Scanner", icon: "sparkles-outline", group: "catalog", why: "Take a photo of your paper menu and every dish is added for you." },
  { key: "poster", name: "Status Poster AI", icon: "megaphone-outline", group: "catalog", why: "Make WhatsApp status posters for your offers in seconds." },
  { key: "printer", name: "Printer Setup", icon: "print-outline", group: "system", why: "Connect your thermal printer for bills and kitchen slips (KOT)." },
  { key: "settings", name: "Settings", icon: "settings-outline", group: "system", why: "Your GST number, logo, UPI ID and bill design." },
];

// The everyday problems EzBill takes away
const PROBLEMS: { icon: IconName; color: string; problem: string; fix: string }[] = [
  { icon: "receipt-outline", color: "#635BFF", problem: "Slow handwritten bills and long queues", fix: "Make a GST bill in under 10 seconds, with your UPI QR printed on it." },
  { icon: "restaurant-outline", color: "#F59E0B", problem: "Wrong or forgotten orders in the kitchen", fix: "Orders go straight to the kitchen screen or KOT printer. Nothing gets lost." },
  { icon: "wallet-outline", color: "#10B981", problem: "Cash leakage and no idea of today's sales", fix: "Every bill is recorded. See today's sales live on your phone, from anywhere." },
  { icon: "cloud-offline-outline", color: "#EF4444", problem: "Internet goes down at rush hour", fix: "Keep billing without internet. Everything syncs when it comes back." },
];

const BENEFITS = [
  "Unlimited bills and kitchen orders (KOT)",
  "Print on your own thermal printer",
  "Your own menu, tables and staff logins",
  "Works even without internet",
  "Live sales on your phone + day-end report",
];

const WEEK = [12400, 15800, 13900, 17200, 21600, 24800];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Today"];
const BASE_REVENUE = 18450;
const BASE_ORDERS = 64;

const STATUS_TEXT: Record<TicketStatus, string> = { placed: "NEW", in_kitchen: "COOKING", ready: "READY" };
const STATUS_BG: Record<TicketStatus, string> = { placed: "#FEF3C7", in_kitchen: "#E0E7FF", ready: "#DCFCE7" };
const STATUS_FG: Record<TicketStatus, string> = { placed: "#D97706", in_kitchen: "#4F46E5", ready: "#16A34A" };
const NEXT_LABEL: Record<TicketStatus, string> = { placed: "Start Cooking →", in_kitchen: "Mark Ready →", ready: "Mark Served →" };
const NEXT_BG: Record<TicketStatus, string> = { placed: "#F59E0B", in_kitchen: "#635BFF", ready: "#10B981" };

const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
// Shows paise only when there are some, e.g. ₹672 or ₹672.25
const money = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${Number(n.toFixed(2))}%`;
const round2 = (n: number) => Math.round(n * 100) / 100;
const tap = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };

export default function DemoBilling() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { registered } = useLocalSearchParams<{ registered?: string }>();
  const { theme, isDark, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { isDesktop, isLargeDesktop, width } = useResponsive();

  const [restaurant, setRestaurant] = useState<any>(() => api.getCachedRestaurant() || null);
  const restaurantName: string = restaurant?.name || "";
  // Same GST as the real bills: the restaurant's own setting, or 5% for visitors without a restaurant
  const gstOn = restaurant ? !!restaurant.gst_enabled : true;
  const gstRate = Number(restaurant?.gst_rate ?? 5);
  const gstin: string = restaurant?.gst || restaurant?.gst_number || restaurant?.gstin || "";
  const [subscribed, setSubscribed] = useState(false);

  const [tab, setTab] = useState<Tab>("pos");
  const [showWelcome, setShowWelcome] = useState(true);
  const [wall, setWall] = useState<Wall | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Point of sale
  const [cart, setCart] = useState<Line[]>([]);
  const [target, setTarget] = useState<string | null>(null); // table label, or null for takeaway
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("All");
  const [mode, setMode] = useState<"Cash" | "UPI" | "Card">("UPI");
  const [kotSent, setKotSent] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const startedAt = useRef<number | null>(null);

  const [tables, setTables] = useState<DemoTable[]>(START_TABLES);
  const [openTable, setOpenTable] = useState<DemoTable | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>(START_TICKETS);
  const [nextKot, setNextKot] = useState(103);
  const [bills, setBills] = useState<Bill[]>([]);
  const [receipt, setReceipt] = useState<Bill | null>(null);
  const [steps, setSteps] = useState({ add: false, kot: false, bill: false });
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!user) return;
    api.getRestaurant().then(r => { if (r) setRestaurant(r); }).catch(() => {});
    if (user.role === "super_admin" || user.role === "admin_employee") { setSubscribed(true); return; }
    api.mySubscription().then(s => setSubscribed(s?.status === "active")).catch(() => {});
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const shopName = restaurantName || "Your Restaurant";
  const ownerName = user?.full_name || user?.email?.split("@")[0] || "Restaurant Owner";

  // ---------- actions ----------
  const lock = (title: string, sub: string, icon?: IconName) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setShowCart(false);
    setWall({ title, sub, icon });
  };

  const goSubscribe = () => {
    setWall(null);
    setShowWelcome(false);
    if (subscribed) router.replace("/(app)/dashboard");
    else if (user) router.push("/(app)/subscribe");
    else router.push("/register");
  };

  const leave = async () => {
    if (user) {
      await logout();
      router.replace(Platform.OS === "web" ? "/" : "/login");
    } else {
      router.replace(Platform.OS === "web" ? "/" : "/login");
    }
  };

  const openLocked = (key: string) => {
    const f = LOCKED.find(l => l.key === key);
    if (f) lock(`${f.name} is ready for you`, `${f.why} Subscribe to use it with your own restaurant.`, f.icon);
  };

  const qtyOf = (id: string) => cart.find(l => l.id === id)?.qty || 0;

  const changeQty = (d: Dish, delta: number) => {
    tap();
    if (cart.length === 0 && delta > 0) startedAt.current = Date.now();
    setKotSent(false);
    setSteps(s => (s.add ? s : { ...s, add: true }));
    setCart(prev => {
      const cur = prev.find(l => l.id === d.id);
      if (!cur) return delta > 0 ? [...prev, { id: d.id, name: d.name, price: d.price, qty: 1 }] : prev;
      const qty = cur.qty + delta;
      return qty <= 0 ? prev.filter(l => l.id !== d.id) : prev.map(l => (l.id === d.id ? { ...l, qty } : l));
    });
  };

  const tableLines = target ? tables.find(t => t.label === target)?.lines || [] : [];
  // Same maths as the real billing screen: GST on the subtotal, split half CGST and half SGST
  const totals = (lines: Line[]) => {
    const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
    const gst = gstOn ? round2(subtotal * (gstRate / 100)) : 0;
    const cgst = round2(gst / 2);
    return { subtotal, gst, cgst, sgst: round2(gst - cgst), total: round2(subtotal + gst) };
  };
  const cartCount = cart.reduce((s, l) => s + l.qty, 0);

  const mergeLines = (a: Line[], b: Line[]) => {
    const out = a.map(l => ({ ...l }));
    b.forEach(l => {
      const hit = out.find(o => o.id === l.id);
      if (hit) hit.qty += l.qty;
      else out.push({ ...l });
    });
    return out;
  };

  const sendKot = () => {
    if (cart.length === 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const label = target || "Takeaway";
    setTickets(prev => [...prev, { id: `k${nextKot}`, num: nextKot, table: label, items: cart.map(l => ({ name: l.name, qty: l.qty })), status: "placed", at: Date.now() }]);
    setNextKot(n => n + 1);
    setSteps(s => ({ ...s, kot: true }));
    if (target) {
      setTables(prev => prev.map(t => (t.label === target ? { ...t, status: "Occupied", lines: mergeLines(t.lines, cart) } : t)));
      setCart([]);
      setShowCart(false);
      setToast(`Order for ${target} sent to the kitchen`);
    } else {
      setKotSent(true);
      setToast("Sent to the kitchen. Open the Kitchen tab to see it.");
    }
  };

  const makeBill = (lines: Line[], label: string) => {
    const t = totals(lines);
    const secs = startedAt.current ? Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)) : null;
    const bill: Bill = { no: 1043 + bills.length, table: label, lines, ...t, mode, secs };
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setBills(prev => [...prev, bill]);
    setSteps(s => ({ ...s, bill: true }));
    setReceipt(bill);
    startedAt.current = null;
  };

  const billFromPos = () => {
    const lines = target ? mergeLines(tableLines, cart) : cart;
    if (lines.length === 0) return;
    makeBill(lines, target || "Takeaway");
    if (target) setTables(prev => prev.map(t => (t.label === target ? { ...t, status: "Available", lines: [] } : t)));
    setCart([]);
    setKotSent(false);
    setShowCart(false);
    setTarget(null);
  };

  const closeReceipt = () => {
    const firstBill = bills.length === 1;
    const secs = receipt?.secs;
    setReceipt(null);
    if (firstBill && !subscribed) {
      setTimeout(() => setWall({
        title: secs ? `You made a bill in ${secs} seconds!` : "That's how fast billing is!",
        sub: "Now do the same for your real customers. Subscribe and your menu, tables, printer and staff can be ready today.",
        icon: "trophy-outline",
      }), 250);
    }
  };

  const pickTable = (t: DemoTable) => {
    tap();
    if (t.status === "Available") {
      setTarget(t.label);
      setCart([]);
      setKotSent(false);
      setTab("pos");
    } else {
      setOpenTable(t);
    }
  };

  const advanceTicket = (k: Ticket) => {
    tap();
    if (k.status === "ready") {
      setTickets(prev => prev.filter(x => x.id !== k.id));
      setToast(`Order #${k.num} served`);
      return;
    }
    const next: TicketStatus = k.status === "placed" ? "in_kitchen" : "ready";
    setTickets(prev => prev.map(x => (x.id === k.id ? { ...x, status: next } : x)));
  };

  // ---------- numbers for the dashboard ----------
  const revenue = BASE_REVENUE + bills.reduce((s, b) => s + b.total, 0);
  const orders = BASE_ORDERS + bills.length;
  const busyTables = tables.filter(t => t.status !== "Available").length;
  const week = [...WEEK, revenue];
  const maxWeek = Math.max(...week);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return MENU.filter(d => (cat === "All" || d.cat === cat) && (!q || d.name.toLowerCase().includes(q)));
  }, [search, cat]);

  const card = { backgroundColor: theme.surfaceSecondary, borderColor: theme.border };
  const tint = isDark ? "rgba(99,91,255,0.16)" : "#EEF2FF";
  const pad = isDesktop ? spacing.xl : spacing.lg;

  // ---------- small pieces ----------
  const Header = ({ title, sub, right }: { title: string; sub: string; right?: ReactNode }) => (
    <View style={[styles.headerRow, { paddingHorizontal: pad }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.title, { color: theme.onSurface }]} numberOfLines={1}>{title}</Text>
        <Text style={[styles.sub, { color: theme.onSurfaceSecondary }]} numberOfLines={2}>{sub}</Text>
      </View>
      {right}
    </View>
  );

  const Counter = ({ d, small }: { d: Dish | Line; small?: boolean }) => {
    const dish = MENU.find(m => m.id === d.id)!;
    return (
      <View style={[styles.counterPill, { backgroundColor: isDark ? "#26294D" : "#F1F0FF" }]}>
        <Pressable onPress={() => changeQty(dish, -1)} hitSlop={8} style={styles.counterBtn} accessibilityLabel={`Remove one ${dish.name}`}>
          <Ionicons name="remove" size={small ? 14 : 16} color={BRAND} />
        </Pressable>
        <Text style={[styles.counterText, small && { fontSize: 13 }]}>{qtyOf(dish.id)}</Text>
        <Pressable onPress={() => changeQty(dish, 1)} hitSlop={8} style={styles.counterBtn} accessibilityLabel={`Add one ${dish.name}`}>
          <Ionicons name="add" size={small ? 14 : 16} color={BRAND} />
        </Pressable>
      </View>
    );
  };

  // ---------- demo banner (always on top) ----------
  const stepChip = (done: boolean, label: string) => (
    <View key={label} style={[styles.stepChip, { borderColor: done ? "#10B981" : theme.border, backgroundColor: done ? (isDark ? "rgba(16,185,129,0.14)" : "#ECFDF5") : "transparent" }]}>
      <Ionicons name={done ? "checkmark-circle" : "ellipse-outline"} size={14} color={done ? "#10B981" : theme.onSurfaceTertiary} />
      <Text style={{ fontSize: 12, fontWeight: "700", color: done ? "#10B981" : theme.onSurfaceSecondary }}>{label}</Text>
    </View>
  );

  const doneCount = [steps.add, steps.kot, steps.bill].filter(Boolean).length;

  const banner = (
    <View style={[styles.banner, { borderBottomColor: theme.border, backgroundColor: isDark ? "#14132B" : "#F5F3FF", paddingHorizontal: pad, paddingTop: isDesktop ? 10 : insets.top + 8 }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={styles.demoTag}>
          <Ionicons name="flask" size={11} color="#FFFFFF" />
          <Text style={styles.demoTagText}>DEMO</Text>
        </View>
        <Text style={{ flex: 1, color: theme.onSurface, fontSize: isDesktop ? 13 : 12, fontWeight: "600" }} numberOfLines={2}>
          {subscribed
            ? "You're subscribed. This is the practice version with sample data."
            : isDesktop
              ? "This is the real EzBill app with sample data. Subscribe to bill your real customers."
              : "Sample data. Subscribe to use it for real."}
        </Text>
        <Pressable onPress={goSubscribe} style={({ pressed }) => [styles.bannerBtn, pressed && { opacity: 0.85 }]} testID="demo-subscribe-top">
          <Text style={styles.bannerBtnText}>{subscribed ? "Open my EzBill" : isDesktop ? `Subscribe · ₹${PRICE}/mo` : "Subscribe"}</Text>
        </Pressable>
      </View>
      {!subscribed && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 0.6, color: theme.onSurfaceTertiary, marginRight: 2 }}>
            TRY IT · {doneCount}/3
          </Text>
          {stepChip(steps.add, "Add items")}
          {stepChip(steps.kot, "Send to kitchen")}
          {stepChip(steps.bill, "Make the bill")}
        </View>
      )}
    </View>
  );

  // ---------- screens ----------
  const dashboard = (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <Header title="Dashboard" sub={`Welcome back, ${ownerName} · ${shopName}`} />
      <View style={{ paddingHorizontal: pad, gap: spacing.lg }}>
        <View style={{ flexDirection: isDesktop ? "row" : "column", gap: spacing.lg }}>
          <LinearGradient colors={["#5B4DFF", "#7B61FF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.heroCard, isDesktop && { flex: 1.3 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#34D399" }} />
              <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }}>LIVE • Today's Revenue</Text>
            </View>
            <Text style={{ color: "#FFFFFF", fontSize: 42, fontWeight: "900", marginVertical: 8, letterSpacing: -0.5 }}>{rupees(revenue)}</Text>
            <View style={{ flexDirection: "row", gap: 32, marginTop: 4 }}>
              <View>
                <Text style={styles.heroNum}>{orders}</Text>
                <Text style={styles.heroLbl}>Orders Today</Text>
              </View>
              <View>
                <Text style={styles.heroNum}>{rupees(revenue / orders)}</Text>
                <Text style={styles.heroLbl}>Average Bill</Text>
              </View>
            </View>
            {bills.length > 0 && (
              <Text style={{ color: "#E0E7FF", fontSize: 12, fontWeight: "700", marginTop: 12 }}>
                +{rupees(bills.reduce((s, b) => s + b.total, 0))} from the {bills.length === 1 ? "bill" : `${bills.length} bills`} you just made
              </Text>
            )}
          </LinearGradient>

          <View style={{ flex: 1, gap: spacing.md }}>
            {[
              { icon: "people" as IconName, color: "#D97706", label: "Tables busy", value: `${busyTables} / ${tables.length}`, go: "tables" as Tab },
              { icon: "flame" as IconName, color: BRAND, label: "Orders in kitchen", value: String(tickets.length), go: "kitchen" as Tab },
              { icon: "qr-code" as IconName, color: "#10B981", label: "Paid by UPI today", value: "62%", go: null },
            ].map(s => (
              <Pressable key={s.label} onPress={() => s.go && setTab(s.go)} style={({ pressed }) => [styles.statRow, card, pressed && s.go && { opacity: 0.85 }]}>
                <View style={[styles.statIcon, { backgroundColor: s.color + "22" }]}>
                  <Ionicons name={s.icon} size={18} color={s.color} />
                </View>
                <Text style={{ flex: 1, color: theme.onSurfaceSecondary, fontSize: 13, fontWeight: "600" }}>{s.label}</Text>
                <Text style={{ color: theme.onSurface, fontSize: 18, fontWeight: "900" }}>{s.value}</Text>
                {s.go && <Ionicons name="chevron-forward" size={16} color={theme.onSurfaceTertiary} />}
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ flexDirection: isDesktop ? "row" : "column", gap: spacing.lg }}>
          <View style={[styles.panel, card, isDesktop && { flex: 1.3 }]}>
            <Text style={[styles.panelTitle, { color: theme.onSurface }]}>Revenue • Last 7 days</Text>
            <View style={{ flexDirection: "row", alignItems: "flex-end", height: 150, gap: 10, marginTop: spacing.md }}>
              {week.map((v, i) => (
                <View key={i} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                  <Text style={{ fontSize: 10, color: theme.onSurfaceTertiary, marginBottom: 4 }}>{(v / 1000).toFixed(1)}k</Text>
                  <View style={{ width: "100%", maxWidth: 34, height: `${Math.max(8, (v / maxWeek) * 100) * 0.8}%`, borderRadius: 8, backgroundColor: i === week.length - 1 ? BRAND : isDark ? "#2E2E48" : "#DDD9FF" }} />
                  <Text style={{ fontSize: 11, color: i === week.length - 1 ? BRAND : theme.onSurfaceSecondary, marginTop: 6, fontWeight: "700" }}>{DAYS[i]}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={[styles.panel, card, { flex: 1 }]}>
            <Text style={[styles.panelTitle, { color: theme.onSurface }]}>Top sellers today</Text>
            {[["Chicken Dum Biryani", 38], ["Butter Naan", 64], ["Paneer Butter Masala", 21], ["Mango Lassi", 19]].map(([name, qty], i) => (
              <View key={String(name)} style={[styles.topRow, { borderTopColor: theme.border, borderTopWidth: i ? 1 : 0 }]}>
                <Image source={{ uri: foodImageUrl(String(name)) }} style={{ width: 36, height: 36, borderRadius: 10 }} contentFit="cover" />
                <Text style={{ flex: 1, color: theme.onSurface, fontSize: 14, fontWeight: "700" }} numberOfLines={1}>{name}</Text>
                <Text style={{ color: theme.onSurfaceSecondary, fontSize: 13, fontWeight: "700" }}>{qty} sold</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={[styles.panel, card]}>
          <Text style={[styles.panelTitle, { color: theme.onSurface }]}>What EzBill fixes in your restaurant</Text>
          <View style={{ flexDirection: isDesktop ? "row" : "column", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.md }}>
            {PROBLEMS.map(p => (
              <View key={p.problem} style={[styles.problemCard, { borderColor: theme.border, backgroundColor: theme.surfaceTertiary }, isDesktop && { width: "48.5%" }]}>
                <View style={[styles.statIcon, { backgroundColor: p.color + "22" }]}>
                  <Ionicons name={p.icon} size={18} color={p.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.onSurfaceSecondary, fontSize: 12, fontWeight: "700", textDecorationLine: "line-through" }}>{p.problem}</Text>
                  <Text style={{ color: theme.onSurface, fontSize: 14, fontWeight: "700", marginTop: 3, lineHeight: 20 }}>{p.fix}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {!subscribed && (
          <Pressable onPress={goSubscribe} style={({ pressed }) => [styles.realCard, { borderColor: BRAND, backgroundColor: tint }, pressed && { opacity: 0.9 }]}>
            <Ionicons name="stats-chart" size={22} color={BRAND} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.onSurface, fontWeight: "900", fontSize: 15 }}>These are sample numbers</Text>
              <Text style={{ color: theme.onSurfaceSecondary, fontSize: 13, marginTop: 2 }}>Subscribe and this screen shows your real sales, live.</Text>
            </View>
            <Text style={{ color: BRAND, fontWeight: "900", fontSize: 13 }}>Subscribe →</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );

  const tableCols = isLargeDesktop ? 5 : isDesktop ? 4 : width >= 560 ? 3 : 2;
  const counts = {
    available: tables.filter(t => t.status === "Available").length,
    occupied: tables.filter(t => t.status === "Occupied").length,
    billed: tables.filter(t => t.status === "Billed").length,
  };
  const tablesScreen = (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <Header
        title="Tables"
        sub="Tap a free table to take an order. Tap a busy table to print its bill."
        right={
          <Pressable onPress={() => { setTarget(null); setCart([]); setTab("pos"); }} style={[styles.outlineBtn, { borderColor: theme.border, backgroundColor: theme.surfaceSecondary }]}>
            <Ionicons name="bag-handle-outline" size={15} color={BRAND} />
            {isDesktop && <Text style={{ color: BRAND, fontWeight: "800", fontSize: 13 }}>Takeaway</Text>}
          </Pressable>
        }
      />
      <View style={{ flexDirection: "row", gap: 16, paddingHorizontal: pad, marginBottom: spacing.md, flexWrap: "wrap" }}>
        {[["#10B981", "Available", counts.available], ["#D97706", "Occupied", counts.occupied], ["#EF4444", "Billed", counts.billed]].map(([c, l, n]) => (
          <View key={String(l)} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: String(c) }} />
            <Text style={{ fontSize: 13, color: theme.onSurfaceSecondary, fontWeight: "600" }}>
              {l} · <Text style={{ color: theme.onSurface, fontWeight: "800" }}>{n}</Text>
            </Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", paddingHorizontal: pad - 6 }}>
        {tables.map(t => {
          const total = totals(t.lines).total;
          let bg = isDark ? "#161C2E" : "#F0FDF4", border = isDark ? "#065F46" : "#BBF7D0", iconBg = isDark ? "#064E3B" : "#DCFCE7";
          let iconColor = isDark ? "#34D399" : "#10B981", label = "Available", labelColor = iconColor, icon: IconName = "checkmark-circle-outline";
          if (t.status === "Occupied") {
            bg = isDark ? "#2D1E0C" : "#FFFBEB"; border = isDark ? "#78350F" : "#FDE68A"; iconBg = isDark ? "#451A03" : "#FEF3C7";
            iconColor = "#D97706"; label = money(total); labelColor = "#4F46E5"; icon = "people";
          } else if (t.status === "Billed") {
            bg = isDark ? "#2A1417" : "#FFF1F2"; border = isDark ? "#7F1D1D" : "#FECDD3"; iconBg = isDark ? "#451216" : "#FEE2E2";
            iconColor = "#EF4444"; label = "Billed"; labelColor = "#EF4444"; icon = "stop";
          }
          return (
            <View key={t.id} style={{ width: `${100 / tableCols}%`, padding: 6 }}>
              <Pressable onPress={() => pickTable(t)} style={({ pressed }) => [styles.tableCard, { backgroundColor: bg, borderColor: border }, pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] }]} testID={`demo-table-${t.id}`}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: iconBg, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name={icon} size={15} color={iconColor} />
                  </View>
                  {t.status === "Occupied" && (
                    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "#4F46E5", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: "#FFFFFF", fontSize: 11, fontWeight: "900" }}>1</Text>
                    </View>
                  )}
                </View>
                <View style={{ marginTop: 8 }}>
                  <Text style={{ fontSize: 24, fontWeight: "900", color: theme.onSurface }}>{t.label}</Text>
                  <Text style={{ fontSize: 12, color: theme.onSurfaceSecondary, marginTop: 2, fontWeight: "500" }}>{t.seats} seats</Text>
                </View>
                <Text style={{ fontSize: t.status === "Occupied" ? 15 : 13, fontWeight: "900", color: labelColor, marginTop: 4 }}>{label}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );

  const cartPanel = (inSheet: boolean) => {
    const allLines = target ? mergeLines(tableLines, cart) : cart;
    const t = totals(allLines);
    return (
      <View style={{ flex: 1 }}>
        {!inSheet && (
          <View style={{ padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: theme.border }}>
            <Text style={{ fontSize: 18, fontWeight: "900", color: theme.onSurface }}>{target ? `${target} Order` : "Takeaway Order"}</Text>
            <Text style={{ fontSize: 12, color: theme.onSurfaceSecondary, marginTop: 2 }}>{target ? "Already served items + new items" : "Current items in cart"}</Text>
          </View>
        )}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md, gap: spacing.sm, flexGrow: 1 }}>
          {tableLines.length > 0 && (
            <View style={[styles.cartLine, { backgroundColor: theme.surfaceTertiary, borderColor: theme.border, flexDirection: "column", alignItems: "stretch" }]}>
              <Text style={{ color: theme.onSurfaceTertiary, fontSize: 11, fontWeight: "800", letterSpacing: 0.6, marginBottom: 4 }}>ALREADY ON {target}</Text>
              {tableLines.map(l => (
                <Text key={l.id} style={{ color: theme.onSurfaceSecondary, fontSize: 13, marginTop: 2 }}>{l.qty}× {l.name} · {rupees(l.price * l.qty)}</Text>
              ))}
            </View>
          )}
          {cart.length === 0 && tableLines.length === 0 ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40 }}>
              <Ionicons name="bag-handle-outline" size={36} color={theme.onSurfaceTertiary} />
              <Text style={{ color: theme.onSurfaceTertiary, marginTop: 8, fontSize: 14 }}>Cart is empty</Text>
              <Text style={{ color: theme.onSurfaceTertiary, marginTop: 4, fontSize: 12 }}>Tap a dish to add it</Text>
            </View>
          ) : (
            cart.map(l => (
              <View key={l.id} style={[styles.cartLine, { backgroundColor: theme.surfaceTertiary, borderColor: theme.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.onSurface, fontSize: 14, fontWeight: "700" }} numberOfLines={1}>{l.name}</Text>
                  <Text style={{ color: theme.onSurfaceSecondary, fontSize: 12, marginTop: 2 }}>₹{l.price} × {l.qty} = {rupees(l.price * l.qty)}</Text>
                </View>
                <Counter d={l} small />
              </View>
            ))
          )}
        </ScrollView>

        <View style={{ padding: spacing.lg, borderTopWidth: 1, borderTopColor: theme.border, gap: 6 }}>
          <View style={styles.sumRow}><Text style={[styles.sumLbl, { color: theme.onSurfaceSecondary }]}>Subtotal</Text><Text style={[styles.sumVal, { color: theme.onSurface }]}>{rupees(t.subtotal)}</Text></View>
          <View style={styles.sumRow}><Text style={[styles.sumLbl, { color: theme.onSurfaceSecondary }]}>{gstOn ? `GST (${pct(gstRate)})` : "GST (off in Settings)"}</Text><Text style={[styles.sumVal, { color: theme.onSurface }]}>₹{t.gst.toFixed(2)}</Text></View>
          <View style={[styles.sumRow, { marginTop: 4 }]}><Text style={{ color: theme.onSurface, fontSize: 17, fontWeight: "900" }}>Total</Text><Text style={{ color: BRAND, fontSize: 22, fontWeight: "900" }}>{money(t.total)}</Text></View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
            {(["Cash", "UPI", "Card"] as const).map(m => (
              <Pressable key={m} onPress={() => setMode(m)} style={[styles.modeChip, { borderColor: mode === m ? BRAND : theme.border, backgroundColor: mode === m ? tint : "transparent" }]}>
                <Ionicons name={m === "Cash" ? "cash-outline" : m === "UPI" ? "qr-code-outline" : "card-outline"} size={14} color={mode === m ? BRAND : theme.onSurfaceSecondary} />
                <Text style={{ fontSize: 12, fontWeight: "800", color: mode === m ? BRAND : theme.onSurfaceSecondary }}>{m}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            <Pressable
              onPress={sendKot}
              disabled={cart.length === 0 || kotSent}
              style={({ pressed }) => [styles.kotBtn, { borderColor: BRAND, opacity: cart.length === 0 ? 0.45 : 1 }, pressed && { opacity: 0.8 }]}
              testID="demo-send-kot"
            >
              <Ionicons name={kotSent ? "checkmark-circle" : "flame-outline"} size={16} color={BRAND} />
              <Text style={{ color: BRAND, fontWeight: "800", fontSize: 13 }}>{kotSent ? "Sent" : "Send to Kitchen"}</Text>
            </Pressable>
            <Pressable
              onPress={billFromPos}
              disabled={allLines.length === 0}
              style={({ pressed }) => [styles.payBtn, { opacity: allLines.length === 0 ? 0.45 : 1 }, pressed && { opacity: 0.85 }]}
              testID="demo-make-bill"
            >
              <Ionicons name="receipt" size={16} color="#FFFFFF" />
              <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 14 }}>Make Bill</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  };

  const dishCols = isDesktop ? (isLargeDesktop ? 2 : 1) : width >= 560 ? 2 : 1;
  const menuList = (
    <View style={{ flexDirection: "row", flexWrap: "wrap", paddingHorizontal: pad - 6, paddingBottom: isDesktop ? 40 : 120 }}>
      {filtered.map(d => {
        const q = qtyOf(d.id);
        return (
          <View key={d.id} style={{ width: `${100 / dishCols}%`, padding: 6 }}>
            <Pressable
              onPress={() => changeQty(d, 1)}
              style={({ pressed }) => [styles.itemCard, card, q > 0 && { borderColor: BRAND }, pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] }]}
              testID={`demo-dish-${d.id}`}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, flex: 1, minWidth: 0 }}>
                <Image source={{ uri: foodImageUrl(d.name) }} style={styles.thumb} contentFit="cover" transition={200} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View style={[styles.vegMark, { backgroundColor: vegMarkColor({ name: d.name }) }]} />
                    <Text style={{ color: theme.onSurface, fontSize: 15, fontWeight: "700", flex: 1 }} numberOfLines={2}>{d.name}</Text>
                  </View>
                  <Text style={{ color: theme.onSurfaceSecondary, fontSize: 13, marginTop: 2, fontWeight: "500" }}>₹{d.price} · GST {gstOn ? pct(gstRate) : "0%"}</Text>
                </View>
              </View>
              {q > 0 ? <Counter d={d} /> : (
                <View style={styles.addCircle}><Ionicons name="add" size={22} color="#FFFFFF" /></View>
              )}
            </Pressable>
          </View>
        );
      })}
    </View>
  );

  const pos = (
    <View style={{ flex: 1, flexDirection: "row" }}>
      <View style={{ flex: 1, borderRightWidth: isDesktop ? 1 : 0, borderRightColor: theme.border }}>
        <ScrollView stickyHeaderIndices={[1]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Header
            title={target ? `Table ${target}` : "Takeaway"}
            sub={target ? "Dine-in order. Send to kitchen, then make the bill." : "Walk-in / pickup orders. Tap dishes to add them."}
            right={target ? (
              <Pressable onPress={() => { setTarget(null); setCart([]); }} style={[styles.outlineBtn, { borderColor: theme.border, backgroundColor: theme.surfaceSecondary }]}>
                <Ionicons name="close" size={15} color={theme.onSurfaceSecondary} />
                <Text style={{ color: theme.onSurfaceSecondary, fontWeight: "700", fontSize: 12 }}>Takeaway</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => setTab("tables")} style={[styles.outlineBtn, { borderColor: theme.border, backgroundColor: theme.surfaceSecondary }]}>
                <Ionicons name="grid-outline" size={15} color={BRAND} />
                <Text style={{ color: BRAND, fontWeight: "800", fontSize: 12 }}>Tables</Text>
              </Pressable>
            )}
          />
          <View style={{ backgroundColor: theme.surface, paddingBottom: 4 }}>
            <View style={[styles.searchRow, card, { marginHorizontal: pad }]}>
              <Ionicons name="search" size={18} color={theme.onSurfaceTertiary} />
              <TextInput value={search} onChangeText={setSearch} placeholder="Search dishes..." placeholderTextColor={theme.onSurfaceTertiary} style={[styles.search, { color: theme.onSurface }]} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: pad, gap: 10, paddingVertical: spacing.md }}>
              {["All", ...CATS].map(c => (
                <Pressable key={c} onPress={() => setCat(c)} style={[styles.chip, card, cat === c && { backgroundColor: BRAND, borderColor: BRAND }]}>
                  <Text style={{ fontSize: 14, fontWeight: cat === c ? "700" : "600", color: cat === c ? "#FFFFFF" : theme.onSurfaceSecondary }}>{c}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          {menuList}
        </ScrollView>

        {!isDesktop && (cart.length > 0 || tableLines.length > 0) && (
          <Pressable onPress={() => setShowCart(true)} style={({ pressed }) => [styles.cartBar, pressed && { opacity: 0.92 }]} testID="demo-cart-bar">
            <View style={styles.cartBadge}><Text style={{ color: BRAND, fontWeight: "900", fontSize: 13 }}>{cartCount}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 16 }}>{money(totals(target ? mergeLines(tableLines, cart) : cart).total)}</Text>
              <Text style={{ color: "#E0E7FF", fontSize: 11, fontWeight: "600" }}>{gstOn ? "incl. GST" : "no GST"} · {target || "Takeaway"}</Text>
            </View>
            <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 14 }}>View Order</Text>
            <Ionicons name="chevron-up" size={18} color="#FFFFFF" />
          </Pressable>
        )}
      </View>
      {isDesktop && <View style={{ width: isLargeDesktop ? 380 : 340, backgroundColor: theme.surfaceSecondary }}>{cartPanel(false)}</View>}
    </View>
  );

  const kitchenCols = isLargeDesktop ? 3 : isDesktop ? 2 : 1;
  const kitchen = (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <Header
        title="Kitchen"
        sub="Orders from tables and the counter land here instantly."
        right={
          <View style={[styles.outlineBtn, { borderColor: theme.border, backgroundColor: theme.surfaceSecondary }]}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#10B981" }} />
            <Text style={{ color: theme.onSurface, fontWeight: "800", fontSize: 12 }}>{tickets.length} active</Text>
          </View>
        }
      />
      {tickets.length === 0 ? (
        <View style={{ alignItems: "center", paddingVertical: 60, paddingHorizontal: pad }}>
          <Ionicons name="checkmark-done-circle" size={60} color="#10B981" />
          <Text style={{ color: theme.onSurface, fontSize: 18, fontWeight: "900", marginTop: 12 }}>All orders served</Text>
          <Text style={{ color: theme.onSurfaceSecondary, fontSize: 13, marginTop: 4, textAlign: "center" }}>Take a new order and press "Send to Kitchen" to see it here.</Text>
          <Pressable onPress={() => setTab("pos")} style={[styles.payBtn, { flex: 0, paddingHorizontal: 20, marginTop: 16 }]}>
            <Ionicons name="add-circle" size={18} color="#FFFFFF" />
            <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 14 }}>New Order</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", paddingHorizontal: pad - 6 }}>
          {tickets.map(k => {
            const mins = Math.max(0, Math.floor((now - k.at) / 60000));
            return (
              <View key={k.id} style={{ width: `${100 / kitchenCols}%`, padding: 6 }}>
                <View style={[styles.ticket, card]}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={{ color: theme.onSurface, fontSize: 20, fontWeight: "900" }}>#{k.num}</Text>
                      <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: STATUS_BG[k.status] }}>
                        <Text style={{ fontSize: 11, fontWeight: "900", color: STATUS_FG[k.status], letterSpacing: 0.5 }}>{STATUS_TEXT[k.status]}</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Pressable onPress={() => lock("Print kitchen slips (KOT)", "Connect your kitchen printer and every order prints by itself. Subscribe to turn it on.", "print-outline")} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: isDark ? "#2A2A38" : "#EEF2FF", flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Ionicons name="print-outline" size={14} color={BRAND} />
                        <Text style={{ fontSize: 11, fontWeight: "700", color: BRAND }}>KOT</Text>
                      </Pressable>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                        <Ionicons name="time-outline" size={15} color={theme.onSurfaceSecondary} />
                        <Text style={{ color: theme.onSurfaceSecondary, fontSize: 12, fontWeight: "700" }}>{mins < 1 ? "now" : `${mins}m`}</Text>
                      </View>
                    </View>
                  </View>
                  <Text style={{ color: theme.onSurface, fontSize: 16, fontWeight: "800", marginTop: 8 }}>{k.table === "Takeaway" ? "Takeaway" : `Table ${k.table}`}</Text>
                  <View style={{ marginTop: 8, gap: 4 }}>
                    {k.items.map((it, i) => (
                      <View key={i} style={{ flexDirection: "row", gap: 8 }}>
                        <Text style={{ color: BRAND, fontWeight: "900", fontSize: 15, minWidth: 26 }}>{it.qty}×</Text>
                        <Text style={{ color: theme.onSurface, fontSize: 15, fontWeight: "600", flex: 1 }}>{it.name}</Text>
                      </View>
                    ))}
                  </View>
                  {k.note ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, padding: 8, borderRadius: 10, borderWidth: 1, backgroundColor: isDark ? "#2B2212" : "#FFFBEB", borderColor: isDark ? "#78350F" : "#FDE68A" }}>
                      <Ionicons name="document-text-outline" size={15} color={isDark ? "#FBBF24" : "#D97706"} />
                      <Text style={{ color: isDark ? "#FBBF24" : "#D97706", fontSize: 13, fontWeight: "700" }}>Instructions: {k.note}</Text>
                    </View>
                  ) : null}
                  <Pressable onPress={() => advanceTicket(k)} style={({ pressed }) => [styles.ticketBtn, { backgroundColor: NEXT_BG[k.status] }, pressed && { opacity: 0.85 }]}>
                    <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 14 }}>{NEXT_LABEL[k.status]}</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );

  const priceCard = (
    <View style={[styles.panel, { borderColor: BRAND, backgroundColor: tint }]}>
      <Text style={{ color: BRAND, fontSize: 12, fontWeight: "900", letterSpacing: 0.8 }}>STARTER PLAN</Text>
      <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: 4 }}>
        <Text style={{ color: theme.onSurface, fontSize: 34, fontWeight: "900" }}>₹{PRICE}</Text>
        <Text style={{ color: theme.onSurfaceSecondary, fontSize: 14, fontWeight: "700" }}> / month</Text>
      </View>
      <Text style={{ color: theme.onSurfaceSecondary, fontSize: 13, fontWeight: "600" }}>That's less than ₹10 a day.</Text>
      <View style={{ marginTop: 12, gap: 8 }}>
        {BENEFITS.map(b => (
          <View key={b} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="checkmark-circle" size={18} color="#10B981" />
            <Text style={{ color: theme.onSurface, fontSize: 14, fontWeight: "600", flex: 1 }}>{b}</Text>
          </View>
        ))}
      </View>
      <Pressable onPress={goSubscribe} style={({ pressed }) => [styles.bigCta, pressed && { opacity: 0.88 }]}>
        <Text style={styles.bigCtaText}>{subscribed ? "Open my EzBill" : user ? "Subscribe Now" : "Get Started"}</Text>
        <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
      </Pressable>
      <Pressable onPress={() => router.push("/pricing")} style={{ alignSelf: "center", marginTop: 10, padding: 4 }}>
        <Text style={{ color: BRAND, fontWeight: "800", fontSize: 13 }}>See all plans</Text>
      </Pressable>
    </View>
  );

  const more = (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <Header title="More" sub={`${shopName} · Demo`} />
      <View style={{ paddingHorizontal: pad, gap: spacing.lg }}>
        {!subscribed && priceCard}
        <View style={[styles.panel, card, { paddingVertical: 4 }]}>
          {LOCKED.map((f, i) => (
            <Pressable key={f.key} onPress={() => openLocked(f.key)} style={({ pressed }) => [styles.moreRow, { borderTopColor: theme.border, borderTopWidth: i ? 1 : 0 }, pressed && { opacity: 0.7 }]}>
              <View style={[styles.statIcon, { backgroundColor: tint }]}><Ionicons name={f.icon} size={18} color={BRAND} /></View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.onSurface, fontSize: 15, fontWeight: "700" }}>{f.name}</Text>
                <Text style={{ color: theme.onSurfaceSecondary, fontSize: 12, marginTop: 1 }} numberOfLines={1}>{f.why}</Text>
              </View>
              <Ionicons name="lock-closed" size={15} color={theme.onSurfaceTertiary} />
            </Pressable>
          ))}
        </View>
        <View style={[styles.panel, card, { paddingVertical: 4 }]}>
          <Pressable onPress={toggleTheme} style={styles.moreRow}>
            <View style={[styles.statIcon, { backgroundColor: theme.surfaceTertiary }]}><Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={18} color={theme.onSurfaceSecondary} /></View>
            <Text style={{ flex: 1, color: theme.onSurface, fontSize: 15, fontWeight: "700" }}>{isDark ? "Light Mode" : "Dark Mode"}</Text>
          </Pressable>
          <Pressable onPress={leave} style={[styles.moreRow, { borderTopColor: theme.border, borderTopWidth: 1 }]}>
            <View style={[styles.statIcon, { backgroundColor: "rgba(239,68,68,0.12)" }]}><Ionicons name={user ? "log-out-outline" : "arrow-back"} size={18} color="#EF4444" /></View>
            <Text style={{ flex: 1, color: "#EF4444", fontSize: 15, fontWeight: "700" }}>{user ? "Log Out" : "Back to website"}</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );

  const screen = tab === "dashboard" ? dashboard : tab === "tables" ? tablesScreen : tab === "pos" ? pos : tab === "kitchen" ? kitchen : more;

  // ---------- desktop sidebar (same look as the real app) ----------
  const navItem = (key: string, name: string, icon: IconName, active: boolean, onPress: () => void, locked?: boolean, badge?: number) => (
    <Pressable
      key={key}
      onPress={onPress}
      style={({ hovered }: any) => [
        styles.navItem,
        {
          backgroundColor: active ? (isDark ? "rgba(99, 91, 255, 0.16)" : "rgba(99, 91, 255, 0.10)") : hovered ? (isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)") : "transparent",
          borderColor: active ? BRAND : "transparent",
        },
      ]}
    >
      <Ionicons name={icon} size={18} color={active ? BRAND : theme.onSurfaceSecondary} style={{ marginRight: 10 }} />
      <Text style={{ flex: 1, fontSize: 13, color: active ? (isDark ? "#FFFFFF" : BRAND) : theme.onSurface, fontWeight: active ? "700" : "500" }} numberOfLines={1}>{name}</Text>
      {badge ? <View style={styles.navBadge}><Text style={{ color: "#FFFFFF", fontSize: 10, fontWeight: "800" }}>{badge}</Text></View> : null}
      {locked && <Ionicons name="lock-closed" size={12} color={theme.onSurfaceTertiary} />}
    </Pressable>
  );

  const groupTitle = (t: string) => <Text style={[styles.navGroupTitle, { color: theme.onSurfaceTertiary }]}>{t}</Text>;

  const sidebar = (
    <View style={[styles.sidebar, { backgroundColor: isDark ? "#121216" : "#FFFFFF", borderRightColor: theme.border }]}>
      <View style={{ padding: spacing.md, borderBottomWidth: 1, borderBottomColor: theme.border }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.sm }}>
          <View style={styles.logoBadge}><Ionicons name="restaurant" size={18} color="#FFFFFF" /></View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: "900", letterSpacing: -0.3, color: theme.onSurface }}>EzBill ERP</Text>
            <Text style={{ fontSize: 11, fontWeight: "500", color: theme.onSurfaceSecondary }}>Demo Mode</Text>
          </View>
        </View>
        <View style={[styles.userBadge, { backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", borderColor: theme.border }]}>
          <View style={styles.avatar}><Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 12 }}>{shopName.charAt(0).toUpperCase()}</Text></View>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: "700", color: theme.onSurface }} numberOfLines={1}>{shopName}</Text>
            <Text style={{ fontSize: 10, fontWeight: "600", color: BRAND }}>Restaurant Owner</Text>
          </View>
        </View>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.sm }} showsVerticalScrollIndicator={false}>
        <View style={{ marginBottom: spacing.md }}>
          {groupTitle("OPERATIONS")}
          {navItem("dashboard", "Dashboard", tab === "dashboard" ? "grid" : "grid-outline", tab === "dashboard", () => setTab("dashboard"))}
          {navItem("tables", "Tables / POS", tab === "tables" ? "tablet-portrait" : "tablet-portrait-outline", tab === "tables", () => setTab("tables"))}
          {navItem("pos", "Takeaway", tab === "pos" ? "bag-handle" : "bag-handle-outline", tab === "pos", () => setTab("pos"))}
          {navItem("kitchen", "Kitchen KDS", tab === "kitchen" ? "restaurant" : "restaurant-outline", tab === "kitchen", () => setTab("kitchen"), false, tickets.length)}
          {LOCKED.filter(l => l.group === "ops").map(l => navItem(l.key, l.name, l.icon, false, () => openLocked(l.key), true))}
        </View>
        <View style={{ marginBottom: spacing.md }}>
          {groupTitle("CATALOG & REPORTS")}
          {LOCKED.filter(l => l.group === "catalog").map(l => navItem(l.key, l.name, l.icon, false, () => openLocked(l.key), true))}
        </View>
        <View style={{ marginBottom: spacing.md }}>
          {groupTitle("SYSTEM & TOOLS")}
          {navItem("subscription", "Subscription", "card-outline", false, goSubscribe)}
          {LOCKED.filter(l => l.group === "system").map(l => navItem(l.key, l.name, l.icon, false, () => openLocked(l.key), true))}
        </View>
      </ScrollView>
      {!subscribed && (
        <Pressable onPress={goSubscribe} style={({ pressed }) => [styles.sideCta, pressed && { opacity: 0.9 }]}>
          <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 13 }}>Unlock everything</Text>
          <Text style={{ color: "#E0E7FF", fontSize: 11, fontWeight: "600", marginTop: 2 }}>From ₹{PRICE}/month</Text>
        </Pressable>
      )}
      <View style={{ padding: spacing.sm, borderTopWidth: 1, borderTopColor: theme.border, backgroundColor: isDark ? "#0E0E12" : "#F8FAFC", gap: 2 }}>
        <Pressable onPress={toggleTheme} style={styles.footerBtn}>
          <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={18} color={theme.onSurfaceSecondary} />
          <Text style={{ fontSize: 12, marginLeft: 10, color: theme.onSurfaceSecondary }}>{isDark ? "Light Mode" : "Dark Mode"}</Text>
        </Pressable>
        <Pressable onPress={leave} style={styles.footerBtn}>
          <Ionicons name={user ? "log-out-outline" : "arrow-back"} size={18} color="#EF4444" />
          <Text style={{ fontSize: 12, marginLeft: 10, color: "#EF4444", fontWeight: "600" }}>{user ? "Log Out" : "Back to website"}</Text>
        </Pressable>
      </View>
    </View>
  );

  // ---------- phone bottom tabs (same look as the real app) ----------
  const bottomInset = Math.max(insets.bottom, Platform.OS === "android" ? 14 : 10);
  const tabs: { key: Tab; title: string; icon: IconName }[] = [
    { key: "dashboard", title: "Dashboard", icon: "grid-outline" },
    { key: "tables", title: "Tables", icon: "tablet-portrait-outline" },
    { key: "pos", title: "Takeaway", icon: "bag-handle-outline" },
    { key: "kitchen", title: "Kitchen", icon: "restaurant-outline" },
    { key: "more", title: "More", icon: "ellipsis-horizontal-circle-outline" },
  ];
  const tabBar = (
    <View style={[styles.tabBar, { backgroundColor: theme.tabBarBg, borderTopColor: theme.border, height: 60 + bottomInset, paddingBottom: bottomInset }]}>
      {tabs.map(t => {
        const active = tab === t.key;
        const color = active ? BRAND : theme.onSurfaceTertiary;
        return (
          <Pressable key={t.key} onPress={() => { tap(); setTab(t.key); }} style={styles.tabItem} testID={`demo-tab-${t.key}`}>
            <View>
              <Ionicons name={t.icon} size={22} color={color} />
              {t.key === "kitchen" && tickets.length > 0 && <View style={styles.tabDot} />}
            </View>
            <Text style={{ fontSize: 11, letterSpacing: 0.4, fontWeight: "600", color, marginTop: 2 }}>{t.title}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  // ---------- modals ----------
  const welcome = (
    <Modal visible={showWelcome} transparent animationType="fade" onRequestClose={() => setShowWelcome(false)}>
      <View style={styles.overlay}>
        <View style={[styles.modalCard, card, { maxWidth: 600, padding: 0, overflow: "hidden" }]}>
          <ScrollView contentContainerStyle={{ padding: isDesktop ? 28 : 20 }} showsVerticalScrollIndicator={false}>
            <View style={styles.demoTagLarge}>
              <Ionicons name="sparkles" size={13} color={BRAND} />
              <Text style={{ color: BRAND, fontWeight: "900", fontSize: 11, letterSpacing: 0.8 }}>{registered ? "YOUR ACCOUNT IS READY" : "LIVE DEMO · NO SIGN-UP NEEDED"}</Text>
            </View>
            <Text style={{ color: theme.onSurface, fontSize: isDesktop ? 28 : 23, fontWeight: "900", marginTop: 12, lineHeight: isDesktop ? 34 : 29 }}>
              {registered && restaurantName ? `Welcome, ${restaurantName}!` : "Run your whole restaurant from one app"}
            </Text>
            <Text style={{ color: theme.onSurfaceSecondary, fontSize: 14, marginTop: 6, lineHeight: 21 }}>
              Billing, tables, kitchen orders and daily sales, all in one place. This is the real EzBill app with sample dishes, so try it freely. Nothing here is saved.
            </Text>

            <View style={{ marginTop: 18, gap: 10 }}>
              {PROBLEMS.map(p => (
                <View key={p.problem} style={[styles.problemCard, { borderColor: theme.border, backgroundColor: theme.surfaceTertiary }]}>
                  <View style={[styles.statIcon, { backgroundColor: p.color + "22" }]}>
                    <Ionicons name={p.icon} size={18} color={p.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.onSurfaceSecondary, fontSize: 12, fontWeight: "700" }}>Problem: {p.problem}</Text>
                    <Text style={{ color: theme.onSurface, fontSize: 14, fontWeight: "700", marginTop: 3, lineHeight: 20 }}>{p.fix}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={[styles.tryBox, { borderColor: theme.border }]}>
              <Text style={{ color: theme.onSurface, fontWeight: "900", fontSize: 14 }}>Try it in 30 seconds</Text>
              <Text style={{ color: theme.onSurfaceSecondary, fontSize: 13, marginTop: 4, lineHeight: 20 }}>
                1. Tap a few dishes   2. Press "Send to Kitchen"   3. Press "Make Bill"
              </Text>
            </View>

            <Pressable onPress={() => { setShowWelcome(false); setTab("pos"); }} style={({ pressed }) => [styles.bigCta, pressed && { opacity: 0.88 }]} testID="demo-start">
              <Text style={styles.bigCtaText}>Try the app now</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
            </Pressable>
            {!subscribed && (
              <Pressable onPress={goSubscribe} style={{ alignSelf: "center", marginTop: 12, padding: 4 }}>
                <Text style={{ color: theme.onSurfaceSecondary, fontWeight: "700", fontSize: 13 }}>
                  Already sure? <Text style={{ color: BRAND, fontWeight: "900" }}>Subscribe from ₹{PRICE}/month</Text>
                </Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  const paywall = (
    <Modal visible={!!wall} transparent animationType="fade" onRequestClose={() => setWall(null)}>
      <View style={styles.overlay}>
        <View style={[styles.modalCard, card, { maxWidth: 440, padding: 0, overflow: "hidden" }]}>
          <ScrollView contentContainerStyle={{ padding: 24 }} showsVerticalScrollIndicator={false}>
            <Pressable onPress={() => setWall(null)} hitSlop={10} style={[styles.closeBtn, { backgroundColor: theme.surfaceTertiary }]} accessibilityLabel="Close">
              <Ionicons name="close" size={18} color={theme.onSurface} />
            </Pressable>
            <View style={[styles.wallIcon, { backgroundColor: tint }]}>
              <Ionicons name={wall?.icon || "lock-closed"} size={30} color={BRAND} />
            </View>
            <Text style={{ color: theme.onSurface, fontSize: 21, fontWeight: "900", textAlign: "center", marginTop: 14 }}>{wall?.title}</Text>
            <Text style={{ color: theme.onSurfaceSecondary, fontSize: 14, textAlign: "center", marginTop: 6, lineHeight: 21 }}>{wall?.sub}</Text>
            <View style={{ marginTop: 18, gap: 8 }}>
              {BENEFITS.map(b => (
                <View key={b} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                  <Text style={{ color: theme.onSurface, fontSize: 14, fontWeight: "600", flex: 1 }}>{b}</Text>
                </View>
              ))}
            </View>
            <View style={[styles.priceStrip, { borderColor: theme.border, backgroundColor: theme.surfaceTertiary }]}>
              <Text style={{ color: theme.onSurfaceSecondary, fontSize: 13, fontWeight: "700" }}>Starter plan</Text>
              <Text style={{ color: theme.onSurface, fontSize: 15, fontWeight: "900" }}>₹{PRICE}/month <Text style={{ color: theme.onSurfaceSecondary, fontSize: 12, fontWeight: "600" }}>· under ₹10 a day</Text></Text>
            </View>
            <Pressable onPress={goSubscribe} style={({ pressed }) => [styles.bigCta, pressed && { opacity: 0.88 }]} testID="demo-paywall-subscribe">
              <Text style={styles.bigCtaText}>{subscribed ? "Open my EzBill" : user ? "Subscribe Now" : "Get Started"}</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
            </Pressable>
            <View style={{ flexDirection: "row", justifyContent: "center", gap: 20, marginTop: 12 }}>
              <Pressable onPress={() => { setWall(null); router.push("/pricing"); }} hitSlop={6}>
                <Text style={{ color: BRAND, fontWeight: "800", fontSize: 13 }}>See all plans</Text>
              </Pressable>
              <Pressable onPress={() => setWall(null)} hitSlop={6}>
                <Text style={{ color: theme.onSurfaceSecondary, fontWeight: "700", fontSize: 13 }}>Keep exploring</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  const receiptModal = (
    <Modal visible={!!receipt} transparent animationType="fade" onRequestClose={closeReceipt}>
      <View style={styles.overlay}>
        <View style={{ width: "100%", maxWidth: 360 }}>
          {receipt?.secs ? (
            <View style={styles.speedPill}>
              <Ionicons name="flash" size={14} color="#FFFFFF" />
              <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 13 }}>Bill ready in {receipt.secs} seconds</Text>
            </View>
          ) : null}
          <View style={styles.paper}>
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ padding: 20 }}>
              <Text style={styles.paperWatermark}>SAMPLE BILL</Text>
              <Text style={styles.paperShop}>{shopName}</Text>
              {gstin ? <Text style={[styles.paperSmall, { textAlign: "center" }]}>GSTIN: {gstin}</Text> : null}
              <View style={styles.dash} />
              <View style={styles.paperRow}><Text style={styles.paperSmall}>Bill #{receipt?.no}</Text><Text style={styles.paperSmall}>{receipt?.table === "Takeaway" ? "Takeaway" : `Table ${receipt?.table}`}</Text></View>
              <Text style={styles.paperSmall}>{new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</Text>
              <View style={styles.dash} />
              {receipt?.lines.map(l => (
                <View key={l.id} style={styles.paperRow}>
                  <Text style={[styles.paperText, { flex: 1 }]} numberOfLines={1}>{l.qty} × {l.name}</Text>
                  <Text style={styles.paperText}>{(l.price * l.qty).toFixed(2)}</Text>
                </View>
              ))}
              <View style={styles.dash} />
              <View style={styles.paperRow}><Text style={styles.paperText}>Subtotal</Text><Text style={styles.paperText}>{receipt?.subtotal.toFixed(2)}</Text></View>
              {gstOn ? (
                <>
                  <View style={styles.paperRow}><Text style={styles.paperText}>CGST @ {pct(gstRate / 2)}</Text><Text style={styles.paperText}>{(receipt?.cgst || 0).toFixed(2)}</Text></View>
                  <View style={styles.paperRow}><Text style={styles.paperText}>SGST @ {pct(gstRate / 2)}</Text><Text style={styles.paperText}>{(receipt?.sgst || 0).toFixed(2)}</Text></View>
                </>
              ) : null}
              <View style={styles.dash} />
              <View style={styles.paperRow}><Text style={styles.paperTotal}>TOTAL</Text><Text style={styles.paperTotal}>₹{(receipt?.total || 0).toFixed(2)}</Text></View>
              <Text style={[styles.paperSmall, { marginTop: 4 }]}>Paid by {receipt?.mode}</Text>
              <View style={{ alignItems: "center", marginTop: 14 }}>
                <Ionicons name="qr-code" size={64} color="#111827" />
                <Text style={styles.paperSmall}>Scan to pay with any UPI app</Text>
              </View>
              <Text style={[styles.paperSmall, { textAlign: "center", marginTop: 10 }]}>Thank you! Visit again.</Text>
            </ScrollView>
          </View>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
            <Pressable onPress={() => { setReceipt(null); lock("Print real bills", "Connect any thermal printer and your bills print in one tap, with your UPI QR on them. Subscribe to turn it on.", "print-outline"); }} style={({ pressed }) => [styles.receiptBtn, { backgroundColor: "#FFFFFF" }, pressed && { opacity: 0.85 }]}>
              <Ionicons name="print-outline" size={16} color={BRAND} />
              <Text style={{ color: BRAND, fontWeight: "900", fontSize: 14 }}>Print</Text>
            </Pressable>
            <Pressable onPress={closeReceipt} style={({ pressed }) => [styles.receiptBtn, { backgroundColor: BRAND }, pressed && { opacity: 0.85 }]} testID="demo-receipt-done">
              <Ionicons name="checkmark" size={16} color="#FFFFFF" />
              <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 14 }}>Done</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );

  const tableSheet = (
    <Modal visible={!!openTable} transparent animationType="fade" onRequestClose={() => setOpenTable(null)}>
      <View style={styles.overlay}>
        <View style={[styles.modalCard, card, { maxWidth: 420 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View>
              <Text style={{ color: theme.onSurface, fontSize: 22, fontWeight: "900" }}>Table {openTable?.label}</Text>
              <Text style={{ color: openTable?.status === "Billed" ? "#EF4444" : "#D97706", fontSize: 13, fontWeight: "800", marginTop: 2 }}>
                {openTable?.status === "Billed" ? "Bill printed · waiting for payment" : "Eating now"}
              </Text>
            </View>
            <Pressable onPress={() => setOpenTable(null)} hitSlop={10} style={[styles.closeBtn, { position: "relative", top: 0, right: 0, backgroundColor: theme.surfaceTertiary }]}>
              <Ionicons name="close" size={18} color={theme.onSurface} />
            </Pressable>
          </View>
          <View style={[styles.cartLine, { backgroundColor: theme.surfaceTertiary, borderColor: theme.border, flexDirection: "column", alignItems: "stretch", marginTop: 14 }]}>
            {openTable?.lines.map(l => (
              <View key={l.id} style={styles.sumRow}>
                <Text style={{ color: theme.onSurface, fontSize: 14, fontWeight: "600" }}>{l.qty}× {l.name}</Text>
                <Text style={{ color: theme.onSurfaceSecondary, fontSize: 14, fontWeight: "700" }}>{rupees(l.price * l.qty)}</Text>
              </View>
            ))}
            <View style={[styles.sumRow, { marginTop: 8 }]}>
              <Text style={{ color: theme.onSurface, fontSize: 15, fontWeight: "900" }}>{gstOn ? "Total (incl. GST)" : "Total"}</Text>
              <Text style={{ color: BRAND, fontSize: 18, fontWeight: "900" }}>{money(totals(openTable?.lines || []).total)}</Text>
            </View>
          </View>
          {openTable?.status === "Billed" ? (
            <Pressable
              onPress={() => {
                const t = openTable!;
                setOpenTable(null);
                startedAt.current = null;
                makeBill(t.lines, t.label);
                setTables(prev => prev.map(x => (x.id === t.id ? { ...x, status: "Available", lines: [] } : x)));
              }}
              style={({ pressed }) => [styles.bigCta, { backgroundColor: "#10B981" }, pressed && { opacity: 0.88 }]}
            >
              <Ionicons name="checkmark-done" size={18} color="#FFFFFF" />
              <Text style={styles.bigCtaText}>Mark as Paid</Text>
            </Pressable>
          ) : (
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <Pressable
                onPress={() => { const t = openTable!; setOpenTable(null); setTarget(t.label); setCart([]); setKotSent(false); setTab("pos"); }}
                style={({ pressed }) => [styles.kotBtn, { borderColor: BRAND, paddingVertical: 14 }, pressed && { opacity: 0.8 }]}
              >
                <Ionicons name="add" size={16} color={BRAND} />
                <Text style={{ color: BRAND, fontWeight: "800", fontSize: 14 }}>Add Items</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const t = openTable!;
                  setOpenTable(null);
                  startedAt.current = null;
                  makeBill(t.lines, t.label);
                  setTables(prev => prev.map(x => (x.id === t.id ? { ...x, status: "Available", lines: [] } : x)));
                }}
                style={({ pressed }) => [styles.payBtn, { paddingVertical: 14 }, pressed && { opacity: 0.85 }]}
              >
                <Ionicons name="receipt" size={16} color="#FFFFFF" />
                <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 14 }}>Make Bill</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );

  const cartSheet = (
    <Modal visible={showCart && !isDesktop} transparent animationType="slide" onRequestClose={() => setShowCart(false)}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }}>
        <Pressable style={{ flex: 1 }} onPress={() => setShowCart(false)} />
        <View style={{ height: "78%", backgroundColor: theme.surfaceSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: insets.bottom }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: theme.border }}>
            <View>
              <Text style={{ fontSize: 18, fontWeight: "900", color: theme.onSurface }}>{target ? `${target} Order` : "Takeaway Order"}</Text>
              <Text style={{ fontSize: 12, color: theme.onSurfaceSecondary, marginTop: 2 }}>{cartCount} new item{cartCount === 1 ? "" : "s"}</Text>
            </View>
            <Pressable onPress={() => setShowCart(false)} hitSlop={10} style={[styles.closeBtn, { position: "relative", top: 0, right: 0, backgroundColor: theme.surfaceTertiary }]}>
              <Ionicons name="close" size={18} color={theme.onSurface} />
            </Pressable>
          </View>
          {cartPanel(true)}
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.surface }} testID="demo-screen">
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={isDark ? "#14132B" : "#F5F3FF"} />
      {isDesktop ? (
        <View style={{ flex: 1, flexDirection: "row" }}>
          {sidebar}
          <View style={{ flex: 1, overflow: "hidden" }}>
            {banner}
            <View style={{ flex: 1 }}>{screen}</View>
          </View>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {banner}
          <View style={{ flex: 1 }}>{screen}</View>
          {tabBar}
        </View>
      )}

      {toast && (
        <View pointerEvents="none" style={[styles.toast, { bottom: isDesktop ? 28 : 60 + bottomInset + (tab === "pos" && (cart.length > 0 || tableLines.length > 0) ? 84 : 16) }]}>
          <Ionicons name="checkmark-circle" size={18} color="#34D399" />
          <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 13, flexShrink: 1 }}>{toast}</Text>
        </View>
      )}

      {welcome}
      {paywall}
      {receiptModal}
      {tableSheet}
      {cartSheet}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: spacing.lg, paddingBottom: spacing.md },
  title: { fontSize: 26, fontWeight: "900" },
  sub: { fontSize: 13, marginTop: 2, fontWeight: "500" },

  banner: { borderBottomWidth: 1, paddingBottom: 10 },
  demoTag: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: BRAND, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill },
  demoTagText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  bannerBtn: { backgroundColor: BRAND, paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, shadowColor: BRAND, shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  bannerBtnText: { color: "#FFFFFF", fontWeight: "900", fontSize: 13 },
  stepChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1 },

  heroCard: { padding: 22, borderRadius: 24, shadowColor: BRAND, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 4 },
  heroNum: { color: "#FFFFFF", fontSize: 22, fontWeight: "900" },
  heroLbl: { color: "#E0E7FF", fontSize: 12, fontWeight: "600", marginTop: 2 },
  statRow: { flex: 1, minHeight: 60, flexDirection: "row", alignItems: "center", gap: 12, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1 },
  statIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  panel: { borderRadius: radius.xl, borderWidth: 1, padding: spacing.lg },
  panelTitle: { fontSize: 15, fontWeight: "900" },
  topRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  problemCard: { flexDirection: "row", gap: 12, padding: 12, borderRadius: radius.md, borderWidth: 1, alignItems: "flex-start" },
  realCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: spacing.lg, borderRadius: radius.xl, borderWidth: 1.5, borderStyle: "dashed" },

  tableCard: { borderWidth: 1, borderRadius: 20, padding: 12, minHeight: 132, justifyContent: "space-between", width: "100%" },
  outlineBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1 },

  searchRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: spacing.lg, borderRadius: radius.xl, borderWidth: 1 },
  search: { flex: 1, paddingVertical: 12, fontSize: 15 },
  chip: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1 },
  itemCard: { minHeight: 88, gap: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderRadius: radius.xl, borderWidth: 1 },
  thumb: { width: 52, height: 52, borderRadius: radius.md },
  vegMark: { width: 10, height: 10, borderRadius: 2 },
  addCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: BRAND, alignItems: "center", justifyContent: "center" },
  counterPill: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  counterBtn: { padding: 2 },
  counterText: { color: BRAND, fontWeight: "900", fontSize: 15 },
  cartLine: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radius.lg, borderWidth: 1 },
  sumRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  sumLbl: { fontSize: 13, fontWeight: "600" },
  sumVal: { fontSize: 14, fontWeight: "700" },
  modeChip: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1 },
  kotBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13, borderRadius: radius.lg, borderWidth: 1.5 },
  payBtn: { flex: 1.3, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13, borderRadius: radius.lg, backgroundColor: BRAND },
  cartBar: { position: "absolute", left: 12, right: 12, bottom: 12, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: BRAND, borderRadius: radius.lg, paddingHorizontal: 16, paddingVertical: 12, shadowColor: BRAND, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  cartBadge: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },

  ticket: { borderRadius: radius.xl, borderWidth: 1, padding: spacing.lg },
  ticketBtn: { marginTop: 14, paddingVertical: 13, borderRadius: radius.md, alignItems: "center" },

  moreRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },

  sidebar: { width: 250, height: "100%", borderRightWidth: 1 },
  logoBadge: { width: 32, height: 32, borderRadius: 8, backgroundColor: BRAND, justifyContent: "center", alignItems: "center", marginRight: 10 },
  userBadge: { flexDirection: "row", alignItems: "center", padding: 8, borderRadius: radius.md, borderWidth: 1, marginTop: 4 },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: BRAND, justifyContent: "center", alignItems: "center" },
  navGroupTitle: { fontSize: 10, fontWeight: "800", letterSpacing: 0.8, paddingHorizontal: 12, marginBottom: 6 },
  navItem: { flexDirection: "row", alignItems: "center", paddingVertical: 9, paddingHorizontal: 12, borderRadius: radius.md, marginBottom: 2, borderLeftWidth: 3 },
  navBadge: { backgroundColor: "#EF4444", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, minWidth: 18, alignItems: "center" },
  sideCta: { margin: spacing.sm, padding: 12, borderRadius: radius.md, backgroundColor: BRAND },
  footerBtn: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.md },

  tabBar: { flexDirection: "row", borderTopWidth: 1, paddingTop: 8 },
  tabItem: { flex: 1, alignItems: "center", justifyContent: "flex-start" },
  tabDot: { position: "absolute", top: -1, right: -3, width: 8, height: 8, borderRadius: 4, backgroundColor: "#EF4444" },

  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "center", alignItems: "center", padding: 16 },
  modalCard: { width: "100%", maxHeight: "92%", borderRadius: 24, borderWidth: 1, padding: 20 },
  demoTagLarge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: "rgba(99,91,255,0.14)" },
  tryBox: { marginTop: 16, padding: 14, borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed" },
  bigCta: { marginTop: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: BRAND, paddingVertical: 15, borderRadius: radius.lg, shadowColor: BRAND, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  bigCtaText: { color: "#FFFFFF", fontWeight: "900", fontSize: 16 },
  closeBtn: { position: "absolute", top: 0, right: 0, width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", zIndex: 2 },
  wallIcon: { alignSelf: "center", width: 68, height: 68, borderRadius: 34, alignItems: "center", justifyContent: "center", marginTop: 8 },
  priceStrip: { marginTop: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6, padding: 12, borderRadius: radius.md, borderWidth: 1 },

  speedPill: { alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#10B981", paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill, marginBottom: 12 },
  paper: { backgroundColor: "#FFFFFF", borderRadius: 6, overflow: "hidden" },
  paperWatermark: { position: "absolute", top: 120, left: 0, right: 0, textAlign: "center", fontSize: 38, fontWeight: "900", color: "rgba(99,91,255,0.08)", transform: [{ rotate: "-18deg" }] },
  paperShop: { textAlign: "center", fontSize: 18, fontWeight: "900", color: "#111827" },
  paperSmall: { fontSize: 12, color: "#4B5563", textAlign: "left" },
  paperText: { fontSize: 13, color: "#111827", fontFamily: Platform.OS === "web" ? "monospace" : undefined },
  paperTotal: { fontSize: 17, fontWeight: "900", color: "#111827" },
  paperRow: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginVertical: 2 },
  dash: { borderBottomWidth: 1, borderStyle: "dashed", borderColor: "#9CA3AF", marginVertical: 8 },
  receiptBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, borderRadius: radius.lg },

  toast: { position: "absolute", alignSelf: "center", maxWidth: "92%", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#111827", paddingHorizontal: 16, paddingVertical: 11, borderRadius: radius.pill, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 10, elevation: 6 },
});
