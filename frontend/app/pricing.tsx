import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import {
  Display,
  Mono,
  PaperEdge,
  ReceiptBarcode,
  ReceiptButton,
  ReceiptRow,
  ReceiptRule,
  ReceiptSectionTitle,
  ReceiptTopBar,
  receipt,
} from "@/src/components/ReceiptKit";
import { useResponsive } from "@/src/hooks/useResponsive";

export default function PricingScreen() {
  const router = useRouter();
  const { isDesktop } = useResponsive();
  const isPhone = useWindowDimensions().width < 576;
  const [isYearly, setIsYearly] = useState(false);

  const tiers = [
    {
      id: "starter",
      name: "Starter Plan",
      badge: "Standalone and local billing",
      popular: false,
      priceMonthly: 299,
      priceYearly: 2999,
      tagline: "Fast 100% offline billing for standalone restaurants, cafes & bakeries",
      cursiveNote: "1 owner account · No internet required",
      features: [
        "1 Owner Account (Fast Offline Billing)",
        "100% Offline Fast Billing (Zero Internet Lag)",
        "Complete Table & Floor Visual Management",
        "Accurate GST Invoices & Item Tax Setup",
        "Thermal Bill & Kitchen KOT Receipt Printing",
        "Menu & Category CRUD with Live Search",
        "Cash Register & Daily Sales Summary",
        "Automatic Cloud Backup & Data Security",
        "Light & Dark Mode Interface",
      ],
      cta: "Choose Starter (₹299/mo)",
      ctaPrimary: false,
    },
    {
      id: "growth",
      name: "Growth Dine-In",
      badge: "Multi-staff",
      popular: true,
      priceMonthly: 499,
      priceYearly: 4999,
      tagline: "Designed for busy dine-in spots with captain apps, staff logins and live kitchen displays",
      cursiveNote: "Up to 5 users (owner + 4 staff) · Realtime sync",
      features: [
        "Everything in Starter Plan",
        "Up to 5 Users (Owner + 4 Waiter Captains)",
        "Staff PIN Authentication & Role Controls",
        "Live Kitchen Display System (KDS) & Order Tracker",
        "Multi-Device Realtime Sync across Tables",
        "Role-Based Push & Sound Notifications",
        "Sales Analytics Dashboard (Daily, Monthly & Yearly)",
        "AI Smart Menu Photo Importer (Paper to App)",
        "Inventory Stock & Daily Expense Tracking",
        "Waiter-wise Performance & Order Reports",
      ],
      cta: "Choose Growth (₹499/mo)",
      ctaPrimary: true,
    },
    {
      id: "pro",
      name: "Pro Digital Restaurant",
      badge: "Enterprise and digital QR",
      popular: false,
      priceMonthly: 999,
      priceYearly: 9999,
      tagline: "For high-volume multi-floor restaurants, bars, breweries, franchises & cloud kitchens",
      cursiveNote: "Up to 15 users · QR table ordering and standees",
      features: [
        "Everything in Growth Plan",
        "Up to 15 Users (Owner + 14 Staff/Captains)",
        "Customer QR Table Menu & Self-Ordering System",
        "Table QR Standee Generator with Branding",
        "Waiter Digital Order Confirmation & QR Accept/Reject",
        "Multi-Station KOT Routing (Separate Bar & Kitchen)",
        "Advanced Role Permissions & Custom Security",
        "Complete Platform Audit Logs & Activity History",
        "Priority 24/7 Dedicated Support & Fast Channels",
        "Advanced AI Features & Integration Webhooks",
      ],
      cta: "Choose Pro (₹999/mo)",
      ctaPrimary: false,
    },
  ];

  const comparisonRows = [
    { feature: "Offline Billing (Zero Internet Lag)", starter: "✅", growth: "✅", pro: "✅" },
    { feature: "Table Management & Floor Layout", starter: "✅", growth: "✅", pro: "✅" },
    { feature: "Accurate GST Invoices & Taxes", starter: "✅", growth: "✅", pro: "✅" },
    { feature: "Thermal Receipt & KOT Printing", starter: "✅", growth: "✅", pro: "✅" },
    { feature: "Cloud Data Backup & Security", starter: "✅", growth: "✅", pro: "✅" },
    { feature: "User & Staff Accounts", starter: "1 User (Owner Only)", growth: "Up to 5 Users (Owner + 4 Staff)", pro: "Up to 15 Users (Owner + 14 Staff)" },
    { feature: "Staff PINs & Shift Tracking", starter: "—", growth: "✅", pro: "✅" },
    { feature: "Kitchen Display System (KDS)", starter: "—", growth: "✅", pro: "✅" },
    { feature: "Multi-Device Realtime Sync", starter: "—", growth: "✅", pro: "✅" },
    { feature: "Role-based Notifications", starter: "—", growth: "✅", pro: "Advanced" },
    { feature: "Sales Analytics & Reports", starter: "—", growth: "✅", pro: "✅" },
    { feature: "AI Menu Photo Importer", starter: "—", growth: "✅", pro: "✅" },
    { feature: "Inventory Stock & Expenses", starter: "—", growth: "✅", pro: "✅" },
    { feature: "Customer QR Table Menu", starter: "—", growth: "—", pro: "✅" },
    { feature: "Customer Self-Ordering System", starter: "—", growth: "—", pro: "✅" },
    { feature: "Table QR Standee Generator", starter: "—", growth: "—", pro: "✅" },
    { feature: "Waiter QR Order Confirmation", starter: "—", growth: "—", pro: "✅" },
    { feature: "Multi-Station KOT Routing", starter: "—", growth: "—", pro: "✅" },
    { feature: "Audit Logs & Advanced Security", starter: "—", growth: "—", pro: "✅" },
    { feature: "API & Webhook Integrations", starter: "—", growth: "—", pro: "✅" },
    { feature: "Customer Support Level", starter: "Standard", growth: "Priority Email & Chat", pro: "24/7 Dedicated VIP" },
  ];

  const showCell = (value: string) => (value === "✅" ? "yes" : value === "—" ? "-" : value);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={receipt.page} />
      <ReceiptTopBar
        label="Pricing"
        onBack={() => router.back()}
        right={
          <ReceiptButton label="Login" variant="outline" style={styles.smallBtn} onPress={() => router.push("/login")} />
        }
      />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.column}>
          <View style={styles.hero}>
            <Display accessibilityRole="header" style={[styles.heroTitle, isPhone && styles.heroTitlePhone]}>
              Simple bills. Simple plans.
            </Display>
            <Mono style={styles.heroSub}>
              Zero setup fees. Zero commission on food orders. Upgrade, switch, or cancel anytime.
            </Mono>

            <View style={styles.toggle}>
              <TouchableOpacity
                style={[styles.toggleBtn, !isYearly && styles.toggleBtnActive]}
                onPress={() => setIsYearly(false)}
                activeOpacity={0.8}
              >
                <Mono style={[styles.toggleText, !isYearly && styles.toggleTextActive]}>Monthly</Mono>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, isYearly && styles.toggleBtnActive]}
                onPress={() => setIsYearly(true)}
                activeOpacity={0.8}
              >
                <Mono style={[styles.toggleText, isYearly && styles.toggleTextActive]}>Annual · save 20%</Mono>
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.cardsGrid, isDesktop && styles.cardsGridDesktop]}>
            {tiers.map((tier) => {
              const price = isYearly ? tier.priceYearly : tier.priceMonthly;
              return (
                <View key={tier.id} style={isDesktop ? styles.cardDesktop : styles.cardStacked}>
                  <View style={styles.card}>
                    {tier.popular && (
                      <View style={styles.stamp}>
                        <Mono style={styles.stampText}>Most popular</Mono>
                      </View>
                    )}
                    <Mono style={styles.cardBadge}>{tier.badge}</Mono>
                    <Display style={styles.tierName}>{tier.name}</Display>
                    <Mono style={styles.tierTagline}>{tier.tagline}</Mono>
                    <ReceiptRule style={styles.rule} />

                    <View style={styles.priceRow}>
                      <Display style={styles.priceNumber}>₹{price.toLocaleString("en-IN")}</Display>
                      <Mono style={styles.pricePeriod}>{isYearly ? "/ year" : "/ month"}</Mono>
                    </View>
                    {isYearly && (
                      <Mono style={styles.effectiveMonthly}>₹{Math.round(price / 12)} / month equivalent</Mono>
                    )}
                    <Mono style={styles.cardNote}>{tier.cursiveNote}</Mono>

                    <ReceiptRule style={styles.rule} />

                    <View style={styles.featuresList}>
                      {tier.features.map((feat, i) => (
                        <View key={i} style={styles.featureItem}>
                          <Mono style={styles.featureMark}>[x]</Mono>
                          <Mono style={styles.featureText}>{feat}</Mono>
                        </View>
                      ))}
                    </View>

                    <ReceiptButton
                      label={tier.cta}
                      variant={tier.ctaPrimary ? "ink" : "outline"}
                      style={styles.cardCta}
                      onPress={() => router.push("/register")}
                    />
                  </View>
                  <PaperEdge />
                </View>
              );
            })}
          </View>

          <View style={styles.paperBlock}>
            <View style={styles.paperInner}>
              <ReceiptSectionTitle
                label="Compare"
                title="Every feature, line by line."
                subtitle="Compare what each EzBill plan includes."
                compact={isPhone}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={isPhone} contentContainerStyle={styles.tableScroll}>
                <View style={styles.table}>
                  <View style={[styles.tableRow, styles.tableHead]}>
                    <Mono style={[styles.tableCell, styles.tableCellFeat, styles.tableHeadText]}>Feature</Mono>
                    <Mono style={[styles.tableCell, styles.tableHeadText]}>Starter ₹299/mo</Mono>
                    <Mono style={[styles.tableCell, styles.tableHeadText]}>Growth ₹499/mo</Mono>
                    <Mono style={[styles.tableCell, styles.tableHeadText]}>Pro ₹999/mo</Mono>
                  </View>
                  {comparisonRows.map((row, idx) => (
                    <View key={idx} style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}>
                      <Mono style={[styles.tableCell, styles.tableCellFeat]}>{row.feature}</Mono>
                      <Mono style={styles.tableCell}>{showCell(row.starter)}</Mono>
                      <Mono style={styles.tableCell}>{showCell(row.growth)}</Mono>
                      <Mono style={styles.tableCell}>{showCell(row.pro)}</Mono>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
            <ReceiptRule />
            <View style={styles.paperInner}>
              <ReceiptSectionTitle
                label="Try first"
                title="Want to test the billing first?"
                subtitle="Try table ordering, GST calculations, and thermal receipt previews right in your browser."
                compact={isPhone}
              />
              <ReceiptButton
                label="Launch demo"
                icon="play-outline"
                style={styles.demoBtn}
                onPress={() => router.push("/demo-billing")}
              />
            </View>
            <ReceiptRule />
            <View style={styles.paperInner}>
              <ReceiptRow label="Accurate GST billing" value="yes" valueColor={receipt.success} />
              <ReceiptRow label="Offline billing" value="yes" valueColor={receipt.success} />
              <ReceiptRow label="Automatic cloud backup" value="yes" valueColor={receipt.success} />
              <ReceiptRule style={styles.rule} />
              <ReceiptBarcode />
              <Mono style={styles.keywords}>
                Restaurant POS · Table Management · Thermal Receipt Printing · Accurate GST Invoices · Kitchen KOT · Bill
                Printing · Offline POS · Cafe & Bar Billing · QR Code Ordering · ₹299 POS
              </Mono>
              <Mono style={styles.copyright}>© 2026 EzBill / ProDevOpz Solutions. All rights reserved.</Mono>
            </View>
          </View>
          <PaperEdge />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: receipt.page,
  },
  scroll: {
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 48,
  },
  column: {
    width: "100%",
    maxWidth: 1180,
  },
  smallBtn: {
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  hero: {
    alignItems: "center",
    paddingTop: 34,
    paddingBottom: 26,
    gap: 12,
  },
  heroTitle: {
    fontSize: 60,
    lineHeight: 62,
    letterSpacing: -1.6,
    textAlign: "center",
  },
  heroTitlePhone: {
    fontSize: 38,
    lineHeight: 40,
    letterSpacing: -0.9,
  },
  heroSub: {
    fontSize: 14,
    lineHeight: 22,
    color: receipt.pageInk,
    textAlign: "center",
    maxWidth: 620,
  },
  toggle: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginTop: 6,
  },
  toggleBtn: {
    minHeight: 42,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 2,
    borderColor: receipt.ink,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleBtnActive: {
    backgroundColor: receipt.ink,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: "700",
  },
  toggleTextActive: {
    color: receipt.paper,
  },
  cardsGrid: {
    gap: 22,
    alignItems: "center",
    marginBottom: 26,
  },
  cardsGridDesktop: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 16,
  },
  cardDesktop: {
    flex: 1,
    minWidth: 0,
  },
  cardStacked: {
    width: "100%",
    maxWidth: 520,
  },
  card: {
    flexGrow: 1,
    backgroundColor: receipt.paper,
    padding: 20,
  },
  stamp: {
    position: "absolute",
    top: 12,
    right: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 2,
    borderColor: receipt.accent,
    borderRadius: 4,
    transform: [{ rotate: "4deg" }],
    zIndex: 1,
  },
  stampText: {
    fontSize: 11,
    fontWeight: "700",
    color: receipt.accent,
  },
  cardBadge: {
    fontSize: 11,
    fontWeight: "700",
    color: receipt.accent,
    marginBottom: 12,
    paddingRight: 96,
  },
  tierName: {
    fontSize: 27,
    lineHeight: 30,
    letterSpacing: -0.4,
  },
  tierTagline: {
    fontSize: 13,
    lineHeight: 20,
    color: receipt.muted,
    marginTop: 8,
  },
  rule: {
    marginVertical: 14,
  },
  priceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: 6,
  },
  priceNumber: {
    fontSize: 46,
    lineHeight: 50,
    letterSpacing: -1.2,
  },
  pricePeriod: {
    fontSize: 13,
    color: receipt.muted,
  },
  effectiveMonthly: {
    fontSize: 12,
    color: receipt.muted,
    marginTop: 2,
  },
  cardNote: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    marginTop: 8,
  },
  featuresList: {
    gap: 6,
    flexGrow: 1,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  featureMark: {
    fontSize: 12,
    lineHeight: 19,
    fontWeight: "700",
    color: receipt.success,
  },
  featureText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 19,
  },
  cardCta: {
    marginTop: 18,
  },
  paperBlock: {
    width: "100%",
    backgroundColor: receipt.paper,
  },
  paperInner: {
    padding: 22,
  },
  tableScroll: {
    flexGrow: 1,
    marginTop: 18,
  },
  table: {
    flexGrow: 1,
    minWidth: 720,
    borderWidth: 2,
    borderColor: receipt.ink,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: receipt.rule,
  },
  tableRowAlt: {
    backgroundColor: receipt.tint,
  },
  tableHead: {
    backgroundColor: receipt.ink,
    borderBottomWidth: 0,
  },
  tableHeadText: {
    fontWeight: "700",
    color: receipt.paper,
  },
  tableCell: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 12,
    lineHeight: 18,
  },
  tableCellFeat: {
    flex: 1.6,
    fontWeight: "700",
  },
  demoBtn: {
    marginTop: 14,
    alignSelf: "flex-start",
  },
  keywords: {
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
    color: receipt.muted,
    marginTop: 12,
  },
  copyright: {
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
    color: receipt.muted,
    marginTop: 8,
  },
});
