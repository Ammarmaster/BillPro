import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius } from "@/src/theme";
import { useResponsive } from "@/src/hooks/useResponsive";

export default function PosErpSeoScreen() {
  const router = useRouter();
  const { isDesktop } = useResponsive();

  const features = [
    {
      icon: "grid-outline",
      title: "Live Table Management",
      desc: "Interactive visual table layout showing Vacant, Occupied, and Settle states with live dining timers and split-billing support.",
    },
    {
      icon: "calculator-outline",
      title: "Float-Safe GST Calculation",
      desc: "Integer-paise math engine calculating CGST (2.5%), SGST (2.5%), flat discounts, service charges, and automatic round-off.",
    },
    {
      icon: "print-outline",
      title: "Thermal Bill & KOT Printing",
      desc: "Instant wireless receipt printing for 58mm and 80mm ESC/POS thermal printers via Bluetooth, USB, WiFi, and Web Browser.",
    },
    {
      icon: "flash-outline",
      title: "0ms Local-First Speed",
      desc: "Process table orders and customer invoices locally in 0ms on-device without internet latency, with single cloud background sync.",
    },
    {
      icon: "qr-code-outline",
      title: "QR Table Menu & Ordering",
      desc: "Contactless digital dining where customers scan table QR codes to view live menu items and submit direct kitchen orders.",
    },
    {
      icon: "scan-outline",
      title: "AI Smart Menu Importer",
      desc: "Upload photos of printed paper menus to automatically parse categories, items, and pricing into your POS catalog in seconds.",
    },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0E" />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          isDesktop && { maxWidth: 1100, alignSelf: "center", width: "100%" },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Bar */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.logoRow}>
            <View style={styles.logoBadge}>
              <Ionicons name="restaurant" size={18} color="#FFFFFF" />
            </View>
            <Text style={styles.logoText}>EzBill POS ERP</Text>
          </View>
          <TouchableOpacity
            style={styles.loginPill}
            onPress={() => router.push("/login")}
            activeOpacity={0.8}
          >
            <Text style={styles.loginPillText}>Login</Text>
          </TouchableOpacity>
        </View>

        {/* Hero Banner */}
        <View style={styles.hero}>
          <View style={styles.tagBadge}>
            <Ionicons name="shield-checkmark" size={12} color="#818CF8" />
            <Text style={styles.tagText}>India's Smart Restaurant ERP</Text>
          </View>
          <Text style={styles.heroTitle}>
            Restaurant POS, Table Management & GST Billing Software
          </Text>
          <Text style={styles.heroSub}>
            Zero latency 0ms table ordering, float-safe GST invoice calculation, wireless thermal receipt printing (58mm/80mm), and offline POS billing starting at ₹299/month.
          </Text>

          <View style={styles.ctaRow}>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => router.push("/register")}
              activeOpacity={0.85}
            >
              <Ionicons name="rocket-outline" size={18} color="#FFFFFF" />
              <Text style={styles.primaryBtnText}>Start Free Trial</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => router.push("/demo-billing")}
              activeOpacity={0.85}
            >
              <Ionicons name="play-circle-outline" size={18} color="#635BFF" />
              <Text style={styles.secondaryBtnText}>Try Demo Billing</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Core Features */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Engineered for Modern Restaurants</Text>
          <Text style={styles.sectionSub}>
            Everything you need to run high-volume food operations smoothly:
          </Text>

          <View style={styles.grid}>
            {features.map((f, idx) => (
              <View key={idx} style={[styles.card, isDesktop && { flexBasis: "31%" }]}>
                <View style={styles.cardIconBox}>
                  <Ionicons name={f.icon as any} size={24} color="#635BFF" />
                </View>
                <Text style={styles.cardTitle}>{f.title}</Text>
                <Text style={styles.cardDesc}>{f.desc}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Pricing Summary */}
        <View style={styles.pricingSection}>
          <Text style={styles.sectionTitle}>Transparent Pricing</Text>
          <View style={styles.pricingCard}>
            <View style={styles.popularTag}>
              <Text style={styles.popularText}>BEST VALUE</Text>
            </View>
            <Text style={styles.planName}>Starter 100% Local Plan</Text>
            <Text style={styles.planPrice}>
              ₹299 <Text style={{ fontSize: 14, color: "#94A3B8" }}>/ month (₹2,999/year)</Text>
            </Text>
            <Text style={styles.planDesc}>
              Includes 100% Local 0ms Speed Engine, Table Management, Thermal Bill & KOT Printing, and Cloud Backup.
            </Text>
            <TouchableOpacity
              style={styles.planBtn}
              onPress={() => router.push("/register")}
              activeOpacity={0.85}
            >
              <Text style={styles.planBtnText}>Get Started Now</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Footer Keywords */}
        <View style={styles.footer}>
          <Text style={styles.keywordsHeader}>Keywords & Capabilities</Text>
          <Text style={styles.keywordsBody}>
            Restaurant POS · Table Management · Bill Printing · GST Invoice Calculations · KOT Management · ESC/POS 58mm & 80mm Printers · Offline POS · Cafe ERP · Cloud Kitchen Software · QR Menu Ordering
          </Text>
          <Text style={styles.copyright}>© 2026 EzBill / ProDevOpz Solutions</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0A0A0E" },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xl,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#16161C",
    justifyContent: "center",
    alignItems: "center",
  },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  logoBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#635BFF",
    justifyContent: "center",
    alignItems: "center",
  },
  logoText: { fontSize: 18, fontWeight: "800", color: "#FFFFFF" },
  loginPill: {
    backgroundColor: "#16161C",
    borderWidth: 1,
    borderColor: "#2E2E38",
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  loginPillText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },

  hero: { alignItems: "center", textAlign: "center" as any, marginVertical: spacing.xl },
  tagBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(99, 91, 255, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(99, 91, 255, 0.3)",
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: 20,
    marginBottom: spacing.md,
  },
  tagText: { color: "#818CF8", fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  heroTitle: {
    fontSize: 28,
    fontWeight: "900",
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: -0.5,
    lineHeight: 36,
    marginBottom: spacing.sm,
  },
  heroSub: {
    fontSize: 14,
    color: "#94A3B8",
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 680,
    marginBottom: spacing.xl,
  },
  ctaRow: { flexDirection: "row", gap: spacing.md, flexWrap: "wrap", justifyContent: "center" },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#635BFF",
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 12,
    shadowColor: "#635BFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  primaryBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#16161C",
    borderWidth: 1,
    borderColor: "#2E2E38",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  secondaryBtnText: { color: "#635BFF", fontSize: 14, fontWeight: "700" },

  section: { marginVertical: spacing.xxl },
  sectionTitle: { fontSize: 22, fontWeight: "800", color: "#FFFFFF", textAlign: "center", marginBottom: 6 },
  sectionSub: { fontSize: 13, color: "#94A3B8", textAlign: "center", marginBottom: spacing.xl },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, justifyContent: "center" },
  card: {
    backgroundColor: "#16161C",
    borderWidth: 1,
    borderColor: "#2E2E38",
    borderRadius: 16,
    padding: spacing.lg,
    width: "100%",
  },
  cardIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(99, 91, 255, 0.12)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  cardTitle: { fontSize: 17, fontWeight: "800", color: "#FFFFFF", marginBottom: 6 },
  cardDesc: { fontSize: 13, color: "#94A3B8", lineHeight: 19 },

  pricingSection: { marginVertical: spacing.xl, alignItems: "center" },
  pricingCard: {
    backgroundColor: "#16161C",
    borderWidth: 1,
    borderColor: "#635BFF",
    borderRadius: 20,
    padding: spacing.xl,
    width: "100%",
    maxWidth: 460,
    alignItems: "center",
    position: "relative",
    marginTop: spacing.md,
  },
  popularTag: {
    position: "absolute",
    top: -10,
    backgroundColor: "#635BFF",
    paddingVertical: 3,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  popularText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  planName: { fontSize: 18, fontWeight: "800", color: "#FFFFFF", marginTop: 8 },
  planPrice: { fontSize: 28, fontWeight: "900", color: "#635BFF", marginVertical: 8 },
  planDesc: { fontSize: 13, color: "#94A3B8", textAlign: "center", lineHeight: 18, marginBottom: spacing.lg },
  planBtn: {
    backgroundColor: "#635BFF",
    paddingVertical: 12,
    width: "100%",
    borderRadius: 12,
    alignItems: "center",
  },
  planBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },

  footer: {
    marginTop: spacing.xxl,
    borderTopWidth: 1,
    borderTopColor: "#1E1E26",
    paddingTop: spacing.xl,
    alignItems: "center",
  },
  keywordsHeader: { fontSize: 12, fontWeight: "800", color: "#818CF8", textTransform: "uppercase", letterSpacing: 1 },
  keywordsBody: { fontSize: 11, color: "#64748B", textAlign: "center", lineHeight: 18, marginTop: 8, maxWidth: 600 },
  copyright: { fontSize: 11, color: "#475569", marginTop: spacing.lg },
});
