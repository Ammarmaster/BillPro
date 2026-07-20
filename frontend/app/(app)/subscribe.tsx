import { useCallback, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView, Modal,
} from "react-native";
import { WebView } from "react-native-webview";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/theme";

type Plan = { id: string; name: string; price: number; interval: string; features: string[] };

export default function Subscribe() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sub, setSub] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [checkoutHtml, setCheckoutHtml] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const currentPlanRef = useRef<Plan | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [p, s] = await Promise.all([api.publicPlans(), api.mySubscription()]);
      setPlans(p); setSub(s);
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const startCheckout = async (plan: Plan) => {
    setBusy(true); setErr(null); setMsg(null);
    currentPlanRef.current = plan;
    try {
      const co = await api.checkout(plan.id);
      const html = buildCheckoutHtml(co);
      setCheckoutHtml(html);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const onWebMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "success" && currentPlanRef.current) {
        setCheckoutHtml(null);
        setBusy(true);
        const verified = await api.verifyPayment({
          razorpay_order_id: data.razorpay_order_id,
          razorpay_payment_id: data.razorpay_payment_id,
          razorpay_signature: data.razorpay_signature,
          plan_id: currentPlanRef.current.id,
        });
        setSub(verified);
        setMsg("Subscription activated!");
      } else if (data.type === "cancel") {
        setCheckoutHtml(null);
        setErr("Checkout cancelled.");
      } else if (data.type === "error") {
        setCheckoutHtml(null);
        setErr(data.message || "Payment failed.");
      }
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const activePlan = useMemo(() => sub?.status === "active" ? sub : null, [sub]);

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]} testID="subscribe-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="subscribe-back-btn" hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Subscription</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md }}>
        {activePlan && (
          <View style={styles.activeCard} testID="subscription-active-banner">
            <Ionicons name="checkmark-circle" size={24} color={colors.onSuccess} />
            <View style={{ flex: 1 }}>
              <Text style={styles.activeTitle}>{activePlan.plan_name} · Active</Text>
              <Text style={styles.activeSub}>₹{activePlan.price}/{activePlan.interval}</Text>
            </View>
          </View>
        )}

        <Text style={styles.section}>Choose a Plan</Text>

        {loading ? (
          <ActivityIndicator color={colors.brand} />
        ) : (
          plans.map(p => (
            <View key={p.id} style={styles.planCard} testID={`plan-card-${p.id}`}>
              <View style={styles.planHead}>
                <Text style={styles.planName}>{p.name}</Text>
                <Text style={styles.planPrice}>₹{p.price}<Text style={styles.perUnit}> / {p.interval}</Text></Text>
              </View>
              {!!p.features?.length && p.features.map((f, idx) => (
                <View key={idx} style={styles.featureRow}>
                  <Ionicons name="checkmark" size={16} color={colors.brand} />
                  <Text style={styles.featureText}>{f}</Text>
                </View>
              ))}
              <Pressable
                style={[styles.subBtn, activePlan?.plan_id === p.id && { opacity: 0.4 }]}
                onPress={() => startCheckout(p)}
                disabled={busy || activePlan?.plan_id === p.id}
                testID={`plan-subscribe-${p.id}`}
              >
                {busy ? <ActivityIndicator color={colors.onBrand} /> : (
                  <Text style={styles.subBtnText}>{activePlan?.plan_id === p.id ? "Current Plan" : `Subscribe · ₹${p.price}`}</Text>
                )}
              </Pressable>
            </View>
          ))
        )}

        {err && <Text style={styles.err} testID="subscribe-error">{err}</Text>}
        {msg && <Text style={styles.msg} testID="subscribe-msg">{msg}</Text>}
      </ScrollView>

      <Modal visible={!!checkoutHtml} animationType="slide" onRequestClose={() => setCheckoutHtml(null)}>
        <View style={{ flex: 1, backgroundColor: "#fff" }}>
          <View style={[styles.webviewHeader, { paddingTop: insets.top + 8 }]}>
            <Pressable onPress={() => setCheckoutHtml(null)} hitSlop={12} testID="checkout-close-btn">
              <Ionicons name="close" size={24} color="#111" />
            </Pressable>
            <Text style={styles.webviewTitle}>Razorpay Checkout</Text>
            <View style={{ width: 24 }} />
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
        </View>
      </Modal>
    </View>
  );
}

function buildCheckoutHtml(co: any): string {
  const opts = {
    key: co.key_id,
    amount: co.amount,
    currency: co.currency,
    order_id: co.order_id,
    name: "Lumina ERP",
    description: `${co.plan_name} · ₹${(co.amount / 100).toFixed(0)}/${co.interval}`,
    prefill: co.prefill,
    notes: co.notes,
    theme: { color: "#D4AF37" },
  };
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><style>
    body { font-family:-apple-system,Segoe UI,Roboto,sans-serif; background:#0D0D0D; color:#F7F7F7; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; }
    .card { text-align:center; }
    button { background:#D4AF37; color:#0D0D0D; border:none; padding:14px 28px; font-size:16px; border-radius:12px; font-weight:600; }
  </style></head><body>
    <div class="card"><p>Loading Razorpay…</p><button id="pay">Pay Now</button></div>
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
  wrap: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  title: { color: colors.onSurface, fontSize: 22, fontFamily: "serif" },
  section: { color: colors.onSurfaceSecondary, fontSize: 13, letterSpacing: 1, textTransform: "uppercase", marginTop: spacing.md },
  activeCard: { flexDirection: "row", gap: spacing.md, padding: spacing.lg, backgroundColor: colors.success, borderRadius: radius.lg, alignItems: "center" },
  activeTitle: { color: colors.onSuccess, fontSize: 16, fontWeight: "600" },
  activeSub: { color: colors.onSuccess, fontSize: 13, marginTop: 2 },
  planCard: { padding: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.brandTertiary, gap: spacing.sm },
  planHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: spacing.sm },
  planName: { color: colors.onSurface, fontSize: 20, fontFamily: "serif" },
  planPrice: { color: colors.brand, fontSize: 26, fontFamily: "serif" },
  perUnit: { color: colors.onSurfaceSecondary, fontSize: 13 },
  featureRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  featureText: { color: colors.onSurfaceSecondary, fontSize: 13, flex: 1 },
  subBtn: { backgroundColor: colors.brand, paddingVertical: 14, borderRadius: radius.md, alignItems: "center", marginTop: spacing.md },
  subBtnText: { color: colors.onBrand, fontWeight: "600", fontSize: 14, letterSpacing: 0.5 },
  err: { color: colors.onError, backgroundColor: colors.error, padding: spacing.md, borderRadius: radius.md, marginTop: spacing.sm },
  msg: { color: colors.onSuccess, backgroundColor: colors.success, padding: spacing.md, borderRadius: radius.md, marginTop: spacing.sm },
  webviewHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: "#eee", backgroundColor: "#fff" },
  webviewTitle: { fontSize: 16, fontWeight: "600", color: "#111" },
});
