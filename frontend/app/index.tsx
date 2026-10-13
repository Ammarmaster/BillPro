import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Platform,
  Image,
  Modal,
  Linking,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { useResponsive } from "@/src/hooks/useResponsive";
import { spacing, radius } from "@/src/theme";

// Helper to resolve images safely across Web and Native
const getImgUri = (fileName: string) => {
  if (Platform.OS === "web") {
    return `/assets/images/${fileName}`;
  }
  return `https://www.ezybills.in/assets/images/${fileName}`;
};

// WhatsApp contact constant
const WHATSAPP_NUMBER = "917778880874";
const WHATSAPP_BASE_URL = `https://api.whatsapp.com/send/?phone=${WHATSAPP_NUMBER}&text=`;

interface ProductItem {
  id: string;
  title: string;
  category: "machines" | "printers" | "software" | "supplies";
  image: string;
  originalPrice: string;
  salePrice: string;
  discount: string;
  shortDesc: string;
  description: string;
  packageIncludes?: string[];
  features?: string[];
  specs?: { label: string; value: string }[];
}

const PRODUCTS: ProductItem[] = [
  {
    id: "app-android",
    title: "EzBills Android Billing App",
    category: "software",
    image: "18.jpeg",
    originalPrice: "Rs. 2,999",
    salePrice: "Rs. 1,999",
    discount: "33% OFF",
    shortDesc: "Cloud & Mobile POS Billing Solution for retail & restaurants.",
    description:
      "Cloud-based POS billing software for retail shops and food businesses. Flexible and available on-the-go, our mobile-based retail billing software gives you complete freedom.",
    features: [
      "Sale & Billing (Professional Bills & GST Invoices)",
      "Udhari (Credit) & Ledger Management",
      "Real-time Stock & Inventory Management",
      "Customer & Supplier Management",
      "Product Catalog with Barcode Scanning",
      "Expense & Cashflow Management",
      "Daily Sales & Purchase Reports",
      "Profit & Loss (P&L) Analytics",
    ],
  },
  {
    id: "regular-machine",
    title: "EzBills Regular Billing Machine",
    category: "machines",
    image: "1.jpeg",
    originalPrice: "Rs. 5,499",
    salePrice: "Rs. 3,999",
    discount: "27% OFF",
    shortDesc: "Complete portable billing kit with 2-inch thermal printer.",
    description:
      "All-in-one wireless POS setup. Print GST invoices and receipts instantly with long-lasting battery power.",
    features: [
      "Sale & Billing (GST Invoices)",
      "Udhari & Customer Management",
      "Stock & Expense Tracking",
      "Sales & Purchase Reports",
      "P&L Analytics",
    ],
    packageIncludes: [
      "Billing Software License (1 Year)",
      "Regular Battery 2-inch Thermal Printer (1 Year Warranty)",
      "Fast Charger With Adapter",
      "Printer Leather Protective Cover",
      "5 Premium Thermal Paper Rolls",
    ],
  },
  {
    id: "bada-machine",
    title: "EzBills Bada Billing Machine",
    category: "machines",
    image: "2.jpeg",
    originalPrice: "Rs. 5,999",
    salePrice: "Rs. 4,499",
    discount: "25% OFF",
    shortDesc: "Heavy-duty 2-inch thermal printer + full billing software.",
    description:
      "Built for busy retail counters, grocery stores, and cafes. High-speed thermal mechanism designed for continuous billing.",
    features: [
      "High-speed inkless thermal printing",
      "Full offline billing capability",
      "GST compliance & digital receipts",
      "Customer credit & ledger management",
    ],
    packageIncludes: [
      "Billing Software (1 Year)",
      "Bada 2-inch Thermal Printer (1 Year Warranty)",
      "Heavy-duty Power Cable",
      "5 Thermal Paper Rolls",
    ],
  },
  {
    id: "bada-3inch-setup",
    title: "EzBills Bada 3 Inch Billing Setup",
    category: "machines",
    image: "3.jpeg",
    originalPrice: "Rs. 7,999",
    salePrice: "Rs. 5,999",
    discount: "25% OFF",
    shortDesc: "Wide 80mm format thermal printer setup with 1-year software.",
    description:
      "Wide 3-inch (80mm) bill printer setup for detailed GST invoices, restaurant itemized bills, and fast customer checkout.",
    features: [
      "Wide 80mm receipt printing",
      "Table management & KOT printing support",
      "Multi-payment QR codes on bills",
      "Complete inventory and stock control",
    ],
    packageIncludes: [
      "Billing Software (1 Year)",
      "Bada 3-inch Thermal Printer (1 Year Warranty)",
      "Power Cable & Adapter",
      "3 Large 80mm Paper Rolls",
    ],
  },
  {
    id: "label-printer",
    title: "EzBills 2in1 Label Printer + Software",
    category: "printers",
    image: "4.jpeg",
    originalPrice: "Rs. 7,999",
    salePrice: "Rs. 5,999",
    discount: "25% OFF",
    shortDesc: "Portable label sticker + receipt printer for MRP & barcodes.",
    description:
      "Portable Dual-Mode Thermal Printer – Prints both sticky barcode/MRP labels and standard customer receipts wirelessly.",
    features: [
      "Dual mode: Adhesive labels & receipt printing",
      "Bluetooth & USB high-speed connectivity",
      "Crisp 203 DPI print resolution",
      "Print barcodes, QR codes, MRP tags & expiry dates",
      "Supports 57.5mm standard paper width",
      "1-Year replacement warranty",
    ],
  },
  {
    id: "desktop-software",
    title: "EzBills Desktop Billing Software",
    category: "software",
    image: "5.jpeg",
    originalPrice: "Rs. 9,999",
    salePrice: "Rs. 4,999",
    discount: "50% OFF",
    shortDesc: "Full restaurant & retail management software for Windows & Mac.",
    description:
      "Run your Restaurant, Cafe, Cloud Kitchen, or Supermarket smarter. Advanced KOT kitchen dispatch, floor tables, and automated GST compliance.",
    features: [
      "Fast & error-free POS billing",
      "KOT (Kitchen Order Tickets) management",
      "QR Code Ordering & contactless dining",
      "Live table & floor reservation manager",
      "Inventory & recipe ingredient tracking",
      "Multi-branch & cloud synchronization",
    ],
  },
  {
    id: "z91-mobile-pos",
    title: "Handheld Touch Screen Mobile POS (Z91)",
    category: "machines",
    image: "6.jpeg",
    originalPrice: "Rs. 19,999",
    salePrice: "Rs. 16,499",
    discount: "18% OFF",
    shortDesc: "All-in-one Android terminal with built-in thermal printer & NFC.",
    description:
      "The flagship Z91 Android POS handheld device with 5.5-inch touch screen, built-in 58mm printer, contactless NFC reader, and long 2800mAh battery.",
    specs: [
      { label: "OS", value: "Android 11 Upgraded" },
      { label: "Processor", value: "Quad Core High Speed" },
      { label: "Memory", value: "2GB RAM + 16GB Storage" },
      { label: "Display", value: "5.5-inch Capacitive Touch" },
      { label: "Printer", value: "Built-in 58mm Ultra-Fast Thermal" },
      { label: "Battery", value: "2800mAh Rechargeable" },
      { label: "Connectivity", value: "4G Dual SIM, WiFi, Bluetooth" },
    ],
  },
  {
    id: "ps80-pos-terminal",
    title: "PS80 Android POS Terminal",
    category: "machines",
    image: "7.jpeg",
    originalPrice: "Rs. 29,999",
    salePrice: "Rs. 24,999",
    discount: "17% OFF",
    shortDesc: "8-inch IPS Android counter terminal with high-speed printer.",
    description:
      "Commercial-grade Android 12 POS terminal with 8-inch IPS touch screen, integrated 80mm thermal receipt printer (90 mm/sec), and long-life 6400mAh battery.",
    specs: [
      { label: "Display", value: "8-inch IPS 1280x800 Multi-Touch" },
      { label: "OS", value: "Android 12 Enterprise" },
      { label: "Memory", value: "3GB RAM + High Storage" },
      { label: "Printer", value: "Integrated 80mm (90 mm/s speed)" },
      { label: "Battery", value: "6400mAh (Up to 30 hrs runtime)" },
    ],
  },
  {
    id: "ps11-pos-terminal",
    title: "PS11 Android POS Terminal (Dual Display)",
    category: "machines",
    image: "8.jpeg",
    originalPrice: "Rs. 38,999",
    salePrice: "Rs. 34,999",
    discount: "10% OFF",
    shortDesc: "11-inch IPS 8-Core terminal with 2.4-inch customer screen.",
    description:
      "Enterprise flagship terminal. Features 11-inch IPS high-resolution screen, RK3562 8-Core processor, customer-facing secondary display, NFC reader, and 80mm printer.",
    specs: [
      { label: "OS", value: "Android 13.0" },
      { label: "Display", value: "11-inch 800x1280 IPS Main Screen" },
      { label: "Customer Panel", value: "2.4-inch Integrated Second Display" },
      { label: "Processor", value: "RK3562 8-Core 2.0GHz" },
      { label: "Memory", value: "4GB RAM + 64GB Storage" },
      { label: "Printer", value: "80mm High Speed Thermal + NFC" },
      { label: "Battery", value: "6400mAh Capacity" },
    ],
  },
  {
    id: "pos-95a-terminal",
    title: "95A Dual-Screen Android POS Counter Station",
    category: "machines",
    image: "9.jpeg",
    originalPrice: "Rs. 49,999",
    salePrice: "Rs. 38,999",
    discount: "22% OFF",
    shortDesc: "15.6-inch Touch Countertop POS with built-in auto-cut printer.",
    description:
      "Flagship restaurant and supermarket billing powerhouse. Large 15.6-inch capacitive touch screen, dedicated customer display, and built-in auto-cutter 3-inch thermal printer.",
    specs: [
      { label: "Display", value: "15.6-inch HD Touch Display" },
      { label: "Customer Display", value: "Dedicated Customer Facing Screen" },
      { label: "RAM / ROM", value: "4GB RAM + 64GB High Speed Storage" },
      { label: "OS", value: "Android 11 OS" },
      { label: "Printer", value: "Built-in 3-inch Auto-Cut Heavy Duty" },
    ],
  },
  {
    id: "printer-2inch-bt",
    title: "EzBills Regular 2-inch Thermal Printer",
    category: "printers",
    image: "10.jpeg",
    originalPrice: "Rs. 4,999",
    salePrice: "Rs. 2,499",
    discount: "50% OFF",
    shortDesc: "Wireless Bluetooth 58mm receipt printer with battery.",
    description:
      "Portable Bluetooth thermal printer with rechargeable battery. Fast 80mm/s speed, clear receipts, and compatibility with all Android phones and PCs.",
    specs: [
      { label: "Paper Size", value: "58mm Standard Receipt" },
      { label: "Speed", value: "80 mm/s" },
      { label: "Connectivity", value: "Bluetooth + USB" },
      { label: "Battery", value: "Built-in Rechargeable" },
    ],
  },
  {
    id: "printer-2inch-bada",
    title: "EzBills Bada 2-inch Billing Printer",
    category: "printers",
    image: "11.jpeg",
    originalPrice: "Rs. 4,999",
    salePrice: "Rs. 2,999",
    discount: "40% OFF",
    shortDesc: "Heavy-duty counter receipt printer with fast thermal head.",
    description:
      "Reliable desktop 2-inch receipt printer for continuous counter billing. Durable print head tested for over 100,000 meters of printing.",
  },
  {
    id: "printer-3inch-bada",
    title: "EzBills Bada 3 Inch Thermal Printer",
    category: "printers",
    image: "12.jpeg",
    originalPrice: "Rs. 6,999",
    salePrice: "Rs. 3,999",
    discount: "43% OFF",
    shortDesc: "Portable 80mm wide bill printer for restaurants and retail.",
    description:
      "Wide 3-inch thermal printer supporting full GST bills, detailed food orders, and QR payment codes.",
  },
  {
    id: "printer-srs710",
    title: "SRS710 High-Speed Thermal Receipt Printer",
    category: "printers",
    image: "13.jpeg",
    originalPrice: "Rs. 14,999",
    salePrice: "Rs. 7,499",
    discount: "50% OFF",
    shortDesc: "Commercial 120mm/s receipt printer with auto-cutter.",
    description:
      "Heavy-duty 80mm thermal receipt printer with precision automatic paper cutter. Blazing 120 mm/s print speed for high-traffic supermarkets.",
    specs: [
      { label: "Paper Width", value: "80mm Standard" },
      { label: "Speed", value: "120 mm/s Blazing Fast" },
      { label: "Cutter", value: "Automatic Paper Cut" },
    ],
  },
  {
    id: "paper-rolls-57mm",
    title: "57mm Thermal Paper Rolls (Pack)",
    category: "supplies",
    image: "14.jpeg",
    originalPrice: "Rs. 50",
    salePrice: "Rs. 30",
    discount: "40% OFF",
    shortDesc: "55 GSM high-white thermal paper rolls for mini POS.",
    description:
      "Premium 55 GSM thermal paper rolls. High contrast, sharp text, dark barcodes, and long shelf life.",
  },
  {
    id: "paper-rolls-80mm",
    title: "80mm Thermal Paper Rolls (Pack)",
    category: "supplies",
    image: "15.jpeg",
    originalPrice: "Rs. 100",
    salePrice: "Rs. 50",
    discount: "50% OFF",
    shortDesc: "25-meter 80mm rolls for standard counter receipt printers.",
    description:
      "Heavy duty 80mm thermal receipt rolls with 25-meter continuous length. Compatible with all 3-inch thermal printers.",
  },
  {
    id: "stickers-50x25",
    title: "Thermal Label Stickers 50×25 mm (500 Labels)",
    category: "supplies",
    image: "16.jpeg",
    originalPrice: "Rs. 200",
    salePrice: "Rs. 100",
    discount: "50% OFF",
    shortDesc: "Direct thermal adhesive barcode & MRP sticker rolls.",
    description:
      "50 × 25 mm (2 × 1 inch) direct thermal stickers. 500 labels per roll. Strong adhesive backing for glass, plastic, and paper packages.",
  },
  {
    id: "stickers-50x50",
    title: "Thermal Label Stickers 50×50 mm (250 Labels)",
    category: "supplies",
    image: "17.jpeg",
    originalPrice: "Rs. 200",
    salePrice: "Rs. 100",
    discount: "50% OFF",
    shortDesc: "Square 2×2 inch labels for courier, inventory & product tags.",
    description:
      "50 × 50 mm (2 × 2 inch) square adhesive labels. 250 labels per roll. Perfect for retail box tags, courier barcodes, and shipping labels.",
  },
];

