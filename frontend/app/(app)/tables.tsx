import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput, ActivityIndicator, Modal, Keyboard,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/theme";

type Table = { id: string; label: string; seats: number };

export default function TablesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [qrTable, setQrTable] = useState<Table | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [seats, setSeats] = useState("4");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [tbls, rest] = await Promise.all([
        api.listTables(),
        api.getRestaurant()
      ]);
      setTables(tbls);
      if (rest) {
        setTenantId(rest.id);
      } else if (user?.tenant_id) {
        setTenantId(user.tenant_id);
      }
    }
    catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, [user]);

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
        <Pressable onPress={() => router.push("/(app)/more")} testID="tables-back-btn" hitSlop={12}>
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
              <Pressable onPress={() => setQrTable(item)} style={styles.qrIcon} hitSlop={8}>
                <Ionicons name="qr-code-outline" size={18} color={colors.brand} />
              </Pressable>
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

      <Modal transparent visible={!!qrTable} animationType="fade" onRequestClose={() => setQrTable(null)}>
        <Pressable style={styles.modalBg} onPress={() => setQrTable(null)}>
          <Pressable style={[styles.modalCard, { paddingBottom: insets.bottom + spacing.xl, alignItems: "center" }]} onPress={() => {}}>
            {qrTable && (() => {
              const qrUrl = `https://billpro-g1th.onrender.com/menu/${tenantId || user?.tenant_id || "undefined"}/${qrTable.label}`;
              const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrUrl)}`;
              const hasTenant = !!(tenantId || user?.tenant_id);
              return (
                <>
                  <View style={[styles.modalHead, { width: "100%" }]}>
                    <Text style={styles.modalTitle}>Table {qrTable.label} QR Code</Text>
                    <Pressable onPress={() => setQrTable(null)} hitSlop={12}>
                      <Ionicons name="close" size={24} color={colors.onSurfaceSecondary} />
                    </Pressable>
                  </View>
                  
                  {hasTenant ? (
                    <>
                      <View style={styles.qrContainer}>
                        <Image source={{ uri: qrImgUrl }} style={styles.qrImage} />
                      </View>
                      
                      <Text style={styles.qrText}>
                        Scan this QR code with any smartphone to open the contactless restaurant menu for Table {qrTable.label}.
                      </Text>
                    </>
                  ) : (
                    <Text style={[styles.qrText, { color: colors.onError, marginVertical: 30 }]}>
                      Warning: Tenant ID not found. Please complete restaurant setup in Settings first.
                    </Text>
                  )}
                  
                  <Pressable style={[styles.primaryBtn, { width: "100%" }]} onPress={() => setQrTable(null)}>
                    <Text style={styles.primaryText}>Done</Text>
                  </Pressable>
                </>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  title: { color: colors.onSurface, fontSize: 24, fontWeight: "700" },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.brand },
  addBtnText: { color: colors.onBrand, fontSize: 13, fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  card: { flex: 1, aspectRatio: 1.4, padding: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, justifyContent: "center" },
  cardLabel: { color: colors.onSurface, fontSize: 20, fontWeight: "700", textAlign: "center" },
  cardSeats: { color: colors.brand, fontSize: 13, marginTop: 4, fontWeight: "600", textAlign: "center" },
  trash: { position: "absolute", top: 8, right: 8, padding: 6 },
  qrIcon: { position: "absolute", top: 8, left: 8, padding: 6 },
  err: { color: colors.onError, backgroundColor: colors.error, margin: spacing.lg, padding: spacing.md, borderRadius: radius.md },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.surfaceSecondary, padding: spacing.xl, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, gap: spacing.md },
  modalTitle: { color: colors.onSurface, fontSize: 20, fontWeight: "700", marginBottom: spacing.sm },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  input: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: spacing.md, color: colors.onSurface, borderWidth: 1, borderColor: colors.border },
  modalActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  ghostBtn: { flex: 1, paddingVertical: 14, borderRadius: radius.md, alignItems: "center", borderWidth: 1, borderColor: colors.borderStrong },
  ghostBtnText: { color: colors.onSurface, fontWeight: "600" },
  primaryBtn: { paddingVertical: 14, borderRadius: radius.md, alignItems: "center", backgroundColor: colors.brand },
  primaryText: { color: colors.onBrand, fontWeight: "700" },
  qrContainer: { padding: spacing.lg, backgroundColor: "#fff", borderRadius: radius.md, marginVertical: spacing.md, alignItems: "center" },
  qrImage: { width: 200, height: 200 },
  qrText: { color: colors.onSurfaceSecondary, textAlign: "center", fontSize: 14, marginHorizontal: spacing.lg, marginBottom: spacing.xl },
});
