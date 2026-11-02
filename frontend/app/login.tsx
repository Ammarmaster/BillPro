import { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView,
  Platform, ActivityIndicator, ScrollView, StatusBar,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/context/ThemeContext";
import { useResponsive } from "@/src/hooks/useResponsive";
import { spacing } from "@/src/theme";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const { theme, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { resetSuccess } = useLocalSearchParams<{ resetSuccess?: string }>();
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (resetSuccess === "true") {
      setShowSuccessBanner(true);
      const timer = setTimeout(() => {
        setShowSuccessBanner(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [resetSuccess]);

  const submit = async () => {
    setErr(null);
    if (!email.trim() || !password) {
      setErr("Please enter your email or mobile number and password.");
      return;
    }
    setBusy(true);
    try {
      const u = await login(email.trim(), password);
      if (u?.role === "waiter") {
        router.replace("/(app)/waiter");
      } else if (u?.role === "kitchen") {
        router.replace("/(app)/kitchen");
      } else {
        router.replace("/(app)/dashboard");
      }
    } catch (e: any) {
      setErr(e.message || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  const forgotStyle = { color: "#FF5E2B", fontSize: 13, fontWeight: "600" as const };

  return (
    <View style={[styles.safe, { backgroundColor: isDesktop ? "#0A0A0E" : "#0D0D0D" }]}>
      <StatusBar barStyle="light-content" backgroundColor="#FF5E2B" />
      {/* Top orange status bar backdrop for iOS & overscroll */}
      {!isDesktop && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: insets.top + 160, backgroundColor: "#FF5E2B" }} />
      )}
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : undefined} 
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
        style={[styles.wrap, { backgroundColor: isDesktop ? "#0A0A0E" : "#0D0D0D" }]}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={[
            styles.scrollContainer,
            {
              backgroundColor: isDesktop ? "#0A0A0E" : "#0D0D0D",
              alignItems: isDesktop ? "center" : undefined,
              justifyContent: isDesktop ? "center" : undefined,
              paddingVertical: isDesktop ? 48 : 0,
              paddingBottom: isDesktop ? 48 : Math.max(insets.bottom, 24) + 20,
            },
          ]}
          bounces={false}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={[{ flex: 1, backgroundColor: "#0D0D0D" }, isDesktop && styles.desktopCardWrapper]}>
            {/* Solid Orange Header Section */}
            <View style={[styles.headerSection, { paddingTop: isDesktop ? 36 : insets.top + 32, backgroundColor: "#FF5E2B" }]}>
              {/* Cutlery Plate Logo box */}
              <View style={[styles.logoBox, { backgroundColor: "rgba(255, 255, 255, 0.2)" }]}>
                <Ionicons name="restaurant" size={34} color="#FFFFFF" />
              </View>
              <Text style={styles.appTitle}>ProDevOpz ERP</Text>
              <Text style={styles.appSubtitle}>Restaurant Management Platform</Text>
            </View>

            {/* Dark Bottom Card Section */}
            <View style={[styles.cardSection, { backgroundColor: "#0D0D0D" }]}>
              <Text style={styles.welcomeText}>Welcome back</Text>
              <Text style={styles.subtext}>Sign in to manage your restaurant</Text>

              {/* Success Banner */}
              {showSuccessBanner && (
                <View style={styles.successBanner}>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#10B981" style={{ marginRight: 8 }} />
                  <Text style={styles.successBannerText}>
                    Password reset successfully. Please log in with your new password.
                  </Text>
                </View>
              )}

              {/* Email or Mobile Number Field */}
              <View style={styles.field}>
                <Text style={styles.label}>Email or Mobile Number</Text>
                <View style={[styles.inputWrapper, { backgroundColor: "#16161A", borderColor: "#2E2E38" }]}>
                  <Ionicons 
                    name={email.trim() && !email.includes("@") && /^\+?[0-9\s-]+$/.test(email.trim()) ? "call-outline" : "mail-outline"} 
                    size={20} 
                    color="#94A3B8" 
                    style={styles.inputIcon} 
                  />
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    style={[styles.input, { color: "#FFFFFF" }]}
                    placeholder="email/phone"
                    placeholderTextColor="#64748B"
                    keyboardType="default"
                    autoCapitalize="none"
                    autoCorrect={false}
                    numberOfLines={1}
                    testID="login-email-input"
                  />
                </View>
              </View>

              {/* Password Field */}
              <View style={styles.field}>
                <Text style={styles.label}>Password</Text>
                <View style={[styles.inputWrapper, { backgroundColor: "#16161A", borderColor: "#2E2E38" }]}>
                  <Ionicons name="lock-closed-outline" size={20} color="#94A3B8" style={styles.inputIcon} />
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    style={[styles.input, { color: "#FFFFFF" }]}
                    placeholder="••••••••"
                    placeholderTextColor="#64748B"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    numberOfLines={1}
                    onFocus={() => {
                      setTimeout(() => {
                        scrollViewRef.current?.scrollTo({ y: 160, animated: true });
                      }, 150);
                    }}
                    testID="login-password-input"
                  />
                  <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                    <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#94A3B8" />
                  </Pressable>
                </View>
              </View>

              {/* Forgot Password Link */}
              <Pressable onPress={() => router.push("/forgot-password")} style={styles.forgotBtn}>
                <Text style={forgotStyle}>Forgot Password?</Text>
              </Pressable>

              {/* Error Box */}
              {err && (
                <View style={styles.errBox}>
                  <Ionicons name="alert-circle-outline" size={18} color="#EF4444" style={{ marginRight: 6 }} />
                  <Text style={styles.errText}>{err}</Text>
                </View>
              )}

              {/* Sign In Button */}
              <Pressable
                onPress={submit}
                disabled={busy}
                style={({ pressed }) => [styles.submitBtn, pressed && styles.btnPressed]}
                testID="login-submit-btn"
              >
                {busy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitBtnText}>Sign In</Text>
                )}
              </Pressable>

              {/* Footer Register Link */}
              <Pressable onPress={() => router.push("/register")} style={styles.footerBtn}>
                <Text style={styles.footerText}>
                  New restaurant? <Text style={styles.footerAccent}>Create account</Text>
                </Text>
              </Pressable>

              <Pressable onPress={() => router.push("/staff-login")} style={styles.staffBtn}>
                <Text style={styles.staffText}>
                  Are you an employee? <Text style={styles.staffAccent}>Staff PIN Login</Text>
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0D0D0D" },
  wrap: { flex: 1, backgroundColor: "#0D0D0D" },
  scrollContainer: { flexGrow: 1, backgroundColor: "#0D0D0D" },
  desktopCardWrapper: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#2E2E38",
    backgroundColor: "#0D0D0D",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 8,
  },
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
    minHeight: 480,
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
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderColor: "rgba(16, 185, 129, 0.2)",
    borderWidth: 1.5,
    padding: spacing.md,
    borderRadius: 14,
    marginBottom: spacing.lg,
  },
  successBannerText: {
    color: "#10B981",
    fontSize: 13,
    flex: 1,
    fontWeight: "600",
  },
});
