import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Modal, TextInput, ScrollView, Alert,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/theme";

type U = { id: string; email: string; full_name: string; role: string; tenant_id?: string | null; pin?: string };

const ROLE_COLORS: Record<string, string> = {
  super_admin: colors.brand,
  admin_employee: colors.brand,
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
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Detail / Edit state
  const [target, setTarget] = useState<U | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState("");
  const [newPw, setNewPw] = useState("");

  // Creation state
  const [createModal, setCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ fullName: "", email: "", password: "", role: "admin_employee" });

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
      setMsg(target.role === "waiter" ? `PIN updated to ${newPw}` : "Password updated successfully");
      setNewPw("");
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const removeUser = async (uid: string) => {
    Alert.alert("Delete User?", "Are you sure you want to delete this user permanently?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await api.adminDeleteUser(uid);
            setTarget(null);
            await load();
          } catch (e: any) {
            setErr(e.message);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const createUser = async () => {
    if (!createForm.fullName.trim() || !createForm.email.trim() || createForm.password.length < 6) {
      setErr("Enter full name, email, and password (≥ 6 chars).");
      return;
    }
    setBusy(true); setErr(null);
    try {
      await api.adminCreateUser({
        full_name: createForm.fullName.trim(),
        email: createForm.email.trim(),
        password: createForm.password,
        role: createForm.role,
      });
      setCreateModal(false);
      await load();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const updateUser = async () => {
    if (!target) return;
    if (!editName.trim() || !editEmail.trim()) { setErr("Name and email are required."); return; }
    setBusy(true); setErr(null); setMsg(null);
    try {
      const updated = await api.adminUpdateUser(target.id, {
        full_name: editName.trim(),
        email: editEmail.trim(),
        role: editRole,
      });
      setTarget(updated);
      setMsg("User details updated successfully");
      await load();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]} testID="admin-users-screen">
      
      {/* Header bar */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="admin-users-back-btn" hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Users ({shown.length})</Text>
        <Pressable
          style={styles.addBtn}
          onPress={() => {
            setCreateForm({ fullName: "", email: "", password: "", role: "admin_employee" });
            setErr(null);
            setCreateModal(true);
          }}
          testID="admin-users-add-btn"
        >
          <Ionicons name="add" size={16} color={colors.onBrand} />
          <Text style={styles.addBtnText}>New</Text>
        </Pressable>
      </View>

      {/* Role filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow} style={{ maxHeight: 56, minHeight: 56 }}>
        {["all", "super_admin", "admin_employee", "owner", "manager", "waiter", "kitchen"].map(r => (
          <Pressable key={r} onPress={() => setFilter(r)} style={[styles.chip, filter === r && styles.chipActive, { flexShrink: 0 }]} testID={`admin-users-chip-${r}`}>
            <Text style={[styles.chipText, filter === r && styles.chipTextActive]}>{r.replace("_", " ")}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* User list */}
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
            <Pressable
              style={styles.userRow}
              onPress={() => {
                setTarget(item);
                setEditName(item.full_name);
                setEditEmail(item.email);
                setEditRole(item.role);
                setNewPw("");
                setMsg(null);
                setErr(null);
              }}
              testID={`admin-user-${item.id}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{item.full_name}</Text>
                <Text style={styles.userMeta} numberOfLines={1}>{item.email}</Text>
              </View>
              <Text style={[styles.roleTag, { color: ROLE_COLORS[item.role] || colors.onSurfaceSecondary }]}>{item.role?.replace("_", " ")}</Text>
            </Pressable>
          )}
        />
      )}

      {err && <Text style={styles.err} testID="admin-users-error">{err}</Text>}

      {/* Edit User Modal */}
      <Modal transparent visible={!!target} animationType="slide" onRequestClose={() => setTarget(null)}>
        <View style={styles.modalBg}>
          <ScrollView contentContainerStyle={[styles.modalCard, { paddingBottom: insets.bottom + spacing.xl }]}>
            {target && (
              <>
                <Text style={styles.modalTitle}>User Account settings</Text>
                <Text style={[styles.userMeta, { marginBottom: spacing.md }]}>Modify privileges, reset passwords, or delete staff profiles.</Text>
                
                {/* Section 1: Account Info */}
                <View style={styles.settingCard}>
                  <Text style={styles.cardHeaderTitle}>Profile Information</Text>
                  
                  <Text style={styles.label}>Full Name</Text>
                  <View style={styles.inputContainer}>
                    <Ionicons name="person-outline" size={16} color={colors.onSurfaceSecondary} style={{ marginRight: 8 }} />
                    <TextInput
                      value={editName}
                      onChangeText={setEditName}
                      style={styles.premiumInput}
                    />
                  </View>

                  <Text style={styles.label}>Email Address</Text>
                  <View style={styles.inputContainer}>
                    <Ionicons name="mail-outline" size={16} color={colors.onSurfaceSecondary} style={{ marginRight: 8 }} />
                    <TextInput
                      value={editEmail}
                      onChangeText={setEditEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      style={styles.premiumInput}
                    />
                  </View>

                  <Text style={styles.label}>Account Access Role</Text>
                  <View style={styles.rolesGrid}>
                    {["super_admin", "admin_employee", "owner", "manager", "waiter", "kitchen"].map(r => {
                      const isActive = editRole === r;
                      return (
                        <Pressable
                          key={r}
                          style={[styles.roleCard, isActive && styles.roleCardActive]}
                          onPress={() => setEditRole(r)}
                        >
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Ionicons
                              name={r === "super_admin" ? "shield-checkmark" : r === "admin_employee" ? "ribbon-outline" : r === "owner" ? "storefront" : "person"}
                              size={14}
                              color={isActive ? colors.brand : colors.onSurfaceSecondary}
                            />
                            <Text style={[styles.roleCardText, isActive && styles.roleCardTextActive]}>
                              {r.replace("_", " ")}
                            </Text>
                          </View>
                          {isActive && <Ionicons name="checkmark-circle" size={14} color={colors.brand} />}
                        </Pressable>
                      );
                    })}
                  </View>

                  {msg && <Text style={styles.msg} testID="admin-user-msg">{msg}</Text>}
                  {err && <Text style={[styles.err, { margin: 0, marginBottom: spacing.md }]} testID="admin-user-error">{err}</Text>}

                  <Pressable style={styles.primaryBtn} onPress={updateUser} disabled={busy} testID="admin-user-update-btn">
                    {busy ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.primaryText}>Save Changes</Text>}
                  </Pressable>
                </View>

                {/* Section 2: Security */}
                <View style={styles.settingCard}>
                  <Text style={styles.cardHeaderTitle}>Security & Credentials</Text>
                  <Text style={styles.label}>{target.role === "waiter" ? "Reset PIN" : "Reset Password"}</Text>
                  <View style={styles.inputContainer}>
                    <Ionicons name="key-outline" size={16} color={colors.onSurfaceSecondary} style={{ marginRight: 8 }} />
                    <TextInput
                      value={newPw} onChangeText={setNewPw}
                      placeholder={target.role === "waiter" ? "New 4-6 digit PIN" : "New password (≥ 6 chars)"}
                      placeholderTextColor={colors.onSurfaceTertiary}
                      secureTextEntry
                      style={styles.premiumInput}
                      keyboardType={target.role === "waiter" ? "number-pad" : "default"}
                      maxLength={target.role === "waiter" ? 6 : 40}
                      testID="admin-user-newpw-input"
                    />
                  </View>
                  
                  <Pressable style={[styles.primaryBtn, { backgroundColor: colors.brandSecondary }]} onPress={resetPw} disabled={busy} testID="admin-user-reset-btn">
                    {busy ? <ActivityIndicator color={colors.brand} /> : <Text style={[styles.primaryText, { color: colors.brand }]}>Reset Password / PIN</Text>}
                  </Pressable>
                </View>

                {/* Section 3: Danger Zone */}
                <View style={[styles.settingCard, { borderColor: "#EF444450" }]}>
                  <Text style={[styles.cardHeaderTitle, { color: "#EF4444" }]}>Danger Zone</Text>
                  <Text style={[styles.userMeta, { fontSize: 11 }]}>Permanently terminate this user profile. The user will lose app access immediately.</Text>
                  <Pressable style={styles.dangerBtn} onPress={() => removeUser(target.id)} testID="admin-user-delete-btn">
                    <Ionicons name="trash" size={16} color={colors.onError} />
                    <Text style={styles.dangerText}>Delete User Account</Text>
                  </Pressable>
                </View>

                <Pressable style={styles.ghostBtn} onPress={() => setTarget(null)} testID="admin-user-close-btn">
                  <Text style={styles.ghostText}>Close Settings</Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Create User Modal */}
      <Modal transparent visible={createModal} animationType="slide" onRequestClose={() => setCreateModal(false)}>
        <View style={styles.modalBg}>
          <ScrollView contentContainerStyle={[styles.modalCard, { paddingBottom: insets.bottom + spacing.xl }]}>
            <Text style={styles.modalTitle}>New Admin User / Employee</Text>
            <Text style={[styles.userMeta, { marginBottom: spacing.md }]}>Add a new staff login account with select access roles.</Text>
            
            <View style={styles.settingCard}>
              <Text style={styles.label}>Full Name</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="person-outline" size={16} color={colors.onSurfaceSecondary} style={{ marginRight: 8 }} />
                <TextInput
                  value={createForm.fullName}
                  onChangeText={t => setCreateForm({ ...createForm, fullName: t })}
                  placeholder="e.g. Employee Name"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  style={styles.premiumInput}
                />
              </View>

              <Text style={styles.label}>Email Address</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="mail-outline" size={16} color={colors.onSurfaceSecondary} style={{ marginRight: 8 }} />
                <TextInput
                  value={createForm.email}
                  onChangeText={t => setCreateForm({ ...createForm, email: t })}
                  placeholder="employee@prodevopz.com"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={styles.premiumInput}
                />
              </View>

              <Text style={styles.label}>Password</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="key-outline" size={16} color={colors.onSurfaceSecondary} style={{ marginRight: 8 }} />
                <TextInput
                  value={createForm.password}
                  onChangeText={t => setCreateForm({ ...createForm, password: t })}
                  placeholder="Password (≥ 6 chars)"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  secureTextEntry
                  style={styles.premiumInput}
                />
              </View>

              <Text style={styles.label}>Role</Text>
              <View style={styles.rolesGrid}>
                {["admin_employee", "super_admin"].map(r => {
                  const isActive = createForm.role === r;
                  return (
                    <Pressable
                      key={r}
                      style={[styles.roleCard, isActive && styles.roleCardActive]}
                      onPress={() => setCreateForm({ ...createForm, role: r })}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Ionicons
                          name={r === "super_admin" ? "shield-checkmark" : "ribbon-outline"}
                          size={14}
                          color={isActive ? colors.brand : colors.onSurfaceSecondary}
                        />
                        <Text style={[styles.roleCardText, isActive && styles.roleCardTextActive]}>
                          {r.replace("_", " ")}
                        </Text>
                      </View>
                      {isActive && <Ionicons name="checkmark-circle" size={14} color={colors.brand} />}
                    </Pressable>
                  );
                })}
              </View>

              {err && <Text style={[styles.err, { margin: 0, marginBottom: spacing.md }]} testID="admin-user-error">{err}</Text>}

              <Pressable style={styles.primaryBtn} onPress={createUser} disabled={busy}>
                {busy ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.primaryText}>Create User</Text>}
              </Pressable>
            </View>

            <Pressable style={styles.ghostBtn} onPress={() => setCreateModal(false)}>
              <Text style={styles.ghostText}>Cancel</Text>
            </Pressable>
          </ScrollView>
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
  modalCard: { backgroundColor: colors.surfaceSecondary, padding: spacing.xl, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: "90%" },
  modalTitle: { color: colors.onSurface, fontSize: 22, fontFamily: "serif" },
  section: { color: colors.onSurfaceSecondary, fontSize: 13, letterSpacing: 1, textTransform: "uppercase", marginTop: spacing.md, marginBottom: spacing.sm },
  label: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginTop: spacing.sm, marginBottom: 6, textTransform: "uppercase" },
  input: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: spacing.md, color: colors.onSurface, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  primaryBtn: { backgroundColor: colors.brand, paddingVertical: 14, borderRadius: radius.md, alignItems: "center", marginTop: spacing.sm },
  primaryText: { color: colors.onBrand, fontWeight: "600" },
  dangerBtn: { flexDirection: "row", alignItems: "center", gap: spacing.sm, justifyContent: "center", padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.error, marginTop: spacing.md },
  dangerText: { color: colors.onError, fontWeight: "600" },
  ghostBtn: { padding: spacing.md, alignItems: "center", marginTop: spacing.sm },
  ghostText: { color: colors.onSurfaceSecondary },
  
  // Premium inputs & setting card designs
  inputContainer: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 8, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.xs },
  premiumInput: { flex: 1, color: colors.onSurface, fontSize: 14, fontWeight: "500" },
  rolesGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: spacing.sm, marginVertical: spacing.sm },
  roleCard: { width: "48%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary },
  roleCardActive: { borderColor: colors.brand, backgroundColor: "rgba(99, 91, 255, 0.05)" },
  roleCardText: { color: colors.onSurfaceSecondary, fontSize: 12, textTransform: "capitalize", fontWeight: "600" },
  roleCardTextActive: { color: colors.brand, fontWeight: "700" },
  settingCard: { padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, marginBottom: spacing.lg, gap: spacing.sm },
  cardHeaderTitle: { color: colors.onSurface, fontSize: 14, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: spacing.xs },
});
