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

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      router.replace("/(app)/dashboard");
    } catch (e: any) {
      setErr(e.message || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.wrap}>
      <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.xl }]}>
        <Pressable onPress={() => router.back()} testID="login-back-btn" style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.subtitle}>Sign in to manage your restaurant.</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            style={styles.input}
            placeholder="you@restaurant.com"
            placeholderTextColor={colors.onSurfaceTertiary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            testID="login-email-input"
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor={colors.onSurfaceTertiary}
            secureTextEntry
            autoCapitalize="none"
            testID="login-password-input"
          />
        </View>

        {err && <Text style={styles.err} testID="login-error">{err}</Text>}

        <Pressable style={styles.primaryBtn} onPress={submit} disabled={busy} testID="login-submit-btn">
          {busy ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.primaryText}>Sign In</Text>}
        </Pressable>

        <Pressable onPress={() => router.replace("/register")} testID="login-goto-register" style={{ marginTop: spacing.xl, alignItems: "center" }}>
          <Text style={{ color: colors.onSurfaceSecondary }}>
            New here? <Text style={{ color: colors.brand }}>Create account</Text>
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
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    color: colors.onSurface,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  err: { color: colors.onError, backgroundColor: colors.error, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.md },
  primaryBtn: {
    backgroundColor: colors.brand,
    paddingVertical: 16,
    borderRadius: radius.lg,
    alignItems: "center",
    marginTop: spacing.md,
  },
  primaryText: { color: colors.onBrand, fontWeight: "600", fontSize: 16, letterSpacing: 1 },
});
