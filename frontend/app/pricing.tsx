import React, { useState } from "react";
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

export default function PricingScreen() {
  const router = useRouter();
  const { isDesktop } = useResponsive();
  const [isYearly, setIsYearly] = useState(false);

  const tiers = [
    {
      id: "starter",
      name: "Starter 100% Local",
      badge: "⭐ MOST POPULAR FOR STANDALONE OUTLETS",
      popular: true,
      priceMonthly: 299,
      priceYearly: 2999,
      tagline: "Ultra-fast 0ms local speed for standalone restaurants, cafes & bakeries",
      cursiveNote: "✨ 0ms local engine · Single outlet favorite",
      features: [
        "100% Local 0ms Billing Engine",
        "Complete Table Management & Visual Matrix",
        "Float-Safe GST Invoice Calculations",
        "Thermal Bill & KOT Receipt Printing (58mm/80mm)",
        "Single-User / 1-Device Offline Speed",
        "Automatic Daily Sales & Midnight Reset",
        "Cloud Database Storage & Backup",
      ],
      cta: "Choose Starter (₹299/mo)",
      ctaPrimary: true,
    },
    {
      id: "growth",
      name: "Growth Dine-In",
      badge: "MULTI-STAFF & KDS",
      popular: false,
      priceMonthly: 999,
      priceYearly: 9999,
      tagline: "Designed for busy dine-in spots with captain apps and kitchen displays",
      cursiveNote: "📱 Up to 5 Waiter Captains & KDS",
      features: [
        "Everything in Starter Plan",
        "Multi-Waiter Captain System (Up to 5 Users)",
        "Live Kitchen Display System (KDS)",
        "Real-Time Multi-Device WebSocket Sync",
        "AI Smart Menu OCR Importer",
        "Inventory Stock & Daily Expense Tracking",
        "Waiter Performance & Sales Reports",
      ],
      cta: "Choose Growth",
      ctaPrimary: false,
    },
    {
      id: "pro",
      name: "Pro Enterprise",
      badge: "UNLIMITED EVERYTHING",
      popular: false,
      priceMonthly: 1999,
      priceYearly: 19999,
      tagline: "For large multi-floor restaurants, bars, breweries, & chains",
      cursiveNote: "🚀 Multi-floor KOT & QR Table Ordering",
      features: [
        "Everything in Growth Plan",
        "Unlimited Staff, Captains & Kitchen Displays",
        "Customer QR Code Digital Table Ordering",
        "Multi-Terminal KOT Routing (Bar + Main Kitchen)",
        "Customer Feedback & Loyalty OTP Linking",
        "Advanced Analytics & Full Data Export",
        "24/7 Priority Dedicated Support",
      ],
      cta: "Choose Pro Enterprise",
      ctaPrimary: false,
    },
  ];

  const comparisonRows = [
    { feature: "0ms Local-First Speed", starter: "✅", growth: "✅", pro: "✅" },
    { feature: "Float-Safe GST Invoices", starter: "✅", growth: "✅", pro: "✅" },
    { feature: "Thermal Receipt & KOT Printing", starter: "✅", growth: "✅", pro: "✅" },
    { feature: "Table Management & Billing", starter: "✅", growth: "✅", pro: "✅" },
    { feature: "Staff / Waiter Accounts", starter: "1 User (Owner)", growth: "Up to 5 Users", pro: "Unlimited" },
    { feature: "Kitchen Display System (KDS)", starter: "—", growth: "✅", pro: "✅" },
    { feature: "AI Menu Scanner & OCR", starter: "—", growth: "✅", pro: "✅" },
    { feature: "Inventory & Expense Tracking", starter: "—", growth: "✅", pro: "✅" },
    { feature: "QR Code Self-Ordering Menu", starter: "—", growth: "—", pro: "✅" },
    { feature: "Multi-Station KOT Routing", starter: "—", growth: "—", pro: "✅" },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#08090C" />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          isDesktop && { maxWidth: 1180, alignSelf: "center", width: "100%" },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header */}
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
            <Text style={styles.logoText}>EzBill <Text style={styles.logoSubText}>Pricing</Text></Text>
          </View>
          <TouchableOpacity
            style={styles.loginBtn}
            onPress={() => router.push("/login")}
            activeOpacity={0.8}
          >
            <Text style={styles.loginBtnText}>Portal Login</Text>
          </TouchableOpacity>
        </View>

        {/* Hero Section */}
        <View style={styles.hero}>
          <View style={styles.pillBadge}>
            <View style={styles.pillDot} />
            <Text style={styles.pillText}>HONEST & TRANSPARENT RESTAURANT PRICING</Text>
          </View>
          
          <Text style={styles.heroTitle}>
            Simple, Transparent Plans for Every Restaurant
          </Text>

          <Text style={styles.heroSub}>
            Zero setup fees. Zero commission on food orders. Upgrade, switch, or cancel anytime.
          </Text>

          {/* Cursive Accent Tag */}
          <Text style={styles.cursiveTag}>
            ✨ Keep 100% of your restaurant profits · Zero hidden charges
          </Text>

          {/* Billing Cycle Toggle */}
          <View style={styles.toggleContainer}>
            <TouchableOpacity
              style={[styles.toggleBtn, !isYearly && styles.toggleBtnActive]}
              onPress={() => setIsYearly(false)}
              activeOpacity={0.8}
            >
              <Text style={[styles.toggleText, !isYearly && styles.toggleTextActive]}>
                Monthly Billing
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.toggleBtn, isYearly && styles.toggleBtnActive]}
              onPress={() => setIsYearly(true)}
              activeOpacity={0.8}
            >
              <Text style={[styles.toggleText, isYearly && styles.toggleTextActive]}>
                Annual Billing
              </Text>
              <View style={styles.discountBadge}>
                <Text style={styles.discountText}>SAVE 20%</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Pricing Cards Grid */}
        <View style={styles.cardsGrid}>
          {tiers.map((tier) => {
            const price = isYearly ? tier.priceYearly : tier.priceMonthly;
            return (
              <View
                key={tier.id}
                style={[
                  styles.card,
                  tier.popular && styles.cardPopular,
                  isDesktop && { flex: 1, minWidth: 320 },
                ]}
              >
                {tier.popular && (
                  <View style={styles.popularBadge}>
                    <Text style={styles.popularBadgeText}>{tier.badge}</Text>
                  </View>
                )}

                <Text style={styles.tierName}>{tier.name}</Text>
                <Text style={styles.tierTagline}>{tier.tagline}</Text>

                {/* Cursive mini callout */}
                <Text style={styles.cardCursive}>{tier.cursiveNote}</Text>

                <View style={styles.priceRow}>
                  <Text style={styles.priceCurrency}>₹</Text>
                  <Text style={styles.priceNumber}>{price.toLocaleString("en-IN")}</Text>
                  <Text style={styles.pricePeriod}>{isYearly ? "/ year" : "/ month"}</Text>
                </View>
                {isYearly && (
                  <Text style={styles.effectiveMonthly}>
                    (₹{Math.round(price / 12)} / month equivalent)
                  </Text>
                )}

                <View style={styles.divider} />

                <Text style={styles.featuresHeading}>Everything included:</Text>
                <View style={styles.featuresList}>
                  {tier.features.map((feat, i) => (
                    <View key={i} style={styles.featureItem}>
                      <Ionicons name="checkmark-circle" size={17} color="#10B981" style={{ marginTop: 1 }} />
                      <Text style={styles.featureText}>{feat}</Text>
                    </View>
                  ))}
                </View>

                <TouchableOpacity
                  style={[styles.ctaButton, tier.ctaPrimary ? styles.ctaPrimary : styles.ctaSecondary]}
                  onPress={() => router.push("/register")}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.ctaText, tier.ctaPrimary ? styles.ctaPrimaryText : styles.ctaSecondaryText]}>
                    {tier.cta}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        {/* Feature Comparison Matrix for Desktop / Tablet */}
        <View style={styles.matrixSection}>
          <Text style={styles.matrixTitle}>Detailed Feature Matrix</Text>
          <Text style={styles.matrixSub}>Compare capabilities across all EzBill tiers</Text>
          <View style={styles.tableWrapper}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <Text style={[styles.tableCell, styles.tableCellFeat, { fontWeight: "800", color: "#FFFFFF" }]}>Feature</Text>
              <Text style={[styles.tableCell, { fontWeight: "800", color: "#FF7D52" }]}>Starter (₹299)</Text>
              <Text style={[styles.tableCell, { fontWeight: "800", color: "#34D399" }]}>Growth (₹999)</Text>
              <Text style={[styles.tableCell, { fontWeight: "800", color: "#FBBF24" }]}>Pro (₹1,999)</Text>
            </View>
            {comparisonRows.map((row, idx) => (
              <View key={idx} style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}>
                <Text style={[styles.tableCell, styles.tableCellFeat]}>{row.feature}</Text>
                <Text style={styles.tableCell}>{row.starter}</Text>
                <Text style={styles.tableCell}>{row.growth}</Text>
                <Text style={styles.tableCell}>{row.pro}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Live Demo Banner */}
        <View style={styles.demoBanner}>
          <View style={{ flex: 1, marginRight: 16 }}>
            <Text style={styles.demoBannerTitle}>Want to test the billing engine first?</Text>
            <Text style={styles.demoBannerSub}>
              Experience our 0ms table ordering, float-safe GST calculations, and thermal receipt previews right in your browser.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.demoBannerBtn}
            onPress={() => router.push("/demo-billing")}
            activeOpacity={0.85}
          >
            <Ionicons name="play-circle-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.demoBannerBtnText}>Launch Demo</Text>
          </TouchableOpacity>
        </View>

        {/* Trust Badges */}
        <View style={styles.trustFooter}>
          <View style={styles.trustItem}>
            <Ionicons name="shield-checkmark-outline" size={20} color="#10B981" />
            <Text style={styles.trustText}>100% Float-Safe GST Math</Text>
          </View>
          <View style={styles.trustItem}>
            <Ionicons name="flash-outline" size={20} color="#FF7D52" />
            <Text style={styles.trustText}>0ms Offline Local Speed</Text>
          </View>
          <View style={styles.trustItem}>
            <Ionicons name="cloud-done-outline" size={20} color="#34D399" />
            <Text style={styles.trustText}>Encrypted Cloud Backup</Text>
          </View>
        </View>

        {/* SEO Keywords Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerBrand}>EzBill Restaurant POS & Table Management ERP</Text>
          <Text style={styles.footerKeywords}>
            Restaurant POS · Table Management · Thermal Receipt Printing · Float-Safe GST Invoices · KOT Management · ESC/POS 58mm & 80mm Printers · Offline POS · Cloud Kitchen Software · QR Menu Ordering · ₹299 POS
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
    marginBottom: spacing.lg,
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
  loginBtn: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  loginBtnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },

  hero: { alignItems: "center", marginVertical: spacing.lg },
  pillBadge: {
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
  pillDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#10B981" },
  pillText: { color: "#FF8A3D", fontSize: 11, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" },
  heroTitle: {
    fontSize: 32,
    fontWeight: "900",
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: -0.8,
    lineHeight: 40,
    marginBottom: spacing.xs,
    maxWidth: 720,
  },
  heroSub: {
    fontSize: 14,
    color: "#94A3B8",
    textAlign: "center",
    maxWidth: 620,
    marginBottom: spacing.xs,
    lineHeight: 22,
  },
  cursiveTag: {
    fontFamily: Platform.OS === "web" ? "'Caveat', cursive, sans-serif" : undefined,
    fontSize: 22,
    color: "#FDBA74",
    fontWeight: "600",
    textAlign: "center",
    marginVertical: spacing.sm,
    letterSpacing: 0.2,
  },

  toggleContainer: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    padding: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    gap: 4,
    marginTop: spacing.md,
  },
  toggleBtn: {
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  toggleBtnActive: { backgroundColor: "#FF5E2B", shadowColor: "#FF5E2B", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10 },
  toggleText: { color: "#94A3B8", fontSize: 13, fontWeight: "700" },
  toggleTextActive: { color: "#FFFFFF" },
  discountBadge: {
    backgroundColor: "#10B981",
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  discountText: { color: "#FFFFFF", fontSize: 9, fontWeight: "900" },

  cardsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.lg,
    justifyContent: "center",
    marginVertical: spacing.xl,
  },
  card: {
    backgroundColor: "rgba(18, 22, 28, 0.85)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 24,
    padding: spacing.xl,
    width: "100%",
    position: "relative",
  },
  cardPopular: {
    borderColor: "#FF5E2B",
    backgroundColor: "rgba(26, 32, 42, 0.95)",
    shadowColor: "#FF5E2B",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 28,
  },
  popularBadge: {
    position: "absolute",
    top: -12,
    left: "50%",
    transform: [{ translateX: -115 }],
    backgroundColor: "#FF5E2B",
    paddingVertical: 4,
    paddingHorizontal: 14,
    borderRadius: 12,
    shadowColor: "#FF5E2B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  popularBadgeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900", letterSpacing: 0.3 },

  tierName: { fontSize: 21, fontWeight: "800", color: "#FFFFFF", marginTop: 4 },
  tierTagline: { fontSize: 13, color: "#94A3B8", marginTop: 4, minHeight: 36, lineHeight: 18 },
  cardCursive: {
    fontFamily: Platform.OS === "web" ? "'Caveat', cursive, sans-serif" : undefined,
    fontSize: 18,
    color: "#A7F3D0",
    fontWeight: "600",
    marginTop: 2,
  },
  priceRow: { flexDirection: "row", alignItems: "baseline", marginTop: 12 },
  priceCurrency: { fontSize: 22, fontWeight: "800", color: "#FF5E2B" },
  priceNumber: { fontSize: 38, fontWeight: "900", color: "#FFFFFF", marginLeft: 2, letterSpacing: -0.5 },
  pricePeriod: { fontSize: 14, color: "#94A3B8", fontWeight: "600", marginLeft: 6 },
  effectiveMonthly: { fontSize: 12, color: "#10B981", fontWeight: "700", marginTop: 2 },

  divider: { height: 1, backgroundColor: "rgba(255, 255, 255, 0.08)", marginVertical: spacing.lg },
  featuresHeading: { fontSize: 12, fontWeight: "800", color: "#FF8A3D", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: spacing.sm },
  featuresList: { gap: 11, marginBottom: spacing.xl },
  featureItem: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  featureText: { fontSize: 13, color: "#CBD5E1", flex: 1, lineHeight: 19 },

  ctaButton: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaPrimary: {
    backgroundColor: "#FF5E2B",
    shadowColor: "#FF5E2B",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
  },
  ctaSecondary: { backgroundColor: "rgba(255, 255, 255, 0.04)", borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.12)" },
  ctaText: { fontSize: 14, fontWeight: "800" },
  ctaPrimaryText: { color: "#FFFFFF" },
  ctaSecondaryText: { color: "#FFFFFF" },

  matrixSection: { marginVertical: spacing.xxl },
  matrixTitle: { fontSize: 24, fontWeight: "800", color: "#FFFFFF", textAlign: "center", marginBottom: 4 },
  matrixSub: { fontSize: 13, color: "#94A3B8", textAlign: "center", marginBottom: spacing.lg },
  tableWrapper: {
    backgroundColor: "rgba(18, 22, 28, 0.85)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 20,
    overflow: "hidden",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
  },
  tableHeader: { backgroundColor: "rgba(255, 255, 255, 0.03)" },
  tableRowAlt: { backgroundColor: "rgba(255, 255, 255, 0.015)" },
  tableCell: { flex: 1, fontSize: 12, color: "#94A3B8", textAlign: "center" },
  tableCellFeat: { flex: 1.8, textAlign: "left", color: "#E2E8F0", fontWeight: "600" },

  demoBanner: {
    backgroundColor: "rgba(18, 22, 28, 0.85)",
    borderWidth: 1,
    borderColor: "rgba(255, 94, 43, 0.4)",
    borderRadius: 22,
    padding: spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: spacing.xl,
    flexWrap: "wrap",
    gap: spacing.md,
  },
  demoBannerTitle: { fontSize: 18, fontWeight: "800", color: "#FFFFFF" },
  demoBannerSub: { fontSize: 13, color: "#94A3B8", marginTop: 4, lineHeight: 19 },
  demoBannerBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#10B981",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  demoBannerBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },

  trustFooter: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 24,
    flexWrap: "wrap",
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
  },
  trustItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  trustText: { color: "#CBD5E1", fontSize: 13, fontWeight: "600" },

  footer: {
    marginTop: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
    paddingTop: spacing.xl,
    alignItems: "center",
  },
  footerBrand: { fontSize: 13, fontWeight: "800", color: "#FFFFFF" },
  footerKeywords: { fontSize: 11, color: "#64748B", textAlign: "center", lineHeight: 18, marginTop: 8, maxWidth: 640 },
  copyright: { fontSize: 11, color: "#475569", marginTop: spacing.md },
});
