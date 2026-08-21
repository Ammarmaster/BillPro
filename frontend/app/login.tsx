import { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView,
  Platform, ActivityIndicator, ScrollView, SafeAreaView, StatusBar,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/context/ThemeContext";
import { spacing } from "@/src/theme";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const { theme, isDark } = useTheme();
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

  const forgotStyle = { color: theme.brand, fontSize: 13, fontWeight: "600" as const };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.surface }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.surface} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[styles.wrap, { backgroundColor: theme.surface }]}>
        <ScrollView contentContainerStyle={[styles.scrollContainer, { backgroundColor: theme.surface }]} bounces={false} showsVerticalScrollIndicator={false}>
          
          {/* Solid Orange Header Section */}
          <View style={[styles.headerSection, { paddingTop: insets.top + 32, backgroundColor: isDark ? theme.surface : "#FF5E2B" }]}>
            {/* Cutlery Plate Logo box */}
            <View style={[styles.logoBox, { backgroundColor: isDark ? "rgba(255, 94, 43, 0.2)" : "rgba(255, 255, 255, 0.2)" }]}>
              <Ionicons name="restaurant" size={34} color={isDark ? "#FF5E2B" : "#FFFFFF"} />
            </View>
            <Text style={[styles.appTitle, { color: theme.onSurface }]}>ProDevOpz ERP</Text>
            <Text style={[styles.appSubtitle, { color: theme.onSurfaceSecondary }]}>Restaurant Management Platform</Text>
          </View>

          {/* Dark Bottom Card Section */}
          <View style={[styles.cardSection, { backgroundColor: theme.surfaceSecondary }]}>
            <Text style={[styles.welcomeText, { color: theme.onSurface }]}>Welcome back</Text>
            <Text style={[styles.subtext, { color: theme.onSurfaceSecondary }]}>Sign in to manage your restaurant</Text>

            {/* Email Field */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Email</Text>
              <View style={[styles.inputWrapper, { backgroundColor: theme.surfaceTertiary, borderColor: theme.border }]}>
                <Ionicons name="mail-outline" size={20} color={theme.onSurfaceTertiary} style={styles.inputIcon} />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  style={[styles.input, { color: theme.onSurface }]}
                  placeholder="owner@yourplace.com"
                  placeholderTextColor={theme.onSurfaceTertiary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  testID="login-email-input"
                />
              </View>
            </View>

            {/* Password Field */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Password</Text>
              <View style={[styles.inputWrapper, { backgroundColor: theme.surfaceTertiary, borderColor: theme.border }]}>
                <Ionicons name="lock-closed-outline" size={20} color={theme.onSurfaceTertiary} style={styles.inputIcon} />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  style={[styles.input, { paddingRight: 44, color: theme.onSurface }]}
                  placeholder="••••••••"
                  placeholderTextColor={theme.onSurfaceTertiary}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  testID="login-password-input"
                />
                <Pressable
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeBtn}
                  hitSlop={10}
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={theme.onSurfaceTertiary}
                  />
                </Pressable>
              </View>
            </View>

            <Pressable onPress={() => router.push("/forgot-password")} style={styles.forgotBtn} testID="login-forgot-password-btn">
              <Text style={forgotStyle}>Forgot password?</Text>
            </Pressable>

            {/* Error Message */}
            {err && (
              <View style={[styles.errBox, { backgroundColor: isDark ? "rgba(239, 68, 68, 0.1)" : "rgba(239, 68, 68, 0.1)" }]}>
                <Ionicons name="alert-circle-outline" size={18} color="#EF4444" style={{ marginRight: 8 }} />
                <Text style={styles.errText} testID="login-error">{err}</Text>
              </View>
            )}

            {/* Submit Button */}
            <Pressable
              style={({ pressed }) => [styles.submitBtn, { backgroundColor: theme.brand }, pressed && styles.btnPressed, busy && { opacity: 0.7 }]}
              onPress={submit}
              disabled={busy}
              testID="login-submit-btn"
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitBtnText}>Sign In</Text>
              )}
            </Pressable>

            {/* Navigation Footers */}
            <Pressable onPress={() => router.push("/register")} testID="login-goto-register" style={styles.footerBtn}>
              <Text style={[styles.footerText, { color: theme.onSurfaceSecondary }]}>
                New restaurant? <Text style={styles.footerAccent}>Create account</Text>
              </Text>
            </Pressable>

            <Pressable onPress={() => router.push("/staff-login")} style={styles.staffBtn}>
              <Text style={[styles.staffText, { color: theme.onSurfaceSecondary }]}>
                Are you an employee? <Text style={styles.staffAccent}>Staff PIN Login</Text>
              </Text>
            </Pressable>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FF5E2B" },
  wrap: { flex: 1, backgroundColor: "#0D0D0D" },
  scrollContainer: { flexGrow: 1, backgroundColor: "#0D0D0D" },
  
  headerSection: {
    backgroundColor: "#FF5E2B",
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 48,
    paddingHorizontal: spacing.xl,
  },
  logoBox: {
    width: 76,
    height: 76,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  appTitle: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "bold",
    letterSpacing: -0.5,
  },
  appSubtitle: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 4,
  },

  cardSection: {
    flex: 1,
    backgroundColor: "#0D0D0D",
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    marginTop: -28,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: spacing.xxxl,
  },
  welcomeText: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "bold",
    letterSpacing: -0.5,
  },
  subtext: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: "500",
    marginTop: 6,
    marginBottom: 28,
  },
  
  field: { marginBottom: spacing.lg },
  label: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16161A",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2E2E38",
    position: "relative",
    height: 54,
  },
  inputIcon: { marginLeft: 16 },
  input: {
    flex: 1,
    paddingHorizontal: spacing.md,
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "500",
    height: "100%",
  },
  eyeBtn: {
    position: "absolute",
    right: 14,
    padding: 4,
  },

  errBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "rgba(239, 68, 68, 0.2)",
    borderWidth: 1,
    padding: spacing.md,
    borderRadius: 8,
    marginBottom: spacing.lg,
  },
  errText: { color: "#EF4444", fontSize: 13, flex: 1, fontWeight: "600" },
  
  submitBtn: {
    height: 54,
    borderRadius: 14,
    backgroundColor: "#FF5E2B",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
  },
  btnPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  submitBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 16 },

  footerBtn: { marginTop: 28, alignItems: "center" },
  footerText: { color: "#64748B", fontSize: 14, fontWeight: "500" },
  footerAccent: { color: "#FF5E2B", fontWeight: "700" },

  staffBtn: { marginTop: spacing.lg, alignItems: "center" },
  staffText: { color: "#64748B", fontSize: 13, fontWeight: "500" },
  staffAccent: { color: "#FF5E2B", fontWeight: "700" },

  forgotBtn: { alignSelf: "flex-end", marginTop: 4, marginBottom: 8 },
  forgotAccent: { color: "#FF5E2B", fontSize: 13, fontWeight: "600" },
});
