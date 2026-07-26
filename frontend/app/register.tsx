import { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView,
  Platform, ActivityIndicator, ScrollView, SafeAreaView, StatusBar,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { colors, spacing, radius } from "@/src/theme";

export default function Register() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      router.replace("/onboarding");
    } catch (e: any) {
      setErr(e.message || "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F9FD" />
      <View style={styles.bg}>
        
        {/* Glow Mesh Overlay */}
        <View style={styles.glowContainer}>
          <LinearGradient
            colors={["rgba(99,91,255,0.12)", "rgba(99,91,255,0.01)", "transparent"]}
            style={styles.glowGradient}
          />
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.wrap}>
          <ScrollView
            contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.sm }]}
            showsVerticalScrollIndicator={false}
          >
            
            {/* Top Navigation Bar */}
            <View style={styles.topBar}>
              <Pressable onPress={() => router.back()} testID="register-back-btn" style={styles.backBtn} hitSlop={12}>
                <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
              </Pressable>
              <View style={styles.topBrand}>
                <Ionicons name="sparkles" size={14} color={colors.brand} style={{ marginRight: 2 }} />
                <Text style={styles.topBrandText}>Register</Text>
              </View>
            </View>

            {/* Registration Card */}
            <View style={styles.card}>
              <View style={styles.logoBadgeOuter}>
                <LinearGradient
                  colors={["#818CF8", "#635BFF", "#4F46E5"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.logoBadge}
                >
                  <Ionicons name="storefront" size={22} color="#FFFFFF" />
                </LinearGradient>
              </View>

              <Text style={styles.title}>Create Account</Text>
              <Text style={styles.subtitle}>Set up your enterprise billing and POS dashboard.</Text>

              {/* Full Name Input Field */}
              <View style={styles.field}>
                <Text style={styles.label}>FULL NAME</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="person-outline" size={18} color={colors.onSurfaceSecondary} style={styles.inputIcon} />
                  <TextInput
                    value={fullName}
                    onChangeText={setFullName}
                    style={styles.input}
                    placeholder="Ammar Khan"
                    placeholderTextColor={colors.onSurfaceTertiary}
                    testID="register-name-input"
                  />
                </View>
              </View>

              {/* Email Input Field */}
              <View style={styles.field}>
                <Text style={styles.label}>EMAIL ADDRESS</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="mail-outline" size={18} color={colors.onSurfaceSecondary} style={styles.inputIcon} />
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    style={styles.input}
                    placeholder="you@business.com"
                    placeholderTextColor={colors.onSurfaceTertiary}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    testID="register-email-input"
                  />
                </View>
              </View>

              {/* Password Input Field */}
              <View style={styles.field}>
                <Text style={styles.label}>PASSWORD (MIN 6 CHARACTERS)</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="lock-closed-outline" size={18} color={colors.onSurfaceSecondary} style={styles.inputIcon} />
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    style={[styles.input, { paddingRight: 44 }]}
                    placeholder="At least 6 characters"
                    placeholderTextColor={colors.onSurfaceTertiary}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    testID="register-password-input"
                  />
                  <Pressable
                    onPress={() => setShowPassword(!showPassword)}
                    style={styles.eyeBtn}
                    hitSlop={10}
                  >
                    <Ionicons
                      name={showPassword ? "eye-off" : "eye"}
                      size={18}
                      color={colors.onSurfaceSecondary}
                    />
                  </Pressable>
                </View>
              </View>

              {/* Error Message */}
              {err && (
                <View style={styles.errBox}>
                  <Ionicons name="alert-circle" size={18} color="#DC2626" style={{ marginRight: 8 }} />
                  <Text style={styles.errText} testID="register-error">{err}</Text>
                </View>
              )}

              {/* Submit Button */}
              <Pressable
                style={({ pressed }) => [styles.primaryBtnContainer, pressed && styles.btnPressed, busy && { opacity: 0.7 }]}
                onPress={submit}
                disabled={busy}
                testID="register-submit-btn"
              >
                <LinearGradient
                  colors={["#635BFF", "#4F46E5"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.primaryBtn}
                >
                  {busy ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <View style={styles.btnRow}>
                      <Text style={styles.primaryText}>Register Account</Text>
                      <Ionicons name="arrow-forward" size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />
                    </View>
                  )}
                </LinearGradient>
              </Pressable>

              {/* Login Footer */}
              <Pressable onPress={() => router.replace("/login")} testID="register-goto-login" style={styles.footerBtn}>
                <Text style={styles.footerText}>
                  Already have a business? <Text style={styles.footerAccent}>Sign In</Text>
                </Text>
              </Pressable>
            </View>

          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F8F9FD" },
  bg: { flex: 1, backgroundColor: "#F8F9FD" },
  wrap: { flex: 1 },
  glowContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 300,
  },
  glowGradient: {
    width: "100%",
    height: "100%",
  },
  container: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(99, 91, 255, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "rgba(0,0,0,0.03)",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 1,
  },
  topBrand: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: "rgba(99, 91, 255, 0.06)",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(99, 91, 255, 0.15)",
  },
  topBrandText: {
    color: colors.brand,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: "rgba(99, 91, 255, 0.08)",
    shadowColor: "rgba(99, 91, 255, 0.06)",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 3,
  },
  logoBadgeOuter: {
    alignSelf: "flex-start",
    padding: 4,
    borderRadius: radius.md,
    backgroundColor: "rgba(99, 91, 255, 0.1)",
    marginBottom: spacing.lg,
  },
  logoBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.md - 4,
    justifyContent: "center",
    alignItems: "center",
  },
  title: { fontSize: 24, fontWeight: "900", color: colors.onSurface, marginBottom: spacing.xs },
  subtitle: { color: colors.onSurfaceSecondary, marginBottom: spacing.xl, fontSize: 13, lineHeight: 18 },
  field: { marginBottom: spacing.lg },
  label: {
    color: colors.onSurfaceSecondary,
    marginBottom: 6,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    position: "relative",
  },
  inputIcon: { marginLeft: spacing.md },
  input: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.onSurface,
    fontSize: 14,
    fontWeight: "500",
  },
  eyeBtn: {
    position: "absolute",
    right: 12,
    padding: 4,
    justifyContent: "center",
    alignItems: "center"
  },
  errBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF2F2",
    borderColor: "rgba(220, 38, 38, 0.2)",
    borderWidth: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
  },
  errText: { color: "#DC2626", fontSize: 13, flex: 1, fontWeight: "600" },
  btnPressed: { opacity: 0.95, transform: [{ scale: 0.99 }] },
  primaryBtnContainer: {
    height: 52,
    borderRadius: radius.lg,
    overflow: "hidden",
    marginTop: spacing.sm,
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  primaryBtn: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  btnRow: { flexDirection: "row", alignItems: "center" },
  primaryText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15, letterSpacing: 0.3 },
  footerBtn: { marginTop: spacing.xl, alignItems: "center" },
  footerText: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "500" },
  footerAccent: { color: colors.brand, fontWeight: "700" }
});
