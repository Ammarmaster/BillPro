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
import { useCart } from "@/src/context/CartContext";
import CartDrawerModal from "@/src/components/CartDrawerModal";
import { spacing, radius } from "@/src/theme";

// Helper to resolve images safely across Web and Native
const getImgUri = (fileName: string) => {
  return `/assets/images/${fileName}`;
};

const getScreenshotUri = (fileName: string) => {
  return `/assets/screenshots/${fileName}`;
};

// Official WhatsApp contact
const WHATSAPP_NUMBER = "918152075375";
const WHATSAPP_BASE_URL = `https://api.whatsapp.com/send/?phone=${WHATSAPP_NUMBER}&text=`;
const APK_DOWNLOAD_URL = "/ezbill-pos.apk";

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
    title: "EzBill Android POS & Billing App",
    category: "software",
    image: "18.jpeg",
    originalPrice: "Rs. 2,999",
    salePrice: "Rs. 1,999",
    discount: "33% OFF",
    shortDesc: "Cloud & Mobile POS Billing Solution for retail & restaurants.",
    description:
      "Cloud-based & 100% Offline POS billing software for food businesses and retail shops. Flexible and available on-the-go with instant Bluetooth receipt printing.",
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
    title: "EzBill Regular Billing Machine",
    category: "machines",
    image: "1.jpeg",
    originalPrice: "Rs. 5,499",
    salePrice: "Rs. 3,999",
    discount: "27% OFF",
    shortDesc: "Complete portable billing kit with 2-inch thermal printer.",
    description:
      "All-in-one wireless POS setup. Print GST invoices and customer receipts instantly with long-lasting battery power.",
    features: [
      "Sale & Billing (GST Invoices)",
      "Udhari & Customer Management",
      "Stock & Expense Tracking",
      "Sales & Purchase Reports",
      "P&L Analytics",
    ],
    packageIncludes: [
      "EzBill Billing Software License (1 Year)",
      "Regular Battery 2-inch Thermal Printer (1 Year Warranty)",
      "Fast Charger With Adapter",
      "Printer Protective Leather Cover",
      "5 Premium Thermal Paper Rolls",
    ],
  },
  {
    id: "bada-machine",
    title: "EzBill Bada Billing Machine",
    category: "machines",
    image: "2.jpeg",
    originalPrice: "Rs. 5,999",
    salePrice: "Rs. 4,499",
    discount: "25% OFF",
    shortDesc: "Heavy-duty 2-inch thermal printer + full billing software.",
    description:
      "Built for busy counters, grocery stores, and cafes. High-speed thermal mechanism designed for continuous non-stop billing.",
    features: [
      "High-speed inkless thermal printing",
      "Full offline billing capability (0ms speed)",
      "GST compliance & digital receipts",
      "Customer credit & ledger management",
    ],
    packageIncludes: [
      "EzBill Software License (1 Year)",
      "Bada 2-inch Thermal Printer (1 Year Warranty)",
      "Heavy-duty Power Cable",
      "5 Thermal Paper Rolls",
    ],
  },
  {
    id: "bada-3inch-setup",
    title: "EzBill 3-Inch Wide Billing Setup",
    category: "machines",
    image: "3.jpeg",
    originalPrice: "Rs. 7,999",
    salePrice: "Rs. 5,999",
    discount: "25% OFF",
    shortDesc: "Wide 80mm format thermal printer setup with 1-year software.",
    description:
      "Wide 3-inch (80mm) receipt printer setup for detailed itemized GST invoices, restaurant bills, and fast customer checkout.",
    features: [
      "Wide 80mm receipt printing",
      "Table management & KOT printing support",
      "Dynamic UPI payment QR codes on bills",
      "Complete inventory and stock control",
    ],
    packageIncludes: [
      "EzBill Billing Software (1 Year)",
      "Wide 3-inch Thermal Printer (1 Year Warranty)",
      "Power Cable & Adapter",
      "3 Large 80mm Paper Rolls",
    ],
  },
  {
    id: "label-printer",
    title: "EzBill 2in1 Label & Barcode Printer",
    category: "printers",
    image: "4.jpeg",
    originalPrice: "Rs. 7,999",
    salePrice: "Rs. 5,999",
    discount: "25% OFF",
    shortDesc: "Portable label sticker + receipt printer for MRP & barcodes.",
    description:
      "Portable Dual-Mode Thermal Printer – Prints sticky barcode/MRP labels and standard customer receipts wirelessly.",
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
    title: "EzBill Desktop & Cloud ERP Suite",
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
    title: "EzBill Handheld Touch POS Terminal (Z91)",
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
    title: "EzBill PS80 8-Inch Android Counter POS",
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
    title: "EzBill PS11 Dual-Display POS Terminal",
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
    title: "EzBill 95A 15.6-Inch Dual-Screen Flagship POS",
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
    title: "EzBill Regular 2-inch Bluetooth Thermal Printer",
    category: "printers",
    image: "10.jpeg",
    originalPrice: "Rs. 4,999",
    salePrice: "Rs. 2,499",
    discount: "50% OFF",
    shortDesc: "Wireless Bluetooth 58mm receipt printer with battery.",
    description:
      "Portable Bluetooth thermal printer with rechargeable battery. Fast 80mm/s speed, crystal-clear receipts, and 1-tap auto-connection with EzBill.",
    specs: [
      { label: "Paper Size", value: "58mm Standard Receipt" },
      { label: "Speed", value: "80 mm/s" },
      { label: "Connectivity", value: "Bluetooth + USB" },
      { label: "Battery", value: "Built-in Rechargeable" },
    ],
  },
  {
    id: "printer-2inch-bada",
    title: "EzBill Bada 2-inch Counter Printer",
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
    title: "EzBill Bada 3-Inch Thermal Printer",
    category: "printers",
    image: "12.jpeg",
    originalPrice: "Rs. 6,999",
    salePrice: "Rs. 3,999",
    discount: "43% OFF",
    shortDesc: "Wide 80mm bill printer for restaurants and retail.",
    description:
      "Wide 3-inch thermal printer supporting full GST bills, itemized dining orders, and clear UPI QR codes.",
  },
  {
    id: "printer-srs710",
    title: "EzBill SRS710 High-Speed Auto-Cut Printer",
    category: "printers",
    image: "13.jpeg",
    originalPrice: "Rs. 14,999",
    salePrice: "Rs. 7,499",
    discount: "50% OFF",
    shortDesc: "Commercial 120mm/s receipt printer with auto-cutter.",
    description:
      "Heavy-duty 80mm thermal receipt printer with precision automatic paper cutter. Blazing 120 mm/s print speed for high-traffic food courts.",
    specs: [
      { label: "Paper Width", value: "80mm Standard" },
      { label: "Speed", value: "120 mm/s Blazing Fast" },
      { label: "Cutter", value: "Automatic Paper Cut" },
    ],
  },
  {
    id: "paper-rolls-57mm",
    title: "EzBill 57mm Thermal Paper Rolls (Pack)",
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
    title: "EzBill 80mm Heavy-Duty Thermal Paper Rolls (Pack)",
    category: "supplies",
    image: "15.jpeg",
    originalPrice: "Rs. 100",
    salePrice: "Rs. 50",
    discount: "50% OFF",
    shortDesc: "25-meter 80mm rolls for standard counter receipt printers.",
    description:
      "Heavy-duty 80mm thermal receipt rolls with 25-meter continuous length. Compatible with all 3-inch thermal printers.",
  },
  {
    id: "stickers-50x25",
    title: "EzBill Barcode Stickers 50×25 mm (500 Labels)",
    category: "supplies",
    image: "16.jpeg",
    originalPrice: "Rs. 200",
    salePrice: "Rs. 100",
    discount: "50% OFF",
    shortDesc: "Direct thermal adhesive barcode & MRP sticker rolls.",
    description:
      "50 × 25 mm (2 × 1 inch) direct thermal stickers. 500 labels per roll. Strong adhesive backing for kitchen containers and retail packages.",
  },
  {
    id: "stickers-50x50",
    title: "EzBill Barcode Stickers 50×50 mm (250 Labels)",
    category: "supplies",
    image: "17.jpeg",
    originalPrice: "Rs. 200",
    salePrice: "Rs. 100",
    discount: "50% OFF",
    shortDesc: "Square 2×2 inch labels for packaging & product tags.",
    description:
      "50 × 50 mm (2 × 2 inch) square adhesive labels. 250 labels per roll. Perfect for retail boxes, courier tags, and shipping labels.",
  },
];

