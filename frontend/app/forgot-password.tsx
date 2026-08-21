import { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView,
  Platform, ActivityIndicator, ScrollView, SafeAreaView, StatusBar, Alert
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/context/ThemeContext";
import { spacing, radius } from "@/src/theme";

// Helper to handle API requests manually to avoid changing AuthContext
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || "https://billpro-g1th.onrender.com";

export default function ForgotPassword() {
  const { theme, isDark } = useTheme();
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleRequestPin = async () => {
    if (!email.trim()) {
      setErr("Please enter your email address");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to send verification code");
      }
      Alert.alert("Code Sent", "A 6-digit verification code has been sent to your email.");
      setStep(2);
    } catch (e: any) {
      setErr(e.message || "An error occurred");
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async () => {
    if (!pin.trim() || pin.length !== 6) {
      setErr("Please enter the 6-digit verification code");
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setErr("Password must be at least 6 characters long");
      return;
    }
    if (newPassword !== confirmPassword) {
      setErr("Passwords do not match");
      return;
    }

    setErr(null);
    setBusy(true);
    try {
      // 1. Verify OTP to get secure reset token
      const verifyRes = await fetch(`${BACKEND_URL}/api/auth/verify-reset-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          otp: pin.trim(),
        }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        throw new Error(verifyData.detail || "Invalid or expired verification code");
      }
      
      const resetToken = verifyData.reset_token;

      // 2. Perform password reset using the token
      const resetRes = await fetch(`${BACKEND_URL}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          reset_token: resetToken,
          new_password: newPassword,
        }),
      });
      const resetData = await resetRes.json();
      if (!resetRes.ok) {
        throw new Error(resetData.detail || "Failed to reset password");
      }
      
      Alert.alert("Success", "Your password has been reset successfully. You can now log in.", [
        { text: "OK", onPress: () => router.replace("/login") }
      ]);
    } catch (e: any) {
      setErr(e.message || "An error occurred");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: isDark ? theme.surface : "#FF5E2B" }]}>
      <StatusBar barStyle={isDark ? "light-content" : "light-content"} backgroundColor={isDark ? theme.surface : "#FF5E2B"} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[styles.wrap, { backgroundColor: theme.surface }]}>
        <ScrollView contentContainerStyle={[styles.scrollContainer, { backgroundColor: theme.surface }]} bounces={false} showsVerticalScrollIndicator={false}>
          
          {/* Header Section */}
          <View style={[styles.headerSection, { paddingTop: insets.top + 24, backgroundColor: isDark ? theme.surface : "#FF5E2B" }]}>
            <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={15}>
              <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
            </Pressable>
            <Text style={styles.appTitle}>Forgot Password</Text>
            <Text style={styles.appSubtitle}>Reset your access credentials</Text>
          </View>

          {/* Bottom Card Section */}
          <View style={[styles.cardSection, { backgroundColor: theme.surface }]}>
            {step === 1 ? (
              <>
                <Text style={[styles.welcomeText, { color: theme.onSurface }]}>Verify your Email</Text>
                <Text style={[styles.subtext, { color: theme.onSurfaceSecondary }]}>Enter your email address to receive a 6-digit reset code.</Text>

                {/* Email Field */}
                <View style={styles.field}>
                  <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Email Address</Text>
                  <View style={[styles.inputWrapper, { backgroundColor: isDark ? "#16161A" : "#F8FAFC", borderColor: theme.border }]}>
                    <Ionicons name="mail-outline" size={20} color={isDark ? "#64748B" : "#94A3B8"} style={styles.inputIcon} />
                    <TextInput
                      value={email}
                      onChangeText={setEmail}
                      style={[styles.input, { color: theme.onSurface }]}
                      placeholder="owner@yourplace.com"
                      placeholderTextColor={isDark ? "#475569" : "#94A3B8"}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                </View>

                {err && (
                  <View style={styles.errBox}>
                    <Ionicons name="alert-circle-outline" size={18} color="#EF4444" style={{ marginRight: 8 }} />
                    <Text style={styles.errText}>{err}</Text>
                  </View>
                )}

                <Pressable
                  style={({ pressed }) => [styles.submitBtn, { backgroundColor: theme.brand }, pressed && styles.btnPressed, busy && { opacity: 0.7 }]}
                  onPress={handleRequestPin}
                  disabled={busy}
                >
                  {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitBtnText}>Send Verification Code</Text>}
                </Pressable>
              </>
            ) : (
              <>
                <Text style={[styles.welcomeText, { color: theme.onSurface }]}>Set New Password</Text>
                <Text style={[styles.subtext, { color: theme.onSurfaceSecondary }]}>Enter the 6-digit code sent to {email} and choose a new password.</Text>

                {/* PIN Code Field */}
                <View style={styles.field}>
                  <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Verification Code</Text>
                  <View style={[styles.inputWrapper, { backgroundColor: isDark ? "#16161A" : "#F8FAFC", borderColor: theme.border }]}>
                    <Ionicons name="key-outline" size={20} color={isDark ? "#64748B" : "#94A3B8"} style={styles.inputIcon} />
                    <TextInput
                      value={pin}
                      onChangeText={setPin}
                      style={[styles.input, { color: theme.onSurface }]}
                      placeholder="123456"
                      placeholderTextColor={isDark ? "#475569" : "#94A3B8"}
                      keyboardType="number-pad"
                      maxLength={6}
                      autoCapitalize="none"
                    />
                  </View>
                </View>

                {/* New Password Field */}
                <View style={styles.field}>
                  <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>New Password</Text>
                  <View style={[styles.inputWrapper, { backgroundColor: isDark ? "#16161A" : "#F8FAFC", borderColor: theme.border }]}>
                    <Ionicons name="lock-closed-outline" size={20} color={isDark ? "#64748B" : "#94A3B8"} style={styles.inputIcon} />
                    <TextInput
                      value={newPassword}
                      onChangeText={setNewPassword}
                      style={[styles.input, { paddingRight: 44, color: theme.onSurface }]}
                      placeholder="••••••••"
                      placeholderTextColor={isDark ? "#475569" : "#94A3B8"}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                    />
                    <Pressable
                      onPress={() => setShowPassword(!showPassword)}
                      style={styles.eyeBtn}
                      hitSlop={10}
                    >
                      <Ionicons
                        name={showPassword ? "eye-off-outline" : "eye-outline"}
                        size={20}
                        color={isDark ? "#64748B" : "#94A3B8"}
                      />
                    </Pressable>
                  </View>
                </View>

                {/* Confirm Password Field */}
                <View style={styles.field}>
                  <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Confirm New Password</Text>
                  <View style={[styles.inputWrapper, { backgroundColor: isDark ? "#16161A" : "#F8FAFC", borderColor: theme.border }]}>
                    <Ionicons name="lock-closed-outline" size={20} color={isDark ? "#64748B" : "#94A3B8"} style={styles.inputIcon} />
                    <TextInput
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      style={[styles.input, { color: theme.onSurface }]}
                      placeholder="••••••••"
                      placeholderTextColor={isDark ? "#475569" : "#94A3B8"}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                    />
                  </View>
                </View>

                {err && (
                  <View style={styles.errBox}>
                    <Ionicons name="alert-circle-outline" size={18} color="#EF4444" style={{ marginRight: 8 }} />
                    <Text style={styles.errText}>{err}</Text>
                  </View>
                )}

                <Pressable
                  style={({ pressed }) => [styles.submitBtn, { backgroundColor: theme.brand }, pressed && styles.btnPressed, busy && { opacity: 0.7 }]}
                  onPress={handleResetPassword}
                  disabled={busy}
                >
                  {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitBtnText}>Reset Password</Text>}
                </Pressable>

                <Pressable onPress={() => setStep(1)} style={styles.backLink}>
                  <Text style={[styles.backLinkText, { color: theme.brand }]}>Resend code / Change email</Text>
                </Pressable>
              </>
            )}
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
    position: "relative",
  },
  backBtn: {
    position: "absolute",
    left: 20,
    top: 24,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  appTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "bold",
    letterSpacing: -0.5,
  },
  appSubtitle: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 13,
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
    fontSize: 24,
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
    marginTop: 16,
  },
  btnPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  submitBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 16 },

  backLink: { marginTop: 24, alignItems: "center" },
  backLinkText: { color: "#FF5E2B", fontSize: 14, fontWeight: "600" },
});
