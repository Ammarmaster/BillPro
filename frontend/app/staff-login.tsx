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
    if (!phone.trim() || pin.length < 4) { setErr("Enter business phone and 4-6 digit PIN."); return; }
    setBusy(true);
    try {
      await staffLogin(phone.trim(), pin.trim());
      router.replace("/(app)/waiter");
    } catch (e: any) {
      setErr(e.message || "Login failed");
    } finally { setBusy(false); }
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
              <Pressable onPress={() => router.back()} testID="staff-back-btn" style={styles.backBtn} hitSlop={12}>
                <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
              </Pressable>
              <View style={styles.topBrand}>
                <Ionicons name="people" size={14} color={colors.brand} style={{ marginRight: 2 }} />
                <Text style={styles.topBrandText}>Staff Portal</Text>
              </View>
            </View>

            {/* Login Card */}
            <View style={styles.card}>
              <View style={styles.logoBadgeOuter}>
                <LinearGradient
                  colors={["#818CF8", "#635BFF", "#4F46E5"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.logoBadge}
                >
                  <Ionicons name="keypad" size={22} color="#FFFFFF" />
                </LinearGradient>
              </View>

              <Text style={styles.title}>Staff Sign In</Text>
              <Text style={styles.subtitle}>Enter the registered business phone and your waiter/kitchen PIN.</Text>

              {/* Phone Input Field */}
              <View style={styles.field}>
                <Text style={styles.label}>BUSINESS PHONE</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="call-outline" size={18} color={colors.onSurfaceSecondary} style={styles.inputIcon} />
                  <TextInput
                    value={phone}
                    onChangeText={setPhone}
                    style={styles.input}
                    placeholder="9876543210"
                    placeholderTextColor={colors.onSurfaceTertiary}
                    keyboardType="phone-pad"
                    autoCapitalize="none"
                    testID="staff-phone-input"
                  />
                </View>
              </View>

              {/* PIN Input Field */}
              <View style={styles.field}>
                <Text style={styles.label}>STAFF PIN (4 - 6 DIGITS)</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="lock-closed-outline" size={18} color={colors.onSurfaceSecondary} style={styles.inputIcon} />
                  <TextInput
                    value={pin}
                    onChangeText={setPin}
                    style={styles.input}
                    placeholder="••••••"
                    placeholderTextColor={colors.onSurfaceTertiary}
                    keyboardType="number-pad"
                    maxLength={6}
                    secureTextEntry
                    testID="staff-pin-input"
                  />
                </View>

                {/* Visual PIN Dots Indicator */}
                <View style={styles.pinIndicatorRow}>
                  {[0, 1, 2, 3, 4, 5].map((idx) => {
                    const isFilled = pin.length > idx;
                    return (
                      <View
                        key={idx}
                        style={[
                          styles.pinDot,
                          isFilled && styles.pinDotFilled,
                        ]}
                      />
                    );
                  })}
                </View>
              </View>

              {/* Error Box */}
              {err && (
                <View style={styles.errBox}>
                  <Ionicons name="alert-circle" size={18} color="#DC2626" style={{ marginRight: 8 }} />
                  <Text style={styles.errText} testID="staff-error">{err}</Text>
                </View>
              )}

              {/* Submit Button */}
              <Pressable
                style={({ pressed }) => [styles.primaryBtnContainer, pressed && styles.btnPressed, busy && { opacity: 0.7 }]}
                onPress={submit}
                disabled={busy}
                testID="staff-submit-btn"
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
                      <Text style={styles.primaryText}>Sign In</Text>
                      <Ionicons name="arrow-forward" size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />
                    </View>
                  )}
                </LinearGradient>
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
  pinIndicatorRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginTop: spacing.lg,
  },
  pinDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pinDotFilled: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 2,
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
  primaryText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15, letterSpacing: 0.3 }
});
