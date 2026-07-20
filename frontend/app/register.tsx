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

export default function Register() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { register } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const submit = async () => {
    setErr(null);
    if (!fullName.trim() || !email.trim() || password.length < 6) {
      setErr("Please fill all fields (password ≥ 6 chars).");
      return;
    }
    setBusy(true);
    try {
      await register(email.trim(), password, fullName.trim(), "owner");
      router.replace("/(app)/dashboard");
    } catch (e: any) {
      setErr(e.message || "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.wrap}>
      <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.xl }]}>
        <Pressable onPress={() => router.back()} testID="register-back-btn" style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Set up your restaurant in minutes.</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            value={fullName} onChangeText={setFullName}
            style={styles.input} placeholder="Ammar Khan"
            placeholderTextColor={colors.onSurfaceTertiary}
            testID="register-name-input"
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email} onChangeText={setEmail}
            style={styles.input} placeholder="you@restaurant.com"
            placeholderTextColor={colors.onSurfaceTertiary}
            keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
            testID="register-email-input"
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            value={password} onChangeText={setPassword}
            style={styles.input} placeholder="At least 6 characters"
            placeholderTextColor={colors.onSurfaceTertiary}
            secureTextEntry autoCapitalize="none"
            testID="register-password-input"
          />
        </View>

        {err && <Text style={styles.err} testID="register-error">{err}</Text>}

        <Pressable style={styles.primaryBtn} onPress={submit} disabled={busy} testID="register-submit-btn">
          {busy ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.primaryText}>Create Account</Text>}
        </Pressable>

        <Pressable onPress={() => router.replace("/login")} testID="register-goto-login" style={{ marginTop: spacing.xl, alignItems: "center" }}>
          <Text style={{ color: colors.onSurfaceSecondary }}>
            Have an account? <Text style={{ color: colors.brand }}>Sign in</Text>
          </Text>
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
