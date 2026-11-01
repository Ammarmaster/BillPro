import { useCallback, useState, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator,
  KeyboardAvoidingView, Platform, SafeAreaView, StatusBar, Switch, Alert, Share,
} from "react-native";
import PermissionDisclosureModal from "@/src/components/PermissionDisclosureModal";
import AttractiveQRStandeeModal from "@/src/components/AttractiveQRStandeeModal";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { useTheme } from "@/src/context/ThemeContext";
import { spacing } from "@/src/theme";
import { selectDefaultPrinter, getDefaultPrinter, clearDefaultPrinter } from "@/src/lib/print";
import { useAuth } from "@/src/context/AuthContext";
import { useResponsive } from "@/src/hooks/useResponsive";

export default function SettingsDetails() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const { isDesktop } = useResponsive();

  const { user, refreshUser, logout } = useAuth();
  const [privacyConsent, setPrivacyConsent] = useState(user?.privacy_consent ?? true);
  const [marketingConsent, setMarketingConsent] = useState(user?.marketing_consent ?? false);

  useEffect(() => {
    if (user) {
      setPrivacyConsent(user.privacy_consent ?? true);
      setMarketingConsent(user.marketing_consent ?? false);
    }
  }, [user]);

  const handleConsentToggle = async (type: string, val: boolean) => {
    try {
      if (type === "PRIVACY_POLICY" && !val) {
        Alert.alert(
          "Withdraw Data Consent?",
          "Withdrawing your data processing consent will deactivate your account and log you out. We are legally required to retain historical invoices and tax records.\n\nAre you sure you want to withdraw consent?",
          [
            { text: "Cancel", style: "cancel" },
            { 
              text: "Withdraw & Sign Out", 
              style: "destructive",
              onPress: async () => {
                await api.updateConsent(type, "withdrawn");
                Alert.alert("Consent Withdrawn", "Your consent has been recorded. Logging out now.");
                logout();
              }
            }
          ]
        );
        return;
      }
      
      const newStatus = val ? "accepted" : "withdrawn";
      await api.updateConsent(type, newStatus);
      if (type === "PRIVACY_POLICY") setPrivacyConsent(val);
      if (type === "MARKETING_CONSENT") setMarketingConsent(val);
      Alert.alert("Success", `Consent preferences updated: ${newStatus}`);
      await refreshUser();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to update consent.");
    }
  };

  const getInitialForm = () => {
    const cached = api.getCachedRestaurant() || (user as any)?.restaurant_profile || null;
    return {
      name: cached?.name || "",
      owner_name: cached?.owner_name || user?.full_name || "",
      bio: cached?.bio || "",
      address: cached?.address || "",
      phone: cached?.phone || "",
      phone2: cached?.phone2 || "",
      gst: cached?.gst || "",
      gst_enabled: !!cached?.gst_enabled,
      gst_rate: String(cached?.gst_rate ?? "5"),
      fssai: cached?.fssai || "",
      upi_id: cached?.upi_id || "",
      merchant_name: cached?.merchant_name || "",
      logo_base64: cached?.logo_base64 || "",
      google_maps_link: cached?.google_maps_link || "",
      googleReviewUrl: cached?.googleReviewUrl || "",
    };
  };

  const [form, setForm] = useState(getInitialForm);
  const [loading, setLoading] = useState(() => {
    const cached = api.getCachedRestaurant() || (user as any)?.restaurant_profile;
    return !cached;
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [printerUrl, setPrinterUrl] = useState<string | null>(null);
  const [showMediaDisclosure, setShowMediaDisclosure] = useState(false);
  const [showMenuQrModal, setShowMenuQrModal] = useState(false);

  // Subscribe to real-time local cache changes
  useEffect(() => {
    const { subscribeToCache } = require("@/src/lib/api");
    const unsubscribe = subscribeToCache((path: string, data: any) => {
      if (path === "/restaurant" && data) {
        setForm(f => ({
          ...f,
          name: data.name || f.name || "",
          owner_name: data.owner_name || f.owner_name || "",
          bio: data.bio || f.bio || "",
          address: data.address || f.address || "",
          phone: data.phone || f.phone || "",
          phone2: data.phone2 || f.phone2 || "",
          gst: data.gst || f.gst || "",
          gst_enabled: data.gst_enabled !== undefined ? !!data.gst_enabled : f.gst_enabled,
          gst_rate: String(data.gst_rate ?? f.gst_rate ?? "5"),
          fssai: data.fssai || f.fssai || "",
          upi_id: data.upi_id || f.upi_id || "",
          merchant_name: data.merchant_name || f.merchant_name || "",
          logo_base64: data.logo_base64 || f.logo_base64 || "",
          google_maps_link: data.google_maps_link || f.google_maps_link || "",
          googleReviewUrl: data.googleReviewUrl || f.googleReviewUrl || "",
        }));
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const load = useCallback(async () => {
    const cached = api.getCachedRestaurant() || (user as any)?.restaurant_profile;
    setErr(null);
    try {
      const restPromise = api.getRestaurant().catch((e: any) => {
        console.warn("[Settings] getRestaurant error:", e);
        return cached || null;
      });
      const printPromise = getDefaultPrinter().catch(() => null);

      const [r, url] = await Promise.all([restPromise, printPromise]);
      if (url !== undefined) setPrinterUrl(url);
      if (r) {
        setForm(prev => ({
          ...prev,
          name: r.name || prev.name || "",
          owner_name: r.owner_name || prev.owner_name || "",
          bio: r.bio || prev.bio || "",
          address: r.address || prev.address || "",
          phone: r.phone || prev.phone || "",
          phone2: r.phone2 || prev.phone2 || "",
          gst: r.gst || prev.gst || "",
          gst_enabled: r.gst_enabled !== undefined ? !!r.gst_enabled : prev.gst_enabled,
          gst_rate: String(r.gst_rate ?? prev.gst_rate ?? "5"),
          fssai: r.fssai || prev.fssai || "",
          upi_id: r.upi_id || prev.upi_id || "",
          merchant_name: r.merchant_name || prev.merchant_name || "",
          logo_base64: r.logo_base64 || prev.logo_base64 || "",
          google_maps_link: r.google_maps_link || prev.google_maps_link || "",
          googleReviewUrl: r.googleReviewUrl || prev.googleReviewUrl || "",
        }));
      }
    } catch (e: any) {
      if (!cached && !form.name) {
        setErr(e.message || "Failed to load business settings");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pickLogo = async () => {
    if (Platform.OS === "web") {
      runImagePicker();
      return;
    }
    const status = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (status.granted) {
      runImagePicker();
    } else {
      setShowMediaDisclosure(true);
    }
  };

  const runImagePicker = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true,
      });
      if (!res.canceled && res.assets[0]?.base64) {
        setForm(f => ({ ...f, logo_base64: res.assets[0].base64 || "" }));
      }
    } catch {}
  };

  const handleAllowMedia = async () => {
    setShowMediaDisclosure(false);
    const res = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (res.granted) {
      runImagePicker();
    } else {
      Alert.alert("Permission Required", "EzBill needs photo library access to let you select a logo.");
    }
  };

  const cleanUrl = (val: string) => {
    if (!val) return "";
    const trimmed = val.trim();
    if (!trimmed) return "";
    const match = trimmed.match(/(https?:\/\/[^\s]+)/i);
    if (match && match[1]) return match[1].trim();
    const domainMatch = trimmed.match(/((?:share\.google|maps\.app\.goo\.gl|g\.page|goo\.gl|maps\.google\.[a-z.]+|google\.[a-z.]+\/maps)[^\s]*)/i);
    if (domainMatch && domainMatch[1]) return "https://" + domainMatch[1].trim();
    if (trimmed.startsWith("www.") || (trimmed.includes(".") && !trimmed.includes(" "))) {
      return "https://" + trimmed.replace(/^[^\w]+/, "").trim();
    }
    return trimmed;
  };

  const save = async () => {
    setErr(null); setMsg(null);
    if (!form.name.trim() || !form.owner_name.trim() || !form.upi_id.trim()) {
      setErr("Name, owner and UPI ID are required."); return;
    }
    setBusy(true);
    try {
      await api.saveRestaurant({
        ...form,
        google_maps_link: cleanUrl(form.google_maps_link),
        googleReviewUrl: cleanUrl(form.googleReviewUrl),
        gst_rate: parseFloat(form.gst_rate) || 0.0,
        merchant_name: form.merchant_name || form.name
      });
      setMsg("Settings saved successfully.");
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const handleBack = () => {
    if (isDesktop) {
      router.replace("/(app)/dashboard");
    } else {
      router.replace("/(app)/more");
    }
  };

  const field = (key: keyof typeof form, label: string, placeholder: string, opts: any = {}) => (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>{label}</Text>
      <TextInput
        value={String(form[key] ?? "")}
        onChangeText={t => setForm({ ...form, [key]: t })}
        placeholder={placeholder} placeholderTextColor={theme.onSurfaceTertiary}
        style={[styles.input, { backgroundColor: isDark ? "#1F293D" : "#F8FAFC", color: theme.onSurface, borderColor: theme.border }]}
        {...opts}
      />
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.surface }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.surface} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={[styles.wrap, { paddingTop: insets.top, backgroundColor: theme.surface }]}>
          
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={handleBack} style={[styles.backBtn, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
              <Ionicons name="chevron-back" size={24} color={theme.onSurface} />
            </Pressable>
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={[styles.title, { color: theme.onSurface }]}>Business Settings</Text>
              <Text style={[styles.sub, { color: theme.onSurfaceSecondary }]}>GST, UPI, printer & restaurant details</Text>
            </View>
          </View>

          <ScrollView 
            contentContainerStyle={{ 
              padding: spacing.lg, 
              paddingBottom: spacing.xxxl,
              maxWidth: isDesktop ? 900 : undefined,
              width: "100%",
              alignSelf: isDesktop ? "center" : undefined,
            }} 
            showsVerticalScrollIndicator={false}
          >
            {loading ? (
              <ActivityIndicator color="#635BFF" style={{ marginTop: spacing.xl }} />
            ) : (
              <View style={[styles.card, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
                
                {/* Logo Picker */}
                <Pressable style={[styles.logoPicker, { borderColor: theme.border }]} onPress={pickLogo}>
                  {form.logo_base64 ? (
                    <Image source={{ uri: `data:image/jpeg;base64,${form.logo_base64}` }} style={styles.logoImg} contentFit="cover" />
                  ) : (
                    <View style={[styles.logoPlaceholder, { backgroundColor: isDark ? "#1F293D" : "#F1F5F9" }]}>
                      <Ionicons name="camera-outline" size={24} color="#635BFF" />
                      <Text style={styles.logoText}>Change Logo</Text>
                    </View>
                  )}
                </Pressable>

                {field("name", "Restaurant Name *", "Master Cheff")}
                {field("owner_name", "Owner Name *", "Owner name")}
                {field("phone", "Phone Number 1", "+91 XXXXX XXXXX", { keyboardType: "phone-pad" })}
                {field("phone2", "Phone Number 2 (Optional)", "+91 XXXXX XXXXX", { keyboardType: "phone-pad" })}
                {field("address", "Address", "Full address", { multiline: true })}
                {field("upi_id", "UPI ID (for payments) *", "8152075375-2@ybl")}
                {field("gst", "GSTIN", "22AAAAA0000A1Z5")}
                {field("fssai", "FSSAI License", "License #")}
                {field("google_maps_link", "Google Maps Location Link", "https://maps.google.com/?cid=123")}
                {field("googleReviewUrl", "Google Review URL", "https://g.page/r/your-restaurant/review")}
                <Text style={{ fontSize: 11, color: theme.onSurfaceSecondary, marginTop: -8, marginBottom: 12 }}>
                  Used to direct guests to your official Google business listing and feedback rating prompt.
                </Text>

                {/* GST Toggle Switch */}
                <View style={[styles.switchRow, { borderColor: theme.border }]}>
                  <View style={{ flex: 1, marginRight: spacing.sm }}>
                    <Text style={[styles.switchLabel, { color: theme.onSurface }]}>Enable GST on Bills</Text>
                    <Text style={[styles.switchDesc, { color: theme.onSurfaceSecondary }]}>Automatically calculate and add GST (CGST/SGST) to generated bills</Text>
                  </View>
                  <Switch
                    value={form.gst_enabled}
                    onValueChange={val => setForm(f => ({ ...f, gst_enabled: val }))}
                    trackColor={{ false: isDark ? "#374151" : "#E2E8F0", true: "#635BFF" }}
                    thumbColor={form.gst_enabled ? "#FFFFFF" : "#F4F3F4"}
                  />
                </View>

                {form.gst_enabled && field("gst_rate", "GST Percentage (%) *", "5", { keyboardType: "numeric" })}

                {/* Thermal Printer Selection Row */}
                <View style={[styles.switchRow, { borderColor: theme.border }]}>
                  <View style={{ flex: 1, marginRight: spacing.sm }}>
                    <Text style={[styles.switchLabel, { color: theme.onSurface }]}>
                      {Platform.OS === "ios" ? "Thermal Printer (iOS AirPrint)" : "Thermal Printer Setup"}
                    </Text>
                    <Text style={[styles.switchDesc, { color: theme.onSurfaceSecondary }]} numberOfLines={2}>
                      {Platform.OS === "ios"
                        ? (printerUrl ? `Connected: ${printerUrl}` : "Select a connected thermal printer for direct prints")
                        : "Android uses the system print service. Tap Info to see connection steps."}
                    </Text>
                  </View>
                  <Pressable
                    style={{ backgroundColor: "#635BFF", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}
                    onPress={async () => {
                      if (Platform.OS !== "ios") {
                        await selectDefaultPrinter();
                      } else {
                        if (printerUrl) {
                          await clearDefaultPrinter();
                          setPrinterUrl(null);
                        } else {
                          const url = await selectDefaultPrinter();
                          if (url) setPrinterUrl(url);
                        }
                      }
                    }}
                  >
                    <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }}>
                      {Platform.OS === "ios" ? (printerUrl ? "Disconnect" : "Select") : "Info"}
                    </Text>
                  </Pressable>
                </View>

                {/* Digital Web Menu QR Card (Free & Available for All Plans & Restaurants) */}
                <View style={{ marginTop: spacing.md, padding: spacing.lg, borderRadius: 20, borderWidth: 1.5, borderColor: isDark ? "rgba(99, 91, 255, 0.4)" : "rgba(99, 91, 255, 0.25)", backgroundColor: isDark ? "#12192B" : "#F4F6FF" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xs }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#635BFF", justifyContent: "center", alignItems: "center" }}>
                        <Ionicons name="qr-code" size={20} color="#FFFFFF" />
                      </View>
                      <View>
                        <Text style={{ fontSize: 16, fontWeight: "900", color: theme.onSurface }}>Digital Web Menu QR</Text>
                        <Text style={{ fontSize: 11, color: theme.onSurfaceSecondary }}>Contactless Menu Browsing (View-Only)</Text>
                      </View>
                    </View>
                    <View style={{ backgroundColor: "#10B98120", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 }}>
                      <Text style={{ fontSize: 11, fontWeight: "800", color: "#10B981" }}>ALL PLANS</Text>
                    </View>
                  </View>

                  <Text style={{ fontSize: 12, color: theme.onSurfaceSecondary, lineHeight: 17, marginVertical: spacing.sm }}>
                    One universal QR code for all your guests to browse food items, prices, and categories on their phone (view-only web menu, no ordering required).
                  </Text>

                  <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: 4 }}>
                    <Pressable
                      style={{
                        flex: 1,
                        backgroundColor: "#635BFF",
                        paddingVertical: 12,
                        borderRadius: 14,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                      }}
                      onPress={() => setShowMenuQrModal(true)}
                    >
                      <Ionicons name="eye-outline" size={17} color="#FFFFFF" />
                      <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 13 }}>View & Download QR Standee</Text>
                    </Pressable>

                    <Pressable
                      style={{
                        backgroundColor: isDark ? "#1F293D" : "#FFFFFF",
                        borderWidth: 1.5,
                        borderColor: theme.border,
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        borderRadius: 14,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                      }}
                      onPress={async () => {
                        const backendBase = api.getBackendUrl();
                        const tid = user?.tenant_id || "undefined";
                        const url = `${backendBase}/menu/${tid}?mode=menu`;
                        if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
                          await navigator.clipboard.writeText(url);
                          Alert.alert("Link Copied", "Web Menu link copied to clipboard!");
                        } else {
                          await Share.share({ message: url, url, title: `${form.name || "Restaurant"} Web Menu` });
                        }
                      }}
                    >
                      <Ionicons name="share-social-outline" size={17} color={theme.onSurface} />
                      <Text style={{ color: theme.onSurface, fontWeight: "700", fontSize: 13 }}>Share</Text>
                    </Pressable>
                  </View>
                </View>

                {/* Privacy & Consent Settings Card */}
                <View style={{ marginTop: spacing.md, padding: spacing.md, borderRadius: 16, borderWidth: 1.5, borderColor: theme.border, backgroundColor: theme.surfaceSecondary }}>
                  <Text style={{ fontSize: 16, fontWeight: "900", color: theme.onSurface, marginBottom: spacing.xs }}>Privacy & Consent Settings</Text>
                  <Text style={{ fontSize: 12, color: theme.onSurfaceSecondary, marginBottom: spacing.md }}>Manage your DPDP consent options and data processing preferences.</Text>
                  
                  {/* Terms (Read-Only) */}
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.border }}>
                    <View style={{ flex: 1, marginRight: spacing.sm }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: theme.onSurface }}>Terms & Conditions</Text>
                      <Text style={{ fontSize: 11, color: theme.onSurfaceSecondary }}>Accepted on account creation (v1.0)</Text>
                    </View>
                    <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                  </View>

                  {/* Privacy Notice Data Processing (Required for Account operation) */}
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.border }}>
                    <View style={{ flex: 1, marginRight: spacing.sm }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: theme.onSurface }}>Data Processing Consent</Text>
                      <Text style={{ fontSize: 11, color: theme.onSurfaceSecondary }}>Allow processing restaurant and sales data (Required)</Text>
                    </View>
                    <Switch
                      value={privacyConsent}
                      onValueChange={val => handleConsentToggle("PRIVACY_POLICY", val)}
                      trackColor={{ false: isDark ? "#374151" : "#E2E8F0", true: "#635BFF" }}
                      thumbColor={privacyConsent ? "#FFFFFF" : "#F4F3F4"}
                    />
                  </View>

                  {/* Marketing / Promotional Consent (Optional) */}
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.border }}>
                    <View style={{ flex: 1, marginRight: spacing.sm }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: theme.onSurface }}>Marketing & Promotions</Text>
                      <Text style={{ fontSize: 11, color: theme.onSurfaceSecondary }}>Receive promotional alerts and product updates (Optional)</Text>
                    </View>
                    <Switch
                      value={marketingConsent}
                      onValueChange={val => handleConsentToggle("MARKETING_CONSENT", val)}
                      trackColor={{ false: isDark ? "#374151" : "#E2E8F0", true: "#635BFF" }}
                      thumbColor={marketingConsent ? "#FFFFFF" : "#F4F3F4"}
                    />
                  </View>

                  {/* Link to Legal & Rights */}
                  <Pressable
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 12 }}
                    onPress={() => router.push("/(app)/legal")}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "#635BFF" }}>
                      View Full Legal Policies & Data Export →
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color="#635BFF" />
                  </Pressable>
                </View>

                {err && <Text style={styles.err}>{err}</Text>}
                {msg && <Text style={styles.msg}>{msg}</Text>}

                <Pressable style={styles.saveBtn} onPress={save} disabled={busy}>
                  {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>Save Changes</Text>}
                </Pressable>
              </View>
            )}
          </ScrollView>

        </View>
      </KeyboardAvoidingView>

      <PermissionDisclosureModal
        visible={showMediaDisclosure}
        title="Photo Library Permission"
        description="EzBill needs access to your photo library to let you select a restaurant logo."
        icon="images-outline"
        onAllow={handleAllowMedia}
        onCancel={() => setShowMediaDisclosure(false)}
      />

      <AttractiveQRStandeeModal
        visible={showMenuQrModal}
        onClose={() => setShowMenuQrModal(false)}
        title="Digital Web Menu QR"
        restaurantName={form.name || "Restaurant"}
        badgeText="DIGITAL WEB MENU"
        targetUrl={`${api.getBackendUrl()}/menu/${user?.tenant_id || "undefined"}?mode=menu`}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "900" },
  sub: { fontSize: 13, marginTop: 2, fontWeight: "500" },

  card: { padding: spacing.xl, borderRadius: 28, borderWidth: 1.5, gap: spacing.md },
  logoPicker: { alignSelf: "center", width: 90, height: 90, borderRadius: 45, overflow: "hidden", borderWidth: 2, marginBottom: spacing.sm },
  logoImg: { width: "100%", height: "100%" },
  logoPlaceholder: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  logoText: { color: "#635BFF", fontSize: 10, fontWeight: "800", marginTop: 2 },

  field: { marginBottom: spacing.xs },
  label: { fontSize: 12, marginBottom: 6, fontWeight: "700" },
  input: { borderRadius: 18, paddingHorizontal: spacing.md, paddingVertical: 14, borderWidth: 1.5, fontSize: 14 },
  err: { color: "#EF4444", backgroundColor: "#FEF2F2", padding: spacing.md, borderRadius: 16, marginTop: spacing.sm },
  msg: { color: "#10B981", backgroundColor: "#ECFDF5", padding: spacing.md, borderRadius: 16, marginTop: spacing.sm },
  saveBtn: { backgroundColor: "#635BFF", paddingVertical: 16, borderRadius: 20, alignItems: "center", marginTop: spacing.md },
  saveText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.05)" },
  switchLabel: { fontSize: 15, fontWeight: "700" },
  switchDesc: { fontSize: 12, marginTop: 2 },
});