const CATEGORIES_DATA = [
  { name: "Retail Business", img: "category1.jpg" },
  { name: "Fashion & Apparel", img: "category2.jpg" },
  { name: "Laundry & Dry Clean", img: "category3.jpg" },
  { name: "Barber Shop & Salon", img: "category4.jpg" },
  { name: "Cafe & Restaurant", img: "category5.jpg" },
  { name: "Cake & Bakery Store", img: "category6.jpg" },
  { name: "Grocery & Supermarket", img: "category7.jpg" },
  { name: "Beverages & Juices", img: "category8.jpg" },
];

const TESTIMONIALS = [
  {
    name: "Sanjay",
    biz: "Cafe Owner, Mumbai",
    quote:
      "EzBills saved me hours of manual work with its intuitive inventory management and KOT printing. Highly recommend for any food outlet!",
  },
  {
    name: "Uday Singh",
    biz: "Hotel Sigma, Jaipur",
    quote:
      "Thanks to EzBills, managing dine-in table orders and digital QR payments has never been easier. A total game-changer for our restaurant!",
  },
  {
    name: "Ajit Varma",
    biz: "Modern Retail Chain, Pune",
    quote:
      "Scalable, reliable, and secure. Even when the internet drops, billing continues at 0ms speed. EzBills is the backbone of our retail chain.",
  },
  {
    name: "Vivek",
    biz: "Elite Barber & Salon, Bengaluru",
    quote:
      "EzBills is simply the best! Extremely easy to use, super quick bill printouts, reliable customer support, and essential for our business.",
  },
];

