import { useCallback, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView, SafeAreaView, StatusBar, Modal, Alert,
} from "react-native";
import { WebView } from "react-native-webview";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/context/AuthContext";
import { colors, spacing, radius } from "@/src/theme";
import { useTheme } from "@/src/context/ThemeContext";
import { useResponsive } from "@/src/hooks/useResponsive";

type Plan = { 
  id: string; 
  name: string; 
  price: number; 
  interval: string; 
  valid_days?: number; 
  features: string[] 
};

export default function Subscribe() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { theme, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sub, setSub] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  
  const [checkoutHtml, setCheckoutHtml] = useState<string | null>(null);
  const currentPlanRef = useRef<Plan | null>(null);

  // Billing cycle toggle
  const [isYearly, setIsYearly] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [p, s] = await Promise.all([api.publicPlans(), api.mySubscription()]);
      setPlans(p || []); setSub(s);
    } catch (e: any) { 
      setErr(e.message); 
    } finally { 
      setLoading(false); 
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const startCheckout = async (plan: Plan) => {
    setLoadingPlanId(plan.id); setErr(null); setMsg(null);
    currentPlanRef.current = plan;
    try {
      const co = await api.checkout(plan.id);
      const html = buildCheckoutHtml(co);
      setCheckoutHtml(html);
    } catch (e: any) { 
      setErr(e.message || "An error occurred."); 
    } finally { 
      setLoadingPlanId(null); 
    }
  };

  const onWebMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "success" && currentPlanRef.current) {
        setCheckoutHtml(null);
        setLoadingPlanId(currentPlanRef.current.id);
        const verified = await api.verifyPayment({
          razorpay_subscription_id: data.razorpay_subscription_id,
          razorpay_payment_id: data.razorpay_payment_id,
          razorpay_signature: data.razorpay_signature,
          plan_id: currentPlanRef.current.id,
        });
        setSub(verified);
        setMsg(`Subscription activated successfully! Unlocking ${currentPlanRef.current.name}...`);
        
        setTimeout(() => {
          if (!user?.tenant_id) {
            router.replace("/onboarding");
          } else {
            router.replace("/(app)/dashboard");
          }
        }, 1500);
      } else if (data.type === "cancel") {
        setCheckoutHtml(null);
        setErr("Checkout cancelled.");
      } else if (data.type === "error") {
        setCheckoutHtml(null);
        setErr(data.message || "Payment failed.");
      }
    } catch (e: any) { 
      setErr(e.message); 
    } finally { 
      setLoadingPlanId(null); 
    }
  };

  const handleCancelAutoPay = () => {
    Alert.alert(
      "Cancel AutoPay?",
      "Your current plan will remain active until the billing period ends. AutoPay will not renew.",
      [
        { text: "Keep AutoPay", style: "cancel" },
        { 
          text: "Cancel AutoPay", 
          style: "destructive",
          onPress: async () => {
            setBusy(true); setErr(null); setMsg(null);
            try {
              await api.cancelSubscription();
              const freshSub = await api.mySubscription();
              setSub(freshSub);
              setMsg("AutoPay cancellation scheduled.");
            } catch (e: any) {
              setErr(e.message);
            } finally {
              setBusy(false);
            }
          }
        }
      ]
    );
  };

  const handleReactivateAutoPay = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      await api.reactivateSubscription();
      const freshSub = await api.mySubscription();
      setSub(freshSub);
      setMsg("AutoPay restored successfully!");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const starterPlan = plans.find(p => p.id === (isYearly ? "STARTER_YEARLY" : "STARTER_MONTHLY"));
  const growthPlan = plans.find(p => p.id === (isYearly ? "GROWTH_YEARLY" : "GROWTH_MONTHLY"));
  const proPlan = plans.find(p => p.id === (isYearly ? "PRO_YEARLY" : "PRO_MONTHLY"));

  const activePlanId = sub?.status === "active" ? sub.plan_id : null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.surface }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.surface} />
      <View style={[styles.wrap, { paddingTop: insets.top }]}>
        
        {/* Header Bar */}
        <View style={styles.header}>
          <Pressable 
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace("/(app)/more");
              }
            }} 
            testID="subscribe-back-btn" 
            style={styles.backBtn}
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={24} color={theme.onSurface} />
          </Pressable>
          <Text style={[styles.title, { color: theme.onSurface }]}>EZBill Plans</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView 
          contentContainerStyle={{ 
            padding: spacing.lg, 
            paddingBottom: spacing.xxxl, 
            gap: spacing.lg,
            maxWidth: isDesktop ? 1200 : undefined,
            width: "100%",
            alignSelf: isDesktop ? "center" : undefined,
          }} 
          showsVerticalScrollIndicator={false}
        >
          
          <View style={styles.heroTextContainer}>
            <Text style={[styles.heroHeadline, { color: theme.onSurface }]}>Choose the right plan for your restaurant</Text>
            <Text style={[styles.heroSubtext, { color: theme.onSurfaceSecondary }]}>Start simple. Upgrade when your restaurant grows.</Text>
            <Text style={[styles.heroTagline, { color: colors.brand }]}>No per-order commission.</Text>
          </View>

          {/* Monthly / Yearly Toggle */}
          <View style={[styles.toggleContainer, { backgroundColor: theme.surfaceSecondary }]}>
            <Pressable 
              style={[styles.toggleBtn, !isYearly && styles.toggleBtnActive]} 
              onPress={() => setIsYearly(false)}
            >
              <Text style={[styles.toggleText, !isYearly && styles.toggleTextActive, { color: !isYearly ? "#FFFFFF" : theme.onSurfaceSecondary }]}>Monthly</Text>
            </Pressable>
            <Pressable 
              style={[styles.toggleBtn, isYearly && styles.toggleBtnActive]} 
              onPress={() => setIsYearly(true)}
            >
              <Text style={[styles.toggleText, isYearly && styles.toggleTextActive, { color: isYearly ? "#FFFFFF" : theme.onSurfaceSecondary }]}>Yearly (Save ~16%)</Text>
            </Pressable>
          </View>

          {err && (
            <View style={styles.errBox}>
              <Ionicons name="bug-outline" size={18} color="#FFFFFF" />
              <Text style={styles.errText}>{err}</Text>
            </View>
          )}

          {msg && (
            <View style={styles.msgBox}>
              <Ionicons name="sparkles" size={18} color="#FFFFFF" />
              <Text style={styles.msgText}>{msg}</Text>
            </View>
          )}

          {/* ACTIVE SUBSCRIPTION DETAILS */}
          {sub && sub.status === "active" && (
            <View style={[styles.activeSubCard, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
              <View style={styles.activeSubHeader}>
                <Ionicons name="shield-checkmark" size={24} color="#10B981" />
                <Text style={[styles.activeSubTitle, { color: theme.onSurface }]}>Your Active Subscription</Text>
              </View>

              <View style={styles.activeSubRow}>
                <View>
                  <Text style={[styles.activePlanNameText, { color: theme.onSurface }]}>{sub.plan_name} Plan</Text>
                  <Text style={[styles.activePlanPrice, { color: theme.onSurfaceSecondary }]}>
                    ₹{sub.price} / {sub.interval === "year" ? "year" : "month"}
                  </Text>
                </View>
                <View style={styles.activeStatusBadge}>
                  <Text style={styles.activeStatusText}>ACTIVE</Text>
                </View>
              </View>

              <View style={[styles.divider, { backgroundColor: theme.border }]} />

              <View style={styles.detailsGrid}>
                <View style={styles.detailItem}>
                  <Text style={[styles.detailLabel, { color: theme.onSurfaceTertiary }]}>AutoPay</Text>
                  <Text style={[styles.detailValue, { color: sub.auto_pay_enabled ? "#10B981" : "#EF4444" }]}>
                    {sub.auto_pay_enabled ? "✓ Enabled" : "✗ Disabled"}
                  </Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={[styles.detailLabel, { color: theme.onSurfaceTertiary }]}>Next Billing</Text>
                  <Text style={[styles.detailValue, { color: theme.onSurfaceSecondary }]}>
                    {sub.ends_at ? new Date(sub.ends_at).toLocaleDateString() : "N/A"}
                  </Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={[styles.detailLabel, { color: theme.onSurfaceTertiary }]}>Renewal Amount</Text>
                  <Text style={[styles.detailValue, { color: theme.onSurface }]}>₹{sub.price}</Text>
                </View>
              </View>

              <View style={styles.actionsRow}>
                {sub.cancel_at_period_end ? (
                  <Pressable 
                    style={[styles.actionBtn, styles.actionBtnReactivate]} 
                    onPress={handleReactivateAutoPay}
                    disabled={busy}
                  >
                    <Text style={styles.actionBtnText}>Reactivate AutoPay</Text>
                  </Pressable>
                ) : (
                  <Pressable 
                    style={[styles.actionBtn, styles.actionBtnCancel]} 
                    onPress={handleCancelAutoPay}
                    disabled={busy}
                  >
                    <Text style={styles.actionBtnText}>Cancel AutoPay</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}

          {/* PLAN CARDS GRID */}
          {loading ? (
            <View style={styles.centerLoading}>
              <ActivityIndicator size="large" color={colors.brand} />
              <Text style={{ color: theme.onSurfaceSecondary, marginTop: 8 }}>Loading available plans...</Text>
            </View>
          ) : (
            <View style={[styles.cardsStack, isDesktop && { flexDirection: "row", alignItems: "stretch", gap: 20 }]}>
              {/* STARTER */}
              {starterPlan && (
                <View style={[styles.planCard, isDesktop && { flex: 1, marginBottom: 0 }, { backgroundColor: theme.surfaceSecondary, borderColor: activePlanId === starterPlan.id ? "#10B981" : theme.border }]}>
                  {activePlanId === starterPlan.id && (
                    <View style={styles.activeCardBadge}>
                      <Text style={styles.activeCardBadgeText}>✓ CURRENT PLAN</Text>
                    </View>
                  )}
                  <Text style={[styles.cardTierName, { color: theme.onSurface }]}>STARTER</Text>
                  <Text style={[styles.cardPriceText, { color: theme.onSurface }]}>₹{starterPlan.price}<Text style={styles.cardPricePeriod}>/{isYearly ? "yr" : "mo"}</Text></Text>
                  {isYearly && <Text style={styles.saveBadge}>Save ₹589</Text>}
                  <Text style={[styles.cardTagline, { color: theme.onSurfaceSecondary }]}>Simple Billing</Text>

                  <Pressable 
                    style={[styles.cardBtn, activePlanId === starterPlan.id && styles.cardBtnCurrent]}
                    disabled={activePlanId === starterPlan.id || loadingPlanId !== null}
                    onPress={() => startCheckout(starterPlan)}
                  >
                    <Text style={[styles.cardBtnText, activePlanId === starterPlan.id && styles.cardBtnTextCurrent]}>
                      {activePlanId === starterPlan.id ? "Current Plan" : "Choose Starter"}
                    </Text>
                  </Pressable>

                  <View style={[styles.divider, { backgroundColor: theme.border }]} />
                  <Text style={[styles.cardFeaturesHeader, { color: theme.onSurface }]}>Starter features:</Text>
                  {starterPlan.features.slice(0, 8).map((f, idx) => (
                    <View key={idx} style={styles.featItem}>
                      <Ionicons name="checkmark" size={16} color="#FF5E2B" />
                      <Text style={[styles.featText, { color: theme.onSurfaceSecondary }]}>{f}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* GROWTH */}
              {growthPlan && (
                <View style={[styles.planCard, styles.planCardGrowth, isDesktop && { flex: 1, marginBottom: 0 }, { backgroundColor: theme.surfaceSecondary, borderColor: activePlanId === growthPlan.id ? "#10B981" : "#FF5E2B" }]}>
                  <View style={styles.popularRibbon}>
                    <Text style={styles.popularRibbonText}>⭐ MOST POPULAR</Text>
                  </View>
                  {activePlanId === growthPlan.id && (
                    <View style={[styles.activeCardBadge, { top: 38 }]}>
                      <Text style={styles.activeCardBadgeText}>✓ CURRENT PLAN</Text>
                    </View>
                  )}
                  <Text style={[styles.cardTierName, { color: theme.onSurface, marginTop: 12 }]}>GROWTH</Text>
                  <Text style={[styles.cardPriceText, { color: "#FF5E2B" }]}>₹{growthPlan.price}<Text style={styles.cardPricePeriod}>/{isYearly ? "yr" : "mo"}</Text></Text>
                  {isYearly && <Text style={styles.saveBadge}>Save ₹1,189</Text>}
                  <Text style={[styles.cardTagline, { color: theme.onSurfaceSecondary }]}>Restaurant Management</Text>

                  <Pressable 
                    style={[styles.cardBtn, { backgroundColor: "#FF5E2B" }, activePlanId === growthPlan.id && styles.cardBtnCurrent]}
                    disabled={activePlanId === growthPlan.id || loadingPlanId !== null}
                    onPress={() => startCheckout(growthPlan)}
                  >
                    <Text style={[styles.cardBtnText, { color: "#FFFFFF" }, activePlanId === growthPlan.id && styles.cardBtnTextCurrent]}>
                      {activePlanId === growthPlan.id ? "Current Plan" : "Choose Growth"}
                    </Text>
                  </Pressable>

                  <View style={[styles.divider, { backgroundColor: theme.border }]} />
                  <Text style={[styles.cardFeaturesHeader, { color: theme.onSurface }]}>Everything in Starter +</Text>
                  {growthPlan.features.slice(0, 8).map((f, idx) => (
                    <View key={idx} style={styles.featItem}>
                      <Ionicons name="checkmark" size={16} color="#FF5E2B" />
                      <Text style={[styles.featText, { color: theme.onSurfaceSecondary }]}>{f}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* PRO */}
              {proPlan && (
                <View style={[styles.planCard, styles.planCardPro, isDesktop && { flex: 1, marginBottom: 0 }, { backgroundColor: "#11121A", borderColor: activePlanId === proPlan.id ? "#10B981" : "#635BFF" }]}>
                  {activePlanId === proPlan.id && (
                    <View style={styles.activeCardBadge}>
                      <Text style={styles.activeCardBadgeText}>✓ CURRENT PLAN</Text>
                    </View>
                  )}
                  <Text style={[styles.cardTierName, { color: "#FFFFFF" }]}>PRO</Text>
                  <Text style={[styles.cardPriceText, { color: "#635BFF" }]}>₹{proPlan.price}<Text style={styles.cardPricePeriod}>/{isYearly ? "yr" : "mo"}</Text></Text>
                  {isYearly && <Text style={[styles.saveBadge, { backgroundColor: "rgba(99,91,255,0.2)", color: "#635BFF" }]}>Save ₹1,989</Text>}
                  <Text style={[styles.cardTagline, { color: "rgba(255,255,255,0.6)" }]}>Digital Restaurant</Text>

                  <Pressable 
                    style={[styles.cardBtn, { backgroundColor: "#635BFF" }, activePlanId === proPlan.id && styles.cardBtnCurrent]}
                    disabled={activePlanId === proPlan.id || loadingPlanId !== null}
                    onPress={() => startCheckout(proPlan)}
                  >
                    <Text style={[styles.cardBtnText, { color: "#FFFFFF" }, activePlanId === proPlan.id && styles.cardBtnTextCurrent]}>
                      {activePlanId === proPlan.id ? "Current Plan" : "Choose Pro"}
                    </Text>
                  </Pressable>

                  <View style={[styles.divider, { backgroundColor: "rgba(255,255,255,0.1)" }]} />
                  <Text style={[styles.cardFeaturesHeader, { color: "#FFFFFF" }]}>Everything in Growth +</Text>
                  {proPlan.features.slice(0, 8).map((f, idx) => (
                    <View key={idx} style={styles.featItem}>
                      <Ionicons name="checkmark" size={16} color="#635BFF" />
                      <Text style={[styles.featText, { color: "rgba(255,255,255,0.7)" }]}>{f}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* PLAN COMPARISON MATRIX */}
          <Text style={[styles.matrixTitle, { color: theme.onSurface }]}>Compare all features</Text>
          
          {[
            {
              category: "Billing",
              features: [
                { name: "Billing", starter: "✓", growth: "✓", pro: "✓" },
                { name: "Menu CRUD", starter: "✓", growth: "✓", pro: "✓" },
                { name: "Tables", starter: "✓", growth: "✓", pro: "✓" },
                { name: "Thermal printing", starter: "✓", growth: "✓", pro: "✓" },
                { name: "GST", starter: "✓", growth: "✓", pro: "✓" },
              ]
            },
            {
              category: "Users",
              features: [
                { name: "Owner", starter: "✓", growth: "✓", pro: "✓" },
                { name: "Staff", starter: "❌", growth: "4 additional", pro: "14 additional" },
                { name: "Staff management", starter: "❌", growth: "✓", pro: "✓" },
                { name: "Advanced permissions", starter: "❌", growth: "❌", pro: "✓" },
              ]
            },
            {
              category: "Operations",
              features: [
                { name: "Offline billing", starter: "✓", growth: "✓", pro: "✓" },
                { name: "Cloud backup", starter: "✓", growth: "✓", pro: "✓" },
                { name: "Realtime sync", starter: "❌", growth: "✓", pro: "✓" },
                { name: "Notifications", starter: "❌", growth: "✓", pro: "Advanced" },
              ]
            },
            {
              category: "Analytics",
              features: [
                { name: "Basic sales", starter: "❌", growth: "✓", pro: "✓" },
                { name: "Advanced analytics", starter: "❌", growth: "✓", pro: "✓" },
                { name: "Advanced reports", starter: "❌", growth: "✓", pro: "✓" },
              ]
            },
            {
              category: "Inventory",
              features: [
                { name: "Inventory", starter: "❌", growth: "✓", pro: "✓" },
                { name: "Advanced inventory", starter: "❌", growth: "❌", pro: "✓" },
              ]
            },
            {
              category: "AI",
              features: [
                { name: "AI Photo → Menu", starter: "❌", growth: "✓", pro: "✓" },
                { name: "Advanced AI", starter: "❌", growth: "❌", pro: "✓" },
              ]
            },
            {
              category: "QR Ordering",
              features: [
                { name: "QR Web Menu", starter: "❌", growth: "❌", pro: "✓" },
                { name: "Customer ordering", starter: "❌", growth: "❌", pro: "✓" },
                { name: "Table QR", starter: "❌", growth: "❌", pro: "✓" },
                { name: "Waiter QR confirmation", starter: "❌", growth: "❌", pro: "✓" },
              ]
            },
            {
              category: "Advanced",
              features: [
                { name: "Audit logs", starter: "❌", growth: "❌", pro: "✓" },
                { name: "API", starter: "❌", growth: "❌", pro: "✓" },
                { name: "Integrations", starter: "❌", growth: "❌", pro: "✓" },
              ]
            }
          ].map((catGroup, catIdx) => (
            <View key={catIdx} style={{ marginBottom: spacing.md }}>
              <Text style={{ color: colors.brand, marginTop: spacing.sm, fontWeight: "900", fontSize: 13, letterSpacing: 0.5 }}>
                {catGroup.category.toUpperCase()}
              </Text>
              <View style={[styles.matrixContainer, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
                <View style={styles.matrixRowHeader}>
                  <Text style={[styles.matrixLabelCol, { color: theme.onSurfaceTertiary }]}>Feature</Text>
                  <Text style={[styles.matrixValueCol, { color: theme.onSurfaceTertiary }]}>Starter</Text>
                  <Text style={[styles.matrixValueCol, { color: theme.onSurfaceTertiary }]}>Growth</Text>
                  <Text style={[styles.matrixValueCol, { color: theme.onSurfaceTertiary }]}>Pro</Text>
                </View>
                {catGroup.features.map((row, idx) => (
                  <View key={idx} style={[styles.matrixRow, { borderBottomColor: theme.border }]}>
                    <Text style={[styles.matrixLabelCol, { color: theme.onSurface }]}>{row.name}</Text>
                    <Text style={[styles.matrixValueCol, { color: row.starter === "❌" ? "#EF4444" : theme.onSurfaceSecondary }]}>{row.starter}</Text>
                    <Text style={[styles.matrixValueCol, { color: row.growth === "❌" ? "#EF4444" : theme.onSurfaceSecondary }]}>{row.growth}</Text>
                    <Text style={[styles.matrixValueCol, { color: row.pro === "❌" ? "#EF4444" : theme.onSurfaceSecondary }]}>{row.pro}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}

          {/* PAYMENT HISTORY */}
          {sub && sub.payment_history && sub.payment_history.length > 0 && (
            <View style={[styles.historyCard, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
              <Text style={[styles.historyTitle, { color: theme.onSurface }]}>Payment History</Text>
              <View style={styles.historyList}>
                {sub.payment_history.map((h: any, idx: number) => (
                  <View key={h.id || idx} style={[styles.historyRow, idx > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
                    <View>
                      <Text style={[styles.historyPlanNameText, { color: theme.onSurface }]}>
                        {h.plan_id.includes("STARTER") ? "Starter Plan" : h.plan_id.includes("GROWTH") ? "Growth Plan" : "Pro Plan"}
                      </Text>
                      <Text style={[styles.historyDateText, { color: theme.onSurfaceTertiary }]}>
                        {h.paid_at ? new Date(h.paid_at).toLocaleDateString() : new Date(h.created_at).toLocaleDateString()}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={[styles.historyAmountText, { color: theme.onSurface }]}>₹{h.amount / 100}</Text>
                      <Text style={[styles.historyPaidBadge, { color: "#10B981" }]}>✓ Paid</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}
          <View style={[styles.legalDisclosureCard, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <Ionicons name="information-circle-outline" size={18} color={colors.brand} />
              <Text style={[styles.legalDisclosureTitle, { color: theme.onSurface }]}>Billing Transparency & Policies</Text>
            </View>
            <Text style={[styles.legalDisclosureText, { color: theme.onSurfaceSecondary }]}>
              • <Text style={{ fontWeight: "700" }}>Pricing & Taxes</Text>: All prices listed in INR (Indian Rupees). Taxes applicable per statutory Indian GST regulations.{"\n"}
              • <Text style={{ fontWeight: "700" }}>AutoPay Mandates</Text>: AutoPay recurring mandates can be cancelled at any time with 1-click in the app without cancellation fees. Access remains active until the end of the paid billing cycle.{"\n"}
              • <Text style={{ fontWeight: "700" }}>Payment Processing</Text>: Payments are processed securely via Razorpay Software Pvt. Ltd. (PCI-DSS Level 1 certified). We never store card credentials.{"\n"}
              • <Text style={{ fontWeight: "700" }}>Refunds</Text>: SaaS subscriptions are non-refundable once an active billing period commences.
            </Text>
            <View style={styles.legalLinksRow}>
              <Pressable onPress={() => router.push("/(app)/legal")}>
                <Text style={styles.legalLinkText}>Terms of Service</Text>
              </Pressable>
              <Text style={{ color: theme.onSurfaceTertiary }}>•</Text>
              <Pressable onPress={() => router.push("/(app)/legal")}>
                <Text style={styles.legalLinkText}>Refund & Cancellation Policy</Text>
              </Pressable>
              <Text style={{ color: theme.onSurfaceTertiary }}>•</Text>
              <Pressable onPress={() => router.push("/(app)/legal")}>
                <Text style={styles.legalLinkText}>Grievance Officer</Text>
              </Pressable>
            </View>
          </View>

        </ScrollView>
      </View>

      <Modal visible={!!checkoutHtml} animationType="slide" onRequestClose={() => setCheckoutHtml(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          <View style={styles.webviewHeader}>
            <Pressable onPress={() => setCheckoutHtml(null)} hitSlop={12} style={styles.closeBtn} testID="checkout-close-btn">
              <Ionicons name="close" size={24} color="#111" />
            </Pressable>
            <Text style={styles.webviewTitle}>Autopay Registration</Text>
            <View style={{ width: 40 }} />
          </View>
          {checkoutHtml && (
            <WebView
              source={{ html: checkoutHtml, baseUrl: "https://checkout.razorpay.com" }}
              originWhitelist={["*"]}
              javaScriptEnabled
              onMessage={onWebMessage}
              startInLoadingState
              style={{ flex: 1 }}
            />
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function buildCheckoutHtml(co: any): string {
  const opts = {
    key: co.key_id,
    subscription_id: co.subscription_id,
    name: "EzBill ERP",
    description: (`${co.plan_name} Subscription`).replace(/[^a-zA-Z0-9 ]/g, ""),
    prefill: co.prefill,
    theme: { color: "#FF5E2B" },
  };
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><style>
    body { font-family:-apple-system,Segoe UI,Roboto,sans-serif; background:#0D0D0D; color:#F7F7F7; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; }
    .card { text-align:center; }
    button { background:#FF5E2B; color:#FFFFFF; border:none; padding:14px 28px; font-size:16px; border-radius:12px; font-weight:600; }
  </style></head><body>
    <div class="card"><p>Loading Razorpay Autopay Mandate Setup…</p><button id="pay">Authorize Mandate</button></div>
    <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
    <script>
      var opts = ${JSON.stringify(opts)};
      opts.handler = function(res){
        window.ReactNativeWebView.postMessage(JSON.stringify({type:"success", ...res}));
      };
      opts.modal = { ondismiss: function(){ window.ReactNativeWebView.postMessage(JSON.stringify({type:"cancel"})); } };
      var rzp = new Razorpay(opts);
      rzp.on('payment.failed', function(resp){
        window.ReactNativeWebView.postMessage(JSON.stringify({type:"error", message: resp.error && resp.error.description}));
      });
      document.getElementById('pay').onclick = function(){ rzp.open(); };
      setTimeout(function(){ rzp.open(); }, 200);
    </script>
  </body></html>`;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.02)" },
  title: { fontSize: 22, fontWeight: "900" },
  heroTextContainer: {
    alignItems: "center",
    textAlign: "center",
    paddingVertical: spacing.sm,
    gap: 4,
  },
  heroHeadline: {
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
    lineHeight: 28,
  },
  heroSubtext: {
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
  },
  heroTagline: {
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 2,
  },
  toggleContainer: {
    flexDirection: "row",
    padding: 4,
    borderRadius: radius.xl,
    marginHorizontal: spacing.xl,
    marginVertical: spacing.xs,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleBtnActive: {
    backgroundColor: "#FF5E2B",
  },
  toggleText: {
    fontSize: 13,
    fontWeight: "700",
  },
  toggleTextActive: {
    fontWeight: "800",
  },
  errBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "#EF4444",
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  errText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
  },
  msgBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "#10B981",
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  msgText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
  },
  activeSubCard: {
    padding: spacing.xl,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: spacing.sm,
  },
  activeSubHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  activeSubTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  activeSubRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.xs,
  },
  activePlanNameText: {
    fontSize: 18,
    fontWeight: "900",
  },
  activePlanPrice: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 2,
  },
  activeStatusBadge: {
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  activeStatusText: {
    color: "#065F46",
    fontSize: 11,
    fontWeight: "800",
  },
  detailsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  detailItem: {
    gap: 2,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  detailValue: {
    fontSize: 13,
    fontWeight: "800",
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnCancel: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  actionBtnReactivate: {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FF5E2B",
  },
  cardsStack: {
    gap: spacing.xl,
    marginTop: spacing.xs,
  },
  planCard: {
    padding: spacing.xl,
    borderRadius: radius.xl,
    borderWidth: 1,
    position: "relative",
    overflow: "hidden",
    gap: spacing.sm,
  },
  planCardGrowth: {
    shadowColor: "#FF5E2B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  planCardPro: {
    shadowColor: "#635BFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  popularRibbon: {
    position: "absolute",
    top: 14,
    right: -32,
    backgroundColor: "#FF5E2B",
    transform: [{ rotate: "45deg" }],
    paddingHorizontal: 28,
    paddingVertical: 4,
    width: 120,
    alignItems: "center",
  },
  popularRibbonText: {
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "900",
  },
  activeCardBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    backgroundColor: "#10B981",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  activeCardBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "900",
  },
  cardTierName: {
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1,
  },
  cardPriceText: {
    fontSize: 32,
    fontWeight: "900",
  },
  cardPricePeriod: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
  },
  saveBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,94,43,0.1)",
    color: "#FF5E2B",
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  cardTagline: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: spacing.xs,
  },
  cardBtn: {
    backgroundColor: "#FF5E2B",
    paddingVertical: 12,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs,
  },
  cardBtnCurrent: {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderWidth: 1,
    borderColor: "#10B981",
  },
  cardBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  cardBtnTextCurrent: {
    color: "#10B981",
  },
  cardFeaturesHeader: {
    fontSize: 13,
    fontWeight: "800",
    marginTop: spacing.xs,
  },
  featItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  featText: {
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },
  matrixTitle: {
    fontSize: 16,
    fontWeight: "900",
    marginTop: spacing.lg,
  },
  matrixContainer: {
    borderRadius: radius.xl,
    borderWidth: 1,
    overflow: "hidden",
  },
  matrixRowHeader: {
    flexDirection: "row",
    padding: spacing.md,
    backgroundColor: "rgba(0,0,0,0.02)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  matrixRow: {
    flexDirection: "row",
    padding: spacing.md,
    borderBottomWidth: 1,
  },
  matrixLabelCol: {
    flex: 2,
    fontSize: 13,
    fontWeight: "700",
  },
  matrixValueCol: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  historyCard: {
    padding: spacing.xl,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: spacing.md,
    marginTop: spacing.md,
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: "900",
  },
  historyList: {
    gap: 0,
  },
  historyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  historyPlanNameText: {
    fontSize: 14,
    fontWeight: "800",
  },
  historyDateText: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },
  historyAmountText: {
    fontSize: 14,
    fontWeight: "800",
  },
  historyPaidBadge: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginVertical: spacing.sm,
  },
  centerLoading: {
    paddingVertical: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  webviewHeader: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between", 
    paddingHorizontal: spacing.lg, 
    paddingVertical: spacing.md, 
    borderBottomWidth: 1, 
    borderBottomColor: "#E2E8F0", 
    backgroundColor: "#FFFFFF" 
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  webviewTitle: { 
    fontSize: 16, 
    fontWeight: "800", 
    color: "#111111" 
  },
  btnPressed: {
    opacity: 0.85,
  },
  legalDisclosureCard: {
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  legalDisclosureTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  legalDisclosureText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "500",
  },
  legalLinksRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
  },
  legalLinkText: {
    color: colors.brand,
    fontSize: 12,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
});
