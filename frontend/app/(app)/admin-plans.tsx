import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Modal, TextInput, Alert, ScrollView,
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

type Plan = {
  id: string;
  name: string;
  price: number;
  interval: string;
  valid_days?: number;
  razorpay_plan_id?: string;
  features: string[];
  is_active: boolean;
  is_local_mode?: boolean;
  max_users?: number;
};

export default function AdminPlans() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const { isDesktop } = useResponsive();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [features, setFeatures] = useState("");
  const [validDays, setValidDays] = useState("30");
  const [razorpayPlanId, setRazorpayPlanId] = useState("");
  const [isLocalMode, setIsLocalMode] = useState(false);
  const [busy, setBusy] = useState(false);

  // Legal Settings Modal
  const [legalModal, setLegalModal] = useState(false);
  const [legalForm, setLegalForm] = useState({
    company_name: "ProDevOpz Solutions",
    brand_name: "EzBill / BillPro",
    registered_address: "ProDevOpz Solutions, India",
    support_email: "contactprodevopz@gmail.com",
    grievance_email: "contactprodevopz@gmail.com",
    grievance_officer_name: "Grievance Redressal Officer",
    contact_number: "+91 81520 75375",
    terms_version: "v1.0",
    privacy_version: "v1.0",
  });

  const handlePriceChange = (val: string) => {
    setPrice(val);
    const num = parseFloat(val);
    if (num === 299 || num === 2999) {
      setIsLocalMode(true);
    }
  };

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [pList, lCfg] = await Promise.all([
        api.adminListPlans(),
        api.getLegalConfig().catch(() => null),
      ]);
      setPlans(pList || []);
      if (lCfg) {
        setLegalForm({
          company_name: lCfg.company_name || "ProDevOpz Solutions",
          brand_name: lCfg.brand_name || "EzBill / BillPro",
          registered_address: lCfg.registered_address || "ProDevOpz Solutions, India",
          support_email: lCfg.support_email || "contactprodevopz@gmail.com",
          grievance_email: lCfg.grievance_email || "contactprodevopz@gmail.com",
          grievance_officer_name: lCfg.grievance_officer_name || "Grievance Redressal Officer",
          contact_number: lCfg.contact_number || "+91 81520 75375",
          terms_version: lCfg.terms_version || "v1.0",
          privacy_version: lCfg.privacy_version || "v1.0",
        });
      }
    }
    catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const saveLegalConfig = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      await api.adminUpdateLegalConfig(legalForm);
      setLegalModal(false);
      Alert.alert("Success", "Legal entity and compliance settings updated successfully.");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

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
        is_local_mode: isLocalMode || p === 299 || p === 2999 || name.toLowerCase().includes("starter") || name.toLowerCase().includes("basic"),
        max_users: isLocalMode ? 1 : undefined
      });
      setName(""); setPrice(""); setFeatures(""); setValidDays("30"); setRazorpayPlanId(""); setIsLocalMode(false); setModal(false);
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
      <View style={[{ flex: 1, width: "100%" }, isDesktop && { maxWidth: 1200, alignSelf: "center" }]}>
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
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Pressable
            style={[styles.backBtn, { backgroundColor: theme.surfaceSecondary, borderWidth: 1, borderColor: theme.border }]}
            onPress={() => { setErr(null); setLegalModal(true); }}
            testID="admin-legal-settings-btn"
          >
            <Ionicons name="shield-checkmark-outline" size={18} color="#635BFF" />
          </Pressable>
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
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Text style={[styles.cardName, { color: theme.onSurface }]}>{item.name}</Text>
                  <View style={styles.intervalBadge}>
                    <Text style={styles.intervalBadgeText}>{item.interval.toUpperCase()}</Text>
                  </View>
                  {(item.is_local_mode || item.price === 299 || item.price === 2999 || item.name.toLowerCase().includes("starter") || item.name.toLowerCase().includes("basic")) && (
                    <View style={styles.localBadge}>
                      <Ionicons name="flash" size={11} color="#16A34A" />
                      <Text style={styles.localBadgeText}>100% Local Speed (1 User)</Text>
                    </View>
                  )}
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
        <View style={[styles.modalBg, isDesktop && { justifyContent: "center", alignItems: "center", padding: spacing.xl }]}>
          <View style={[
            styles.modalCard, 
            { 
              paddingBottom: isDesktop ? spacing.xl : insets.bottom + spacing.xl, 
              backgroundColor: theme.surfaceSecondary,
              width: isDesktop ? 540 : "100%",
              borderRadius: isDesktop ? 20 : undefined,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              borderWidth: isDesktop ? 1 : 0,
              borderColor: theme.border,
            }
          ]}>
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
                  onChangeText={handlePriceChange}
                  placeholder="299"
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

            {/* Local Mode Toggle */}
            <Pressable
              style={[
                styles.toggleRow,
                { backgroundColor: theme.surfaceTertiary, borderColor: isLocalMode ? "#16A34A" : theme.border }
              ]}
              onPress={() => setIsLocalMode(!isLocalMode)}
            >
              <View style={{ flex: 1, marginRight: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name="flash" size={14} color="#16A34A" />
                  <Text style={[styles.toggleTitle, { color: theme.onSurface }]}>Local-First 0ms Engine (1 User)</Text>
                </View>
                <Text style={[styles.toggleSub, { color: theme.onSurfaceSecondary }]}>
                  Processes orders and bills 100% locally on device with single background cloud backup. Perfect for ₹299/₹2999 plans.
                </Text>
              </View>
              <Ionicons
                name={isLocalMode ? "checkbox" : "square-outline"}
                size={24}
                color={isLocalMode ? "#16A34A" : theme.onSurfaceTertiary}
              />
            </Pressable>

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

      {/* SUPER ADMIN LEGAL CONFIGURATION MODAL */}
      <Modal visible={legalModal} animationType="slide" transparent onRequestClose={() => setLegalModal(false)}>
        <View style={[styles.modalBg, isDesktop && { justifyContent: "center", alignItems: "center", padding: spacing.xl }]}>
          <View style={[
            styles.modalCard, 
            { 
              backgroundColor: theme.surfaceSecondary,
              width: isDesktop ? 560 : "100%",
              borderRadius: isDesktop ? 20 : undefined,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              maxHeight: isDesktop ? "90%" : undefined,
              borderWidth: isDesktop ? 1 : 0,
              borderColor: theme.border,
            }
          ]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
              <Text style={[styles.modalTitle, { color: theme.onSurface }]}>Legal & Compliance Setup</Text>
              <Pressable onPress={() => setLegalModal(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color={theme.onSurfaceSecondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Company Legal Entity Name</Text>
              <TextInput
                value={legalForm.company_name}
                onChangeText={t => setLegalForm(f => ({ ...f, company_name: t }))}
                placeholder="ProDevOpz Solutions"
                placeholderTextColor={theme.onSurfaceTertiary}
                style={[styles.input, { backgroundColor: theme.surfaceTertiary, borderColor: theme.border, color: theme.onSurface }]}
              />

              <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Brand / App Name</Text>
              <TextInput
                value={legalForm.brand_name}
                onChangeText={t => setLegalForm(f => ({ ...f, brand_name: t }))}
                placeholder="EzBill"
                placeholderTextColor={theme.onSurfaceTertiary}
                style={[styles.input, { backgroundColor: theme.surfaceTertiary, borderColor: theme.border, color: theme.onSurface }]}
              />

              <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Registered Office Address</Text>
              <TextInput
                value={legalForm.registered_address}
                onChangeText={t => setLegalForm(f => ({ ...f, registered_address: t }))}
                placeholder="Address in India"
                placeholderTextColor={theme.onSurfaceTertiary}
                style={[styles.input, { backgroundColor: theme.surfaceTertiary, borderColor: theme.border, color: theme.onSurface }]}
                multiline
              />

              <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Grievance Officer Name</Text>
              <TextInput
                value={legalForm.grievance_officer_name}
                onChangeText={t => setLegalForm(f => ({ ...f, grievance_officer_name: t }))}
                placeholder="Grievance Redressal Officer"
                placeholderTextColor={theme.onSurfaceTertiary}
                style={[styles.input, { backgroundColor: theme.surfaceTertiary, borderColor: theme.border, color: theme.onSurface }]}
              />

              <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Grievance Email</Text>
              <TextInput
                value={legalForm.grievance_email}
                onChangeText={t => setLegalForm(f => ({ ...f, grievance_email: t }))}
                placeholder="contactprodevopz@gmail.com"
                placeholderTextColor={theme.onSurfaceTertiary}
                style={[styles.input, { backgroundColor: theme.surfaceTertiary, borderColor: theme.border, color: theme.onSurface }]}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Support Email</Text>
              <TextInput
                value={legalForm.support_email}
                onChangeText={t => setLegalForm(f => ({ ...f, support_email: t }))}
                placeholder="contactprodevopz@gmail.com"
                placeholderTextColor={theme.onSurfaceTertiary}
                style={[styles.input, { backgroundColor: theme.surfaceTertiary, borderColor: theme.border, color: theme.onSurface }]}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Support Phone</Text>
              <TextInput
                value={legalForm.contact_number}
                onChangeText={t => setLegalForm(f => ({ ...f, contact_number: t }))}
                placeholder="+91 XXXXX XXXXX"
                placeholderTextColor={theme.onSurfaceTertiary}
                style={[styles.input, { backgroundColor: theme.surfaceTertiary, borderColor: theme.border, color: theme.onSurface }]}
                keyboardType="phone-pad"
              />

              <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Terms Version</Text>
              <TextInput
                value={legalForm.terms_version}
                onChangeText={t => setLegalForm(f => ({ ...f, terms_version: t }))}
                placeholder="v1.0"
                placeholderTextColor={theme.onSurfaceTertiary}
                style={[styles.input, { backgroundColor: theme.surfaceTertiary, borderColor: theme.border, color: theme.onSurface }]}
              />

              <View style={styles.modalActions}>
                <Pressable style={[styles.ghostBtn, { borderColor: theme.border }]} onPress={() => setLegalModal(false)}>
                  <Text style={[styles.ghostBtnText, { color: theme.onSurfaceSecondary }]}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.primaryBtn} onPress={saveLegalConfig} disabled={busy}>
                  <LinearGradient
                    colors={["#635BFF", "#4F46E5"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.primaryGrad}
                  >
                    {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Save Legal Config</Text>}
                  </LinearGradient>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
      </View>
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
  localBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#DCFCE7", paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  localBadgeText: { color: "#166534", fontSize: 9, fontWeight: "800" },
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
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md, borderRadius: radius.md, borderWidth: 1, marginVertical: spacing.xs },
  toggleTitle: { fontSize: 13, fontWeight: "800" },
  toggleSub: { fontSize: 11, marginTop: 2, lineHeight: 15 },
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

