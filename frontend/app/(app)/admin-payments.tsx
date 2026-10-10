import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Modal,
  ScrollView, Alert, TextInput, Platform, Share, RefreshControl,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/theme";
import { useTheme } from "@/src/context/ThemeContext";
import { useResponsive } from "@/src/hooks/useResponsive";
import * as Haptics from "expo-haptics";

export interface PaymentItem {
  id: string;
  tenant_id: string;
  restaurant_name: string;
  owner_name: string;
  owner_email: string;
  owner_phone: string;
  plan_id: string;
  plan_name: string;
  amount: number;
  currency: string;
  payment_method: string;
  gateway_order_id: string;
  gateway_payment_id: string;
  status: "paid" | "failed" | "refunded" | "created";
  created_at: string;
  paid_at: string;
  refunded_at?: string;
  refund_reason?: string;
  notes?: string;
}

export interface PaymentStats {
  total_collected: number;
  total_refunded: number;
  net_revenue: number;
  paid_count: number;
  failed_count: number;
  refunded_count: number;
  success_rate: number;
}

export default function AdminPaymentsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const { isDesktop } = useResponsive();

  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [stats, setStats] = useState<PaymentStats>({
    total_collected: 0,
    total_refunded: 0,
    net_revenue: 0,
    paid_count: 0,
    failed_count: 0,
    refunded_count: 0,
    success_rate: 100,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "paid" | "failed" | "refunded">("all");

  // Refund Modal State
  const [refundTarget, setRefundTarget] = useState<PaymentItem | null>(null);
  const [refundReason, setRefundReason] = useState("Customer cancellation request");
  const [cancelSubOnRefund, setCancelSubOnRefund] = useState(true);
  const [refundBusy, setRefundBusy] = useState(false);

  // Record Manual Payment Modal State
  const [manualModal, setManualModal] = useState(false);
  const [stores, setStores] = useState<{ id: string; name: string; owner_name: string }[]>([]);
  const [plans, setPlans] = useState<{ id: string; name: string; price: number; interval: string }[]>([]);
  const [selTenantId, setSelTenantId] = useState("");
  const [selPlanId, setSelPlanId] = useState("");
  const [manualAmount, setManualAmount] = useState("599");
  const [manualMethod, setManualMethod] = useState("UPI / Bank Transfer");
  const [manualRef, setManualRef] = useState("");
  const [manualValidDays, setManualValidDays] = useState("30");
  const [manualNotes, setManualNotes] = useState("");
  const [manualBusy, setManualBusy] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [res, rList, pList] = await Promise.all([
        api.adminListPayments({ status: statusFilter, search: searchQuery }),
        api.adminListRestaurants().catch(() => []),
        api.adminListPlans().catch(() => []),
      ]);

      if (res && res.payments) {
        setPayments(res.payments);
        if (res.stats) setStats(res.stats);
      }
      setStores(rList || []);
      setPlans(pList || []);
      if (rList && rList.length > 0 && !selTenantId) {
        setSelTenantId(rList[0].id);
      }
      if (pList && pList.length > 0 && !selPlanId) {
        setSelPlanId(pList[0].id);
        setManualAmount(String(pList[0].price || "599"));
      }
    } catch (e: any) {
      setErr(e.message || "Failed to load transactions.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchQuery]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleRefundSubmit = async () => {
    if (!refundTarget) return;
    setRefundBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      await api.adminRefundPayment(refundTarget.id, {
        refund_reason: refundReason,
        cancel_subscription: cancelSubOnRefund,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setMsg(`Refund recorded for ${refundTarget.restaurant_name}.`);
      setRefundTarget(null);
      await loadData();
    } catch (e: any) {
      setErr(e.message || "Failed to record refund.");
    } finally {
      setRefundBusy(false);
    }
  };

  const handleManualPaymentSubmit = async () => {
    if (!selTenantId || !selPlanId) {
      setErr("Please select both a store and a subscription plan.");
      return;
    }
    setManualBusy(true);
    setErr(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      await api.adminRecordManualPayment({
        tenant_id: selTenantId,
        plan_id: selPlanId,
        amount: parseFloat(manualAmount) || 0,
        payment_method: manualMethod,
        reference_id: manualRef,
        valid_days: parseInt(manualValidDays, 10) || 30,
        notes: manualNotes,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setMsg("Payment recorded and license successfully activated!");
      setManualModal(false);
      await loadData();
    } catch (e: any) {
      setErr(e.message || "Failed to record manual payment.");
    } finally {
      setManualBusy(false);
    }
  };

  const handleExportCSV = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const headers = "Transaction ID,Store Name,Owner,Phone,Email,Plan,Amount,Gateway,Payment ID,Status,Date\n";
      const rows = payments.map(p => {
        const d = p.paid_at || p.created_at || "";
        return `"${p.id}","${p.restaurant_name}","${p.owner_name}","${p.owner_phone}","${p.owner_email}","${p.plan_name}",${p.amount},"${p.payment_method}","${p.gateway_payment_id || p.gateway_order_id}","${p.status.toUpperCase()}","${d}"`;
      }).join("\n");
      const csv = headers + rows;

      if (Platform.OS === "web" && typeof window !== "undefined") {
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `ezbill_transactions_${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        await Share.share({
          message: csv,
          title: "Export EzBill Transactions",
        });
      }
    } catch (e: any) {
      Alert.alert("Export Error", e.message || "Failed to export CSV.");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return { label: "PAID", bg: isDark ? "rgba(16, 185, 129, 0.2)" : "#DCFCE7", text: "#10B981", icon: "checkmark-circle" };
      case "failed":
        return { label: "FAILED", bg: isDark ? "rgba(239, 68, 68, 0.2)" : "#FEE2E2", text: "#EF4444", icon: "alert-circle" };
      case "refunded":
        return { label: "REFUNDED", bg: isDark ? "rgba(245, 158, 11, 0.2)" : "#FEF3C7", text: "#F59E0B", icon: "return-down-back" };
      default:
        return { label: "PENDING", bg: isDark ? "rgba(99, 91, 255, 0.2)" : "#EEF2FF", text: "#635BFF", icon: "time" };
    }
  };

  return (
    <View style={[styles.wrap, { paddingTop: insets.top, backgroundColor: theme.surface }]} testID="admin-payments-screen">
      <View style={[styles.desktopContainer, isDesktop && styles.desktopContainerActive]}>
        
        {/* Top Navigation Bar */}
        <View style={styles.topHeader}>
          <Pressable
            onPress={() => router.replace("/(app)/dashboard")}
            style={[styles.backBtn, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={20} color={theme.onSurface} />
          </Pressable>

          <View style={{ flex: 1, marginLeft: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="card" size={18} color="#635BFF" />
              <Text style={[styles.screenTitle, { color: theme.onSurface }]} numberOfLines={1}>
                Payments & Transactions
              </Text>
            </View>
            <Text style={[styles.screenSubtitle, { color: theme.onSurfaceSecondary }]} numberOfLines={1}>
              SaaS Billing · Tracking · Refunds
            </Text>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Pressable
              style={[styles.headerBtn, { backgroundColor: isDark ? "rgba(99, 91, 255, 0.15)" : "#EEF2FF", borderColor: "#635BFF" }]}
              onPress={() => setManualModal(true)}
            >
              <Ionicons name="add-circle" size={15} color="#635BFF" />
              <Text style={[styles.headerBtnText, { color: "#635BFF" }]}>Record</Text>
            </Pressable>

            <Pressable
              style={[styles.headerBtn, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}
              onPress={handleExportCSV}
            >
              <Ionicons name="download-outline" size={15} color={theme.onSurface} />
              <Text style={[styles.headerBtnText, { color: theme.onSurface }]}>CSV</Text>
            </Pressable>
          </View>
        </View>

        {/* Financial KPI Summary Banner */}
        <View style={styles.statsBannerWrap}>
          <LinearGradient
            colors={["#4F46E5", "#635BFF", "#7C3AED"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.statsBanner}
          >
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>TOTAL COLLECTED</Text>
              <Text style={styles.statVal}>₹{stats.total_collected.toLocaleString('en-IN')}</Text>
              <Text style={styles.statSubText}>{stats.paid_count} Paid Transactions</Text>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.statCol}>
              <Text style={styles.statLabel}>NET REVENUE</Text>
              <Text style={styles.statVal}>₹{stats.net_revenue.toLocaleString('en-IN')}</Text>
              <Text style={styles.statSubText}>
                {stats.refunded_count > 0 ? `-₹${stats.total_refunded.toLocaleString('en-IN')} Refunded` : "100% Retained"}
              </Text>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.statCol}>
              <Text style={styles.statLabel}>SUCCESS RATE</Text>
              <Text style={styles.statVal}>{stats.success_rate}%</Text>
              <Text style={styles.statSubText}>{stats.failed_count} Failed</Text>
            </View>
          </LinearGradient>
        </View>

        {/* Filter Pills & Live Search */}
        <View style={styles.filterSection}>
          <View style={[styles.searchBox, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
            <Ionicons name="search" size={16} color={theme.onSurfaceSecondary} />
            <TextInput
              style={[styles.searchInput, { color: theme.onSurface }]}
              placeholder="Search by store, owner, email, txn ID..."
              placeholderTextColor={theme.onSurfaceSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery("")} hitSlop={6}>
                <Ionicons name="close-circle" size={16} color={theme.onSurfaceSecondary} />
              </Pressable>
            )}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsScroll}>
            {(["all", "paid", "failed", "refunded"] as const).map(tab => {
              const active = statusFilter === tab;
              const label = tab === "all" ? "All Transactions" : tab.toUpperCase();
              return (
                <Pressable
                  key={tab}
                  style={[
                    styles.pill,
                    active
                      ? { backgroundColor: "#635BFF", borderColor: "#635BFF" }
                      : { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setStatusFilter(tab);
                  }}
                >
                  <Text style={[styles.pillText, { color: active ? "#FFFFFF" : theme.onSurfaceSecondary }]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Messages & Alerts */}
        {msg && (
          <View style={styles.msgBox}>
            <Ionicons name="checkmark-circle" size={16} color="#10B981" />
            <Text style={styles.msgText}>{msg}</Text>
          </View>
        )}
        {err && (
          <View style={styles.errBox}>
            <Ionicons name="alert-circle" size={16} color="#EF4444" />
            <Text style={styles.errText}>{err}</Text>
          </View>
        )}

        {/* Transactions List */}
        {loading && !refreshing ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#635BFF" />
            <Text style={{ color: theme.onSurfaceSecondary, marginTop: 12, fontSize: 13, fontWeight: "600" }}>
              Loading platform transactions...
            </Text>
          </View>
        ) : payments.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="receipt-outline" size={48} color={theme.onSurfaceSecondary} />
            <Text style={[styles.emptyTitle, { color: theme.onSurface }]}>No Transactions Found</Text>
            <Text style={[styles.emptyDesc, { color: theme.onSurfaceSecondary }]}>
              {searchQuery ? "Try a different search query or filter." : "Payments and renewals will appear here automatically."}
            </Text>
          </View>
        ) : (
          <FlatList
            data={payments}
            keyExtractor={item => item.id}
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80, gap: 12 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={async () => {
                  setRefreshing(true);
                  await loadData();
                  setRefreshing(false);
                }}
                tintColor="#635BFF"
              />
            }
            renderItem={({ item }) => {
              const badge = getStatusBadge(item.status);
              const dateStr = item.paid_at || item.created_at;
              const formattedDate = dateStr
                ? new Date(dateStr).toLocaleString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "Recent";

              return (
                <View style={[styles.card, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
                  {/* Card Header */}
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                      <Text style={[styles.cardStoreName, { color: theme.onSurface }]} numberOfLines={1}>
                        {item.restaurant_name}
                      </Text>
                      <Text style={[styles.cardOwnerMeta, { color: theme.onSurfaceSecondary }]} numberOfLines={1}>
                        {item.owner_name} {item.owner_phone ? `• ${item.owner_phone}` : ""}
                      </Text>
                    </View>

                    <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                      <Ionicons name={badge.icon as any} size={13} color={badge.text} />
                      <Text style={[styles.statusBadgeText, { color: badge.text }]}>{badge.label}</Text>
                    </View>
                  </View>

                  {/* Card Body */}
                  <View style={[styles.cardBody, { borderTopColor: theme.border, borderBottomColor: theme.border }]}>
                    <View style={styles.cardInfoRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.infoLabel, { color: theme.onSurfaceSecondary }]}>PLAN SUBSCRIBED</Text>
                        <Text style={[styles.infoVal, { color: theme.onSurface }]}>{item.plan_name}</Text>
                      </View>

                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={[styles.infoLabel, { color: theme.onSurfaceSecondary }]}>AMOUNT</Text>
                        <Text style={[styles.amountVal, { color: "#635BFF" }]}>₹{item.amount.toLocaleString('en-IN')}</Text>
                      </View>
                    </View>

                    <View style={[styles.cardInfoRow, { marginTop: 8 }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.infoLabel, { color: theme.onSurfaceSecondary }]}>PAYMENT METHOD</Text>
                        <Text style={[styles.infoSubVal, { color: theme.onSurface }]}>{item.payment_method}</Text>
                      </View>

                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={[styles.infoLabel, { color: theme.onSurfaceSecondary }]}>DATE & TIME</Text>
                        <Text style={[styles.infoSubVal, { color: theme.onSurfaceSecondary }]}>{formattedDate}</Text>
                      </View>
                    </View>

                    {item.gateway_payment_id ? (
                      <View style={{ marginTop: 6 }}>
                        <Text style={[styles.infoLabel, { color: theme.onSurfaceSecondary }]}>GATEWAY REF / TXN ID</Text>
                        <Text style={[styles.txnIdText, { color: theme.onSurfaceSecondary }]} numberOfLines={1}>
                          {item.gateway_payment_id}
                        </Text>
                      </View>
                    ) : null}

                    {item.refund_reason ? (
                      <View style={[styles.refundReasonBox, { backgroundColor: isDark ? "rgba(245, 158, 11, 0.12)" : "#FEF3C7" }]}>
                        <Ionicons name="information-circle" size={14} color="#F59E0B" />
                        <Text style={{ color: "#F59E0B", fontSize: 12, fontWeight: "600", flex: 1 }}>
                          Refund Reason: {item.refund_reason}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Card Actions */}
                  <View style={styles.cardActions}>
                    <Text style={[styles.cardFooterId, { color: theme.onSurfaceSecondary }]}>
                      ID: {item.id.slice(0, 16)}...
                    </Text>

                    {item.status === "paid" && (
                      <Pressable
                        style={[styles.refundBtn, { borderColor: isDark ? "rgba(239, 68, 68, 0.4)" : "#FECDD3", backgroundColor: isDark ? "rgba(239, 68, 68, 0.12)" : "#FEF2F2" }]}
                        onPress={() => {
                          setRefundTarget(item);
                          setRefundReason("Customer requested cancellation");
                          setCancelSubOnRefund(true);
                        }}
                      >
                        <Ionicons name="return-down-back" size={14} color="#EF4444" />
                        <Text style={styles.refundBtnText}>Refund</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            }}
          />
        )}

        {/* Modal 1: Issue Refund Modal */}
        <Modal visible={!!refundTarget} transparent animationType="fade">
          <View style={styles.modalBg}>
            <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.modalHeader}>
                <View style={[styles.modalIconBox, { backgroundColor: "rgba(239, 68, 68, 0.12)" }]}>
                  <Ionicons name="return-down-back" size={20} color="#EF4444" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.modalTitle, { color: theme.onSurface }]}>Track & Issue Refund</Text>
                  <Text style={[styles.modalSub, { color: theme.onSurfaceSecondary }]} numberOfLines={1}>
                    {refundTarget?.restaurant_name} · ₹{refundTarget?.amount}
                  </Text>
                </View>
                <Pressable onPress={() => setRefundTarget(null)} hitSlop={8}>
                  <Ionicons name="close" size={20} color={theme.onSurfaceSecondary} />
                </Pressable>
              </View>

              <View style={{ marginVertical: 14 }}>
                <Text style={[styles.fieldLabel, { color: theme.onSurfaceSecondary }]}>Refund Reason</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border, color: theme.onSurface }]}
                  value={refundReason}
                  onChangeText={setRefundReason}
                  placeholder="e.g. Accidental double payment / trial cancellation"
                  placeholderTextColor={theme.onSurfaceSecondary}
                />

                <Pressable
                  style={[styles.checkRow, { borderColor: theme.border, backgroundColor: theme.surfaceSecondary }]}
                  onPress={() => setCancelSubOnRefund(!cancelSubOnRefund)}
                >
                  <Ionicons
                    name={cancelSubOnRefund ? "checkbox" : "square-outline"}
                    size={20}
                    color={cancelSubOnRefund ? "#635BFF" : theme.onSurfaceSecondary}
                  />
                  <Text style={[styles.checkLabel, { color: theme.onSurface }]}>
                    Also cancel active license for this store
                  </Text>
                </Pressable>
              </View>

              <View style={styles.modalActions}>
                <Pressable
                  style={[styles.modalCancelBtn, { borderColor: theme.border }]}
                  onPress={() => setRefundTarget(null)}
                  disabled={refundBusy}
                >
                  <Text style={[styles.modalCancelText, { color: theme.onSurfaceSecondary }]}>Cancel</Text>
                </Pressable>

                <Pressable
                  style={[styles.modalDestructiveBtn, { backgroundColor: "#EF4444" }]}
                  onPress={handleRefundSubmit}
                  disabled={refundBusy}
                >
                  {refundBusy ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.modalDestructiveText}>Confirm Refund</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* Modal 2: Record Manual / Offline Payment */}
        <Modal visible={manualModal} transparent animationType="slide">
          <View style={styles.modalBg}>
            <View style={[styles.modalCardLarge, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.modalHeader}>
                <View style={[styles.modalIconBox, { backgroundColor: "rgba(99, 91, 255, 0.12)" }]}>
                  <Ionicons name="wallet" size={20} color="#635BFF" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.modalTitle, { color: theme.onSurface }]}>Record Payment & Activate Plan</Text>
                  <Text style={[styles.modalSub, { color: theme.onSurfaceSecondary }]}>
                    For offline UPI QR, Cash, Cheque, or Bank Transfer
                  </Text>
                </View>
                <Pressable onPress={() => setManualModal(false)} hitSlop={8}>
                  <Ionicons name="close" size={20} color={theme.onSurfaceSecondary} />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
                {/* Store Selector */}
                <Text style={[styles.fieldLabel, { color: theme.onSurfaceSecondary }]}>Select Restaurant Store</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 10 }}>
                  {stores.map(s => {
                    const isSel = selTenantId === s.id;
                    return (
                      <Pressable
                        key={s.id}
                        style={[
                          styles.chipOption,
                          isSel
                            ? { backgroundColor: "#635BFF", borderColor: "#635BFF" }
                            : { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }
                        ]}
                        onPress={() => setSelTenantId(s.id)}
                      >
                        <Text style={[styles.chipOptionText, { color: isSel ? "#FFFFFF" : theme.onSurface }]}>
                          {s.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {/* Plan Selector */}
                <Text style={[styles.fieldLabel, { color: theme.onSurfaceSecondary, marginTop: 8 }]}>Select Subscription Plan</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 10 }}>
                  {plans.map(p => {
                    const isSel = selPlanId === p.id;
                    return (
                      <Pressable
                        key={p.id}
                        style={[
                          styles.chipOption,
                          isSel
                            ? { backgroundColor: "#635BFF", borderColor: "#635BFF" }
                            : { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }
                        ]}
                        onPress={() => {
                          setSelPlanId(p.id);
                          setManualAmount(String(p.price || 0));
                        }}
                      >
                        <Text style={[styles.chipOptionText, { color: isSel ? "#FFFFFF" : theme.onSurface }]}>
                          {p.name} (₹{p.price})
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {/* Amount & Duration Inputs */}
                <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { color: theme.onSurfaceSecondary }]}>Amount Received (₹)</Text>
                    <TextInput
                      style={[styles.modalInput, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border, color: theme.onSurface }]}
                      value={manualAmount}
                      onChangeText={setManualAmount}
                      keyboardType="numeric"
                      placeholder="599"
                      placeholderTextColor={theme.onSurfaceSecondary}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { color: theme.onSurfaceSecondary }]}>Validity (Days)</Text>
                    <TextInput
                      style={[styles.modalInput, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border, color: theme.onSurface }]}
                      value={manualValidDays}
                      onChangeText={setManualValidDays}
                      keyboardType="numeric"
                      placeholder="30 or 365"
                      placeholderTextColor={theme.onSurfaceSecondary}
                    />
                  </View>
                </View>

                {/* Method & Ref */}
                <View style={{ marginTop: 8 }}>
                  <Text style={[styles.fieldLabel, { color: theme.onSurfaceSecondary }]}>Payment Mode</Text>
                  <TextInput
                    style={[styles.modalInput, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border, color: theme.onSurface }]}
                    value={manualMethod}
                    onChangeText={setManualMethod}
                    placeholder="UPI / GPay / PhonePe / Cash / Bank"
                    placeholderTextColor={theme.onSurfaceSecondary}
                  />
                </View>

                <View style={{ marginTop: 8 }}>
                  <Text style={[styles.fieldLabel, { color: theme.onSurfaceSecondary }]}>Reference / UTR Number (Optional)</Text>
                  <TextInput
                    style={[styles.modalInput, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border, color: theme.onSurface }]}
                    value={manualRef}
                    onChangeText={setManualRef}
                    placeholder="e.g. UPI-UTR-39847298"
                    placeholderTextColor={theme.onSurfaceSecondary}
                  />
                </View>

                <View style={{ marginTop: 8 }}>
                  <Text style={[styles.fieldLabel, { color: theme.onSurfaceSecondary }]}>Admin Notes</Text>
                  <TextInput
                    style={[styles.modalInput, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border, color: theme.onSurface }]}
                    value={manualNotes}
                    onChangeText={setManualNotes}
                    placeholder="Received directly via owner UPI"
                    placeholderTextColor={theme.onSurfaceSecondary}
                  />
                </View>
              </ScrollView>

              <View style={[styles.modalActions, { marginTop: 14 }]}>
                <Pressable
                  style={[styles.modalCancelBtn, { borderColor: theme.border }]}
                  onPress={() => setManualModal(false)}
                  disabled={manualBusy}
                >
                  <Text style={[styles.modalCancelText, { color: theme.onSurfaceSecondary }]}>Cancel</Text>
                </Pressable>

                <Pressable
                  style={[styles.modalSubmitBtn, { backgroundColor: "#635BFF" }]}
                  onPress={handleManualPaymentSubmit}
                  disabled={manualBusy}
                >
                  {manualBusy ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.modalSubmitText}>Record & Activate</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  desktopContainer: { flex: 1, width: "100%" },
  desktopContainerActive: { maxWidth: 1100, alignSelf: "center", width: "100%" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  screenTitle: {
    fontSize: 18,
    fontWeight: "900",
  },
  screenSubtitle: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: "500",
  },
  headerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  headerBtnText: {
    fontSize: 12,
    fontWeight: "800",
  },

  statsBannerWrap: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  statsBanner: {
    borderRadius: 18,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#635BFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  statCol: {
    flex: 1,
    alignItems: "center",
  },
  statLabel: {
    color: "rgba(255, 255, 255, 0.75)",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  statVal: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
    marginTop: 2,
  },
  statSubText: {
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: 10.5,
    fontWeight: "600",
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
  },

  filterSection: {
    paddingHorizontal: spacing.lg,
    gap: 10,
    marginBottom: spacing.sm,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 9,
    fontSize: 13,
    fontWeight: "600",
  },
  pillsScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 12,
    fontWeight: "700",
  },

  msgBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginHorizontal: spacing.lg,
    borderRadius: 10,
    gap: 8,
    marginBottom: 8,
  },
  msgText: {
    color: "#10B981",
    fontSize: 13,
    fontWeight: "700",
  },
  errBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginHorizontal: spacing.lg,
    borderRadius: 10,
    gap: 8,
    marginBottom: 8,
  },
  errText: {
    color: "#EF4444",
    fontSize: 13,
    fontWeight: "700",
  },

  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "800",
    marginTop: 14,
  },
  emptyDesc: {
    fontSize: 13,
    fontWeight: "500",
    marginTop: 4,
    textAlign: "center",
  },

  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    shadowColor: "rgba(0, 0, 0, 0.04)",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  cardStoreName: {
    fontSize: 15,
    fontWeight: "800",
  },
  cardOwnerMeta: {
    fontSize: 12,
    marginTop: 1,
    fontWeight: "500",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "800",
  },

  cardBody: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: 10,
  },
  cardInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  infoLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  infoVal: {
    fontSize: 13,
    fontWeight: "700",
  },
  amountVal: {
    fontSize: 16,
    fontWeight: "900",
  },
  infoSubVal: {
    fontSize: 12,
    fontWeight: "600",
  },
  txnIdText: {
    fontSize: 11,
    fontWeight: "500",
  },
  refundReasonBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 8,
    borderRadius: 8,
    marginTop: 8,
  },

  cardActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 10,
  },
  cardFooterId: {
    fontSize: 11,
    fontWeight: "500",
  },
  refundBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  refundBtnText: {
    color: "#EF4444",
    fontSize: 12,
    fontWeight: "800",
  },

  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  modalCard: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
  },
  modalCardLarge: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  modalIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  modalSub: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 1,
  },

  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 5,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    fontWeight: "600",
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 10,
  },
  checkLabel: {
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },

  chipOption: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  chipOptionText: {
    fontSize: 12,
    fontWeight: "700",
  },

  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: "700",
  },
  modalDestructiveBtn: {
    flex: 1.4,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modalDestructiveText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  modalSubmitBtn: {
    flex: 1.5,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modalSubmitText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
});