export default function Index() {
  const { user, loading } = useAuth();
  const { isDesktop } = useResponsive();
  const router = useRouter();
  const { width } = useWindowDimensions();

  // State
  const [bannerIndex, setBannerIndex] = useState(0);
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const scrollViewRef = useRef<ScrollView>(null);

  // Auto redirect logged-in users to active dashboard/waiter
  useEffect(() => {
    if (!loading && user) {
      if (user.role === "waiter" || user.role === "kitchen") {
        router.replace("/(app)/waiter");
      } else {
        router.replace("/(app)/dashboard");
      }
    }
  }, [user, loading, router]);

  // Auto-switch hero banners every 6 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setBannerIndex((prev) => (prev === 0 ? 1 : 0));
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  const openWhatsApp = (msg: string) => {
    const url = `${WHATSAPP_BASE_URL}${encodeURIComponent(msg)}`;
    Linking.openURL(url).catch(() => {});
  };

  const filteredProducts =
    activeCategory === "all"
      ? PRODUCTS
      : PRODUCTS.filter((p) => p.category === activeCategory);

  if (loading) {
    return (
      <View style={styles.center} testID="landing-loading">
        <ActivityIndicator size="large" color="#FF5E2B" />
        <Text style={styles.loadingText}>Loading EzBills POS...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} testID="landing-screen">
      <StatusBar barStyle="light-content" backgroundColor="#08090C" />

      {/* ================= STICKY TOP NAVBAR ================= */}
      <View style={styles.navbar}>
        <View style={[styles.navContainer, isDesktop && styles.navContainerDesktop]}>
          {/* Brand Logo */}
          <TouchableOpacity
            style={styles.brandRow}
            onPress={() => router.push("/")}
            activeOpacity={0.8}
          >
            <View style={styles.navLogoBox}>
              <Ionicons name="receipt" size={20} color="#FFFFFF" />
            </View>
            <View>
              <Text style={styles.navBrandTitle}>
                EzBills <Text style={styles.navBrandHighlight}>POS</Text>
              </Text>
              <Text style={styles.navBrandSubtitle}>RETAIL & RESTAURANT ERP</Text>
            </View>
          </TouchableOpacity>

          {/* Desktop Navigation Links */}
          {isDesktop ? (
            <View style={styles.desktopNavLinks}>
              <TouchableOpacity
                onPress={() => router.push("/pos-erp")}
                style={styles.navLinkItem}
              >
                <Text style={styles.navLinkText}>Use Cases</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  scrollViewRef.current?.scrollTo({ y: 1600, animated: true });
                }}
                style={styles.navLinkItem}
              >
                <Text style={styles.navLinkText}>Categories</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  scrollViewRef.current?.scrollTo({ y: 2200, animated: true });
                }}
                style={styles.navLinkItem}
              >
                <Text style={styles.navLinkText}>Products</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push("/pricing")}
                style={styles.navLinkItem}
              >
                <Text style={styles.navLinkText}>Pricing</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  scrollViewRef.current?.scrollTo({ y: 3800, animated: true });
                }}
                style={styles.navLinkItem}
              >
                <Text style={styles.navLinkText}>Testimonials</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => openWhatsApp("Hi, I want to talk with your team about EzBills POS.")}
                style={styles.navLinkItem}
              >
                <Text style={styles.navLinkText}>Contact Us</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Actions & Portal Access */}
          <View style={styles.navRightActions}>
            <TouchableOpacity
              style={styles.navLoginBtn}
              testID="landing-login-btn"
              onPress={() => router.push("/login")}
              activeOpacity={0.8}
            >
              <Ionicons name="log-in-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.navLoginBtnText}>Owner Login</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.navStaffBtn}
              testID="landing-staff-btn"
              onPress={() => router.push("/staff-login")}
              activeOpacity={0.8}
            >
              <Ionicons name="keypad-outline" size={14} color="#FF8A3D" style={{ marginRight: 4 }} />
              <Text style={styles.navStaffBtnText}>Staff PIN</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.navBookBtn}
              testID="landing-register-btn"
              onPress={() => router.push("/register")}
              activeOpacity={0.8}
            >
              <Text style={styles.navBookBtnText}>Create Account</Text>
            </TouchableOpacity>

            {!isDesktop && (
              <TouchableOpacity
                style={styles.hamburgerBtn}
                onPress={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                <Ionicons
                  name={mobileMenuOpen ? "close" : "menu"}
                  size={24}
                  color="#FFFFFF"
                />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && !isDesktop && (
          <View style={styles.mobileDropdown}>
            <TouchableOpacity
              style={styles.mobileDropdownItem}
              onPress={() => {
                setMobileMenuOpen(false);
                router.push("/pos-erp");
              }}
            >
              <Ionicons name="grid-outline" size={18} color="#FF5E2B" />
              <Text style={styles.mobileDropdownText}>Use Cases & Features</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.mobileDropdownItem}
              onPress={() => {
                setMobileMenuOpen(false);
                router.push("/pricing");
              }}
            >
              <Ionicons name="pricetag-outline" size={18} color="#10B981" />
              <Text style={styles.mobileDropdownText}>Pricing Plans (₹299/mo)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.mobileDropdownItem}
              onPress={() => {
                setMobileMenuOpen(false);
                openWhatsApp("Hi, I want to book a demo of EzBills POS.");
              }}
            >
              <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
              <Text style={styles.mobileDropdownText}>Chat on WhatsApp</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ================= SCROLLABLE LANDING PAGE CONTENT ================= */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ================= 1. HERO SECTION ================= */}
        <View style={styles.heroSection}>
          <View style={[styles.sectionContainer, isDesktop && styles.heroRowDesktop]}>
            {/* Left Hero Column */}
            <View style={[styles.heroLeftCol, isDesktop && { flex: 1.1, paddingRight: 32 }]}>
              <View style={styles.pillBadge}>
                <View style={styles.pillDot} />
                <Text style={styles.pillText}>INDIA'S #1 RETAIL & RESTAURANT POS SOLUTION</Text>
              </View>

              <h1 style={{ margin: 0, padding: 0 }}>
                <Text style={styles.heroTitle}>
                  EzBills Best POS Billing Solution For{" "}
                  <Text style={styles.heroTitleAccent}>Retail Businesses</Text> & Restaurants
                </Text>
              </h1>

              <Text style={styles.heroSubtitle}>
                Cloud-based & 100% Offline POS billing software for retail shops and food businesses.
                Flexible and available on-the-go, our mobile-based retail billing software gives you more freedom.
              </Text>

              {/* Primary Call to Action Buttons */}
              <View style={styles.heroCtaRow}>
                <TouchableOpacity
                  style={styles.heroPrimaryBtn}
                  onPress={() =>
                    openWhatsApp(
                      "Hi, I want to book the EzBills Billing Machine. Please share complete package details and price."
                    )
                  }
                  activeOpacity={0.85}
                >
                  <Ionicons name="cart" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.heroPrimaryBtnText}>Book Billing Machine</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.heroSecondaryBtn}
                  onPress={() => router.push("/register")}
                  activeOpacity={0.85}
                >
                  <Ionicons name="sparkles" size={16} color="#FF8A3D" style={{ marginRight: 8 }} />
                  <Text style={styles.heroSecondaryBtnText}>Start Free Trial</Text>
                </TouchableOpacity>
              </View>

              {/* Quick Credentials / Access Badges */}
              <View style={styles.appBadgesRow}>
                <TouchableOpacity
                  style={styles.googlePlayBox}
                  onPress={() =>
                    Linking.openURL(
                      "https://play.google.com/store/apps/details?id=com.ezybills.definesoftware&hl=en_IN"
                    ).catch(() => {})
                  }
                >
                  <Image
                    source={{ uri: getImgUri("google-play-badge.png") }}
                    style={styles.googlePlayImg}
                    resizeMode="contain"
                  />
                </TouchableOpacity>

                <View style={styles.heroFeaturePill}>
                  <Ionicons name="shield-checkmark" size={16} color="#10B981" />
                  <Text style={styles.heroFeaturePillText}>100% Offline · GST Ready · 0ms Speed</Text>
                </View>
              </View>
            </View>

            {/* Right Hero Column: Banner Image Carousel */}
            <View style={[styles.heroRightCol, isDesktop && { flex: 0.9 }]}>
              <View style={styles.bannerCarouselCard}>
                <Image
                  source={{
                    uri: getImgUri(bannerIndex === 0 ? "baner_photo_.jpeg" : "banner-img.jpg"),
                  }}
                  style={styles.bannerImg}
                  resizeMode="cover"
                />
                {/* Carousel Controls */}
                <View style={styles.carouselIndicators}>
                  <TouchableOpacity
                    style={[styles.indicatorDot, bannerIndex === 0 && styles.indicatorActive]}
                    onPress={() => setBannerIndex(0)}
                  />
                  <TouchableOpacity
                    style={[styles.indicatorDot, bannerIndex === 1 && styles.indicatorActive]}
                    onPress={() => setBannerIndex(1)}
                  />
                </View>

                {/* Banner Badge */}
                <View style={styles.bannerFloatingTag}>
                  <Ionicons name="hardware-chip-outline" size={14} color="#FFFFFF" />
                  <Text style={styles.bannerFloatingText}>Wireless Bluetooth Thermal Printer Bundle</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* ================= 2. STATISTICS STRIP ================= */}
        <View style={styles.statsSection}>
          <View style={[styles.sectionContainer, isDesktop && styles.statsRowDesktop]}>
            <View style={[styles.statsQuoteBox, isDesktop && { flex: 1.2 }]}>
              <Text style={styles.statsQuote}>
                "Many retail businesses worldwide use our service to manage their POS billing &amp; Inventory needs."
              </Text>
            </View>
            <View style={[styles.statsCardsRow, isDesktop && { flex: 0.8 }]}>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>3,000 +</Text>
                <Text style={styles.statLabel}>Trusted Retailers</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>5 +</Text>
                <Text style={styles.statLabel}>Regions Covered</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>100%</Text>
                <Text style={styles.statLabel}>Offline Uptime</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ================= 3. USE CASES: RETAIL BUSINESSES ================= */}
        <View style={styles.useCasesSection}>
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionSmallBadge}>USE CASES</Text>
              <h2 style={{ margin: 0, padding: 0 }}>
                <Text style={styles.sectionHeading}>
                  Powerful POS Solutions for Every Business{"\n"}
                  <Text style={styles.textPrimary}>Retail Businesses Use Cases</Text>
                </Text>
              </h2>
            </View>

            {/* Case 1: Smart Billing for Retail Stores */}
            <View style={[styles.caseRow, isDesktop && styles.caseRowReverse]}>
              <View style={[styles.caseImgCol, isDesktop && { flex: 1 }]}>
                <Image
                  source={{ uri: getImgUri("r1.png") }}
                  style={styles.caseImage}
                  resizeMode="contain"
                />
              </View>
              <View style={[styles.caseTextCol, isDesktop && { flex: 1 }]}>
                <Text style={styles.caseTitle}>Smart Billing for Retail Stores</Text>
                <Text style={styles.caseDesc}>
                  EzBills POS makes billing simple and fast for all types of retail shops including grocery stores,
                  garment shops, electronics stores, pharmacies, and more. Generate professional GST invoices, print
                  bills instantly, and send digital receipts to customers.
                </Text>
                <View style={styles.checkList}>
                  <View style={styles.checkItem}>
                    <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                    <Text style={styles.checkText}>Quick billing in seconds</Text>
                  </View>
                  <View style={styles.checkItem}>
                    <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                    <Text style={styles.checkText}>GST-ready invoices with integer math</Text>
                  </View>
                  <View style={styles.checkItem}>
                    <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                    <Text style={styles.checkText}>Barcode and product scanning</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Case 2: Inventory & Stock Control */}
            <View style={[styles.caseRow, isDesktop && styles.caseRowNormal]}>
              <View style={[styles.caseImgCol, isDesktop && { flex: 1 }]}>
                <Image
                  source={{ uri: getImgUri("r2.png") }}
                  style={styles.caseImage}
                  resizeMode="contain"
                />
              </View>
              <View style={[styles.caseTextCol, isDesktop && { flex: 1 }]}>
                <Text style={styles.caseTitle}>Inventory &amp; Stock Control</Text>
                <Text style={styles.caseDesc}>
                  Keep track of your inventory automatically as sales happen. EzBills POS helps you monitor stock
                  levels, manage product categories, and receive alerts when items are running low.
                </Text>
                <View style={styles.checkList}>
                  <View style={styles.checkItem}>
                    <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                    <Text style={styles.checkText}>Real-time stock tracking</Text>
                  </View>
                  <View style={styles.checkItem}>
                    <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                    <Text style={styles.checkText}>Low stock automatic alerts</Text>
                  </View>
                  <View style={styles.checkItem}>
                    <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                    <Text style={styles.checkText}>Product-wise inventory management</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Case 3: Sales Reports & Business Insights */}
            <View style={[styles.caseRow, isDesktop && styles.caseRowReverse]}>
              <View style={[styles.caseImgCol, isDesktop && { flex: 1 }]}>
                <Image
                  source={{ uri: getImgUri("r3.png") }}
                  style={styles.caseImage}
                  resizeMode="contain"
                />
              </View>
              <View style={[styles.caseTextCol, isDesktop && { flex: 1 }]}>
                <Text style={styles.caseTitle}>Sales Reports &amp; Business Insights</Text>
                <Text style={styles.caseDesc}>
                  Get clear insights into your business performance with powerful sales reports. Track daily revenue,
                  best-selling products, and customer purchase trends to make smarter decisions.
                </Text>
                <View style={styles.checkList}>
                  <View style={styles.checkItem}>
                    <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                    <Text style={styles.checkText}>Daily, weekly &amp; monthly reports</Text>
                  </View>
                  <View style={styles.checkItem}>
                    <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                    <Text style={styles.checkText}>Profit and sales analysis</Text>
                  </View>
                  <View style={styles.checkItem}>
                    <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                    <Text style={styles.checkText}>Exportable business reports &amp; GST data</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* ================= 4. USE CASES: RESTAURANTS, CAFES & FOOD ================= */}
        <View style={[styles.useCasesSection, styles.altSectionBg]}>
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionSmallBadge}>HOSPITALITY & DINING</Text>
              <h2 style={{ margin: 0, padding: 0 }}>
                <Text style={styles.sectionHeading}>
                  <Text style={styles.textPrimary}>Restaurant, Cafe &amp; Food Businesses</Text>
                </Text>
              </h2>
            </View>

            {/* Restaurant Case 1: Order & Kitchen Management */}
            <View style={[styles.caseRow, isDesktop && styles.caseRowReverse]}>
              <View style={[styles.caseImgCol, isDesktop && { flex: 1 }]}>
                <Image
                  source={{ uri: getImgUri("f1.png") }}
                  style={styles.caseImage}
                  resizeMode="contain"
                />
              </View>
              <View style={[styles.caseTextCol, isDesktop && { flex: 1 }]}>
                <Text style={styles.caseTitle}>Order &amp; Kitchen Management</Text>
                <Text style={styles.caseDesc}>
                  Manage dine-in, takeaway, and delivery orders effortlessly. Orders are sent directly to the kitchen
                  through Kitchen Order Tickets (KOT) to improve accuracy and speed.
                </Text>
                <View style={styles.checkList}>
                  <View style={styles.checkItem}>
                    <Ionicons name="checkmark-circle" size={18} color="#FF5E2B" />
                    <Text style={styles.checkText}>Fast order processing (0ms lag)</Text>
                  </View>
                  <View style={styles.checkItem}>
                    <Ionicons name="checkmark-circle" size={18} color="#FF5E2B" />
                    <Text style={styles.checkText}>Kitchen Order Ticket (KOT) system</Text>
                  </View>
                  <View style={styles.checkItem}>
                    <Ionicons name="checkmark-circle" size={18} color="#FF5E2B" />
                    <Text style={styles.checkText}>Smooth kitchen coordination</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Restaurant Case 2: Table & Floor Management */}
            <View style={[styles.caseRow, isDesktop && styles.caseRowNormal]}>
              <View style={[styles.caseImgCol, isDesktop && { flex: 1 }]}>
                <Image
                  source={{ uri: getImgUri("f2.png") }}
                  style={styles.caseImage}
                  resizeMode="contain"
                />
              </View>
              <View style={[styles.caseTextCol, isDesktop && { flex: 1 }]}>
                <Text style={styles.caseTitle}>Table &amp; Floor Management</Text>
                <Text style={styles.caseDesc}>
                  Easily manage table reservations and seating arrangements with an intuitive floor layout system.
                  Track occupied and available tables in real-time to improve service efficiency.
                </Text>
                <View style={styles.checkList}>
                  <View style={styles.checkItem}>
                    <Ionicons name="checkmark-circle" size={18} color="#FF5E2B" />
                    <Text style={styles.checkText}>Smart table allocation</Text>
                  </View>
                  <View style={styles.checkItem}>
                    <Ionicons name="checkmark-circle" size={18} color="#FF5E2B" />
                    <Text style={styles.checkText}>Real-time table status &amp; dining timers</Text>
                  </View>
                  <View style={styles.checkItem}>
                    <Ionicons name="checkmark-circle" size={18} color="#FF5E2B" />
                    <Text style={styles.checkText}>Better customer service flow</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Restaurant Case 3: QR Menu & Contactless Ordering */}
            <View style={[styles.caseRow, isDesktop && styles.caseRowReverse]}>
              <View style={[styles.caseImgCol, isDesktop && { flex: 1 }]}>
                <Image
                  source={{ uri: getImgUri("f3.png") }}
                  style={styles.caseImage}
                  resizeMode="contain"
                />
              </View>
              <View style={[styles.caseTextCol, isDesktop && { flex: 1 }]}>
                <Text style={styles.caseTitle}>QR Menu &amp; Contactless Ordering</Text>
                <Text style={styles.caseDesc}>
                  Allow customers to scan a QR code to view the menu and place orders directly from their phones.
                  Reduce waiting time and enhance the dining experience with digital ordering.
                </Text>
                <View style={styles.checkList}>
                  <View style={styles.checkItem}>
                    <Ionicons name="checkmark-circle" size={18} color="#FF5E2B" />
                    <Text style={styles.checkText}>Contactless digital menu system</Text>
                  </View>
                  <View style={styles.checkItem}>
                    <Ionicons name="checkmark-circle" size={18} color="#FF5E2B" />
                    <Text style={styles.checkText}>Faster ordering process</Text>
                  </View>
                  <View style={styles.checkItem}>
                    <Ionicons name="checkmark-circle" size={18} color="#FF5E2B" />
                    <Text style={styles.checkText}>Integrated UPI payment support</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* ================= 5. CATEGORIES SECTION ================= */}
        <View style={styles.categoriesSection}>
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionSmallBadge}>CATEGORIES</Text>
              <h2 style={{ margin: 0, padding: 0 }}>
                <Text style={styles.sectionHeading}>Varied Range of Categories</Text>
              </h2>
              <Text style={styles.sectionSubheading}>
                Specially tailored for every single business segment in retail &amp; dining.
              </Text>
            </View>

            <View style={styles.categoriesGrid}>
              {CATEGORIES_DATA.map((cat, idx) => (
                <View
                  key={cat.name}
                  style={[
                    styles.catCard,
                    isDesktop
                      ? { width: idx === 1 ? "48%" : "23%" }
                      : { width: "48%" },
                  ]}
                >
                  <Image
                    source={{ uri: getImgUri(cat.img) }}
                    style={styles.catImage}
                    resizeMode="cover"
                  />
                  <View style={styles.catOverlay}>
                    <Text style={styles.catTitle}>{cat.name}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ================= 6. PRODUCTS CATALOG SECTION ================= */}
        <View style={styles.productsSection}>
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionSmallBadge}>OUR PRODUCTS</Text>
              <h2 style={{ margin: 0, padding: 0 }}>
                <Text style={styles.sectionHeading}>
                  Find the <Text style={styles.textPrimary}>perfect product</Text> for your business
                </Text>
              </h2>
              <Text style={styles.sectionSubheading}>
                Choose the product that best fits your business and unlock its full potential.
              </Text>
            </View>

            {/* Product Category Filter Tabs */}
            <View style={styles.filterTabsRow}>
              {[
                { key: "all", label: "All Products" },
                { key: "machines", label: "POS Billing Machines" },
                { key: "printers", label: "Thermal Printers" },
                { key: "software", label: "Software Plans" },
                { key: "supplies", label: "Rolls & Stickers" },
              ].map((tab) => (
                <TouchableOpacity
                  key={tab.key}
                  style={[
                    styles.filterTabBtn,
                    activeCategory === tab.key && styles.filterTabBtnActive,
                  ]}
                  onPress={() => setActiveCategory(tab.key)}
                >
                  <Text
                    style={[
                      styles.filterTabBtnText,
                      activeCategory === tab.key && styles.filterTabBtnTextActive,
                    ]}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Products Grid */}
            <View style={styles.productsGrid}>
              {filteredProducts.map((prod) => (
                <View
                  key={prod.id}
                  style={[
                    styles.productCard,
                    isDesktop
                      ? { width: "23.5%", marginHorizontal: "0.75%" }
                      : { width: width < 600 ? "100%" : "48%" },
                  ]}
                >
                  {/* Product Image Click opens details */}
                  <TouchableOpacity
                    style={styles.prodImgWrapper}
                    onPress={() => setSelectedProduct(prod)}
                    activeOpacity={0.85}
                  >
                    <Image
                      source={{ uri: getImgUri(prod.image) }}
                      style={styles.prodImg}
                      resizeMode="cover"
                    />
                    <View style={styles.discountBadge}>
                      <Text style={styles.discountBadgeText}>{prod.discount}</Text>
                    </View>
                  </TouchableOpacity>

                  {/* Product Information */}
                  <View style={styles.prodInfo}>
                    <TouchableOpacity
                      onPress={() => setSelectedProduct(prod)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.prodTitle} numberOfLines={2}>
                        {prod.title}
                      </Text>
                    </TouchableOpacity>

                    <View style={styles.priceRow}>
                      <Text style={styles.prodOriginalPrice}>{prod.originalPrice}</Text>
                      <Text style={styles.prodSalePrice}>From {prod.salePrice}</Text>
                    </View>

                    {/* Action Buttons */}
                    <View style={styles.prodActionsRow}>
                      <TouchableOpacity
                        style={styles.viewDetailsBtn}
                        onPress={() => setSelectedProduct(prod)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="information-circle-outline" size={14} color="#FFFFFF" />
                        <Text style={styles.viewDetailsBtnText}>Details</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.whatsappEnquiryBtn}
                        onPress={() =>
                          openWhatsApp(
                            `Hi, I want to book the ${prod.title}. Please share details and best pricing.`
                          )
                        }
                        activeOpacity={0.8}
                      >
                        <Ionicons name="logo-whatsapp" size={14} color="#FFFFFF" />
                        <Text style={styles.whatsappEnquiryBtnText}>Enquire</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ================= 7. TESTIMONIALS SECTION ================= */}
        <View style={[styles.testimonialsSection, styles.altSectionBg]}>
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionSmallBadge}>TESTIMONIALS</Text>
              <h2 style={{ margin: 0, padding: 0 }}>
                <Text style={styles.sectionHeading}>
                  What our <Text style={styles.textPrimary}>Happy Customers</Text> Say
                </Text>
              </h2>
            </View>

            <View style={styles.testimonialsGrid}>
              {TESTIMONIALS.map((t, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.testimonialCard,
                    isDesktop ? { width: "23.5%" } : { width: width < 600 ? "100%" : "48%" },
                  ]}
                >
                  <View style={styles.testiStarsRow}>
                    {[...Array(5)].map((_, sIdx) => (
                      <Ionicons key={sIdx} name="star" size={16} color="#F59E0B" />
                    ))}
                  </View>
                  <Text style={styles.testiQuote}>"{t.quote}"</Text>
                  <View style={styles.testiAuthorBox}>
                    <View style={styles.testiAvatar}>
                      <Ionicons name="person" size={18} color="#FF8A3D" />
                    </View>
                    <View>
                      <Text style={styles.testiAuthorName}>{t.name}</Text>
                      <Text style={styles.testiAuthorBiz}>{t.biz}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ================= 8. CLIENTS SHOWCASE ================= */}
        <View style={styles.clientsSection}>
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionSmallBadge}>OUR CLIENTS</Text>
              <h2 style={{ margin: 0, padding: 0 }}>
                <Text style={styles.sectionHeading}>Pleasure to work with</Text>
              </h2>
            </View>

            <View style={styles.clientsRow}>
              {["c1.png", "c2.png", "c3.jpg", "c4.png", "c5.png", "c6.png", "c7.png", "c8.png"].map(
                (cImg, idx) => (
                  <View key={idx} style={styles.clientLogoCard}>
                    <Image
                      source={{ uri: getImgUri(cImg) }}
                      style={styles.clientLogoImg}
                      resizeMode="contain"
                    />
                  </View>
                )
              )}
            </View>
          </View>
        </View>

        {/* ================= 9. QUICK PORTAL ACCESS CARD ================= */}
        <View style={styles.portalCardSection}>
          <View style={styles.sectionContainer}>
            <View style={styles.portalAccessCard}>
              <View style={styles.portalCardHeader}>
                <Ionicons name="lock-closed" size={24} color="#FF5E2B" />
                <Text style={styles.portalCardTitle}>EzBills POS Portal &amp; Staff Access</Text>
              </View>
              <Text style={styles.portalCardSubtitle}>
                Existing restaurant or retail business? Quickly sign into your billing terminal, staff waiter app, or
                kitchen display system.
              </Text>

              <View style={styles.portalActionsGrid}>
                {/* Restaurant Owner Login */}
                <TouchableOpacity
                  style={styles.portalLoginBtn}
                  testID="landing-login-btn"
                  onPress={() => router.push("/login")}
                  activeOpacity={0.85}
                >
                  <Ionicons name="business" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.portalLoginBtnText}>Restaurant Owner Login</Text>
                </TouchableOpacity>

                {/* Staff PIN Login */}
                <TouchableOpacity
                  style={styles.portalStaffBtn}
                  testID="landing-staff-btn"
                  onPress={() => router.push("/staff-login")}
                  activeOpacity={0.85}
                >
                  <Ionicons name="keypad" size={18} color="#FF8A3D" style={{ marginRight: 8 }} />
                  <Text style={styles.portalStaffBtnText}>Staff PIN Login (Waiter / Kitchen)</Text>
                </TouchableOpacity>

                {/* Create Business Account */}
                <TouchableOpacity
                  style={styles.portalRegisterBtn}
                  testID="landing-register-btn"
                  onPress={() => router.push("/register")}
                  activeOpacity={0.85}
                >
                  <Ionicons name="person-add" size={18} color="#10B981" style={{ marginRight: 8 }} />
                  <Text style={styles.portalRegisterBtnText}>Create Business Account (₹299/mo)</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.portalExtraLinks}>
                <TouchableOpacity
                  style={styles.portalExtraLinkItem}
                  onPress={() => router.push("/pricing")}
                >
                  <Ionicons name="pricetag-outline" size={15} color="#10B981" />
                  <Text style={[styles.portalExtraLinkText, { color: "#10B981" }]}>
                    View Detailed Pricing (₹299/mo)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.portalExtraLinkItem}
                  onPress={() => router.push("/pos-erp")}
                >
                  <Ionicons name="sparkles-outline" size={15} color="#FF8A3D" />
                  <Text style={[styles.portalExtraLinkText, { color: "#FF8A3D" }]}>
                    Explore All ERP &amp; Billing Features
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        {/* ================= 10. FOOTER ================= */}
        <View style={styles.footerSection}>
          <View style={[styles.sectionContainer, isDesktop && styles.footerGridDesktop]}>
            <View style={[styles.footerColBrand, isDesktop && { flex: 1.5 }]}>
              <View style={styles.brandRow}>
                <View style={styles.navLogoBox}>
                  <Ionicons name="receipt" size={20} color="#FFFFFF" />
                </View>
                <Text style={styles.navBrandTitle}>
                  EzBills <Text style={styles.navBrandHighlight}>POS</Text>
                </Text>
              </View>
              <Text style={styles.footerDesc}>
                EzBills is India's premier Cloud-based &amp; 100% Offline POS billing software for retail shops and
                restaurants. Flexible and available on-the-go, giving businesses total freedom with instant thermal bill
                printing.
              </Text>
              <TouchableOpacity
                onPress={() =>
                  Linking.openURL(
                    "https://play.google.com/store/apps/details?id=com.ezybills.definesoftware&hl=en_IN"
                  ).catch(() => {})
                }
              >
                <Image
                  source={{ uri: getImgUri("google-play-badge.png") }}
                  style={styles.footerPlayBadge}
                  resizeMode="contain"
                />
              </TouchableOpacity>
            </View>

            <View style={[styles.footerCol, isDesktop && { flex: 1 }]}>
              <Text style={styles.footerColTitle}>Solutions</Text>
              <TouchableOpacity onPress={() => router.push("/pos-erp")}>
                <Text style={styles.footerLink}>Restaurant POS &amp; ERP</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push("/pos-erp")}>
                <Text style={styles.footerLink}>Retail Shop Billing</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push("/pricing")}>
                <Text style={styles.footerLink}>Pricing Plans</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push("/login")}>
                <Text style={styles.footerLink}>Owner Portal</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push("/staff-login")}>
                <Text style={styles.footerLink}>Staff PIN Terminal</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.footerCol, isDesktop && { flex: 1 }]}>
              <Text style={styles.footerColTitle}>Support &amp; Contact</Text>
              <TouchableOpacity
                onPress={() =>
                  openWhatsApp("Hi, I need assistance with EzBills Billing Software.")
                }
              >
                <Text style={styles.footerLink}>WhatsApp: +91 77788 80874</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => openWhatsApp("Hi, I want to book a billing machine demo.")}>
                <Text style={styles.footerLink}>Book Billing Machine</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push("/register")}>
                <Text style={styles.footerLink}>Create Free Account</Text>
              </TouchableOpacity>
              <Text style={styles.footerMutedText}>All-India Support (Mon - Sun)</Text>
            </View>
          </View>

          <View style={styles.footerBottomBar}>
            <Text style={styles.footerCopyText}>
              © {new Date().getFullYear()} EzBills POS. All rights reserved. Made with pride for Indian businesses.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* ================= PRODUCT DETAIL MODAL (LIKE EZYBILLS MODAL) ================= */}
      <Modal
        visible={!!selectedProduct}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedProduct(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, isDesktop && styles.modalCardDesktop]}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderTitle} numberOfLines={1}>
                {selectedProduct?.title}
              </Text>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setSelectedProduct(null)}
              >
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* Modal Scrollable Body */}
            <ScrollView
              contentContainerStyle={styles.modalScrollBody}
              showsVerticalScrollIndicator={true}
            >
              {selectedProduct && (
                <View style={[styles.modalContentGrid, isDesktop && styles.modalContentGridDesktop]}>
                  {/* Left Column: Big Image */}
                  <View style={[styles.modalImgCol, isDesktop && { flex: 1 }]}>
                    <Image
                      source={{ uri: getImgUri(selectedProduct.image) }}
                      style={styles.modalLargeImg}
                      resizeMode="cover"
                    />
                  </View>

                  {/* Right Column: Specs & Actions */}
                  <View style={[styles.modalInfoCol, isDesktop && { flex: 1.2 }]}>
                    <Text style={styles.modalProdTitle}>{selectedProduct.title}</Text>

                    <View style={styles.modalPriceRow}>
                      <Text style={styles.modalOriginalPrice}>
                        {selectedProduct.originalPrice}
                      </Text>
                      <Text style={styles.modalSalePrice}>
                        {selectedProduct.salePrice}
                      </Text>
                      <View style={styles.discountBadge}>
                        <Text style={styles.discountBadgeText}>
                          {selectedProduct.discount}
                        </Text>
                      </View>
                    </View>

                    {/* Action Buttons */}
                    <View style={styles.modalCtaRow}>
                      <TouchableOpacity
                        style={styles.modalBuyBtn}
                        onPress={() => {
                          setSelectedProduct(null);
                          router.push("/register");
                        }}
                      >
                        <Ionicons name="flash" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                        <Text style={styles.modalBuyBtnText}>Book Machine / Buy Now</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.modalWhatsappBtn}
                        onPress={() =>
                          openWhatsApp(
                            `Hi, I want to book ${selectedProduct.title}. Please share specifications and dispatch details.`
                          )
                        }
                      >
                        <Ionicons name="logo-whatsapp" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                        <Text style={styles.modalWhatsappBtnText}>Enquire Now</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Description */}
                    <View style={styles.modalSection}>
                      <Text style={styles.modalSectionTitle}>Description</Text>
                      <Text style={styles.modalSectionText}>
                        {selectedProduct.description}
                      </Text>
                    </View>

                    {/* Features list */}
                    {selectedProduct.features && (
                      <View style={styles.modalSection}>
                        <Text style={styles.modalSectionTitle}>Key Software Features</Text>
                        {selectedProduct.features.map((feat, fIdx) => (
                          <View key={fIdx} style={styles.modalBulletRow}>
                            <Ionicons name="checkmark-done" size={16} color="#10B981" />
                            <Text style={styles.modalBulletText}>{feat}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Package Includes */}
                    {selectedProduct.packageIncludes && (
                      <View style={styles.modalSection}>
                        <Text style={styles.modalSectionTitle}>Package Includes</Text>
                        {selectedProduct.packageIncludes.map((item, pIdx) => (
                          <View key={pIdx} style={styles.modalBulletRow}>
                            <Ionicons name="cube-outline" size={16} color="#FF5E2B" />
                            <Text style={styles.modalBulletText}>{item}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Specs Table */}
                    {selectedProduct.specs && (
                      <View style={styles.modalSection}>
                        <Text style={styles.modalSectionTitle}>Hardware Specifications</Text>
                        {selectedProduct.specs.map((spec, sIdx) => (
                          <View key={sIdx} style={styles.modalSpecRow}>
                            <Text style={styles.modalSpecLabel}>{spec.label}:</Text>
                            <Text style={styles.modalSpecValue}>{spec.value}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ================= STYLES =================
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#08090C",
  },
  center: {
    flex: 1,
    backgroundColor: "#08090C",
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  loadingText: {
    color: "#94A3B8",
    fontSize: 14,
    fontWeight: "600",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },

  // ===== NAVBAR =====
  navbar: {
    backgroundColor: "#08090C",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    zIndex: 100,
  },
  navContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  navContainerDesktop: {
    maxWidth: 1280,
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  navLogoBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#FF5E2B",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#FF5E2B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  navBrandTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  navBrandHighlight: {
    color: "#FF8A3D",
  },
  navBrandSubtitle: {
    fontSize: 9,
    fontWeight: "800",
    color: "#10B981",
    letterSpacing: 1,
  },
  desktopNavLinks: {
    flexDirection: "row",
    alignItems: "center",
    gap: 22,
  },
  navLinkItem: {
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  navLinkText: {
    color: "#CBD5E1",
    fontSize: 14,
    fontWeight: "600",
  },
  navRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  navLoginBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  navLoginBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  navStaffBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 94, 43, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 94, 43, 0.3)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  navStaffBtnText: {
    color: "#FF8A3D",
    fontSize: 12,
    fontWeight: "700",
  },
  navBookBtn: {
    backgroundColor: "#FF5E2B",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  navBookBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  hamburgerBtn: {
    padding: 6,
    marginLeft: 4,
  },
  mobileDropdown: {
    backgroundColor: "#12161C",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 8,
  },
  mobileDropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  mobileDropdownText: {
    color: "#F1F5F9",
    fontSize: 14,
    fontWeight: "600",
  },

  // ===== SECTION CONTAINERS =====
  sectionContainer: {
    maxWidth: 1280,
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: 16,
  },
  sectionHeader: {
    alignItems: "center",
    marginBottom: 40,
    textAlign: "center",
  },
  sectionSmallBadge: {
    fontSize: 12,
    fontWeight: "800",
    color: "#FF5E2B",
    letterSpacing: 1.5,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  sectionHeading: {
    fontSize: 28,
    fontWeight: "900",
    color: "#FFFFFF",
    textAlign: "center",
    lineHeight: 36,
  },
  sectionSubheading: {
    fontSize: 15,
    color: "#94A3B8",
    textAlign: "center",
    marginTop: 8,
    maxWidth: 600,
  },
  textPrimary: {
    color: "#38BDF8",
  },
  altSectionBg: {
    backgroundColor: "rgba(255, 255, 255, 0.02)",
  },

  // ===== HERO SECTION =====
  heroSection: {
    paddingTop: 36,
    paddingBottom: 48,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  heroRowDesktop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroLeftCol: {
    marginBottom: 32,
  },
  pillBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    backgroundColor: "rgba(255, 94, 43, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 94, 43, 0.3)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    marginBottom: 16,
  },
  pillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10B981",
  },
  pillText: {
    color: "#FF8A3D",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  heroTitle: {
    fontSize: 34,
    fontWeight: "900",
    color: "#FFFFFF",
    lineHeight: 44,
    letterSpacing: -0.5,
    marginBottom: 16,
  },
  heroTitleAccent: {
    color: "#38BDF8",
  },
  heroSubtitle: {
    fontSize: 16,
    lineHeight: 25,
    color: "#94A3B8",
    marginBottom: 28,
    maxWidth: 620,
  },
  heroCtaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 24,
  },
  heroPrimaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0284C7",
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: "#0284C7",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 4,
  },
  heroPrimaryBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  heroSecondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
  },
  heroSecondaryBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  appBadgesRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 16,
  },
  googlePlayBox: {
    height: 44,
    justifyContent: "center",
  },
  googlePlayImg: {
    width: 135,
    height: 40,
  },
  heroFeaturePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.25)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  heroFeaturePillText: {
    color: "#34D399",
    fontSize: 12,
    fontWeight: "700",
  },
  heroRightCol: {
    alignItems: "center",
    justifyContent: "center",
  },
  bannerCarouselCard: {
    width: "100%",
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    backgroundColor: "#12161C",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 8,
  },
  bannerImg: {
    width: "100%",
    height: 380,
  },
  carouselIndicators: {
    position: "absolute",
    bottom: 16,
    alignSelf: "center",
    flexDirection: "row",
    gap: 8,
  },
  indicatorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "rgba(255, 255, 255, 0.4)",
  },
  indicatorActive: {
    backgroundColor: "#0284C7",
    width: 24,
  },
  bannerFloatingTag: {
    position: "absolute",
    top: 14,
    left: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  bannerFloatingText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },

  // ===== STATS SECTION =====
  statsSection: {
    backgroundColor: "#0B192C",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.2)",
    paddingVertical: 36,
  },
  statsRowDesktop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statsQuoteBox: {
    marginBottom: 20,
  },
  statsQuote: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 30,
    fontStyle: "italic",
  },
  statsCardsRow: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "flex-start",
  },
  statCard: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  statNumber: {
    color: "#38BDF8",
    fontSize: 26,
    fontWeight: "900",
    marginBottom: 4,
  },
  statLabel: {
    color: "#E2E8F0",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },

  // ===== USE CASES =====
  useCasesSection: {
    paddingVertical: 60,
  },
  caseRow: {
    flexDirection: "column",
    alignItems: "center",
    gap: 32,
    marginBottom: 50,
  },
  caseRowNormal: {
    flexDirection: "row",
  },
  caseRowReverse: {
    flexDirection: "row-reverse",
  },
  caseImgCol: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  caseImage: {
    width: "100%",
    height: 320,
    borderRadius: 16,
  },
  caseTextCol: {
    width: "100%",
    paddingHorizontal: 8,
  },
  caseTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 12,
  },
  caseDesc: {
    color: "#94A3B8",
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 20,
  },
  checkList: {
    gap: 10,
  },
  checkItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  checkText: {
    color: "#F1F5F9",
    fontSize: 14,
    fontWeight: "600",
  },

  // ===== CATEGORIES GRID =====
  categoriesSection: {
    paddingVertical: 60,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.05)",
  },
  categoriesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    justifyContent: "space-between",
  },
  catCard: {
    height: 220,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#161B22",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  catImage: {
    width: "100%",
    height: "100%",
  },
  catOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: "rgba(8, 9, 12, 0.75)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
  },
  catTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },

  // ===== PRODUCTS SECTION =====
  productsSection: {
    paddingVertical: 60,
  },
  filterTabsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
    marginBottom: 36,
  },
  filterTabBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  filterTabBtnActive: {
    backgroundColor: "#0284C7",
    borderColor: "#38BDF8",
  },
  filterTabBtnText: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "700",
  },
  filterTabBtnTextActive: {
    color: "#FFFFFF",
  },
  productsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 24,
  },
  productCard: {
    backgroundColor: "#12161E",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  prodImgWrapper: {
    width: "100%",
    height: 220,
    backgroundColor: "#18202C",
    overflow: "hidden",
  },
  prodImg: {
    width: "100%",
    height: "100%",
  },
  discountBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "#10B981",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  discountBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
  },
  prodInfo: {
    padding: 16,
  },
  prodTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 21,
    height: 42,
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  prodOriginalPrice: {
    color: "#64748B",
    fontSize: 13,
    textDecorationLine: "line-through",
  },
  prodSalePrice: {
    color: "#38BDF8",
    fontSize: 15,
    fontWeight: "900",
  },
  prodActionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  viewDetailsBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    paddingVertical: 10,
    borderRadius: 10,
  },
  viewDetailsBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  whatsappEnquiryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "#15803D",
    paddingVertical: 10,
    borderRadius: 10,
  },
  whatsappEnquiryBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },

  // ===== TESTIMONIALS =====
  testimonialsSection: {
    paddingVertical: 60,
  },
  testimonialsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    justifyContent: "space-between",
  },
  testimonialCard: {
    backgroundColor: "#12161E",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 18,
    padding: 20,
    justifyContent: "space-between",
  },
  testiStarsRow: {
    flexDirection: "row",
    gap: 4,
    marginBottom: 12,
  },
  testiQuote: {
    color: "#CBD5E1",
    fontSize: 14,
    lineHeight: 22,
    fontStyle: "italic",
    marginBottom: 18,
  },
  testiAuthorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  testiAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255, 94, 43, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(255, 94, 43, 0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  testiAuthorName: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  testiAuthorBiz: {
    color: "#94A3B8",
    fontSize: 12,
  },

  // ===== CLIENTS SHOWCASE =====
  clientsSection: {
    paddingVertical: 48,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.05)",
  },
  clientsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  clientLogoCard: {
    width: 120,
    height: 60,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  clientLogoImg: {
    width: "100%",
    height: "100%",
  },

  // ===== PORTAL ACCESS CARD =====
  portalCardSection: {
    paddingVertical: 50,
  },
  portalAccessCard: {
    backgroundColor: "#111620",
    borderWidth: 1,
    borderColor: "rgba(255, 94, 43, 0.25)",
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
    shadowColor: "#FF5E2B",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 6,
  },
  portalCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  portalCardTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  portalCardSubtitle: {
    color: "#94A3B8",
    fontSize: 14,
    textAlign: "center",
    maxWidth: 680,
    lineHeight: 22,
    marginBottom: 26,
  },
  portalActionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    width: "100%",
    justifyContent: "center",
    marginBottom: 20,
  },
  portalLoginBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF5E2B",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    minWidth: 220,
  },
  portalLoginBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  portalStaffBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 94, 43, 0.4)",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    minWidth: 220,
  },
  portalStaffBtnText: {
    color: "#FF8A3D",
    fontSize: 14,
    fontWeight: "800",
  },
  portalRegisterBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.35)",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    minWidth: 220,
  },
  portalRegisterBtnText: {
    color: "#34D399",
    fontSize: 14,
    fontWeight: "800",
  },
  portalExtraLinks: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 18,
    marginTop: 8,
  },
  portalExtraLinkItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  portalExtraLinkText: {
    fontSize: 13,
    fontWeight: "700",
    textDecorationLine: "underline",
  },

  // ===== FOOTER =====
  footerSection: {
    backgroundColor: "#050608",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    paddingTop: 50,
    paddingBottom: 24,
  },
  footerGridDesktop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 40,
  },
  footerColBrand: {
    marginBottom: 32,
  },
  footerDesc: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 22,
    marginTop: 14,
    marginBottom: 16,
    maxWidth: 420,
  },
  footerPlayBadge: {
    width: 140,
    height: 42,
  },
  footerCol: {
    marginBottom: 24,
    gap: 10,
  },
  footerColTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 8,
  },
  footerLink: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "500",
  },
  footerMutedText: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 6,
  },
  footerBottomBar: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
    paddingTop: 20,
    marginTop: 20,
    alignItems: "center",
  },
  footerCopyText: {
    color: "#64748B",
    fontSize: 12,
    textAlign: "center",
  },

  // ===== PRODUCT DETAIL MODAL =====
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    backgroundColor: "#12161E",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    width: "100%",
    maxHeight: "90%",
    overflow: "hidden",
  },
  modalCardDesktop: {
    maxWidth: 960,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  modalHeaderTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
    flex: 1,
  },
  modalCloseBtn: {
    padding: 6,
  },
  modalScrollBody: {
    padding: 24,
  },
  modalContentGrid: {
    flexDirection: "column",
    gap: 24,
  },
  modalContentGridDesktop: {
    flexDirection: "row",
    gap: 32,
  },
  modalImgCol: {
    alignItems: "center",
    justifyContent: "flex-start",
  },
  modalLargeImg: {
    width: "100%",
    height: 320,
    borderRadius: 16,
    backgroundColor: "#161B22",
  },
  modalInfoCol: {
    gap: 16,
  },
  modalProdTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
  },
  modalPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  modalOriginalPrice: {
    color: "#64748B",
    fontSize: 16,
    textDecorationLine: "line-through",
  },
  modalSalePrice: {
    color: "#38BDF8",
    fontSize: 22,
    fontWeight: "900",
  },
  modalCtaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 6,
  },
  modalBuyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0284C7",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    flex: 1,
    minWidth: 180,
  },
  modalBuyBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  modalWhatsappBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#15803D",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    flex: 1,
    minWidth: 150,
  },
  modalWhatsappBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  modalSection: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
    paddingTop: 14,
  },
  modalSectionTitle: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 8,
  },
  modalSectionText: {
    color: "#94A3B8",
    fontSize: 14,
    lineHeight: 22,
  },
  modalBulletRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 4,
  },
  modalBulletText: {
    color: "#E2E8F0",
    fontSize: 13,
  },
  modalSpecRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.04)",
  },
  modalSpecLabel: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "600",
  },
  modalSpecValue: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});
