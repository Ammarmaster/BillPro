import { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView,
  Platform, ActivityIndicator, ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { colors, spacing, radius } from "@/src/theme";

export default function StaffLogin() {
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { staffLogin } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const submit = async () => {
    setErr(null);
    if (!phone.trim() || pin.length < 4) { setErr("Enter restaurant phone and 4-6 digit PIN."); return; }
    setBusy(true);
    try {
      await staffLogin(phone.trim(), pin.trim());
      router.replace("/(app)/waiter");
    } catch (e: any) {
      setErr(e.message || "Login failed");
    } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.wrap}>
      <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.xl }]}>
        <Pressable onPress={() => router.back()} testID="staff-back-btn" style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Staff Sign In</Text>
        <Text style={styles.subtitle}>Enter the restaurant phone and your PIN.</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Restaurant Phone</Text>
          <TextInput
            value={phone} onChangeText={setPhone} style={styles.input}
            placeholder="9876543210" placeholderTextColor={colors.onSurfaceTertiary}
            keyboardType="phone-pad" autoCapitalize="none" testID="staff-phone-input"
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>PIN</Text>
          <TextInput
            value={pin} onChangeText={setPin} style={styles.input}
            placeholder="4 – 6 digits" placeholderTextColor={colors.onSurfaceTertiary}
            keyboardType="number-pad" maxLength={6} secureTextEntry testID="staff-pin-input"
          />
        </View>

        {err && <Text style={styles.err} testID="staff-error">{err}</Text>}

        <Pressable style={styles.primaryBtn} onPress={submit} disabled={busy} testID="staff-submit-btn">
          {busy ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.primaryText}>Sign In</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  container: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl },
  backBtn: { marginBottom: spacing.lg },
  title: { fontSize: 36, fontFamily: "serif", color: colors.onSurface, marginBottom: spacing.sm },
  subtitle: { color: colors.onSurfaceSecondary, marginBottom: spacing.xxl },
  field: { marginBottom: spacing.lg },
  label: { color: colors.onSurfaceSecondary, marginBottom: spacing.sm, fontSize: 13, letterSpacing: 0.5 },
  input: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, paddingVertical: 14,
    color: colors.onSurface, fontSize: 16, borderWidth: 1, borderColor: colors.border,
  },
  err: { color: colors.onError, backgroundColor: colors.error, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.md },
  primaryBtn: { backgroundColor: colors.brand, paddingVertical: 16, borderRadius: radius.lg, alignItems: "center", marginTop: spacing.md },
  primaryText: { color: colors.onBrand, fontWeight: "600", fontSize: 16, letterSpacing: 1 },
});
