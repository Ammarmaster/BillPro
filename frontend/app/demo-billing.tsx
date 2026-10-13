import { useCallback, useState, useEffect } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView, SafeAreaView, StatusBar, Modal, ActivityIndicator, TextInput, useWindowDimensions, Platform
} from "react-native";
import * as Haptics from "expo-haptics";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/context/ThemeContext";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/lib/api";
import { radius, spacing } from "@/src/theme";
import { LinearGradient } from "expo-linear-gradient";

interface DemoItem {
  id: string;
  name: string;
  price: number;
  category: string;
  description: string;
  isVeg: boolean;
}

const DEFAULT_MENU_ITEMS: DemoItem[] = [
  { id: "demo-1", name: "Chicken Dum Biryani", price: 180, category: "Biryani", description: "Slow cooked fragrant basmati rice with marinated chicken & spices", isVeg: false },
  { id: "demo-2", name: "Paneer Butter Masala", price: 220, category: "Main Course", description: "Fresh cottage cheese in creamy rich tomato gravy", isVeg: true },
  { id: "demo-3", name: "Dal Makhani", price: 160, category: "Main Course", description: "Slow simmered black lentils finished with cream & butter", isVeg: true },
  { id: "demo-4", name: "Tandoori Chicken Full", price: 280, category: "Starters", description: "Clay oven roasted chicken with traditional tandoori spices", isVeg: false },
  { id: "demo-5", name: "Crispy Spring Rolls", price: 120, category: "Starters", description: "Golden rolls stuffed with fresh spiced vegetables", isVeg: true },
  { id: "demo-6", name: "Veg Hyderabadi Biryani", price: 150, category: "Biryani", description: "Aromatic basmati rice cooked with garden fresh vegetables", isVeg: true },
  { id: "demo-7", name: "Butter Naan", price: 40, category: "Breads", description: "Soft clay oven bread brushed with fresh butter", isVeg: true },
  { id: "demo-8", name: "Chilled Thums Up 250ml", price: 40, category: "Beverages", description: "Chilled sparkling beverage", isVeg: true },
  { id: "demo-9", name: "Fresh Mint Lime Soda", price: 60, category: "Beverages", description: "Refreshing soda with squeezed lime and garden mint", isVeg: true },
  { id: "demo-10", name: "Gulab Jamun (2 Pcs)", price: 80, category: "Desserts", description: "Warm milk dumplings soaked in cardamom sugar syrup", isVeg: true }
];

