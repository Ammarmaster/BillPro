import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Modal, TextInput, ScrollView,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/theme";

type U = { id: string; email: string; full_name: string; role: string; tenant_id?: string | null; pin?: string };

const ROLE_COLORS: Record<string, string> = {
  super_admin: colors.brand,
  owner: colors.onSurface,
  manager: colors.onSurfaceSecondary,
  waiter: colors.onSurfaceSecondary,
  kitchen: colors.onSurfaceSecondary,
};

export default function AdminUsers() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [users, setUsers] = useState<U[]>([]);
  const [filter, setFilter] = useState<string | "all">("all");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [target, setTarget] = useState<U | null>(null);
  const [newPw, setNewPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setUsers(await api.adminListUsers()); }
    catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const shown = filter === "all" ? users : users.filter(u => u.role === filter);

  const resetPw = async () => {
    if (!target || newPw.length < 4) { setErr("Password must be ≥ 4 chars (waiter PIN 4-6 digits)."); return; }
    setBusy(true); setErr(null); setMsg(null);
    try {
      await api.adminResetPassword(target.id, newPw);
      setMsg(target.role === "waiter" ? `PIN updated to ${newPw}` : "Password updated");
      setNewPw("");
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const removeUser = async (uid: string) => {
    try { await api.adminDeleteUser(uid); setTarget(null); await load(); }
    catch (e: any) { setErr(e.message); }
  };

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]} testID="admin-users-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="admin-users-back-btn" hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Users ({shown.length})</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow} style={{ maxHeight: 56, minHeight: 56 }}>
        {["all", "super_admin", "owner", "manager", "waiter", "kitchen"].map(r => (
          <Pressable key={r} onPress={() => setFilter(r)} style={[styles.chip, filter === r && styles.chipActive, { flexShrink: 0 }]} testID={`admin-users-chip-${r}`}>
            <Text style={[styles.chipText, filter === r && styles.chipTextActive]}>{r.replace("_", " ")}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : shown.length === 0 ? (
        <View style={styles.center}><Text style={{ color: colors.onSurfaceTertiary }}>No users found.</Text></View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={u => u.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.sm }}
          renderItem={({ item }) => (
            <Pressable style={styles.userRow} onPress={() => { setTarget(item); setNewPw(""); setMsg(null); setErr(null); }} testID={`admin-user-${item.id}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{item.full_name}</Text>
                <Text style={styles.userMeta} numberOfLines={1}>{item.email}</Text>
              </View>
              <Text style={[styles.roleTag, { color: ROLE_COLORS[item.role] || colors.onSurfaceSecondary }]}>{item.role}</Text>
            </Pressable>
          )}
        />
      )}

      {err && <Text style={styles.err} testID="admin-users-error">{err}</Text>}

      <Modal transparent visible={!!target} animationType="slide" onRequestClose={() => setTarget(null)}>
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + spacing.xl }]}>
            {target && (
              <>
                <Text style={styles.modalTitle}>{target.full_name}</Text>
                <Text style={styles.userMeta}>{target.email}</Text>
                <Text style={styles.userMeta}>Role: {target.role}</Text>

                <Text style={styles.section}>{target.role === "waiter" ? "Reset PIN" : "Reset Password"}</Text>
                <TextInput
                  value={newPw} onChangeText={setNewPw}
                  placeholder={target.role === "waiter" ? "New 4-6 digit PIN" : "New password (≥ 6 chars)"}
                  placeholderTextColor={colors.onSurfaceTertiary}
                  secureTextEntry style={styles.input}
                  keyboardType={target.role === "waiter" ? "number-pad" : "default"}
                  maxLength={target.role === "waiter" ? 6 : 40}
                  testID="admin-user-newpw-input"
                />
                {msg && <Text style={styles.msg} testID="admin-user-msg">{msg}</Text>}
                <Pressable style={styles.primaryBtn} onPress={resetPw} disabled={busy} testID="admin-user-reset-btn">
                  {busy ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.primaryText}>Reset</Text>}
                </Pressable>
                <Pressable style={styles.dangerBtn} onPress={() => removeUser(target.id)} testID="admin-user-delete-btn">
                  <Ionicons name="trash" size={16} color={colors.onError} />
                  <Text style={styles.dangerText}>Delete User</Text>
                </Pressable>
                <Pressable style={styles.ghostBtn} onPress={() => setTarget(null)} testID="admin-user-close-btn">
                  <Text style={styles.ghostText}>Close</Text>
                </Pressable>
              </>
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
  chipsRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: "center" },
  chip: { paddingHorizontal: 14, height: 36, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, justifyContent: "center" },
  chipActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brand },
  chipText: { color: colors.onSurfaceSecondary, fontSize: 12, textTransform: "capitalize" },
  chipTextActive: { color: colors.brand, fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  userRow: { flexDirection: "row", alignItems: "center", padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: spacing.md },
  userName: { color: colors.onSurface, fontSize: 15 },
  userMeta: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  roleTag: { fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase" },
  err: { color: colors.onError, backgroundColor: colors.error, margin: spacing.lg, padding: spacing.md, borderRadius: radius.md },
  msg: { color: colors.onSuccess, backgroundColor: colors.success, padding: spacing.md, borderRadius: radius.md, marginTop: spacing.md },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.surfaceSecondary, padding: spacing.xl, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  modalTitle: { color: colors.onSurface, fontSize: 22, fontFamily: "serif" },
  section: { color: colors.onSurfaceSecondary, fontSize: 13, letterSpacing: 1, textTransform: "uppercase", marginTop: spacing.xl, marginBottom: spacing.sm },
  input: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: spacing.md, color: colors.onSurface, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  primaryBtn: { backgroundColor: colors.brand, paddingVertical: 14, borderRadius: radius.md, alignItems: "center", marginBottom: spacing.md },
  primaryText: { color: colors.onBrand, fontWeight: "600" },
  dangerBtn: { flexDirection: "row", alignItems: "center", gap: spacing.sm, justifyContent: "center", padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.error },
  dangerText: { color: colors.onError, fontWeight: "600" },
  ghostBtn: { padding: spacing.md, alignItems: "center", marginTop: spacing.sm },
  ghostText: { color: colors.onSurfaceSecondary },
});
