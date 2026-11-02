import { useState } from "react";
import {
  View, StyleSheet, Pressable, ScrollView, SafeAreaView, Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/lib/api";
import {
  Display,
  Mono,
  ReceiptButton,
  ReceiptField,
  ReceiptFormShell,
  ReceiptNotice,
  ReceiptRule,
  receipt,
} from "@/src/components/ReceiptKit";

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
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [analyticsConsent, setAnalyticsConsent] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  const { register, refreshUser } = useAuth();
  const router = useRouter();

  const submit = async () => {
    setErr(null);
    if (!restaurantName.trim() || !ownerName.trim() || !phone.trim() || !email.trim() || !password || !confirmPassword) {
      setErr("Please fill all fields.");
      return;
    }
    if (!termsAccepted || !privacyConsent) {
      setErr("You must agree to the Terms & Conditions and Privacy Notice.");
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
      // 1. Create the user owner account with phone
      await register(email.trim(), password, ownerName.trim(), "owner", true, privacyConsent, marketingConsent, phone.trim());
      
      // If analytics consent was selected, update it
      if (analyticsConsent) {
        api.updateConsent("ANALYTICS_CONSENT", "accepted").catch(() => {});
      }
      
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
      
      // 4. Redirect to interactive demo playground with registered welcome context!
      router.replace("/demo-billing?registered=1");
    } catch (e: any) {
      setErr(e.message || "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  const consentRows = [
    {
      checked: termsAccepted,
      toggle: () => setTermsAccepted(!termsAccepted),
      text: (
        <Mono style={styles.termsText}>
          I agree to the{" "}
          <Mono style={styles.termsLink} onPress={() => setShowTermsModal(true)}>
            Terms and Conditions *
          </Mono>
        </Mono>
      ),
    },
    {
      checked: privacyConsent,
      toggle: () => setPrivacyConsent(!privacyConsent),
      text: (
        <Mono style={styles.termsText}>
          I acknowledge the{" "}
          <Mono style={styles.termsLink} onPress={() => setShowPrivacyModal(true)}>
            Privacy Notice and Data Processing Consent *
          </Mono>
        </Mono>
      ),
    },
    {
      checked: marketingConsent,
      toggle: () => setMarketingConsent(!marketingConsent),
      text: <Mono style={styles.termsText}>I consent to receive marketing and promotional updates (optional)</Mono>,
    },
    {
      checked: analyticsConsent,
      toggle: () => setAnalyticsConsent(!analyticsConsent),
      text: (
        <Mono style={styles.termsText}>
          I agree to share anonymous product telemetry to help improve app reliability (optional)
        </Mono>
      ),
    },
  ];

  return (
    <>
      <ReceiptFormShell
        subtitle="New account"
        title="Create account"
        description="Create your business account to get started"
        onBack={() => router.back()}
        maxWidth={520}
      >
        <Mono style={styles.sectionHeader}>Restaurant</Mono>
        <ReceiptField
          label="Restaurant name"
          icon="home-outline"
          value={restaurantName}
          onChangeText={setRestaurantName}
          placeholder="Spice Garden"
          autoCapitalize="words"
        />
        <ReceiptField
          label="Owner name"
          icon="person-outline"
          value={ownerName}
          onChangeText={setOwnerName}
          placeholder="Rajesh Kumar"
          autoCapitalize="words"
          testID="register-name-input"
        />

        <ReceiptRule style={styles.rule} />
        <Mono style={styles.sectionHeader}>Contact</Mono>
        <ReceiptField
          label="Phone"
          icon="call-outline"
          value={phone}
          onChangeText={setPhone}
          placeholder="+91 98765 43210"
          keyboardType="phone-pad"
        />
        <ReceiptField
          label="Email"
          icon="mail-outline"
          value={email}
          onChangeText={setEmail}
          placeholder="owner@yourplace.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          testID="register-email-input"
        />

        <ReceiptRule style={styles.rule} />
        <Mono style={styles.sectionHeader}>Security</Mono>
        <ReceiptField
          label="Password"
          icon="lock-closed-outline"
          value={password}
          onChangeText={setPassword}
          placeholder="Min. 8 characters"
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          testID="register-password-input"
          right={
            <Pressable
              onPress={() => setShowPassword(!showPassword)}
              style={styles.eyeBtn}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? "Hide password" : "Show password"}
            >
              <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={receipt.muted} />
            </Pressable>
          }
        />
        <ReceiptField
          label="Confirm password"
          icon="lock-closed-outline"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Re-enter password"
          secureTextEntry={!showConfirmPassword}
          autoCapitalize="none"
          right={
            <Pressable
              onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              style={styles.eyeBtn}
              accessibilityRole="button"
              accessibilityLabel={showConfirmPassword ? "Hide password" : "Show password"}
            >
              <Ionicons name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} size={20} color={receipt.muted} />
            </Pressable>
          }
        />

        <ReceiptRule style={styles.rule} />
        {consentRows.map((row, idx) => (
          <Pressable
            key={idx}
            style={styles.termsRow}
            onPress={row.toggle}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: row.checked }}
          >
            <View style={[styles.checkbox, row.checked && styles.checkboxChecked]}>
              {row.checked && <Ionicons name="checkmark" size={14} color={receipt.paper} />}
            </View>
            {row.text}
          </Pressable>
        ))}

        {err && <ReceiptNotice text={err} testID="register-error" />}

        <ReceiptButton
          label="Create account"
          onPress={submit}
          busy={busy}
          disabled={!termsAccepted || !privacyConsent}
          style={styles.submit}
          testID="register-submit-btn"
        />

        <Pressable onPress={() => router.push("/login")} testID="register-goto-login" style={styles.link}>
          <Mono style={styles.linkText}>
            Already have an account? <Mono style={styles.linkAccent}>Sign in</Mono>
          </Mono>
        </Pressable>
      </ReceiptFormShell>

      {/* Terms Modal */}
      <Modal visible={showTermsModal} animationType="slide" transparent>
        <SafeAreaView style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Display style={styles.modalTitle}>Terms and Conditions</Display>
              <Pressable onPress={() => setShowTermsModal(false)} style={styles.eyeBtn} accessibilityLabel="Close">
                <Ionicons name="close" size={24} color={receipt.ink} />
              </Pressable>
            </View>
            <ReceiptRule />
            <ScrollView contentContainerStyle={styles.modalScroll}>
              <Mono style={styles.modalText}>
                Welcome to EzBill Restaurant ERP (ProDevOpz Solutions). By creating an account, you agree to these legally binding terms:{"\n\n"}
                1. Scope of Service: We provide billing POS, kitchen order routing (KOT), thermal printer synchronization, menu management, and sales reporting software for restaurants.{"\n\n"}
                2. User Obligations: You are responsible for maintaining confidentiality of all waiter PINs, owner login credentials, and billing data. You agree not to misuse the platform for unauthorized purposes.{"\n\n"}
                3. Subscriptions & Billing: Paid tiers auto-renew based on chosen monthly or yearly periods. AutoPay recurring mandates may be cancelled anytime with 1-click in the app or through your bank portal prior to renewal. Active pre-paid periods are non-refundable.{"\n\n"}
                4. Statutory Tax Compliance: You are solely responsible for setting accurate GST rates and verifying tax invoices generated for your guests in compliance with applicable Indian GST laws.{"\n\n"}
                5. Limitation of Liability: EzBill is provided on an "as-is" and "as-available" basis. ProDevOpz Solutions is not liable for indirect losses, network outages, or hardware printer failures.{"\n\n"}
                6. Governing Law & Dispute Resolution: These terms are governed by the laws of India. Any disputes shall be subject to arbitration in accordance with the Arbitration and Conciliation Act, 1996.
              </Mono>
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Privacy Policy Modal */}
      <Modal visible={showPrivacyModal} animationType="slide" transparent>
        <SafeAreaView style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Display style={styles.modalTitle}>Privacy and DPDP notice</Display>
              <Pressable onPress={() => setShowPrivacyModal(false)} style={styles.eyeBtn} accessibilityLabel="Close">
                <Ionicons name="close" size={24} color={receipt.ink} />
              </Pressable>
            </View>
            <ReceiptRule />
            <ScrollView contentContainerStyle={styles.modalScroll}>
              <Mono style={styles.modalText}>
                Notice under the Digital Personal Data Protection (DPDP) Act, 2023 & DPDP Rules 2025:{"\n\n"}
                1. Data Collected: We collect your name, email, phone number, restaurant metadata, menu details, waiter profiles, and billing logs to provide the ERP service.{"\n\n"}
                2. Purpose of Processing: Data is processed strictly to maintain restaurant operations, sync orders in real time, generate tax-compliant bills, and handle customer support.{"\n\n"}
                3. Sub-Processors: We use Razorpay (secure PCI-DSS payment gateway), Brevo (transactional OTP delivery), Expo (push notifications), Google Gemini (AI menu OCR), and MongoDB Atlas (encrypted database). We never sell your data to advertisers.{"\n\n"}
                4. Data Retention & Erasure: You may exercise your DPDP Right to Erasure / Account Deletion at any time. When deleted, personal identifiers are erased; historical invoices are anonymized and retained strictly under statutory Section 36 CGST Act requirements (72-month tax audit hold).{"\n\n"}
                5. Grievance Redressal: For any DPDP or data inquiries, contact our designated Grievance Officer at contactprodevopz@gmail.com. We acknowledge complaints within 48 hours and resolve them within statutory timelines.
              </Mono>
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    fontSize: 13,
    fontWeight: "700",
    color: receipt.accent,
    marginBottom: 12,
  },
  rule: {
    marginTop: 6,
    marginBottom: 16,
  },
  eyeBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  termsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    minHeight: 44,
    paddingVertical: 6,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: receipt.ink,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: receipt.paper,
  },
  checkboxChecked: {
    backgroundColor: receipt.ink,
  },
  termsText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
  },
  termsLink: {
    fontSize: 13,
    fontWeight: "700",
    color: receipt.accent,
    textDecorationLine: "underline",
  },
  submit: {
    marginTop: 12,
  },
  link: {
    minHeight: 44,
    marginTop: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  linkText: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    color: receipt.muted,
  },
  linkAccent: {
    fontSize: 13,
    fontWeight: "700",
    color: receipt.accent,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(31, 31, 31, 0.72)",
    justifyContent: "flex-end",
  },
  modalContent: {
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
    backgroundColor: receipt.paper,
    padding: 20,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  modalTitle: {
    flex: 1,
    fontSize: 24,
    lineHeight: 28,
  },
  modalScroll: {
    paddingTop: 14,
    paddingBottom: 24,
  },
  modalText: {
    fontSize: 13,
    lineHeight: 21,
  },
});
