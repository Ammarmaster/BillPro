import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Modal, TextInput, Alert,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/theme";
import { useTheme } from "@/src/context/ThemeContext";
import * as Haptics from "expo-haptics";

type Plan = { id: string; name: string; price: number; interval: string; valid_days?: number; razorpay_plan_id?: string; features: string[]; is_active: boolean };

export default function AdminPlans() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme, isDark } = useTheme();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [features, setFeatures] = useState("");
  const [validDays, setValidDays] = useState("30");
  const [razorpayPlanId, setRazorpayPlanId] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setPlans(await api.adminListPlans()); }
    catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    const p = parseFloat(price);
    const d = parseInt(validDays);
    if (!name.trim() || isNaN(p) || p <= 0 || isNaN(d) || d <= 0) { setErr("Enter name, valid price, and validity days."); return; }
    setBusy(true); setErr(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      await api.adminCreatePlan({
        name: name.trim(), price: p, interval,
        features: features.split(",").map(s => s.trim()).filter(Boolean),
        is_active: true,
        valid_days: d,
        razorpay_plan_id: razorpayPlanId.trim() || undefined,
      });
      setName(""); setPrice(""); setFeatures(""); setValidDays("30"); setRazorpayPlanId(""); setModal(false);
      await load();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const del = async (id: string, planName: string) => {
    Alert.alert(
      "Delete Plan?",
      `Are you sure you want to delete ${planName}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await api.adminDeletePlan(id);
              await load();
            } catch (e: any) {
              setErr(e.message);
            }
          }
        }
      ]
    );
  };

  return (
    <View style={[styles.wrap, { paddingTop: insets.top, backgroundColor: theme.surface }]} testID="admin-plans-screen">
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="admin-plans-back-btn" hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.onSurface} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.title, { color: theme.onSurface }]}>Pricing Tiers</Text>
          <Text style={{ fontSize: 12, color: theme.onSurfaceSecondary, fontWeight: "600" }}>
            {plans.length} subscription packages
          </Text>
        </View>
        <Pressable
          style={styles.addBtn}
          onPress={() => { setErr(null); setModal(true); }}
          testID="admin-plans-add-btn"
        >
          <LinearGradient
            colors={["#635BFF", "#4F46E5"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.addBtnGrad}
          >
            <Ionicons name="add" size={16} color="#FFFFFF" />
            <Text style={styles.addBtnText}>New Tier</Text>
          </LinearGradient>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#635BFF" size="large" /></View>
      ) : plans.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="pricetag-outline" size={48} color={theme.onSurfaceTertiary} />
          <Text style={{ color: theme.onSurfaceSecondary, fontSize: 14, fontWeight: "600", marginTop: 8 }}>
            No subscription plans created yet.
          </Text>
        </View>
      ) : (
        <FlatList
          data={plans}
          keyExtractor={p => p.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md }}
          renderItem={({ item }) => (
            <View
              style={[styles.card, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}
              testID={`admin-plan-${item.id}`}
            >
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={[styles.cardName, { color: theme.onSurface }]}>{item.name}</Text>
                  <View style={styles.intervalBadge}>
                    <Text style={styles.intervalBadgeText}>{item.interval.toUpperCase()}</Text>
                  </View>
                </View>
                
                <Text style={styles.cardPrice}>
                  ₹{item.price} <Text style={{ fontSize: 12, color: theme.onSurfaceSecondary, fontWeight: "500" }}>/ {item.interval} ({item.valid_days ?? (item.interval === "year" ? 365 : 30)} days)</Text>
                </Text>

                {!!item.razorpay_plan_id && (
                  <Text style={[styles.cardRzpId, { color: theme.onSurfaceTertiary }]} numberOfLines={1}>
                    RZP: {item.razorpay_plan_id}
                  </Text>
                )}
                {!!item.features?.length && (
                  <View style={styles.featuresBox}>
                    {item.features.map((f, i) => (
                      <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Ionicons name="checkmark-circle" size={13} color="#10B981" />
                        <Text style={[styles.cardFeat, { color: theme.onSurfaceSecondary }]}>{f}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              <Pressable
                onPress={() => del(item.id, item.name)}
                hitSlop={8}
                style={[styles.delBtn, { backgroundColor: theme.surfaceTertiary }]}
                testID={`admin-plan-delete-${item.id}`}
              >
                <Ionicons name="trash-outline" size={18} color={colors.onError} />
              </Pressable>
            </View>
          )}
        />
      )}

      {err && <Text style={styles.err} testID="admin-plans-error">{err}</Text>}

      {/* New Plan Modal */}
      <Modal transparent visible={modal} animationType="slide" onRequestClose={() => setModal(false)}>
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + spacing.xl, backgroundColor: theme.surfaceSecondary }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md }}>
              <Text style={[styles.modalTitle, { color: theme.onSurface }]}>Create Pricing Tier</Text>
              <Pressable onPress={() => setModal(false)} hitSlop={12}>
                <Ionicons name="close-circle" size={28} color={theme.onSurfaceSecondary} />
              </Pressable>
            </View>

            {err && <Text style={styles.err}>{err}</Text>}

            <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Plan Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Starter, Growth, or Pro Yearly"
              placeholderTextColor={theme.onSurfaceTertiary}
              style={[styles.input, { backgroundColor: theme.surfaceTertiary, borderColor: theme.border, color: theme.onSurface }]}
              testID="plan-name-input"
            />

            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Price (₹)</Text>
                <TextInput
                  value={price}
                  onChangeText={setPrice}
                  placeholder="999"
                  keyboardType="decimal-pad"
                  placeholderTextColor={theme.onSurfaceTertiary}
                  style={[styles.input, { backgroundColor: theme.surfaceTertiary, borderColor: theme.border, color: theme.onSurface }]}
                  testID="plan-price-input"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Validity (Days)</Text>
                <TextInput
                  value={validDays}
                  onChangeText={setValidDays}
                  placeholder="30"
                  keyboardType="number-pad"
                  placeholderTextColor={theme.onSurfaceTertiary}
                  style={[styles.input, { backgroundColor: theme.surfaceTertiary, borderColor: theme.border, color: theme.onSurface }]}
                  testID="plan-days-input"
                />
              </View>
            </View>

            <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Billing Cycle</Text>
            <View style={styles.intervalRow}>
              {(["month", "year"] as const).map(v => (
                <Pressable
                  key={v}
                  style={[
                    styles.intervalChip,
                    { backgroundColor: theme.surfaceTertiary, borderColor: theme.border },
                    interval === v && styles.intervalChipActive
                  ]}
                  onPress={() => {
                    setInterval(v);
                    setValidDays(v === "year" ? "365" : "30");
                  }}
                  testID={`plan-interval-${v}`}
                >
                  <Text style={[styles.intervalText, { color: theme.onSurfaceSecondary }, interval === v && { color: "#FFFFFF", fontWeight: "800" }]}>
                    Per {v === "month" ? "Month (30d)" : "Year (365d)"}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Razorpay Plan ID (Optional)</Text>
            <TextInput
              value={razorpayPlanId}
              onChangeText={setRazorpayPlanId}
              placeholder="plan_Kj84..."
              placeholderTextColor={theme.onSurfaceTertiary}
              style={[styles.input, { backgroundColor: theme.surfaceTertiary, borderColor: theme.border, color: theme.onSurface }]}
              testID="plan-rzp-id-input"
            />

            <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Included Features (Comma-separated)</Text>
            <TextInput
              value={features}
              onChangeText={setFeatures}
              placeholder="POS Billing, Inventory Control, QR Menu, AI Menu Import"
              placeholderTextColor={theme.onSurfaceTertiary}
              style={[styles.input, { backgroundColor: theme.surfaceTertiary, borderColor: theme.border, color: theme.onSurface, minHeight: 60 }]}
              multiline
              testID="plan-features-input"
            />

            <View style={styles.modalActions}>
              <Pressable style={[styles.ghostBtn, { borderColor: theme.border }]} onPress={() => setModal(false)} testID="plan-cancel-btn">
                <Text style={[styles.ghostBtnText, { color: theme.onSurfaceSecondary }]}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.primaryBtn} onPress={save} disabled={busy} testID="plan-save-btn">
                <LinearGradient
                  colors={["#635BFF", "#4F46E5"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.primaryGrad}
                >
                  {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Create Tier</Text>}
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 38, height: 38, borderRadius: 19, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 20, fontWeight: "900" },
  addBtn: { borderRadius: radius.pill, overflow: "hidden", elevation: 2 },
  addBtnGrad: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl },

  card: { flexDirection: "row", padding: spacing.lg, borderRadius: radius.xl, borderWidth: 1, gap: spacing.md, alignItems: "flex-start" },
  cardName: { fontSize: 17, fontWeight: "800" },
  intervalBadge: { backgroundColor: "rgba(99, 91, 255, 0.12)", paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  intervalBadgeText: { color: "#635BFF", fontSize: 9, fontWeight: "900" },
  cardPrice: { color: "#635BFF", fontSize: 18, fontWeight: "900", marginTop: 4 },
  featuresBox: { marginTop: 8, gap: 4 },
  cardFeat: { fontSize: 12, fontWeight: "500" },
  cardRzpId: { fontSize: 10, marginTop: 4 },
  delBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center" },

  err: { color: colors.onError, backgroundColor: colors.error, margin: spacing.lg, padding: spacing.md, borderRadius: radius.md, fontWeight: "700", fontSize: 13 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  modalCard: { padding: spacing.xl, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: "90%" },
  modalTitle: { fontSize: 20, fontWeight: "900" },
  label: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, marginTop: spacing.sm, marginBottom: 4 },
  input: { borderRadius: radius.md, padding: spacing.md, borderWidth: 1, fontSize: 13, fontWeight: "500", marginBottom: spacing.xs },
  intervalRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.xs },
  intervalChip: { flex: 1, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, alignItems: "center" },
  intervalChipActive: { backgroundColor: "#635BFF", borderColor: "#635BFF" },
  intervalText: { fontSize: 12, fontWeight: "700" },
  modalActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  ghostBtn: { flex: 1, paddingVertical: 14, borderRadius: radius.md, alignItems: "center", borderWidth: 1 },
  ghostBtnText: { fontWeight: "700", fontSize: 13 },
  primaryBtn: { flex: 1, borderRadius: radius.md, overflow: "hidden" },
  primaryGrad: { paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#FFFFFF", fontWeight: "800", fontSize: 13 },
});

