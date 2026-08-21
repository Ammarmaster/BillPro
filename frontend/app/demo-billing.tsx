import { useCallback, useState, useEffect } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView, SafeAreaView, StatusBar, Modal, ActivityIndicator, TextInput, useWindowDimensions, Platform
} from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/context/ThemeContext";
import { useAuth } from "@/src/context/AuthContext";
import { radius, spacing } from "@/src/theme";
import { LinearGradient } from "expo-linear-gradient";

// Interface for demo menu items
interface DemoItem {
  id: string;
  name: string;
  price: number;
  category: string;
  description: string;
}

// Initial demo items
const DEFAULT_MENU_ITEMS: DemoItem[] = [
  { id: "demo-1", name: "Chicken Biryani", price: 180, category: "Biryani", description: "Aromatic basmati rice cooked with chicken and spices" },
  { id: "demo-2", name: "Paneer Butter Masala", price: 220, category: "Main Course", description: "Cottage cheese cubes in rich buttery gravy" },
  { id: "demo-3", name: "Dal Makhani", price: 160, category: "Main Course", description: "Slow-cooked black lentils with cream" },
  { id: "demo-4", name: "Paneer Tikka", price: 180, category: "Starters", description: "Grilled cottage cheese marinated with spices" },
  { id: "demo-5", name: "Spring Roll", price: 120, category: "Starters", description: "Crispy rolls filled with seasoned vegetables" },
  { id: "demo-6", name: "Veg Biryani", price: 150, category: "Biryani", description: "Basmati rice cooked with fresh vegetables and herbs" },
  { id: "demo-7", name: "Coke", price: 40, category: "Beverages", description: "Cold soft drink" },
  { id: "demo-8", name: "Fresh Lime Soda", price: 60, category: "Beverages", description: "Chilled lemon beverage" },
  { id: "demo-9", name: "Gulab Jamun", price: 80, category: "Desserts", description: "Sweet fried dough balls in sugar syrup" },
  { id: "demo-10", name: "Vanilla Ice Cream", price: 70, category: "Desserts", description: "Creamy vanilla dessert" }
];

