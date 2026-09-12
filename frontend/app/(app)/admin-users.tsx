import { useCallback, useState, useMemo } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Modal, TextInput, ScrollView, Alert,
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

type U = { id: string; email: string; full_name: string; role: string; tenant_id?: string | null; pin?: string };

const ROLE_COLORS: Record<string, string> = {
  super_admin: "#635BFF",
  admin_employee: "#8B5CF6",
  owner: "#10B981",
  manager: "#3B82F6",
  waiter: "#F59E0B",
  kitchen: "#EC4899",
};

export default function AdminUsers() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const { isDesktop } = useResponsive();

  const [users, setUsers] = useState<U[]>([]);
  const [filter, setFilter] = useState<string | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
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

  const shown = useMemo(() => {
    return users.filter(u => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q ||
        u.full_name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.role?.toLowerCase().includes(q);

      if (!matchesSearch) return false;
      if (filter === "all") return true;
      return u.role === filter;
    });
  }, [users, filter, searchQuery]);

  const resetPw = async () => {
    if (!target || newPw.length < 4) { setErr("Password must be ≥ 4 chars (waiter PIN 4-6 digits)."); return; }
    setBusy(true); setErr(null); setMsg(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
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
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
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
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
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
    <View style={[styles.wrap, { paddingTop: insets.top, backgroundColor: theme.surface }]} testID="admin-users-screen">
      <View style={[{ flex: 1, width: "100%" }, isDesktop && { maxWidth: 1200, alignSelf: "center" }]}>
      
      {/* Header bar */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="admin-users-back-btn" hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.onSurface} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.title, { color: theme.onSurface }]}>Users & Staff</Text>
          <Text style={{ fontSize: 12, color: theme.onSurfaceSecondary, fontWeight: "600" }}>
            {users.length} accounts configured
          </Text>
        </View>
        <Pressable
          style={styles.addBtn}
          onPress={() => {
            setCreateForm({ fullName: "", email: "", password: "", role: "admin_employee" });
            setErr(null);
            setCreateModal(true);
          }}
          testID="admin-users-add-btn"
        >
          <LinearGradient
            colors={["#635BFF", "#4F46E5"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.addBtnGrad}
          >
            <Ionicons name="add" size={16} color="#FFFFFF" />
            <Text style={styles.addBtnText}>New User</Text>
          </LinearGradient>
        </Pressable>
      </View>

      {/* Search Box */}
      <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.xs }}>
        <View style={[styles.searchBox, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
          <Ionicons name="search" size={16} color={theme.onSurfaceSecondary} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search name, email, or role..."
            placeholderTextColor={theme.onSurfaceTertiary}
            style={[styles.searchInput, { color: theme.onSurface }]}
          />
          {!!searchQuery && (
            <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={theme.onSurfaceSecondary} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Role filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow} style={{ maxHeight: 48, minHeight: 48 }}>
        {["all", "super_admin", "admin_employee", "owner", "manager", "waiter", "kitchen"].map(r => (
          <Pressable
            key={r}
            onPress={() => setFilter(r)}
            style={[
              styles.chip,
              { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
              filter === r && { backgroundColor: "#635BFF", borderColor: "#635BFF" }
            ]}
            testID={`admin-users-chip-${r}`}
          >
            <Text style={[styles.chipText, { color: theme.onSurfaceSecondary }, filter === r && { color: "#FFFFFF", fontWeight: "800" }]}>
              {r.replace("_", " ")}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* User list */}
      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#635BFF" size="large" /></View>
      ) : shown.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="people-outline" size={48} color={theme.onSurfaceTertiary} />
          <Text style={{ color: theme.onSurfaceSecondary, fontSize: 14, fontWeight: "600", marginTop: 8 }}>
            No users match your filter.
          </Text>
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={u => u.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.sm }}
          renderItem={({ item }) => {
            const roleColor = ROLE_COLORS[item.role] || "#635BFF";
            return (
              <Pressable
                style={[styles.userRow, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}
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
                <View style={[styles.userAvatar, { backgroundColor: `${roleColor}18` }]}>
                  <Text style={[styles.avatarInitial, { color: roleColor }]}>
                    {(item.full_name || item.email || "U")[0].toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.userName, { color: theme.onSurface }]} numberOfLines={1}>
                    {item.full_name || "Nameless User"}
                  </Text>
                  <Text style={[styles.userMeta, { color: theme.onSurfaceSecondary }]} numberOfLines={1}>
                    {item.email}
                  </Text>
                </View>
                <View style={[styles.roleBadge, { backgroundColor: `${roleColor}18` }]}>
                  <Text style={[styles.roleTag, { color: roleColor }]}>
                    {item.role.replace("_", " ").toUpperCase()}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.onSurfaceTertiary} />
              </Pressable>
            );
          }}
        />
      )}

      {err && <Text style={styles.err} testID="admin-users-error">{err}</Text>}

      {/* Edit User Modal */}
      <Modal transparent visible={!!target} animationType="slide" onRequestClose={() => setTarget(null)}>
        <View style={[styles.modalBg, isDesktop && { justifyContent: "center", alignItems: "center", padding: spacing.xl }]}>
          <ScrollView 
            contentContainerStyle={[
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
            ]}
            style={isDesktop ? { maxHeight: "90%", width: 540, flexGrow: 0 } : undefined}
          >
            {target && (
              <>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
                  <View>
                    <Text style={[styles.modalTitle, { color: theme.onSurface }]}>User Settings</Text>
                    <Text style={[styles.userMeta, { color: theme.onSurfaceSecondary }]}>Modify credentials, roles, or access privileges.</Text>
                  </View>
                  <Pressable onPress={() => setTarget(null)} hitSlop={12}>
                    <Ionicons name="close-circle" size={28} color={theme.onSurfaceSecondary} />
                  </Pressable>
                </View>
                
                {/* Section 1: Account Info */}
                <View style={[styles.settingCard, { backgroundColor: theme.surfaceTertiary, borderColor: theme.border }]}>
                  <Text style={[styles.cardHeaderTitle, { color: theme.onSurface }]}>Profile Information</Text>
                  
                  <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Full Name</Text>
                  <View style={[styles.inputContainer, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
                    <Ionicons name="person-outline" size={16} color={theme.onSurfaceSecondary} style={{ marginRight: 8 }} />
                    <TextInput
                      value={editName}
                      onChangeText={setEditName}
                      style={[styles.premiumInput, { color: theme.onSurface }]}
                    />
                  </View>

                  <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Email Address</Text>
                  <View style={[styles.inputContainer, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
                    <Ionicons name="mail-outline" size={16} color={theme.onSurfaceSecondary} style={{ marginRight: 8 }} />
                    <TextInput
                      value={editEmail}
                      onChangeText={setEditEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      style={[styles.premiumInput, { color: theme.onSurface }]}
                    />
                  </View>

                  <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Account Access Role</Text>
                  <View style={styles.rolesGrid}>
                    {["super_admin", "admin_employee", "owner", "manager", "waiter", "kitchen"].map(r => {
                      const isActive = editRole === r;
                      return (
                        <Pressable
                          key={r}
                          style={[
                            styles.roleCard,
                            { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
                            isActive && styles.roleCardActive
                          ]}
                          onPress={() => setEditRole(r)}
                        >
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Ionicons
                              name={r === "super_admin" ? "shield-checkmark" : r === "admin_employee" ? "ribbon-outline" : r === "owner" ? "storefront" : "person"}
                              size={14}
                              color={isActive ? "#635BFF" : theme.onSurfaceSecondary}
                            />
                            <Text style={[styles.roleCardText, { color: theme.onSurfaceSecondary }, isActive && styles.roleCardTextActive]}>
                              {r.replace("_", " ")}
                            </Text>
                          </View>
                          {isActive && <Ionicons name="checkmark-circle" size={14} color="#635BFF" />}
                        </Pressable>
                      );
                    })}
                  </View>

                  {msg && <Text style={styles.msg} testID="admin-user-msg">{msg}</Text>}
                  {err && <Text style={[styles.err, { margin: 0, marginBottom: spacing.md }]} testID="admin-user-error">{err}</Text>}

                  <Pressable style={styles.primaryBtn} onPress={updateUser} disabled={busy} testID="admin-user-update-btn">
                    <LinearGradient
                      colors={["#635BFF", "#4F46E5"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.primaryGrad}
                    >
                      {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Save Changes</Text>}
                    </LinearGradient>
                  </Pressable>
                </View>

                {/* Section 2: Security */}
                <View style={[styles.settingCard, { backgroundColor: theme.surfaceTertiary, borderColor: theme.border }]}>
                  <Text style={[styles.cardHeaderTitle, { color: theme.onSurface }]}>Security & Credentials</Text>
                  <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>{target.role === "waiter" ? "Reset Waiter PIN" : "Reset Password"}</Text>
                  <View style={[styles.inputContainer, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
                    <Ionicons name="key-outline" size={16} color={theme.onSurfaceSecondary} style={{ marginRight: 8 }} />
                    <TextInput
                      value={newPw} onChangeText={setNewPw}
                      placeholder={target.role === "waiter" ? "New 4-6 digit PIN" : "New password (≥ 6 chars)"}
                      placeholderTextColor={theme.onSurfaceTertiary}
                      secureTextEntry
                      style={[styles.premiumInput, { color: theme.onSurface }]}
                      keyboardType={target.role === "waiter" ? "number-pad" : "default"}
                      maxLength={target.role === "waiter" ? 6 : 40}
                      testID="admin-user-newpw-input"
                    />
                  </View>
                  
                  <Pressable
                    style={[styles.resetPwBtn, { borderColor: "#635BFF" }]}
                    onPress={resetPw}
                    disabled={busy}
                    testID="admin-user-reset-btn"
                  >
                    {busy ? <ActivityIndicator color="#635BFF" /> : <Text style={styles.resetPwText}>Update Password / PIN</Text>}
                  </Pressable>
                </View>

                {/* Section 3: Danger Zone */}
                <View style={[styles.settingCard, { backgroundColor: theme.surfaceTertiary, borderColor: "#EF444450" }]}>
                  <Text style={[styles.cardHeaderTitle, { color: "#EF4444" }]}>Danger Zone</Text>
                  <Text style={[styles.userMeta, { color: theme.onSurfaceSecondary, fontSize: 11 }]}>Permanently delete this user profile.</Text>
                  <Pressable style={styles.dangerBtn} onPress={() => removeUser(target.id)} testID="admin-user-delete-btn">
                    <Ionicons name="trash" size={16} color={colors.onError} />
                    <Text style={styles.dangerText}>Delete User Account</Text>
                  </Pressable>
                </View>

                <Pressable style={styles.ghostBtn} onPress={() => setTarget(null)} testID="admin-user-close-btn">
                  <Text style={[styles.ghostText, { color: theme.onSurfaceSecondary }]}>Close</Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Create User Modal */}
      <Modal transparent visible={createModal} animationType="slide" onRequestClose={() => setCreateModal(false)}>
        <View style={[styles.modalBg, isDesktop && { justifyContent: "center", alignItems: "center", padding: spacing.xl }]}>
          <ScrollView 
            contentContainerStyle={[
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
            ]}
            style={isDesktop ? { maxHeight: "90%", width: 540, flexGrow: 0 } : undefined}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
              <View>
                <Text style={[styles.modalTitle, { color: theme.onSurface }]}>New Admin User / Staff</Text>
                <Text style={[styles.userMeta, { color: theme.onSurfaceSecondary }]}>Create a staff login account.</Text>
              </View>
              <Pressable onPress={() => setCreateModal(false)} hitSlop={12}>
                <Ionicons name="close-circle" size={28} color={theme.onSurfaceSecondary} />
              </Pressable>
            </View>
            
            <View style={[styles.settingCard, { backgroundColor: theme.surfaceTertiary, borderColor: theme.border }]}>
              <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Full Name</Text>
              <View style={[styles.inputContainer, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
                <Ionicons name="person-outline" size={16} color={theme.onSurfaceSecondary} style={{ marginRight: 8 }} />
                <TextInput
                  value={createForm.fullName}
                  onChangeText={t => setCreateForm({ ...createForm, fullName: t })}
                  placeholder="e.g. Employee Name"
                  placeholderTextColor={theme.onSurfaceTertiary}
                  style={[styles.premiumInput, { color: theme.onSurface }]}
                />
              </View>

              <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Email Address</Text>
              <View style={[styles.inputContainer, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
                <Ionicons name="mail-outline" size={16} color={theme.onSurfaceSecondary} style={{ marginRight: 8 }} />
                <TextInput
                  value={createForm.email}
                  onChangeText={t => setCreateForm({ ...createForm, email: t })}
                  placeholder="employee@business.com"
                  placeholderTextColor={theme.onSurfaceTertiary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={[styles.premiumInput, { color: theme.onSurface }]}
                />
              </View>

              <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Password</Text>
              <View style={[styles.inputContainer, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
                <Ionicons name="key-outline" size={16} color={theme.onSurfaceSecondary} style={{ marginRight: 8 }} />
                <TextInput
                  value={createForm.password}
                  onChangeText={t => setCreateForm({ ...createForm, password: t })}
                  placeholder="Password (≥ 6 chars)"
                  placeholderTextColor={theme.onSurfaceTertiary}
                  secureTextEntry
                  style={[styles.premiumInput, { color: theme.onSurface }]}
                />
              </View>

              <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Role</Text>
              <View style={styles.rolesGrid}>
                {["admin_employee", "super_admin"].map(r => {
                  const isActive = createForm.role === r;
                  return (
                    <Pressable
                      key={r}
                      style={[
                        styles.roleCard,
                        { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
                        isActive && styles.roleCardActive
                      ]}
                      onPress={() => setCreateForm({ ...createForm, role: r })}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Ionicons
                          name={r === "super_admin" ? "shield-checkmark" : "ribbon-outline"}
                          size={14}
                          color={isActive ? "#635BFF" : theme.onSurfaceSecondary}
                        />
                        <Text style={[styles.roleCardText, { color: theme.onSurfaceSecondary }, isActive && styles.roleCardTextActive]}>
                          {r.replace("_", " ")}
                        </Text>
                      </View>
                      {isActive && <Ionicons name="checkmark-circle" size={14} color="#635BFF" />}
                    </Pressable>
                  );
                })}
              </View>

              {err && <Text style={[styles.err, { margin: 0, marginBottom: spacing.md }]} testID="admin-user-error">{err}</Text>}

              <Pressable style={styles.primaryBtn} onPress={createUser} disabled={busy}>
                <LinearGradient
                  colors={["#635BFF", "#4F46E5"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.primaryGrad}
                >
                  {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Create User Account</Text>}
                </LinearGradient>
              </Pressable>
            </View>

            <Pressable style={styles.ghostBtn} onPress={() => setCreateModal(false)}>
              <Text style={[styles.ghostText, { color: theme.onSurfaceSecondary }]}>Cancel</Text>
            </Pressable>
          </ScrollView>
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

  searchBox: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, height: 40, borderRadius: radius.md, borderWidth: 1, gap: 8 },
  searchInput: { flex: 1, fontSize: 13, fontWeight: "500" },

  chipsRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: "center" },
  chip: { paddingHorizontal: 12, height: 34, borderRadius: radius.pill, borderWidth: 1, justifyContent: "center" },
  chipText: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },

  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl },
  userRow: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, gap: spacing.md },
  userAvatar: { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center" },
  avatarInitial: { fontSize: 16, fontWeight: "900" },
  userName: { fontSize: 15, fontWeight: "800" },
  userMeta: { fontSize: 12, marginTop: 2, fontWeight: "500" },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  roleTag: { fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: "800" },

  err: { color: colors.onError, backgroundColor: colors.error, margin: spacing.lg, padding: spacing.md, borderRadius: radius.md, fontWeight: "700", fontSize: 13 },
  msg: { color: "#34D399", backgroundColor: "#064E3B", padding: spacing.md, borderRadius: radius.md, marginTop: spacing.md, fontWeight: "700", fontSize: 13 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  modalCard: { padding: spacing.xl, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: "92%" },
  modalTitle: { fontSize: 20, fontWeight: "900" },
  label: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5, marginTop: spacing.sm, marginBottom: 6, textTransform: "uppercase" },

  primaryBtn: { borderRadius: radius.md, overflow: "hidden", marginTop: spacing.sm },
  primaryGrad: { paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#FFFFFF", fontWeight: "800", fontSize: 13 },
  resetPwBtn: { paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, alignItems: "center", marginTop: spacing.xs },
  resetPwText: { color: "#635BFF", fontWeight: "800", fontSize: 13 },

  dangerBtn: { flexDirection: "row", alignItems: "center", gap: spacing.sm, justifyContent: "center", padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.error, marginTop: spacing.md },
  dangerText: { color: colors.onError, fontWeight: "700" },
  ghostBtn: { padding: spacing.md, alignItems: "center", marginTop: spacing.sm },
  ghostText: { fontWeight: "600" },
  
  inputContainer: { flexDirection: "row", alignItems: "center", borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 8, borderWidth: 1, marginBottom: spacing.xs },
  premiumInput: { flex: 1, fontSize: 13, fontWeight: "500" },
  rolesGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: spacing.sm, marginVertical: spacing.sm },
  roleCard: { width: "48%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  roleCardActive: { borderColor: "#635BFF", backgroundColor: "rgba(99, 91, 255, 0.08)" },
  roleCardText: { fontSize: 12, textTransform: "capitalize", fontWeight: "600" },
  roleCardTextActive: { color: "#635BFF", fontWeight: "800" },
  settingCard: { padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, marginBottom: spacing.md, gap: spacing.xs },
  cardHeaderTitle: { fontSize: 13, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: spacing.xs },
});

