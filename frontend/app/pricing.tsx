import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Dimensions,
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
      badge: "BEST FOR SINGLE OUTLET",
      popular: true,
      priceMonthly: 299,
      priceYearly: 2999,
      tagline: "Ultra-fast 0ms local speed for standalone restaurants & cafes",
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
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0E" />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          isDesktop && { maxWidth: 1160, alignSelf: "center", width: "100%" },
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
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.logoRow}>
            <View style={styles.logoBadge}>
              <Ionicons name="restaurant" size={18} color="#FFFFFF" />
            </View>
            <Text style={styles.logoText}>EzBill Pricing</Text>
          </View>
          <TouchableOpacity
            style={styles.loginBtn}
            onPress={() => router.push("/login")}
            activeOpacity={0.8}
          >
            <Text style={styles.loginBtnText}>Login</Text>
          </TouchableOpacity>
        </View>

        {/* Hero Section */}
        <View style={styles.hero}>
          <View style={styles.pillBadge}>
            <Ionicons name="pricetags" size={12} color="#818CF8" />
            <Text style={styles.pillText}>TRANSPARENT & AFFORDABLE</Text>
          </View>
          <Text style={styles.heroTitle}>Simple Plans for Growing Restaurants</Text>
          <Text style={styles.heroSub}>
            No hidden setup fees. No sales commissions. Upgrade or cancel anytime.
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
                Yearly Billing
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

                <Text style={styles.featuresHeading}>What's included:</Text>
                <View style={styles.featuresList}>
                  {tier.features.map((feat, i) => (
                    <View key={i} style={styles.featureItem}>
                      <Ionicons name="checkmark-circle" size={16} color="#10B981" style={{ marginTop: 2 }} />
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
          <Text style={styles.matrixTitle}>Plan Comparison Matrix</Text>
          <View style={styles.tableWrapper}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <Text style={[styles.tableCell, styles.tableCellFeat, { fontWeight: "800", color: "#FFFFFF" }]}>Feature</Text>
              <Text style={[styles.tableCell, { fontWeight: "800", color: "#635BFF" }]}>Starter (₹299)</Text>
              <Text style={[styles.tableCell, { fontWeight: "800", color: "#818CF8" }]}>Growth (₹999)</Text>
              <Text style={[styles.tableCell, { fontWeight: "800", color: "#34D399" }]}>Pro (₹1999)</Text>
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
            <Text style={styles.demoBannerTitle}>Want to test billing first?</Text>
            <Text style={styles.demoBannerSub}>
              Try our interactive billing demo without signing up or creating an account.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.demoBannerBtn}
            onPress={() => router.push("/demo-billing")}
            activeOpacity={0.85}
          >
            <Text style={styles.demoBannerBtnText}>Try Demo Billing</Text>
          </TouchableOpacity>
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
  safe: { flex: 1, backgroundColor: "#0A0A0E" },
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
  loginBtn: {
    backgroundColor: "#16161C",
    borderWidth: 1,
    borderColor: "#2E2E38",
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  loginBtnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },

  hero: { alignItems: "center", marginVertical: spacing.lg },
  pillBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(99, 91, 255, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(99, 91, 255, 0.3)",
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: 20,
    marginBottom: spacing.sm,
  },
  pillText: { color: "#818CF8", fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  heroTitle: {
    fontSize: 30,
    fontWeight: "900",
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: -0.5,
    lineHeight: 38,
    marginBottom: spacing.xs,
  },
  heroSub: {
    fontSize: 14,
    color: "#94A3B8",
    textAlign: "center",
    maxWidth: 620,
    marginBottom: spacing.lg,
  },

  toggleContainer: {
    flexDirection: "row",
    backgroundColor: "#16161C",
    padding: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2E2E38",
    gap: 4,
  },
  toggleBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  toggleBtnActive: { backgroundColor: "#635BFF" },
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
    backgroundColor: "#16161C",
    borderWidth: 1,
    borderColor: "#2E2E38",
    borderRadius: 24,
    padding: spacing.xl,
    width: "100%",
    position: "relative",
  },
  cardPopular: {
    borderColor: "#635BFF",
    backgroundColor: "#181824",
    shadowColor: "#635BFF",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
  },
  popularBadge: {
    position: "absolute",
    top: -12,
    left: "50%",
    transform: [{ translateX: -70 }],
    backgroundColor: "#635BFF",
    paddingVertical: 4,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  popularBadgeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },

  tierName: { fontSize: 20, fontWeight: "800", color: "#FFFFFF", marginTop: 4 },
  tierTagline: { fontSize: 12, color: "#94A3B8", marginTop: 4, minHeight: 32 },
  priceRow: { flexDirection: "row", alignItems: "baseline", marginTop: 12 },
  priceCurrency: { fontSize: 20, fontWeight: "800", color: "#635BFF" },
  priceNumber: { fontSize: 36, fontWeight: "900", color: "#FFFFFF", marginLeft: 2 },
  pricePeriod: { fontSize: 13, color: "#94A3B8", fontWeight: "600", marginLeft: 6 },
  effectiveMonthly: { fontSize: 11, color: "#10B981", fontWeight: "700", marginTop: 2 },

  divider: { height: 1, backgroundColor: "#2E2E38", marginVertical: spacing.lg },
  featuresHeading: { fontSize: 12, fontWeight: "800", color: "#818CF8", textTransform: "uppercase", marginBottom: spacing.sm },
  featuresList: { gap: 10, marginBottom: spacing.xl },
  featureItem: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  featureText: { fontSize: 13, color: "#CBD5E1", flex: 1, lineHeight: 18 },

  ctaButton: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaPrimary: { backgroundColor: "#635BFF" },
  ctaSecondary: { backgroundColor: "#262630", borderWidth: 1, borderColor: "#3E3E4C" },
  ctaText: { fontSize: 14, fontWeight: "800" },
  ctaPrimaryText: { color: "#FFFFFF" },
  ctaSecondaryText: { color: "#FFFFFF" },

  matrixSection: { marginVertical: spacing.xxl },
  matrixTitle: { fontSize: 22, fontWeight: "800", color: "#FFFFFF", textAlign: "center", marginBottom: spacing.lg },
  tableWrapper: {
    backgroundColor: "#16161C",
    borderWidth: 1,
    borderColor: "#2E2E38",
    borderRadius: 16,
    overflow: "hidden",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#2E2E38",
    alignItems: "center",
  },
  tableHeader: { backgroundColor: "#1C1C24" },
  tableRowAlt: { backgroundColor: "rgba(255, 255, 255, 0.02)" },
  tableCell: { flex: 1, fontSize: 12, color: "#94A3B8", textAlign: "center" },
  tableCellFeat: { flex: 1.8, textAlign: "left", color: "#E2E8F0", fontWeight: "600" },

  demoBanner: {
    backgroundColor: "#16161C",
    borderWidth: 1,
    borderColor: "rgba(99, 91, 255, 0.4)",
    borderRadius: 20,
    padding: spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: spacing.xl,
    flexWrap: "wrap",
    gap: spacing.md,
  },
  demoBannerTitle: { fontSize: 17, fontWeight: "800", color: "#FFFFFF" },
  demoBannerSub: { fontSize: 12, color: "#94A3B8", marginTop: 4 },
  demoBannerBtn: {
    backgroundColor: "#635BFF",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
  },
  demoBannerBtnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },

  footer: {
    marginTop: spacing.xxl,
    borderTopWidth: 1,
    borderTopColor: "#1E1E26",
    paddingTop: spacing.xl,
    alignItems: "center",
  },
  footerBrand: { fontSize: 13, fontWeight: "800", color: "#FFFFFF" },
  footerKeywords: { fontSize: 11, color: "#64748B", textAlign: "center", lineHeight: 18, marginTop: 8, maxWidth: 640 },
  copyright: { fontSize: 11, color: "#475569", marginTop: spacing.md },
});
