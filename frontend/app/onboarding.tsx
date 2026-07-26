import { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView,
  Platform, ActivityIndicator, ScrollView, SafeAreaView, StatusBar,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { useTheme } from "@/src/context/ThemeContext";
import { useAuth } from "@/src/context/AuthContext";
import { radius, spacing } from "@/src/theme";

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const { refreshUser } = useAuth();

  const [form, setForm] = useState({
    name: "",
    owner_name: "",
    phone: "",
    address: "",
    upi_id: "",
    merchant_name: "",
    logo_base64: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pickLogo = async () => {
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

  const submit = async () => {
    setErr(null);
    if (!form.name.trim() || !form.owner_name.trim() || !form.phone.trim() || !form.upi_id.trim()) {
      setErr("Please enter Restaurant Name, Owner Name, Phone number, and UPI ID.");
      return;
    }
    setBusy(true);
    try {
      await api.saveRestaurant({
        ...form,
        merchant_name: form.merchant_name || form.name,
        gst_enabled: false,
      });
      await refreshUser();
      router.replace("/demo-billing");
    } catch (e: any) {
      setErr(e.message || "Failed to save restaurant details.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.surface }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.surface} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.md }]} showsVerticalScrollIndicator={false}>
          
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Ionicons name="storefront" size={28} color="#635BFF" />
            </View>
            <Text style={[styles.title, { color: theme.onSurface }]}>Restaurant Details</Text>
            <Text style={[styles.subtitle, { color: theme.onSurfaceSecondary }]}>Enter your business details to complete setup</Text>
          </View>

          <View style={[styles.card, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
            
            {/* Logo / Picture Picker */}
            <Pressable style={styles.logoPicker} onPress={pickLogo}>
              {form.logo_base64 ? (
                <Image source={{ uri: `data:image/jpeg;base64,${form.logo_base64}` }} style={styles.logoImg} contentFit="cover" />
              ) : (
                <View style={styles.logoPlaceholder}>
                  <Ionicons name="camera-outline" size={26} color="#635BFF" />
                  <Text style={styles.logoText}>Upload Logo / Photo</Text>
                </View>
              )}
            </Pressable>

            {/* Inputs */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Restaurant Name *</Text>
              <TextInput
                value={form.name} onChangeText={t => setForm({ ...form, name: t })}
                placeholder="e.g. Master Cheff" placeholderTextColor={theme.onSurfaceTertiary}
                style={[styles.input, { backgroundColor: theme.surfaceTertiary, color: theme.onSurface, borderColor: theme.border }]}
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Owner Name *</Text>
              <TextInput
                value={form.owner_name} onChangeText={t => setForm({ ...form, owner_name: t })}
                placeholder="Full name of owner" placeholderTextColor={theme.onSurfaceTertiary}
                style={[styles.input, { backgroundColor: theme.surfaceTertiary, color: theme.onSurface, borderColor: theme.border }]}
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Phone Number *</Text>
              <TextInput
                value={form.phone} onChangeText={t => setForm({ ...form, phone: t })}
                placeholder="e.g. 9876543210" placeholderTextColor={theme.onSurfaceTertiary}
                keyboardType="phone-pad" style={[styles.input, { backgroundColor: theme.surfaceTertiary, color: theme.onSurface, borderColor: theme.border }]}
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Full Address</Text>
              <TextInput
                value={form.address} onChangeText={t => setForm({ ...form, address: t })}
                placeholder="Street address, city" placeholderTextColor={theme.onSurfaceTertiary}
                style={[styles.input, { backgroundColor: theme.surfaceTertiary, color: theme.onSurface, borderColor: theme.border }]}
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>UPI ID (for payments) *</Text>
              <TextInput
                value={form.upi_id} onChangeText={t => setForm({ ...form, upi_id: t })}
                placeholder="e.g. 8152075375-2@ybl" placeholderTextColor={theme.onSurfaceTertiary}
                style={[styles.input, { backgroundColor: theme.surfaceTertiary, color: theme.onSurface, borderColor: theme.border }]}
              />
            </View>

            {err && <Text style={styles.err}>{err}</Text>}

            <Pressable style={styles.submitBtn} onPress={submit} disabled={busy}>
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitBtnText}>Save & Continue →</Text>}
            </Pressable>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  header: { alignItems: "center", marginBottom: spacing.xl },
  iconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#26294D", justifyContent: "center", alignItems: "center", marginBottom: spacing.md },
  title: { fontSize: 24, fontWeight: "900" },
  subtitle: { fontSize: 13, marginTop: 4, textAlign: "center" },

  card: { padding: spacing.xl, borderRadius: radius.xxl, borderWidth: 1, gap: spacing.md },
  logoPicker: { alignSelf: "center", width: 100, height: 100, borderRadius: 50, overflow: "hidden", marginBottom: spacing.sm },
  logoImg: { width: "100%", height: "100%" },
  logoPlaceholder: { width: "100%", height: "100%", backgroundColor: "#26294D", alignItems: "center", justifyContent: "center", padding: 8 },
  logoText: { color: "#635BFF", fontSize: 10, fontWeight: "800", textAlign: "center", marginTop: 4 },

  field: { gap: 6 },
  label: { fontSize: 12, fontWeight: "700" },
  input: { borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 12, borderWidth: 1, fontSize: 14 },
  err: { color: "#EF4444", backgroundColor: "#FEF2F2", padding: spacing.md, borderRadius: radius.md },
  submitBtn: { backgroundColor: "#635BFF", paddingVertical: 16, borderRadius: radius.lg, alignItems: "center", marginTop: spacing.md },
  submitBtnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 16 },
});
