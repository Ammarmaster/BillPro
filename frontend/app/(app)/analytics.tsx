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
import { spacing } from "@/src/theme";

export default function Analytics() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme, isDark } = useTheme();

  const [period, setPeriod] = useState<"7days" | "monthly" | "yearly">("7days");
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

  // 1. Paid Bills Filter
  const paidBills = bills.filter(b => b && (b.status === "paid" || b.status === "PAID"));

  // 2. Real Date-based Filtering for 7Days, Monthly (30Days), and Yearly
  const now = new Date();
  
  const d7 = new Date(now); d7.setDate(d7.getDate() - 7);
  const d30 = new Date(now); d30.setDate(d30.getDate() - 30);

  const bills7Days = paidBills.filter(b => b.created_at && new Date(b.created_at) >= d7);
  const billsMonthly = paidBills.filter(b => b.created_at && new Date(b.created_at) >= d30);
  const billsYearly = paidBills; // All time paid bills

  const rev7Days = bills7Days.reduce((sum, b) => sum + (Number(b.total) || 0), 0);
  const revMonthly = billsMonthly.reduce((sum, b) => sum + (Number(b.total) || 0), 0);
  const revYearly = billsYearly.reduce((sum, b) => sum + (Number(b.total) || 0), 0);

  const currentPeriodBills = period === "7days" ? bills7Days : period === "monthly" ? billsMonthly : billsYearly;
  const currentHeroRev = period === "7days" ? rev7Days : period === "monthly" ? revMonthly : revYearly;

  const totalOrders = currentPeriodBills.length;
  const avgBill = totalOrders > 0 ? Math.round(currentHeroRev / totalOrders) : 0;

  // Real Payment Method Ratio for selected period
  const upiCount = currentPeriodBills.filter(b => b && (b.payment_method === "UPI" || !b.payment_method)).length;
  const cashCount = currentPeriodBills.filter(b => b && b.payment_method === "CASH").length;
  const totalPaidCount = currentPeriodBills.length || 1;
  const upiPct = Math.round((upiCount / totalPaidCount) * 100);
  const cashPct = Math.round((cashCount / totalPaidCount) * 100);

  // Dynamic Chart Breakdown for selected period
  const chartData = period === "7days" ? [6, 5, 4, 3, 2, 1, 0].map(daysAgo => {
    const d = new Date(now); d.setDate(d.getDate() - daysAgo);
    const dateStr = d.toISOString().slice(0, 10);
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    const dayRev = paidBills
      .filter(b => b && b.created_at && String(b.created_at).slice(0, 10) === dateStr)
      .reduce((sum, b) => sum + (Number(b.total) || 0), 0);
    return { label: dayName, val: dayRev };
  }) : period === "monthly" ? [3, 2, 1, 0].map(weeksAgo => {
    const start = new Date(now); start.setDate(start.getDate() - (weeksAgo + 1) * 7);
    const end = new Date(now); end.setDate(end.getDate() - weeksAgo * 7);
    const weekRev = paidBills
      .filter(b => {
        if (!b?.created_at) return false;
        const bd = new Date(b.created_at);
        return bd >= start && bd <= end;
      })
      .reduce((sum, b) => sum + (Number(b.total) || 0), 0);
    return { label: `W${4 - weeksAgo}`, val: weekRev };
  }) : [
    { label: "Q1", val: paidBills.filter(b => b?.created_at && new Date(b.created_at).getMonth() <= 2).reduce((s, b) => s + (Number(b.total) || 0), 0) },
    { label: "Q2", val: paidBills.filter(b => b?.created_at && new Date(b.created_at).getMonth() >= 3 && new Date(b.created_at).getMonth() <= 5).reduce((s, b) => s + (Number(b.total) || 0), 0) },
    { label: "Q3", val: paidBills.filter(b => b?.created_at && new Date(b.created_at).getMonth() >= 6 && new Date(b.created_at).getMonth() <= 8).reduce((s, b) => s + (Number(b.total) || 0), 0) },
    { label: "Q4", val: paidBills.filter(b => b?.created_at && new Date(b.created_at).getMonth() >= 9).reduce((s, b) => s + (Number(b.total) || 0), 0) },
  ];

  const maxVal = Math.max(...chartData.map(d => d.val), 100);

  // Calculate Real Top Selling Menu Items from Database
  const itemStats: Record<string, { name: string; sold: number; amt: number }> = {};

  currentPeriodBills.forEach(bill => {
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
    .sort((a, b) => b.amt - a.amt)
    .slice(0, 5);

  const maxDishAmt = realTopDishes.length > 0 ? realTopDishes[0].amt : 1;

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.push("/(app)/more");
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
          {/* Period Filter Segment Bar */}
          <View style={[styles.filterBar, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
            <Pressable
              style={[styles.filterTab, period === "7days" && styles.filterTabActive]}
              onPress={() => setPeriod("7days")}
            >
              <Text style={[styles.filterText, period === "7days" && styles.filterTextActive]}>7 Days</Text>
            </Pressable>
            <Pressable
              style={[styles.filterTab, period === "monthly" && styles.filterTabActive]}
              onPress={() => setPeriod("monthly")}
            >
              <Text style={[styles.filterText, period === "monthly" && styles.filterTextActive]}>Monthly</Text>
            </Pressable>
            <Pressable
              style={[styles.filterTab, period === "yearly" && styles.filterTabActive]}
              onPress={() => setPeriod("yearly")}
            >
              <Text style={[styles.filterText, period === "yearly" && styles.filterTextActive]}>Yearly</Text>
            </Pressable>
          </View>

          {/* Hero Sales Overview Card */}
          <LinearGradient
            colors={["#635BFF", "#4F46E5"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <Text style={styles.heroLabel}>
              {period === "7days" ? "7-DAY REVENUE" : period === "monthly" ? "30-DAY MONTHLY REVENUE" : "TOTAL ANNUAL REVENUE"}
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

          {/* Sales Growth Bar Chart */}
          <View style={[styles.card, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.onSurface }]}>Revenue Distribution</Text>
            
            <View style={styles.chartContainer}>
              {chartData.map((d, idx) => {
                const pct = Math.max(12, Math.min(100, (d.val / maxVal) * 100));
                return (
                  <View key={idx} style={styles.barCol}>
                    <View style={[styles.barTrack, { backgroundColor: isDark ? "#1F293D" : "#F1F4FA" }]}>
                      <LinearGradient
                        colors={["#635BFF", "#4F46E5"]}
                        style={[styles.barFill, { height: `${pct}%` }]}
                      />
                    </View>
                    <Text style={[styles.barLabel, { color: theme.onSurfaceSecondary }]}>{d.label}</Text>
                    <Text style={[styles.barValText, { color: theme.onSurface }]}>₹{d.val >= 1000 ? `${(d.val/1000).toFixed(1)}k` : d.val}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Breakdown Cards */}
          <View style={styles.gridRow}>
            <View style={[styles.gridCard, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
              <Ionicons name="card-outline" size={24} color="#10B981" />
              <Text style={[styles.gridVal, { color: theme.onSurface }]}>{upiPct}%</Text>
              <Text style={[styles.gridLbl, { color: theme.onSurfaceSecondary }]}>Digital / UPI Paid</Text>
            </View>
            <View style={[styles.gridCard, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
              <Ionicons name="cash-outline" size={24} color="#F59E0B" />
              <Text style={[styles.gridVal, { color: theme.onSurface }]}>{cashPct}%</Text>
              <Text style={[styles.gridLbl, { color: theme.onSurfaceSecondary }]}>Cash Payments</Text>
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
                        <View style={[styles.progressFill, { width: pct }]} />
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
  barTrack: { width: 24, height: 100, borderRadius: 12, overflow: "hidden", justifyContent: "flex-end" },
  barFill: { width: "100%", borderRadius: 12 },
  barLabel: { fontSize: 11, fontWeight: "700", marginTop: 6 },
  barValText: { fontSize: 10, fontWeight: "800", marginTop: 2 },

  gridRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg },
  gridCard: { flex: 1, padding: spacing.lg, borderRadius: 28, borderWidth: 1.5, gap: 4 },
  gridVal: { fontSize: 20, fontWeight: "900" },
  gridLbl: { fontSize: 12, fontWeight: "600" },

  dishName: { fontSize: 14, fontWeight: "700" },
  dishAmt: { fontSize: 14, fontWeight: "800" },
  progressTrack: { height: 10, borderRadius: 5, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#635BFF", borderRadius: 5 },

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
});
