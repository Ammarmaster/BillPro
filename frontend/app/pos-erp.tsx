import React from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  StatusBar,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
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

export default function PosErpSeoScreen() {
  const router = useRouter();
  const { isDesktop } = useResponsive();
  const isPhone = useWindowDimensions().width < 576;

  const features = [
    {
      icon: "grid-outline",
      title: "Live Table Management",
      cursive: "Interactive Floor Layout",
      desc: "Visual table layout showing Vacant, Occupied, and Settle states with live dining timers, split bills, and table merging.",
    },
    {
      icon: "calculator-outline",
      title: "Accurate GST Invoices",
      cursive: "100% Tax Compliant",
      desc: "Automatic calculation of CGST (2.5%), SGST (2.5%), customized discounts, service charges, and round-offs.",
    },
    {
      icon: "print-outline",
      title: "Fast Bill & KOT Printing",
      cursive: "Works with all Printers",
      desc: "Instant wireless receipt printing for thermal printers via Bluetooth, USB, WiFi, Ethernet LAN, and direct Web Browser print.",
    },
    {
      icon: "flash-outline",
      title: "100% Offline Billing",
      cursive: "Zero Internet Lag",
      desc: "Process table orders and customer invoices with zero lag even when internet disconnects, syncing automatically to cloud.",
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
      cursive: "Photo Catalog Scanner",
      desc: "Upload photos of physical printed menus to automatically create categories, items, and pricing in seconds.",
    },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={receipt.page} />
      <ReceiptTopBar
        label="Features"
        onBack={() => router.back()}
        right={
          <ReceiptButton label="Login" variant="outline" style={styles.smallBtn} onPress={() => router.push("/login")} />
        }
      />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.column}>
          <View style={styles.paper}>
            <View style={styles.section}>
              <Mono style={styles.billBrand}>EZBILL</Mono>
              <Mono style={styles.billSub}>Everything on the bill</Mono>
              <ReceiptRule style={styles.rule} />
              <Display accessibilityRole="header" style={[styles.heroTitle, isPhone && styles.heroTitlePhone]}>
                POS, tables and GST billing in one place.
              </Display>
              <Mono style={styles.heroSub}>
                Fast table ordering, automated GST calculations, wireless thermal receipt and KOT printing, and offline
                billing starting at ₹299/month.
              </Mono>
              <View style={styles.ctaRow}>
                <ReceiptButton
                  label="Start for ₹299/mo"
                  icon="arrow-forward"
                  style={styles.ctaBtn}
                  onPress={() => router.push("/register")}
                />
                <ReceiptButton
                  label="Try demo billing"
                  icon="play-outline"
                  variant="outline"
                  style={styles.ctaBtn}
                  onPress={() => router.push("/demo-billing")}
                />
              </View>
            </View>

            <ReceiptRule />

            <View style={styles.section}>
              <ReceiptSectionTitle
                label="Items"
                title="What you get."
                subtitle="Everything you need to manage orders, tables, and bills."
                compact={isPhone}
              />
              <View style={styles.grid}>
                {features.map((f, idx) => (
                  <View key={f.title} style={[styles.card, { width: isDesktop ? "31.8%" : isPhone ? "100%" : "48.5%" }]}>
                    <View style={styles.cardHead}>
                      <Ionicons name={f.icon as any} size={22} color={receipt.ink} />
                      <Mono style={styles.cardNumber}>{String(idx + 1).padStart(2, "0")}</Mono>
                    </View>
                    <Mono style={styles.cardTag}>{f.cursive}</Mono>
                    <Display style={styles.cardTitle}>{f.title}</Display>
                    <Mono style={styles.cardDesc}>{f.desc}</Mono>
                  </View>
                ))}
              </View>
            </View>

            <ReceiptRule />

            <View style={styles.section}>
              <ReceiptSectionTitle label="Total" title="Starter plan" compact={isPhone} />
              <View style={styles.totalLines}>
                <ReceiptRow label="Monthly" value="₹299" bold />
                <ReceiptRow label="Or yearly" value="₹2,999" />
                <ReceiptRow label="Offline billing" value="yes" valueColor={receipt.success} />
                <ReceiptRow label="Table management" value="yes" valueColor={receipt.success} />
                <ReceiptRow label="Bill and KOT printing" value="yes" valueColor={receipt.success} />
                <ReceiptRow label="Automatic cloud backup" value="yes" valueColor={receipt.success} />
              </View>
              <ReceiptButton label="Create your account" style={styles.planBtn} onPress={() => router.push("/register")} />
            </View>

            <ReceiptRule />

            <View style={styles.section}>
              <ReceiptBarcode />
              <Mono style={styles.keywords}>
                Restaurant POS · Table Management · Bill Printing · GST Invoice Calculations · KOT Management · ESC/POS 58mm
                and 80mm Printers · Offline POS · Cafe ERP · Cloud Kitchen Software · QR Menu Ordering
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
    paddingTop: 20,
    paddingBottom: 48,
  },
  column: {
    width: "100%",
    maxWidth: 1000,
  },
  smallBtn: {
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  paper: {
    backgroundColor: receipt.paper,
  },
  section: {
    padding: 24,
  },
  billBrand: {
    fontSize: 26,
    fontWeight: "700",
    textAlign: "center",
  },
  billSub: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    color: receipt.muted,
  },
  rule: {
    marginVertical: 16,
  },
  heroTitle: {
    fontSize: 58,
    lineHeight: 60,
    letterSpacing: -1.5,
  },
  heroTitlePhone: {
    fontSize: 36,
    lineHeight: 38,
    letterSpacing: -0.8,
  },
  heroSub: {
    fontSize: 14,
    lineHeight: 22,
    color: receipt.muted,
    marginTop: 12,
    maxWidth: 680,
  },
  ctaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 18,
  },
  ctaBtn: {
    flexGrow: 1,
    flexBasis: 200,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 14,
    marginTop: 18,
  },
  card: {
    borderWidth: 2,
    borderColor: receipt.ink,
    padding: 14,
    gap: 6,
  },
  cardHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardNumber: {
    fontSize: 12,
    fontWeight: "700",
    color: receipt.muted,
  },
  cardTag: {
    fontSize: 12,
    fontWeight: "700",
    color: receipt.accent,
    marginTop: 4,
  },
  cardTitle: {
    fontSize: 21,
    lineHeight: 25,
    letterSpacing: -0.3,
  },
  cardDesc: {
    fontSize: 12,
    lineHeight: 19,
    color: receipt.muted,
  },
  totalLines: {
    marginTop: 14,
  },
  planBtn: {
    marginTop: 16,
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