const CATEGORIES_DATA = [
  { name: "Restaurants & Dining", img: "category5.jpg", badge: "Tables · KOT · Split Bill" },
  { name: "Cafes & Bakeries", img: "category6.jpg", badge: "Fast Counter · Combos" },
  { name: "Cloud Kitchens & QSR", img: "category1.jpg", badge: "Multi-KOT · Auto Sync" },
  { name: "Bars & Pubs", img: "category8.jpg", badge: "Tabs · Bottle Stock" },
  { name: "Grocery & Supermarket", img: "category7.jpg", badge: "Barcode · Weight Scale" },
  { name: "Fashion & Retail", img: "category2.jpg", badge: "Size/Color · GST Invoices" },
  { name: "Salons & Spas", img: "category4.jpg", badge: "Appointments · Staff Commission" },
  { name: "Laundry & Services", img: "category3.jpg", badge: "Tags · Order Tracking" },
];

const TESTIMONIALS = [
  {
    name: "Ammar Master",
    biz: "Spice Garden Restaurant & Cafe",
    quote:
      "EzBill is ridiculously fast. Table orders to kitchen KOT take 0 seconds. Even when our internet drops during peak Sunday rush, billing never pauses!",
  },
  {
    name: "Vikram Rathore",
    biz: "The Royal Biryani House, Hyderabad",
    quote:
      "The Bluetooth MTP-II and TVS printer connection works instantly without any driver setup. Our staff learned the waiter POS in 5 minutes.",
  },
  {
    name: "Neha Kulkarni",
    biz: "Urban Cloud Kitchen, Pune",
    quote:
      "The real-time Kitchen Display (KDS) with sound chimes stopped all our order mix-ups. Chef knows exactly what to cook and timer prevents delayed orders.",
  },
  {
    name: "Rajesh Gupta",
    biz: "Gupta Mart & Grocery, Delhi",
    quote:
      "The live sales analytics showing Cash vs UPI breakdown and cash closing reconciliation makes our daily accounts 100% error-free.",
  },
];

// App Modules Showcase Data
const APP_MODULES = [
  {
    id: "pos",
    icon: "cart-outline",
    name: "Takeaway & POS Register",
    tagline: "0ms Billing with Instant Settle",
    webScreenshot: "web-pos.png",
    mobileScreenshot: "mobile-pos.png",
    description:
      "Lightning-fast item search, food category tabs (Chicken, Mutton, Biryani), 1-tap cart totaling ₹280, float-safe integer GST calculation, and instant payment settlement.",
    highlights: [
      "1-tap fast cart with item counts & pricing",
      "Real-time food categories & veg/non-veg tags",
      "Dynamic UPI QR code generation on receipt",
      "Full offline local billing with 0ms response",
    ],
  },
  {
    id: "tables",
    icon: "grid-outline",
    name: "Floor & Table Management",
    tagline: "Live Dine-In Occupancy & Orders",
    webScreenshot: "web-tables.png",
    mobileScreenshot: "mobile-tables.png",
    description:
      "Visual real-time floor grid showing Available (Green), Occupied (Amber), and Billed tables. Track active covers, transfer tables, and merge bills in 1 tap.",
    highlights: [
      "Live table occupancy metrics (Available 9 / 10, Occupied 1)",
      "Table 1 occupied with active order total (₹240)",
      "Dine-in, Parcel 📦, and Takeaway dedicated sections",
      "Fast 1-tap waiter order routing directly to kitchen",
    ],
  },
  {
    id: "kds",
    icon: "restaurant-outline",
    name: "Kitchen Display (KDS)",
    tagline: "Real-Time Digital KOT Tickets",
    webScreenshot: "web-kds.png",
    mobileScreenshot: "mobile-kds.png",
    description:
      "Replace lost paper tickets with live digital KOT cards. Chefs view ticket numbers (#59, #da, #65), elapsed prep timers (4m 20s), and trigger 'Start Cooking' instantly.",
    highlights: [
      "Live order cards: Table 1 (1x Full Biryani, 1x Half Biryani)",
      "High-frequency audio chime alert on new incoming orders",
      "Color-coded urgency timers preventing delayed food",
      "Takeaway instructions highlighted directly on screen",
    ],
  },
  {
    id: "printers",
    icon: "print-outline",
    name: "Thermal Printer Auto-Setup",
    tagline: "Universal 58mm & 80mm ESC/POS",
    webScreenshot: "web-printers.png",
    mobileScreenshot: "mobile-pos.png",
    description:
      "Zero-driver thermal receipt printing. 1-tap auto presets for TVS Electronics, Epson LAN/WiFi, Xprinter / Everycom, Sunmi POS, and Bluetooth MTP-II printers.",
    highlights: [
      "MTP-II Bluetooth printer connected & ready (58mm / 80mm)",
      "Automatic background printing for customer receipts & KOTs",
      "Kick drawer trigger & paper auto-cutting support",
      "Seamless USB, Bluetooth, LAN Ethernet & System Spooler",
    ],
  },
  {
    id: "analytics",
    icon: "bar-chart-outline",
    name: "Dashboard & Sales Analytics",
    tagline: "Revenue, Trends & Cash Closing",
    webScreenshot: "web-dashboard.png",
    mobileScreenshot: "mobile-analytics.png",
    description:
      "Live today's revenue (₹252), total annual revenue (₹148,532.1), 404 orders, and precise payment breakdown: Cash (₹74,175.1) vs UPI (₹56,177) with cash closing.",
    highlights: [
      "Real-time revenue counter and active order funnel",
      "Quarterly revenue distribution bar charts (Q1 to Q4)",
      "Payment method split: Cash ₹74.1k vs UPI ₹56.1k",
      "End-of-day Cash Closing & shift reconciliation",
    ],
  },
];

