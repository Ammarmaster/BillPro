import { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView,
  Platform, ActivityIndicator, ScrollView, SafeAreaView, StatusBar, Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/lib/api";
import { spacing } from "@/src/theme";

export default function Register() {
  const [restaurantName, setRestaurantName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  const { register, refreshUser } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const submit = async () => {
    setErr(null);
    if (!restaurantName.trim() || !ownerName.trim() || !phone.trim() || !email.trim() || !password || !confirmPassword) {
      setErr("Please fill all fields.");
      return;
    }
    if (!termsAccepted) {
      setErr("You must agree to the Terms & Conditions and Privacy Policy.");
      return;
    }
    if (password.length < 6) {
      setErr("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setErr("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      // 1. Create the user owner account
      await register(email.trim(), password, ownerName.trim(), "owner", true);
      
      // 2. Automatically save the restaurant details
      await api.saveRestaurant({
        name: restaurantName.trim(),
        owner_name: ownerName.trim(),
        phone: phone.trim(),
        address: "",
        upi_id: "8152075375-2@ybl",
        merchant_name: restaurantName.trim(),
        gst_enabled: false,
      });

      // 3. Refresh user session to update tenant_id
      await refreshUser();
      
      // 4. Redirect directly to the dashboard
      router.replace("/(app)/dashboard");
    } catch (e: any) {
      setErr(e.message || "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0D0D0D" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.wrap}>
        <ScrollView contentContainerStyle={[styles.scrollContainer, { paddingTop: insets.top + 20 }]} showsVerticalScrollIndicator={false}>
          
          {/* Back Chevron */}
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12} testID="register-back-btn">
            <Ionicons name="chevron-back" size={24} color="#FF5E2B" />
          </Pressable>

          {/* Header Title section */}
          <View style={styles.header}>
            <Text style={styles.title}>Create account</Text>
            <Text style={styles.subtitle}>Start your 14-day free trial — no card required</Text>
          </View>

          {/* Form Content */}
          <View style={styles.form}>
            
            {/* RESTAURANT SECTION */}
            <Text style={styles.sectionHeader}>RESTAURANT</Text>
            
            <View style={styles.field}>
              <Text style={styles.label}>Restaurant Name</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="home-outline" size={20} color="#64748B" style={styles.inputIcon} />
                <TextInput
                  value={restaurantName}
                  onChangeText={setRestaurantName}
                  style={styles.input}
                  placeholder="Spice Garden"
                  placeholderTextColor="#475569"
                  autoCapitalize="words"
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Owner Name</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="person-outline" size={20} color="#64748B" style={styles.inputIcon} />
                <TextInput
                  value={ownerName}
                  onChangeText={setOwnerName}
                  style={styles.input}
                  placeholder="Rajesh Kumar"
                  placeholderTextColor="#475569"
                  autoCapitalize="words"
                  testID="register-name-input"
                />
              </View>
            </View>

            {/* CONTACT SECTION */}
            <Text style={[styles.sectionHeader, { marginTop: 12 }]}>CONTACT</Text>

            <View style={styles.field}>
              <Text style={styles.label}>Phone</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="call-outline" size={20} color="#64748B" style={styles.inputIcon} />
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  style={styles.input}
                  placeholder="+91 98765 43210"
                  placeholderTextColor="#475569"
                  keyboardType="phone-pad"
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="mail-outline" size={20} color="#64748B" style={styles.inputIcon} />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  style={styles.input}
                  placeholder="owner@yourplace.com"
                  placeholderTextColor="#475569"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  testID="register-email-input"
                />
              </View>
            </View>

            {/* SECURITY SECTION */}
            <Text style={[styles.sectionHeader, { marginTop: 12 }]}>SECURITY</Text>

            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={20} color="#64748B" style={styles.inputIcon} />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  style={[styles.input, { paddingRight: 44 }]}
                  placeholder="Min. 8 characters"
                  placeholderTextColor="#475569"
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
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color="#64748B"
                  />
                </Pressable>
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Confirm Password</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={20} color="#64748B" style={styles.inputIcon} />
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  style={[styles.input, { paddingRight: 44 }]}
                  placeholder="Re-enter password"
                  placeholderTextColor="#475569"
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                />
                <Pressable
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={styles.eyeBtn}
                  hitSlop={10}
                >
                  <Ionicons
                    name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color="#64748B"
                  />
                </Pressable>
              </View>
            </View>

            {/* Terms & Conditions Checkbox */}
            <Pressable
              style={styles.termsRow}
              onPress={() => setTermsAccepted(!termsAccepted)}
            >
              <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
                {termsAccepted && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
              </View>
              <Text style={styles.termsText}>
                I agree to the{" "}
                <Text style={styles.termsLink} onPress={() => setShowTermsModal(true)}>
                  Terms & Conditions
                </Text>{" "}
                and{" "}
                <Text style={styles.termsLink} onPress={() => setShowPrivacyModal(true)}>
                  Privacy Policy
                </Text>
              </Text>
            </Pressable>

            {/* Error Message */}
            {err && (
              <View style={styles.errBox}>
                <Ionicons name="alert-circle-outline" size={18} color="#EF4444" style={{ marginRight: 8 }} />
                <Text style={styles.errText} testID="register-error">{err}</Text>
              </View>
            )}

            {/* Create Button */}
            <Pressable
              style={({ pressed }) => [styles.submitBtn, pressed && styles.btnPressed, busy && { opacity: 0.7 }]}
              onPress={submit}
              disabled={busy}
              testID="register-submit-btn"
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitBtnText}>Create Account & Start Trial</Text>
              )}
            </Pressable>

            {/* Footer Signin Link */}
            <Pressable onPress={() => router.push("/login")} testID="register-goto-login" style={styles.footerBtn}>
              <Text style={styles.footerText}>
                Already have an account? <Text style={styles.footerAccent}>Sign in</Text>
              </Text>
            </Pressable>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Terms Modal */}
      <Modal visible={showTermsModal} animationType="slide" transparent>
        <SafeAreaView style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Terms & Conditions</Text>
              <Pressable onPress={() => setShowTermsModal(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color="#94A3B8" />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalScroll}>
              <Text style={styles.modalText}>
                Welcome to EzBill Restaurant ERP. By creating an account, you agree to these terms:{"\n\n"}
                1. Service: We provide billing, KOT management, and analytics features.{"\n\n"}
                2. Subscription: The service is offered on a trial and paid monthly/yearly basis. Plans renew automatically unless cancelled.{"\n\n"}
                3. Data: We store your restaurant menu, sales, and employee accounts securely. We are not responsible for user-deleted data.{"\n\n"}
                4. Local Operations: High-speed local POS cache is provided, but cloud sync requires active internet connectivity.{"\n\n"}
                5. Compliance: You agree to comply with all local GST regulations and licensing terms.
              </Text>
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Privacy Policy Modal */}
      <Modal visible={showPrivacyModal} animationType="slide" transparent>
        <SafeAreaView style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Privacy Policy</Text>
              <Pressable onPress={() => setShowPrivacyModal(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color="#94A3B8" />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalScroll}>
              <Text style={styles.modalText}>
                Your privacy is important to us. Here is how we handle your information:{"\n\n"}
                1. Information Collection: We collect your name, email, phone number, and restaurant metadata.{"\n\n"}
                2. Usage: Collected data is strictly used to run the EzBill POS system, sync KOT, and process orders.{"\n\n"}
                3. Security: We use industry-standard encryption to protect access credentials and billing data.{"\n\n"}
                4. Third Parties: Payment processing is handled securely by Razorpay. We do not sell your data to advertisers.
              </Text>
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0D0D0D" },
  wrap: { flex: 1, backgroundColor: "#0D0D0D" },
  scrollContainer: { flexGrow: 1, paddingHorizontal: 24, backgroundColor: "#0D0D0D", paddingBottom: spacing.xxxl },

  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  header: {
    marginBottom: 28,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "bold",
    letterSpacing: -0.5,
  },
  subtitle: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: "500",
    marginTop: 8,
    lineHeight: 20,
  },

  form: {
    flex: 1,
  },
  sectionHeader: {
    color: "#FF5E2B",
    fontSize: 11,
    fontWeight: "bold",
    letterSpacing: 1.5,
    marginBottom: 16,
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

  // Terms Checkbox Styles
  termsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.lg,
    paddingHorizontal: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#2E2E38",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
    backgroundColor: "#16161A",
  },
  checkboxChecked: {
    backgroundColor: "#FF5E2B",
    borderColor: "#FF5E2B",
  },
  termsText: {
    color: "#94A3B8",
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  termsLink: {
    color: "#FF5E2B",
    fontWeight: "700",
    textDecorationLine: "underline",
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#16161A",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: "80%",
    borderColor: "#2E2E38",
    borderWidth: 1,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#2E2E38",
    paddingBottom: 12,
  },
  modalTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "bold",
  },
  modalScroll: {
    paddingBottom: 40,
  },
  modalText: {
    color: "#94A3B8",
    fontSize: 14,
    lineHeight: 22,
  },
});
