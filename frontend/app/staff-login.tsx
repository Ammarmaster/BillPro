import { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView,
  Platform, ActivityIndicator, ScrollView, SafeAreaView, StatusBar,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { spacing, radius } from "@/src/theme";

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
      <StatusBar barStyle="light-content" backgroundColor="#FF5E2B" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.wrap}>
        <ScrollView contentContainerStyle={styles.scrollContainer} bounces={false} showsVerticalScrollIndicator={false}>
          
          {/* Solid Orange Header Section */}
          <View style={[styles.headerSection, { paddingTop: insets.top + spacing.md }]}>
            {/* Cutlery Plate Logo box */}
            <View style={styles.logoBox}>
              <Ionicons name="restaurant" size={32} color="#FF5E2B" />
            </View>
            <Text style={styles.appTitle}>ProDevOpz ERP</Text>
            <Text style={styles.appSubtitle}>Staff Portal</Text>
          </View>

          {/* Dark Bottom Card Section */}
          <View style={styles.cardSection}>
            <Text style={styles.welcomeText}>Employee Sign In</Text>
            <Text style={styles.subtext}>Enter your registered business phone and PIN</Text>

            {/* Phone Field */}
            <View style={styles.field}>
              <Text style={styles.label}>Business Phone</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="call-outline" size={20} color="#64748B" style={styles.inputIcon} />
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  style={styles.input}
                  placeholder="+91 98765 43210"
                  placeholderTextColor="#475569"
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                  testID="staff-phone-input"
                />
              </View>
            </View>

            {/* PIN Field */}
            <View style={styles.field}>
              <Text style={styles.label}>Employee PIN (4-6 digits)</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={20} color="#64748B" style={styles.inputIcon} />
                <TextInput
                  value={pin}
                  onChangeText={setPin}
                  style={styles.input}
                  placeholder="••••••"
                  placeholderTextColor="#475569"
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

            {/* Error Message */}
            {err && (
              <View style={styles.errBox}>
                <Ionicons name="alert-circle-outline" size={18} color="#EF4444" style={{ marginRight: 8 }} />
                <Text style={styles.errText} testID="staff-error">{err}</Text>
              </View>
            )}

            {/* Submit Button */}
            <Pressable
              style={({ pressed }) => [styles.submitBtn, pressed && styles.btnPressed, busy && { opacity: 0.7 }]}
              onPress={submit}
              disabled={busy}
              testID="staff-submit-btn"
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitBtnText}>Sign In</Text>
              )}
            </Pressable>

            {/* Navigation Footers */}
            <Pressable onPress={() => router.push("/login")} style={styles.footerBtn}>
              <Text style={styles.footerText}>
                Are you an owner? <Text style={styles.footerAccent}>Business Login</Text>
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
  wrap: { flex: 1, backgroundColor: "#111111" },
  scrollContainer: { flexGrow: 1, backgroundColor: "#111111" },
  
  headerSection: {
    backgroundColor: "#FF5E2B",
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  logoBox: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.md,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  appTitle: {
    color: "#FFFFFF",
    fontSize: 26,
    fontWeight: "800",
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
    backgroundColor: "#111111",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: -20,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxxl,
  },
  welcomeText: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  subtext: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: "500",
    marginTop: 4,
    marginBottom: spacing.xl,
  },
  
  field: { marginBottom: spacing.lg },
  label: {
    color: "#94A3B8",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1C1C21",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#2E2E38",
  },
  inputIcon: { marginLeft: spacing.md },
  input: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    color: "#FFFFFF",
    fontSize: 15,
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
    backgroundColor: "#1C1C21",
    borderWidth: 1,
    borderColor: "#2E2E38",
  },
  pinDotFilled: {
    backgroundColor: "#FF5E2B",
    borderColor: "#FF5E2B",
  },

  errBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "rgba(239, 68, 68, 0.2)",
    borderWidth: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
  },
  errText: { color: "#EF4444", fontSize: 13, flex: 1, fontWeight: "600" },
  
  submitBtn: {
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: "#FF5E2B",
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing.md,
    shadowColor: "#FF5E2B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  btnPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  submitBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 16 },

  footerBtn: { marginTop: spacing.xl, alignItems: "center" },
  footerText: { color: "#64748B", fontSize: 14, fontWeight: "500" },
  footerAccent: { color: "#FF5E2B", fontWeight: "700" },
});