export default function Index() {
  const { user, loading } = useAuth();
  const { addToCart, cartCount, cartTotal, setIsCartOpen } = useCart();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const showFullNav = width >= 1400; // Narrower screens cannot fit every link and button in one row
  const isPhone = width < 576;

  // State
  const [activeModuleIndex, setActiveModuleIndex] = useState(0);
  const [deviceView, setDeviceView] = useState<"both" | "desktop" | "mobile">("both");
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [heroToggle, setHeroToggle] = useState<"software" | "hardware">("software");

  const scrollViewRef = useRef<ScrollView>(null);

  // Auto redirect: in native app (APK / iOS), open login screen when unauthenticated.
  // On website (browser), open landing page. Logged-in users route to active dashboard/waiter.
  useEffect(() => {
    if (!loading) {
      if (user) {
        if (user.role === "waiter" || user.role === "kitchen") {
          router.replace("/(app)/waiter");
        } else {
          router.replace("/(app)/dashboard");
        }
      } else if (Platform.OS !== "web") {
        router.replace("/login");
      }
    }
  }, [user, loading, router]);

  const openWhatsApp = (msg: string) => {
    const url = `${WHATSAPP_BASE_URL}${encodeURIComponent(msg)}`;
    Linking.openURL(url).catch(() => {});
  };

  const currentModule = APP_MODULES[activeModuleIndex];

  const filteredProducts =
    activeCategory === "all"
      ? PRODUCTS
      : PRODUCTS.filter((p) => p.category === activeCategory);

  // The app (APK / iOS) never shows the website landing page, and a signed-in
  // person is on their way to the dashboard, so show only the loader meanwhile.
  if (loading || user || Platform.OS !== "web") {
    return (
      <View style={styles.center} testID="landing-loading">
        <ActivityIndicator size="large" color="#FF5E2B" />
        <Text style={styles.loadingText}>Starting EzBill ERP...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} testID="landing-screen">
      <StatusBar barStyle="light-content" backgroundColor="#08090C" />

      {/* ================= STICKY TOP NAVBAR ================= */}
      <View style={styles.navbar}>
        <View style={[styles.navContainer, width >= 768 && styles.navContainerDesktop]}>
          {/* Brand Logo */}
          <TouchableOpacity
            style={[styles.brandRow, showFullNav && { flex: 0, flexShrink: 0 }]}
            onPress={() => router.push("/")}
            activeOpacity={0.8}
          >
            <View style={styles.navLogoBox}>
              <Ionicons name="receipt" size={20} color="#FFFFFF" />
            </View>
            <View style={showFullNav ? undefined : styles.brandTextCol}>
              <Text style={styles.navBrandTitle}>
                EzBill <Text style={styles.navBrandHighlight}>POS</Text>
              </Text>
              {!isPhone && <Text style={styles.navBrandSubtitle} numberOfLines={1}>BY PRODEVOPZ · RESTAURANT ERP</Text>}
            </View>
          </TouchableOpacity>

          {/* Desktop Navigation Links */}
          {showFullNav ? (
            <View style={styles.desktopNavLinks}>
              <TouchableOpacity
                onPress={() => {
                  scrollViewRef.current?.scrollTo({ y: 700, animated: true });
                }}
                style={styles.navLinkItem}
              >
                <Text style={styles.navLinkText}>App Tour</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push("/pos-erp")}
                style={styles.navLinkItem}
              >
                <Text style={styles.navLinkText}>Features</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push("/shop" as any)}
                style={styles.navLinkItem}
              >
                <Text style={[styles.navLinkText, { color: "#FF8A3D", fontWeight: "800" }]}>
                  Hardware Store
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  scrollViewRef.current?.scrollTo({ y: 1650, animated: true });
                }}
                style={styles.navLinkItem}
              >
                <Text style={styles.navLinkText}>Categories</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push("/pricing")}
                style={styles.navLinkItem}
              >
                <Text style={styles.navLinkText}>Pricing</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => openWhatsApp("Hi, I want to talk with your team about EzBill POS.")}
                style={styles.navLinkItem}
              >
                <Text style={styles.navLinkText}>Contact Us</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Actions & Portal Access */}
          <View style={styles.navRightActions}>
            {/* Cart Button */}
            <TouchableOpacity
              style={styles.navCartBtn}
              onPress={() => setIsCartOpen(true)}
              testID="landing-cart-btn"
            >
              <Ionicons name="cart" size={17} color="#FFFFFF" />
              {showFullNav && <Text style={styles.navCartBtnText}>Cart</Text>}
              {cartCount > 0 && (
                <View style={styles.navCartBadge}>
                  <Text style={styles.navCartBadgeText}>{cartCount}</Text>
                </View>
              )}
            </TouchableOpacity>

            {showFullNav ? (
              <>
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
                  <Text style={styles.navBookBtnText}>Free Trial</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.navLoginBtnMobile}
                  onPress={() => router.push("/login")}
                  activeOpacity={0.8}
                >
                  <Ionicons name="log-in-outline" size={15} color="#FFFFFF" />
                  <Text style={styles.navLoginBtnMobileText}>Login</Text>
                </TouchableOpacity>

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
              </>
            )}
          </View>
        </View>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && !showFullNav && (
          <View style={styles.mobileDropdown}>
            <TouchableOpacity
              style={styles.mobileDropdownItem}
              onPress={() => {
                setMobileMenuOpen(false);
                router.push("/shop" as any);
              }}
            >
              <Ionicons name="storefront-outline" size={18} color="#FF5E2B" />
              <Text style={[styles.mobileDropdownText, { color: "#FF8A3D", fontWeight: "800" }]}>
                Hardware Store (Printers & POS)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.mobileDropdownItem}
              onPress={() => {
                setMobileMenuOpen(false);
                scrollViewRef.current?.scrollTo({ y: 600, animated: true });
              }}
            >
              <Ionicons name="phone-portrait-outline" size={18} color="#FF5E2B" />
              <Text style={styles.mobileDropdownText}>Live App Tour</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.mobileDropdownItem}
              onPress={() => {
                setMobileMenuOpen(false);
                router.push("/pos-erp");
              }}
            >
              <Ionicons name="grid-outline" size={18} color="#38BDF8" />
              <Text style={styles.mobileDropdownText}>ERP &amp; Billing Features</Text>
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
                router.push("/staff-login");
              }}
            >
              <Ionicons name="keypad-outline" size={18} color="#F59E0B" />
              <Text style={styles.mobileDropdownText}>Staff PIN Login (Waiter / KDS)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.mobileDropdownItem}
              onPress={() => {
                setMobileMenuOpen(false);
                router.push("/register");
              }}
            >
              <Ionicons name="person-add-outline" size={18} color="#10B981" />
              <Text style={styles.mobileDropdownText}>Create Free Account</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.mobileDropdownItem}
              onPress={() => {
                setMobileMenuOpen(false);
                openWhatsApp("Hi, I want to book an EzBill POS demo.");
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
                <Text style={styles.pillText}>INDIA'S #1 RESTAURANT POS &amp; ERP SOLUTION</Text>
              </View>

              <Text style={[styles.heroTitle, isPhone && { fontSize: 28, lineHeight: 36 }]}>
                EzBill — Restaurant POS, ERP{"\n"}
                <Text style={styles.heroTitleAccent}>&amp; Restaurant Management System</Text>
              </Text>

              <Text style={styles.heroSubtitle}>
                Run your entire restaurant, cafe, or retail counter with 0ms offline speed.
                Real-time table floor layout, live digital KOTs, universal thermal printer integration,
                and instant UPI QR billing — all under one unified platform: <Text style={{ color: "#FFF", fontWeight: "700" }}>EzBill</Text>.
              </Text>

              {/* Primary Call to Action Buttons */}
              <View style={styles.heroCtaRow}>
                <TouchableOpacity
                  style={styles.heroPrimaryBtn}
                  onPress={() => router.push("/register")}
                  activeOpacity={0.85}
                >
                  <Ionicons name="sparkles" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.heroPrimaryBtnText}>Start Free Trial</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.heroStoreBtn}
                  onPress={() => router.push("/shop" as any)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="storefront-outline" size={16} color="#FF8A3D" style={{ marginRight: 6 }} />
                  <Text style={styles.heroStoreBtnText}>Hardware Store</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.heroSecondaryBtn}
                  onPress={() =>
                    openWhatsApp(
                      "Hi, I want to book the EzBill POS Billing Machine. Please share complete hardware package details and pricing."
                    )
                  }
                  activeOpacity={0.85}
                >
                  <Ionicons name="logo-whatsapp" size={16} color="#25D366" style={{ marginRight: 6 }} />
                  <Text style={styles.heroSecondaryBtnText}>WhatsApp Demo</Text>
                </TouchableOpacity>
              </View>

              {/* Quick Credentials / Access Badges */}
              <View style={styles.appBadgesRow}>
                <TouchableOpacity
                  style={styles.googlePlayBox}
                  onPress={() =>
                    Linking.openURL(
                      "/ezbill-pos.apk"
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
                  <Text style={styles.heroFeaturePillText}>0ms Offline · GST Compliant · MTP-II Printer Ready</Text>
                </View>
              </View>
            </View>

            {/* Right Hero Column: Interactive Preview (Software vs Hardware) */}
            <View style={[styles.heroRightCol, isDesktop && { flex: 1.05 }]}>
              <View style={styles.heroToggleBar}>
                <TouchableOpacity
                  style={[styles.heroToggleBtn, heroToggle === "software" && styles.heroToggleBtnActive]}
                  onPress={() => setHeroToggle("software")}
                >
                  <Ionicons name="laptop-outline" size={16} color={heroToggle === "software" ? "#FFF" : "#94A3B8"} />
                  <Text style={[styles.heroToggleText, heroToggle === "software" && styles.heroToggleTextActive]}>
                    EzBill App Suite
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.heroToggleBtn, heroToggle === "hardware" && styles.heroToggleBtnActive]}
                  onPress={() => setHeroToggle("hardware")}
                >
                  <Ionicons name="hardware-chip-outline" size={16} color={heroToggle === "hardware" ? "#FFF" : "#94A3B8"} />
                  <Text style={[styles.heroToggleText, heroToggle === "hardware" && styles.heroToggleTextActive]}>
                    Hardware Machines
                  </Text>
                </TouchableOpacity>
              </View>

              {heroToggle === "software" ? (
                /* Software Suite Showcase Card */
                <View style={styles.heroMockupContainer}>
                  {/* Laptop Bezel Mockup */}
                  <View style={styles.laptopFrame}>
                    <View style={styles.laptopTopBar}>
                      <View style={styles.windowDots}>
                        <View style={[styles.windowDot, { backgroundColor: "#EF4444" }]} />
                        <View style={[styles.windowDot, { backgroundColor: "#F59E0B" }]} />
                        <View style={[styles.windowDot, { backgroundColor: "#10B981" }]} />
                      </View>
                      <Text style={styles.laptopUrlBar} numberOfLines={1}>ezbill.jobsio.in / takeaway-billing-pos</Text>
                      <View style={{ width: 40 }} />
                    </View>
                    <Image
                      source={{ uri: getScreenshotUri("web-pos.png") }}
                      style={[styles.laptopScreenImg, isPhone && { height: 190 }]}
                      resizeMode="cover"
                    />
                  </View>

                  {/* Overlapping Floating Smartphone Mockup */}
                  <View style={[styles.heroPhoneOverlay, isPhone && { width: 84, height: 168, borderRadius: 16 }]}>
                    <View style={styles.phoneNotch} />
                    <Image
                      source={{ uri: getScreenshotUri("mobile-dashboard.png") }}
                      style={styles.phoneScreenImg}
                      resizeMode="cover"
                    />
                  </View>
                </View>
              ) : (
                /* Hardware Bundle Card */
                <View style={styles.bannerCarouselCard}>
                  <Image
                    source={{ uri: getImgUri("baner_photo_.jpeg") }}
                    style={[styles.bannerImg, isPhone && { height: 220 }]}
                    resizeMode="cover"
                  />
                  <View style={styles.bannerFloatingTag}>
                    <Ionicons name="print" size={14} color="#FFFFFF" />
                    <Text style={styles.bannerFloatingText}>Wireless Bluetooth Thermal Printer Bundle</Text>
                  </View>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* ================= 2. STATISTICS STRIP ================= */}
        <View style={styles.statsSection}>
          <View style={[styles.sectionContainer, isDesktop && styles.statsRowDesktop]}>
            <View style={[styles.statsQuoteBox, isDesktop && { flex: 1.2 }]}>
              <Text style={styles.statsQuote}>
                "Over 3,500+ restaurants, cafes &amp; retail stores across India rely on EzBill for zero-downtime billing."
              </Text>
            </View>
            <View style={[styles.statsCardsRow, isDesktop && { flex: 0.9 }]}>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>3,500 +</Text>
                <Text style={styles.statLabel}>Active Counters</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>0 ms</Text>
                <Text style={styles.statLabel}>Offline Latency</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>₹50 Cr+</Text>
                <Text style={styles.statLabel}>Bills Processed</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ================= 3. CORE HIGHLIGHT: INTERACTIVE APP TOUR & SCREENSHOT SHOWCASE ================= */}
        <View style={styles.appTourSection}>
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionSmallBadge}>LIVE APP EXPERIENCE</Text>
              <Text style={styles.sectionHeading}>
                Built for Speed. <Text style={styles.textPrimary}>Engineered for Every Screen.</Text>
              </Text>
              <Text style={styles.sectionSubheading}>
                Explore the actual interface of EzBill running on Desktop Web Pro and Mobile Waiter App.
              </Text>
            </View>

            {/* Module Selector Tabs */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.moduleTabsScroll}
            >
              {APP_MODULES.map((mod, idx) => {
                const isActive = activeModuleIndex === idx;
                return (
                  <TouchableOpacity
                    key={mod.id}
                    style={[styles.moduleTabBtn, isActive && styles.moduleTabBtnActive]}
                    onPress={() => setActiveModuleIndex(idx)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={mod.icon as any}
                      size={18}
                      color={isActive ? "#FF5E2B" : "#94A3B8"}
                    />
                    <Text style={[styles.moduleTabText, isActive && styles.moduleTabTextActive]}>
                      {mod.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Viewport Mode Switcher (Both / Desktop / Mobile) */}
            <View style={styles.deviceViewControlRow}>
              <Text style={styles.deviceViewLabel}>Screen Mode:</Text>
              <View style={styles.deviceViewPillGroup}>
                <TouchableOpacity
                  style={[styles.deviceViewPill, deviceView === "both" && styles.deviceViewPillActive]}
                  onPress={() => setDeviceView("both")}
                >
                  <Text style={[styles.deviceViewPillText, deviceView === "both" && styles.deviceViewPillTextActive]}>
                    Dual View (PC + Phone)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.deviceViewPill, deviceView === "desktop" && styles.deviceViewPillActive]}
                  onPress={() => setDeviceView("desktop")}
                >
                  <Text style={[styles.deviceViewPillText, deviceView === "desktop" && styles.deviceViewPillTextActive]}>
                    Web Pro (1024px)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.deviceViewPill, deviceView === "mobile" && styles.deviceViewPillActive]}
                  onPress={() => setDeviceView("mobile")}
                >
                  <Text style={[styles.deviceViewPillText, deviceView === "mobile" && styles.deviceViewPillTextActive]}>
                    Mobile Waiter App
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Showcase Stage */}
            <View style={styles.showcaseStageCard}>
              <View style={[styles.showcaseContentRow, isDesktop && styles.showcaseRowDesktop]}>
                {/* Left Side: Mockups Viewport */}
                <View style={[styles.showcaseScreensCol, isDesktop && { flex: 1.4 }]}>
                  {/* Web Screenshot View */}
                  {(deviceView === "both" || deviceView === "desktop") && (
                    <View style={styles.desktopDisplayFrame}>
                      <View style={styles.frameHeader}>
                        <View style={styles.windowDots}>
                          <View style={[styles.windowDot, { backgroundColor: "#EF4444" }]} />
                          <View style={[styles.windowDot, { backgroundColor: "#F59E0B" }]} />
                          <View style={[styles.windowDot, { backgroundColor: "#10B981" }]} />
                        </View>
                        <Text style={styles.frameTitle}>EzBill ERP · Windows &amp; Web Pro</Text>
                        <View style={styles.liveBadgePill}>
                          <View style={styles.liveGreenDot} />
                          <Text style={styles.liveBadgeText}>ONLINE / READY</Text>
                        </View>
                      </View>
                      <Image
                        source={{ uri: getScreenshotUri(currentModule.webScreenshot) }}
                        style={styles.frameScreenshotWeb}
                        resizeMode="cover"
                      />
                    </View>
                  )}

                  {/* Mobile Screenshot View */}
                  {(deviceView === "both" || deviceView === "mobile") && (
                    <View
                      style={[
                        styles.mobileDisplayFrame,
                        deviceView === "both" && isDesktop && styles.mobileFloatingFrame,
                      ]}
                    >
                      <View style={styles.phoneSpeaker} />
                      <Image
                        source={{ uri: getScreenshotUri(currentModule.mobileScreenshot) }}
                        style={styles.frameScreenshotMobile}
                        resizeMode="cover"
                      />
                    </View>
                  )}
                </View>

                {/* Right Side: Feature Breakdown & Real Data */}
                <View style={[styles.showcaseDetailsCol, isDesktop && { flex: 1 }]}>
                  <View style={styles.moduleTagBadge}>
                    <Ionicons name="sparkles" size={14} color="#FF5E2B" />
                    <Text style={styles.moduleTagBadgeText}>{currentModule.tagline}</Text>
                  </View>

                  <Text style={styles.showcaseHeading}>{currentModule.name}</Text>
                  <Text style={styles.showcaseDescription}>{currentModule.description}</Text>

                  {/* Highlights Bullet List */}
                  <View style={styles.highlightsList}>
                    {currentModule.highlights.map((item, hIdx) => (
                      <View key={hIdx} style={styles.highlightItem}>
                        <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                        <Text style={styles.highlightItemText}>{item}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Action CTA */}
                  <View style={styles.showcaseCtaRow}>
                    <TouchableOpacity
                      style={styles.showcasePrimaryBtn}
                      onPress={() => router.push("/register")}
                    >
                      <Text style={styles.showcasePrimaryBtnText}>Try This Feature Free</Text>
                      <Ionicons name="arrow-forward" size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.showcaseWhatsappBtn}
                      onPress={() =>
                        openWhatsApp(
                          `Hi, I saw the ${currentModule.name} on EzBill. Can you give me a live demo?`
                        )
                      }
                    >
                      <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
                      <Text style={styles.showcaseWhatsappBtnText}>Ask on WhatsApp</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* ================= 4. INDUSTRY CATEGORIES ================= */}
        <View style={styles.categoriesSection}>
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionSmallBadge}>BUSINESS SEGMENTS</Text>
              <Text style={styles.sectionHeading}>Tailored for Every Food &amp; Retail Business</Text>
              <Text style={styles.sectionSubheading}>
                From small quick-service cafes to multi-floor dine-in restaurants and supermarkets.
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
                    <Text style={styles.catBadgeText}>{cat.badge}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ================= 5. HARDWARE & MACHINE CATALOG ================= */}
        <View style={styles.productsSection}>
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionSmallBadge}>EZBILL HARDWARE STORE</Text>
              <Text style={styles.sectionHeading}>
                Genuine POS Machines &amp; <Text style={styles.textPrimary}>Thermal Printers</Text>
              </Text>
              <Text style={styles.sectionSubheading}>
                100% pre-configured with EzBill software. Plug &amp; play setup with 1-Year on-site replacement warranty.
              </Text>
            </View>

            {/* Product Category Filter Tabs */}
            <View style={styles.filterTabsRow}>
              {[
                { key: "all", label: "All Products" },
                { key: "machines", label: "POS Billing Machines" },
                { key: "printers", label: "Thermal Printers" },
                { key: "software", label: "Software Plans" },
                { key: "supplies", label: "Paper Rolls & Stickers" },
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
                      ? { width: "23.5%" }
                      : width < 576
                      ? { width: "100%" }
                      : { width: "48%" },
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
                    <View style={styles.stockBadge}>
                      <View style={styles.greenDot} />
                      <Text style={styles.stockText}>In Stock</Text>
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
                      <Text style={styles.prodSalePrice}>{prod.salePrice}</Text>
                      <Text style={styles.prodOriginalPrice}>{prod.originalPrice}</Text>
                    </View>

                    {/* Action Buttons: Add to Cart, Buy Now, Details */}
                    <View style={styles.prodActionsRow}>
                      <TouchableOpacity
                        style={styles.addCartBtn}
                        onPress={() => addToCart(prod, 1)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="cart-outline" size={15} color="#FFFFFF" />
                        <Text style={styles.addCartBtnText}>Add</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.buyNowBtn}
                        onPress={() => {
                          addToCart(prod, 1);
                          router.push("/checkout" as any);
                        }}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="flash" size={13} color="#FFFFFF" />
                        <Text style={styles.buyNowBtnText}>Buy</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.detailsIconBtn}
                        onPress={() => setSelectedProduct(prod)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="information-circle-outline" size={16} color="#CBD5E1" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </View>

            {/* Visit Store Banner */}
            <View style={styles.visitStoreBanner}>
              <View style={styles.visitStoreInfo}>
                <Text style={styles.visitStoreTitle}>Official EzBill POS Hardware Store by ProDevOpz</Text>
                <Text style={styles.visitStoreSub}>
                  Compare models, view technical ESC/POS specifications, and order with 1-Year on-site warranty.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.visitStoreBtn}
                onPress={() => router.push("/shop" as any)}
              >
                <Ionicons name="storefront" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.visitStoreBtnText}>Open Hardware Store</Text>
                <Ionicons name="arrow-forward" size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ================= 6. TESTIMONIALS SECTION ================= */}
        <View style={[styles.testimonialsSection, styles.altSectionBg]}>
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionSmallBadge}>REVIEWS &amp; STORIES</Text>
              <Text style={styles.sectionHeading}>
                Loved by <Text style={styles.textPrimary}>Restaurant Owners</Text>
              </Text>
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
                      <Ionicons name="restaurant" size={18} color="#FF8A3D" />
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

        {/* ================= 7. PARTNERS & HARDWARE COMPATIBILITY ================= */}
        <View style={styles.clientsSection}>
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionSmallBadge}>UNIVERSAL HARDWARE ECOSYSTEM</Text>
              <Text style={styles.sectionHeading}>Works Seamlessly with All Leading POS Hardware</Text>
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

        {/* ================= 8. QUICK PORTAL & STAFF ACCESS CARD ================= */}
        <View style={styles.portalCardSection}>
          <View style={styles.sectionContainer}>
            <View style={styles.portalAccessCard}>
              <View style={styles.portalCardHeader}>
                <Ionicons name="lock-closed" size={24} color="#FF5E2B" />
                <Text style={styles.portalCardTitle}>EzBill Cloud Portal &amp; Staff Access</Text>
              </View>
              <Text style={styles.portalCardSubtitle}>
                Existing restaurant or retail business? Quickly sign into your live register, staff waiter PIN pad, or
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

        {/* ================= 9. FOOTER ================= */}
        <View style={styles.footerSection}>
          <View style={[styles.sectionContainer, isDesktop && styles.footerGridDesktop]}>
            <View style={[styles.footerColBrand, isDesktop && { flex: 1.5 }]}>
              <View style={styles.brandRow}>
                <View style={styles.navLogoBox}>
                  <Ionicons name="receipt" size={20} color="#FFFFFF" />
                </View>
                <Text style={styles.navBrandTitle}>
                  EzBill <Text style={styles.navBrandHighlight}>POS</Text>
                </Text>
              </View>
              <Text style={styles.footerDesc}>
                EzBill is India's leading restaurant POS &amp; ERP software. Live table management, thermal bill printing (58mm/80mm),
                float-safe GST calculations, digital KOTs, and 100% offline billing.
              </Text>
              <TouchableOpacity
                onPress={() =>
                  Linking.openURL(
                    "/ezbill-pos.apk"
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
                <Text style={styles.footerLink}>Table Management</Text>
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
                  openWhatsApp("Hi, I need assistance with EzBill Billing Software.")
                }
              >
                <Text style={styles.footerLink}>WhatsApp: +91 81520 75375</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => Linking.openURL("mailto:contactprodevopz@gmail.com")}>
                <Text style={styles.footerLink}>Email: contactprodevopz@gmail.com</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => openWhatsApp("Hi, I want to book a billing machine demo.")}>
                <Text style={styles.footerLink}>Book Billing Machine</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push("/register")}>
                <Text style={styles.footerLink}>Create Free Account</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => Linking.openURL("https://ezbill.jobsio.in/privacy-policy.html")}>
                <Text style={styles.footerLink}>Privacy Policy</Text>
              </TouchableOpacity>
              <Text style={styles.footerMutedText}>All-India Support (Mon - Sun)</Text>
            </View>
          </View>

          <View style={styles.footerBottomBar}>
            <Text style={styles.footerCopyText}>
              © {new Date().getFullYear()} EzBill Solutions. All rights reserved. Made with pride for Indian restaurants &amp; retailers.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* ================= PRODUCT DETAIL MODAL ================= */}
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
                        style={styles.modalAddCartBtn}
                        onPress={() => {
                          addToCart(selectedProduct, 1);
                          setSelectedProduct(null);
                          setIsCartOpen(true);
                        }}
                      >
                        <Ionicons name="cart" size={16} color="#FF8A3D" style={{ marginRight: 6 }} />
                        <Text style={styles.modalAddCartBtnText}>Add to Cart</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.modalBuyBtn}
                        onPress={() => {
                          addToCart(selectedProduct, 1);
                          setSelectedProduct(null);
                          router.push("/checkout" as any);
                        }}
                      >
                        <Ionicons name="flash" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                        <Text style={styles.modalBuyBtnText}>Buy Now</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.modalWhatsappBtn}
                        onPress={() =>
                          openWhatsApp(
                            `Hi, I want to order ${selectedProduct.title}. Please share specifications and delivery details.`
                          )
                        }
                      >
                        <Ionicons name="logo-whatsapp" size={17} color="#FFFFFF" style={{ marginRight: 6 }} />
                        <Text style={styles.modalWhatsappBtnText}>Enquire</Text>
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

      {/* ================= FLOATING CART BAR (MOBILE/TABLET) ================= */}
      {cartCount > 0 && (
        <View style={styles.floatingCartBar}>
          <TouchableOpacity
            style={styles.floatingCartContent}
            onPress={() => setIsCartOpen(true)}
            activeOpacity={0.9}
          >
            <View style={styles.floatingCartLeft}>
              <View style={styles.floatingCartBadge}>
                <Ionicons name="cart" size={15} color="#FFFFFF" />
                <Text style={styles.floatingCartBadgeText}>{cartCount}</Text>
              </View>
              <View>
                <Text style={styles.floatingCartTitle}>Cart ({cartCount} {cartCount === 1 ? "item" : "items"})</Text>
                <Text style={styles.floatingCartSub}>₹{cartTotal.toLocaleString("en-IN")}</Text>
              </View>
            </View>

            <View style={styles.floatingCartRight}>
              <Text style={styles.floatingCartBtnText}>View Cart</Text>
              <Ionicons name="arrow-forward" size={15} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* ================= SHOPPING CART DRAWER ================= */}
      <CartDrawerModal />
    </SafeAreaView>
  );
}