export default function DemoBilling() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { registered } = useLocalSearchParams<{ registered?: string }>();
  const { theme, isDark } = useTheme();
  const { user, logout } = useAuth();
  const { width } = useWindowDimensions();

  // Active restaurant name for personalization
  const [restaurantName, setRestaurantName] = useState<string>(() => api.getCachedRestaurant()?.name || "");

  useEffect(() => {
    if (!restaurantName) {
      api.getRestaurant().then(r => {
        if (r?.name) setRestaurantName(r.name);
      }).catch(() => {});
    }
  }, [restaurantName]);

  // Tab State
  const [currentTab, setCurrentTab] = useState<"billing" | "tables" | "kitchen" | "printers" | "offline" | "analytics">("billing");

  // Menu items list
  const [menuItems, setMenuItems] = useState<DemoItem[]>(DEFAULT_MENU_ITEMS);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  // Dynamic cart quantities
  const [quantities, setQuantities] = useState<Record<string, number>>({
    "demo-1": 2,
    "demo-2": 1,
    "demo-7": 3,
    "demo-8": 2
  });

  // Billing calculation toggles
  const [gstEnabled, setGstEnabled] = useState(true);
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState<"cash" | "upi" | "card">("upi");

  // Simulated Offline Mode Switch
  const [simulatedOffline, setSimulatedOffline] = useState(false);

  // KOT Tickets state for Kitchen Display simulation
  const [kotTickets, setKotTickets] = useState([
    { id: "KOT-101", table: "Table 2", timeAgo: "4 mins ago", status: "Cooking", items: ["2× Chicken Dum Biryani", "2× Chilled Thums Up"] },
    { id: "KOT-102", table: "Table 4", timeAgo: "1 min ago", status: "Placed", items: ["1× Paneer Butter Masala", "3× Butter Naan"] },
  ]);

  // Modal triggers
  const [showAddModal, setShowAddModal] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);
  const [lockedFeatureName, setLockedFeatureName] = useState("");
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [simulatedPrintSuccess, setSimulatedPrintSuccess] = useState(false);

  // Add Item form fields
  const [newItem, setNewItem] = useState({ name: "", price: "", category: "Main Course", description: "", isVeg: true });
  const [addItemSuccess, setAddItemSuccess] = useState(false);

  // Tables Grid status
  const [tables, setTables] = useState([
    { id: 1, name: "Table 1", status: "Available", seats: 4, bill: 0, items: [] as any[] },
    { id: 2, name: "Table 2", status: "Occupied", seats: 4, bill: 440, items: [{ name: "Chicken Dum Biryani", qty: 2, price: 180 }, { name: "Thums Up", qty: 2, price: 40 }] },
    { id: 3, name: "Table 3", status: "Available", seats: 2, bill: 0, items: [] as any[] },
    { id: 4, name: "Table 4", status: "Occupied", seats: 6, bill: 340, items: [{ name: "Paneer Butter Masala", qty: 1, price: 220 }, { name: "Butter Naan", qty: 3, price: 40 }] },
    { id: 5, name: "Table 5", status: "Billed", seats: 4, bill: 890, items: [{ name: "Tandoori Chicken Full", qty: 2, price: 280 }, { name: "Dal Makhani", qty: 1, price: 160 }, { name: "Lime Soda", qty: 2, price: 60 }] },
    { id: 6, name: "Table 6", status: "Available", seats: 4, bill: 0, items: [] as any[] }
  ]);
  const [selectedTable, setSelectedTable] = useState<any>(null);

  // ROI Calculator state
  const [dailyOrders, setDailyOrders] = useState(60);

  // Handle navigation to subscription / register
  const handleUpgradeNavigation = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (user) {
      router.push("/(app)/subscribe");
    } else {
      router.push("/register");
    }
  };

  // Add Item Quantity in cart
  const updateQty = (id: string, delta: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setQuantities(prev => {
      const current = prev[id] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [id]: next };
    });
  };

  // Add Custom Item Submit
  const handleAddItem = () => {
    if (!newItem.name.trim() || !newItem.price.trim()) {
      alert("Please enter the item name and price.");
      return;
    }
    const itemPrice = parseFloat(newItem.price);
    if (isNaN(itemPrice) || itemPrice <= 0) {
      alert("Please enter a valid price.");
      return;
    }

    const createdItem: DemoItem = {
      id: `custom-${Date.now()}`,
      name: newItem.name.trim(),
      price: itemPrice,
      category: newItem.category,
      description: newItem.description.trim() || "Delicious freshly prepared dish",
      isVeg: newItem.isVeg
    };

    setMenuItems(prev => [createdItem, ...prev]);
    setNewItem({ name: "", price: "", category: "Main Course", description: "", isVeg: true });
    
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setAddItemSuccess(true);
    setTimeout(() => {
      setAddItemSuccess(false);
      setShowAddModal(false);
    }, 1200);
  };

  // Settle Table
  const handleSettleTable = (tableId: number) => {
    setTables(prev => prev.map(t => t.id === tableId ? { ...t, status: "Available", bill: 0, items: [] } : t));
    setSelectedTable(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    alert("Table settled! Receipt printed & status marked Available.");
  };

  // Fire KOT to Kitchen Simulation
  const handleFireKOT = (tableName: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const newKot = {
      id: `KOT-${Math.floor(100 + Math.random() * 900)}`,
      table: tableName,
      timeAgo: "Just now",
      status: "Placed",
      items: selectedItems.map(i => `${i.qty}× ${i.name}`)
    };
    setKotTickets(prev => [newKot, ...prev]);
    alert(`🍳 KOT sent to Kitchen for ${tableName}! Thermal kitchen printer triggered.`);
  };

  // Trigger simulated print action
  const triggerSimulatedPrint = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setSimulatedPrintSuccess(true);
    setTimeout(() => {
      setSimulatedPrintSuccess(false);
      setShowReceiptModal(false);
    }, 2000);
  };

  // Calculations
  const selectedItems = menuItems.map(item => ({
    ...item,
    qty: quantities[item.id] || 0,
  })).filter(i => i.qty > 0);

  const rawSubtotal = selectedItems.reduce((sum, i) => sum + (i.price * i.qty), 0);
  const discountAmt = Math.round((rawSubtotal * (discountPercent / 100)) * 100) / 100;
  const subtotalAfterDiscount = rawSubtotal - discountAmt;
  const gstTax = gstEnabled ? Math.round(subtotalAfterDiscount * 0.05 * 100) / 100 : 0;
  const totalBillAmount = Math.max(0, subtotalAfterDiscount + gstTax);
  const totalItemCount = selectedItems.reduce((sum, i) => sum + i.qty, 0);

  // Filter menu items
  const filteredMenuItems = menuItems.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "All" || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = ["All", "Biryani", "Starters", "Main Course", "Breads", "Beverages", "Desserts"];

  // Monthly savings calculation based on daily orders
  const estimatedMonthlyLoss = Math.round(dailyOrders * 12 * 30); // ~₹12 loss per manual order from mistakes/leakage
  const netMonthlyProfitIncrease = Math.max(0, estimatedMonthlyLoss - 299);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: "#0A0B10" }]}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0B10" />
      <View style={[styles.wrap, { paddingTop: insets.top, backgroundColor: "#0A0B10" }]}>
        
        {/* Top Navbar */}
        <View style={styles.topNav}>
          <View style={styles.brandRow}>
            <Pressable 
              onPress={() => {
                if (router.canGoBack()) {
                  router.back();
                } else if (user) {
                  router.replace("/(app)/subscribe");
                } else {
                  router.replace("/");
                }
              }}
              hitSlop={12}
              style={{ padding: 6, marginRight: 6, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.08)", justifyContent: "center", alignItems: "center" }}
              accessibilityLabel="Back"
            >
              <Ionicons name="arrow-back" size={18} color="#FFFFFF" />
            </Pressable>
            <View style={styles.brandLogoBox}>
              <Ionicons name="restaurant" size={18} color="#FFFFFF" />
            </View>
            <View>
              <Text style={styles.brandName}>EzBill <Text style={{ color: "#FF5E2B" }}>POS</Text></Text>
              <Text style={styles.brandTag}>Interactive Product Tour</Text>
            </View>
          </View>

          <View style={styles.topNavActions}>
            {user ? (
              <Pressable
                style={styles.headerPrimaryBtn}
                onPress={handleUpgradeNavigation}
              >
                <Ionicons name="sparkles" size={14} color="#FFFFFF" />
                <Text style={styles.headerPrimaryText}>Activate Plan</Text>
              </Pressable>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Pressable onPress={() => router.push("/login")}>
                  <Text style={{ color: "#94A3B8", fontSize: 13, fontWeight: "700" }}>Login</Text>
                </Pressable>
                <Pressable
                  style={styles.headerPrimaryBtn}
                  onPress={() => router.push("/register")}
                >
                  <Text style={styles.headerPrimaryText}>Get Started</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false} bounces={false}>
          
          {/* Personalized Welcome Banner if newly registered or logged in */}
          {(registered === "1" || user) && (
            <LinearGradient
              colors={["#1E1B4B", "#312E81"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.welcomeBanner}
            >
              <View style={styles.welcomeBadge}>
                <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                <Text style={styles.welcomeBadgeText}>RESTAURANT ACCOUNT READY</Text>
              </View>
              <Text style={styles.welcomeTitle}>
                Welcome, {restaurantName || user?.full_name || "Restaurant Partner"}! 🎉
              </Text>
              <Text style={styles.welcomeDesc}>
                Your restaurant profile is set up. Test-drive live tables, kitchen KOT & thermal billing below. When you're ready to print bills for real customers, activate your subscription anytime!
              </Text>
              <Pressable style={styles.welcomeCtaBtn} onPress={handleUpgradeNavigation}>
                <Text style={styles.welcomeCtaText}>⚡ Activate Live Subscription (Plans from ₹299/mo)</Text>
                <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
              </Pressable>
            </LinearGradient>
          )}

          {/* Hero Section */}
          <View style={styles.heroSection}>
            <View style={styles.heroPill}>
              <View style={styles.heroDot} />
              <Text style={styles.heroPillText}>INDIA'S #1 FASTEST RESTAURANT ERP</Text>
            </View>
            <Text style={styles.heroHeading}>
              Touch & Test Every Feature{"\n"}Before You Pay A Single Rupee.
            </Text>
            <Text style={styles.heroSub}>
              Experience our lightning-fast billing engine, thermal receipt generator, kitchen KOT screen, table management, and 100% offline guarantee.
            </Text>
          </View>

          {/* Interactive Feature Tabs Controller */}
          <View style={styles.tabsNavContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScrollContent}>
              {[
                { id: "billing", label: "⚡ Fast Billing & Print", icon: "receipt-outline" },
                { id: "tables", label: "🪑 Live Tables POS", icon: "grid-outline" },
                { id: "kitchen", label: "🍳 Kitchen KOT", icon: "flame-outline" },
                { id: "printers", label: "🖨️ Universal Printers", icon: "print-outline" },
                { id: "offline", label: "📴 100% Offline Mode", icon: "cloud-offline-outline" },
                { id: "analytics", label: "📊 Sales & Cash Closing", icon: "bar-chart-outline" }
              ].map(tab => (
                <Pressable
                  key={tab.id}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setCurrentTab(tab.id as any);
                  }}
                  style={[
                    styles.tabNavPill,
                    currentTab === tab.id && styles.tabNavPillActive
                  ]}
                >
                  <Ionicons name={tab.icon as any} size={15} color={currentTab === tab.id ? "#FFFFFF" : "#94A3B8"} />
                  <Text style={[styles.tabNavLabel, currentTab === tab.id && styles.tabNavLabelActive]}>
                    {tab.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {/* TAB 1: FAST BILLING & RECEIPT PREVIEW */}
          {currentTab === "billing" && (
            <View style={styles.playgroundCard}>
              <View style={styles.cardHeaderRow}>
                <View>
                  <Text style={styles.cardSuperTitle}>SUPERFAST BILLING ENGINE</Text>
                  <Text style={styles.cardMainTitle}>Add Items & Print Thermal Bill</Text>
                </View>
                <Pressable style={styles.addItemBtn} onPress={() => setShowAddModal(true)}>
                  <Ionicons name="add" size={16} color="#FFFFFF" />
                  <Text style={styles.addItemBtnText}>Add Custom Dish</Text>
                </Pressable>
              </View>

              {/* Search & Category Pills */}
              <View style={styles.searchRow}>
                <View style={styles.searchBox}>
                  <Ionicons name="search" size={16} color="#64748B" />
                  <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search biryani, paneer, naan..."
                    placeholderTextColor="#64748B"
                    style={styles.searchInput}
                  />
                  {searchQuery ? (
                    <Pressable onPress={() => setSearchQuery("")}>
                      <Ionicons name="close-circle" size={16} color="#64748B" />
                    </Pressable>
                  ) : null}
                </View>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catScroll}>
                {categories.map(c => (
                  <Pressable
                    key={c}
                    onPress={() => setSelectedCategory(c)}
                    style={[styles.catPill, selectedCategory === c && styles.catPillActive]}
                  >
                    <Text style={[styles.catPillText, selectedCategory === c && styles.catPillTextActive]}>{c}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              {/* Menu Grid / List */}
              <View style={styles.menuItemsGrid}>
                {filteredMenuItems.map(item => {
                  const qty = quantities[item.id] || 0;
                  return (
                    <View key={item.id} style={styles.menuItemCard}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <View style={[styles.vegBadge, { borderColor: item.isVeg ? "#10B981" : "#EF4444" }]}>
                            <View style={[styles.vegDot, { backgroundColor: item.isVeg ? "#10B981" : "#EF4444" }]} />
                          </View>
                          <Text style={styles.itemNameText}>{item.name}</Text>
                        </View>
                        <Text style={styles.itemPriceText}>₹{item.price}</Text>
                        <Text style={styles.itemDescText} numberOfLines={1}>{item.description}</Text>
                      </View>

                      <View style={styles.itemQtyControl}>
                        {qty > 0 ? (
                          <View style={styles.qtyControlRow}>
                            <Pressable onPress={() => updateQty(item.id, -1)} style={styles.qtyBtn}>
                              <Ionicons name="remove" size={14} color="#FF5E2B" />
                            </Pressable>
                            <Text style={styles.qtyNumber}>{qty}</Text>
                            <Pressable onPress={() => updateQty(item.id, 1)} style={styles.qtyBtn}>
                              <Ionicons name="add" size={14} color="#FF5E2B" />
                            </Pressable>
                          </View>
                        ) : (
                          <Pressable onPress={() => updateQty(item.id, 1)} style={styles.addBtnPill}>
                            <Text style={styles.addBtnPillText}>+ ADD</Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>

              {/* Live Order Billing Tray */}
              <View style={styles.orderTrayCard}>
                <View style={styles.trayHeader}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="cart" size={20} color="#FF5E2B" />
                    <Text style={styles.trayTitle}>Current Bill ({totalItemCount} items)</Text>
                  </View>
                  <Pressable onPress={() => setQuantities({})} hitSlop={10}>
                    <Text style={{ color: "#EF4444", fontSize: 12, fontWeight: "700" }}>Clear All</Text>
                  </Pressable>
                </View>

                {/* Calculation breakdown */}
                <View style={styles.calcBreakdown}>
                  <View style={styles.calcRow}>
                    <Text style={styles.calcLabel}>Item Subtotal</Text>
                    <Text style={styles.calcVal}>₹{rawSubtotal}</Text>
                  </View>

                  <View style={styles.calcRow}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={styles.calcLabel}>GST (CGST 2.5% + SGST 2.5%)</Text>
                      <Pressable 
                        onPress={() => setGstEnabled(!gstEnabled)} 
                        style={[styles.taxToggleBadge, gstEnabled && styles.taxToggleBadgeActive]}
                      >
                        <Text style={{ fontSize: 10, fontWeight: "800", color: gstEnabled ? "#10B981" : "#64748B" }}>
                          {gstEnabled ? "5% ON" : "OFF"}
                        </Text>
                      </Pressable>
                    </View>
                    <Text style={styles.calcVal}>₹{gstTax}</Text>
                  </View>

                  {discountPercent > 0 && (
                    <View style={styles.calcRow}>
                      <Text style={[styles.calcLabel, { color: "#10B981" }]}>Special Discount ({discountPercent}%)</Text>
                      <Text style={[styles.calcVal, { color: "#10B981" }]}>-₹{discountAmt}</Text>
                    </View>
                  )}

                  <View style={styles.trayDivider} />

                  <View style={styles.calcRow}>
                    <Text style={styles.netTotalLabel}>NET PAYABLE TOTAL</Text>
                    <Text style={styles.netTotalVal}>₹{totalBillAmount}</Text>
                  </View>
                </View>

                {/* Payment Mode Selector */}
                <View style={styles.payModeRow}>
                  {[
                    { id: "upi", label: "Dynamic UPI QR", icon: "qr-code" },
                    { id: "cash", label: "Cash", icon: "cash" },
                    { id: "card", label: "Card / POS", icon: "card" }
                  ].map(m => (
                    <Pressable
                      key={m.id}
                      onPress={() => setPaymentMode(m.id as any)}
                      style={[styles.payModeBtn, paymentMode === m.id && styles.payModeBtnActive]}
                    >
                      <Ionicons name={m.icon as any} size={15} color={paymentMode === m.id ? "#FF5E2B" : "#94A3B8"} />
                      <Text style={[styles.payModeText, paymentMode === m.id && styles.payModeTextActive]}>
                        {m.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {/* Action Buttons */}
                <View style={styles.billingActionsRow}>
                  <Pressable 
                    style={styles.previewReceiptBtn} 
                    onPress={() => setShowReceiptModal(true)}
                  >
                    <Ionicons name="print" size={18} color="#FFFFFF" />
                    <Text style={styles.previewReceiptBtnText}>Preview Thermal Receipt (58/80mm)</Text>
                  </Pressable>

                  <Pressable 
                    style={styles.sendKotBtn} 
                    onPress={() => handleFireKOT("Table 1")}
                  >
                    <Ionicons name="restaurant-outline" size={16} color="#FF5E2B" />
                    <Text style={styles.sendKotBtnText}>Fire Kitchen KOT</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}

          {/* TAB 2: LIVE TABLES POS */}
          {currentTab === "tables" && (
            <View style={styles.playgroundCard}>
              <View style={styles.cardHeaderRow}>
                <View>
                  <Text style={styles.cardSuperTitle}>TABLE MANAGEMENT</Text>
                  <Text style={styles.cardMainTitle}>Live Dine-In Table Status</Text>
                </View>
                <View style={styles.legendRow}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#10B981" }} />
                    <Text style={styles.legendText}>Free</Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#F59E0B" }} />
                    <Text style={styles.legendText}>Busy</Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#EF4444" }} />
                    <Text style={styles.legendText}>Billed</Text>
                  </View>
                </View>
              </View>

              <Text style={{ color: "#94A3B8", fontSize: 13, marginBottom: 16 }}>
                Tap any table below to inspect active food items, fire kitchen KOT, or clear and settle bills:
              </Text>

              {/* Table Cards Grid */}
              <View style={styles.tablesGrid}>
                {tables.map(tbl => {
                  let statusBg = "#10B98120";
                  let statusColor = "#10B981";
                  let borderColor = "#10B98140";
                  if (tbl.status === "Occupied") {
                    statusBg = "#F59E0B20";
                    statusColor = "#F59E0B";
                    borderColor = "#F59E0B40";
                  } else if (tbl.status === "Billed") {
                    statusBg = "#EF444420";
                    statusColor = "#EF4444";
                    borderColor = "#EF444440";
                  }

                  return (
                    <Pressable
                      key={tbl.id}
                      onPress={() => setSelectedTable(tbl)}
                      style={[styles.tableGridCard, { borderColor }]}
                    >
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <Text style={styles.tableGridTitle}>{tbl.name}</Text>
                        <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
                          <Text style={[styles.statusBadgeText, { color: statusColor }]}>{tbl.status}</Text>
                        </View>
                      </View>
                      
                      <Text style={{ color: "#64748B", fontSize: 12, marginTop: 4 }}>{tbl.seats} seats</Text>
                      
                      <View style={{ marginTop: 12 }}>
                        {tbl.bill > 0 ? (
                          <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "900" }}>₹{tbl.bill}</Text>
                        ) : (
                          <Text style={{ color: "#10B981", fontSize: 14, fontWeight: "700" }}>Available</Text>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              {/* Selected Table Quick Sheet */}
              {selectedTable && (
                <View style={styles.selectedTableSheet}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={styles.sheetTitle}>{selectedTable.name} Active Session</Text>
                    <Pressable onPress={() => setSelectedTable(null)} hitSlop={10}>
                      <Ionicons name="close" size={20} color="#94A3B8" />
                    </Pressable>
                  </View>

                  {selectedTable.items.length === 0 ? (
                    <View style={{ paddingVertical: 16 }}>
                      <Text style={{ color: "#94A3B8", fontSize: 13 }}>Table is currently vacant and clean.</Text>
                      <Pressable 
                        style={[styles.actionPillBtn, { marginTop: 12, backgroundColor: "#10B981" }]}
                        onPress={() => {
                          setTables(prev => prev.map(t => t.id === selectedTable.id ? { ...t, status: "Occupied", bill: 360, items: [{ name: "Chicken Dum Biryani", qty: 2, price: 180 }] } : t));
                          setSelectedTable(null);
                        }}
                      >
                        <Text style={styles.actionPillBtnText}>+ Seat Guests & Add Order</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={{ marginTop: 12 }}>
                      <View style={{ gap: 6, marginBottom: 16 }}>
                        {selectedTable.items.map((it: any, idx: number) => (
                          <View key={idx} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                            <Text style={{ color: "#FFFFFF", fontSize: 13 }}>{it.qty}× {it.name}</Text>
                            <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }}>₹{it.qty * it.price}</Text>
                          </View>
                        ))}
                      </View>

                      <View style={{ flexDirection: "row", gap: 10 }}>
                        <Pressable 
                          style={[styles.actionPillBtn, { flex: 1, backgroundColor: "#10B981" }]} 
                          onPress={() => handleSettleTable(selectedTable.id)}
                        >
                          <Text style={styles.actionPillBtnText}>Settle & Free Table</Text>
                        </Pressable>
                        <Pressable 
                          style={[styles.actionPillBtn, { flex: 1, backgroundColor: "#222431" }]} 
                          onPress={() => handleFireKOT(selectedTable.name)}
                        >
                          <Text style={[styles.actionPillBtnText, { color: "#FF5E2B" }]}>Print KOT</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </View>
              )}
            </View>
          )}

          {/* TAB 3: KITCHEN DISPLAY SYSTEM (KOT) */}
          {currentTab === "kitchen" && (
            <View style={styles.playgroundCard}>
              <View style={styles.cardHeaderRow}>
                <View>
                  <Text style={styles.cardSuperTitle}>KITCHEN ORDER TICKETS</Text>
                  <Text style={styles.cardMainTitle}>Live Kitchen Display (KDS)</Text>
                </View>
                <View style={styles.livePulseBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.livePulseText}>KITCHEN DISPATCH ACTIVE</Text>
                </View>
              </View>

              <Text style={{ color: "#94A3B8", fontSize: 13, marginBottom: 16 }}>
                When orders are placed, tickets instantly appear in the kitchen. Chefs update statuses with 1 tap:
              </Text>

              <View style={{ gap: 12 }}>
                {kotTickets.map(kot => (
                  <View key={kot.id} style={styles.kotTicketCard}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text style={styles.kotNumberText}>{kot.id}</Text>
                        <Text style={styles.kotTableBadge}>{kot.table}</Text>
                      </View>
                      <Text style={{ color: "#64748B", fontSize: 12 }}>⏱️ {kot.timeAgo}</Text>
                    </View>

                    <View style={styles.kotItemsList}>
                      {kot.items.map((it, idx) => (
                        <Text key={idx} style={styles.kotItemLine}>• {it}</Text>
                      ))}
                    </View>

                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                      <View style={[styles.kotStatusPill, { backgroundColor: kot.status === "Cooking" ? "#F59E0B20" : "#3B82F620" }]}>
                        <Text style={{ color: kot.status === "Cooking" ? "#F59E0B" : "#3B82F6", fontWeight: "800", fontSize: 11 }}>
                          {kot.status.toUpperCase()}
                        </Text>
                      </View>

                      <Pressable
                        style={styles.kotReadyBtn}
                        onPress={() => {
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                          setKotTickets(prev => prev.filter(k => k.id !== kot.id));
                          alert(`🍲 ${kot.id} for ${kot.table} marked Ready to Serve! Waiter notified.`);
                        }}
                      >
                        <Ionicons name="checkmark-done" size={14} color="#FFFFFF" />
                        <Text style={styles.kotReadyBtnText}>Mark Ready & Serve</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* TAB 4: UNIVERSAL PRINTER HUB */}
          {currentTab === "printers" && (
            <View style={styles.playgroundCard}>
              <View style={styles.cardHeaderRow}>
                <View>
                  <Text style={styles.cardSuperTitle}>HARDWARE ECOSYSTEM</Text>
                  <Text style={styles.cardMainTitle}>Universal Thermal Printer Hub</Text>
                </View>
              </View>

              <Text style={{ color: "#94A3B8", fontSize: 13, marginBottom: 16 }}>
                BillPro connects to any printer brand in India (TVS, Epson, Xprinter, Sunmi, NGX, Bluetooth, USB & LAN) with zero manual driver setups:
              </Text>

              <View style={styles.printerTypesGrid}>
                {[
                  { title: "Bluetooth SPP / BLE", desc: "Handheld pocket printers & TVS BT", status: "Ready", icon: "bluetooth" },
                  { title: "Wi-Fi / Ethernet LAN", desc: "Network printers via TCP Port 9100", status: "Ready", icon: "wifi" },
                  { title: "USB Cable / OTG", desc: "Direct WebUSB hardware communication", status: "Ready", icon: "hardware-chip" },
                  { title: "Sunmi POS Built-in", desc: "Internal print head on Android terminals", status: "Ready", icon: "phone-portrait" }
                ].map((pr, idx) => (
                  <View key={idx} style={styles.printerTypeBox}>
                    <View style={styles.prIconBox}>
                      <Ionicons name={pr.icon as any} size={20} color="#FF5E2B" />
                    </View>
                    <Text style={styles.prTitle}>{pr.title}</Text>
                    <Text style={styles.prDesc}>{pr.desc}</Text>
                    <View style={styles.prStatusPill}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#10B981" }} />
                      <Text style={{ color: "#10B981", fontSize: 11, fontWeight: "700" }}>{pr.status}</Text>
                    </View>
                  </View>
                ))}
              </View>

              <View style={{ marginTop: 16, flexDirection: "row", gap: 10 }}>
                <Pressable 
                  style={[styles.printerActionBtn, { flex: 1 }]}
                  onPress={() => {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                    alert("💵 Cash Drawer Kick Pulse (0x1B, 0x70) sent via RJ11!");
                  }}
                >
                  <Ionicons name="cash-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.printerActionBtnText}>Kick Cash Drawer</Text>
                </Pressable>

                <Pressable 
                  style={[styles.printerActionBtn, { flex: 1, backgroundColor: "#FF5E2B" }]}
                  onPress={() => setShowReceiptModal(true)}
                >
                  <Ionicons name="receipt-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.printerActionBtnText}>Test 80mm Bill Print</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* TAB 5: 100% OFFLINE BILLING SIMULATOR */}
          {currentTab === "offline" && (
            <View style={styles.playgroundCard}>
              <View style={styles.cardHeaderRow}>
                <View>
                  <Text style={styles.cardSuperTitle}>ZERO INTERNET DEPENDENCY</Text>
                  <Text style={styles.cardMainTitle}>100% Offline-First Architecture</Text>
                </View>
              </View>

              <View style={[styles.offlineSimulatorBox, simulatedOffline && styles.offlineSimulatorBoxActive]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Ionicons 
                      name={simulatedOffline ? "cloud-offline" : "wifi"} 
                      size={24} 
                      color={simulatedOffline ? "#EF4444" : "#10B981"} 
                    />
                    <View>
                      <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "800" }}>
                        {simulatedOffline ? "Simulated State: Internet CUT OFF" : "Simulated State: Connected"}
                      </Text>
                      <Text style={{ color: "#94A3B8", fontSize: 12 }}>
                        {simulatedOffline ? "Local database billing & thermal printing running 100% offline" : "Standard cloud synchronization"}
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    style={[styles.offlineToggleBtn, simulatedOffline && styles.offlineToggleBtnActive]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                      setSimulatedOffline(!simulatedOffline);
                    }}
                  >
                    <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "800" }}>
                      {simulatedOffline ? "Reconnect" : "Cut Internet"}
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.offlineFeatureCardsRow}>
                <View style={styles.offlinePointBox}>
                  <Ionicons name="flash" size={18} color="#FF5E2B" style={{ marginBottom: 6 }} />
                  <Text style={styles.offlinePointTitle}>0ms Billing Speed</Text>
                  <Text style={styles.offlinePointDesc}>Bills generate instantly from SQLite disk cache without waiting for servers.</Text>
                </View>
                <View style={styles.offlinePointBox}>
                  <Ionicons name="sync" size={18} color="#10B981" style={{ marginBottom: 6 }} />
                  <Text style={styles.offlinePointTitle}>Silent Auto-Sync</Text>
                  <Text style={styles.offlinePointDesc}>When Wi-Fi returns, transactions sync seamlessly in the background.</Text>
                </View>
              </View>
            </View>
          )}

          {/* TAB 6: SALES & DAY-END CASH CLOSING */}
          {currentTab === "analytics" && (
            <View style={styles.playgroundCard}>
              <View style={styles.cardHeaderRow}>
                <View>
                  <Text style={styles.cardSuperTitle}>BUSINESS INTELLIGENCE</Text>
                  <Text style={styles.cardMainTitle}>Real-Time Revenue & Closing</Text>
                </View>
              </View>

              {/* Main KPI Stats */}
              <View style={styles.kpiRow}>
                <View style={styles.kpiBox}>
                  <Text style={styles.kpiLabel}>TODAY'S REVENUE</Text>
                  <Text style={styles.kpiVal}>₹28,450</Text>
                  <Text style={{ color: "#10B981", fontSize: 11, fontWeight: "700", marginTop: 2 }}>+14.2% vs yesterday</Text>
                </View>
                <View style={styles.kpiBox}>
                  <Text style={styles.kpiLabel}>TOTAL ORDERS</Text>
                  <Text style={styles.kpiVal}>48</Text>
                  <Text style={{ color: "#64748B", fontSize: 11, marginTop: 2 }}>Avg ticket: ₹592</Text>
                </View>
              </View>

              {/* End of Day Cash Closing Drawer reconciliation */}
              <View style={styles.cashClosingCard}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "800" }}>Cash Register Summary</Text>
                  <Text style={{ color: "#10B981", fontSize: 12, fontWeight: "700" }}>✓ Drawer Balanced</Text>
                </View>
                <View style={{ gap: 8, marginTop: 12 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: "#94A3B8", fontSize: 12 }}>Opening Cash Float</Text>
                    <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "700" }}>₹2,000</Text>
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: "#94A3B8", fontSize: 12 }}>Cash Collected Today</Text>
                    <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "700" }}>₹14,200</Text>
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: "#94A3B8", fontSize: 12 }}>UPI & Digital Collections</Text>
                    <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "700" }}>₹14,250</Text>
                  </View>
                  <View style={styles.trayDivider} />
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "800" }}>Expected Physical Cash</Text>
                    <Text style={{ color: "#FF5E2B", fontSize: 15, fontWeight: "900" }}>₹16,200</Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* ======================================================== */}
          {/* CONVERSION PSYCHOLOGY SECTION 1: INTERACTIVE ROI CALCULATOR */}
          {/* ======================================================== */}
          <View style={styles.roiCard}>
            <View style={styles.roiHeader}>
              <Ionicons name="calculator-outline" size={24} color="#FF5E2B" />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.roiSuperTitle}>RESTAURANT PROFIT ENGINE</Text>
                <Text style={styles.roiMainTitle}>How Much Does Manual Billing Cost You?</Text>
              </View>
            </View>

            <Text style={styles.roiBody}>
              Restaurants lose an estimated ₹12 to ₹15 per order from math errors, unbilled extras, missing kitchen tickets, and slow turnaround times.
            </Text>

            {/* Daily order stepper */}
            <View style={styles.stepperContainer}>
              <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "700" }}>
                Your Average Daily Orders: <Text style={{ color: "#FF5E2B", fontSize: 18, fontWeight: "900" }}>{dailyOrders}</Text> orders/day
              </Text>
              <View style={styles.stepperButtons}>
                {[30, 50, 75, 100, 150].map(cnt => (
                  <Pressable
                    key={cnt}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setDailyOrders(cnt);
                    }}
                    style={[styles.stepperPill, dailyOrders === cnt && styles.stepperPillActive]}
                  >
                    <Text style={[styles.stepperPillText, dailyOrders === cnt && styles.stepperPillTextActive]}>{cnt}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Savings Result Hero */}
            <View style={styles.savingsHero}>
              <View>
                <Text style={styles.savingsHeroLabel}>YOU SAVE APPROXIMATELY</Text>
                <Text style={styles.savingsHeroAmount}>₹{estimatedMonthlyLoss.toLocaleString("en-IN")}<Text style={{ fontSize: 16, color: "#94A3B8" }}> / month</Text></Text>
                <Text style={styles.savingsHeroSub}>EzBill costs ₹299/mo · Your Net Gain: ₹{netMonthlyProfitIncrease.toLocaleString("en-IN")}/mo ({(estimatedMonthlyLoss / 299).toFixed(0)}x ROI)</Text>
              </View>
            </View>
          </View>

          {/* ======================================================== */}
          {/* CONVERSION PSYCHOLOGY SECTION 2: SOCIAL PROOF & TESTIMONIALS */}
          {/* ======================================================== */}
          <View style={styles.socialProofCard}>
            <Text style={styles.socialProofHeading}>Trusted by 1,200+ Restaurants Across India</Text>
            
            <View style={styles.ratingBadgeRow}>
              <Text style={{ color: "#F59E0B", fontSize: 18 }}>★★★★★</Text>
              <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 14, marginLeft: 6 }}>4.9/5 Rating</Text>
              <Text style={{ color: "#64748B", fontSize: 12, marginLeft: 6 }}>(Verified Owners)</Text>
            </View>

            <View style={{ gap: 12, marginTop: 16 }}>
              <View style={styles.testimonialItem}>
                <Text style={styles.testimonialText}>
                  "We switched from a bulky ₹35,000 POS hardware to EzBill on our mobile tablet. Bills print in 2 seconds via Bluetooth thermal, and our waiters never mix up tables anymore."
                </Text>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
                  <Text style={styles.testimonialAuthor}>Rajesh Hegde</Text>
                  <Text style={styles.testimonialResto}>Udupi Rasoi, Bengaluru</Text>
                </View>
              </View>

              <View style={styles.testimonialItem}>
                <Text style={styles.testimonialText}>
                  "The offline guarantee is 100% genuine. Our internet failed on Saturday evening rush hour, but EzBill kept printing KOTs and receipts without stopping."
                </Text>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
                  <Text style={styles.testimonialAuthor}>Mohammad Irfan</Text>
                  <Text style={styles.testimonialResto}>Al-Madina Biryani, Hyderabad</Text>
                </View>
              </View>
            </View>
          </View>

          {/* ======================================================== */}
          {/* CONVERSION PSYCHOLOGY SECTION 3: TRANSPARENT PLANS & CTA */}
          {/* ======================================================== */}
          <View style={styles.pricingCard}>
            <Text style={styles.pricingTitle}>Simple, Transparent Plans</Text>
            <Text style={styles.pricingSub}>Zero commission per order. You keep 100% of your earnings.</Text>

            <View style={styles.plansContainer}>
              {/* Starter Plan */}
              <View style={styles.planBox}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={styles.planName}>STARTER</Text>
                  <Text style={styles.planPrice}>₹299<Text style={{ fontSize: 12, color: "#94A3B8" }}>/mo</Text></Text>
                </View>
                <Text style={styles.planDesc}>Ideal for cafes, bakeries & quick service stalls.</Text>
                
                <View style={styles.planFeaturesList}>
                  <Text style={styles.planFeat}>✓ Unlimited Bills & Orders</Text>
                  <Text style={styles.planFeat}>✓ 100% Offline-First Billing</Text>
                  <Text style={styles.planFeat}>✓ Bluetooth & USB Thermal Print</Text>
                  <Text style={styles.planFeat}>✓ GST Tax Calculation & UPI QR</Text>
                </View>

                <Pressable style={styles.planCtaBtn} onPress={handleUpgradeNavigation}>
                  <Text style={styles.planCtaBtnText}>Choose Starter Plan</Text>
                </Pressable>
              </View>

              {/* Pro Plan - Highlighted */}
              <View style={[styles.planBox, styles.planBoxHighlighted]}>
                <View style={styles.popularBadge}>
                  <Text style={styles.popularBadgeText}>MOST POPULAR</Text>
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                  <Text style={[styles.planName, { color: "#FF5E2B" }]}>PRO RESTAURANT</Text>
                  <Text style={styles.planPrice}>₹599<Text style={{ fontSize: 12, color: "#94A3B8" }}>/mo</Text></Text>
                </View>
                <Text style={styles.planDesc}>For dine-in restaurants with tables & kitchen KOT.</Text>
                
                <View style={styles.planFeaturesList}>
                  <Text style={styles.planFeat}>✓ Everything in Starter</Text>
                  <Text style={styles.planFeat}>✓ Unlimited Tables & Waiter Staff</Text>
                  <Text style={styles.planFeat}>✓ Live Kitchen Display (KDS) & KOT</Text>
                  <Text style={styles.planFeat}>✓ Multi-Printer Auto Dispatch</Text>
                  <Text style={styles.planFeat}>✓ End-of-Day Cash Closing & Audit</Text>
                </View>

                <Pressable style={[styles.planCtaBtn, { backgroundColor: "#FF5E2B" }]} onPress={handleUpgradeNavigation}>
                  <Text style={[styles.planCtaBtnText, { color: "#FFFFFF" }]}>⚡ Start Pro Plan (Recommended)</Text>
                </Pressable>
              </View>
            </View>

            {/* Guarantee Pill */}
            <View style={styles.guaranteeRow}>
              <Ionicons name="shield-checkmark" size={18} color="#10B981" />
              <Text style={{ color: "#94A3B8", fontSize: 12, fontWeight: "600" }}>
                14-Day Money-Back Guarantee · Cancel Anytime · Free 1-on-1 Setup Support
              </Text>
            </View>
          </View>

          <View style={{ height: 90 }} />
        </ScrollView>

        {/* ======================================================== */}
        {/* STICKY BOTTOM CONVERSION BAR */}
        {/* ======================================================== */}
        <View style={[styles.stickyBottomBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.stickyBarTitle}>
              {restaurantName ? `Ready to go live with ${restaurantName}?` : "Ready to start live billing?"}
            </Text>
            <Text style={styles.stickyBarSub}>Plans start at ₹299/mo (₹10/day) · Cancel anytime</Text>
          </View>

          <Pressable style={styles.stickyBarBtn} onPress={handleUpgradeNavigation}>
            <Text style={styles.stickyBarBtnText}>Activate Now</Text>
            <Ionicons name="arrow-forward" size={15} color="#FFFFFF" />
          </Pressable>
        </View>

        {/* ======================================================== */}
        {/* MODAL 1: ADD CUSTOM MENU ITEM */}
        {/* ======================================================== */}
        <Modal visible={showAddModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Add Custom Dish to Menu</Text>
                <Pressable onPress={() => setShowAddModal(false)} hitSlop={10}>
                  <Ionicons name="close" size={22} color="#8A8A93" />
                </Pressable>
              </View>

              {addItemSuccess ? (
                <View style={styles.successFormContainer}>
                  <Ionicons name="checkmark-circle" size={48} color="#10B981" />
                  <Text style={styles.successFormText}>✓ Dish added to demo menu!</Text>
                </View>
              ) : (
                <View style={styles.formContainer}>
                  <View style={styles.field}>
                    <Text style={styles.label}>Dish / Item Name *</Text>
                    <TextInput
                      value={newItem.name}
                      onChangeText={t => setNewItem({ ...newItem, name: t })}
                      placeholder="e.g. Masala Dosa"
                      placeholderTextColor="#64748B"
                      style={styles.formInput}
                    />
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.label}>Price (₹) *</Text>
                    <TextInput
                      value={newItem.price}
                      onChangeText={t => setNewItem({ ...newItem, price: t })}
                      placeholder="e.g. 90"
                      placeholderTextColor="#64748B"
                      keyboardType="number-pad"
                      style={styles.formInput}
                    />
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.label}>Food Type</Text>
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <Pressable 
                        style={[styles.vegToggleBtn, newItem.isVeg && styles.vegToggleBtnActive]}
                        onPress={() => setNewItem({ ...newItem, isVeg: true })}
                      >
                        <Text style={{ color: newItem.isVeg ? "#10B981" : "#94A3B8", fontWeight: "700" }}>🟢 Pure Veg</Text>
                      </Pressable>
                      <Pressable 
                        style={[styles.vegToggleBtn, !newItem.isVeg && styles.nonVegToggleBtnActive]}
                        onPress={() => setNewItem({ ...newItem, isVeg: false })}
                      >
                        <Text style={{ color: !newItem.isVeg ? "#EF4444" : "#94A3B8", fontWeight: "700" }}>🔴 Non-Veg</Text>
                      </Pressable>
                    </View>
                  </View>

                  <Pressable style={styles.formSubmitBtn} onPress={handleAddItem}>
                    <Text style={styles.formSubmitBtnText}>Add Item to Demo Menu</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        </Modal>

        {/* ======================================================== */}
        {/* MODAL 2: AUTHENTIC THERMAL RECEIPT PREVIEW (58/80MM) */}
        {/* ======================================================== */}
        <Modal visible={showReceiptModal} transparent animationType="slide">
          <Pressable style={styles.modalOverlay} onPress={() => setShowReceiptModal(false)}>
            <View style={styles.receiptCard}>
              <View style={styles.receiptHeaderRow}>
                <View>
                  <Text style={styles.receiptModalTitle}>Thermal Receipt Preview</Text>
                  <Text style={{ color: "#64748B", fontSize: 11 }}>Simulated ESC/POS Print (58mm/80mm)</Text>
                </View>
                <Pressable onPress={() => setShowReceiptModal(false)}>
                  <Ionicons name="close" size={24} color="#0E0F14" />
                </Pressable>
              </View>

              {/* Receipt Paper roll container */}
              <ScrollView style={styles.receiptPaper} showsVerticalScrollIndicator={false}>
                <Text style={styles.receiptShopName}>
                  {restaurantName ? restaurantName.toUpperCase() : "EZBILL DEMO RESTAURANT"}
                </Text>
                <Text style={styles.receiptShopSub}>GSTIN: 29ABCDE1234F1Z5 · Ph: 9876543210</Text>
                <Text style={styles.receiptShopSub}>Bengaluru, Karnataka</Text>
                
                <View style={styles.receiptLineDash} />

                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                  <Text style={{ fontSize: 11, color: "#000000" }}>Bill No: #1048</Text>
                  <Text style={{ fontSize: 11, color: "#000000" }}>Table: Table 1</Text>
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                  <Text style={{ fontSize: 11, color: "#000000" }}>Date: {new Date().toLocaleDateString()}</Text>
                  <Text style={{ fontSize: 11, color: "#000000" }}>Time: {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                </View>

                <View style={styles.receiptLineDash} />

                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                  <Text style={[styles.receiptItemColBold, { flex: 2 }]}>ITEM</Text>
                  <Text style={[styles.receiptQtyCol, { fontWeight: "700" }]}>QTY</Text>
                  <Text style={[styles.receiptPriceCol, { fontWeight: "700" }]}>AMT</Text>
                </View>

                <View style={styles.receiptLineDash} />

                {selectedItems.map((item, idx) => (
                  <View key={idx} style={styles.receiptRow}>
                    <Text style={[styles.receiptItemCol, { flex: 2 }]} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.receiptQtyCol}>{item.qty}</Text>
                    <Text style={styles.receiptPriceCol}>₹{item.qty * item.price}</Text>
                  </View>
                ))}

                <View style={styles.receiptLineDash} />

                <View style={styles.receiptRow}>
                  <Text style={styles.receiptItemColBold}>Subtotal</Text>
                  <Text style={styles.receiptPriceCol}>₹{rawSubtotal}</Text>
                </View>
                {gstEnabled && (
                  <>
                    <View style={styles.receiptRow}>
                      <Text style={{ fontSize: 11, color: "#333333", flex: 1 }}>CGST (2.5%)</Text>
                      <Text style={styles.receiptPriceCol}>₹{(gstTax / 2).toFixed(2)}</Text>
                    </View>
                    <View style={styles.receiptRow}>
                      <Text style={{ fontSize: 11, color: "#333333", flex: 1 }}>SGST (2.5%)</Text>
                      <Text style={styles.receiptPriceCol}>₹{(gstTax / 2).toFixed(2)}</Text>
                    </View>
                  </>
                )}

                <View style={styles.receiptLineDash} />

                <View style={styles.receiptRow}>
                  <Text style={styles.receiptItemColBig}>TOTAL PAYABLE</Text>
                  <Text style={styles.receiptPriceColBig}>₹{totalBillAmount}</Text>
                </View>

                <View style={styles.receiptLineDash} />

                {/* Simulated UPI QR Code */}
                <View style={{ alignItems: "center", marginVertical: 8 }}>
                  <View style={styles.receiptQrBox}>
                    <Ionicons name="qr-code" size={54} color="#000000" />
                  </View>
                  <Text style={{ fontSize: 10, fontWeight: "700", marginTop: 4, color: "#000000" }}>
                    Scan & Pay with PhonePe / GPay / Paytm
                  </Text>
                </View>

                <Text style={styles.receiptFooterMsg}>*** THANK YOU! VISIT AGAIN ***</Text>
                <Text style={styles.receiptFooterSub}>POWERED BY EZBILL POS SOFTWARE</Text>
              </ScrollView>

              {/* Print Action / Confirmation */}
              {simulatedPrintSuccess ? (
                <View style={styles.printSuccessBanner}>
                  <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                  <Text style={{ color: "#10B981", fontWeight: "800", fontSize: 13, marginLeft: 6 }}>
                    ✓ Bill Printed Successfully via Thermal Head!
                  </Text>
                </View>
              ) : (
                <Pressable
                  style={styles.receiptCtaBtn}
                  onPress={triggerSimulatedPrint}
                >
                  <Ionicons name="print" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.receiptCtaText}>Trigger Thermal Print Now</Text>
                </Pressable>
              )}
            </View>
          </Pressable>
        </Modal>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0A0B10" },
  wrap: { flex: 1, backgroundColor: "#0A0B10" },
  scrollContainer: { paddingHorizontal: 16, paddingBottom: 40 },

  // Navbar
  topNav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    height: 60,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1E202B",
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandLogoBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#FF5E2B",
    justifyContent: "center",
    alignItems: "center",
  },
  brandName: { color: "#FFFFFF", fontSize: 18, fontWeight: "900", letterSpacing: -0.5 },
  brandTag: { color: "#64748B", fontSize: 11, fontWeight: "600" },
  topNavActions: { flexDirection: "row", alignItems: "center" },
  headerPrimaryBtn: {
    backgroundColor: "#FF5E2B",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  headerPrimaryText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },

  // Welcome banner for registered users
  welcomeBanner: {
    borderRadius: 16,
    padding: 16,
    marginTop: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#4338CA",
  },
  welcomeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 6,
  },
  welcomeBadgeText: { color: "#10B981", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  welcomeTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "900", marginBottom: 6 },
  welcomeDesc: { color: "#C7D2FE", fontSize: 13, lineHeight: 19, marginBottom: 14 },
  welcomeCtaBtn: {
    backgroundColor: "#FF5E2B",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  welcomeCtaText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },

  // Hero Section
  heroSection: { alignItems: "center", marginVertical: 18, paddingHorizontal: 8 },
  heroPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255, 94, 43, 0.12)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 10,
  },
  heroDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#FF5E2B" },
  heroPillText: { color: "#FF5E2B", fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },
  heroHeading: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
    lineHeight: 28,
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  heroSub: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    maxWidth: 480,
  },

  // Tabs Navigator
  tabsNavContainer: { marginBottom: 14 },
  tabsScrollContent: { gap: 8, paddingVertical: 4 },
  tabNavPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#161822",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#222533",
  },
  tabNavPillActive: { backgroundColor: "#FF5E2B", borderColor: "#FF5E2B" },
  tabNavLabel: { color: "#94A3B8", fontSize: 12, fontWeight: "700" },
  tabNavLabelActive: { color: "#FFFFFF" },

  // Playground Card
  playgroundCard: {
    backgroundColor: "#12131A",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#1E202B",
    marginBottom: 20,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  cardSuperTitle: { color: "#FF5E2B", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  cardMainTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "800", marginTop: 2 },
  addItemBtn: {
    backgroundColor: "#1E202B",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2A2D3D",
  },
  addItemBtnText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },

  // Search & Categories
  searchRow: { marginBottom: 10 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0A0B10",
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    borderWidth: 1,
    borderColor: "#222533",
    gap: 8,
  },
  searchInput: { flex: 1, color: "#FFFFFF", fontSize: 13 },
  catScroll: { gap: 6, marginBottom: 14 },
  catPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "#161822",
    borderWidth: 1,
    borderColor: "#222533",
  },
  catPillActive: { backgroundColor: "#FF5E2B20", borderColor: "#FF5E2B" },
  catPillText: { color: "#94A3B8", fontSize: 12, fontWeight: "600" },
  catPillTextActive: { color: "#FF5E2B", fontWeight: "800" },

  // Menu items list
  menuItemsGrid: { gap: 8, marginBottom: 16 },
  menuItemCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#161822",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#222533",
  },
  vegBadge: { width: 12, height: 12, borderWidth: 1.5, borderRadius: 2, alignItems: "center", justifyContent: "center" },
  vegDot: { width: 5, height: 5, borderRadius: 2.5 },
  itemNameText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  itemPriceText: { color: "#FF5E2B", fontSize: 14, fontWeight: "800", marginTop: 2 },
  itemDescText: { color: "#64748B", fontSize: 11, marginTop: 2 },
  itemQtyControl: { marginLeft: 12 },
  qtyControlRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0A0B10",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FF5E2B",
  },
  qtyBtn: { padding: 6 },
  qtyNumber: { color: "#FFFFFF", fontWeight: "800", fontSize: 13, paddingHorizontal: 6 },
  addBtnPill: {
    backgroundColor: "#0A0B10",
    borderColor: "#FF5E2B",
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addBtnPillText: { color: "#FF5E2B", fontSize: 11, fontWeight: "800" },

  // Order tray card
  orderTrayCard: {
    backgroundColor: "#0A0B10",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#222533",
  },
  trayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  trayTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  calcBreakdown: { gap: 6 },
  calcRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  calcLabel: { color: "#94A3B8", fontSize: 12 },
  calcVal: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  taxToggleBadge: {
    backgroundColor: "#161822",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#222533",
  },
  taxToggleBadgeActive: { borderColor: "#10B981" },
  trayDivider: { height: 1, backgroundColor: "#1E202B", marginVertical: 6 },
  netTotalLabel: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  netTotalVal: { color: "#FF5E2B", fontSize: 18, fontWeight: "900" },

  // Pay mode selector
  payModeRow: { flexDirection: "row", gap: 6, marginVertical: 12 },
  payModeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "#161822",
    borderRadius: 8,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#222533",
  },
  payModeBtnActive: { borderColor: "#FF5E2B", backgroundColor: "rgba(255, 94, 43, 0.1)" },
  payModeText: { color: "#94A3B8", fontSize: 11, fontWeight: "700" },
  payModeTextActive: { color: "#FF5E2B" },

  billingActionsRow: { gap: 8 },
  previewReceiptBtn: {
    backgroundColor: "#FF5E2B",
    borderRadius: 10,
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  previewReceiptBtnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  sendKotBtn: {
    backgroundColor: "transparent",
    borderRadius: 10,
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(255, 94, 43, 0.4)",
  },
  sendKotBtnText: { color: "#FF5E2B", fontSize: 12, fontWeight: "800" },

  // Tables Grid Tab
  legendRow: { flexDirection: "row", gap: 10 },
  legendText: { color: "#94A3B8", fontSize: 11, fontWeight: "600" },
  tablesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tableGridCard: {
    width: "48%",
    backgroundColor: "#161822",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.5,
  },
  tableGridTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  statusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  statusBadgeText: { fontSize: 10, fontWeight: "800" },
  selectedTableSheet: {
    backgroundColor: "#0A0B10",
    borderRadius: 12,
    padding: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#222533",
  },
  sheetTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  actionPillBtn: {
    height: 38,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  actionPillBtnText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },

  // Kitchen Tab
  livePulseBadge: { flexDirection: "row", alignItems: "center", gap: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#10B981" },
  livePulseText: { color: "#10B981", fontSize: 10, fontWeight: "800" },
  kotTicketCard: {
    backgroundColor: "#161822",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#222533",
  },
  kotNumberText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  kotTableBadge: { backgroundColor: "#222533", color: "#FF5E2B", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, fontSize: 11, fontWeight: "800" },
  kotItemsList: { gap: 4, marginVertical: 8 },
  kotItemLine: { color: "#E2E8F0", fontSize: 13, fontWeight: "600" },
  kotStatusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  kotReadyBtn: {
    backgroundColor: "#10B981",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  kotReadyBtnText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },

  // Printers Tab
  printerTypesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  printerTypeBox: {
    width: "48%",
    backgroundColor: "#161822",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#222533",
  },
  prIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(255, 94, 43, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  prTitle: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  prDesc: { color: "#64748B", fontSize: 11, marginTop: 2, lineHeight: 15 },
  prStatusPill: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  printerActionBtn: {
    backgroundColor: "#222533",
    borderRadius: 10,
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  printerActionBtnText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },

  // Offline Tab
  offlineSimulatorBox: {
    backgroundColor: "#161822",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#10B98140",
    marginBottom: 12,
  },
  offlineSimulatorBoxActive: { borderColor: "#EF444460" },
  offlineToggleBtn: {
    backgroundColor: "#EF4444",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  offlineToggleBtnActive: { backgroundColor: "#10B981" },
  offlineFeatureCardsRow: { flexDirection: "row", gap: 10 },
  offlinePointBox: {
    flex: 1,
    backgroundColor: "#0A0B10",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#222533",
  },
  offlinePointTitle: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  offlinePointDesc: { color: "#94A3B8", fontSize: 11, marginTop: 2, lineHeight: 15 },

  // Analytics Tab
  kpiRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  kpiBox: {
    flex: 1,
    backgroundColor: "#161822",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#222533",
  },
  kpiLabel: { color: "#64748B", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  kpiVal: { color: "#FFFFFF", fontSize: 20, fontWeight: "900", marginTop: 4 },
  cashClosingCard: {
    backgroundColor: "#0A0B10",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#222533",
  },

  // ROI Section
  roiCard: {
    backgroundColor: "#12131A",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#1E202B",
    marginBottom: 20,
  },
  roiHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  roiSuperTitle: { color: "#FF5E2B", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  roiMainTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "800", marginTop: 2 },
  roiBody: { color: "#94A3B8", fontSize: 12, lineHeight: 18, marginBottom: 14 },
  stepperContainer: {
    backgroundColor: "#0A0B10",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#222533",
    marginBottom: 12,
  },
  stepperButtons: { flexDirection: "row", gap: 8, marginTop: 10 },
  stepperPill: {
    flex: 1,
    backgroundColor: "#161822",
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#222533",
  },
  stepperPillActive: { borderColor: "#FF5E2B", backgroundColor: "rgba(255, 94, 43, 0.15)" },
  stepperPillText: { color: "#94A3B8", fontSize: 12, fontWeight: "700" },
  stepperPillTextActive: { color: "#FF5E2B", fontWeight: "900" },
  savingsHero: {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderColor: "rgba(16, 185, 129, 0.3)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  savingsHeroLabel: { color: "#10B981", fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  savingsHeroAmount: { color: "#10B981", fontSize: 26, fontWeight: "900", marginVertical: 2 },
  savingsHeroSub: { color: "#94A3B8", fontSize: 11, fontWeight: "600" },

  // Social Proof Card
  socialProofCard: {
    backgroundColor: "#12131A",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#1E202B",
    marginBottom: 20,
  },
  socialProofHeading: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  ratingBadgeRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  testimonialItem: {
    backgroundColor: "#0A0B10",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#222533",
  },
  testimonialText: { color: "#CBD5E1", fontSize: 12, lineHeight: 18, fontStyle: "italic" },
  testimonialAuthor: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  testimonialResto: { color: "#FF5E2B", fontSize: 11, fontWeight: "700" },

  // Pricing Plans
  pricingCard: {
    backgroundColor: "#12131A",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#1E202B",
    marginBottom: 20,
  },
  pricingTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "900", textAlign: "center" },
  pricingSub: { color: "#94A3B8", fontSize: 12, textAlign: "center", marginTop: 4, marginBottom: 16 },
  plansContainer: { gap: 12 },
  planBox: {
    backgroundColor: "#0A0B10",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#222533",
  },
  planBoxHighlighted: {
    borderColor: "#FF5E2B",
    backgroundColor: "#141113",
  },
  popularBadge: {
    backgroundColor: "#FF5E2B",
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 6,
  },
  popularBadgeText: { color: "#FFFFFF", fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  planName: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  planPrice: { color: "#FFFFFF", fontSize: 20, fontWeight: "900" },
  planDesc: { color: "#64748B", fontSize: 11, marginTop: 2, marginBottom: 12 },
  planFeaturesList: { gap: 6, marginBottom: 14 },
  planFeat: { color: "#CBD5E1", fontSize: 12, fontWeight: "600" },
  planCtaBtn: {
    height: 42,
    backgroundColor: "#222533",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  planCtaBtnText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  guaranteeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 14,
  },

  // Sticky Bottom Bar
  stickyBottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#12131A",
    borderTopWidth: 1,
    borderTopColor: "#222533",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  stickyBarTitle: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  stickyBarSub: { color: "#94A3B8", fontSize: 11 },
  stickyBarBtn: {
    backgroundColor: "#FF5E2B",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  stickyBarBtnText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },

  // Modal Common
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalContent: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#161822",
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: "#222533",
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  modalTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  formContainer: { gap: 12 },
  field: { gap: 6 },
  label: { color: "#94A3B8", fontSize: 12, fontWeight: "700" },
  formInput: {
    backgroundColor: "#0A0B10",
    borderRadius: 10,
    height: 44,
    paddingHorizontal: 12,
    color: "#FFFFFF",
    fontSize: 13,
    borderWidth: 1,
    borderColor: "#222533",
  },
  vegToggleBtn: {
    flex: 1,
    backgroundColor: "#0A0B10",
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#222533",
  },
  vegToggleBtnActive: { borderColor: "#10B981" },
  nonVegToggleBtnActive: { borderColor: "#EF4444" },
  formSubmitBtn: {
    backgroundColor: "#FF5E2B",
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  formSubmitBtnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  successFormContainer: { alignItems: "center", paddingVertical: 24, gap: 12 },
  successFormText: { color: "#10B981", fontSize: 15, fontWeight: "800" },

  // Thermal Receipt Modal
  receiptCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
  },
  receiptHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  receiptModalTitle: { color: "#000000", fontSize: 15, fontWeight: "900" },
  receiptPaper: { maxHeight: 380, paddingHorizontal: 4 },
  receiptShopName: { color: "#000000", fontSize: 15, fontWeight: "900", textAlign: "center" },
  receiptShopSub: { color: "#475569", fontSize: 10, textAlign: "center", marginTop: 1, fontWeight: "600" },
  receiptLineDash: { height: 1, borderWidth: 0.5, borderColor: "#000000", borderStyle: "dashed", marginVertical: 8 },
  receiptRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  receiptItemCol: { color: "#000000", fontSize: 12, fontWeight: "500" },
  receiptQtyCol: { color: "#000000", fontSize: 12, width: 30, textAlign: "center" },
  receiptPriceCol: { color: "#000000", fontSize: 12, width: 60, textAlign: "right", fontWeight: "600" },
  receiptItemColBold: { color: "#000000", fontSize: 12, fontWeight: "800" },
  receiptItemColBig: { color: "#000000", fontSize: 14, fontWeight: "900" },
  receiptPriceColBig: { color: "#000000", fontSize: 15, fontWeight: "900", textAlign: "right" },
  receiptQrBox: {
    width: 68,
    height: 68,
    borderWidth: 1,
    borderColor: "#000000",
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  receiptFooterMsg: { color: "#000000", fontSize: 12, fontWeight: "900", textAlign: "center", marginTop: 8 },
  receiptFooterSub: { color: "#64748B", fontSize: 9, textAlign: "center", marginTop: 2, fontWeight: "700" },
  receiptCtaBtn: {
    height: 44,
    backgroundColor: "#FF5E2B",
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },
  receiptCtaText: { color: "#FFFFFF", fontWeight: "800", fontSize: 13 },
  printSuccessBanner: {
    height: 44,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },
});
