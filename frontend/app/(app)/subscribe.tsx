import { useCallback, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView, SafeAreaView, StatusBar, Modal,
} from "react-native";
import { WebView } from "react-native-webview";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/context/AuthContext";
import { colors, spacing, radius } from "@/src/theme";
import { useTheme } from "@/src/context/ThemeContext";

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
  
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sub, setSub] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  
  const [checkoutHtml, setCheckoutHtml] = useState<string | null>(null);
  const currentPlanRef = useRef<Plan | null>(null);

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

  const remainingDays = useMemo(() => {
    if (!sub || sub.status !== "active" || !sub.ends_at) return 0;
    try {
      const diff = new Date(sub.ends_at).getTime() - new Date().getTime();
      return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    } catch {
      return 0;
    }
  }, [sub]);

  const activePlan = useMemo(() => sub?.status === "active" ? sub : null, [sub]);
  const expiredPlan = useMemo(() => sub?.status === "expired" ? sub : null, [sub]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.surface }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.surface} />
      <View style={[styles.wrap, { paddingTop: insets.top }]}>
        
        {/* Header Bar */}
        <View style={styles.header}>
          <Pressable 
            onPress={() => {
              if (activePlan) {
                router.push("/(app)/more");
              } else {
                router.replace("/");
              }
            }} 
            testID="subscribe-back-btn" 
            style={styles.backBtn}
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
          </Pressable>
          <Text style={[styles.title, { color: theme.onSurface }]}>Subscription</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg }} showsVerticalScrollIndicator={false}>
          
          {/* Current Status Card */}
          {activePlan ? (
            <View style={[styles.statusCard, { backgroundColor: isDark ? "#11261B" : "#ECFDF5", borderColor: isDark ? "#064E3B" : "#A7F3D0" }]}>
              <View style={styles.statusRow}>
                <View style={[styles.iconBox, { backgroundColor: isDark ? "#064E3B" : "#D1FAE5" }]}>
                  <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.statusTitle, { color: isDark ? "#34D399" : "#065F46" }]}>{activePlan.plan_name} Plan Active</Text>
                  <Text style={[styles.statusSub, { color: isDark ? "#A7F3D0" : "#047857" }]}>
                    Validity: {remainingDays} days remaining (expires {new Date(activePlan.ends_at).toLocaleDateString()})
                  </Text>
                </View>
              </View>
              <Pressable 
                style={[styles.dashBtn, { backgroundColor: "#10B981" }]}
                onPress={() => router.replace("/(app)/dashboard")}
              >
                <Text style={styles.dashBtnText}>Go to Dashboard</Text>
                <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
              </Pressable>
            </View>
          ) : expiredPlan ? (
            <View style={[styles.statusCard, { backgroundColor: isDark ? "#2A1414" : "#FEF2F2", borderColor: isDark ? "#7F1D1D" : "#FCA5A5" }]}>
              <View style={styles.statusRow}>
                <View style={[styles.iconBox, { backgroundColor: isDark ? "#7F1D1D" : "#FEE2E2" }]}>
                  <Ionicons name="alert-circle" size={24} color="#EF4444" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.statusTitle, { color: isDark ? "#F87171" : "#991B1B" }]}>Subscription Expired</Text>
                  <Text style={[styles.statusSub, { color: isDark ? "#FCA5A5" : "#B91C1C" }]}>
                    Your previous plan has expired. Subscribe to one of the plans below to restore full access.
                  </Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={[styles.statusCard, { backgroundColor: isDark ? "#1C1D24" : "#F1F5F9", borderColor: theme.border }]}>
              <View style={styles.statusRow}>
                <View style={[styles.iconBox, { backgroundColor: isDark ? "#282A36" : "#E2E8F0" }]}>
                  <Ionicons name="lock-closed" size={24} color={colors.onSurfaceSecondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.statusTitle, { color: theme.onSurface }]}>Subscription Required</Text>
                  <Text style={[styles.statusSub, { color: theme.onSurfaceSecondary }]}>
                    Subscribe to unlock full POS features including Orders, Kitchen display, and Dashboard.
                  </Text>
                </View>
              </View>
            </View>
          )}

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

          <Text style={[styles.sectionHeading, { color: theme.onSurface }]}>Pricing Plans</Text>

          {loading ? (
            <View style={styles.centerLoading}>
              <ActivityIndicator size="large" color={colors.brand} />
              <Text style={{ color: theme.onSurfaceSecondary, marginTop: 8 }}>Loading available plans...</Text>
            </View>
          ) : plans.length === 0 ? (
            <View style={styles.centerLoading}>
              <Ionicons name="sad-outline" size={48} color={theme.onSurfaceTertiary} />
              <Text style={{ color: theme.onSurfaceSecondary, marginTop: 8 }}>No subscription plans found.</Text>
            </View>
          ) : (
            plans.map(p => {
              const isCurrent = activePlan?.plan_id === p.id;
              const isPlanLoading = loadingPlanId === p.id;
              const isYearly = p.interval === "year";
              
              return (
                <View key={p.id} style={[styles.planCard, { backgroundColor: theme.surfaceSecondary, borderColor: isYearly ? colors.brand : theme.border }]}>
                  {isYearly && (
                    <View style={styles.popularBadge}>
                      <Text style={styles.popularText}>BEST VALUE</Text>
                    </View>
                  )}
                  
                  <View style={styles.planHead}>
                    <View>
                      <Text style={[styles.planName, { color: theme.onSurface }]}>{p.name}</Text>
                      <Text style={[styles.planValidity, { color: theme.onSurfaceSecondary }]}>
                        Validity: {p.valid_days ?? (isYearly ? 365 : 30)} Days
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={[styles.planPrice, { color: isYearly ? colors.brand : theme.onSurface }]}>₹{p.price}</Text>
                      <Text style={[styles.perUnit, { color: theme.onSurfaceSecondary }]}>per {p.interval}</Text>
                    </View>
                  </View>

                  <View style={[styles.divider, { backgroundColor: theme.border }]} />

                  <View style={styles.featuresList}>
                    {p.features?.map((f, idx) => (
                      <View key={idx} style={styles.featureRow}>
                        <Ionicons name="checkmark-circle-outline" size={18} color={colors.brand} />
                        <Text style={[styles.featureText, { color: theme.onSurfaceSecondary }]}>{f}</Text>
                      </View>
                    ))}
                  </View>

                  <Pressable
                    style={({ pressed }) => [
                      styles.subBtn,
                      { backgroundColor: isCurrent ? theme.border : colors.brand },
                      (isCurrent || loadingPlanId !== null) && { opacity: 0.5 },
                      pressed && styles.btnPressed
                    ]}
                    onPress={() => startCheckout(p)}
                    disabled={isCurrent || loadingPlanId !== null}
                  >
                    {isPlanLoading ? (
                      <ActivityIndicator color={colors.onBrand} />
                    ) : (
                      <Text style={[styles.subBtnText, { color: isCurrent ? theme.onSurfaceSecondary : colors.onBrand }]}>
                        {isCurrent ? "Active Plan" : `Subscribe Now • ₹${p.price}`}
                      </Text>
                    )}
                  </Pressable>
                </View>
              );
            })
          )}
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
    description: `${co.plan_name} Subscription`,
    prefill: co.prefill,
    theme: { color: "#635BFF" },
  };
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><style>
    body { font-family:-apple-system,Segoe UI,Roboto,sans-serif; background:#0D0D0D; color:#F7F7F7; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; }
    .card { text-align:center; }
    button { background:#635BFF; color:#FFFFFF; border:none; padding:14px 28px; font-size:16px; border-radius:12px; font-weight:600; }
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
  statusCard: {
    padding: spacing.xl,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: spacing.md,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  statusSub: {
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },
  dashBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.lg,
    marginTop: spacing.xs,
  },
  dashBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
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
  sectionHeading: {
    fontSize: 18,
    fontWeight: "900",
    marginTop: spacing.sm,
  },
  centerLoading: {
    paddingVertical: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  planCard: {
    padding: spacing.xl,
    borderRadius: radius.xl,
    borderWidth: 1,
    position: "relative",
    overflow: "hidden",
  },
  popularBadge: {
    position: "absolute",
    top: 12,
    right: -32,
    backgroundColor: colors.brand,
    transform: [{ rotate: "45deg" }],
    paddingHorizontal: 32,
    paddingVertical: 4,
    width: 120,
    alignItems: "center",
  },
  popularText: {
    color: colors.onBrand,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  planHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  planName: {
    fontSize: 20,
    fontWeight: "900",
  },
  planValidity: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  planPrice: {
    fontSize: 24,
    fontWeight: "900",
  },
  perUnit: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginVertical: spacing.lg,
  },
  featuresList: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  featureText: {
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
    lineHeight: 18,
  },
  subBtn: {
    paddingVertical: 14,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  subBtnText: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  btnPressed: {
    opacity: 0.85,
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
});
