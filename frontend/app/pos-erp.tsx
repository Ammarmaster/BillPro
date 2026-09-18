import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { spacing, radius } from "@/src/theme";
import { useResponsive } from "@/src/hooks/useResponsive";

export default function PosErpSeoScreen() {
  const router = useRouter();
  const { isDesktop } = useResponsive();

  const features = [
    {
      icon: "grid-outline",
      title: "Live Table Management",
      cursive: "Interactive Floor Layout",
      desc: "Visual table layout showing Vacant, Occupied, and Settle states with live dining timers, split bills, and table merging.",
    },
    {
      icon: "calculator-outline",
      title: "Float-Safe GST Calculation",
      cursive: "100% Tax Compliant",
      desc: "Integer-paise math engine calculating CGST (2.5%), SGST (2.5%), flat discounts, custom service charges, and automatic round-off.",
    },
    {
      icon: "print-outline",
      title: "Thermal Bill & KOT Printing",
      cursive: "ESC/POS 58mm & 80mm",
      desc: "Instant wireless receipt printing for thermal printers via Bluetooth, USB, WiFi, Ethernet LAN, and direct Web Browser print.",
    },
    {
      icon: "flash-outline",
      title: "0ms Local-First Speed",
      cursive: "Zero Internet Lag",
      desc: "Process table orders and customer invoices locally in 0ms on-device without internet latency, with single cloud background sync.",
    },
    {
      icon: "qr-code-outline",
      title: "QR Table Menu & Ordering",
      cursive: "Contactless Dining",
      desc: "Digital dining where customers scan table QR codes to view live menu items with food photos and submit direct kitchen orders.",
    },
    {
      icon: "scan-outline",
      title: "AI Smart Menu Importer",
      cursive: "OCR Catalog Scanner",
      desc: "Upload photos of physical printed menus to automatically parse categories, items, and pricing into your POS catalog in seconds.",
    },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#08090C" />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          isDesktop && { maxWidth: 1160, alignSelf: "center", width: "100%" },
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
            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.logoRow}>
            <View style={styles.logoBadge}>
              <Ionicons name="restaurant" size={18} color="#FFFFFF" />
            </View>
            <Text style={styles.logoText}>EzBill <Text style={styles.logoSubText}>ERP Features</Text></Text>
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
            <Ionicons name="shield-checkmark" size={13} color="#10B981" />
            <Text style={styles.tagText}>INDIA'S SMARTEST RESTAURANT ERP</Text>
          </View>

          <Text style={styles.heroTitle}>
            High-Speed POS, Table Matrix & Float-Safe GST Billing
          </Text>

          <Text style={styles.heroSub}>
            Zero latency 0ms table ordering, float-safe integer GST calculation, wireless thermal receipt printing (58mm/80mm), and offline POS billing starting at ₹299/month.
          </Text>

          <Text style={styles.cursiveTag}>
            ✨ Engineered for high-speed restaurant counters & busy dine-in floors
          </Text>

          <View style={styles.ctaRow}>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => router.push("/register")}
              activeOpacity={0.85}
            >
              <Ionicons name="rocket-outline" size={18} color="#FFFFFF" />
              <Text style={styles.primaryBtnText}>Start for ₹299/mo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => router.push("/demo-billing")}
              activeOpacity={0.85}
            >
              <Ionicons name="play-circle-outline" size={18} color="#FF7D52" />
              <Text style={styles.secondaryBtnText}>Try Demo Billing</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Core Features */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Engineered for Modern Food Businesses</Text>
          <Text style={styles.sectionSub}>
            Everything you need to run high-volume food operations with 0ms delay:
          </Text>

          <View style={styles.grid}>
            {features.map((f, idx) => (
              <View key={idx} style={[styles.card, isDesktop && { flexBasis: "31%" }]}>
                <View style={styles.cardIconBox}>
                  <Ionicons name={f.icon as any} size={24} color="#FF5E2B" />
                </View>
                <Text style={styles.cardCursive}>{f.cursive}</Text>
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
              Includes 100% Local 0ms Speed Engine, Table Management, Thermal Bill & KOT Printing, and Cloud Database Backup.
            </Text>
            <TouchableOpacity
              style={styles.planBtn}
              onPress={() => router.push("/register")}
              activeOpacity={0.85}
            >
              <Text style={styles.planBtnText}>Launch EzBill Account</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Footer Keywords */}
        <View style={styles.footer}>
          <Text style={styles.keywordsHeader}>Keywords & Capabilities</Text>
          <Text style={styles.keywordsBody}>
            Restaurant POS · Table Management · Bill Printing · GST Invoice Calculations · KOT Management · ESC/POS 58mm & 80mm Printers · Offline POS · Cafe ERP · Cloud Kitchen Software · QR Menu Ordering
          </Text>
          <Text style={styles.copyright}>© 2026 EzBill / ProDevOpz Solutions. All rights reserved.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#08090C" },
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
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    justifyContent: "center",
    alignItems: "center",
  },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  logoBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#FF5E2B",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#FF5E2B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
  },
  logoText: { fontSize: 18, fontWeight: "900", color: "#FFFFFF" },
  logoSubText: {
    color: "#34D399",
    fontFamily: Platform.OS === "web" ? "'Playfair Display', Georgia, serif" : undefined,
    fontStyle: "italic",
    fontWeight: "700",
  },
  loginPill: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  loginPillText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },

  hero: { alignItems: "center", textAlign: "center" as any, marginVertical: spacing.xl },
  tagBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255, 94, 43, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 94, 43, 0.35)",
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginBottom: spacing.md,
  },
  tagText: { color: "#FF8A3D", fontSize: 11, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" },
  heroTitle: {
    fontSize: 32,
    fontWeight: "900",
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: -0.8,
    lineHeight: 40,
    marginBottom: spacing.sm,
    maxWidth: 720,
  },
  heroSub: {
    fontSize: 14,
    color: "#94A3B8",
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 680,
    marginBottom: spacing.sm,
  },
  cursiveTag: {
    fontFamily: Platform.OS === "web" ? "'Caveat', cursive, sans-serif" : undefined,
    fontSize: 22,
    color: "#FDBA74",
    fontWeight: "600",
    textAlign: "center",
    marginVertical: spacing.md,
  },
  ctaRow: { flexDirection: "row", gap: spacing.md, flexWrap: "wrap", justifyContent: "center", marginTop: spacing.sm },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FF5E2B",
    paddingVertical: 13,
    paddingHorizontal: 24,
    borderRadius: 12,
    shadowColor: "#FF5E2B",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  primaryBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    paddingVertical: 13,
    paddingHorizontal: 22,
    borderRadius: 12,
  },
  secondaryBtnText: { color: "#FF7D52", fontSize: 14, fontWeight: "700" },

  section: { marginVertical: spacing.xxl },
  sectionTitle: { fontSize: 24, fontWeight: "800", color: "#FFFFFF", textAlign: "center", marginBottom: 6 },
  sectionSub: { fontSize: 13, color: "#94A3B8", textAlign: "center", marginBottom: spacing.xl },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, justifyContent: "center" },
  card: {
    backgroundColor: "rgba(18, 22, 28, 0.85)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 20,
    padding: spacing.lg,
    width: "100%",
  },
  cardIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "rgba(255, 94, 43, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 94, 43, 0.25)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  cardCursive: {
    fontFamily: Platform.OS === "web" ? "'Caveat', cursive, sans-serif" : undefined,
    fontSize: 17,
    color: "#34D399",
    fontWeight: "600",
    marginBottom: 2,
  },
  cardTitle: { fontSize: 18, fontWeight: "800", color: "#FFFFFF", marginBottom: 6 },
  cardDesc: { fontSize: 13, color: "#94A3B8", lineHeight: 19 },

  pricingSection: { marginVertical: spacing.xl, alignItems: "center" },
  pricingCard: {
    backgroundColor: "rgba(26, 32, 42, 0.95)",
    borderWidth: 1,
    borderColor: "#FF5E2B",
    borderRadius: 24,
    padding: spacing.xl,
    width: "100%",
    maxWidth: 480,
    alignItems: "center",
    position: "relative",
    marginTop: spacing.md,
    shadowColor: "#FF5E2B",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
  },
  popularTag: {
    position: "absolute",
    top: -12,
    backgroundColor: "#FF5E2B",
    paddingVertical: 4,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  popularText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900", letterSpacing: 0.3 },
  planName: { fontSize: 20, fontWeight: "800", color: "#FFFFFF", marginTop: 8 },
  planPrice: { fontSize: 32, fontWeight: "900", color: "#FF7D52", marginVertical: 8 },
  planDesc: { fontSize: 13, color: "#94A3B8", textAlign: "center", lineHeight: 19, marginBottom: spacing.lg },
  planBtn: {
    backgroundColor: "#10B981",
    paddingVertical: 14,
    width: "100%",
    borderRadius: 12,
    alignItems: "center",
  },
  planBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },

  footer: {
    marginTop: spacing.xxl,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
    paddingTop: spacing.xl,
    alignItems: "center",
  },
  keywordsHeader: { fontSize: 12, fontWeight: "800", color: "#FF8A3D", textTransform: "uppercase", letterSpacing: 1 },
  keywordsBody: { fontSize: 11, color: "#64748B", textAlign: "center", lineHeight: 18, marginTop: 8, maxWidth: 600 },
  copyright: { fontSize: 11, color: "#475569", marginTop: spacing.lg },
});
