import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput, ActivityIndicator, Modal, Keyboard,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/theme";

type Waiter = { id: string; full_name: string; pin: string; role: string };

export default function StaffScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [waiters, setWaiters] = useState<Waiter[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [newlyCreated, setNewlyCreated] = useState<Waiter | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setWaiters(await api.listWaiters()); }
    catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    if (!name.trim() || pin.length < 4 || !/^\d+$/.test(pin)) { setErr("Enter name and 4–6 digit PIN."); return; }
    setBusy(true); setErr(null);
    try {
      const w = await api.createWaiter({ name: name.trim(), pin });
      setNewlyCreated(w);
      setName(""); setPin(""); setModal(false);
      await load();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const del = async (id: string) => { try { await api.deleteWaiter(id); await load(); } catch (e: any) { setErr(e.message); } };

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]} testID="staff-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="staff-back-btn" hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Waiters</Text>
        <Pressable style={styles.addBtn} onPress={() => setModal(true)} testID="staff-add-btn">
          <Ionicons name="add" size={18} color={colors.onBrand} />
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      </View>

      <Text style={styles.hint}>Waiters sign in with restaurant phone + their PIN.</Text>

      {newlyCreated && (
        <View style={styles.newCard} testID="staff-new-banner">
          <Ionicons name="checkmark-circle" size={20} color={colors.onSuccess} />
          <View style={{ flex: 1 }}>
            <Text style={styles.newTitle}>Share this PIN with {newlyCreated.full_name}</Text>
            <Text style={styles.newPin}>PIN: {newlyCreated.pin}</Text>
          </View>
          <Pressable onPress={() => setNewlyCreated(null)} hitSlop={8} testID="staff-new-dismiss">
            <Ionicons name="close" size={18} color={colors.onSurfaceSecondary} />
          </Pressable>
        </View>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : waiters.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="people-outline" size={48} color={colors.onSurfaceTertiary} />
          <Text style={{ color: colors.onSurfaceSecondary, marginTop: 8 }}>No waiters yet.</Text>
        </View>
      ) : (
        <FlatList
          data={waiters}
          keyExtractor={w => w.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md }}
          renderItem={({ item }) => (
            <View style={styles.card} testID={`waiter-${item.id}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.wName}>{item.full_name}</Text>
                <Text style={styles.wPin}>PIN · {item.pin}</Text>
              </View>
              <Pressable onPress={() => del(item.id)} hitSlop={8} testID={`waiter-delete-${item.id}`}>
                <Ionicons name="trash" size={20} color={colors.onError} />
              </Pressable>
            </View>
          )}
        />
      )}

      {err && <Text style={styles.err} testID="staff-error">{err}</Text>}

      <Modal transparent visible={modal} animationType="slide" onRequestClose={() => { Keyboard.dismiss(); setModal(false); }}>
        <Pressable style={styles.modalBg} onPress={() => { Keyboard.dismiss(); setModal(false); }}>
          <Pressable style={[styles.modalCard, { paddingBottom: insets.bottom + spacing.xl }]} onPress={() => Keyboard.dismiss()}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>New Waiter</Text>
              <Pressable onPress={() => { Keyboard.dismiss(); setModal(false); }} hitSlop={12} testID="waiter-close-btn">
                <Ionicons name="close" size={24} color={colors.onSurfaceSecondary} />
              </Pressable>
            </View>
            <TextInput value={name} onChangeText={setName} placeholder="Full name" placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} testID="waiter-name-input" returnKeyType="next" />
            <TextInput
              value={pin} onChangeText={setPin}
              placeholder="4–6 digit PIN"
              placeholderTextColor={colors.onSurfaceTertiary}
              style={styles.input}
              keyboardType="number-pad" maxLength={6} secureTextEntry
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
              testID="waiter-pin-input"
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.ghostBtn} onPress={() => { Keyboard.dismiss(); setModal(false); }} testID="waiter-cancel-btn">
                <Text style={styles.ghostBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.primaryBtn} onPress={() => { Keyboard.dismiss(); save(); }} disabled={busy} testID="waiter-save-btn">
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
  hint: { color: colors.onSurfaceTertiary, paddingHorizontal: spacing.xl, marginBottom: spacing.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  card: { flexDirection: "row", alignItems: "center", padding: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.md },
  wName: { color: colors.onSurface, fontSize: 16 },
  wPin: { color: colors.brand, fontSize: 13, marginTop: 4, letterSpacing: 2 },
  newCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginHorizontal: spacing.lg, marginBottom: spacing.md, padding: spacing.md, backgroundColor: colors.success, borderRadius: radius.lg },
  newTitle: { color: colors.onSuccess, fontSize: 13 },
  newPin: { color: colors.onSuccess, fontSize: 18, letterSpacing: 3, marginTop: 2, fontWeight: "700" },
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
