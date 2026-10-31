import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Modal,
  SafeAreaView,
  StatusBar,
  Alert,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/context/ThemeContext";
import { api } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/theme";
import { useResponsive } from "@/src/hooks/useResponsive";
import { formatCurrency, printClosingReport } from "@/src/lib/print";
import SyncStatusIndicator from "@/src/components/SyncStatusIndicator";

const DENOMINATIONS = [500, 200, 100, 50, 20, 10];

export default function CashClosingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { theme, isDark } = useTheme();
  const { isDesktop } = useResponsive();

  // Tab: "active" (Live Shift & Close) | "history" (Past Shifts & Approvals)
  const [activeTab, setActiveTab] = useState<"active" | "history">("active");

  // Live Session State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentSession, setCurrentSession] = useState<any>(null);
  const [sessionMetrics, setSessionMetrics] = useState<any>(null);
  const [restaurant, setRestaurant] = useState<any>(null);

  // Open Shift Form State
  const [openFloat, setOpenFloat] = useState("1000");
  const [openNotes, setOpenNotes] = useState("");
  const [openingDate, setOpeningDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [openingCashier, setOpeningCashier] = useState(() => user?.full_name || user?.email?.split("@")[0] || "Cashier");
  const [submittingOpen, setSubmittingOpen] = useState(false);

  // Cash Movement Modal State
  const [movementModalVisible, setMovementModalVisible] = useState(false);
  const [movementType, setMovementType] = useState<"cash_in" | "cash_out" | "cash_drop">("cash_in");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementReason, setMovementReason] = useState("");
  const [submittingMovement, setSubmittingMovement] = useState(false);

  // Denominations Counter State
  const [denomCounts, setDenomCounts] = useState<Record<string, number>>({
    "500": 0,
    "200": 0,
    "100": 0,
    "50": 0,
    "20": 0,
    "10": 0,
    coins: 0,
  });

  // Digital Reconciliation State
  const [upiCountInput, setUpiCountInput] = useState("");
  const [upiAmountInput, setUpiAmountInput] = useState("");
  const [cardCountInput, setCardCountInput] = useState("");
  const [cardAmountInput, setCardAmountInput] = useState("");
  const [discrepancyReason, setDiscrepancyReason] = useState("");
  const [closingNotes, setClosingNotes] = useState("");

  // Closing Confirmation & Summary Modal
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [closedSummaryModalVisible, setClosedSummaryModalVisible] = useState(false);
  const [lastClosedSession, setLastClosedSession] = useState<any>(null);
  const [submittingClose, setSubmittingClose] = useState(false);

  // History State
  const [historySessions, setHistorySessions] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Manager Approval Modal
  const [approvalModalVisible, setApprovalModalVisible] = useState(false);
  const [selectedSessionToApprove, setSelectedSessionToApprove] = useState<any>(null);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [submittingApproval, setSubmittingApproval] = useState(false);

  const isOwnerOrManager = user?.role === "owner" || user?.role === "manager" || user?.role === "super_admin";

  // Calculate counted physical cash
  const countedNotesTotal = DENOMINATIONS.reduce((sum, denom) => {
    return sum + (denomCounts[String(denom)] || 0) * denom;
  }, 0);
  const countedCoinsTotal = Number(denomCounts["coins"] || 0);
  const totalCountedCash = countedNotesTotal + countedCoinsTotal;

  // Expected cash from live calculation
  const expectedCash = Number(sessionMetrics?.expected_cash ?? currentSession?.expected_cash ?? (
    Number(currentSession?.opening_float || 0) +
    Number(sessionMetrics?.total_cash_sales || 0) +
    Number(sessionMetrics?.cash_in || 0) -
    Number(sessionMetrics?.cash_refunds || 0) -
    Number(sessionMetrics?.cash_out || 0) -
    Number(sessionMetrics?.cash_drop || 0)
  ));

  const cashDiscrepancy = totalCountedCash - expectedCash;

  // Expected UPI & Card
  const expectedUpi = Number(sessionMetrics?.total_upi_sales || 0);
  const reconciledUpi = upiAmountInput.trim() ? Number(upiAmountInput) : expectedUpi;
  const upiDiscrepancy = reconciledUpi - expectedUpi;

  const expectedCard = Number(sessionMetrics?.total_card_sales || 0);
  const reconciledCard = cardAmountInput.trim() ? Number(cardAmountInput) : expectedCard;
  const cardDiscrepancy = reconciledCard - expectedCard;

  const hasAnyDiscrepancy = Math.abs(cashDiscrepancy) > 0.5 || Math.abs(upiDiscrepancy) > 0.5 || Math.abs(cardDiscrepancy) > 0.5;

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [sessionData, rest] = await Promise.all([
        api.getCurrentCashSession(),
        api.getRestaurant().catch(() => api.getCachedRestaurant()),
      ]);
      if (rest) setRestaurant(rest);
      if (sessionData && sessionData.session) {
        setCurrentSession(sessionData.session);
        setSessionMetrics(sessionData.calculated_metrics || sessionData.session);
      } else {
        setCurrentSession(null);
        setSessionMetrics(null);
      }
    } catch (err) {
      console.warn("Error loading cash session:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const res = await api.listCashSessionsHistory();
      if (res && res.sessions) {
        setHistorySessions(res.sessions);
      }
    } catch (err) {
      console.warn("Error loading session history:", err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (activeTab === "history") {
      loadHistory();
    }
  }, [activeTab, loadHistory]);

  const handleOpenSession = async () => {
    const floatNum = parseFloat(openFloat);
    if (isNaN(floatNum) || floatNum < 0) {
      Alert.alert("Invalid Float", "Please enter a valid opening cash float amount (e.g. ₹1000).");
      return;
    }
    try {
      setSubmittingOpen(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      const res = await api.openCashSession({
        opening_float: floatNum,
        business_date: openingDate,
        cashier_name: openingCashier.trim() || user?.full_name || "Cashier",
        notes: openNotes.trim() || undefined,
      });
      if (res && res.session) {
        setCurrentSession(res.session);
        setSessionMetrics(res.session);
        // Reset denominations
        setDenomCounts({ "500": 0, "200": 0, "100": 0, "50": 0, "20": 0, "10": 0, coins: 0 });
        setUpiCountInput("");
        setUpiAmountInput("");
        setCardCountInput("");
        setCardAmountInput("");
        setDiscrepancyReason("");
        setClosingNotes("");
        Alert.alert("Shift Started", `Shift opened for ${openingCashier} with ₹${floatNum} float.`);
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to open shift.");
    } finally {
      setSubmittingOpen(false);
    }
  };

  const handleRecordMovement = async () => {
    const amt = parseFloat(movementAmount);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount greater than 0.");
      return;
    }
    if (!movementReason.trim()) {
      Alert.alert("Reason Required", "Please provide a reason or note for this cash movement.");
      return;
    }

    try {
      setSubmittingMovement(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      const res = await api.recordCashMovement({
        type: movementType,
        amount: amt,
        reason: movementReason.trim(),
      });
      setMovementModalVisible(false);
      setMovementAmount("");
      setMovementReason("");
      // Reload session
      await loadData();
      Alert.alert(
        "Movement Saved",
        `${movementType === "cash_in" ? "Cash In" : movementType === "cash_out" ? "Payout / Expense" : "Safe Drop"} of ₹${amt} recorded successfully.`
      );
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to record cash movement.");
    } finally {
      setSubmittingMovement(false);
    }
  };

  const handleCloseSession = async () => {
    if (hasAnyDiscrepancy && !discrepancyReason.trim()) {
      Alert.alert(
        "Discrepancy Reason Required",
        "There is a discrepancy between calculated and counted amounts. Please enter an explanation in the 'Discrepancy Explanation' box before closing."
      );
      return;
    }

    try {
      setSubmittingClose(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const res = await api.closeCashSession({
        actual_cash_counted: totalCountedCash,
        cash_denominations: denomCounts,
        reconciled_upi_count: upiCountInput ? parseInt(upiCountInput, 10) : undefined,
        reconciled_upi_total: upiAmountInput ? parseFloat(upiAmountInput) : undefined,
        reconciled_card_count: cardCountInput ? parseInt(cardCountInput, 10) : undefined,
        reconciled_card_total: cardAmountInput ? parseFloat(cardAmountInput) : undefined,
        discrepancy_reason: discrepancyReason.trim() || undefined,
        closing_notes: closingNotes.trim() || undefined,
      });

      setConfirmModalVisible(false);
      if (res && res.session) {
        setLastClosedSession(res.session);
        setClosedSummaryModalVisible(true);
        setCurrentSession(null);
        setSessionMetrics(null);
      } else {
        await loadData();
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to close cash session.");
    } finally {
      setSubmittingClose(false);
    }
  };

  const handleApproveDiscrepancy = async () => {
    if (!selectedSessionToApprove) return;
    try {
      setSubmittingApproval(true);
      await api.approveCashSessionDiscrepancy(selectedSessionToApprove.id, {
        approval_notes: approvalNotes.trim() || undefined,
      });
      setApprovalModalVisible(false);
      setSelectedSessionToApprove(null);
      setApprovalNotes("");
      await loadHistory();
      Alert.alert("Success", "Shift discrepancy approved and marked resolved.");
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to approve discrepancy.");
    } finally {
      setSubmittingApproval(false);
    }
  };

  const updateDenom = (denomKey: string, delta: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setDenomCounts((prev) => {
      const current = prev[denomKey] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [denomKey]: next };
    });
  };

  const setDenomDirect = (denomKey: string, valStr: string) => {
    const num = parseInt(valStr.replace(/[^0-9]/g, ""), 10) || 0;
    setDenomCounts((prev) => ({ ...prev, [denomKey]: num }));
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.surface }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.surface} />
      
      {/* App Header */}
      <View style={[styles.header, { borderBottomColor: theme.border, backgroundColor: theme.surface, paddingTop: Platform.OS === "android" ? Math.max(insets.top, (StatusBar.currentHeight || 0) + 16, 52) : Math.max(insets.top, 14) }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace("/(app)/dashboard");
              }
            }}
            style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1, backgroundColor: isDark ? "#222" : "#F1F5F9" }]}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          >
            <Ionicons name="arrow-back" size={20} color={theme.onSurface} />
          </Pressable>
          <View>
            <Text style={[styles.headerTitle, { color: theme.onSurface }]}>Cashier Closing & EOD</Text>
            <Text style={[styles.headerSubtitle, { color: theme.onSurfaceSecondary }]}>Reconciliation · Shifts · Cash Drawer</Text>
          </View>
        </View>

        {/* Sync Status & Tab Switch */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <SyncStatusIndicator compact />
          <View style={[styles.tabSegment, { backgroundColor: isDark ? "#1E1E24" : "#E2E8F0" }]}>
            <Pressable
              style={({ pressed }) => [
                styles.tabBtn,
                activeTab === "active" && [styles.tabBtnActive, { backgroundColor: "#635BFF" }],
                pressed && { opacity: 0.7 }
              ]}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setActiveTab("active");
              }}
            >
              <Ionicons
                name="wallet-outline"
                size={16}
                color={activeTab === "active" ? "#FFFFFF" : theme.onSurfaceSecondary}
              />
              <Text
                style={[
                  styles.tabBtnText,
                  { color: activeTab === "active" ? "#FFFFFF" : theme.onSurfaceSecondary },
                ]}
              >
                Active Shift
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.tabBtn,
                activeTab === "history" && [styles.tabBtnActive, { backgroundColor: "#635BFF" }],
                pressed && { opacity: 0.7 }
              ]}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setActiveTab("history");
              }}
            >
              <Ionicons
                name="time-outline"
                size={16}
                color={activeTab === "history" ? "#FFFFFF" : theme.onSurfaceSecondary}
              />
              <Text
                style={[
                  styles.tabBtnText,
                  { color: activeTab === "history" ? "#FFFFFF" : theme.onSurfaceSecondary },
                ]}
              >
                History & Audits
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* Main Content Area */}
      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#635BFF" />
          <Text style={[styles.loadingText, { color: theme.onSurfaceSecondary }]}>Loading Cashier Session...</Text>
        </View>
      ) : activeTab === "history" ? (
        /* History & Audits View */
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { maxWidth: isDesktop ? 960 : undefined, alignSelf: isDesktop ? "center" : undefined, width: "100%" },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.historyHeaderRow}>
            <Text style={[styles.sectionTitle, { color: theme.onSurface }]}>Closed Shifts & Discrepancy Audits</Text>
            <Pressable
              onPress={loadHistory}
              style={[styles.refreshBtn, { backgroundColor: isDark ? "#2A2A36" : "#EEF2FF" }]}
            >
              <Ionicons name="refresh" size={16} color="#635BFF" />
              <Text style={{ color: "#635BFF", fontWeight: "700", fontSize: 13 }}>Refresh</Text>
            </Pressable>
          </View>

          {historyLoading ? (
            <ActivityIndicator style={{ marginTop: 40 }} color="#635BFF" />
          ) : historySessions.length === 0 ? (
            <View style={[styles.emptyBox, { borderColor: theme.border, backgroundColor: theme.surfaceSecondary }]}>
              <Ionicons name="file-tray-outline" size={48} color={theme.onSurfaceTertiary} />
              <Text style={[styles.emptyTitle, { color: theme.onSurface }]}>No Closed Shifts Yet</Text>
              <Text style={[styles.emptySubtitle, { color: theme.onSurfaceSecondary }]}>
                When shifts are closed at the end of each business day, full reconciliation reports will appear here.
              </Text>
            </View>
          ) : (
            historySessions.map((s) => {
              const variance = Number(s.discrepancy_amount || 0);
              const isBalanced = Math.abs(variance) < 0.5;
              const isShort = variance < -0.5;
              const isApproved = s.is_approved || isBalanced;

              return (
                <View
                  key={s.id}
                  style={[
                    styles.historyCard,
                    { backgroundColor: theme.surfaceSecondary, borderColor: isShort && !isApproved ? "#EF4444" : theme.border },
                  ]}
                >
                  <View style={styles.historyCardHeader}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text style={[styles.historyDate, { color: theme.onSurface }]}>
                          {s.business_date || new Date(s.closed_at).toLocaleDateString()}
                        </Text>
                        <View
                          style={[
                            styles.varianceBadge,
                            {
                              backgroundColor: isBalanced
                                ? "#10B98120"
                                : isShort
                                ? "#EF444420"
                                : "#F59E0B20",
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.varianceBadgeText,
                              {
                                color: isBalanced
                                  ? "#10B981"
                                  : isShort
                                  ? "#EF4444"
                                  : "#F59E0B",
                              },
                            ]}
                          >
                            {isBalanced
                              ? "✅ Balanced"
                              : isShort
                              ? `⚠️ Short: -₹${Math.abs(variance).toFixed(0)}`
                              : `ℹ️ Over: +₹${variance.toFixed(0)}`}
                          </Text>
                        </View>
                      </View>
                      <Text style={[styles.historyCashier, { color: theme.onSurfaceSecondary }]}>
                        Cashier: {s.cashier_name || "Staff"} · Shift #{String(s.id).slice(-6).toUpperCase()}
                      </Text>
                    </View>

                    {/* Print / Actions */}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Pressable
                        style={[styles.printIconBtn, { backgroundColor: isDark ? "#2A2A36" : "#EEF2FF" }]}
                        onPress={() => printClosingReport(s, restaurant)}
                      >
                        <Ionicons name="print-outline" size={18} color="#635BFF" />
                        <Text style={{ color: "#635BFF", fontWeight: "700", fontSize: 12 }}>Print</Text>
                      </Pressable>

                      {isOwnerOrManager && !isApproved && (
                        <Pressable
                          style={[styles.approveBtn]}
                          onPress={() => {
                            setSelectedSessionToApprove(s);
                            setApprovalNotes("");
                            setApprovalModalVisible(true);
                          }}
                        >
                          <Ionicons name="checkmark-circle-outline" size={16} color="#FFFFFF" />
                          <Text style={styles.approveBtnText}>Approve</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>

                  {/* Numbers Grid */}
                  <View style={[styles.historyGrid, { borderTopColor: theme.border }]}>
                    <View style={styles.historyGridCol}>
                      <Text style={[styles.gridLabel, { color: theme.onSurfaceSecondary }]}>Opening Float</Text>
                      <Text style={[styles.gridVal, { color: theme.onSurface }]}>₹{s.opening_float || 0}</Text>
                    </View>
                    <View style={styles.historyGridCol}>
                      <Text style={[styles.gridLabel, { color: theme.onSurfaceSecondary }]}>Cash Sales</Text>
                      <Text style={[styles.gridVal, { color: theme.onSurface }]}>₹{s.total_cash_sales || 0}</Text>
                    </View>
                    <View style={styles.historyGridCol}>
                      <Text style={[styles.gridLabel, { color: theme.onSurfaceSecondary }]}>UPI / Cards</Text>
                      <Text style={[styles.gridVal, { color: theme.onSurface }]}>
                        ₹{(Number(s.total_upi_sales || 0) + Number(s.total_card_sales || 0)).toFixed(0)}
                      </Text>
                    </View>
                    <View style={styles.historyGridCol}>
                      <Text style={[styles.gridLabel, { color: theme.onSurfaceSecondary }]}>Gross Sales</Text>
                      <Text style={[styles.gridVal, { color: "#635BFF", fontWeight: "800" }]}>₹{s.gross_sales || 0}</Text>
                    </View>
                    <View style={styles.historyGridCol}>
                      <Text style={[styles.gridLabel, { color: theme.onSurfaceSecondary }]}>Expected Cash</Text>
                      <Text style={[styles.gridVal, { color: theme.onSurface }]}>₹{s.expected_cash || 0}</Text>
                    </View>
                    <View style={styles.historyGridCol}>
                      <Text style={[styles.gridLabel, { color: theme.onSurfaceSecondary }]}>Counted Cash</Text>
                      <Text style={[styles.gridVal, { color: theme.onSurface }]}>₹{s.actual_cash_counted || 0}</Text>
                    </View>
                  </View>

                  {/* Discrepancy explanation or approval status */}
                  {s.discrepancy_reason ? (
                    <View style={[styles.noteBox, { backgroundColor: isDark ? "#2A1D20" : "#FEF2F2" }]}>
                      <Text style={[styles.noteBoxTitle, { color: "#EF4444" }]}>Cashier Note:</Text>
                      <Text style={[styles.noteBoxContent, { color: theme.onSurface }]}>{s.discrepancy_reason}</Text>
                    </View>
                  ) : null}

                  {s.is_approved ? (
                    <View style={[styles.approvedBox, { backgroundColor: isDark ? "#122A1E" : "#ECFDF5" }]}>
                      <Ionicons name="shield-checkmark" size={16} color="#10B981" />
                      <Text style={[styles.approvedText, { color: "#10B981" }]}>
                        Approved by {s.approved_by_name || "Manager"}{" "}
                        {s.approval_notes ? `— "${s.approval_notes}"` : ""}
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </ScrollView>
      ) : !currentSession ? (
        /* No Open Session: Start Shift Form */
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { maxWidth: 640, alignSelf: "center", width: "100%" },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.openCard, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
            <View style={styles.openIconWrap}>
              <Ionicons name="lock-open-outline" size={32} color="#635BFF" />
            </View>
            <Text style={[styles.openCardTitle, { color: theme.onSurface }]}>Open Cashier Shift</Text>
            <Text style={[styles.openCardSub, { color: theme.onSurfaceSecondary }]}>
              Start a new business shift. Record your opening cash float in the drawer to track all incoming sales and drawer payouts accurately.
            </Text>

            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: theme.onSurfaceSecondary }]}>CASHIER NAME</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surface, color: theme.onSurface, borderColor: theme.border }]}
                value={openingCashier}
                onChangeText={setOpeningCashier}
                placeholder="Cashier Full Name"
                placeholderTextColor={theme.onSurfaceTertiary}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: theme.onSurfaceSecondary }]}>BUSINESS DATE</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surface, color: theme.onSurface, borderColor: theme.border }]}
                value={openingDate}
                onChangeText={setOpeningDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.onSurfaceTertiary}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: theme.onSurfaceSecondary }]}>OPENING CASH FLOAT (₹)</Text>
              <View style={styles.inputPrefixWrap}>
                <Text style={[styles.inputPrefix, { color: theme.onSurfaceSecondary }]}>₹</Text>
                <TextInput
                  style={[
                    styles.input,
                    styles.inputWithPrefix,
                    { backgroundColor: theme.surface, color: theme.onSurface, borderColor: theme.border },
                  ]}
                  value={openFloat}
                  onChangeText={setOpenFloat}
                  keyboardType="numeric"
                  placeholder="1000"
                  placeholderTextColor={theme.onSurfaceTertiary}
                />
              </View>
              <Text style={[styles.fieldHint, { color: theme.onSurfaceTertiary }]}>
                Count physical cash currently inside the till before taking orders.
              </Text>
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: theme.onSurfaceSecondary }]}>SHIFT NOTES (OPTIONAL)</Text>
              <TextInput
                style={[
                  styles.input,
                  styles.inputMultiline,
                  { backgroundColor: theme.surface, color: theme.onSurface, borderColor: theme.border },
                ]}
                value={openNotes}
                onChangeText={setOpenNotes}
                placeholder="Morning shift / Register #1 / Notes"
                placeholderTextColor={theme.onSurfaceTertiary}
                multiline
                numberOfLines={2}
              />
            </View>

            <Pressable
              style={[styles.primaryBtn, submittingOpen && { opacity: 0.7 }]}
              onPress={handleOpenSession}
              disabled={submittingOpen}
            >
              {submittingOpen ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="play" size={18} color="#FFFFFF" />
                  <Text style={styles.primaryBtnText}>Start Cashier Shift</Text>
                </>
              )}
            </Pressable>
          </View>
        </ScrollView>
      ) : (
        /* Active Shift & Live End of Day Closing View */
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { maxWidth: isDesktop ? 1040 : undefined, alignSelf: isDesktop ? "center" : undefined, width: "100%" },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Active Shift Banner */}
          <View style={[styles.activeBanner, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
            <View style={styles.activeBannerTop}>
              <View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={styles.pulseDot} />
                  <Text style={[styles.activeBannerTitle, { color: theme.onSurface }]}>
                    Active Shift · {currentSession.cashier_name || "Cashier"}
                  </Text>
                </View>
                <Text style={[styles.activeBannerSub, { color: theme.onSurfaceSecondary }]}>
                  Business Date: {currentSession.business_date || "Today"} · Opened at{" "}
                  {new Date(currentSession.opened_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>

              {/* Action Buttons: Cash In, Cash Out, Cash Drop */}
              <View style={styles.movementButtonsRow}>
                <Pressable
                  style={[styles.movementBtn, { backgroundColor: isDark ? "#122A1E" : "#ECFDF5", borderColor: "#10B981" }]}
                  onPress={() => {
                    setMovementType("cash_in");
                    setMovementAmount("");
                    setMovementReason("");
                    setMovementModalVisible(true);
                  }}
                >
                  <Ionicons name="add-circle" size={16} color="#10B981" />
                  <Text style={[styles.movementBtnText, { color: "#10B981" }]}>+ Cash In</Text>
                </Pressable>

                <Pressable
                  style={[styles.movementBtn, { backgroundColor: isDark ? "#2A1D20" : "#FEF2F2", borderColor: "#EF4444" }]}
                  onPress={() => {
                    setMovementType("cash_out");
                    setMovementAmount("");
                    setMovementReason("");
                    setMovementModalVisible(true);
                  }}
                >
                  <Ionicons name="remove-circle" size={16} color="#EF4444" />
                  <Text style={[styles.movementBtnText, { color: "#EF4444" }]}>- Payout</Text>
                </Pressable>

                <Pressable
                  style={[styles.movementBtn, { backgroundColor: isDark ? "#262214" : "#FFFBEB", borderColor: "#F59E0B" }]}
                  onPress={() => {
                    setMovementType("cash_drop");
                    setMovementAmount("");
                    setMovementReason("");
                    setMovementModalVisible(true);
                  }}
                >
                  <Ionicons name="arrow-down-circle" size={16} color="#F59E0B" />
                  <Text style={[styles.movementBtnText, { color: "#F59E0B" }]}>↓ Safe Drop</Text>
                </Pressable>
              </View>
            </View>

            {/* Unpaid Bills Warning */}
            {sessionMetrics && sessionMetrics.unpaid_bills_count > 0 && (
              <View style={[styles.unpaidWarning, { backgroundColor: isDark ? "#2A1D20" : "#FEF2F2", borderColor: "#EF4444" }]}>
                <Ionicons name="alert-circle" size={20} color="#EF4444" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.unpaidWarningTitle, { color: "#EF4444" }]}>
                    {sessionMetrics.unpaid_bills_count} Unpaid / Open Order(s) Detected
                  </Text>
                  <Text style={[styles.unpaidWarningSub, { color: theme.onSurfaceSecondary }]}>
                    Total pending: ₹{sessionMetrics.unpaid_bills_amount}. Settle or cancel open tables before locking end-of-day.
                  </Text>
                </View>
                <Pressable
                  style={[styles.unpaidActionBtn, { backgroundColor: "#EF4444" }]}
                  onPress={() => router.push("/(app)/waiter")}
                >
                  <Text style={styles.unpaidActionBtnText}>View POS</Text>
                </Pressable>
              </View>
            )}
          </View>

          {/* Section 1: Drawer Accounting & Sales Breakdown */}
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: theme.onSurface }]}>1. Expected Cash & Sales Totals</Text>
            <Pressable onPress={loadData} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="refresh" size={14} color="#635BFF" />
              <Text style={{ fontSize: 12, color: "#635BFF", fontWeight: "700" }}>Live Refresh</Text>
            </Pressable>
          </View>

          <View style={styles.statCardsRow}>
            {/* Expected Drawer Cash Card */}
            <View style={[styles.statCard, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border, flex: 1.2 }]}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={[styles.statCardLabel, { color: theme.onSurfaceSecondary }]}>EXPECTED DRAWER CASH</Text>
                <Ionicons name="cash" size={20} color="#10B981" />
              </View>
              <Text style={[styles.statCardValue, { color: "#10B981" }]}>₹{expectedCash.toFixed(0)}</Text>
              
              {/* Formula details */}
              <View style={[styles.statCardDetails, { borderTopColor: theme.border }]}>
                <Text style={[styles.statDetailText, { color: theme.onSurfaceSecondary }]}>
                  Opening Float: ₹{currentSession.opening_float || 0}
                </Text>
                <Text style={[styles.statDetailText, { color: theme.onSurfaceSecondary }]}>
                  (+) Cash Sales: ₹{sessionMetrics?.total_cash_sales || 0}
                </Text>
                {Number(sessionMetrics?.cash_in || 0) > 0 && (
                  <Text style={[styles.statDetailText, { color: "#10B981" }]}>
                    (+) Cash In: ₹{sessionMetrics?.cash_in}
                  </Text>
                )}
                {Number(sessionMetrics?.cash_out || 0) > 0 && (
                  <Text style={[styles.statDetailText, { color: "#EF4444" }]}>
                    (-) Payouts: -₹{sessionMetrics?.cash_out}
                  </Text>
                )}
                {Number(sessionMetrics?.cash_drop || 0) > 0 && (
                  <Text style={[styles.statDetailText, { color: "#F59E0B" }]}>
                    (-) Safe Drops: -₹{sessionMetrics?.cash_drop}
                  </Text>
                )}
              </View>
            </View>

            {/* UPI & Digital Sales Card */}
            <View style={[styles.statCard, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border, flex: 1 }]}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={[styles.statCardLabel, { color: theme.onSurfaceSecondary }]}>UPI / QR SALES</Text>
                <Ionicons name="qr-code" size={20} color="#635BFF" />
              </View>
              <Text style={[styles.statCardValue, { color: "#635BFF" }]}>
                ₹{(sessionMetrics?.total_upi_sales || 0).toFixed(0)}
              </Text>
              <View style={[styles.statCardDetails, { borderTopColor: theme.border }]}>
                <Text style={[styles.statDetailText, { color: theme.onSurfaceSecondary }]}>
                  Bills: {sessionMetrics?.upi_sales_count || 0}
                </Text>
                <Text style={[styles.statDetailText, { color: theme.onSurfaceSecondary }]}>
                  Cards: ₹{sessionMetrics?.total_card_sales || 0} ({sessionMetrics?.card_sales_count || 0} bills)
                </Text>
              </View>
            </View>

            {/* Gross & Net Sales Card */}
            <View style={[styles.statCard, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border, flex: 1 }]}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={[styles.statCardLabel, { color: theme.onSurfaceSecondary }]}>GROSS REVENUE</Text>
                <Ionicons name="trending-up" size={20} color={theme.onSurface} />
              </View>
              <Text style={[styles.statCardValue, { color: theme.onSurface }]}>
                ₹{(sessionMetrics?.gross_sales || 0).toFixed(0)}
              </Text>
              <View style={[styles.statCardDetails, { borderTopColor: theme.border }]}>
                <Text style={[styles.statDetailText, { color: theme.onSurfaceSecondary }]}>
                  GST Taxes: ₹{sessionMetrics?.total_taxes || 0}
                </Text>
                <Text style={[styles.statDetailText, { color: theme.onSurfaceSecondary }]}>
                  Discounts: -₹{sessionMetrics?.total_discounts || 0}
                </Text>
              </View>
            </View>
          </View>

          {/* Section 2: Physical Denomination Cash Calculator */}
          <Text style={[styles.sectionTitle, { color: theme.onSurface, marginTop: spacing.lg }]}>
            2. Cash Denomination Counting (Indian Till)
          </Text>
          <Text style={[styles.sectionSubtitle, { color: theme.onSurfaceSecondary }]}>
            Count currency notes and coins physically inside your drawer:
          </Text>

          <View style={[styles.denomContainer, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
            <View style={styles.denomGrid}>
              {DENOMINATIONS.map((denom) => {
                const count = denomCounts[String(denom)] || 0;
                const totalForDenom = count * denom;
                return (
                  <View key={denom} style={[styles.denomItem, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                    <View style={styles.denomBadge}>
                      <Text style={styles.denomBadgeText}>₹{denom}</Text>
                    </View>

                    {/* Steppers */}
                    <View style={styles.denomStepper}>
                      <Pressable
                        style={[styles.stepperBtn, { backgroundColor: isDark ? "#2A2A36" : "#F1F5F9" }]}
                        onPress={() => updateDenom(String(denom), -1)}
                      >
                        <Ionicons name="remove" size={16} color={theme.onSurface} />
                      </Pressable>

                      <TextInput
                        style={[styles.denomInput, { color: theme.onSurface }]}
                        value={String(count)}
                        onChangeText={(v) => setDenomDirect(String(denom), v)}
                        keyboardType="numeric"
                        selectTextOnFocus
                      />

                      <Pressable
                        style={[styles.stepperBtn, { backgroundColor: isDark ? "#2A2A36" : "#F1F5F9" }]}
                        onPress={() => updateDenom(String(denom), 1)}
                      >
                        <Ionicons name="add" size={16} color={theme.onSurface} />
                      </Pressable>
                    </View>

                    <Text style={[styles.denomRowTotal, { color: theme.onSurfaceSecondary }]}>
                      = ₹{totalForDenom.toLocaleString("en-IN")}
                    </Text>
                  </View>
                );
              })}

              {/* Coins Input Box */}
              <View style={[styles.denomItem, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                <View style={[styles.denomBadge, { backgroundColor: "#F59E0B" }]}>
                  <Text style={styles.denomBadgeText}>Coins</Text>
                </View>
                <View style={styles.denomStepper}>
                  <TextInput
                    style={[styles.denomInput, { color: theme.onSurface, width: 90 }]}
                    value={String(denomCounts["coins"] || "")}
                    onChangeText={(v) => setDenomDirect("coins", v)}
                    keyboardType="numeric"
                    placeholder="₹ Coins"
                    placeholderTextColor={theme.onSurfaceTertiary}
                  />
                </View>
                <Text style={[styles.denomRowTotal, { color: theme.onSurfaceSecondary }]}>
                  = ₹{(denomCounts["coins"] || 0).toLocaleString("en-IN")}
                </Text>
              </View>
            </View>

            {/* Total Counted & Discrepancy Indicator Bar */}
            <View style={[styles.varianceSummaryBar, { borderTopColor: theme.border }]}>
              <View>
                <Text style={[styles.varianceLabel, { color: theme.onSurfaceSecondary }]}>TOTAL PHYSICAL CASH COUNTED</Text>
                <Text style={[styles.varianceBigNumber, { color: theme.onSurface }]}>₹{totalCountedCash.toFixed(0)}</Text>
              </View>

              <View style={styles.varianceResultBox}>
                <Text style={[styles.varianceLabel, { color: theme.onSurfaceSecondary }]}>DRAWER STATUS</Text>
                <View
                  style={[
                    styles.varianceStatusPill,
                    {
                      backgroundColor:
                        Math.abs(cashDiscrepancy) < 0.5
                          ? "#10B98120"
                          : cashDiscrepancy < -0.5
                          ? "#EF444420"
                          : "#F59E0B20",
                    },
                  ]}
                >
                  <Ionicons
                    name={
                      Math.abs(cashDiscrepancy) < 0.5
                        ? "checkmark-circle"
                        : cashDiscrepancy < -0.5
                        ? "alert-circle"
                        : "information-circle"
                    }
                    size={16}
                    color={
                      Math.abs(cashDiscrepancy) < 0.5
                        ? "#10B981"
                        : cashDiscrepancy < -0.5
                        ? "#EF4444"
                        : "#F59E0B"
                    }
                  />
                  <Text
                    style={[
                      styles.varianceStatusPillText,
                      {
                        color:
                          Math.abs(cashDiscrepancy) < 0.5
                            ? "#10B981"
                            : cashDiscrepancy < -0.5
                            ? "#EF4444"
                            : "#F59E0B",
                      },
                    ]}
                  >
                    {Math.abs(cashDiscrepancy) < 0.5
                      ? "Drawer Balanced (₹0.00)"
                      : cashDiscrepancy < -0.5
                      ? `Shortage: -₹${Math.abs(cashDiscrepancy).toFixed(0)}`
                      : `Overage: +₹${cashDiscrepancy.toFixed(0)}`}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Section 3: Digital Payments (UPI / Card) Reconciliation */}
          <Text style={[styles.sectionTitle, { color: theme.onSurface, marginTop: spacing.lg }]}>
            3. UPI & Card Reconciliation (Optional)
          </Text>
          <View style={[styles.groupCard, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
            <View style={styles.reconcileRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.reconcileLabel, { color: theme.onSurface }]}>UPI Bank Statement Total</Text>
                <Text style={[styles.reconcileSub, { color: theme.onSurfaceSecondary }]}>
                  System Expected: ₹{expectedUpi.toFixed(0)}
                </Text>
              </View>
              <TextInput
                style={[styles.reconcileInput, { backgroundColor: theme.surface, color: theme.onSurface, borderColor: theme.border }]}
                value={upiAmountInput}
                onChangeText={setUpiAmountInput}
                keyboardType="numeric"
                placeholder={`₹${expectedUpi.toFixed(0)}`}
                placeholderTextColor={theme.onSurfaceTertiary}
              />
            </View>

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            <View style={styles.reconcileRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.reconcileLabel, { color: theme.onSurface }]}>Card EDC Settlement Total</Text>
                <Text style={[styles.reconcileSub, { color: theme.onSurfaceSecondary }]}>
                  System Expected: ₹{expectedCard.toFixed(0)}
                </Text>
              </View>
              <TextInput
                style={[styles.reconcileInput, { backgroundColor: theme.surface, color: theme.onSurface, borderColor: theme.border }]}
                value={cardAmountInput}
                onChangeText={setCardAmountInput}
                keyboardType="numeric"
                placeholder={`₹${expectedCard.toFixed(0)}`}
                placeholderTextColor={theme.onSurfaceTertiary}
              />
            </View>
          </View>

          {/* Discrepancy Note Box (Mandatory if variance != 0) */}
          {hasAnyDiscrepancy && (
            <View style={[styles.discrepancyCard, { backgroundColor: isDark ? "#2A1D20" : "#FEF2F2", borderColor: "#EF4444" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Ionicons name="warning" size={20} color="#EF4444" />
                <Text style={[styles.discrepancyCardTitle, { color: "#EF4444" }]}>
                  Discrepancy Explanation Required
                </Text>
              </View>
              <Text style={[styles.discrepancyCardSub, { color: theme.onSurfaceSecondary }]}>
                A variance was detected in drawer cash or digital reconciliation. Please document the reason for owner/manager audit:
              </Text>
              <TextInput
                style={[
                  styles.input,
                  styles.inputMultiline,
                  { backgroundColor: theme.surface, color: theme.onSurface, borderColor: "#EF4444" },
                ]}
                value={discrepancyReason}
                onChangeText={setDiscrepancyReason}
                placeholder="Reason: e.g. Petty cash spent for vegetables, change shortage, customer UPI delay..."
                placeholderTextColor={theme.onSurfaceTertiary}
                multiline
                numberOfLines={3}
              />
            </View>
          )}

          {/* General Closing Notes */}
          <View style={styles.formGroup}>
            <Text style={[styles.formLabel, { color: theme.onSurfaceSecondary }]}>GENERAL CLOSING NOTES (OPTIONAL)</Text>
            <TextInput
              style={[
                styles.input,
                styles.inputMultiline,
                { backgroundColor: theme.surfaceSecondary, color: theme.onSurface, borderColor: theme.border },
              ]}
              value={closingNotes}
              onChangeText={setClosingNotes}
              placeholder="Handover to evening staff, clean counters, remarks..."
              placeholderTextColor={theme.onSurfaceTertiary}
              multiline
              numberOfLines={2}
            />
          </View>

          {/* Close Shift Action Button */}
          <Pressable
            style={[
              styles.closeShiftBtn,
              { backgroundColor: hasAnyDiscrepancy && !discrepancyReason.trim() ? "#9CA3AF" : "#635BFF" },
            ]}
            onPress={() => setConfirmModalVisible(true)}
          >
            <Ionicons name="lock-closed" size={20} color="#FFFFFF" />
            <Text style={styles.closeShiftBtnText}>Review & Close Business Day</Text>
          </Pressable>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* Cash Movement Modal (Cash In / Out / Drop) */}
      <Modal visible={movementModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.onSurface }]}>
                {movementType === "cash_in"
                  ? "Record Cash In (Add Change)"
                  : movementType === "cash_out"
                  ? "Record Cash Out (Payout / Expense)"
                  : "Record Safe Cash Drop"}
              </Text>
              <Pressable onPress={() => setMovementModalVisible(false)}>
                <Ionicons name="close" size={22} color={theme.onSurfaceSecondary} />
              </Pressable>
            </View>

            <Text style={[styles.modalDesc, { color: theme.onSurfaceSecondary }]}>
              {movementType === "cash_in"
                ? "Add extra float or coins into the active cash drawer."
                : movementType === "cash_out"
                ? "Log an out-of-drawer cash expense (e.g. dairy, vegetables, repairs)."
                : "Skim excess cash from till to back-office safe for safety."}
            </Text>

            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: theme.onSurfaceSecondary }]}>AMOUNT (₹)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceSecondary, color: theme.onSurface, borderColor: theme.border }]}
                value={movementAmount}
                onChangeText={setMovementAmount}
                keyboardType="numeric"
                placeholder="500"
                placeholderTextColor={theme.onSurfaceTertiary}
                autoFocus
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: theme.onSurfaceSecondary }]}>REASON / REMARK</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceSecondary, color: theme.onSurface, borderColor: theme.border }]}
                value={movementReason}
                onChangeText={setMovementReason}
                placeholder="e.g. Supplier payout, safe drop, extra coins"
                placeholderTextColor={theme.onSurfaceTertiary}
              />
            </View>

            <View style={styles.modalButtonsRow}>
              <Pressable
                style={[styles.modalCancelBtn, { borderColor: theme.border }]}
                onPress={() => setMovementModalVisible(false)}
              >
                <Text style={{ color: theme.onSurfaceSecondary, fontWeight: "700" }}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[styles.modalSubmitBtn, submittingMovement && { opacity: 0.7 }]}
                onPress={handleRecordMovement}
                disabled={submittingMovement}
              >
                {submittingMovement ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSubmitBtnText}>Save Movement</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirmation & Summary Modal before closing */}
      <Modal visible={confirmModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border, maxWidth: 520 }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.onSurface }]}>Confirm Shift Close</Text>
              <Pressable onPress={() => setConfirmModalVisible(false)}>
                <Ionicons name="close" size={22} color={theme.onSurfaceSecondary} />
              </Pressable>
            </View>

            <Text style={[styles.modalDesc, { color: theme.onSurfaceSecondary }]}>
              Closing locks this cashier shift and generates immutable financial records.
            </Text>

            <View style={[styles.summaryBox, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: theme.onSurfaceSecondary }]}>Expected Cash:</Text>
                <Text style={[styles.summaryVal, { color: theme.onSurface }]}>₹{expectedCash.toFixed(0)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: theme.onSurfaceSecondary }]}>Counted Cash:</Text>
                <Text style={[styles.summaryVal, { color: theme.onSurface }]}>₹{totalCountedCash.toFixed(0)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: theme.onSurfaceSecondary }]}>Cash Variance:</Text>
                <Text
                  style={[
                    styles.summaryVal,
                    {
                      color:
                        Math.abs(cashDiscrepancy) < 0.5
                          ? "#10B981"
                          : cashDiscrepancy < -0.5
                          ? "#EF4444"
                          : "#F59E0B",
                      fontWeight: "800",
                    },
                  ]}
                >
                  {Math.abs(cashDiscrepancy) < 0.5
                    ? "Balanced (₹0)"
                    : cashDiscrepancy < -0.5
                    ? `-₹${Math.abs(cashDiscrepancy).toFixed(0)} (Shortage)`
                    : `+₹${cashDiscrepancy.toFixed(0)} (Overage)`}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: theme.onSurfaceSecondary }]}>Total Gross Sales:</Text>
                <Text style={[styles.summaryVal, { color: "#635BFF", fontWeight: "800" }]}>
                  ₹{(sessionMetrics?.gross_sales || 0).toFixed(0)}
                </Text>
              </View>
            </View>

            {sessionMetrics && sessionMetrics.unpaid_bills_count > 0 && (
              <View style={[styles.modalWarningBox, { backgroundColor: isDark ? "#2A1D20" : "#FEF2F2" }]}>
                <Ionicons name="warning" size={18} color="#EF4444" />
                <Text style={{ color: "#EF4444", fontSize: 12, flex: 1, fontWeight: "600" }}>
                  Warning: {sessionMetrics.unpaid_bills_count} bills remain unpaid.
                </Text>
              </View>
            )}

            <View style={styles.modalButtonsRow}>
              <Pressable
                style={[styles.modalCancelBtn, { borderColor: theme.border }]}
                onPress={() => setConfirmModalVisible(false)}
              >
                <Text style={{ color: theme.onSurfaceSecondary, fontWeight: "700" }}>Back</Text>
              </Pressable>

              <Pressable
                style={[styles.modalSubmitBtn, submittingClose && { opacity: 0.7 }]}
                onPress={handleCloseSession}
                disabled={submittingClose}
              >
                {submittingClose ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSubmitBtnText}>Confirm & Lock Shift</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Closed Success & Print Modal */}
      <Modal visible={closedSummaryModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border, maxWidth: 480 }]}>
            <View style={{ alignItems: "center", marginVertical: 12 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#10B98120", justifyContent: "center", alignItems: "center", marginBottom: 12 }}>
                <Ionicons name="checkmark-done" size={36} color="#10B981" />
              </View>
              <Text style={[styles.modalTitle, { color: theme.onSurface, textAlign: "center" }]}>
                Shift Successfully Closed!
              </Text>
              <Text style={[styles.modalDesc, { color: theme.onSurfaceSecondary, textAlign: "center" }]}>
                Financial reconciliation snapshot saved. Print your thermal receipt or PDF closing summary now.
              </Text>
            </View>

            <View style={{ gap: 10, marginTop: 12 }}>
              <Pressable
                style={[styles.primaryBtn, { backgroundColor: "#635BFF" }]}
                onPress={() => {
                  if (lastClosedSession) {
                    printClosingReport(lastClosedSession, restaurant);
                  }
                }}
              >
                <Ionicons name="print" size={18} color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>Print Closing Report (ESC/POS & PDF)</Text>
              </Pressable>

              <Pressable
                style={[styles.modalCancelBtn, { borderColor: theme.border, paddingVertical: 14 }]}
                onPress={() => {
                  setClosedSummaryModalVisible(false);
                  setLastClosedSession(null);
                  setActiveTab("history");
                }}
              >
                <Text style={{ color: theme.onSurface, fontWeight: "700", textAlign: "center" }}>Done & View History</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Manager Discrepancy Approval Modal */}
      <Modal visible={approvalModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.onSurface }]}>Approve Shift Discrepancy</Text>
              <Pressable onPress={() => setApprovalModalVisible(false)}>
                <Ionicons name="close" size={22} color={theme.onSurfaceSecondary} />
              </Pressable>
            </View>

            <Text style={[styles.modalDesc, { color: theme.onSurfaceSecondary }]}>
              As an owner/manager, approve this shift's variance after verifying drawer physical counts.
            </Text>

            {selectedSessionToApprove && (
              <View style={[styles.summaryBox, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
                <Text style={{ fontSize: 13, color: theme.onSurface, fontWeight: "700" }}>
                  Discrepancy: ₹{selectedSessionToApprove.discrepancy_amount}
                </Text>
                {selectedSessionToApprove.discrepancy_reason ? (
                  <Text style={{ fontSize: 12, color: theme.onSurfaceSecondary, marginTop: 4 }}>
                    Cashier Note: {selectedSessionToApprove.discrepancy_reason}
                  </Text>
                ) : null}
              </View>
            )}

            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: theme.onSurfaceSecondary }]}>APPROVAL AUDIT NOTE (OPTIONAL)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceSecondary, color: theme.onSurface, borderColor: theme.border }]}
                value={approvalNotes}
                onChangeText={setApprovalNotes}
                placeholder="e.g. Verified with CCTV / petty cash voucher approved"
                placeholderTextColor={theme.onSurfaceTertiary}
              />
            </View>

            <View style={styles.modalButtonsRow}>
              <Pressable
                style={[styles.modalCancelBtn, { borderColor: theme.border }]}
                onPress={() => setApprovalModalVisible(false)}
              >
                <Text style={{ color: theme.onSurfaceSecondary, fontWeight: "700" }}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[styles.modalSubmitBtn, { backgroundColor: "#10B981" }, submittingApproval && { opacity: 0.7 }]}
                onPress={handleApproveDiscrepancy}
                disabled={submittingApproval}
              >
                {submittingApproval ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSubmitBtnText}>Approve Discrepancy</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: "500",
  },
  tabSegment: {
    flexDirection: "row",
    borderRadius: radius.md,
    padding: 3,
    gap: 2,
  },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.sm,
    gap: 6,
  },
  tabBtnActive: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  centerLoading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: "600",
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    fontSize: 12,
    fontWeight: "500",
    marginBottom: spacing.sm,
  },

  // Open Shift Form
  openCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: spacing.xl,
    marginTop: spacing.md,
  },
  openIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(99, 91, 255, 0.12)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  openCardTitle: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  openCardSub: {
    fontSize: 13,
    lineHeight: 20,
    marginTop: 4,
    marginBottom: spacing.lg,
  },
  formGroup: {
    marginBottom: spacing.md,
  },
  formLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: "600",
  },
  inputMultiline: {
    height: 70,
    textAlignVertical: "top",
  },
  inputPrefixWrap: {
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
  },
  inputPrefix: {
    position: "absolute",
    left: 14,
    zIndex: 10,
    fontSize: 16,
    fontWeight: "800",
  },
  inputWithPrefix: {
    flex: 1,
    paddingLeft: 32,
  },
  fieldHint: {
    fontSize: 11,
    marginTop: 4,
    fontWeight: "500",
  },
  primaryBtn: {
    backgroundColor: "#635BFF",
    borderRadius: radius.md,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: spacing.sm,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },

  // Active Shift Banner
  activeBanner: {
    borderRadius: 20,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  activeBannerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10B981",
  },
  activeBannerTitle: {
    fontSize: 16,
    fontWeight: "900",
  },
  activeBannerSub: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: "500",
  },
  movementButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  movementBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 4,
  },
  movementBtnText: {
    fontSize: 12,
    fontWeight: "800",
  },
  unpaidWarning: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 10,
    marginTop: 12,
    gap: 10,
  },
  unpaidWarningTitle: {
    fontSize: 12,
    fontWeight: "800",
  },
  unpaidWarningSub: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 1,
  },
  unpaidActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  unpaidActionBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },

  // Stat Cards
  statCardsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
    marginTop: 6,
  },
  statCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: spacing.md,
    minWidth: 220,
  },
  statCardLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  statCardValue: {
    fontSize: 22,
    fontWeight: "900",
    marginTop: 4,
    marginBottom: 8,
  },
  statCardDetails: {
    borderTopWidth: 1,
    paddingTop: 6,
    gap: 2,
  },
  statDetailText: {
    fontSize: 11,
    fontWeight: "600",
  },

  // Denominations Counter
  denomContainer: {
    borderRadius: 20,
    borderWidth: 1,
    padding: spacing.md,
    marginTop: 4,
  },
  denomGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  denomItem: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8,
    minWidth: 200,
    flex: 1,
  },
  denomBadge: {
    backgroundColor: "#635BFF",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    minWidth: 46,
    alignItems: "center",
  },
  denomBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  denomStepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  stepperBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
  },
  denomInput: {
    width: 44,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "800",
    padding: 2,
  },
  denomRowTotal: {
    fontSize: 12,
    fontWeight: "700",
    marginLeft: "auto",
  },
  varianceSummaryBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    flexWrap: "wrap",
    gap: 12,
  },
  varianceLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  varianceBigNumber: {
    fontSize: 22,
    fontWeight: "900",
    marginTop: 2,
  },
  varianceResultBox: {
    alignItems: "flex-end",
  },
  varianceStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 4,
  },
  varianceStatusPillText: {
    fontSize: 12,
    fontWeight: "800",
  },

  // Reconciliation Cards
  groupCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: spacing.md,
    marginTop: 6,
  },
  reconcileRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  reconcileLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  reconcileSub: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 2,
  },
  reconcileInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    width: 120,
    fontSize: 13,
    fontWeight: "800",
    textAlign: "right",
  },
  divider: {
    height: 1,
    marginVertical: 10,
  },

  // Discrepancy Card
  discrepancyCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  discrepancyCardTitle: {
    fontSize: 14,
    fontWeight: "900",
  },
  discrepancyCardSub: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
  },

  // Close Shift Button
  closeShiftBtn: {
    borderRadius: radius.md,
    paddingVertical: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: spacing.md,
  },
  closeShiftBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.3,
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.md,
  },
  modalCard: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 24,
    borderWidth: 1,
    padding: spacing.lg,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "900",
  },
  modalDesc: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  modalButtonsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: spacing.sm,
  },
  modalCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modalSubmitBtn: {
    flex: 1.5,
    backgroundColor: "#635BFF",
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modalSubmitBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  summaryBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: 6,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  summaryVal: {
    fontSize: 13,
    fontWeight: "700",
  },
  modalWarningBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
  },

  // History Tab
  historyHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    gap: 4,
  },
  emptyBox: {
    borderRadius: 20,
    borderWidth: 1,
    padding: spacing.xxl,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.md,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginTop: spacing.md,
  },
  emptySubtitle: {
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
    marginTop: 4,
    maxWidth: 320,
  },
  historyCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  historyCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.sm,
  },
  historyDate: {
    fontSize: 15,
    fontWeight: "900",
  },
  varianceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  varianceBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  historyCashier: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 2,
  },
  printIconBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
  },
  approveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#10B981",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
  },
  approveBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  historyGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderTopWidth: 1,
    paddingTop: spacing.sm,
    gap: 8,
  },
  historyGridCol: {
    minWidth: 90,
    flex: 1,
  },
  gridLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  gridVal: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2,
  },
  noteBox: {
    borderRadius: radius.sm,
    padding: 8,
    marginTop: spacing.sm,
  },
  noteBoxTitle: {
    fontSize: 11,
    fontWeight: "800",
  },
  noteBoxContent: {
    fontSize: 11,
    marginTop: 1,
  },
  approvedBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 8,
    borderRadius: radius.sm,
    marginTop: spacing.sm,
  },
  approvedText: {
    fontSize: 11,
    fontWeight: "700",
  },
});
