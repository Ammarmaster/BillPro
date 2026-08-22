import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Modal, ScrollView, Linking, Switch, Alert,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/theme";
import * as Haptics from "expo-haptics";

type Sub = { id: string; plan_name: string; price: number; interval: string; status: string; ends_at?: string };
type Rest = {
  id: string; name: string; owner_name: string; owner_email?: string;
  phone: string; address: string; upi_id: string; gst?: string; subscription?: Sub | null;
  custom_features?: Record<string, boolean>; custom_staff_limit?: number;
};
type Plan = { id: string; name: string; price: number; interval: string };

export default function AdminRestaurants() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<Rest[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  // Admin Duration Selector for plan assignment
  const [assignDurationDays, setAssignDurationDays] = useState<number>(30);

  // Custom Feature Overrides State for detail modal
  const [customFeatures, setCustomFeatures] = useState<Record<string, boolean>>({});
  const [customStaffLimit, setCustomStaffLimit] = useState<number>(0);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [r, p] = await Promise.all([api.adminListRestaurants(), api.adminListPlans()]);
      setItems(r || []); setPlans(p || []);
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const open = async (r: Rest) => {
    try {
      setBusy(true);
      const d = await api.adminRestaurantDetail(r.id);
      setDetail(d);
      setCustomFeatures(d.custom_features || {});
      setCustomStaffLimit(d.custom_staff_limit !== undefined ? d.custom_staff_limit : (d.subscription?.status === "active" ? 14 : 0));
    } catch (e: any) { 
      setErr(e.message); 
    } finally {
      setBusy(false);
    }
  };

  const assign = async (planId: string) => {
    if (!detail) return;
    setBusy(true); setErr(null); setMsg(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try { 
      await api.adminAssignSubscription(detail.id, planId, assignDurationDays, "active"); 
      const fresh = await api.adminRestaurantDetail(detail.id);
      setDetail(fresh);
      setMsg(`Plan assigned for ${assignDurationDays >= 3650 ? "Lifetime" : `${assignDurationDays} days`}!`);
      await load(); 
    } catch (e: any) { 
      setErr(e.message); 
    } finally { 
      setBusy(false); 
    }
  };

  const expireNow = async () => {
    if (!detail) return;
    Alert.alert(
      "Expire Subscription Immediately?",
      `This will instantly lock out ${detail.name} from creating orders and bills until they renew.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Expire Now",
          style: "destructive",
          onPress: async () => {
            setBusy(true); setErr(null); setMsg(null);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
            try {
              await api.adminExpireSubscription(detail.id);
              const fresh = await api.adminRestaurantDetail(detail.id);
              setDetail(fresh);
              setMsg("Subscription expired successfully.");
              await load();
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

  const cancel = async () => {
    if (!detail) return;
    setBusy(true); setErr(null); setMsg(null);
    try { 
      await api.adminCancelSubscription(detail.id); 
      const fresh = await api.adminRestaurantDetail(detail.id);
      setDetail(fresh); 
      setMsg("Subscription cancelled.");
      await load(); 
    } catch (e: any) { 
      setErr(e.message); 
    } finally { 
      setBusy(false); 
    }
  };

  const saveFeatures = async () => {
    if (!detail) return;
    setBusy(true); setErr(null); setMsg(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      await api.adminUpdateRestaurantFeatures(detail.id, customFeatures, customStaffLimit);
      const fresh = await api.adminRestaurantDetail(detail.id);
      setDetail(fresh);
      setMsg("Custom features & staff limits saved!");
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const removeRest = async () => {
    if (!detail) return;
    Alert.alert(
      "Delete Business?",
      `Are you sure you want to delete ${detail.name}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try { 
              await api.adminDeleteRestaurant(detail.id); 
              setDetail(null); 
              await load(); 
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

  const getSubBadge = (sub?: Sub | null) => {
    if (!sub) return { label: "NO PLAN", bg: "#2E2E38", text: "#94A3B8" };
    if (sub.status === "active") return { label: `${sub.plan_name.toUpperCase()} · ACTIVE`, bg: "#064E3B", text: "#34D399" };
    if (sub.status === "expired") return { label: "EXPIRED", bg: "#7F1D1D", text: "#F87171" };
    return { label: sub.status.toUpperCase(), bg: "#78350F", text: "#FBBF24" };
  };

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]} testID="admin-restaurants-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="admin-rest-back-btn" hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Businesses ({items.length})</Text>
        <Pressable onPress={load} hitSlop={12}>
          <Ionicons name="refresh" size={22} color={colors.brand} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : items.length === 0 ? (
        <View style={styles.center}><Text style={{ color: colors.onSurfaceTertiary }}>No businesses yet.</Text></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={r => r.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md }}
          renderItem={({ item }) => {
            const badge = getSubBadge(item.subscription);
            return (
              <Pressable style={styles.card} onPress={() => open(item)} testID={`admin-rest-${item.id}`}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardName}>{item.name}</Text>
                  <Text style={styles.cardMeta}>{item.owner_name}{item.phone ? ` · ${item.phone}` : ""}</Text>
                  {!!item.address && <Text style={styles.cardAddr} numberOfLines={1}>{item.address}</Text>}
                </View>
                <View style={{ gap: spacing.xs, alignItems: "flex-end" }}>
                  {!!item.phone && (
                    <Pressable
                      style={styles.callPill}
                      onPress={(e) => {
                        e.stopPropagation();
                        Linking.openURL(`tel:${item.phone}`).catch(() => {});
                      }}
                    >
                      <Ionicons name="call" size={11} color="#FFFFFF" />
                      <Text style={styles.callPillText}>Call</Text>
                    </Pressable>
                  )}
                  <View style={[styles.subBadge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.subBadgeText, { color: badge.text }]}>
                      {badge.label}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {err && <Text style={styles.err} testID="admin-rest-error">{err}</Text>}

      {/* Restaurant Detail & Super-Admin Feature Control Modal */}
      <Modal transparent visible={!!detail} animationType="slide" onRequestClose={() => setDetail(null)}>
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + spacing.xl }]}>
            {detail && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={styles.modalTitle}>{detail.name}</Text>
                  <Pressable onPress={() => setDetail(null)} hitSlop={12}>
                    <Ionicons name="close-circle" size={28} color={colors.onSurfaceSecondary} />
                  </Pressable>
                </View>

                {msg && <Text style={styles.successMsg}>{msg}</Text>}
                {err && <Text style={styles.err}>{err}</Text>}

                <Text style={styles.detailRow}>Owner: <Text style={styles.detailVal}>{detail.owner_name}</Text></Text>
                {!!detail.phone && (
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginVertical: 3 }}>
                    <Text style={styles.detailRow}>Phone: <Text style={styles.detailVal}>{detail.phone}</Text></Text>
                    <Pressable
                      style={styles.callOwnerBtn}
                      onPress={() => Linking.openURL(`tel:${detail.phone}`).catch(() => {})}
                    >
                      <Ionicons name="call" size={13} color="#FFFFFF" />
                      <Text style={styles.callOwnerText}>Call Owner</Text>
                    </Pressable>
                  </View>
                )}
                {!!detail.address && <Text style={styles.detailRow}>Address: <Text style={styles.detailVal}>{detail.address}</Text></Text>}
                {!!detail.gst && <Text style={styles.detailRow}>GSTIN: <Text style={styles.detailVal}>{detail.gst}</Text></Text>}
                {!!detail.upi_id && <Text style={styles.detailRow}>UPI: <Text style={styles.detailVal}>{detail.upi_id}</Text></Text>}
                <Text style={styles.detailRow}>Orders: <Text style={styles.detailVal}>{detail.orders_total}</Text></Text>
                <Text style={styles.detailRow}>Revenue: <Text style={styles.detailVal}>₹{detail.revenue_total}</Text></Text>

                {/* SUBSCRIPTION STATUS & MANAGEMENT */}
                <Text style={styles.section}>Subscription Control</Text>
                {detail.subscription?.status === "active" ? (
                  <View style={styles.subCardActive}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <View>
                        <Text style={styles.subActiveTitle}>{detail.subscription.plan_name} Plan</Text>
                        <Text style={styles.subActiveMeta}>₹{detail.subscription.price} / {detail.subscription.interval}</Text>
                        {detail.subscription.ends_at && (
                          <Text style={styles.subActiveEnds}>
                            Ends: {new Date(detail.subscription.ends_at).toLocaleDateString()}
                          </Text>
                        )}
                      </View>
                      <View style={[styles.subBadge, { backgroundColor: "#064E3B" }]}>
                        <Text style={[styles.subBadgeText, { color: "#34D399" }]}>ACTIVE</Text>
                      </View>
                    </View>

                    <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                      <Pressable style={styles.expireBtn} onPress={expireNow} disabled={busy}>
                        <Ionicons name="flash-off-outline" size={15} color="#FFFFFF" />
                        <Text style={styles.expireBtnText}>Expire Now</Text>
                      </Pressable>
                      <Pressable style={styles.cancelBtn} onPress={cancel} disabled={busy}>
                        <Text style={styles.cancelBtnText}>Cancel</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View style={styles.subCardInactive}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={{ color: "#F87171", fontWeight: "700" }}>Subscription Inactive / Expired</Text>
                      <View style={[styles.subBadge, { backgroundColor: "#7F1D1D" }]}>
                        <Text style={[styles.subBadgeText, { color: "#F87171" }]}>EXPIRED</Text>
                      </View>
                    </View>
                  </View>
                )}

                {/* ASSIGN OR EXTEND PLAN */}
                <Text style={[styles.section, { marginTop: spacing.lg }]}>Assign / Extend Plan</Text>
                <Text style={styles.hint}>Choose duration & tap a plan to grant access:</Text>
                
                {/* Duration Pills */}
                <View style={styles.durationRow}>
                  {[
                    { label: "1 Month (30d)", days: 30 },
                    { label: "1 Year (365d)", days: 365 },
                    { label: "👑 Lifetime", days: 36500 },
                  ].map(d => (
                    <Pressable
                      key={d.days}
                      style={[styles.durationPill, assignDurationDays === d.days && styles.durationPillActive]}
                      onPress={() => setAssignDurationDays(d.days)}
                    >
                      <Text style={[styles.durationPillText, assignDurationDays === d.days && styles.durationPillTextActive]}>
                        {d.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {plans.map(p => (
                  <Pressable key={p.id} style={styles.planRow} onPress={() => assign(p.id)} disabled={busy}>
                    <View>
                      <Text style={styles.planName}>{p.name}</Text>
                      <Text style={styles.planInterval}>{p.interval}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={styles.planPrice}>₹{p.price}</Text>
                      <Text style={styles.planAction}>Grant Plan →</Text>
                    </View>
                  </Pressable>
                ))}

                {/* FEATURE TOGGLES & LIMITS OVERRIDE MATRIX */}
                <Text style={[styles.section, { marginTop: spacing.xl }]}>Feature Flags & Permissions</Text>
                <Text style={styles.hint}>Override specific feature access for this business:</Text>

                <View style={styles.featureMatrix}>
                  <View style={styles.featureRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.featureName}>🤖 AI Smart Menu Import</Text>
                      <Text style={styles.featureSub}>Scan physical menu via OCR & AI parsing</Text>
                    </View>
                    <Switch
                      value={customFeatures.ai_menu ?? true}
                      onValueChange={v => setCustomFeatures(p => ({ ...p, ai_menu: v }))}
                      trackColor={{ false: "#3E3E4A", true: colors.brand }}
                    />
                  </View>

                  <View style={styles.featureRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.featureName}>📱 Customer QR Web Menu</Text>
                      <Text style={styles.featureSub}>Customer self-ordering via table QR</Text>
                    </View>
                    <Switch
                      value={customFeatures.qr_web_menu ?? true}
                      onValueChange={v => setCustomFeatures(p => ({ ...p, qr_web_menu: v }))}
                      trackColor={{ false: "#3E3E4A", true: colors.brand }}
                    />
                  </View>

                  <View style={styles.featureRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.featureName}>📦 Inventory & Expense Control</Text>
                      <Text style={styles.featureSub}>Stock levels and daily expenses</Text>
                    </View>
                    <Switch
                      value={customFeatures.inventory ?? true}
                      onValueChange={v => setCustomFeatures(p => ({ ...p, inventory: v, expenses: v }))}
                      trackColor={{ false: "#3E3E4A", true: colors.brand }}
                    />
                  </View>

                  <View style={styles.featureRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.featureName}>📊 Advanced Reports & Analytics</Text>
                      <Text style={styles.featureSub}>Revenue trends, item charts, & exports</Text>
                    </View>
                    <Switch
                      value={customFeatures.advanced_reports ?? true}
                      onValueChange={v => setCustomFeatures(p => ({ ...p, advanced_reports: v }))}
                      trackColor={{ false: "#3E3E4A", true: colors.brand }}
                    />
                  </View>

                  {/* Staff Limit Controls */}
                  <View style={{ paddingTop: 10 }}>
                    <Text style={styles.featureName}>👥 Maximum Waiter Staff Limit</Text>
                    <View style={styles.staffLimitsRow}>
                      {[0, 4, 14, 50, 100].map(cnt => (
                        <Pressable
                          key={cnt}
                          style={[styles.staffLimitPill, customStaffLimit === cnt && styles.staffLimitPillActive]}
                          onPress={() => setCustomStaffLimit(cnt)}
                        >
                          <Text style={[styles.staffLimitText, customStaffLimit === cnt && styles.staffLimitTextActive]}>
                            {cnt === 0 ? "Owner" : `${cnt} Staff`}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  <Pressable style={styles.saveFeaturesBtn} onPress={saveFeatures} disabled={busy}>
                    <Text style={styles.saveFeaturesText}>Save Feature Overrides</Text>
                  </Pressable>
                </View>

                {/* DELETE BUSINESS */}
                <Pressable style={styles.dangerBtn} onPress={removeRest} disabled={busy} testID="admin-rest-delete">
                  <Ionicons name="trash" size={16} color={colors.onError} />
                  <Text style={styles.dangerText}>Delete Business</Text>
                </Pressable>

                <Pressable style={styles.ghostBtn} onPress={() => setDetail(null)} testID="admin-rest-close">
                  <Text style={styles.ghostText}>Close</Text>
                </Pressable>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  title: { color: colors.onSurface, fontSize: 22, fontFamily: "serif", fontWeight: "800" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { flexDirection: "row", padding: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, alignItems: "center", gap: spacing.md },
  cardName: { color: colors.onSurface, fontSize: 16, fontWeight: "700" },
  cardMeta: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 4 },
  cardAddr: { color: colors.onSurfaceTertiary, fontSize: 11, marginTop: 2 },
  callPill: { flexDirection: "row", alignItems: "center", backgroundColor: "#16A34A", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  callPillText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700", marginLeft: 3 },
  subBadge: { paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius.pill },
  subBadgeText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  err: { color: colors.onError, backgroundColor: colors.error, marginVertical: spacing.sm, padding: spacing.md, borderRadius: radius.md, fontSize: 13 },
  successMsg: { color: "#34D399", backgroundColor: "#064E3B", marginVertical: spacing.sm, padding: spacing.md, borderRadius: radius.md, fontSize: 13, fontWeight: "700" },
  
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.surfaceSecondary, padding: spacing.xl, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: "90%" },
  modalTitle: { color: colors.onSurface, fontSize: 22, fontWeight: "900", marginBottom: spacing.md },
  section: { color: colors.brand, fontSize: 13, letterSpacing: 1, textTransform: "uppercase", fontWeight: "800", marginTop: spacing.lg, marginBottom: spacing.sm },
  hint: { color: colors.onSurfaceTertiary, fontSize: 12, marginBottom: spacing.sm },
  detailRow: { color: colors.onSurfaceSecondary, marginVertical: 3, fontSize: 13 },
  detailVal: { color: colors.onSurface, fontWeight: "600" },
  callOwnerBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "#16A34A", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  callOwnerText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700", marginLeft: 4 },

  subCardActive: { padding: spacing.lg, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, borderWidth: 1, borderColor: "#064E3B", marginBottom: spacing.sm },
  subActiveTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "800" },
  subActiveMeta: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 2 },
  subActiveEnds: { color: "#34D399", fontSize: 12, marginTop: 4, fontWeight: "600" },
  expireBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#DC2626", paddingVertical: 8, borderRadius: 8, gap: 5 },
  expireBtnText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  cancelBtnText: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "600" },

  subCardInactive: { padding: spacing.lg, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, borderWidth: 1, borderColor: "#7F1D1D", marginBottom: spacing.sm },

  durationRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  durationPill: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  durationPillActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  durationPillText: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "700" },
  durationPillTextActive: { color: "#FFFFFF" },

  planRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.md, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  planName: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  planInterval: { color: colors.onSurfaceSecondary, fontSize: 12, textTransform: "capitalize" },
  planPrice: { color: colors.brand, fontSize: 15, fontWeight: "800" },
  planAction: { color: colors.brand, fontSize: 11, fontWeight: "700", marginTop: 2 },

  featureMatrix: { backgroundColor: colors.surfaceTertiary, padding: spacing.md, borderRadius: radius.lg, gap: 14, borderWidth: 1, borderColor: colors.border },
  featureRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  featureName: { color: colors.onSurface, fontSize: 13, fontWeight: "700" },
  featureSub: { color: colors.onSurfaceSecondary, fontSize: 11, marginTop: 2 },

  staffLimitsRow: { flexDirection: "row", gap: 6, marginTop: 8 },
  staffLimitPill: { flex: 1, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.surfaceSecondary, alignItems: "center", borderWidth: 1, borderColor: colors.border },
  staffLimitPillActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  staffLimitText: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "700" },
  staffLimitTextActive: { color: "#FFFFFF" },

  saveFeaturesBtn: { backgroundColor: colors.brand, paddingVertical: 12, borderRadius: radius.md, alignItems: "center", marginTop: 8 },
  saveFeaturesText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },

  dangerBtn: { flexDirection: "row", alignItems: "center", gap: spacing.sm, justifyContent: "center", padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.error, marginTop: spacing.xl },
  dangerText: { color: colors.onError, fontWeight: "700" },
  ghostBtn: { padding: spacing.md, alignItems: "center", marginTop: spacing.xs },
  ghostText: { color: colors.onSurfaceSecondary, fontWeight: "600" },
});
