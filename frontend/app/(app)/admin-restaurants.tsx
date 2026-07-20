import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Modal, ScrollView,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/theme";

type Sub = { id: string; plan_name: string; price: number; interval: string; status: string };
type Rest = {
  id: string; name: string; owner_name: string; owner_email?: string;
  phone: string; address: string; upi_id: string; gst?: string; subscription?: Sub | null;
};
type Plan = { id: string; name: string; price: number; interval: string };

export default function AdminRestaurants() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<Rest[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [r, p] = await Promise.all([api.adminListRestaurants(), api.adminListPlans()]);
      setItems(r); setPlans(p);
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const open = async (r: Rest) => {
    try { setDetail(await api.adminRestaurantDetail(r.id)); }
    catch (e: any) { setErr(e.message); }
  };

  const assign = async (planId: string) => {
    if (!detail) return;
    setBusy(true);
    try { await api.adminAssignSubscription(detail.id, planId); setDetail(await api.adminRestaurantDetail(detail.id)); await load(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };
  const cancel = async () => {
    if (!detail) return;
    setBusy(true);
    try { await api.adminCancelSubscription(detail.id); setDetail(await api.adminRestaurantDetail(detail.id)); await load(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };
  const removeRest = async () => {
    if (!detail) return;
    setBusy(true);
    try { await api.adminDeleteRestaurant(detail.id); setDetail(null); await load(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]} testID="admin-restaurants-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="admin-rest-back-btn" hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Restaurants ({items.length})</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : items.length === 0 ? (
        <View style={styles.center}><Text style={{ color: colors.onSurfaceTertiary }}>No restaurants yet.</Text></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={r => r.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md }}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => open(item)} testID={`admin-rest-${item.id}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardName}>{item.name}</Text>
                <Text style={styles.cardMeta}>{item.owner_name}{item.phone ? ` · ${item.phone}` : ""}</Text>
                {!!item.address && <Text style={styles.cardAddr} numberOfLines={1}>{item.address}</Text>}
              </View>
              <View style={styles.subBadge}>
                <Text style={styles.subBadgeText}>
                  {item.subscription?.status === "active" ? item.subscription.plan_name : "Free"}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}

      {err && <Text style={styles.err} testID="admin-rest-error">{err}</Text>}

      <Modal transparent visible={!!detail} animationType="slide" onRequestClose={() => setDetail(null)}>
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + spacing.xl }]}>
            {detail && (
              <ScrollView>
                <Text style={styles.modalTitle}>{detail.name}</Text>
                <Text style={styles.detailRow}>Owner: <Text style={styles.detailVal}>{detail.owner_name}</Text></Text>
                {!!detail.phone && <Text style={styles.detailRow}>Phone: <Text style={styles.detailVal}>{detail.phone}</Text></Text>}
                {!!detail.address && <Text style={styles.detailRow}>Address: <Text style={styles.detailVal}>{detail.address}</Text></Text>}
                {!!detail.gst && <Text style={styles.detailRow}>GSTIN: <Text style={styles.detailVal}>{detail.gst}</Text></Text>}
                {!!detail.upi_id && <Text style={styles.detailRow}>UPI: <Text style={styles.detailVal}>{detail.upi_id}</Text></Text>}
                <Text style={styles.detailRow}>Orders: <Text style={styles.detailVal}>{detail.orders_total}</Text></Text>
                <Text style={styles.detailRow}>Revenue: <Text style={styles.detailVal}>₹{detail.revenue_total}</Text></Text>

                <Text style={styles.section}>Subscription</Text>
                {detail.subscription?.status === "active" ? (
                  <View style={styles.subCard}>
                    <Text style={styles.subActive}>{detail.subscription.plan_name} · ₹{detail.subscription.price}/{detail.subscription.interval}</Text>
                    <Pressable style={styles.dangerBtn} onPress={cancel} disabled={busy} testID="admin-rest-cancel-sub">
                      <Text style={styles.dangerText}>Cancel Subscription</Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    <Text style={styles.hint}>Assign a plan</Text>
                    {plans.map(p => (
                      <Pressable key={p.id} style={styles.planRow} onPress={() => assign(p.id)} disabled={busy} testID={`admin-assign-plan-${p.id}`}>
                        <Text style={styles.planName}>{p.name}</Text>
                        <Text style={styles.planPrice}>₹{p.price}/{p.interval}</Text>
                      </Pressable>
                    ))}
                  </>
                )}

                <Pressable style={styles.dangerBtn} onPress={removeRest} disabled={busy} testID="admin-rest-delete">
                  <Ionicons name="trash" size={16} color={colors.onError} />
                  <Text style={styles.dangerText}>Delete Restaurant</Text>
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
  title: { color: colors.onSurface, fontSize: 22, fontFamily: "serif" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { flexDirection: "row", padding: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, alignItems: "center", gap: spacing.md },
  cardName: { color: colors.onSurface, fontSize: 16, fontFamily: "serif" },
  cardMeta: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 4 },
  cardAddr: { color: colors.onSurfaceTertiary, fontSize: 11, marginTop: 2 },
  subBadge: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.brandTertiary },
  subBadgeText: { color: colors.brand, fontSize: 11, letterSpacing: 0.5 },
  err: { color: colors.onError, backgroundColor: colors.error, margin: spacing.lg, padding: spacing.md, borderRadius: radius.md },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.surfaceSecondary, padding: spacing.xl, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: "88%" },
  modalTitle: { color: colors.onSurface, fontSize: 22, fontFamily: "serif", marginBottom: spacing.md },
  section: { color: colors.onSurfaceSecondary, fontSize: 13, letterSpacing: 1, textTransform: "uppercase", marginTop: spacing.xl, marginBottom: spacing.sm },
  hint: { color: colors.onSurfaceTertiary, fontSize: 12, marginBottom: spacing.sm },
  detailRow: { color: colors.onSurfaceSecondary, marginVertical: 3, fontSize: 13 },
  detailVal: { color: colors.onSurface },
  subCard: { padding: spacing.md, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, gap: spacing.md },
  subActive: { color: colors.brand, fontSize: 15 },
  planRow: { flexDirection: "row", justifyContent: "space-between", padding: spacing.md, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  planName: { color: colors.onSurface },
  planPrice: { color: colors.brand },
  dangerBtn: { flexDirection: "row", alignItems: "center", gap: spacing.sm, justifyContent: "center", padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.error, marginTop: spacing.md },
  dangerText: { color: colors.onError, fontWeight: "600" },
  ghostBtn: { padding: spacing.md, alignItems: "center", marginTop: spacing.sm },
  ghostText: { color: colors.onSurfaceSecondary },
});
