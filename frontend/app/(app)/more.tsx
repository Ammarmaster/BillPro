import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator,
  KeyboardAvoidingView, Platform, Switch,
} from "react-native";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { pickImageBase64 } from "@/src/lib/imagePicker";
import { useAuth } from "@/src/context/AuthContext";
import { colors, spacing, radius } from "@/src/theme";

export default function More() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    name: "", owner_name: "", bio: "", address: "", phone: "",
    gst: "", gst_enabled: false, fssai: "", upi_id: "", merchant_name: "",
    logo_base64: "",
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const isStaff = user?.role === "waiter" || user?.role === "kitchen";
  const isAdmin = user?.role === "super_admin";

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const r = await api.getRestaurant();
      if (r) {
        setForm({
          name: r.name || "", owner_name: r.owner_name || "", bio: r.bio || "",
          address: r.address || "", phone: r.phone || "",
          gst: r.gst || "", gst_enabled: !!r.gst_enabled, fssai: r.fssai || "",
          upi_id: r.upi_id || "", merchant_name: r.merchant_name || "",
          logo_base64: r.logo_base64 || "",
        });
      }
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pickLogo = async () => {
    try {
      const b64 = await pickImageBase64(0.6);
      if (b64) setForm(f => ({ ...f, logo_base64: b64 }));
    } catch (e: any) { setErr(e.message); }
  };

  const save = async () => {
    setErr(null); setMsg(null);
    if (!form.name.trim() || !form.owner_name.trim() || !form.upi_id.trim() || !form.merchant_name.trim()) {
      setErr("Name, owner, UPI ID and merchant name are required."); return;
    }
    setBusy(true);
    try { await api.saveRestaurant(form); setMsg("Restaurant saved."); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const field = (key: keyof typeof form, label: string, placeholder: string, opts: any = {}) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={String(form[key] ?? "")}
        onChangeText={t => setForm({ ...form, [key]: t })}
        placeholder={placeholder} placeholderTextColor={colors.onSurfaceTertiary}
        style={styles.input} testID={`rest-${key}-input`} {...opts}
      />
    </View>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView
        style={[styles.wrap, { paddingTop: insets.top }]}
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl }}
        testID="more-screen"
      >
        <Text style={styles.title}>Settings</Text>

        <View style={styles.userCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>{user?.full_name}</Text>
            <Text style={styles.userMeta}>{user?.email} · {user?.role}</Text>
          </View>
          <Pressable onPress={logout} style={styles.logoutBtn} testID="more-logout-btn">
            <Ionicons name="log-out-outline" size={18} color={colors.onError} />
            <Text style={{ color: colors.onError, fontSize: 13 }}>Sign Out</Text>
          </Pressable>
        </View>

        {isStaff ? (
          <View style={styles.notice}>
            <Ionicons name="lock-closed" size={18} color={colors.brand} />
            <Text style={styles.noticeText}>Restaurant settings are managed by the owner.</Text>
          </View>
        ) : isAdmin ? (
          <View style={styles.notice}>
            <Ionicons name="shield-checkmark" size={18} color={colors.brand} />
            <Text style={styles.noticeText}>Signed in as Super Admin. Manage everything from the Admin tab.</Text>
          </View>
        ) : (
          <>
            <Text style={styles.section}>Restaurant Logo</Text>
            <Pressable style={styles.logoRow} onPress={pickLogo} testID="rest-logo-picker">
              {form.logo_base64 ? (
                <Image source={{ uri: `data:image/jpeg;base64,${form.logo_base64}` }} style={styles.logoImg} contentFit="cover" />
              ) : (
                <View style={styles.logoFallback}>
                  <Text style={styles.logoFallbackText}>{(form.name || "L").charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.logoTitle}>{form.logo_base64 ? "Change Logo" : "Upload Logo"}</Text>
                <Text style={styles.logoSub}>Square image, up to ~500 KB.</Text>
              </View>
              <Ionicons name="camera" size={22} color={colors.brand} />
            </Pressable>

            <Text style={styles.section}>Restaurant Details</Text>
            {loading ? (
              <ActivityIndicator color={colors.brand} />
            ) : (
              <>
                {field("name", "Hotel Name *", "e.g. Nawaab Kitchen")}
                {field("owner_name", "Owner *", "Owner name")}
                {field("phone", "Phone *", "Used by staff to sign in", { keyboardType: "phone-pad" })}
                {field("bio", "Bio", "Short tagline", { multiline: true })}
                {field("address", "Address", "Full address", { multiline: true })}

                <View style={styles.field}>
                  <View style={styles.toggleRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>GST on Bills</Text>
                      <Text style={styles.hint}>Split into CGST + SGST when enabled.</Text>
                    </View>
                    <Switch
                      value={form.gst_enabled}
                      onValueChange={v => setForm(f => ({ ...f, gst_enabled: v }))}
                      trackColor={{ false: colors.surfaceTertiary, true: colors.brandSecondary }}
                      thumbColor={form.gst_enabled ? colors.brand : "#fff"}
                      testID="rest-gst-toggle"
                    />
                  </View>
                </View>

                {field("gst", "GSTIN", "22AAAAA0000A1Z5")}
                {field("fssai", "FSSAI", "License number")}
                {field("upi_id", "UPI ID *", "yourname@upi", { autoCapitalize: "none" })}
                {field("merchant_name", "Merchant Name *", "As shown in UPI")}

                {err && <Text style={styles.err} testID="more-error">{err}</Text>}
                {msg && <Text style={styles.msg} testID="more-msg">{msg}</Text>}

                <Pressable style={styles.saveBtn} onPress={save} disabled={busy} testID="more-save-btn">
                  {busy ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.saveText}>Save Restaurant</Text>}
                </Pressable>

                <Text style={styles.section}>Manage</Text>
                <Pressable style={styles.manageRow} onPress={() => router.push("/(app)/subscribe")} testID="manage-subscribe-btn">
                  <Ionicons name="pricetags" size={22} color={colors.brand} />
                  <Text style={styles.manageText}>Subscription</Text>
                  <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceSecondary} />
                </Pressable>
                <Pressable style={styles.manageRow} onPress={() => router.push("/(app)/tables")} testID="manage-tables-btn">
                  <Ionicons name="grid" size={22} color={colors.brand} />
                  <Text style={styles.manageText}>Tables</Text>
                  <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceSecondary} />
                </Pressable>
                <Pressable style={styles.manageRow} onPress={() => router.push("/(app)/staff")} testID="manage-staff-btn">
                  <Ionicons name="people" size={22} color={colors.brand} />
                  <Text style={styles.manageText}>Waiters</Text>
                  <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceSecondary} />
                </Pressable>
              </>
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  title: { color: colors.onSurface, fontSize: 28, fontFamily: "serif", marginBottom: spacing.lg },
  userCard: { flexDirection: "row", alignItems: "center", padding: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, marginBottom: spacing.xl, gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  userName: { color: colors.onSurface, fontSize: 16 },
  userMeta: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  logoutBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.error },
  section: { color: colors.onSurfaceSecondary, fontSize: 13, letterSpacing: 1, textTransform: "uppercase", marginTop: spacing.xl, marginBottom: spacing.md },
  logoRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  logoImg: { width: 64, height: 64, borderRadius: radius.md },
  logoFallback: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  logoFallbackText: { color: colors.onBrand, fontSize: 32, fontFamily: "serif" },
  logoTitle: { color: colors.onSurface, fontSize: 15 },
  logoSub: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  field: { marginBottom: spacing.md },
  label: { color: colors.onSurfaceSecondary, fontSize: 12, marginBottom: 6, letterSpacing: 0.5 },
  hint: { color: colors.onSurfaceTertiary, fontSize: 11, marginTop: 2 },
  input: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 12, color: colors.onSurface, borderWidth: 1, borderColor: colors.border },
  toggleRow: { flexDirection: "row", alignItems: "center", padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  err: { color: colors.onError, backgroundColor: colors.error, padding: spacing.md, borderRadius: radius.md, marginTop: spacing.sm },
  msg: { color: colors.onSuccess, backgroundColor: colors.success, padding: spacing.md, borderRadius: radius.md, marginTop: spacing.sm },
  saveBtn: { backgroundColor: colors.brand, paddingVertical: 16, borderRadius: radius.lg, alignItems: "center", marginTop: spacing.xl },
  saveText: { color: colors.onBrand, fontWeight: "600", fontSize: 15, letterSpacing: 0.5 },
  manageRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  manageText: { color: colors.onSurface, fontSize: 15, flex: 1 },
  notice: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, borderColor: colors.brandTertiary, borderWidth: 1 },
  noticeText: { color: colors.onSurfaceSecondary, flex: 1 },
});