export default function DemoBilling() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const { user, logout } = useAuth();
  const { width } = useWindowDimensions();

  // Tab State
  const [currentTab, setCurrentTab] = useState<"dashboard" | "menu" | "billing" | "tables" | "analytics">("dashboard");

  // Menu items list
  const [menuItems, setMenuItems] = useState<DemoItem[]>(DEFAULT_MENU_ITEMS);

  // Search menu item state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  // Dynamic cart quantities
  const [quantities, setQuantities] = useState<Record<string, number>>({
    "demo-1": 2, // Default selection
    "demo-2": 1,
    "demo-7": 2
  });

  // Modal triggers
  const [showAddModal, setShowAddModal] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);
  const [lockedFeatureName, setLockedFeatureName] = useState("");
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  // Add Item form fields
  const [newItem, setNewItem] = useState({ name: "", price: "", category: "Main Course", description: "" });
  const [addItemSuccess, setAddItemSuccess] = useState(false);

  // Tables Grid status
  const [tables, setTables] = useState([
    { id: 1, name: "Table 1", status: "OPEN", items: [] as any[] },
    { id: 2, name: "Table 2", status: "BUSY", items: [{ name: "Chicken Biryani", qty: 2, price: 180 }, { name: "Coke", qty: 2, price: 40 }] },
    { id: 3, name: "Table 3", status: "OPEN", items: [] as any[] },
    { id: 4, name: "Table 4", status: "BUSY", items: [{ name: "Paneer Butter Masala", qty: 1, price: 220 }] },
    { id: 5, name: "Table 5", status: "OPEN", items: [] as any[] },
    { id: 6, name: "Table 6", status: "OPEN", items: [] as any[] }
  ]);
  const [selectedTable, setSelectedTable] = useState<any>(null);

  // Handle Add Item Submit
  const handleAddItem = () => {
    if (!newItem.name.trim() || !newItem.price.trim()) {
      alert("Please fill in the item name and price.");
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
      description: newItem.description.trim() || "Delicious freshly prepared dish"
    };

    setMenuItems(prev => [...prev, createdItem]);
    setNewItem({ name: "", price: "", category: "Main Course", description: "" });
    
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setAddItemSuccess(true);
    setTimeout(() => {
      setAddItemSuccess(false);
      setShowAddModal(false);
    }, 1500);
  };

  // Add item quantity in billing
  const updateQty = (id: string, delta: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setQuantities(prev => {
      const current = prev[id] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [id]: next };
    });
  };

  // Reset Demo to default
  const handleResetDemo = () => {
    setMenuItems(DEFAULT_MENU_ITEMS);
    setQuantities({ "demo-1": 2, "demo-2": 1, "demo-7": 2 });
    setTables([
      { id: 1, name: "Table 1", status: "OPEN", items: [] },
      { id: 2, name: "Table 2", status: "BUSY", items: [{ name: "Chicken Biryani", qty: 2, price: 180 }, { name: "Coke", qty: 2, price: 40 }] },
      { id: 3, name: "Table 3", status: "OPEN", items: [] },
      { id: 4, name: "Table 4", status: "BUSY", items: [{ name: "Paneer Butter Masala", qty: 1, price: 220 }] },
      { id: 5, name: "Table 5", status: "OPEN", items: [] },
      { id: 6, name: "Table 6", status: "OPEN", items: [] }
    ]);
    setSelectedTable(null);
    alert("Demo reset to default state.");
  };

  // Settle table optimistically
  const handleSettleTable = (tableId: number) => {
    setTables(prev => prev.map(t => t.id === tableId ? { ...t, status: "OPEN", items: [] } : t));
    setSelectedTable(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    alert("Table settled and marked as open.");
  };

  // Trigger conversion lock popup
  const openLockModal = (name: string) => {
    setLockedFeatureName(name);
    setShowLockModal(true);
  };

  // Calculations
  const selectedItems = menuItems.map(item => ({
    ...item,
    qty: quantities[item.id] || 0,
  })).filter(i => i.qty > 0);

  const subtotal = selectedItems.reduce((sum, i) => sum + (i.price * i.qty), 0);
  const tax = Math.round(subtotal * 0.05 * 100) / 100; // 5% GST
  const total = subtotal + tax;
  const totalQty = selectedItems.reduce((sum, i) => sum + i.qty, 0);

  // Filter menu items
  const filteredMenuItems = menuItems.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "All" || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = ["All", "Starters", "Main Course", "Biryani", "Beverages", "Desserts"];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: "#0E0F14" }]}>
      <StatusBar barStyle="light-content" backgroundColor="#0E0F14" />
      <View style={[styles.wrap, { paddingTop: insets.top, backgroundColor: "#0E0F14" }]}>
        
        {/* Header Bar */}
        <View style={styles.headerBar}>
          <View style={styles.logoRow}>
            <View style={styles.logoBox}>
              <Ionicons name="restaurant" size={20} color="#FFFFFF" />
            </View>
            <Text style={styles.logoText}>EzBill</Text>
          </View>
          
          <View style={styles.headerActions}>
            <Pressable onPress={handleResetDemo} style={styles.resetBtn}>
              <Ionicons name="refresh-outline" size={16} color="#8A8A93" />
              <Text style={styles.resetText}>Reset</Text>
            </Pressable>
            {user ? (
              <Pressable
                style={styles.loginLink}
                onPress={async () => {
                  await logout();
                  router.replace("/");
                }}
              >
                <Text style={styles.loginLinkText}>Log Out</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.loginLink} onPress={() => router.push("/login")}>
                <Text style={styles.loginLinkText}>Login</Text>
              </Pressable>
            )}
             <Pressable style={styles.startFreeBtn} onPress={() => router.push("/register")}>
              <Text style={styles.startFreeText}>Get Started</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false} bounces={false}>
          
          {/* Hero Section */}
          <View style={styles.heroSection}>
            <Text style={styles.heroHeadline}>Your Restaurant.{"\n"}One Simple Billing System.</Text>
            <Text style={styles.heroSubtext}>
              Manage tables, orders, menus, billing, and sales analytics from one fast, high-performance restaurant control panel.
            </Text>
            <View style={styles.heroButtons}>
              <Pressable style={styles.heroPrimaryBtn} onPress={() => router.push("/register")}>
                <Text style={styles.heroPrimaryText}>Subscribe Now</Text>
              </Pressable>
            </View>
          </View>

          {/* Interactive Demo Interface */}
          <View style={styles.demoAreaCard}>
            <View style={styles.demoCardHeader}>
              <Text style={styles.demoCardLabel}>INTERACTIVE PRODUCT PLAYGROUND</Text>
              <Text style={styles.demoCardTitle}>Try EZBill Right Now</Text>
            </View>

            {/* Tabs Row */}
            <View style={styles.tabsRow}>
              {[
                { id: "dashboard", label: "Dashboard", icon: "stats-chart" },
                { id: "menu", label: "Menu", icon: "restaurant" },
                { id: "billing", label: "Billing", icon: "card" },
                { id: "tables", label: "Tables", icon: "grid" },
                { id: "analytics", label: "Analytics", icon: "pie-chart" }
              ].map(tab => (
                <Pressable
                  key={tab.id}
                  onPress={() => setCurrentTab(tab.id as any)}
                  style={[
                    styles.tabItem,
                    currentTab === tab.id && styles.activeTabItem
                  ]}
                >
                  <Ionicons name={tab.icon as any} size={15} color={currentTab === tab.id ? "#FFFFFF" : "#8A8A93"} />
                  {width > 600 && (
                    <Text style={[styles.tabLabel, { color: currentTab === tab.id ? "#FFFFFF" : "#8A8A93" }]}>
                      {tab.label}
                    </Text>
                  )}
                </Pressable>
              ))}
            </View>

            {/* TAB CONTENTS */}
            
            {/* 1. Dashboard Tab */}
            {currentTab === "dashboard" && (
              <View style={styles.tabContent}>
                
                {/* Main Indigo Gradient Metrics Card (Matching screenshot exactly) */}
                <LinearGradient
                  colors={["#635BFF", "#4F46E5"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.mainMetricsCard}
                >
                  <View style={styles.liveBadgeRow}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveText}>LIVE SALES TODAY</Text>
                  </View>
                  <Text style={styles.mainSalesVal}>₹24,580</Text>
                  
                  <View style={styles.cardDivider} />
                  
                  <View style={styles.metricsFooterRow}>
                    <View style={styles.footerItem}>
                      <Text style={styles.footerVal}>42</Text>
                      <Text style={styles.footerLbl}>Total Orders</Text>
                    </View>
                    <View style={styles.footerColDivider} />
                    <View style={styles.footerItem}>
                      <Text style={styles.footerVal}>₹585</Text>
                      <Text style={styles.footerLbl}>Average ticket</Text>
                    </View>
                    <View style={styles.footerColDivider} />
                    <View style={styles.footerItem}>
                      <Text style={styles.footerVal}>₹0</Text>
                      <Text style={styles.footerLbl}>Web payments</Text>
                    </View>
                  </View>
                </LinearGradient>

                {/* Sub Stats Cards Grid (Matching Pending, Cooking, Ready, Tables Free in screenshot) */}
                <View style={styles.subStatsGrid}>
                  <View style={styles.subStatBox}>
                    <View style={[styles.iconBadge, { backgroundColor: "rgba(245, 158, 11, 0.15)" }]}>
                      <Ionicons name="time" size={16} color="#F59E0B" />
                    </View>
                    <Text style={styles.subStatValue}>23</Text>
                    <Text style={styles.subStatLabel}>Pending</Text>
                  </View>

                  <View style={styles.subStatBox}>
                    <View style={[styles.iconBadge, { backgroundColor: "rgba(139, 92, 246, 0.15)" }]}>
                      <Ionicons name="flame" size={16} color="#8B5CF6" />
                    </View>
                    <Text style={styles.subStatValue}>1</Text>
                    <Text style={styles.subStatLabel}>Cooking</Text>
                  </View>

                  <View style={styles.subStatBox}>
                    <View style={[styles.iconBadge, { backgroundColor: "rgba(16, 185, 129, 0.15)" }]}>
                      <Ionicons name="checkmark-done" size={16} color="#10B981" />
                    </View>
                    <Text style={styles.subStatValue}>0</Text>
                    <Text style={styles.subStatLabel}>Ready</Text>
                  </View>

                  <View style={styles.subStatBox}>
                    <View style={[styles.iconBadge, { backgroundColor: "rgba(59, 130, 246, 0.15)" }]}>
                      <Ionicons name="grid" size={16} color="#3B82F6" />
                    </View>
                    <Text style={styles.subStatValue}>3</Text>
                    <Text style={styles.subStatLabel}>Tables Free</Text>
                  </View>
                </View>

                {/* Dashboard Locked Features Grid */}
                <Text style={styles.sectionTitle}>SIMULATED ERP UTILITIES</Text>
                <View style={styles.demoButtonsRow}>
                  <Pressable style={styles.demoActionBtn} onPress={() => openLockModal("KDS Kitchen screen")}>
                    <Ionicons name="desktop-outline" size={18} color="#635BFF" style={{ marginRight: 8 }} />
                    <Text style={styles.demoActionBtnText}>Launch Kitchen KDS</Text>
                    <Ionicons name="lock-closed" size={14} color="#8A8A93" style={{ marginLeft: 8 }} />
                  </Pressable>

                  <Pressable style={styles.demoActionBtn} onPress={() => openLockModal("Waiter QR ordering")}>
                    <Ionicons name="qr-code-outline" size={18} color="#635BFF" style={{ marginRight: 8 }} />
                    <Text style={styles.demoActionBtnText}>Scan Waiter QR</Text>
                    <Ionicons name="lock-closed" size={14} color="#8A8A93" style={{ marginLeft: 8 }} />
                  </Pressable>
                </View>
              </View>
            )}

            {/* 2. Menu Tab */}
            {currentTab === "menu" && (
              <View style={styles.tabContent}>
                {/* Search & Add row */}
                <View style={styles.menuActionsRow}>
                  <View style={styles.searchContainer}>
                    <Ionicons name="search-outline" size={18} color="#8A8A93" style={{ marginRight: 8 }} />
                    <TextInput
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      placeholder="Search dish name..."
                      placeholderTextColor="#64748B"
                      style={styles.searchInput}
                    />
                  </View>
                  <Pressable style={styles.addMenuBtn} onPress={() => setShowAddModal(true)}>
                    <Ionicons name="add" size={18} color="#FFFFFF" style={{ marginRight: 4 }} />
                    <Text style={styles.addMenuText}>Add Item</Text>
                  </Pressable>
                </View>

                {/* Categories Row */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoriesScroll}>
                  {categories.map(cat => (
                    <Pressable
                      key={cat}
                      onPress={() => setSelectedCategory(cat)}
                      style={[
                        styles.categoryPill,
                        selectedCategory === cat && styles.activeCategoryPill
                      ]}
                    >
                      <Text style={[styles.categoryPillText, { color: selectedCategory === cat ? "#FFFFFF" : "#8A8A93" }]}>
                        {cat}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                {/* Items List */}
                <View style={styles.menuItemsList}>
                  {filteredMenuItems.map(item => {
                    const qty = quantities[item.id] || 0;
                    return (
                      <View key={item.id} style={styles.menuItemCard}>
                        <View style={{ flex: 1 }}>
                          <View style={styles.itemTitleRow}>
                            <View style={[styles.vegIndicator, { backgroundColor: item.category === "Biryani" || item.name.toLowerCase().includes("chicken") ? "#EF4444" : "#10B981" }]} />
                            <Text style={styles.menuItemName}>{item.name}</Text>
                          </View>
                          <Text style={styles.menuItemPrice}>₹{item.price}</Text>
                          <Text style={styles.menuItemDesc} numberOfLines={2}>{item.description}</Text>
                        </View>

                        {/* Quantity Counter */}
                        <View style={styles.quantityContainer}>
                          {qty > 0 ? (
                            <View style={styles.counterRow}>
                              <Pressable onPress={() => updateQty(item.id, -1)} style={styles.quantityBtn}>
                                <Ionicons name="remove" size={14} color="#635BFF" />
                              </Pressable>
                              <Text style={styles.qtyText}>{qty}</Text>
                              <Pressable onPress={() => updateQty(item.id, 1)} style={styles.quantityBtn}>
                                <Ionicons name="add" size={14} color="#635BFF" />
                              </Pressable>
                            </View>
                          ) : (
                            <Pressable onPress={() => updateQty(item.id, 1)} style={styles.addButton}>
                              <Text style={styles.addButtonText}>ADD</Text>
                            </Pressable>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* 3. Billing Tab */}
            {currentTab === "billing" && (
              <View style={styles.tabContent}>
                {selectedItems.length === 0 ? (
                  <View style={styles.emptyCartContainer}>
                    <Ionicons name="cart-outline" size={48} color="#64748B" />
                    <Text style={styles.emptyCartText}>No items selected in menu</Text>
                    <Pressable style={styles.goToMenuBtn} onPress={() => setCurrentTab("menu")}>
                      <Text style={styles.goToMenuBtnText}>Browse Menu & Add Items</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.billingWrapper}>
                    <Text style={styles.sectionTitle}>SAMPLE ORDER DETAILS</Text>
                    <View style={styles.billItemsList}>
                      {selectedItems.map(item => (
                        <View key={item.id} style={styles.billItemRow}>
                          <Text style={styles.billItemName}>{item.name} × {item.qty}</Text>
                          <Text style={styles.billItemPrice}>₹{item.qty * item.price}</Text>
                        </View>
                      ))}
                    </View>

                    <View style={styles.receiptDivider} />

                    <View style={styles.calculationRow}>
                      <Text style={styles.calcLabel}>Subtotal</Text>
                      <Text style={styles.calcValue}>₹{subtotal}</Text>
                    </View>
                    <View style={styles.calculationRow}>
                      <Text style={styles.calcLabel}>Tax (5% GST)</Text>
                      <Text style={styles.calcValue}>₹{tax}</Text>
                    </View>
                    
                    <View style={styles.receiptDivider} />

                    <View style={styles.calculationRow}>
                      <Text style={styles.totalLabel}>TOTAL</Text>
                      <Text style={styles.totalValue}>₹{total}</Text>
                    </View>

                    <Pressable style={styles.generateBillBtn} onPress={() => setShowReceiptModal(true)}>
                      <Ionicons name="receipt-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                      <Text style={styles.generateBillBtnText}>Generate Receipt Preview</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            )}

            {/* 4. Tables Tab */}
            {currentTab === "tables" && (
              <View style={styles.tabContent}>
                <Text style={styles.sectionTitle}>INTERACTIVE RESTAURANT GRID</Text>
                
                <View style={styles.tablesGrid}>
                  {tables.map(table => (
                    <Pressable
                      key={table.id}
                      onPress={() => setSelectedTable(table)}
                      style={[
                        styles.tableCard,
                        table.status === "BUSY" ? styles.tableBusy : styles.tableOpen
                      ]}
                    >
                      <Text style={styles.tableName}>{table.name}</Text>
                      <Text style={[styles.tableStatusText, { color: table.status === "BUSY" ? "#EF4444" : "#10B981" }]}>
                        {table.status}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {/* Selected Table details */}
                {selectedTable && (
                  <View style={styles.selectedTableCard}>
                    <View style={styles.selectedTableHeader}>
                      <Text style={styles.selectedTableTitle}>{selectedTable.name} Details</Text>
                      <Pressable onPress={() => setSelectedTable(null)}>
                        <Ionicons name="close" size={20} color="#8A8A93" />
                      </Pressable>
                    </View>

                    {selectedTable.items.length === 0 ? (
                      <View style={{ paddingVertical: 12 }}>
                        <Text style={{ color: "#8A8A93", fontSize: 14 }}>Table is empty.</Text>
                      </View>
                    ) : (
                      <>
                        <View style={{ gap: 8, marginVertical: 12 }}>
                          {selectedTable.items.map((it: any, idx: number) => (
                            <View key={idx} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                              <Text style={{ color: "#FFFFFF", fontSize: 14 }}>{it.qty}× {it.name}</Text>
                              <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "700" }}>₹{it.qty * it.price}</Text>
                            </View>
                          ))}
                        </View>
                        <Pressable style={styles.settleTableBtn} onPress={() => handleSettleTable(selectedTable.id)}>
                          <Text style={styles.settleTableBtnText}>Clear Table & Settle Bill</Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* 5. Analytics Tab */}
            {currentTab === "analytics" && (
              <View style={styles.tabContent}>
                <Text style={styles.sectionTitle}>TODAY'S SALES DURATION ANALYSIS</Text>

                <View style={styles.chartContainer}>
                  <View style={styles.chartRow}>
                    <View style={styles.chartYAxis}>
                      <Text style={styles.axisText}>₹10k</Text>
                      <Text style={styles.axisText}>₹5k</Text>
                      <Text style={styles.axisText}>₹0</Text>
                    </View>
                    
                    <View style={styles.chartBars}>
                      {[
                        { label: "12 PM", val: 50 },
                        { label: "3 PM", val: 30 },
                        { label: "6 PM", val: 75 },
                        { label: "9 PM", val: 95 }
                      ].map((bar, idx) => (
                        <View key={idx} style={styles.barCol}>
                          <View style={styles.barTrack}>
                            <View style={[styles.barFill, { height: `${bar.val}%` }]} />
                          </View>
                          <Text style={styles.barLabel}>{bar.label}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </View>

                {/* Stats list */}
                <View style={{ gap: 12, marginTop: 24 }}>
                  <View style={styles.analyticsRow}>
                    <Text style={styles.analyticsLabel}>Average Order value</Text>
                    <Text style={styles.analyticsVal}>₹585</Text>
                  </View>
                  <View style={styles.analyticsRow}>
                    <Text style={styles.analyticsLabel}>Top Selling Dish</Text>
                    <Text style={[styles.analyticsVal, { color: "#635BFF" }]}>Chicken Biryani</Text>
                  </View>
                </View>
              </View>
            )}

          </View>

          {/* Sticky/Middle Upgrade conversion Banner */}
          <View style={styles.conversionBannerCard}>
            <Ionicons name="sparkles" size={24} color="#635BFF" style={{ marginBottom: 12 }} />
            <Text style={styles.convTitle}>Run Your Real Restaurant with EZBill</Text>
            <Text style={styles.convDescription}>
              Unlock real printer printing, QR table menu ordering, waiter instant syncing, and staff shift tracking.
            </Text>
            <Pressable style={styles.convCtaBtn} onPress={() => router.push("/register")}>
              <Text style={styles.convCtaText}>Subscribe to EZBill</Text>
            </Pressable>
          </View>

        </ScrollView>

        {/* Modal: Add Menu Item Form */}
        <Modal visible={showAddModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Add Custom Item</Text>
                <Pressable onPress={() => setShowAddModal(false)} hitSlop={10}>
                  <Ionicons name="close" size={22} color="#8A8A93" />
                </Pressable>
              </View>

              {addItemSuccess ? (
                <View style={styles.successFormContainer}>
                  <Ionicons name="checkmark-circle" size={48} color="#10B981" />
                  <Text style={styles.successFormText}>✓ Item added successfully!</Text>
                </View>
              ) : (
                <View style={styles.formContainer}>
                  <View style={styles.field}>
                    <Text style={styles.label}>Item Name *</Text>
                    <TextInput
                      value={newItem.name}
                      onChangeText={t => setNewItem({ ...newItem, name: t })}
                      placeholder="e.g. Garlic Naan"
                      placeholderTextColor="#64748B"
                      style={styles.formInput}
                    />
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.label}>Price (₹) *</Text>
                    <TextInput
                      value={newItem.price}
                      onChangeText={t => setNewItem({ ...newItem, price: t })}
                      placeholder="e.g. 80"
                      placeholderTextColor="#64748B"
                      keyboardType="number-pad"
                      style={styles.formInput}
                    />
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.label}>Category</Text>
                    <View style={styles.categoryPickerRow}>
                      {["Starters", "Main Course", "Beverages", "Desserts"].map(c => (
                        <Pressable
                          key={c}
                          onPress={() => setNewItem({ ...newItem, category: c })}
                          style={[
                            styles.categoryFormPill,
                            newItem.category === c && styles.categoryFormPillActive
                          ]}
                        >
                          <Text style={{ color: newItem.category === c ? "#FFFFFF" : "#8A8A93", fontSize: 12 }}>
                            {c}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.label}>Description</Text>
                    <TextInput
                      value={newItem.description}
                      onChangeText={t => setNewItem({ ...newItem, description: t })}
                      placeholder="e.g. Soft buttered Indian bread"
                      placeholderTextColor="#64748B"
                      style={styles.formInput}
                    />
                  </View>

                  <Pressable style={styles.formSubmitBtn} onPress={handleAddItem}>
                    <Text style={styles.formSubmitBtnText}>Add Item to Demo Menu</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        </Modal>

        {/* Modal: Conversion Lock popup */}
        <Modal visible={showLockModal} transparent animationType="fade">
          <Pressable style={styles.modalOverlay} onPress={() => setShowLockModal(false)}>
            <View style={styles.lockContentCard}>
              <Ionicons name="lock-closed" size={44} color="#635BFF" style={{ marginBottom: 16 }} />
              <Text style={styles.lockTitle}>🔒 Available with EZBill</Text>
              <Text style={styles.lockDescription}>
                The feature "{lockedFeatureName}" requires a registered business account to connect your kitchen, waiters, and actual hardware.
              </Text>
              <Pressable
                style={styles.lockSubmitBtn}
                onPress={() => {
                  setShowLockModal(false);
                  router.push("/register");
                }}
              >
                <Text style={styles.lockSubmitBtnText}>Subscribe Now</Text>
              </Pressable>
              <Pressable style={styles.lockCloseBtn} onPress={() => setShowLockModal(false)}>
                <Text style={styles.lockCloseBtnText}>Go back to Demo</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>

        {/* Modal: Receipt Preview printout */}
        <Modal visible={showReceiptModal} transparent animationType="slide">
          <Pressable style={styles.modalOverlay} onPress={() => setShowReceiptModal(false)}>
            <View style={styles.receiptCard}>
              <View style={styles.receiptHeaderRow}>
                <Text style={styles.receiptModalTitle}>EZBill Receipt Preview</Text>
                <Pressable onPress={() => setShowReceiptModal(false)}>
                  <Ionicons name="close" size={24} color="#0E0F14" />
                </Pressable>
              </View>

              {/* Printed invoice template layout */}
              <ScrollView style={styles.receiptPaper} showsVerticalScrollIndicator={false}>
                <Text style={styles.receiptShopName}>EZBILL RESTAURANT DEMO</Text>
                <Text style={styles.receiptShopSub}>Table Order Receipt</Text>
                
                <View style={styles.receiptLineDash} />

                {selectedItems.map((item, idx) => (
                  <View key={idx} style={styles.receiptRow}>
                    <Text style={styles.receiptItemCol}>{item.name}</Text>
                    <Text style={styles.receiptQtyCol}>{item.qty}</Text>
                    <Text style={styles.receiptPriceCol}>₹{item.qty * item.price}</Text>
                  </View>
                ))}

                <View style={styles.receiptLineDash} />

                <View style={styles.receiptRow}>
                  <Text style={styles.receiptItemColBold}>Subtotal</Text>
                  <Text style={styles.receiptPriceCol}>₹{subtotal}</Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptItemColBold}>Tax (5% GST)</Text>
                  <Text style={styles.receiptPriceCol}>₹{tax}</Text>
                </View>

                <View style={styles.receiptLineDash} />

                <View style={styles.receiptRow}>
                  <Text style={styles.receiptItemColBig}>TOTAL</Text>
                  <Text style={styles.receiptPriceColBig}>₹{total}</Text>
                </View>

                <View style={styles.receiptLineDash} />
                
                <Text style={styles.receiptFooterMsg}>Thank You!</Text>
                <Text style={styles.receiptFooterSub}>This is a generated sample receipt.</Text>
              </ScrollView>

              <Pressable
                style={styles.receiptCtaBtn}
                onPress={() => {
                  setShowReceiptModal(false);
                  router.push("/register");
                }}
              >
                <Text style={styles.receiptCtaText}>Unlock Real Printer Connection</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0E0F14" },
  wrap: { flex: 1, backgroundColor: "#0E0F14" },
  scrollContainer: {
    paddingHorizontal: 20,
    paddingBottom: 48,
  },
  
  // Header bar
  headerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    height: 64,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#222431",
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  logoBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#635BFF",
    justifyContent: "center",
    alignItems: "center",
  },
  logoText: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900",
    marginLeft: 10,
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  resetBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  resetText: {
    color: "#8A8A93",
    fontSize: 13,
    fontWeight: "600",
  },
  loginLink: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  loginLinkText: {
    color: "#8A8A93",
    fontSize: 14,
    fontWeight: "700",
  },
  startFreeBtn: {
    backgroundColor: "#635BFF",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  startFreeText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },

  // Hero Section
  heroSection: {
    alignItems: "center",
    marginVertical: 40,
    paddingHorizontal: 10,
  },
  heroHeadline: {
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "900",
    textAlign: "center",
    lineHeight: 40,
    letterSpacing: -0.5,
    marginBottom: 16,
  },
  heroSubtext: {
    color: "#8A8A93",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 24,
    maxWidth: 500,
  },
  heroButtons: {
    alignItems: "center",
    width: "100%",
  },
  heroPrimaryBtn: {
    width: "100%",
    maxWidth: 260,
    height: 52,
    backgroundColor: "#635BFF",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#635BFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 3,
  },
  heroPrimaryText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  noCardLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
  },
  noCardLabel: {
    color: "#8A8A93",
    fontSize: 12,
    fontWeight: "600",
  },

  // Interactive Demo card
  demoAreaCard: {
    width: "100%",
    backgroundColor: "#161722",
    borderColor: "#252736",
    borderWidth: 1.5,
    borderRadius: 24,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 30,
    shadowOpacity: 0.2,
    marginBottom: 24,
  },
  demoCardHeader: {
    alignItems: "center",
    marginBottom: 24,
  },
  demoCardLabel: {
    color: "#635BFF",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  demoCardTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
    marginTop: 6,
  },
  tabsRow: {
    flexDirection: "row",
    backgroundColor: "#0E0F14",
    borderRadius: 14,
    padding: 4,
    marginBottom: 24,
  },
  tabItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  activeTabItem: {
    backgroundColor: "#161722",
    borderColor: "#252736",
    borderWidth: 1,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: "700",
  },

  // Tab contents
  tabContent: {
    width: "100%",
  },
  sectionTitle: {
    color: "#8A8A93",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.0,
    marginBottom: 16,
  },
  
  // Dashboard stats
  mainMetricsCard: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
  },
  liveBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#10B981",
  },
  liveText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  mainSalesVal: {
    color: "#FFFFFF",
    fontSize: 36,
    fontWeight: "900",
    marginVertical: 12,
  },
  cardDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    marginVertical: 12,
  },
  metricsFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerItem: {
    flex: 1,
    alignItems: "center",
  },
  footerVal: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  footerLbl: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
  footerColDivider: {
    width: 1,
    height: 24,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
  },
  subStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 24,
  },
  subStatBox: {
    width: "48%",
    backgroundColor: "#0E0F14",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    borderColor: "#222431",
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  subStatValue: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
  },
  subStatLabel: {
    color: "#8A8A93",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  demoButtonsRow: {
    gap: 12,
  },
  demoActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0E0F14",
    height: 52,
    borderRadius: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "rgba(99, 91, 255, 0.2)",
  },
  demoActionBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
  },

  // Menu tab styles
  menuActionsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  searchContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0E0F14",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
  },
  searchInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
  },
  addMenuBtn: {
    backgroundColor: "#635BFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 12,
    height: 48,
  },
  addMenuText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  categoriesScroll: {
    gap: 8,
    marginBottom: 20,
    paddingVertical: 4,
  },
  categoryPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#0E0F14",
    borderWidth: 1,
    borderColor: "#222431",
  },
  activeCategoryPill: {
    backgroundColor: "#635BFF",
  },
  categoryPillText: {
    fontSize: 13,
    fontWeight: "700",
  },
  menuItemsList: {
    gap: 12,
  },
  menuItemCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0E0F14",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#222431",
  },
  itemTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  vegIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  menuItemName: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  menuItemPrice: {
    color: "#635BFF",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 4,
  },
  menuItemDesc: {
    color: "#8A8A93",
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  quantityContainer: {
    marginLeft: 16,
  },
  addButton: {
    width: 68,
    height: 32,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#635BFF",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  addButtonText: {
    color: "#635BFF",
    fontSize: 12,
    fontWeight: "800",
  },
  counterRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#161722",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(99, 91, 255, 0.3)",
    height: 32,
  },
  quantityBtn: {
    width: 24,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  qtyText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
    paddingHorizontal: 6,
  },

  // Billing Tab
  emptyCartContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  emptyCartText: {
    color: "#8A8A93",
    fontSize: 15,
    fontWeight: "600",
    marginTop: 12,
    marginBottom: 20,
  },
  goToMenuBtn: {
    backgroundColor: "rgba(99, 91, 255, 0.15)",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  goToMenuBtnText: {
    color: "#635BFF",
    fontSize: 14,
    fontWeight: "700",
  },
  billingWrapper: {
    backgroundColor: "#0E0F14",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#222431",
  },
  billItemsList: {
    gap: 12,
    marginVertical: 12,
  },
  billItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  billItemName: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  billItemPrice: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  receiptDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    marginVertical: 16,
  },
  calculationRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  calcLabel: {
    color: "#8A8A93",
    fontSize: 14,
    fontWeight: "500",
  },
  calcValue: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  totalLabel: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  totalValue: {
    color: "#635BFF",
    fontSize: 20,
    fontWeight: "900",
  },
  generateBillBtn: {
    height: 52,
    backgroundColor: "#635BFF",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  generateBillBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 15,
  },

  // Tables Grid styles
  tablesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 20,
  },
  tableCard: {
    width: "30%",
    height: 70,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  tableOpen: {
    backgroundColor: "rgba(16, 185, 129, 0.08)",
    borderColor: "rgba(16, 185, 129, 0.2)",
  },
  tableBusy: {
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderColor: "rgba(239, 68, 68, 0.2)",
  },
  tableName: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  tableStatusText: {
    fontSize: 10,
    fontWeight: "800",
  },
  selectedTableCard: {
    backgroundColor: "#0E0F14",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#222431",
  },
  selectedTableHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    paddingBottom: 10,
    marginBottom: 10,
  },
  selectedTableTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  settleTableBtn: {
    height: 44,
    backgroundColor: "#10B981",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  settleTableBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },

  // Analytics Tab Styles
  chartContainer: {
    backgroundColor: "#0E0F14",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#222431",
  },
  chartRow: {
    flexDirection: "row",
    height: 150,
  },
  chartYAxis: {
    justifyContent: "space-between",
    alignItems: "flex-end",
    width: 36,
    paddingRight: 10,
    height: "100%",
  },
  axisText: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "600",
  },
  chartBars: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "flex-end",
    height: "100%",
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255, 255, 255, 0.08)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    paddingBottom: 4,
  },
  barCol: {
    alignItems: "center",
    width: "20%",
  },
  barTrack: {
    width: 14,
    height: 110,
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderRadius: 6,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  barFill: {
    backgroundColor: "#635BFF",
    width: "100%",
    borderRadius: 6,
  },
  barLabel: {
    color: "#8A8A93",
    fontSize: 10,
    fontWeight: "600",
    marginTop: 6,
  },
  analyticsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#0E0F14",
    padding: 16,
    borderRadius: 12,
  },
  analyticsLabel: {
    color: "#8A8A93",
    fontSize: 14,
    fontWeight: "600",
  },
  analyticsVal: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },

  // Conversion card
  conversionBannerCard: {
    backgroundColor: "rgba(99, 91, 255, 0.08)",
    borderColor: "rgba(99, 91, 255, 0.15)",
    borderWidth: 1.5,
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    marginBottom: 40,
  },
  convTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  convDescription: {
    color: "#8A8A93",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  convCtaBtn: {
    backgroundColor: "#635BFF",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  convCtaText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },

  // Modals Overlay & Common Card Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#161722",
    borderColor: "#252736",
    borderWidth: 1.5,
    borderRadius: 24,
    padding: 24,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    paddingBottom: 12,
    marginBottom: 16,
  },
  modalTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },
  formContainer: {
    gap: 16,
  },
  formInput: {
    backgroundColor: "#0E0F14",
    borderRadius: 10,
    height: 48,
    paddingHorizontal: 12,
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
    borderWidth: 1,
    borderColor: "#222431",
  },
  categoryPickerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  categoryFormPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "#0E0F14",
    borderWidth: 1,
    borderColor: "#222431",
  },
  categoryFormPillActive: {
    backgroundColor: "#635BFF",
    borderColor: "#635BFF",
  },
  formSubmitBtn: {
    height: 48,
    backgroundColor: "#635BFF",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  formSubmitBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  successFormContainer: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 16,
  },
  successFormText: {
    color: "#10B981",
    fontSize: 15,
    fontWeight: "700",
  },

  // Lock Modal
  lockContentCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#161722",
    borderColor: "#252736",
    borderWidth: 1.5,
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
  },
  lockTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 8,
  },
  lockDescription: {
    color: "#8A8A93",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    marginBottom: 24,
  },
  lockSubmitBtn: {
    width: "100%",
    height: 48,
    backgroundColor: "#635BFF",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  lockSubmitBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  lockCloseBtn: {
    paddingVertical: 8,
  },
  lockCloseBtnText: {
    color: "#8A8A93",
    fontSize: 13,
    fontWeight: "600",
  },

  // Receipt Modal
  receiptCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
    shadowOpacity: 0.3,
  },
  receiptHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  receiptModalTitle: {
    color: "#0E0E12",
    fontSize: 16,
    fontWeight: "800",
  },
  receiptPaper: {
    maxHeight: 320,
    paddingHorizontal: 8,
  },
  receiptShopName: {
    color: "#0E0E12",
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
  },
  receiptShopSub: {
    color: "#475569",
    fontSize: 12,
    textAlign: "center",
    marginTop: 2,
    fontWeight: "600",
  },
  receiptLineDash: {
    height: 1,
    borderWidth: 1,
    borderColor: "#0E0E12",
    borderStyle: "dashed",
    marginVertical: 12,
  },
  receiptRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  receiptItemCol: {
    color: "#0E0E12",
    fontSize: 13,
    flex: 1,
    fontWeight: "500",
  },
  receiptQtyCol: {
    color: "#0E0E12",
    fontSize: 13,
    width: 30,
    textAlign: "center",
    fontWeight: "500",
  },
  receiptPriceCol: {
    color: "#0E0E12",
    fontSize: 13,
    width: 60,
    textAlign: "right",
    fontWeight: "600",
  },
  receiptItemColBold: {
    color: "#0E0E12",
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
  },
  receiptItemColBig: {
    color: "#0E0E12",
    fontSize: 16,
    fontWeight: "900",
    flex: 1,
  },
  receiptPriceColBig: {
    color: "#0E0E12",
    fontSize: 16,
    fontWeight: "900",
    width: 80,
    textAlign: "right",
  },
  receiptFooterMsg: {
    color: "#0E0E12",
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center",
    marginTop: 16,
  },
  receiptFooterSub: {
    color: "#475569",
    fontSize: 10,
    textAlign: "center",
    marginTop: 4,
    fontWeight: "600",
  },
  receiptCtaBtn: {
    height: 48,
    backgroundColor: "#0E0F14",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  receiptCtaText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 13,
  },
  label: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
  },
  field: {
    marginBottom: 12,
  },
});
