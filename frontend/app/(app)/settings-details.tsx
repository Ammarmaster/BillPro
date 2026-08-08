import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator,
  KeyboardAvoidingView, Platform, SafeAreaView, StatusBar, Switch, Alert,
} from "react-native";
import PermissionDisclosureModal from "@/src/components/PermissionDisclosureModal";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { useTheme } from "@/src/context/ThemeContext";
import { spacing } from "@/src/theme";
import { selectDefaultPrinter, getDefaultPrinter, clearDefaultPrinter } from "@/src/lib/print";

export default function SettingsDetails() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme, isDark } = useTheme();

  const [form, setForm] = useState({
    name: "", owner_name: "", bio: "", address: "", phone: "",
    gst: "", gst_enabled: false, gst_rate: "5", fssai: "", upi_id: "", merchant_name: "",
    logo_base64: "", google_maps_link: "", googleReviewUrl: "",
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [printerUrl, setPrinterUrl] = useState<string | null>(null);
  const [showMediaDisclosure, setShowMediaDisclosure] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [r, url] = await Promise.all([
        api.getRestaurant(),
        getDefaultPrinter()
      ]);
      setPrinterUrl(url);
      if (r) {
        setForm({
          name: r.name || "", owner_name: r.owner_name || "", bio: r.bio || "",
          address: r.address || "", phone: r.phone || "",
          gst: r.gst || "", gst_enabled: !!r.gst_enabled, gst_rate: String(r.gst_rate ?? "5"), fssai: r.fssai || "",
          upi_id: r.upi_id || "", merchant_name: r.merchant_name || "",
          logo_base64: r.logo_base64 || "", google_maps_link: r.google_maps_link || "",
          googleReviewUrl: r.googleReviewUrl || "",
        });
      }
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

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

  const save = async () => {
    setErr(null); setMsg(null);
    if (!form.name.trim() || !form.owner_name.trim() || !form.upi_id.trim()) {
      setErr("Name, owner and UPI ID are required."); return;
    }
    setBusy(true);
    try {
      await api.saveRestaurant({
        ...form,
        gst_rate: parseFloat(form.gst_rate) || 0.0,
        merchant_name: form.merchant_name || form.name
      });
      setMsg("Settings saved successfully.");
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.push("/(app)/more");
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

          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }} showsVerticalScrollIndicator={false}>
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
                {field("phone", "Phone", "Phone number", { keyboardType: "phone-pad" })}
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
