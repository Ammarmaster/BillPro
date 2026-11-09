import { useCallback, useState, useMemo } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, SafeAreaView, StatusBar, RefreshControl, Modal, Alert, BackHandler,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { useTheme } from "@/src/context/ThemeContext";
import { useResponsive } from "@/src/hooks/useResponsive";
import { exportAnalyticsPDF, exportAnalyticsExcel, exportAnalyticsDocx } from "@/src/lib/exportAnalytics";
import { spacing, radius } from "@/src/theme";
import { safeParseDate, getBusinessDate, getBusinessDateKey } from "@/src/lib/dateUtils";

export default function Analytics() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const { isDesktop } = useResponsive();

  const [period, setPeriod] = useState<"today" | "yesterday" | "7days" | "monthly" | "yearly" | "custom">("today");
  const [customStartDate, setCustomStartDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d;
  });
  const [customEndDate, setCustomEndDate] = useState<Date>(() => new Date());
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => new Date());
  const [tempStart, setTempStart] = useState<Date | null>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d;
  });
  const [tempEnd, setTempEnd] = useState<Date | null>(() => new Date());
  const [bills, setBills] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [restaurant, setRestaurant] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exportModal, setExportModal] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bList, oList, rData] = await Promise.all([
        api.listBills().catch(() => []),
        api.listOrders().catch(() => []),
        api.getRestaurant().catch(() => null),
        api.loadDayClosings(),
      ]);
      setBills(Array.isArray(bList) ? bList : []);
      setOrders(Array.isArray(oList) ? oList : []);
      if (rData) setRestaurant(rData);
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

  const toMidnightMs = (d: Date) => {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
  };

  const isDateInRange = (d: Date, start: Date, end: Date) => {
    const startMs = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0).getTime();
    const endMs = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999).getTime();
    const min = Math.min(startMs, endMs);
    const max = Math.max(startMs, endMs);
    const t = d.getTime();
    return t >= min && t <= max;
  };

  const formatDateRange = (start: Date, end: Date) => {
    if (isSameDayLocal(start, end)) {
      return start.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    }
    return `${start.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${end.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;
  };

  const getDayCount = (start: Date, end: Date) => {
    const s = toMidnightMs(start);
    const e = toMidnightMs(end);
    return Math.max(1, Math.round(Math.abs(e - s) / (1000 * 60 * 60 * 24)) + 1);
  };

  // Days follow the counter: a day ends at Close Counter (or 3:30 AM), not at 12 midnight
  const today = getBusinessDate(new Date()) || new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const saleTime = (b: any) => (b?.status === "paid" || b?.status === "PAID" ? (b.paid_at || b.created_at) : (b?.created_at || b?.paid_at));
  const saleDay = (b: any) => getBusinessDate(saleTime(b));
  const saleDayKey = (b: any) => getBusinessDateKey(saleTime(b));
  const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  // Deduplicate bills by order_id or id to guarantee 100% real accurate calculations
  const uniqueBills = useMemo(() => {
    const seen = new Set<string>();
    const result: any[] = [];
    for (const b of bills) {
      if (!b) continue;
      const key = b.order_id || (Array.isArray(b.order_ids) && b.order_ids.length > 0 ? b.order_ids.sort().join(",") : b.id);
      if (key) {
        if (seen.has(key)) continue;
        seen.add(key);
      }
      result.push(b);
    }
    return result;
  }, [bills]);

  const currentPeriodBills = uniqueBills.filter((b: any) => {
    if (!b) return false;
    const bDate = saleDay(b);
    if (!bDate) return false;
    
    if (period === "today") return isSameDayLocal(bDate, today);
    if (period === "yesterday") return isSameDayLocal(bDate, yesterday);
    if (period === "custom") return isDateInRange(bDate, customStartDate, customEndDate);
    
    const isPaid = b.status === "paid" || b.status === "PAID";
    if (!isPaid) return false;
    
    if (period === "7days") {
      const d7 = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
      return bDate >= d7;
    }
    if (period === "monthly") {
      const d30 = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
      return bDate >= d30;
    }
    if (period === "yearly") {
      return bDate.getFullYear() === today.getFullYear();
    }
    return true;
  });

  const activeBills = currentPeriodBills.filter((b: any) => b.status === "paid" || b.status === "PAID");
  const refundedBills = currentPeriodBills.filter((b: any) => b.status === "cancelled" || b.status === "refunded");

  const grossSales = activeBills.reduce((sum: number, b: any) => sum + (Number(b.subtotal) || 0), 0);
  const totalDiscounts = activeBills.reduce((sum: number, b: any) => sum + (Number(b.discount) || 0), 0);
  const totalTaxes = activeBills.reduce((sum: number, b: any) => sum + (Number(b.cgst || 0) + Number(b.sgst || 0) || Number(b.tax) || 0), 0);
  const totalRefunds = refundedBills.reduce((sum: number, b: any) => sum + (Number(b.total) || 0), 0);
  const netSales = activeBills.reduce((sum: number, b: any) => sum + (Number(b.total) || 0), 0);
  
  const currentHeroRev = netSales;
  const totalOrders = activeBills.length;
  const avgBill = totalOrders > 0 ? Math.round(currentHeroRev / totalOrders) : 0;

  let totalItemsSold = 0;
  activeBills.forEach((b: any) => {
    if (Array.isArray(b.items)) {
      b.items.forEach((it: any) => {
        totalItemsSold += (Number(it.quantity) || 1);
      });
    }
  });

  const paymentBreakdown = {
    CASH: activeBills.filter((b: any) => b.payment_method === "CASH").reduce((s: number, b: any) => s + (Number(b.total) || 0), 0),
    UPI: activeBills.filter((b: any) => b.payment_method === "UPI" || b.payment_method === "UPI_QR" || b.payment_method === "online" || !b.payment_method).reduce((s: number, b: any) => s + (Number(b.total) || 0), 0),
    CARD: activeBills.filter((b: any) => b.payment_method === "CARD").reduce((s: number, b: any) => s + (Number(b.total) || 0), 0),
    OTHER: activeBills.filter((b: any) => b.payment_method && b.payment_method !== "CASH" && b.payment_method !== "UPI" && b.payment_method !== "UPI_QR" && b.payment_method !== "online" && b.payment_method !== "CARD").reduce((s: number, b: any) => s + (Number(b.total) || 0), 0)
  };

  const totalPaidCount = activeBills.length || 1;
  const upiCount = activeBills.filter((b: any) => b.payment_method === "UPI" || b.payment_method === "UPI_QR" || b.payment_method === "online" || !b.payment_method).length;
  const cashCount = activeBills.filter((b: any) => b.payment_method === "CASH").length;
  const upiPct = Math.round((upiCount / totalPaidCount) * 100);
  const cashPct = Math.round((cashCount / totalPaidCount) * 100);

  const isSingleDay =
    period === "today" ||
    period === "yesterday" ||
    (period === "custom" && isSameDayLocal(customStartDate, customEndDate));

  const chartData = useMemo(() => {
    if (isSingleDay) {
      return Array.from({ length: 24 }, (_, hour) => {
        const hourlyBills = activeBills.filter((b: any) => new Date(b.created_at).getHours() === hour);
        const rev = hourlyBills.reduce((sum: number, b: any) => sum + (Number(b.total) || 0), 0);
        const label = hour === 0 ? "12a" : hour === 12 ? "12p" : hour > 12 ? `${hour - 12}p` : `${hour}a`;
        return { label, val: rev };
      }).filter(h => h.val > 0);
    }

    if (period === "7days") {
      return [6, 5, 4, 3, 2, 1, 0].map(daysAgo => {
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysAgo);
        const dateStr = dayKey(d);
        const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
        const dayRev = uniqueBills
          .filter((b: any) => b && (b.status === "paid" || b.status === "PAID") && saleDayKey(b) === dateStr)
          .reduce((sum: number, b: any) => sum + (Number(b.total) || 0), 0);
        return { label: dayName, val: dayRev };
      });
    }

    if (period === "monthly") {
      return [3, 2, 1, 0].map(weeksAgo => {
        // Counter days: week = 7 whole days ending today
        const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (weeksAgo + 1) * 7 + 1);
        const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() - weeksAgo * 7);
        const weekRev = uniqueBills
          .filter((b: any) => {
            if (b?.status !== "paid" && b?.status !== "PAID") return false;
            const bd = saleDay(b);
            if (!bd) return false;
            return bd >= start && bd <= end;
          })
          .reduce((sum: number, b: any) => sum + (Number(b.total) || 0), 0);
        return { label: `W${4 - weeksAgo}`, val: weekRev };
      });
    }

    if (period === "custom") {
      const s = new Date(customStartDate.getFullYear(), customStartDate.getMonth(), customStartDate.getDate());
      const e = new Date(customEndDate.getFullYear(), customEndDate.getMonth(), customEndDate.getDate());
      const dayDiff = Math.max(1, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1);

      if (dayDiff <= 14) {
        const daysArr: { label: string; val: number }[] = [];
        for (let i = 0; i < dayDiff; i++) {
          const cur = new Date(s);
          cur.setDate(cur.getDate() + i);
          const curDateStr = dayKey(cur);
          const label = `${cur.getDate()} ${cur.toLocaleDateString("en-US", { month: "short" })}`;
          const dayRev = activeBills
            .filter((b: any) => saleDayKey(b) === curDateStr)
            .reduce((sum: number, b: any) => sum + (Number(b.total) || 0), 0);
          daysArr.push({ label, val: dayRev });
        }
        return daysArr;
      } else if (dayDiff <= 31) {
        const daysArr: { label: string; val: number }[] = [];
        for (let i = 0; i < dayDiff; i++) {
          const cur = new Date(s);
          cur.setDate(cur.getDate() + i);
          const curDateStr = dayKey(cur);
          const label = `${cur.getDate()}`;
          const dayRev = activeBills
            .filter((b: any) => saleDayKey(b) === curDateStr)
            .reduce((sum: number, b: any) => sum + (Number(b.total) || 0), 0);
          daysArr.push({ label, val: dayRev });
        }
        return daysArr;
      } else {
        const chunks = 5;
        const chunkDays = Math.ceil(dayDiff / chunks);
        const result: { label: string; val: number }[] = [];
        for (let c = 0; c < chunks; c++) {
          const cStart = new Date(s);
          cStart.setDate(cStart.getDate() + c * chunkDays);
          const cEnd = new Date(s);
          cEnd.setDate(Math.min(e.getDate(), cEnd.getDate() + (c + 1) * chunkDays - 1));
          const val = activeBills
            .filter((b: any) => {
              const bd = saleDay(b);
              return !!bd && bd >= cStart && bd <= cEnd;
            })
            .reduce((sum: number, b: any) => sum + (Number(b.total) || 0), 0);
          result.push({
            label: `${cStart.getDate()}/${cStart.getMonth() + 1}`,
            val,
          });
        }
        return result;
      }
    }

    return [
      { label: "Q1", val: uniqueBills.filter((b: any) => (b?.status === "paid" || b?.status === "PAID") && saleDay(b)?.getFullYear() === today.getFullYear() && (saleDay(b) as Date).getMonth() <= 2).reduce((s: number, b: any) => s + (Number(b.total) || 0), 0) },
      { label: "Q2", val: uniqueBills.filter((b: any) => (b?.status === "paid" || b?.status === "PAID") && saleDay(b)?.getFullYear() === today.getFullYear() && (saleDay(b) as Date).getMonth() >= 3 && new Date(b.created_at).getMonth() <= 5).reduce((s: number, b: any) => s + (Number(b.total) || 0), 0) },
      { label: "Q3", val: uniqueBills.filter((b: any) => (b?.status === "paid" || b?.status === "PAID") && saleDay(b)?.getFullYear() === today.getFullYear() && (saleDay(b) as Date).getMonth() >= 6 && new Date(b.created_at).getMonth() <= 8).reduce((s: number, b: any) => s + (Number(b.total) || 0), 0) },
      { label: "Q4", val: uniqueBills.filter((b: any) => (b?.status === "paid" || b?.status === "PAID") && saleDay(b)?.getFullYear() === today.getFullYear() && (saleDay(b) as Date).getMonth() >= 9).reduce((s: number, b: any) => s + (Number(b.total) || 0), 0) },
    ];
  }, [period, activeBills, uniqueBills, isSingleDay, customStartDate, customEndDate]);

  const maxVal = Math.max(...chartData.map(d => d.val), 100);

  const itemStats: Record<string, { name: string; sold: number; amt: number }> = {};
  activeBills.forEach((bill: any) => {
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

  const heroTitle = useMemo(() => {
    if (period === "today") return "TODAY'S REVENUE";
    if (period === "yesterday") return "YESTERDAY'S REVENUE";
    if (period === "7days") return "7-DAY REVENUE";
    if (period === "monthly") return "30-DAY MONTHLY REVENUE";
    if (period === "yearly") return "TOTAL ANNUAL REVENUE";
    if (period === "custom") {
      if (isSameDayLocal(customStartDate, customEndDate)) {
        return `REVENUE FOR ${customStartDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" }).toUpperCase()}`;
      }
      return `REVENUE (${customStartDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${customEndDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })})`.toUpperCase();
    }
    return "TOTAL REVENUE";
  }, [period, customStartDate, customEndDate]);

  const calendarWeeks = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const firstDayOfWeek = firstDay.getDay(); // 0 for Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days: { date: Date; dayNumber: number; isCurrentMonth: boolean }[] = [];

    // Previous month overflow days
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      days.push({
        date: new Date(year, month - 1, dayNum, 0, 0, 0, 0),
        dayNumber: dayNum,
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        date: new Date(year, month, i, 0, 0, 0, 0),
        dayNumber: i,
        isCurrentMonth: true,
      });
    }

    // Next month overflow days (fill to multiple of 7, at least 35 cells)
    let nextMonthDay = 1;
    while (days.length % 7 !== 0 || days.length < 35) {
      days.push({
        date: new Date(year, month + 1, nextMonthDay, 0, 0, 0, 0),
        dayNumber: nextMonthDay,
        isCurrentMonth: false,
      });
      nextMonthDay++;
    }

    const weeks: { date: Date; dayNumber: number; isCurrentMonth: boolean }[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
    }
    return weeks;
  }, [calendarMonth]);

  const handlePrevMonth = () => {
    setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleDayPress = (d: Date) => {
    const clickedTime = toMidnightMs(d);
    if (!tempStart || (tempStart && tempEnd)) {
      setTempStart(d);
      setTempEnd(null);
    } else {
      const startTime = toMidnightMs(tempStart);
      if (clickedTime < startTime) {
        setTempStart(d);
        setTempEnd(null);
      } else {
        setTempEnd(d);
      }
    }
  };

  const handleApplyCustomRange = () => {
    const finalStart = tempStart || new Date();
    const finalEnd = tempEnd || tempStart || new Date();
    if (toMidnightMs(finalStart) > toMidnightMs(finalEnd)) {
      setCustomStartDate(finalEnd);
      setCustomEndDate(finalStart);
    } else {
      setCustomStartDate(finalStart);
      setCustomEndDate(finalEnd);
    }
    setPeriod("custom");
    setShowCalendarModal(false);
  };

  const handleOpenCalendar = () => {
    setTempStart(customStartDate);
    setTempEnd(customEndDate);
    setCalendarMonth(new Date(customStartDate.getFullYear(), customStartDate.getMonth(), 1));
    setShowCalendarModal(true);
  };

  const handleBack = () => {
    if (showCalendarModal) {
      setShowCalendarModal(false);
      return;
    }
    if (exportModal) {
      setExportModal(false);
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(app)/more");
    }
  };

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        handleBack();
        return true;
      };
      const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () => subscription.remove();
    }, [showCalendarModal, exportModal])
  );

  const handleExport = async (format: "pdf" | "excel" | "docx") => {
    setExporting(true);
    const exportBills = currentPeriodBills.length > 0 ? currentPeriodBills : bills;
    const exportDishes = realTopDishes.length > 0 ? realTopDishes : Object.values(itemStats);
    try {
      if (format === "pdf") {
        await exportAnalyticsPDF(period, currentHeroRev, totalOrders, avgBill, upiPct, cashPct, exportBills, exportDishes, restaurant);
      } else if (format === "excel") {
        await exportAnalyticsExcel(period, exportBills, exportDishes, restaurant);
      } else if (format === "docx") {
        await exportAnalyticsDocx(period, currentHeroRev, totalOrders, avgBill, exportBills, exportDishes, restaurant);
      }
    } catch (e: any) {
      console.warn("handleExport error:", e);
      Alert.alert("Export Notice", "Export could not complete. Please check app permissions.");
    } finally {
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
        <View style={[{ flex: 1, width: "100%" }, isDesktop && { maxWidth: 1200, alignSelf: "center" }]}>
        
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
              { id: "custom", label: "Custom Range" },
            ].map(tab => {
              const active = period === tab.id;
              return (
                <Pressable
                  key={tab.id}
                  onPress={() => {
                    setPeriod(tab.id as any);
                    if (tab.id === "custom") {
                      handleOpenCalendar();
                    }
                  }}
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

          {/* Custom Date selection banner */}
          {period === "custom" && (
            <Pressable
              onPress={handleOpenCalendar}
              style={[styles.customDateBanner, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}
            >
              <View style={styles.customDateBannerLeft}>
                <View style={styles.calendarIconCircle}>
                  <Ionicons name="calendar-outline" size={20} color="#635BFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.customDateBannerTitle, { color: theme.onSurface }]}>
                    {formatDateRange(customStartDate, customEndDate)}
                  </Text>
                  <Text style={[styles.customDateBannerSub, { color: theme.onSurfaceSecondary }]}>
                    {isSameDayLocal(customStartDate, customEndDate) ? "Single day selected" : `${getDayCount(customStartDate, customEndDate)} days range`} • Tap to change
                  </Text>
                </View>
              </View>
              <View style={styles.customDateBannerBtn}>
                <Text style={styles.customDateBannerBtnText}>Change</Text>
                <Ionicons name="chevron-forward" size={14} color="#635BFF" />
              </View>
            </Pressable>
          )}

          {/* Hero Sales Overview Card */}
          <LinearGradient
            colors={["#635BFF", "#4F46E5"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <Text style={styles.heroLabel}>
              {heroTitle}
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

          {/* Sales Breakdown Details Card */}
          <View style={[styles.card, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border, marginTop: spacing.xs, marginBottom: spacing.md }]}>
            <Text style={[styles.cardTitle, { color: theme.onSurface, marginBottom: spacing.md }]}>
              {isSingleDay ? "Daily Sales Summary" : "Sales Breakdown Summary"}
            </Text>
            
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
          <Pressable 
            style={[styles.modalBg, isDesktop && { justifyContent: "center", alignItems: "center", padding: spacing.xl }]} 
            onPress={() => setExportModal(false)}
          >
            <Pressable 
              style={[
                styles.modalCard, 
                { 
                  backgroundColor: theme.surfaceSecondary,
                  width: isDesktop ? 480 : "100%",
                  borderRadius: isDesktop ? 20 : undefined,
                  borderTopLeftRadius: 28,
                  borderTopRightRadius: 28,
                  borderWidth: isDesktop ? 1 : 0,
                  borderColor: theme.border,
                }
              ]} 
              onPress={() => {}}
            >
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

        {/* Custom Calendar Date Range Modal (Matching Screenshot) */}
        <Modal visible={showCalendarModal} transparent animationType="fade">
          <Pressable 
            style={styles.calModalBackdrop} 
            onPress={() => setShowCalendarModal(false)}
          >
            <Pressable 
              style={[
                styles.calModalCard, 
                { 
                  backgroundColor: theme.surfaceSecondary, 
                  borderColor: theme.border,
                  width: isDesktop ? 420 : "92%",
                  maxWidth: 420,
                }
              ]} 
              onPress={() => {}}
            >
              {/* Top Header: Close ✕ on Left, Month & Year in Center */}
              <View style={styles.calHeaderRow}>
                <Pressable onPress={() => setShowCalendarModal(false)} hitSlop={12} style={styles.calCloseBtn}>
                  <Ionicons name="close" size={24} color={theme.onSurface} />
                </Pressable>

                <View style={styles.calMonthNav}>
                  <Pressable onPress={handlePrevMonth} hitSlop={10} style={styles.calNavArrow}>
                    <Ionicons name="chevron-back" size={20} color={theme.onSurface} />
                  </Pressable>
                  <Text style={[styles.calMonthTitle, { color: theme.onSurface }]}>
                    {calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                  </Text>
                  <Pressable onPress={handleNextMonth} hitSlop={10} style={styles.calNavArrow}>
                    <Ionicons name="chevron-forward" size={20} color={theme.onSurface} />
                  </Pressable>
                </View>

                <View style={{ width: 36 }} />
              </View>

              {/* Weekday Row: S M T W T F S */}
              <View style={styles.weekdaysRow}>
                {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                  <View key={i} style={styles.weekdayCol}>
                    <Text style={[styles.weekdayText, { color: theme.onSurfaceSecondary }]}>
                      {d}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Calendar Weeks & Days Grid */}
              <View style={styles.calGrid}>
                {calendarWeeks.map((week, wIdx) => (
                  <View key={wIdx} style={styles.calWeekRow}>
                    {week.map((cell, colIdx) => {
                      const cellTime = toMidnightMs(cell.date);
                      const sTime = tempStart ? toMidnightMs(tempStart) : null;
                      const eTime = tempEnd ? toMidnightMs(tempEnd) : null;

                      const isStart = sTime !== null && cellTime === sTime;
                      const isEnd = eTime !== null && cellTime === eTime;
                      const hasBoth = sTime !== null && eTime !== null;
                      const minTime = hasBoth ? Math.min(sTime, eTime) : sTime;
                      const maxTime = hasBoth ? Math.max(sTime, eTime) : sTime;
                      const inRange = hasBoth && minTime !== null && maxTime !== null && cellTime >= minTime && cellTime <= maxTime;
                      const isSingle = (isStart && isEnd) || (isStart && !hasBoth);

                      let borderTopLeftRadius = 0;
                      let borderBottomLeftRadius = 0;
                      let borderTopRightRadius = 0;
                      let borderBottomRightRadius = 0;

                      if (isSingle) {
                        borderTopLeftRadius = 20;
                        borderBottomLeftRadius = 20;
                        borderTopRightRadius = 20;
                        borderBottomRightRadius = 20;
                      } else if (isStart) {
                        borderTopLeftRadius = 20;
                        borderBottomLeftRadius = 20;
                        if (colIdx === 6) {
                          borderTopRightRadius = 10;
                          borderBottomRightRadius = 10;
                        }
                      } else if (isEnd) {
                        borderTopRightRadius = 20;
                        borderBottomRightRadius = 20;
                        if (colIdx === 0) {
                          borderTopLeftRadius = 10;
                          borderBottomLeftRadius = 10;
                        }
                      } else if (inRange) {
                        if (colIdx === 0) {
                          borderTopLeftRadius = 8;
                          borderBottomLeftRadius = 8;
                        }
                        if (colIdx === 6) {
                          borderTopRightRadius = 8;
                          borderBottomRightRadius = 8;
                        }
                      }

                      const isSelected = inRange || isStart || isEnd;

                      return (
                        <Pressable
                          key={colIdx}
                          onPress={() => handleDayPress(cell.date)}
                          style={[
                            styles.calDayCell,
                            {
                              backgroundColor: isSelected ? "#635BFF" : "transparent",
                              borderTopLeftRadius,
                              borderBottomLeftRadius,
                              borderTopRightRadius,
                              borderBottomRightRadius,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.calDayText,
                              isSelected
                                ? { color: "#FFFFFF", fontWeight: "800" }
                                : !cell.isCurrentMonth
                                ? { color: isDark ? "#475569" : "#94A3B8", fontWeight: "500" }
                                : { color: theme.onSurface, fontWeight: "600" },
                            ]}
                          >
                            {cell.dayNumber}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>

              {/* Quick Presets */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.presetsList}
              >
                {[
                  { label: "Today", get: () => [new Date(), new Date()] },
                  { label: "Yesterday", get: () => { const d = new Date(); d.setDate(d.getDate() - 1); return [d, d]; } },
                  { label: "Last 7 Days", get: () => { const s = new Date(); s.setDate(s.getDate() - 6); return [s, new Date()]; } },
                  { label: "Last 30 Days", get: () => { const s = new Date(); s.setDate(s.getDate() - 29); return [s, new Date()]; } },
                  { label: "This Month", get: () => { const now = new Date(); return [new Date(now.getFullYear(), now.getMonth(), 1), now]; } },
                  { label: "Last Month", get: () => { const now = new Date(); return [new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 0)]; } },
                ].map((p, pIdx) => (
                  <Pressable
                    key={pIdx}
                    onPress={() => {
                      const [s, e] = p.get();
                      setTempStart(s);
                      setTempEnd(e);
                      setCalendarMonth(new Date(s.getFullYear(), s.getMonth(), 1));
                    }}
                    style={[styles.presetChip, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  >
                    <Text style={[styles.presetChipText, { color: theme.onSurface }]}>{p.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              {/* Footer Info & Apply Button */}
              <View style={[styles.calFooter, { borderTopColor: theme.border }]}>
                <View style={styles.calSelectionSummary}>
                  <Text style={[styles.calSelectionLabel, { color: theme.onSurfaceSecondary }]}>Selected Range</Text>
                  <Text style={[styles.calSelectionValue, { color: theme.onSurface }]} numberOfLines={1}>
                    {tempStart
                      ? tempEnd
                        ? isSameDayLocal(tempStart, tempEnd)
                          ? tempStart.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                          : `${tempStart.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${tempEnd.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
                        : `${tempStart.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} (Choose end date)`
                      : "Select dates"}
                  </Text>
                </View>
                <Pressable onPress={handleApplyCustomRange} style={styles.applyBtn}>
                  <Text style={styles.applyBtnText}>Apply</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        </View>
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

  customDateBanner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderRadius: 20, borderWidth: 1.5, marginBottom: spacing.md },
  customDateBannerLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  calendarIconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(99,91,255,0.12)", justifyContent: "center", alignItems: "center" },
  customDateBannerTitle: { fontSize: 15, fontWeight: "800" },
  customDateBannerSub: { fontSize: 12, marginTop: 2, fontWeight: "500" },
  customDateBannerBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: "rgba(99,91,255,0.12)" },
  customDateBannerBtnText: { fontSize: 12, fontWeight: "800", color: "#635BFF" },

  calModalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: 16 },
  calModalCard: { borderRadius: 24, borderWidth: 1.5, padding: spacing.lg, shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10 },
  calHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  calCloseBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center" },
  calMonthNav: { flexDirection: "row", alignItems: "center", gap: 12 },
  calNavArrow: { width: 32, height: 32, borderRadius: 16, justifyContent: "center", alignItems: "center" },
  calMonthTitle: { fontSize: 18, fontWeight: "900" },
  weekdaysRow: { flexDirection: "row", marginBottom: spacing.sm },
  weekdayCol: { flex: 1, alignItems: "center", justifyContent: "center" },
  weekdayText: { fontSize: 14, fontWeight: "700" },
  calGrid: { gap: 4, marginBottom: spacing.md },
  calWeekRow: { flexDirection: "row", height: 40 },
  calDayCell: { flex: 1, height: 40, justifyContent: "center", alignItems: "center" },
  calDayText: { fontSize: 15 },
  presetsList: { gap: 8, paddingVertical: 4, marginBottom: spacing.md },
  presetChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1 },
  presetChipText: { fontSize: 12, fontWeight: "700" },
  calFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: spacing.md, borderTopWidth: 1 },
  calSelectionSummary: { flex: 1, marginRight: 12 },
  calSelectionLabel: { fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  calSelectionValue: { fontSize: 14, fontWeight: "800", marginTop: 2 },
  applyBtn: { backgroundColor: "#635BFF", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 16 },
  applyBtnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
});
