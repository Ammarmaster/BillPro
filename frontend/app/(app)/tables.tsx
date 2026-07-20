import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput, ActivityIndicator, Modal, Keyboard,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/theme";

type Table = { id: string; label: string; seats: number };

export default function TablesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [label, setLabel] = useState("");
  const [seats, setSeats] = useState("4");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setTables(await api.listTables()); }
    catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    const s = parseInt(seats, 10);
    if (!label.trim() || isNaN(s) || s <= 0) { setErr("Enter label and seat count."); return; }
    setBusy(true);
    try {
      await api.createTable({ label: label.trim(), seats: s });
      setLabel(""); setSeats("4"); setModal(false);
      await load();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const del = async (id: string) => { try { await api.deleteTable(id); await load(); } catch (e: any) { setErr(e.message); } };

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]} testID="tables-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="tables-back-btn" hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Tables</Text>
        <Pressable style={styles.addBtn} onPress={() => setModal(true)} testID="tables-add-btn">
          <Ionicons name="add" size={18} color={colors.onBrand} />
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : tables.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="grid-outline" size={48} color={colors.onSurfaceTertiary} />
          <Text style={{ color: colors.onSurfaceSecondary, marginTop: 8 }}>No tables yet.</Text>
        </View>
      ) : (
        <FlatList
          data={tables}
          keyExtractor={t => t.id}
          numColumns={2}
          columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
          contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: spacing.xxxl, gap: spacing.md }}
          renderItem={({ item }) => (
            <View style={styles.card} testID={`table-${item.id}`}>
              <Text style={styles.cardLabel}>Table {item.label}</Text>
              <Text style={styles.cardSeats}>{item.seats} seats</Text>
              <Pressable onPress={() => del(item.id)} style={styles.trash} testID={`table-delete-${item.id}`} hitSlop={8}>
                <Ionicons name="trash" size={16} color={colors.onError} />
              </Pressable>
            </View>
          )}
        />
      )}

      {err && <Text style={styles.err} testID="tables-error">{err}</Text>}

      <Modal transparent visible={modal} animationType="slide" onRequestClose={() => { Keyboard.dismiss(); setModal(false); }}>
        <Pressable style={styles.modalBg} onPress={() => { Keyboard.dismiss(); setModal(false); }}>
          <Pressable style={[styles.modalCard, { paddingBottom: insets.bottom + spacing.xl }]} onPress={() => Keyboard.dismiss()}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>New Table</Text>
              <Pressable onPress={() => { Keyboard.dismiss(); setModal(false); }} hitSlop={12} testID="table-close-btn">
                <Ionicons name="close" size={24} color={colors.onSurfaceSecondary} />
              </Pressable>
            </View>
            <TextInput value={label} onChangeText={setLabel} placeholder="Label (e.g. 5 or A1)" placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} testID="table-label-input" returnKeyType="next" />
            <TextInput value={seats} onChangeText={setSeats} placeholder="Seats" placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} keyboardType="number-pad" returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} testID="table-seats-input" />
            <View style={styles.modalActions}>
              <Pressable style={styles.ghostBtn} onPress={() => { Keyboard.dismiss(); setModal(false); }} testID="table-cancel-btn">
                <Text style={styles.ghostBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.primaryBtn} onPress={() => { Keyboard.dismiss(); save(); }} disabled={busy} testID="table-save-btn">
                {busy ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.primaryText}>Save</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  title: { color: colors.onSurface, fontSize: 24, fontFamily: "serif" },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.brand },
  addBtnText: { color: colors.onBrand, fontSize: 13, fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  card: { flex: 1, aspectRatio: 1.4, padding: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, justifyContent: "center" },
  cardLabel: { color: colors.onSurface, fontSize: 20, fontFamily: "serif" },
  cardSeats: { color: colors.brand, fontSize: 13, marginTop: 4 },
  trash: { position: "absolute", top: 8, right: 8, padding: 6 },
  err: { color: colors.onError, backgroundColor: colors.error, margin: spacing.lg, padding: spacing.md, borderRadius: radius.md },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.surfaceSecondary, padding: spacing.xl, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, gap: spacing.md },
  modalTitle: { color: colors.onSurface, fontSize: 20, fontFamily: "serif", marginBottom: spacing.sm },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  input: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: spacing.md, color: colors.onSurface, borderWidth: 1, borderColor: colors.border },
  modalActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  ghostBtn: { flex: 1, paddingVertical: 14, borderRadius: radius.md, alignItems: "center", borderWidth: 1, borderColor: colors.borderStrong },
  ghostBtnText: { color: colors.onSurface },
  primaryBtn: { flex: 1, paddingVertical: 14, borderRadius: radius.md, alignItems: "center", backgroundColor: colors.brand },
  primaryText: { color: colors.onBrand, fontWeight: "600" },
});
