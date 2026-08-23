import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, SafeAreaView, StatusBar, RefreshControl, Modal,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { useTheme } from "@/src/context/ThemeContext";
import { exportAnalyticsPDF, exportAnalyticsExcel, exportAnalyticsDocx } from "@/src/lib/exportAnalytics";
import { spacing, radius } from "@/src/theme";

export default function Analytics() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme, isDark } = useTheme();

  const [period, setPeriod] = useState<"today" | "yesterday" | "7days" | "monthly" | "yearly" | "custom">("today");
  const [selectedCustomDate, setSelectedCustomDate] = useState<Date>(new Date());
  const [bills, setBills] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exportModal, setExportModal] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bList, oList] = await Promise.all([
        api.listBills().catch(() => []),
        api.listOrders().catch(() => []),
      ]);
      setBills(Array.isArray(bList) ? bList : []);
      setOrders(Array.isArray(oList) ? oList : []);
    } catch {
      setBills([]);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const isSameDayLocal = (date1: Date, date2: Date) => {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
  };

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const currentPeriodBills = bills.filter(b => {
    if (!b || !b.created_at) return false;
    const bDate = new Date(b.created_at);
    
    if (period === "today") return isSameDayLocal(bDate, today);
    if (period === "yesterday") return isSameDayLocal(bDate, yesterday);
    if (period === "custom") return isSameDayLocal(bDate, selectedCustomDate);
    
    const isPaid = b.status === "paid" || b.status === "PAID";
    if (!isPaid) return false;
    
    if (period === "7days") {
      const d7 = new Date(); d7.setDate(d7.getDate() - 7);
      return bDate >= d7;
    }
    if (period === "monthly") {
      const d30 = new Date(); d30.setDate(d30.getDate() - 30);
      return bDate >= d30;
    }
    return true;
  });

  const activeBills = currentPeriodBills.filter(b => b.status === "paid" || b.status === "PAID");
  const refundedBills = currentPeriodBills.filter(b => b.status === "cancelled" || b.status === "refunded");

  const grossSales = activeBills.reduce((sum, b) => sum + (Number(b.subtotal) || 0), 0);
  const totalDiscounts = activeBills.reduce((sum, b) => sum + (Number(b.discount) || 0), 0);
  const totalTaxes = activeBills.reduce((sum, b) => sum + (Number(b.cgst || 0) + Number(b.sgst || 0) || Number(b.tax) || 0), 0);
  const totalRefunds = refundedBills.reduce((sum, b) => sum + (Number(b.total) || 0), 0);
  const netSales = activeBills.reduce((sum, b) => sum + (Number(b.total) || 0), 0);
  
  const currentHeroRev = netSales;
  const totalOrders = activeBills.length;
  const avgBill = totalOrders > 0 ? Math.round(currentHeroRev / totalOrders) : 0;

  let totalItemsSold = 0;
  activeBills.forEach(b => {
    if (Array.isArray(b.items)) {
      b.items.forEach((it: any) => {
        totalItemsSold += (Number(it.quantity) || 1);
      });
    }
  });

  const paymentBreakdown = {
    CASH: activeBills.filter(b => b.payment_method === "CASH").reduce((s, b) => s + (Number(b.total) || 0), 0),
    UPI: activeBills.filter(b => b.payment_method === "UPI" || b.payment_method === "UPI_QR" || b.payment_method === "online" || !b.payment_method).reduce((s, b) => s + (Number(b.total) || 0), 0),
    CARD: activeBills.filter(b => b.payment_method === "CARD").reduce((s, b) => s + (Number(b.total) || 0), 0),
    OTHER: activeBills.filter(b => b.payment_method && b.payment_method !== "CASH" && b.payment_method !== "UPI" && b.payment_method !== "UPI_QR" && b.payment_method !== "online" && b.payment_method !== "CARD").reduce((s, b) => s + (Number(b.total) || 0), 0)
  };

  const totalPaidCount = activeBills.length || 1;
  const upiCount = activeBills.filter(b => b.payment_method === "UPI" || b.payment_method === "UPI_QR" || b.payment_method === "online" || !b.payment_method).length;
  const cashCount = activeBills.filter(b => b.payment_method === "CASH").length;
  const upiPct = Math.round((upiCount / totalPaidCount) * 100);
  const cashPct = Math.round((cashCount / totalPaidCount) * 100);

  const isSingleDay = ["today", "yesterday", "custom"].includes(period);
  
  const chartData = isSingleDay
    ? Array.from({ length: 24 }, (_, hour) => {
        const hourlyBills = activeBills.filter(b => new Date(b.created_at).getHours() === hour);
        const rev = hourlyBills.reduce((sum, b) => sum + (Number(b.total) || 0), 0);
        const label = hour === 0 ? "12a" : hour === 12 ? "12p" : hour > 12 ? `${hour - 12}p` : `${hour}a`;
        return { label, val: rev };
      }).filter(h => h.val > 0)
    : period === "7days"
    ? [6, 5, 4, 3, 2, 1, 0].map(daysAgo => {
        const d = new Date(); d.setDate(d.getDate() - daysAgo);
        const dateStr = d.toISOString().slice(0, 10);
        const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
        const dayRev = bills
          .filter(b => b && b.created_at && (b.status === "paid" || b.status === "PAID") && String(b.created_at).slice(0, 10) === dateStr)
          .reduce((sum, b) => sum + (Number(b.total) || 0), 0);
        return { label: dayName, val: dayRev };
      })
    : period === "monthly"
    ? [3, 2, 1, 0].map(weeksAgo => {
        const start = new Date(); start.setDate(start.getDate() - (weeksAgo + 1) * 7);
        const end = new Date(); end.setDate(end.getDate() - weeksAgo * 7);
        const weekRev = bills
          .filter(b => {
            if (!b?.created_at || (b.status !== "paid" && b.status !== "PAID")) return false;
            const bd = new Date(b.created_at);
            return bd >= start && bd <= end;
          })
          .reduce((sum, b) => sum + (Number(b.total) || 0), 0);
        return { label: `W${4 - weeksAgo}`, val: weekRev };
      })
    : [
        { label: "Q1", val: bills.filter(b => (b?.status === "paid" || b?.status === "PAID") && b?.created_at && new Date(b.created_at).getMonth() <= 2).reduce((s, b) => s + (Number(b.total) || 0), 0) },
        { label: "Q2", val: bills.filter(b => (b?.status === "paid" || b?.status === "PAID") && b?.created_at && new Date(b.created_at).getMonth() >= 3 && new Date(b.created_at).getMonth() <= 5).reduce((s, b) => s + (Number(b.total) || 0), 0) },
        { label: "Q3", val: bills.filter(b => (b?.status === "paid" || b?.status === "PAID") && b?.created_at && new Date(b.created_at).getMonth() >= 6 && new Date(b.created_at).getMonth() <= 8).reduce((s, b) => s + (Number(b.total) || 0), 0) },
        { label: "Q4", val: bills.filter(b => (b?.status === "paid" || b?.status === "PAID") && b?.created_at && new Date(b.created_at).getMonth() >= 9).reduce((s, b) => s + (Number(b.total) || 0), 0) },
      ];

  const maxVal = Math.max(...chartData.map(d => d.val), 100);

  const itemStats: Record<string, { name: string; sold: number; amt: number }> = {};
  activeBills.forEach(bill => {
    if (bill && Array.isArray(bill.items)) {
      bill.items.forEach((it: any) => {
        if (!it) return;
        const name = it.name || "Item";
        const qty = Number(it.quantity) || 1;
        const price = Number(it.price) || 0;
        if (!itemStats[name]) {
          itemStats[name] = { name, sold: 0, amt: 0 };
        }
        itemStats[name].sold += qty;
        itemStats[name].amt += price * qty;
      });
    }
  });

  const realTopDishes = Object.values(itemStats)
    .sort((a, b) => b.sold - a.sold)
    .slice(0, 5);

  const maxDishAmt = realTopDishes.length > 0 ? realTopDishes[0].amt : 1;

  const handleBack = () => {
    router.replace("/(app)/more");
  };

  const handleExport = async (format: "pdf" | "excel" | "docx") => {
    setExporting(true);
    const exportBills = currentPeriodBills.length > 0 ? currentPeriodBills : bills;
    const exportDishes = realTopDishes.length > 0 ? realTopDishes : Object.values(itemStats);
    try {
      if (format === "pdf") {
        await exportAnalyticsPDF(period, currentHeroRev, totalOrders, avgBill, upiPct, cashPct, exportBills, exportDishes);
      } else if (format === "excel") {
        await exportAnalyticsExcel(period, exportBills, exportDishes);
      } else if (format === "docx") {
        await exportAnalyticsDocx(period, currentHeroRev, totalOrders, avgBill, exportBills, exportDishes);
      }
    } catch {}
    finally {
      setExporting(false);
      setExportModal(false);
    }
  };

  const showLock = !api.hasFeature("analytics") && !api.hasFeature("advanced_reports");

  if (showLock) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.surface }]}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.surface} />
        <View style={[styles.wrap, { paddingTop: insets.top, backgroundColor: theme.surface }]}>
          <View style={styles.header}>
            <Pressable onPress={handleBack} style={[styles.backBtn, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
              <Ionicons name="chevron-back" size={24} color={theme.onSurface} />
            </Pressable>
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={[styles.title, { color: theme.onSurface }]}>Sales Analytics</Text>
            </View>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.lockContainer}>
            <Ionicons name="bar-chart-outline" size={64} color="#FF5E2B" />
            <Text style={[styles.lockTitle, { color: theme.onSurface }]}>Sales Analytics</Text>
            <Text style={[styles.lockDescription, { color: theme.onSurfaceSecondary }]}>
              Track daily, weekly, monthly and yearly{"\n"}
              restaurant performance with Growth.
            </Text>
            <Pressable style={styles.upgradeBtn} onPress={() => router.push("/(app)/subscribe")}>
              <Text style={styles.upgradeBtnText}>Upgrade to Growth</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.surface }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.surface} />
      <View style={[styles.wrap, { paddingTop: insets.top, backgroundColor: theme.surface }]}>
        
        {/* Header Bar */}
        <View style={styles.header}>
          <Pressable onPress={handleBack} style={[styles.backBtn, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
            <Ionicons name="chevron-back" size={24} color={theme.onSurface} />
          </Pressable>
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={[styles.title, { color: theme.onSurface }]}>Sales Analytics</Text>
            <Text style={[styles.sub, { color: theme.onSurfaceSecondary }]}>Revenue, trends & performance</Text>
          </View>
          <Pressable style={styles.exportHeaderBtn} onPress={() => setExportModal(true)}>
            <Ionicons name="download-outline" size={18} color="#FFFFFF" />
            <Text style={styles.exportHeaderBtnText}>Export</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl tintColor="#635BFF" refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        >
          {/* Period Filter Scrollable Bar */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: spacing.md }}
            contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
          >
            {[
              { id: "today", label: "Today" },
              { id: "yesterday", label: "Yesterday" },
              { id: "7days", label: "7 Days" },
              { id: "monthly", label: "Monthly" },
              { id: "yearly", label: "Yearly" },
              { id: "custom", label: "Custom Date" },
            ].map(tab => {
              const active = period === tab.id;
              return (
                <Pressable
                  key={tab.id}
                  onPress={() => setPeriod(tab.id as any)}
                  style={[
                    styles.filterTabPill,
                    active ? { backgroundColor: "#635BFF", borderColor: "#635BFF" } : { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }
                  ]}
                >
                  <Text style={[styles.filterTabPillText, active ? { color: "#FFFFFF" } : { color: theme.onSurface }]}>
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Custom Date selection horizontal scroller */}
          {period === "custom" && (
            <View style={{ flexDirection: "row", gap: 10, marginBottom: spacing.md }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {Array.from({ length: 14 }, (_, idx) => {
                  const d = new Date();
                  d.setDate(d.getDate() - idx);
                  const isSelected = isSameDayLocal(d, selectedCustomDate);
                  return (
                    <Pressable
                      key={idx}
                      onPress={() => setSelectedCustomDate(d)}
                      style={[
                        styles.dateSelectTab,
                        isSelected ? { backgroundColor: "#635BFF", borderColor: "#635BFF" } : { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }
                      ]}
                    >
                      <Text style={[styles.dateSelectText, isSelected ? { color: "#FFFFFF" } : { color: theme.onSurface }]}>
                        {d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Hero Sales Overview Card */}
          <LinearGradient
            colors={["#635BFF", "#4F46E5"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <Text style={styles.heroLabel}>
              {period === "today" ? "TODAY'S REVENUE" : period === "yesterday" ? "YESTERDAY'S REVENUE" : period === "custom" ? `REVENUE FOR ${selectedCustomDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : period === "7days" ? "7-DAY REVENUE" : period === "monthly" ? "30-DAY MONTHLY REVENUE" : "TOTAL ANNUAL REVENUE"}
            </Text>
            <Text style={styles.heroValue}>
              ₹{currentHeroRev.toLocaleString()}
            </Text>

            <View style={styles.heroFooter}>
              <View style={styles.heroFooterItem}>
                <Text style={styles.heroFooterVal}>{totalOrders}</Text>
                <Text style={styles.heroFooterLbl}>Total Orders</Text>
              </View>
              <View style={styles.dividerVertical} />
              <View style={styles.heroFooterItem}>
                <Text style={styles.heroFooterVal}>₹{avgBill}</Text>
                <Text style={styles.heroFooterLbl}>Avg Order Value</Text>
              </View>
            </View>
          </LinearGradient>

          {/* Daily Sales Details Card (displayed only for single days) */}
          {isSingleDay && (
            <View style={[styles.card, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border, marginTop: spacing.xs, marginBottom: spacing.md }]}>
              <Text style={[styles.cardTitle, { color: theme.onSurface, marginBottom: spacing.md }]}>Daily Sales Summary</Text>
              
              <View style={styles.metricBreakdownRow}>
                <View style={styles.metricDetailItem}>
                  <Text style={[styles.metricDetailVal, { color: theme.onSurface }]}>{totalOrders}</Text>
                  <Text style={[styles.metricDetailLbl, { color: theme.onSurfaceSecondary }]}>Bills Finalized</Text>
                </View>
                <View style={styles.metricDetailDivider} />
                <View style={styles.metricDetailItem}>
                  <Text style={[styles.metricDetailVal, { color: theme.onSurface }]}>{totalItemsSold}</Text>
                  <Text style={[styles.metricDetailLbl, { color: theme.onSurfaceSecondary }]}>Items Sold</Text>
                </View>
              </View>

              <View style={styles.metricsListTable}>
                <View style={styles.metricsListRow}>
                  <Text style={[styles.metricsListLbl, { color: theme.onSurfaceSecondary }]}>Gross Sales</Text>
                  <Text style={[styles.metricsListVal, { color: theme.onSurface }]}>₹{grossSales.toLocaleString("en-IN")}</Text>
                </View>
                <View style={styles.metricsListRow}>
                  <Text style={[styles.metricsListLbl, { color: theme.onSurfaceSecondary }]}>Discounts</Text>
                  <Text style={[styles.metricsListVal, { color: theme.onSurface }]}>-₹{totalDiscounts.toLocaleString("en-IN")}</Text>
                </View>
                <View style={styles.metricsListRow}>
                  <Text style={[styles.metricsListLbl, { color: theme.onSurfaceSecondary }]}>Taxes (CGST/SGST)</Text>
                  <Text style={[styles.metricsListVal, { color: theme.onSurface }]}>₹{totalTaxes.toLocaleString("en-IN")}</Text>
                </View>
                <View style={styles.metricsListRow}>
                  <Text style={[styles.metricsListLbl, { color: theme.onSurfaceSecondary }]}>Refunds / Voids</Text>
                  <Text style={[styles.metricsListVal, { color: "#EF4444" }]}>₹{totalRefunds.toLocaleString("en-IN")}</Text>
                </View>
                <View style={[styles.metricsListRow, { borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10, marginTop: 4 }]}>
                  <Text style={[styles.metricsListLbl, { color: theme.onSurface, fontWeight: "800" }]}>Net Sales</Text>
                  <Text style={[styles.metricsListVal, { color: "#10B981", fontWeight: "800", fontSize: 16 }]}>₹{netSales.toLocaleString("en-IN")}</Text>
                </View>
              </View>
            </View>
          )}

          {/* Sales Growth / Hourly Sales Bar Chart */}
          <View style={[styles.card, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.onSurface }]}>
              {isSingleDay ? "Hourly Revenue distribution" : "Revenue Distribution"}
            </Text>
            
            <View style={styles.chartContainer}>
              {chartData.length > 0 ? (
                chartData.map((d, idx) => {
                  const pct = Math.max(12, Math.min(100, (d.val / maxVal) * 100));
                  return (
                    <View key={idx} style={styles.barCol}>
                      <View style={[styles.barTrack, { backgroundColor: isDark ? "#1F293D" : "#F1F4FA" }]}>
                        <LinearGradient
                          colors={["#635BFF", "#4F46E5"]}
                          style={[styles.barFill, { height: `${pct}%` }]}
                        />
                      </View>
                      <Text style={[styles.barLabel, { color: theme.onSurfaceSecondary }]} numberOfLines={1}>{d.label}</Text>
                      <Text style={[styles.barValText, { color: theme.onSurface }]}>₹{d.val >= 1000 ? `${(d.val/1000).toFixed(1)}k` : d.val}</Text>
                    </View>
                  );
                })
              ) : (
                <Text style={{ color: theme.onSurfaceSecondary, fontSize: 13, textAlign: "center", width: "100%", marginVertical: 30 }}>No sales recorded for this period</Text>
              )}
            </View>
          </View>

          {/* Sales by Payment Method breakdown */}
          <View style={[styles.card, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border, marginBottom: spacing.md }]}>
            <Text style={[styles.cardTitle, { color: theme.onSurface, marginBottom: spacing.md }]}>Sales by Payment Method</Text>
            
            <View style={{ gap: 12 }}>
              {[
                { name: "CASH", val: paymentBreakdown.CASH, color: "#F59E0B", icon: "cash-outline" },
                { name: "UPI", val: paymentBreakdown.UPI, color: "#635BFF", icon: "qr-code-outline" },
                { name: "CARD", val: paymentBreakdown.CARD, color: "#10B981", icon: "card-outline" },
                { name: "OTHER", val: paymentBreakdown.OTHER, color: "#64748B", icon: "ellipsis-horizontal-outline" },
              ].map(pm => (
                <View key={pm.name} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Ionicons name={pm.icon as any} size={18} color={pm.color} />
                    <Text style={{ fontSize: 14, fontWeight: "600", color: theme.onSurface }}>{pm.name}</Text>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: "800", color: theme.onSurface }}>₹{pm.val.toLocaleString("en-IN")}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Top Dishes Performance */}
          <View style={[styles.card, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.onSurface }]}>Top Performing Menu Items</Text>
            
            <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
              {realTopDishes.length > 0 ? (
                realTopDishes.map((it, idx) => {
                  const pct = `${Math.max(10, Math.round((it.amt / maxDishAmt) * 100))}%`;
                  return (
                    <View key={idx} style={{ gap: 6 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Text style={[styles.dishName, { color: theme.onSurface }]}>{it.name} ({it.sold} sold)</Text>
                        <Text style={[styles.dishAmt, { color: theme.onSurface }]}>₹{it.amt}</Text>
                      </View>
                      <View style={[styles.progressTrack, { backgroundColor: isDark ? "#1F293D" : "#F1F4FA" }]}>
                        <View style={[styles.progressFill, { width: pct as any }]} />
                      </View>
                    </View>
                  );
                })
              ) : (
                <Text style={{ color: theme.onSurfaceSecondary, fontSize: 13 }}>No sales records yet. Completed bills will appear here.</Text>
              )}
            </View>
          </View>

        </ScrollView>

        {/* Export Report Action Modal */}
        <Modal visible={exportModal} transparent animationType="slide">
          <Pressable style={styles.modalBg} onPress={() => setExportModal(false)}>
            <Pressable style={[styles.modalCard, { backgroundColor: theme.surfaceSecondary }]} onPress={() => {}}>
              <Text style={[styles.modalTitle, { color: theme.onSurface }]}>Export Sales Report</Text>
              <Text style={[styles.modalSub, { color: theme.onSurfaceSecondary }]}>Choose your preferred download format:</Text>

              {exporting ? (
                <ActivityIndicator color="#635BFF" style={{ marginVertical: 30 }} />
              ) : (
                <View style={{ gap: spacing.md, marginVertical: spacing.md }}>
                  
                  {/* PDF Option */}
                  <Pressable style={[styles.exportOptBtn, { borderColor: theme.border }]} onPress={() => handleExport("pdf")}>
                    <View style={[styles.optIconBox, { backgroundColor: "#FEF2F2" }]}>
                      <Ionicons name="document-text-outline" size={24} color="#EF4444" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.optTitle, { color: theme.onSurface }]}>Export as PDF Document</Text>
                      <Text style={[styles.optSub, { color: theme.onSurfaceSecondary }]}>Formatted audit report for printing</Text>
                    </View>
                  </Pressable>

                  {/* Excel (.csv) Option */}
                  <Pressable style={[styles.exportOptBtn, { borderColor: theme.border }]} onPress={() => handleExport("excel")}>
                    <View style={[styles.optIconBox, { backgroundColor: "#ECFDF5" }]}>
                      <Ionicons name="grid-outline" size={24} color="#10B981" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.optTitle, { color: theme.onSurface }]}>Export as Excel Spreadsheet (.csv)</Text>
                      <Text style={[styles.optSub, { color: theme.onSurfaceSecondary }]}>Tabular data for Excel / Google Sheets</Text>
                    </View>
                  </Pressable>

                  {/* Word (.docx) Option */}
                  <Pressable style={[styles.exportOptBtn, { borderColor: theme.border }]} onPress={() => handleExport("docx")}>
                    <View style={[styles.optIconBox, { backgroundColor: "#EFF6FF" }]}>
                      <Ionicons name="journal-outline" size={24} color="#3B82F6" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.optTitle, { color: theme.onSurface }]}>Export as Word Document (.docx)</Text>
                      <Text style={[styles.optSub, { color: theme.onSurfaceSecondary }]}>Text formatted report file</Text>
                    </View>
                  </Pressable>

                </View>
              )}

              <Pressable style={styles.cancelBtn} onPress={() => setExportModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "900" },
  sub: { fontSize: 13, marginTop: 2, fontWeight: "500" },

  exportHeaderBtn: { backgroundColor: "#635BFF", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, flexDirection: "row", alignItems: "center", gap: 6 },
  exportHeaderBtnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 13 },

  filterBar: { flexDirection: "row", padding: 5, borderRadius: 24, borderWidth: 1.5, marginBottom: spacing.lg },
  filterTab: { flex: 1, paddingVertical: 12, borderRadius: 20, alignItems: "center" },
  filterTabActive: { backgroundColor: "#635BFF" },
  filterText: { fontSize: 13, fontWeight: "700", color: "#64748B" },
  filterTextActive: { color: "#FFFFFF" },

  filterTabPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  filterTabPillText: { fontSize: 13, fontWeight: "700" },

  dateSelectTab: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  dateSelectText: { fontSize: 13, fontWeight: "700" },

  heroCard: { padding: spacing.xl, borderRadius: 28, marginBottom: spacing.lg },
  heroLabel: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  heroValue: { color: "#FFFFFF", fontSize: 36, fontWeight: "900", marginVertical: spacing.xs },
  heroFooter: { flexDirection: "row", paddingTop: spacing.md, marginTop: spacing.md, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.2)" },
  heroFooterItem: { flex: 1 },
  heroFooterVal: { color: "#FFFFFF", fontSize: 18, fontWeight: "800" },
  heroFooterLbl: { color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 2 },
  dividerVertical: { width: 1, backgroundColor: "rgba(255,255,255,0.2)", marginHorizontal: spacing.md },

  card: { padding: spacing.xl, borderRadius: 28, borderWidth: 1.5, marginBottom: spacing.lg },
  cardTitle: { fontSize: 18, fontWeight: "900", marginBottom: spacing.md },
  chartContainer: { height: 160, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingTop: spacing.md },
  barCol: { flex: 1, alignItems: "center", height: "100%", justifyContent: "flex-end" },
  barTrack: { width: 18, height: 100, borderRadius: 9, overflow: "hidden", justifyContent: "flex-end" },
  barFill: { width: "100%", borderRadius: 9 },
  barLabel: { fontSize: 10, fontWeight: "700", marginTop: 6 },
  barValText: { fontSize: 9, fontWeight: "800", marginTop: 2 },

  gridRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg },
  gridCard: { flex: 1, padding: spacing.lg, borderRadius: 28, borderWidth: 1.5, gap: 4 },
  gridVal: { fontSize: 20, fontWeight: "900" },
  gridLbl: { fontSize: 12, fontWeight: "600" },

  dishName: { fontSize: 14, fontWeight: "700" },
  dishAmt: { fontSize: 14, fontWeight: "800" },
  progressTrack: { height: 10, borderRadius: 5, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#635BFF", borderRadius: 5 },

  // Daily report specific styles
  metricBreakdownRow: { flexDirection: "row", justifyContent: "space-around", marginBottom: spacing.lg, paddingVertical: spacing.md },
  metricDetailItem: { alignItems: "center", flex: 1 },
  metricDetailVal: { fontSize: 22, fontWeight: "900" },
  metricDetailLbl: { fontSize: 12, fontWeight: "600", marginTop: 2 },
  metricDetailDivider: { width: 1.5, backgroundColor: "#E2E8F0", height: "80%", alignSelf: "center" },

  metricsListTable: { gap: 10 },
  metricsListRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  metricsListLbl: { fontSize: 14, fontWeight: "600" },
  metricsListVal: { fontSize: 14, fontWeight: "700" },

  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalCard: { padding: spacing.xl, borderTopLeftRadius: 28, borderTopRightRadius: 28, gap: spacing.xs },
  modalTitle: { fontSize: 20, fontWeight: "900" },
  modalSub: { fontSize: 13, marginTop: 2 },

  exportOptBtn: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderRadius: 20, borderWidth: 1.5, gap: spacing.md },
  optIconBox: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  optTitle: { fontSize: 15, fontWeight: "800" },
  optSub: { fontSize: 12, marginTop: 2 },

  cancelBtn: { paddingVertical: 14, alignItems: "center" },
  cancelBtnText: { color: "#64748B", fontWeight: "800", fontSize: 14 },
  lockContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.xxl, gap: spacing.lg, textAlign: "center" },
  lockTitle: { fontSize: 20, fontWeight: "900", textAlign: "center" },
  lockDescription: { fontSize: 14, fontWeight: "500", textAlign: "center", lineHeight: 20, paddingHorizontal: spacing.md },
  upgradeBtn: { backgroundColor: "#FF5E2B", paddingHorizontal: 24, paddingVertical: 14, borderRadius: radius.lg, marginTop: spacing.md },
  upgradeBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
});
