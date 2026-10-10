import { useCallback, useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput, ActivityIndicator, Modal, Keyboard, BackHandler,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import AttractiveQRStandeeModal from "@/src/components/AttractiveQRStandeeModal";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/theme";
import { useResponsive } from "@/src/hooks/useResponsive";

type Table = { id: string; label: string; seats: number; custom_qr?: string };

export default function TablesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { isDesktop, isLargeDesktop } = useResponsive();
  const [tables, setTables] = useState<Table[]>(() => api.getCachedTables() || []);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [qrTable, setQrTable] = useState<Table | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState<string>(() => api.getCachedRestaurant()?.name || "");
  const [label, setLabel] = useState("");
  const [seats, setSeats] = useState("4");
  const [busy, setBusy] = useState(false);

  const qrTableRef = useRef(qrTable);
  qrTableRef.current = qrTable;
  const modalRef = useRef(modal);
  modalRef.current = modal;

  useEffect(() => {
    const { subscribeToCache } = require("@/src/lib/api");
    const unsubscribe = subscribeToCache((path: string, data: any) => {
      if (path === "/tables" && data) setTables(data);
      if (path === "/restaurant" && data) {
        setTenantId(data.id);
        if (data.name) setRestaurantName(data.name);
      }
    });
    return () => unsubscribe();
  }, []);

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
        if (rest.name) setRestaurantName(rest.name);
      } else if (user?.tenant_id) {
        setTenantId(user.tenant_id);
      }
    }
    catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, [user]);

  const handleBack = useCallback(() => {
    if (qrTableRef.current) {
      setQrTable(null);
      return true;
    }
    if (modalRef.current) {
      setModal(false);
      return true;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(app)/waiter");
    }
    return true;
  }, [router]);

  useEffect(() => {
    const onBackPress = () => {
      return handleBack();
    };
    const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => subscription.remove();
  }, [handleBack]);

  useFocusEffect(
    useCallback(() => {
      load();
      const onBackPress = () => {
        return handleBack();
      };
      const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () => subscription.remove();
    }, [load, handleBack])
  );

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

  const numCols = isLargeDesktop ? 6 : isDesktop ? 4 : 2;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]} testID="tables-screen">
      <View style={[{ flex: 1, width: "100%" }, isDesktop && { maxWidth: 1200, alignSelf: "center" }]}>
        <View style={styles.header}>
          <Pressable onPress={handleBack} testID="tables-back-btn" hitSlop={12}>
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
            key={`tables-grid-${numCols}`}
            data={tables}
            keyExtractor={t => t.id}
            numColumns={numCols}
            columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
            contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: spacing.xxxl, gap: spacing.md }}
            renderItem={({ item }) => (
              <View style={styles.card} testID={`table-${item.id}`}>
                {/* Top Action Row: QR Code & Delete Buttons */}
                <View style={styles.cardTopBar}>
                  <Pressable 
                    onPress={() => setQrTable(item)} 
                    style={({ pressed }) => [styles.qrActionBtn, pressed && { opacity: 0.7 }]} 
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    testID={`table-qr-btn-${item.id}`}
                  >
                    <Ionicons name="qr-code" size={15} color={colors.brand} />
                    <Text style={styles.qrActionText}>QR</Text>
                  </Pressable>

                  <Pressable 
                    onPress={() => del(item.id)} 
                    style={({ pressed }) => [styles.trashActionBtn, pressed && { opacity: 0.7 }]} 
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    testID={`table-delete-${item.id}`}
                  >
                    <Ionicons name="trash-outline" size={15} color={colors.onError} />
                  </Pressable>
                </View>

                {/* Center Table Details */}
                <View style={styles.cardBody}>
                  <Text style={styles.cardLabel} numberOfLines={2} ellipsizeMode="tail">
                    Table {item.label}
                  </Text>
                  <View style={styles.seatsChip}>
                    <Ionicons name="person-outline" size={12} color={colors.brand} />
                    <Text style={styles.cardSeats}>{item.seats} seats</Text>
                  </View>
                </View>
              </View>
            )}
          />
        )}

        {err && <Text style={styles.err} testID="tables-error">{err}</Text>}

        <Modal transparent visible={modal} animationType="slide" onRequestClose={() => { Keyboard.dismiss(); setModal(false); }}>
          <Pressable 
            style={[styles.modalBg, isDesktop && { justifyContent: "center", alignItems: "center", padding: spacing.xl }]} 
            onPress={() => { Keyboard.dismiss(); setModal(false); }}
          >
            <Pressable 
              style={[
                styles.modalCard, 
                { 
                  paddingBottom: isDesktop ? spacing.xl : insets.bottom + spacing.xl,
                  width: isDesktop ? 460 : "100%",
                  borderRadius: isDesktop ? 20 : radius.lg,
                }
              ]} 
              onPress={() => Keyboard.dismiss()}
            >
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

        {qrTable && (() => {
          const backendBase = (process.env.EXPO_PUBLIC_BACKEND_URL || "https://billpro-wulv.onrender.com").replace(/\/$/, "");
          const tid = tenantId || user?.tenant_id || api.getCachedRestaurant()?.id || "undefined";
          const tableTarget = qrTable.custom_qr ? qrTable.custom_qr : (qrTable.label || qrTable.id);
          const targetUrl = `${backendBase}/menu/${encodeURIComponent(tid)}/${encodeURIComponent(tableTarget)}`;

          return (
            <AttractiveQRStandeeModal
              visible={!!qrTable}
              onClose={() => setQrTable(null)}
              title={`Table ${qrTable.label} QR Standee`}
              restaurantName={restaurantName || "Restaurant"}
              badgeText={`TABLE ${qrTable.label}`}
              targetUrl={targetUrl}
              isTable={true}
              tableLabel={qrTable.label}
              customQrValue={qrTable.custom_qr}
              onSaveCustomQr={async (customVal: string) => {
                await api.updateTable(qrTable.id, { custom_qr: customVal });
                setQrTable(prev => prev ? { ...prev, custom_qr: customVal } : null);
                await load();
              }}
              onClearCustomQr={async () => {
                await api.updateTable(qrTable.id, { custom_qr: "" });
                setQrTable(prev => prev ? { ...prev, custom_qr: "" } : null);
                await load();
              }}
            />
          );
        })()}
      </View>
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
  card: { 
    flex: 1, 
    aspectRatio: 1.35, 
    padding: spacing.md, 
    backgroundColor: colors.surfaceSecondary, 
    borderRadius: radius.lg, 
    borderWidth: 1, 
    borderColor: colors.border, 
    justifyContent: "space-between",
    minHeight: 110,
  },
  cardTopBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    zIndex: 10,
  },
  qrActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(99, 91, 255, 0.12)",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "rgba(99, 91, 255, 0.25)",
    zIndex: 10,
  },
  qrActionText: {
    color: colors.brand,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  trashActionBtn: {
    padding: 6,
    borderRadius: radius.sm,
    backgroundColor: "rgba(220, 38, 38, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  cardBody: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  cardLabel: { 
    color: colors.onSurface, 
    fontSize: 17, 
    fontWeight: "800", 
    textAlign: "center",
    letterSpacing: -0.2,
  },
  seatsChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 5,
    backgroundColor: "rgba(99, 91, 255, 0.06)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  cardSeats: { 
    color: colors.brand, 
    fontSize: 12, 
    fontWeight: "700", 
    textAlign: "center",
  },
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