// ================= STYLES =================
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#08090C",
    width: "100%",
    overflow: "hidden",
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
    width: "100%",
    backgroundColor: "#08090C",
  },
  scrollContent: {
    flexGrow: 1,
    width: "100%",
  },

  // ===== NAVBAR =====
  navbar: {
    backgroundColor: "#08090C",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    zIndex: 100,
    width: "100%",
  },
  navContainer: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    boxSizing: "border-box" as any,
  },
  navContainerDesktop: {
    maxWidth: 1440,
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
    marginRight: 6,
  },
  brandTextCol: {
    flex: 1,
    minWidth: 0,
  },
  navLogoBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#FF5E2B",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#FF5E2B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
    flexShrink: 0,
  },
  navBrandTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  navBrandHighlight: {
    color: "#FF8A3D",
  },
  navBrandSubtitle: {
    fontSize: 8.5,
    fontWeight: "800",
    color: "#10B981",
    letterSpacing: 1,
  },
  desktopNavLinks: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
    gap: 6,
    flexShrink: 0,
  },
  navCartBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FF5E2B",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    position: "relative",
  },
  navCartBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  navCartBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "#10B981",
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: "#08090C",
  },
  navCartBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
  },
  navLoginBtnMobile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  navLoginBtnMobileText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
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
    marginBottom: 36,
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
    fontSize: 30,
    fontWeight: "900",
    color: "#FFFFFF",
    textAlign: "center",
    lineHeight: 38,
    letterSpacing: -0.5,
  },
  sectionSubheading: {
    fontSize: 15,
    color: "#94A3B8",
    textAlign: "center",
    marginTop: 8,
    maxWidth: 640,
    lineHeight: 22,
  },
  textPrimary: {
    color: "#FF7D52",
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
    minWidth: 0,
    marginBottom: 32,
  },
  pillBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    maxWidth: "100%",
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
    flexShrink: 1,
    color: "#FF8A3D",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  heroTitle: {
    fontSize: 36,
    fontWeight: "900",
    color: "#FFFFFF",
    lineHeight: 46,
    letterSpacing: -0.8,
    marginBottom: 16,
  },
  heroTitleAccent: {
    color: "#FF5E2B",
  },
  heroSubtitle: {
    fontSize: 16,
    lineHeight: 26,
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
    backgroundColor: "#FF5E2B",
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: "#FF5E2B",
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
  heroStoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 94, 43, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 94, 43, 0.35)",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 12,
  },
  heroStoreBtnText: {
    color: "#FF8A3D",
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
    flexShrink: 1,
    maxWidth: "100%",
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
    flexShrink: 1,
    color: "#34D399",
    fontSize: 12,
    fontWeight: "700",
  },
  heroRightCol: {
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  heroToggleBar: {
    maxWidth: "100%",
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    gap: 4,
  },
  heroToggleBtn: {
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  heroToggleBtnActive: {
    backgroundColor: "#FF5E2B",
  },
  heroToggleText: {
    flexShrink: 1,
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "700",
  },
  heroToggleTextActive: {
    color: "#FFFFFF",
  },
  heroMockupContainer: {
    width: "100%",
    position: "relative",
    paddingBottom: 24,
  },
  laptopFrame: {
    width: "100%",
    backgroundColor: "#161B22",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.6,
    shadowRadius: 28,
  },
  laptopTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0F1218",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  windowDots: {
    flexDirection: "row",
    gap: 6,
  },
  windowDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  laptopUrlBar: {
    flexShrink: 1,
    marginHorizontal: 8,
    color: "#94A3B8",
    fontSize: 11,
    fontFamily: Platform.OS === "web" ? "monospace" : undefined,
  },
  laptopScreenImg: {
    width: "100%",
    height: 280,
  },
  heroPhoneOverlay: {
    position: "absolute",
    right: 12,
    bottom: -10,
    width: 135,
    height: 270,
    backgroundColor: "#000",
    borderRadius: 22,
    borderWidth: 3,
    borderColor: "#2D3748",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 10,
  },
  phoneNotch: {
    width: 40,
    height: 4,
    backgroundColor: "#333",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 4,
    zIndex: 10,
  },
  phoneScreenImg: {
    width: "100%",
    height: "100%",
  },
  bannerCarouselCard: {
    width: "100%",
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    backgroundColor: "#12161C",
  },
  bannerImg: {
    width: "100%",
    height: 340,
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
    backgroundColor: "rgba(255, 94, 43, 0.05)",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(255, 94, 43, 0.2)",
    paddingVertical: 32,
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
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 28,
    fontStyle: "italic",
  },
  statsCardsRow: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "flex-start",
  },
  statCard: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  statNumber: {
    color: "#FF8A3D",
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 4,
  },
  statLabel: {
    color: "#E2E8F0",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },

  // ===== CORE APP TOUR SECTION =====
  appTourSection: {
    paddingVertical: 60,
  },
  moduleTabsScroll: {
    flexDirection: "row",
    gap: 10,
    paddingBottom: 16,
    justifyContent: "center",
  },
  moduleTabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  moduleTabBtnActive: {
    backgroundColor: "rgba(255, 94, 43, 0.15)",
    borderColor: "#FF5E2B",
  },
  moduleTabText: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "700",
  },
  moduleTabTextActive: {
    color: "#FFFFFF",
  },
  deviceViewControlRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 24,
  },
  deviceViewLabel: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  deviceViewPillGroup: {
    maxWidth: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 20,
    padding: 3,
    justifyContent: "center",
  },
  deviceViewPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  deviceViewPillActive: {
    backgroundColor: "#FF5E2B",
  },
  deviceViewPillText: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "700",
  },
  deviceViewPillTextActive: {
    color: "#FFFFFF",
  },
  showcaseStageCard: {
    backgroundColor: "#10141D",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    overflow: "hidden",
  },
  showcaseContentRow: {
    gap: 32,
  },
  showcaseRowDesktop: {
    flexDirection: "row",
    alignItems: "center",
  },
  showcaseScreensCol: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    maxWidth: "100%",
  },
  desktopDisplayFrame: {
    width: "100%",
    backgroundColor: "#161B22",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
  },
  frameHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0B0E14",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  frameTitle: {
    color: "#CBD5E1",
    fontSize: 11,
    fontWeight: "700",
  },
  liveBadgePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  liveGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#10B981",
  },
  liveBadgeText: {
    color: "#34D399",
    fontSize: 9,
    fontWeight: "800",
  },
  frameScreenshotWeb: {
    width: "100%",
    height: 320,
  },
  mobileDisplayFrame: {
    width: 220,
    height: 440,
    backgroundColor: "#000",
    borderRadius: 28,
    borderWidth: 4,
    borderColor: "#2D3748",
    overflow: "hidden",
    marginTop: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.7,
    shadowRadius: 20,
  },
  mobileFloatingFrame: {
    position: "absolute",
    right: -10,
    bottom: -20,
    marginTop: 0,
    width: 170,
    height: 350,
    borderWidth: 3,
    zIndex: 10,
  },
  phoneSpeaker: {
    width: 48,
    height: 4,
    backgroundColor: "#333",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 6,
    zIndex: 10,
  },
  frameScreenshotMobile: {
    width: "100%",
    height: "100%",
  },
  showcaseDetailsCol: {
    paddingHorizontal: 8,
  },
  moduleTagBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: "rgba(255, 94, 43, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 94, 43, 0.3)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginBottom: 12,
  },
  moduleTagBadgeText: {
    color: "#FF8A3D",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  showcaseHeading: {
    color: "#FFFFFF",
    fontSize: 26,
    fontWeight: "900",
    lineHeight: 34,
    marginBottom: 12,
  },
  showcaseDescription: {
    color: "#94A3B8",
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 20,
  },
  highlightsList: {
    gap: 12,
    marginBottom: 28,
  },
  highlightItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  highlightItemText: {
    color: "#F1F5F9",
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
    lineHeight: 20,
  },
  showcaseCtaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
  },
  showcasePrimaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FF5E2B",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  showcasePrimaryBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  showcaseWhatsappBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(37, 211, 102, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(37, 211, 102, 0.3)",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
  },
  showcaseWhatsappBtnText: {
    color: "#25D366",
    fontSize: 13,
    fontWeight: "700",
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
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: "rgba(8, 9, 12, 0.82)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
  },
  catTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  catBadgeText: {
    color: "#FF8A3D",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 2,
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
    backgroundColor: "#FF5E2B",
    borderColor: "#FF7D52",
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
    color: "#FF8A3D",
    fontSize: 15,
    fontWeight: "900",
  },
  stockBadge: {
    position: "absolute",
    bottom: 10,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#10B981",
  },
  stockText: {
    color: "#E2E8F0",
    fontSize: 10,
    fontWeight: "700",
  },
  prodActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  addCartBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "rgba(255, 94, 43, 0.15)",
    borderWidth: 1,
    borderColor: "#FF5E2B",
    paddingVertical: 9,
    borderRadius: 8,
  },
  addCartBtnText: {
    color: "#FF8A3D",
    fontSize: 12,
    fontWeight: "800",
  },
  buyNowBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "#FF5E2B",
    paddingVertical: 9,
    borderRadius: 8,
  },
  buyNowBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  detailsIconBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 8,
  },
  visitStoreBanner: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    backgroundColor: "rgba(255, 94, 43, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 94, 43, 0.25)",
    borderRadius: 16,
    padding: 24,
    marginTop: 32,
  },
  visitStoreInfo: {
    flex: 1,
    minWidth: 260,
  },
  visitStoreTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 6,
  },
  visitStoreSub: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 20,
  },
  visitStoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FF5E2B",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  visitStoreBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
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
    paddingVertical: 60,
  },
  portalAccessCard: {
    backgroundColor: "#121620",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 94, 43, 0.3)",
    padding: 20,
    maxWidth: "100%",
    shadowColor: "#FF5E2B",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 4,
  },
  portalCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  portalCardTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
  },
  portalCardSubtitle: {
    color: "#94A3B8",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
    maxWidth: 680,
  },
  portalActionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 20,
  },
  portalLoginBtn: {
    flex: 1,
    minWidth: 130,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF5E2B",
    paddingVertical: 14,
    borderRadius: 12,
  },
  portalLoginBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  portalStaffBtn: {
    flex: 1,
    minWidth: 130,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 94, 43, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 94, 43, 0.3)",
    paddingVertical: 14,
    borderRadius: 12,
  },
  portalStaffBtnText: {
    color: "#FF8A3D",
    fontSize: 14,
    fontWeight: "800",
  },
  portalRegisterBtn: {
    flex: 1,
    minWidth: 130,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
    paddingVertical: 14,
    borderRadius: 12,
  },
  portalRegisterBtnText: {
    color: "#34D399",
    fontSize: 14,
    fontWeight: "800",
  },
  portalExtraLinks: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 20,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    paddingTop: 16,
  },
  portalExtraLinkItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  portalExtraLinkText: {
    fontSize: 13,
    fontWeight: "700",
  },

  // ===== FOOTER =====
  footerSection: {
    backgroundColor: "#060709",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    paddingTop: 60,
  },
  footerGridDesktop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 40,
    marginBottom: 40,
  },
  footerColBrand: {
    marginBottom: 32,
  },
  footerDesc: {
    color: "#94A3B8",
    fontSize: 14,
    lineHeight: 22,
    marginTop: 14,
    marginBottom: 20,
    maxWidth: 420,
  },
  footerPlayBadge: {
    width: 140,
    height: 42,
  },
  footerCol: {
    marginBottom: 24,
  },
  footerColTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 16,
  },
  footerLink: {
    color: "#94A3B8",
    fontSize: 14,
    marginBottom: 10,
  },
  footerMutedText: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 6,
  },
  footerBottomBar: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.05)",
    paddingVertical: 24,
    alignItems: "center",
  },
  footerCopyText: {
    color: "#64748B",
    fontSize: 13,
    textAlign: "center",
  },

  // ===== PRODUCT DETAIL MODAL =====
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxHeight: "90%",
    backgroundColor: "#12161E",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
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
    marginRight: 12,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalScrollBody: {
    padding: 24,
  },
  modalContentGrid: {
    gap: 24,
  },
  modalContentGridDesktop: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  modalImgCol: {
    width: "100%",
    alignItems: "center",
  },
  modalLargeImg: {
    width: "100%",
    height: 340,
    borderRadius: 16,
    backgroundColor: "#18202C",
  },
  modalInfoCol: {
    width: "100%",
  },
  modalProdTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 10,
  },
  modalPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  modalOriginalPrice: {
    color: "#64748B",
    fontSize: 16,
    textDecorationLine: "line-through",
  },
  modalSalePrice: {
    color: "#FF8A3D",
    fontSize: 22,
    fontWeight: "900",
  },
  modalCtaRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 24,
  },
  modalBuyBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF5E2B",
    paddingVertical: 12,
    borderRadius: 10,
  },
  modalBuyBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  modalWhatsappBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#15803D",
    paddingVertical: 12,
    borderRadius: 10,
  },
  modalWhatsappBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  modalSection: {
    marginBottom: 18,
  },
  modalSectionTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  modalSectionText: {
    color: "#CBD5E1",
    fontSize: 14,
    lineHeight: 22,
  },
  modalBulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 6,
  },
  modalBulletText: {
    color: "#CBD5E1",
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  modalSpecRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
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
  modalAddCartBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 94, 43, 0.15)",
    borderWidth: 1,
    borderColor: "#FF5E2B",
    paddingVertical: 12,
    borderRadius: 10,
  },
  modalAddCartBtnText: {
    color: "#FF8A3D",
    fontSize: 13,
    fontWeight: "800",
  },

  // ===== FLOATING CART BAR =====
  floatingCartBar: {
    position: "absolute",
    bottom: 20,
    left: 12,
    right: 12,
    maxWidth: 580,
    alignSelf: "center",
    zIndex: 999,
  },
  floatingCartContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FF5E2B",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: "#FF5E2B",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  floatingCartLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  floatingCartBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0, 0, 0, 0.25)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  floatingCartBadgeText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  floatingCartTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  floatingCartSub: {
    color: "#FFE5DC",
    fontSize: 12,
    fontWeight: "700",
  },
  floatingCartRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  floatingCartBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
});
