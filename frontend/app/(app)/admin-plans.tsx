import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Modal, TextInput,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/theme";

type Plan = { id: string; name: string; price: number; interval: string; features: string[]; is_active: boolean };

export default function AdminPlans() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [features, setFeatures] = useState("");
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
    if (!name.trim() || isNaN(p) || p <= 0) { setErr("Enter name and valid price."); return; }
    setBusy(true); setErr(null);
    try {
      await api.adminCreatePlan({
        name: name.trim(), price: p, interval,
        features: features.split(",").map(s => s.trim()).filter(Boolean),
        is_active: true,
      });
      setName(""); setPrice(""); setFeatures(""); setModal(false);
      await load();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const del = async (id: string) => { try { await api.adminDeletePlan(id); await load(); } catch (e: any) { setErr(e.message); } };

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]} testID="admin-plans-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="admin-plans-back-btn" hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Subscription Plans</Text>
        <Pressable style={styles.addBtn} onPress={() => setModal(true)} testID="admin-plans-add-btn">
          <Ionicons name="add" size={18} color={colors.onBrand} />
          <Text style={styles.addBtnText}>New</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : plans.length === 0 ? (
        <View style={styles.center}><Text style={{ color: colors.onSurfaceTertiary }}>No plans yet.</Text></View>
      ) : (
        <FlatList
          data={plans}
          keyExtractor={p => p.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md }}
          renderItem={({ item }) => (
            <View style={styles.card} testID={`admin-plan-${item.id}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardName}>{item.name}</Text>
                <Text style={styles.cardPrice}>₹{item.price} / {item.interval}</Text>
                {!!item.features?.length && (
                  <Text style={styles.cardFeat} numberOfLines={3}>{item.features.map(f => `• ${f}`).join("\n")}</Text>
                )}
              </View>
              <Pressable onPress={() => del(item.id)} hitSlop={8} testID={`admin-plan-delete-${item.id}`}>
                <Ionicons name="trash" size={20} color={colors.onError} />
              </Pressable>
            </View>
          )}
        />
      )}

      {err && <Text style={styles.err} testID="admin-plans-error">{err}</Text>}

      <Modal transparent visible={modal} animationType="slide" onRequestClose={() => setModal(false)}>
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + spacing.xl }]}>
            <Text style={styles.modalTitle}>New Plan</Text>
            <TextInput value={name} onChangeText={setName} placeholder="e.g. Pro Yearly" placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} testID="plan-name-input" />
            <TextInput value={price} onChangeText={setPrice} placeholder="Price in ₹" keyboardType="decimal-pad" placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} testID="plan-price-input" />
            <View style={styles.intervalRow}>
              {(["month", "year"] as const).map(v => (
                <Pressable key={v} style={[styles.intervalChip, interval === v && styles.intervalChipActive]} onPress={() => setInterval(v)} testID={`plan-interval-${v}`}>
                  <Text style={[styles.intervalText, interval === v && { color: colors.brand }]}>per {v}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              value={features} onChangeText={setFeatures}
              placeholder="Features (comma-separated)"
              placeholderTextColor={colors.onSurfaceTertiary} style={[styles.input, { minHeight: 60 }]}
              multiline testID="plan-features-input"
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.ghostBtn} onPress={() => setModal(false)} testID="plan-cancel-btn">
                <Text style={styles.ghostBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.primaryBtn} onPress={save} disabled={busy} testID="plan-save-btn">
                {busy ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.primaryText}>Save</Text>}
              </Pressable>
            </View>
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
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.brand },
  addBtnText: { color: colors.onBrand, fontSize: 13, fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { flexDirection: "row", padding: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.md, alignItems: "center" },
  cardName: { color: colors.onSurface, fontSize: 18, fontFamily: "serif" },
  cardPrice: { color: colors.brand, fontSize: 15, marginTop: 4 },
  cardFeat: { color: colors.onSurfaceSecondary, fontSize: 11, marginTop: 6, lineHeight: 15 },
  err: { color: colors.onError, backgroundColor: colors.error, margin: spacing.lg, padding: spacing.md, borderRadius: radius.md },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.surfaceSecondary, padding: spacing.xl, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, gap: spacing.md },
  modalTitle: { color: colors.onSurface, fontSize: 20, fontFamily: "serif" },
  input: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: spacing.md, color: colors.onSurface, borderWidth: 1, borderColor: colors.border },
  intervalRow: { flexDirection: "row", gap: spacing.sm },
  intervalChip: { flex: 1, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: "center", backgroundColor: colors.surfaceTertiary },
  intervalChipActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  intervalText: { color: colors.onSurfaceSecondary, fontSize: 13 },
  modalActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  ghostBtn: { flex: 1, paddingVertical: 14, borderRadius: radius.md, alignItems: "center", borderWidth: 1, borderColor: colors.borderStrong },
  ghostBtnText: { color: colors.onSurface },
  primaryBtn: { flex: 1, paddingVertical: 14, borderRadius: radius.md, alignItems: "center", backgroundColor: colors.brand },
  primaryText: { color: colors.onBrand, fontWeight: "600" },
});
