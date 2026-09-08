import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView, Alert, ActivityIndicator,
  SafeAreaView, StatusBar, Share, Switch,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/context/ThemeContext";
import { colors, spacing, radius } from "@/src/theme";

type TabKey = "terms" | "privacy" | "refunds" | "grievance" | "rights";

export default function Legal() {
  const router = useRouter();
  const { user, logout, refreshUser } = useAuth();
  const { theme, isDark } = useTheme();
  
  const [activeTab, setActiveTab] = useState<TabKey>("terms");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [legalConfig, setLegalConfig] = useState<any>({
    company_name: "ProDevOpz Solutions",
    brand_name: "EzBill / BillPro",
    registered_address: "ProDevOpz Solutions, India",
    support_email: "contactprodevopz@gmail.com",
    grievance_email: "contactprodevopz@gmail.com",
    grievance_officer_name: "Grievance Redressal Officer",
    contact_number: "+91 81520 75375",
    terms_version: "v1.0",
    privacy_version: "v1.0",
    effective_date: "2026-03-01",
  });

  const [marketingConsent, setMarketingConsent] = useState(user?.marketing_consent ?? false);

  useEffect(() => {
    api.getLegalConfig().then(cfg => {
      if (cfg) setLegalConfig(cfg);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (user) {
      setMarketingConsent(user.marketing_consent ?? false);
    }
  }, [user]);

  const handleExportData = async () => {
    setExporting(true);
    try {
      const data = await api.exportMyData();
      const jsonString = JSON.stringify(data, null, 2);
      await Share.share({
        title: "EzBill_Data_Export.json",
        message: jsonString,
      });
      Alert.alert("Data Export Ready", "Your personal and business data export has been generated in accordance with DPDP Act Data Portability rights.");
    } catch (e: any) {
      Alert.alert("Export Notice", e.message || "Failed to generate export file.");
    } finally {
      setExporting(false);
    }
  };

  const handleMarketingToggle = async (val: boolean) => {
    try {
      const status = val ? "accepted" : "withdrawn";
      await api.updateConsent("MARKETING_CONSENT", status);
      setMarketingConsent(val);
      await refreshUser();
      Alert.alert("Preferences Saved", `Marketing & promotional communication consent: ${status}`);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to update marketing consent.");
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account & Data?",
      "This action is permanent and exercises your DPDP Right to Erasure.\n\n• Your account credentials, waiter profiles, categories, and menu items will be deleted.\n• In compliance with Section 36 of the CGST Act (mandatory 72-month tax audit retention), historical invoices and bills will be anonymized without personal identifying details.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Yes, Delete Everything",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              const res = await api.deleteAccount();
              Alert.alert("Account Deleted", res.message || "Your account has been deleted.", [
                {
                  text: "OK",
                  onPress: async () => {
                    await logout();
                    router.replace("/");
                  }
                }
              ]);
            } catch (e: any) {
              Alert.alert("Error", e.message || "Failed to delete account.");
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.surface }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.surface} />
      <View style={styles.wrap} testID="legal-screen">
        
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.replace("/(app)/more")} testID="legal-back-btn" hitSlop={12} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={theme.onSurface} />
          </Pressable>
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={[styles.title, { color: theme.onSurface }]}>Legal & Compliance</Text>
            <Text style={[styles.subtitle, { color: theme.onSurfaceSecondary }]}>DPDP 2023 · IT Act · Consumer Protection</Text>
          </View>
        </View>

        {/* Segmented Tabs Bar */}
        <View style={[styles.tabBar, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
            {[
              { key: "terms" as TabKey, label: "Terms of Service", icon: "document-text-outline" },
              { key: "privacy" as TabKey, label: "Privacy Policy", icon: "shield-checkmark-outline" },
              { key: "refunds" as TabKey, label: "Refunds & Cancel", icon: "refresh-circle-outline" },
              { key: "grievance" as TabKey, label: "Grievance Officer", icon: "mail-outline" },
              { key: "rights" as TabKey, label: "Privacy Controls", icon: "lock-closed-outline" },
            ].map((tab) => {
              const active = activeTab === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => setActiveTab(tab.key)}
                  style={[
                    styles.tabItem,
                    active && { backgroundColor: isDark ? "#2A2B40" : "#FFFFFF", borderColor: colors.brand, shadowOpacity: 0.1 }
                  ]}
                >
                  <Ionicons name={tab.icon as any} size={16} color={active ? colors.brand : theme.onSurfaceSecondary} />
                  <Text style={[styles.tabText, { color: active ? colors.brand : theme.onSurfaceSecondary, fontWeight: active ? "800" : "600" }]}>
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Content ScrollView */}
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          
          {/* TAB 1: TERMS OF SERVICE */}
          {activeTab === "terms" && (
            <View style={[styles.card, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
              <View style={styles.cardHeader}>
                <Ionicons name="document-text" size={22} color={colors.brand} />
                <View>
                  <Text style={[styles.cardTitle, { color: theme.onSurface }]}>Terms of Service</Text>
                  <Text style={[styles.cardMeta, { color: theme.onSurfaceTertiary }]}>Version {legalConfig.terms_version || "1.0"} · Effective {legalConfig.effective_date || "March 2026"}</Text>
                </View>
              </View>
              
              <Text style={[styles.cardBody, { color: theme.onSurfaceSecondary }]}>
                <Text style={styles.bold}>1. Introduction & Acceptance</Text>{"\n"}
                These Terms of Service constitute a legally binding agreement between you (the "Customer" or "User") and {legalConfig.company_name || "ProDevOpz Solutions"} ("Company", "we", "us"), governing your access to and use of the {legalConfig.brand_name || "EzBill"} Restaurant ERP platform, mobile applications, web portals, and associated APIs.{"\n\n"}
                
                <Text style={styles.bold}>2. Scope of Services</Text>{"\n"}
                EzBill provides a software-as-a-service (SaaS) suite comprising point-of-sale (POS) billing, kitchen order tickets (KOT), thermal printer synchronization, menu catalog management, waiter ordering tools, QR menu portal, table layout management, and analytics reporting.{"\n\n"}

                <Text style={styles.bold}>3. Account Security & Responsibilities</Text>{"\n"}
                • You are responsible for maintaining the strict confidentiality of your login credentials and staff PINs.{"\n"}
                • You agree to immediately notify us of any unauthorized account access.{"\n"}
                • You agree not to reverse engineer, decompile, or misuse the software or its API endpoints.{"\n\n"}

                <Text style={styles.bold}>4. Subscriptions, Fees & Auto-Renewal</Text>{"\n"}
                • SaaS subscription plans are billed in advance on a recurring monthly or yearly cycle.{"\n"}
                • Subscriptions auto-renew through Razorpay recurring mandates unless cancelled prior to the billing date.{"\n"}
                • Mandates can be cancelled anytime with 1-click in the app without cancellation fees.{"\n\n"}

                <Text style={styles.bold}>5. Statutory Tax & Regulatory Compliance</Text>{"\n"}
                You acknowledge that you are solely responsible for configuring accurate GST rates, FSSAI licenses, and merchant details on your invoices. EzBill is a software tool and does not act as a tax intermediary.{"\n\n"}

                <Text style={styles.bold}>6. Limitation of Liability</Text>{"\n"}
                To the maximum extent permitted by Indian law, the Company shall not be liable for indirect, punitive, or consequential damages, hardware printer failures, or internet service disruptions. Our aggregate liability shall not exceed the subscription fees paid by you in the 3 months preceding the event.{"\n\n"}

                <Text style={styles.bold}>7. Governing Law & Dispute Resolution</Text>{"\n"}
                These terms shall be governed by and construed in accordance with the laws of India. Any disputes arising out of or in connection with this agreement shall be settled through binding arbitration in accordance with the Arbitration and Conciliation Act, 1996.
              </Text>
            </View>
          )}

          {/* TAB 2: PRIVACY POLICY */}
          {activeTab === "privacy" && (
            <View style={[styles.card, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
              <View style={styles.cardHeader}>
                <Ionicons name="shield-checkmark" size={22} color={colors.brand} />
                <View>
                  <Text style={[styles.cardTitle, { color: theme.onSurface }]}>Privacy Policy & DPDP Notice</Text>
                  <Text style={[styles.cardMeta, { color: theme.onSurfaceTertiary }]}>Under DPDP Act 2023 & DPDP Rules 2025</Text>
                </View>
              </View>

              <Text style={[styles.cardBody, { color: theme.onSurfaceSecondary }]}>
                <Text style={styles.bold}>1. Commitment to Privacy</Text>{"\n"}
                {legalConfig.company_name || "ProDevOpz Solutions"} is committed to protecting your personal data in strict accordance with the Digital Personal Data Protection Act, 2023 (DPDP Act), the DPDP Rules 2025, and Information Technology Rules.{"\n\n"}

                <Text style={styles.bold}>2. Data Inventory (What We Collect)</Text>{"\n"}
                • <Text style={styles.bold}>Account Profile</Text>: Name, email address, mobile number, encrypted password hash.{"\n"}
                • <Text style={styles.bold}>Business Metadata</Text>: Restaurant name, physical address, GSTIN, FSSAI number, UPI ID, logo image.{"\n"}
                • <Text style={styles.bold}>Staff Records</Text>: Staff names, assigned roles (owner, manager, waiter, kitchen), waiter PINs.{"\n"}
                • <Text style={styles.bold}>Operational & Billing Data</Text>: Itemized sales records, table assignments, order timestamps, payment methods (Cash, UPI, Card, Due), guest customer phone numbers (when provided for e-receipts).{"\n"}
                • <Text style={styles.bold}>Device & Push Tokens</Text>: Expo push notification tokens for order routing.{"\n\n"}

                <Text style={styles.bold}>3. Purpose of Processing</Text>{"\n"}
                We process your personal and business data strictly for:{"\n"}
                • Fulfilling core POS billing and real-time KOT operations.{"\n"}
                • Synchronizing menu items and tables across your staff's devices.{"\n"}
                • Delivering transactional OTP emails and critical kitchen push alerts.{"\n"}
                • Processing SaaS subscription auto-renewals securely.{"\n"}
                • Maintaining statutory tax compliance records.{"\n\n"}

                <Text style={styles.bold}>4. Third-Party Sub-Processors</Text>{"\n"}
                We engage verified industry-standard sub-processors under strict data confidentiality agreements:{"\n"}
                • <Text style={styles.bold}>Razorpay Software Pvt. Ltd.</Text>: PCI-DSS Level 1 payment gateway for recurring SaaS subscriptions. We never store credit/debit card numbers or CVVs.{"\n"}
                • <Text style={styles.bold}>Brevo (formerly Sendinblue)</Text>: Transactional email OTP delivery for secure password resets.{"\n"}
                • <Text style={styles.bold}>Expo / Apple APNs / Google FCM</Text>: Push notification services for order dispatch.{"\n"}
                • <Text style={styles.bold}>Google Gemini API</Text>: Optional AI menu OCR photo digitizer.{"\n"}
                • <Text style={styles.bold}>MongoDB Atlas</Text>: Primary encrypted multi-tenant cloud database.{"\n\n"}

                <Text style={styles.bold}>5. Rights of the Data Principal</Text>{"\n"}
                Under the DPDP Act 2023, you have the right to:{"\n"}
                • <Text style={styles.bold}>Right to Access & Portability</Text>: Export your complete account and billing data in structured JSON format at any time.{"\n"}
                • <Text style={styles.bold}>Right to Correction</Text>: Update restaurant and profile information in settings.{"\n"}
                • <Text style={styles.bold}>Right to Withdraw Consent & Erasure</Text>: Delete your account and request erasure of personal data, subject to statutory tax invoice retention laws.
              </Text>
            </View>
          )}

          {/* TAB 3: REFUND & CANCELLATION */}
          {activeTab === "refunds" && (
            <View style={[styles.card, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
              <View style={styles.cardHeader}>
                <Ionicons name="refresh-circle" size={22} color={colors.brand} />
                <View>
                  <Text style={[styles.cardTitle, { color: theme.onSurface }]}>Refund & Cancellation Policy</Text>
                  <Text style={[styles.cardMeta, { color: theme.onSurfaceTertiary }]}>Consumer Protection (E-Commerce) Rules 2020</Text>
                </View>
              </View>

              <Text style={[styles.cardBody, { color: theme.onSurfaceSecondary }]}>
                <Text style={styles.bold}>1. Free Trial & Evaluation</Text>{"\n"}
                We offer free starter access and interactive demo features so that you can thoroughly evaluate EzBill before purchasing a paid subscription tier.{"\n\n"}

                <Text style={styles.bold}>2. Subscription Cancellation (AutoPay)</Text>{"\n"}
                • You can cancel your recurring AutoPay subscription mandate at any time directly through the app (<Text style={styles.bold}>More → Subscription → Cancel AutoPay</Text>).{"\n"}
                • You may also cancel the mandate directly via your bank's UPI / net-banking AutoPay management portal.{"\n"}
                • When cancelled, your subscription will remain active until the end of the paid billing period, and no further charges will be made.{"\n\n"}

                <Text style={styles.bold}>3. Refund Eligibility</Text>{"\n"}
                • SaaS subscription fees are billed in advance for the selected billing cycle and are non-refundable once an active billing period has commenced.{"\n"}
                • In the rare event of a duplicate charge or proven technical billing discrepancy caused by our payment gateway, please contact support within 7 days. Verified duplicate charges will be refunded to the original payment source within 5-7 business days.{"\n\n"}

                <Text style={styles.bold}>4. Price Transparency</Text>{"\n"}
                All plan pricing is transparently displayed in Indian Rupees (INR) with applicable tax breakdowns prior to mandate authorization. There are no hidden fees or per-order commissions.
              </Text>
            </View>
          )}

          {/* TAB 4: GRIEVANCE REDRESSAL OFFICER */}
          {activeTab === "grievance" && (
            <View style={[styles.card, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
              <View style={styles.cardHeader}>
                <Ionicons name="mail" size={22} color={colors.brand} />
                <View>
                  <Text style={[styles.cardTitle, { color: theme.onSurface }]}>Grievance Redressal Officer</Text>
                  <Text style={[styles.cardMeta, { color: theme.onSurfaceTertiary }]}>IT Intermediary Rules 2021 & DPDP Act 2023</Text>
                </View>
              </View>

              <Text style={[styles.cardBody, { color: theme.onSurfaceSecondary }]}>
                In accordance with the Information Technology Act 2000, IT Intermediary Guidelines Rules 2021, and the DPDP Act 2023, the details of our designated Grievance Officer are published below:{"\n\n"}

                <Text style={styles.bold}>Officer Name</Text>: {legalConfig.grievance_officer_name || "Grievance Redressal Officer"}{"\n"}
                <Text style={styles.bold}>Company</Text>: {legalConfig.company_name || "ProDevOpz Solutions"}{"\n"}
                <Text style={styles.bold}>Address</Text>: {legalConfig.registered_address || "ProDevOpz Solutions, India"}{"\n"}
                <Text style={styles.bold}>Grievance Email</Text>: {legalConfig.grievance_email || "contactprodevopz@gmail.com"}{"\n"}
                <Text style={styles.bold}>Customer Support</Text>: {legalConfig.support_email || "contactprodevopz@gmail.com"}{"\n"}
                <Text style={styles.bold}>Support Phone</Text>: {legalConfig.contact_number || "+91 81520 75375"}{"\n\n"}

                <Text style={styles.bold}>Statutory Response Timelines</Text>:{"\n"}
                • <Text style={styles.bold}>Acknowledgment</Text>: We acknowledge all grievance emails within 24-48 hours.{"\n"}
                • <Text style={styles.bold}>Resolution</Text>: We resolve all grievances within statutory timelines (not exceeding 30 days).
              </Text>
            </View>
          )}

          {/* TAB 5: PRIVACY CONTROLS & RIGHTS */}
          {activeTab === "rights" && (
            <View style={{ gap: spacing.lg }}>
              
              {/* Data Portability Export Card */}
              <View style={[styles.card, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
                <View style={styles.cardHeader}>
                  <Ionicons name="download-outline" size={22} color={colors.brand} />
                  <Text style={[styles.cardTitle, { color: theme.onSurface }]}>Data Portability (Export My Data)</Text>
                </View>
                <Text style={[styles.cardBody, { color: theme.onSurfaceSecondary }]}>
                  Under the DPDP Act 2023, you have the right to obtain a structured, machine-readable copy of your restaurant profile, categories, menu items, table list, orders, and historical bills.
                </Text>
                <Pressable
                  style={[styles.actionBtn, exporting && { opacity: 0.6 }]}
                  onPress={handleExportData}
                  disabled={exporting}
                >
                  {exporting ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <Ionicons name="share-outline" size={18} color="#FFFFFF" />
                      <Text style={styles.actionBtnText}>Export & Download Data (JSON)</Text>
                    </>
                  )}
                </Pressable>
              </View>

              {/* Consent Management Card */}
              <View style={[styles.card, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
                <View style={styles.cardHeader}>
                  <Ionicons name="options-outline" size={22} color={colors.brand} />
                  <Text style={[styles.cardTitle, { color: theme.onSurface }]}>Consent Preferences</Text>
                </View>
                
                <View style={[styles.switchRow, { borderBottomColor: theme.border }]}>
                  <View style={{ flex: 1, marginRight: spacing.sm }}>
                    <Text style={[styles.switchTitle, { color: theme.onSurface }]}>Marketing Communications</Text>
                    <Text style={[styles.switchSub, { color: theme.onSurfaceSecondary }]}>Receive promotional updates and product tips</Text>
                  </View>
                  <Switch
                    value={marketingConsent}
                    onValueChange={handleMarketingToggle}
                    trackColor={{ false: isDark ? "#374151" : "#E2E8F0", true: colors.brand }}
                    thumbColor={marketingConsent ? "#FFFFFF" : "#F4F3F4"}
                  />
                </View>

                <View style={styles.switchRow}>
                  <View style={{ flex: 1, marginRight: spacing.sm }}>
                    <Text style={[styles.switchTitle, { color: theme.onSurface }]}>Core Data Processing</Text>
                    <Text style={[styles.switchSub, { color: theme.onSurfaceSecondary }]}>Required for active POS billing and sync</Text>
                  </View>
                  <Ionicons name="checkmark-circle" size={22} color="#10B981" />
                </View>
              </View>

              {/* Dangerous Zone - Account Deletion */}
              <View style={[styles.card, { backgroundColor: theme.surfaceSecondary, borderColor: "#EF444450" }]}>
                <View style={styles.cardHeader}>
                  <Ionicons name="warning" size={22} color="#EF4444" />
                  <Text style={[styles.cardTitle, { color: "#EF4444" }]}>Right to Erasure (Delete Account)</Text>
                </View>
                <Text style={[styles.cardBody, { color: theme.onSurfaceSecondary }]}>
                  Permanently erase your account, staff profiles, menu items, categories, and push tokens. Under Section 36 of the CGST Act, past tax invoices will be anonymized and held under statutory legal retention for tax audit purposes.
                </Text>
                <Pressable
                  style={[styles.deleteBtn, busy && { opacity: 0.6 }]}
                  onPress={handleDeleteAccount}
                  disabled={busy}
                  testID="delete-account-btn"
                >
                  {busy ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.deleteBtnText}>Erase My Account & Personal Data</Text>
                  )}
                </Pressable>
              </View>

            </View>
          )}

        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  title: { fontSize: 20, fontWeight: "900" },
  subtitle: { fontSize: 11, fontWeight: "600", marginTop: 2 },
  
  tabBar: {
    borderBottomWidth: 1,
    paddingVertical: 8,
  },
  tabScroll: {
    paddingHorizontal: spacing.md,
    gap: 8,
  },
  tabItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "transparent",
  },
  tabText: { fontSize: 12 },
  
  card: {
    padding: spacing.xl,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  cardTitle: { fontSize: 16, fontWeight: "900" },
  cardMeta: { fontSize: 11, marginTop: 2, fontWeight: "600" },
  cardBody: { fontSize: 13, lineHeight: 22, fontWeight: "500" },
  bold: { fontWeight: "800", color: "#FF5E2B" },

  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.brand,
    paddingVertical: 14,
    borderRadius: radius.lg,
    marginTop: spacing.xs,
  },
  actionBtnText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 14,
  },

  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  switchTitle: { fontSize: 14, fontWeight: "700" },
  switchSub: { fontSize: 11, marginTop: 2 },

  deleteBtn: {
    backgroundColor: "#EF4444",
    paddingVertical: 14,
    borderRadius: radius.lg,
    alignItems: "center",
    marginTop: spacing.xs,
  },
  deleteBtnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 14 },
});
