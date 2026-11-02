import React, { useEffect, useState, useRef } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Platform,
  Image,
  Linking,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { useCart } from "@/src/context/CartContext";
import CartDrawerModal from "@/src/components/CartDrawerModal";
import ReceiptProductModal from "@/src/components/ReceiptProductModal";
import {
  Display,
  Mono,
  PaperEdge,
  ReceiptBarcode,
  ReceiptButton,
  ReceiptRow,
  ReceiptRule,
  ReceiptSectionTitle,
  receipt,
} from "@/src/components/ReceiptKit";

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

const HERO_ITEMS = [
  "Table and floor layout",
  "Kitchen tickets (KOT)",
  "Offline billing",
  "GST invoices",
  "Thermal printer setup",
  "UPI QR on bills",
];

const STORE_TABS = [
  { key: "all", label: "All" },
  { key: "machines", label: "Billing machines" },
  { key: "printers", label: "Printers" },
  { key: "software", label: "Software" },
  { key: "supplies", label: "Paper and stickers" },
];

const PARTNER_LOGOS = ["c1.png", "c2.png", "c3.jpg", "c4.png", "c5.png", "c6.png", "c7.png", "c8.png"];

export default function Index() {
  const { user, loading } = useAuth();
  const { addToCart, cartCount, cartTotal, setIsCartOpen } = useCart();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const isTablet = width >= 700;
  const showFullNav = width >= 1120; // Narrower screens cannot fit every link and button in one row
  const isPhone = width < 576;
  const paperPadding = isDesktop ? 48 : isTablet ? 32 : 18;

  // State
  const [activeModuleIndex, setActiveModuleIndex] = useState(0);
  const [deviceView, setDeviceView] = useState<"both" | "desktop" | "mobile">("both");
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [heroToggle, setHeroToggle] = useState<"software" | "hardware">("software");

  const scrollViewRef = useRef<ScrollView>(null);
  const sectionRefs = useRef<Record<string, View | null>>({});

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

  // This page only shows on the website, so positions can come straight from the page at tap time
  const scrollToSection = (key: string) => {
    setMobileMenuOpen(false);
    const scroller = scrollViewRef.current?.getScrollableNode() as unknown as HTMLElement | undefined;
    const section = sectionRefs.current[key] as unknown as HTMLElement | null;
    if (!scroller || !section) return;
    scrollViewRef.current?.scrollTo({
      y: scroller.scrollTop + section.getBoundingClientRect().top - scroller.getBoundingClientRect().top,
      animated: true,
    });
  };

  const openFromMenu = (action: () => void) => {
    setMobileMenuOpen(false);
    action();
  };

  const currentModule = APP_MODULES[activeModuleIndex];

  const filteredProducts =
    activeCategory === "all"
      ? PRODUCTS
      : PRODUCTS.filter((p) => p.category === activeCategory);

  const billDate = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const navLinks = [
    { label: "App tour", onPress: () => scrollToSection("tour") },
    { label: "Features", onPress: () => router.push("/pos-erp") },
    { label: "Store", onPress: () => router.push("/shop" as any) },
    { label: "Categories", onPress: () => scrollToSection("categories") },
    { label: "Pricing", onPress: () => router.push("/pricing") },
    { label: "Contact", onPress: () => openWhatsApp("Hi, I want to talk with your team about EzBill POS.") },
  ];

  const menuItems: { label: string; icon: React.ComponentProps<typeof Ionicons>["name"]; onPress: () => void }[] = [
    { label: "Hardware store", icon: "storefront-outline", onPress: () => openFromMenu(() => router.push("/shop" as any)) },
    { label: "App tour", icon: "phone-portrait-outline", onPress: () => scrollToSection("tour") },
    { label: "Features", icon: "grid-outline", onPress: () => openFromMenu(() => router.push("/pos-erp")) },
    { label: "Categories", icon: "restaurant-outline", onPress: () => scrollToSection("categories") },
    { label: "Pricing (from ₹299/mo)", icon: "pricetag-outline", onPress: () => openFromMenu(() => router.push("/pricing")) },
    { label: "Staff PIN login", icon: "keypad-outline", onPress: () => openFromMenu(() => router.push("/staff-login")) },
    { label: "Create free account", icon: "person-add-outline", onPress: () => openFromMenu(() => router.push("/register")) },
    {
      label: "Chat on WhatsApp",
      icon: "logo-whatsapp",
      onPress: () => openFromMenu(() => openWhatsApp("Hi, I want to book an EzBill POS demo.")),
    },
  ];

  if (loading) {
    return (
      <View style={styles.center} testID="landing-loading">
        <ActivityIndicator size="large" color={receipt.ink} />
        <Mono style={styles.loadingText}>Printing your bill...</Mono>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} testID="landing-screen">
      <StatusBar barStyle="dark-content" backgroundColor={receipt.page} />

      {/* ================= TOP BAR ================= */}
      <View style={styles.navbar}>
        <View style={styles.navContainer}>
          <TouchableOpacity onPress={() => router.push("/")} activeOpacity={0.8}>
            <Mono style={styles.navBrand}>EZBILL_</Mono>
          </TouchableOpacity>

          {showFullNav ? (
            <View style={styles.navLinks}>
              {navLinks.map((link) => (
                <TouchableOpacity key={link.label} onPress={link.onPress} style={styles.navLink}>
                  <Mono style={styles.navLinkText}>{link.label}</Mono>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          <View style={styles.navActions}>
            <TouchableOpacity
              style={styles.navIconBtn}
              onPress={() => setIsCartOpen(true)}
              testID="landing-cart-btn"
              accessibilityLabel="Open cart"
            >
              <Ionicons name="cart-outline" size={20} color={receipt.ink} />
              {cartCount > 0 && (
                <View style={styles.navCartBadge}>
                  <Mono style={styles.navCartBadgeText}>{cartCount}</Mono>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.navOutlineBtn}
              testID="landing-login-btn"
              onPress={() => router.push("/login")}
              activeOpacity={0.8}
            >
              <Mono style={styles.navOutlineBtnText}>{showFullNav ? "Owner login" : "Login"}</Mono>
            </TouchableOpacity>

            {showFullNav ? (
              <>
                <TouchableOpacity
                  style={styles.navOutlineBtn}
                  testID="landing-staff-btn"
                  onPress={() => router.push("/staff-login")}
                  activeOpacity={0.8}
                >
                  <Mono style={styles.navOutlineBtnText}>Staff PIN</Mono>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.navInkBtn}
                  testID="landing-register-btn"
                  onPress={() => router.push("/register")}
                  activeOpacity={0.8}
                >
                  <Mono style={styles.navInkBtnText}>Free trial</Mono>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={styles.navIconBtn}
                onPress={() => setMobileMenuOpen(!mobileMenuOpen)}
                accessibilityLabel={mobileMenuOpen ? "Close menu" : "Open menu"}
              >
                <Ionicons name={mobileMenuOpen ? "close" : "menu"} size={24} color={receipt.ink} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {mobileMenuOpen && !showFullNav && (
          <View style={styles.menu}>
            {menuItems.map((item) => (
              <TouchableOpacity key={item.label} style={styles.menuItem} onPress={item.onPress}>
                <Ionicons name={item.icon} size={18} color={receipt.ink} />
                <Mono style={styles.menuItemText}>{item.label}</Mono>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* ================= THE LONG RECEIPT ================= */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: isPhone ? 10 : 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.paperColumn}>
          <View style={styles.paper}>
            {/* ================= 1. BILL HEADER AND HERO ================= */}
            <View style={[styles.section, { padding: paperPadding }]}>
              <Mono style={[styles.billBrand, isPhone && { fontSize: 24 }]}>EZBILL</Mono>
              <Mono style={styles.billSub}>Restaurant POS, ERP and billing</Mono>
              <Mono style={styles.billSub}>By ProDevOpz</Mono>

              <ReceiptRule style={styles.rule} />
              <ReceiptRow label="Bill no." value="0001" />
              <ReceiptRow label="Date" value={billDate} />
              <ReceiptRow label="Table" value="Yours" />
              <ReceiptRule style={styles.rule} />

              <Display
                accessibilityRole="header"
                style={[styles.heroTitle, isDesktop ? styles.heroTitleDesktop : isPhone ? styles.heroTitlePhone : null]}
              >
                Scroll down. It's all on the bill.
              </Display>
              <Mono style={styles.heroSubtitle}>
                Run your restaurant, cafe or retail counter from one place, with live tables, kitchen tickets,
                thermal printing and UPI QR billing.
              </Mono>

              <View style={[styles.heroGrid, isDesktop && styles.heroGridDesktop]}>
                <View style={isDesktop ? styles.heroColLeft : undefined}>
                  {HERO_ITEMS.map((item) => (
                    <ReceiptRow key={item} label={`1x ${item}`} value="yes" valueColor={receipt.success} />
                  ))}
                  <ReceiptRule style={styles.rule} />
                  <View style={styles.ctaStack}>
                    <ReceiptButton label="Start free trial" icon="arrow-forward" onPress={() => router.push("/register")} />
                    <View style={styles.ctaRow}>
                      <ReceiptButton
                        label="WhatsApp demo"
                        icon="logo-whatsapp"
                        iconColor={receipt.whatsapp}
                        variant="outline"
                        style={styles.ctaHalf}
                        onPress={() =>
                          openWhatsApp(
                            "Hi, I want to book the EzBill POS Billing Machine. Please share complete hardware package details and pricing."
                          )
                        }
                      />
                      <ReceiptButton
                        label="Hardware store"
                        icon="storefront-outline"
                        variant="outline"
                        style={styles.ctaHalf}
                        onPress={() => router.push("/shop" as any)}
                      />
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.playBadgeBtn}
                    onPress={() => Linking.openURL(APK_DOWNLOAD_URL).catch(() => {})}
                  >
                    <Image
                      source={{ uri: getImgUri("google-play-badge.png") }}
                      style={styles.playBadge}
                      resizeMode="contain"
                      accessibilityLabel="Get the EzBill app"
                    />
                  </TouchableOpacity>
                </View>

                <View style={isDesktop ? styles.heroColRight : styles.heroPreviewPhone}>
                  <View style={styles.chipRow}>
                    <TouchableOpacity
                      style={[styles.chip, heroToggle === "software" && styles.chipActive]}
                      onPress={() => setHeroToggle("software")}
                    >
                      <Mono style={[styles.chipText, heroToggle === "software" && styles.chipTextActive]}>App</Mono>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.chip, heroToggle === "hardware" && styles.chipActive]}
                      onPress={() => setHeroToggle("hardware")}
                    >
                      <Mono style={[styles.chipText, heroToggle === "hardware" && styles.chipTextActive]}>Hardware</Mono>
                    </TouchableOpacity>
                  </View>

                  {heroToggle === "software" ? (
                    <View style={styles.previewStage}>
                      <Image
                        source={{ uri: getScreenshotUri("web-pos.png") }}
                        style={styles.previewWide}
                        resizeMode="cover"
                        accessibilityLabel="EzBill billing screen on a computer"
                      />
                      <View style={[styles.previewPhone, isPhone && styles.previewPhoneSmall]}>
                        <Image
                          source={{ uri: getScreenshotUri("mobile-dashboard.png") }}
                          style={styles.previewPhoneImg}
                          resizeMode="cover"
                          accessibilityLabel="EzBill dashboard on a phone"
                        />
                      </View>
                    </View>
                  ) : (
                    <Image
                      source={{ uri: getImgUri("baner_photo_.jpeg") }}
                      style={styles.previewWide}
                      resizeMode="cover"
                      accessibilityLabel="EzBill Bluetooth thermal printer bundle"
                    />
                  )}
                </View>
              </View>
            </View>

            <ReceiptRule />

            {/* ================= 2. NUMBERS ================= */}
            <View style={[styles.section, { paddingHorizontal: paperPadding, paddingVertical: 28 }]}>
              <Mono style={styles.sectionLabel}>Running total</Mono>
              <ReceiptRow label="Active counters" value="3,500+" bold />
              <ReceiptRow label="Offline delay" value="0 ms" bold />
              <ReceiptRow label="Bills processed" value="₹50 Cr+" bold />
            </View>

            <ReceiptRule />

            {/* ================= 3. APP TOUR ================= */}
            <View
              ref={(node) => {
                sectionRefs.current.tour = node;
              }}
              style={[styles.section, { padding: paperPadding }]}
            >
              <ReceiptSectionTitle
                label="01 App tour"
                title="See the real screens."
                subtitle="The actual EzBill interface, on a computer and on a phone."
                compact={isPhone}
              />

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.tabScroll}
                style={styles.tabScrollOuter}
              >
                {APP_MODULES.map((mod, idx) => {
                  const isActive = activeModuleIndex === idx;
                  return (
                    <TouchableOpacity
                      key={mod.id}
                      style={[styles.chip, isActive && styles.chipActive]}
                      onPress={() => setActiveModuleIndex(idx)}
                      activeOpacity={0.8}
                    >
                      <Mono style={[styles.chipText, isActive && styles.chipTextActive]}>{mod.name}</Mono>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.chipRow}>
                {[
                  { key: "both", label: "Computer + phone" },
                  { key: "desktop", label: "Computer" },
                  { key: "mobile", label: "Phone" },
                ].map((option) => (
                  <TouchableOpacity
                    key={option.key}
                    style={[styles.chipSmall, deviceView === option.key && styles.chipActive]}
                    onPress={() => setDeviceView(option.key as "both" | "desktop" | "mobile")}
                  >
                    <Mono style={[styles.chipSmallText, deviceView === option.key && styles.chipTextActive]}>
                      {option.label}
                    </Mono>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={[styles.tourGrid, isDesktop && styles.tourGridDesktop]}>
                <View style={[styles.tourScreens, isDesktop && { flex: 1.35 }]}>
                  {(deviceView === "both" || deviceView === "desktop") && (
                    <Image
                      source={{ uri: getScreenshotUri(currentModule.webScreenshot) }}
                      style={styles.tourWide}
                      resizeMode="cover"
                      accessibilityLabel={`${currentModule.name} on a computer`}
                    />
                  )}
                  {(deviceView === "both" || deviceView === "mobile") && (
                    <View
                      style={[
                        styles.tourPhoneFrame,
                        deviceView === "both" && isTablet && styles.tourPhoneFloating,
                      ]}
                    >
                      <Image
                        source={{ uri: getScreenshotUri(currentModule.mobileScreenshot) }}
                        style={styles.previewPhoneImg}
                        resizeMode="cover"
                        accessibilityLabel={`${currentModule.name} on a phone`}
                      />
                    </View>
                  )}
                </View>

                <View style={isDesktop ? { flex: 1 } : undefined}>
                  <Mono style={styles.tourTagline}>{currentModule.tagline}</Mono>
                  <Display style={styles.tourHeading}>{currentModule.name}</Display>
                  <Mono style={styles.bodyText}>{currentModule.description}</Mono>

                  <View style={styles.tourHighlights}>
                    {currentModule.highlights.map((item, hIdx) => (
                      <View key={hIdx} style={styles.checkRow}>
                        <Mono style={styles.checkMark}>[x]</Mono>
                        <Mono style={styles.checkText}>{item}</Mono>
                      </View>
                    ))}
                  </View>

                  <View style={styles.ctaStack}>
                    <ReceiptButton label="Try this free" icon="arrow-forward" onPress={() => router.push("/register")} />
                    <ReceiptButton
                      label="Ask on WhatsApp"
                      icon="logo-whatsapp"
                      iconColor={receipt.whatsapp}
                      variant="outline"
                      onPress={() =>
                        openWhatsApp(`Hi, I saw the ${currentModule.name} on EzBill. Can you give me a live demo?`)
                      }
                    />
                  </View>
                </View>
              </View>
            </View>

            <ReceiptRule />

            {/* ================= 4. BUSINESS TYPES ================= */}
            <View
              ref={(node) => {
                sectionRefs.current.categories = node;
              }}
              style={[styles.section, { padding: paperPadding }]}
            >
              <ReceiptSectionTitle
                label="02 Made for"
                title="Your kind of business."
                subtitle="From small cafes to multi-floor restaurants and supermarkets."
                compact={isPhone}
              />
              <View style={styles.wrapGrid}>
                {CATEGORIES_DATA.map((cat) => (
                  <View key={cat.name} style={[styles.catCard, { width: isDesktop ? "23.5%" : "48%" }]}>
                    <Image
                      source={{ uri: getImgUri(cat.img) }}
                      style={styles.catImage}
                      resizeMode="cover"
                      accessibilityLabel={cat.name}
                    />
                    <Mono style={styles.catTitle}>{cat.name}</Mono>
                    <Mono style={styles.catBadge}>{cat.badge}</Mono>
                  </View>
                ))}
              </View>
            </View>

            <ReceiptRule />

            {/* ================= 5. HARDWARE STORE ================= */}
            <View style={[styles.section, { padding: paperPadding }]}>
              <ReceiptSectionTitle
                label="03 Add to bill"
                title="Machines, printers and paper."
                subtitle="Set up with EzBill and ready to use, with a 1-year replacement warranty."
                compact={isPhone}
              />

              <View style={[styles.chipRow, styles.storeTabs]}>
                {STORE_TABS.map((tab) => (
                  <TouchableOpacity
                    key={tab.key}
                    style={[styles.chip, activeCategory === tab.key && styles.chipActive]}
                    onPress={() => setActiveCategory(tab.key)}
                  >
                    <Mono style={[styles.chipText, activeCategory === tab.key && styles.chipTextActive]}>{tab.label}</Mono>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.wrapGrid}>
                {filteredProducts.map((prod) => (
                  <View
                    key={prod.id}
                    style={[
                      styles.productCard,
                      isPhone ? styles.productCardPhone : { width: isDesktop ? "31.8%" : "48%" },
                    ]}
                  >
                    <TouchableOpacity
                      style={isPhone ? styles.productImgWrapPhone : styles.productImgWrap}
                      onPress={() => setSelectedProduct(prod)}
                      activeOpacity={0.85}
                    >
                      <Image
                        source={{ uri: getImgUri(prod.image) }}
                        style={styles.productImg}
                        resizeMode="cover"
                        accessibilityLabel={prod.title}
                      />
                      <View style={styles.stamp}>
                        <Mono style={styles.stampText}>{prod.discount}</Mono>
                      </View>
                    </TouchableOpacity>

                    <View style={styles.productInfo}>
                      <TouchableOpacity onPress={() => setSelectedProduct(prod)} activeOpacity={0.8}>
                        <Mono style={styles.productTitle} numberOfLines={2}>
                          {prod.title}
                        </Mono>
                      </TouchableOpacity>

                      <View style={styles.priceRow}>
                        <Mono style={styles.salePrice}>{prod.salePrice}</Mono>
                        <Mono style={styles.originalPrice}>{prod.originalPrice}</Mono>
                      </View>

                      <View style={styles.productActions}>
                        <TouchableOpacity
                          style={styles.productBtn}
                          onPress={() => addToCart(prod, 1)}
                          activeOpacity={0.8}
                        >
                          <Mono style={styles.productBtnText}>Add</Mono>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.productBtn, styles.productBtnInk]}
                          onPress={() => {
                            addToCart(prod, 1);
                            router.push("/checkout" as any);
                          }}
                          activeOpacity={0.8}
                        >
                          <Mono style={[styles.productBtnText, { color: receipt.paper }]}>Buy</Mono>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.productInfoBtn}
                          onPress={() => setSelectedProduct(prod)}
                          activeOpacity={0.8}
                          accessibilityLabel={`Details for ${prod.title}`}
                        >
                          <Ionicons name="information-circle-outline" size={18} color={receipt.ink} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}
              </View>

              <ReceiptButton
                label="Open the hardware store"
                icon="storefront-outline"
                variant="outline"
                style={styles.storeBtn}
                onPress={() => router.push("/shop" as any)}
              />
            </View>

            <ReceiptRule />

            {/* ================= 6. REVIEWS ================= */}
            <View style={[styles.section, { padding: paperPadding }]}>
              <ReceiptSectionTitle label="04 Customer copy" title="What owners say." compact={isPhone} />
              <View style={styles.wrapGrid}>
                {TESTIMONIALS.map((t) => (
                  <View key={t.name} style={[styles.reviewCard, { width: isTablet ? "48.5%" : "100%" }]}>
                    <Mono style={styles.reviewStars} accessibilityLabel="5 out of 5 stars">*****</Mono>
                    <Mono style={styles.bodyText}>"{t.quote}"</Mono>
                    <ReceiptRule style={styles.reviewRule} />
                    <Mono style={styles.reviewName}>{t.name}</Mono>
                    <Mono style={styles.reviewBiz}>{t.biz}</Mono>
                  </View>
                ))}
              </View>
            </View>

            <ReceiptRule />

            {/* ================= 7. COMPATIBLE HARDWARE ================= */}
            <View style={[styles.section, { padding: paperPadding }]}>
              <ReceiptSectionTitle label="05 Works with" title="The hardware you already use." compact={isPhone} />
              <View style={styles.logoRow}>
                {PARTNER_LOGOS.map((logo) => (
                  <View key={logo} style={[styles.logoCard, { width: isTablet ? "23.5%" : "48%" }]}>
                    <Image
                      source={{ uri: getImgUri(logo) }}
                      style={styles.logoImg}
                      resizeMode="contain"
                      accessibilityLabel="Compatible hardware brand"
                    />
                  </View>
                ))}
              </View>
            </View>

            <ReceiptRule />

            {/* ================= 8. ACCOUNT ACCESS ================= */}
            <View style={[styles.section, { padding: paperPadding }]}>
              <ReceiptSectionTitle
                label="06 Regulars"
                title="Already a customer?"
                subtitle="Open your register, staff PIN pad or kitchen screen."
                compact={isPhone}
              />
              <View style={[styles.accessGrid, isTablet && styles.accessGridWide]}>
                <ReceiptButton
                  label="Owner login"
                  icon="business-outline"
                  variant="outline"
                  style={isTablet ? styles.accessBtn : undefined}
                  onPress={() => router.push("/login")}
                />
                <ReceiptButton
                  label="Staff PIN login"
                  icon="keypad-outline"
                  variant="outline"
                  style={isTablet ? styles.accessBtn : undefined}
                  onPress={() => router.push("/staff-login")}
                />
                <ReceiptButton
                  label="All features"
                  icon="grid-outline"
                  variant="outline"
                  style={isTablet ? styles.accessBtn : undefined}
                  onPress={() => router.push("/pos-erp")}
                />
              </View>
            </View>

            <ReceiptRule />

            {/* ================= 9. TOTAL ================= */}
            <View style={[styles.section, { padding: paperPadding }]}>
              <ReceiptRow label="Software" value="from ₹299/mo" />
              <ReceiptRow label="Setup fee" value="₹0" />
              <ReceiptRow label="Commission on orders" value="₹0" />
              <ReceiptRule style={styles.rule} />
              <View style={styles.totalRow}>
                <Display style={[styles.totalLabel, isPhone && styles.totalLabelPhone]}>Due today</Display>
                <Display style={[styles.totalLabel, isPhone && styles.totalLabelPhone]}>Free trial</Display>
              </View>
              <ReceiptButton
                label="Start free trial"
                icon="arrow-forward"
                style={styles.totalBtn}
                onPress={() => router.push("/register")}
              />
              <TouchableOpacity onPress={() => router.push("/pricing")} style={styles.textLink}>
                <Mono style={styles.textLinkText}>See all pricing plans</Mono>
              </TouchableOpacity>
            </View>

            <ReceiptRule />

            {/* ================= 10. FOOTER ================= */}
            <View style={[styles.section, { padding: paperPadding }]}>
              <View style={[styles.footerGrid, isTablet && styles.footerGridWide]}>
                <View style={isTablet ? { flex: 1 } : undefined}>
                  <Mono style={styles.footerTitle}>Solutions</Mono>
                  <TouchableOpacity onPress={() => router.push("/pos-erp")}>
                    <Mono style={styles.footerLink}>Restaurant POS and ERP</Mono>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => router.push("/pos-erp")}>
                    <Mono style={styles.footerLink}>Table management</Mono>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => router.push("/pricing")}>
                    <Mono style={styles.footerLink}>Pricing plans</Mono>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => router.push("/login")}>
                    <Mono style={styles.footerLink}>Owner portal</Mono>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => router.push("/staff-login")}>
                    <Mono style={styles.footerLink}>Staff PIN terminal</Mono>
                  </TouchableOpacity>
                </View>
                <View style={isTablet ? { flex: 1 } : undefined}>
                  <Mono style={styles.footerTitle}>Support</Mono>
                  <TouchableOpacity onPress={() => openWhatsApp("Hi, I need assistance with EzBill Billing Software.")}>
                    <Mono style={styles.footerLink}>WhatsApp: +91 81520 75375</Mono>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => Linking.openURL("mailto:contactprodevopz@gmail.com")}>
                    <Mono style={styles.footerLink}>contactprodevopz@gmail.com</Mono>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => openWhatsApp("Hi, I want to book a billing machine demo.")}>
                    <Mono style={styles.footerLink}>Book a billing machine</Mono>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => router.push("/register")}>
                    <Mono style={styles.footerLink}>Create free account</Mono>
                  </TouchableOpacity>
                  <Mono style={styles.footerMuted}>All-India support, Mon - Sun</Mono>
                </View>
              </View>

              <ReceiptRule style={styles.rule} />
              <ReceiptBarcode />
              <Mono style={styles.thankYou}>Thank you, visit again</Mono>
              <Mono style={styles.copyright}>
                © {new Date().getFullYear()} EzBill Solutions. All rights reserved. Made with pride for Indian
                restaurants and retailers.
              </Mono>
            </View>
          </View>
          <PaperEdge />
        </View>
      </ScrollView>

      {/* ================= PRODUCT DETAIL MODAL ================= */}
      <ReceiptProductModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={(product) => {
          addToCart(product, 1);
          setSelectedProduct(null);
          setIsCartOpen(true);
        }}
        onBuyNow={(product) => {
          addToCart(product, 1);
          setSelectedProduct(null);
          router.push("/checkout" as any);
        }}
        onEnquire={(product) =>
          openWhatsApp(`Hi, I want to order ${product.title}. Please share specifications and delivery details.`)
        }
      />

      {/* ================= FLOATING CART BAR ================= */}
      {cartCount > 0 && (
        <View style={styles.floatingCart}>
          <TouchableOpacity
            style={styles.floatingCartInner}
            onPress={() => setIsCartOpen(true)}
            activeOpacity={0.9}
          >
            <Mono style={styles.floatingCartText}>
              {cartCount} {cartCount === 1 ? "item" : "items"} · ₹{cartTotal.toLocaleString("en-IN")}
            </Mono>
            <View style={styles.floatingCartAction}>
              <Mono style={styles.floatingCartText}>View cart</Mono>
              <Ionicons name="arrow-forward" size={15} color={receipt.paper} />
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
    backgroundColor: receipt.page,
    width: "100%",
    overflow: "hidden",
  },
  center: {
    flex: 1,
    backgroundColor: receipt.page,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    color: receipt.pageInk,
  },
  scrollView: {
    flex: 1,
    width: "100%",
    backgroundColor: receipt.page,
  },
  scrollContent: {
    flexGrow: 1,
    width: "100%",
    alignItems: "center",
    paddingBottom: 96,
  },

  // ===== TOP BAR =====
  navbar: {
    backgroundColor: receipt.page,
    borderBottomWidth: 2,
    borderBottomColor: receipt.ink,
    zIndex: 100,
    width: "100%",
  },
  navContainer: {
    width: "100%",
    maxWidth: 1440,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  navBrand: {
    fontSize: 18,
    fontWeight: "700",
  },
  navLinks: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  navLink: {
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  navLinkText: {
    fontSize: 13,
  },
  navActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  navIconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  navCartBadge: {
    position: "absolute",
    top: 2,
    right: 0,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: receipt.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  navCartBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: receipt.paper,
  },
  navOutlineBtn: {
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: receipt.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  navOutlineBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },
  navInkBtn: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 6,
    backgroundColor: receipt.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  navInkBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: receipt.paper,
  },
  menu: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderTopWidth: 2,
    borderTopColor: receipt.ink,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 46,
  },
  menuItemText: {
    fontSize: 14,
    flexShrink: 1,
  },

  // ===== PAPER =====
  paperColumn: {
    width: "100%",
    maxWidth: 1000,
    marginTop: 20,
  },
  paper: {
    width: "100%",
    backgroundColor: receipt.paper,
  },
  section: {
    width: "100%",
  },
  rule: {
    marginVertical: 14,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: receipt.accent,
    marginBottom: 8,
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 22,
    color: receipt.ink,
  },

  // ===== HERO =====
  billBrand: {
    fontSize: 30,
    fontWeight: "700",
    textAlign: "center",
  },
  billSub: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    color: receipt.muted,
  },
  heroTitle: {
    fontSize: 54,
    lineHeight: 56,
    letterSpacing: -1.4,
    marginTop: 12,
  },
  heroTitleDesktop: {
    fontSize: 76,
    lineHeight: 76,
    letterSpacing: -2.2,
  },
  heroTitlePhone: {
    fontSize: 40,
    lineHeight: 42,
    letterSpacing: -1,
  },
  heroSubtitle: {
    fontSize: 15,
    lineHeight: 24,
    color: receipt.muted,
    marginTop: 14,
    maxWidth: 680,
  },
  heroGrid: {
    marginTop: 22,
    gap: 24,
  },
  heroGridDesktop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 36,
  },
  heroColLeft: {
    flex: 1,
    minWidth: 0,
  },
  heroColRight: {
    flex: 1.15,
    minWidth: 0,
  },
  heroPreviewPhone: {
    width: "100%",
  },
  ctaStack: {
    gap: 10,
    marginTop: 4,
  },
  ctaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  ctaHalf: {
    flexGrow: 1,
    flexBasis: 170,
  },
  playBadgeBtn: {
    alignSelf: "flex-start",
    marginTop: 14,
  },
  playBadge: {
    width: 150,
    height: 46,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: receipt.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: {
    backgroundColor: receipt.ink,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "700",
  },
  chipTextActive: {
    color: receipt.paper,
  },
  chipSmall: {
    minHeight: 34,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: receipt.rule,
    alignItems: "center",
    justifyContent: "center",
  },
  chipSmallText: {
    fontSize: 12,
  },
  previewStage: {
    width: "100%",
    position: "relative",
  },
  previewWide: {
    width: "100%",
    aspectRatio: 16 / 10,
    borderWidth: 2,
    borderColor: receipt.ink,
    backgroundColor: receipt.tint,
  },
  previewPhone: {
    position: "absolute",
    right: -6,
    bottom: -14,
    width: 104,
    aspectRatio: 9 / 19,
    borderWidth: 3,
    borderColor: receipt.ink,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: receipt.tint,
  },
  previewPhoneSmall: {
    width: 78,
    right: -4,
  },
  previewPhoneImg: {
    width: "100%",
    height: "100%",
  },

  // ===== APP TOUR =====
  tabScrollOuter: {
    marginTop: 18,
    marginBottom: 10,
    flexGrow: 0,
  },
  tabScroll: {
    gap: 8,
  },
  tourGrid: {
    marginTop: 8,
    gap: 24,
  },
  tourGridDesktop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 32,
  },
  tourScreens: {
    gap: 14,
    position: "relative",
    minWidth: 0,
  },
  tourWide: {
    width: "100%",
    aspectRatio: 16 / 10,
    borderWidth: 2,
    borderColor: receipt.ink,
    backgroundColor: receipt.tint,
  },
  tourPhoneFrame: {
    alignSelf: "center",
    width: 200,
    aspectRatio: 9 / 19,
    borderWidth: 3,
    borderColor: receipt.ink,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: receipt.tint,
  },
  tourPhoneFloating: {
    position: "absolute",
    right: -8,
    bottom: -18,
    width: 118,
  },
  tourTagline: {
    fontSize: 13,
    fontWeight: "700",
    color: receipt.accent,
  },
  tourHeading: {
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.5,
    marginVertical: 8,
  },
  tourHighlights: {
    marginVertical: 14,
    gap: 6,
  },
  checkRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  checkMark: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "700",
    color: receipt.success,
  },
  checkText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
  },

  // ===== GRIDS =====
  wrapGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 18,
    marginTop: 20,
  },
  catCard: {
    gap: 4,
  },
  catImage: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderWidth: 2,
    borderColor: receipt.ink,
    backgroundColor: receipt.tint,
    marginBottom: 4,
  },
  catTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  catBadge: {
    fontSize: 12,
    lineHeight: 17,
    color: receipt.muted,
  },

  // ===== STORE =====
  storeTabs: {
    marginTop: 18,
    marginBottom: 0,
  },
  productCard: {
    borderWidth: 2,
    borderColor: receipt.ink,
    backgroundColor: receipt.paper,
  },
  productCardPhone: {
    width: "100%",
    flexDirection: "row",
  },
  productImgWrap: {
    width: "100%",
    aspectRatio: 4 / 3,
    position: "relative",
    borderBottomWidth: 2,
    borderBottomColor: receipt.ink,
  },
  productImgWrapPhone: {
    width: 116,
    position: "relative",
    borderRightWidth: 2,
    borderRightColor: receipt.ink,
  },
  productImg: {
    width: "100%",
    height: "100%",
    backgroundColor: receipt.tint,
  },
  stamp: {
    position: "absolute",
    top: 8,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 2,
    borderColor: receipt.accent,
    borderRadius: 4,
    backgroundColor: receipt.paper,
    transform: [{ rotate: "-5deg" }],
  },
  stampText: {
    fontSize: 11,
    fontWeight: "700",
    color: receipt.accent,
  },
  productInfo: {
    flex: 1,
    minWidth: 0,
    padding: 12,
    gap: 8,
  },
  productTitle: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
    minHeight: 38,
  },
  priceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: 8,
  },
  salePrice: {
    fontSize: 16,
    fontWeight: "700",
  },
  originalPrice: {
    fontSize: 12,
    color: receipt.muted,
    textDecorationLine: "line-through",
  },
  productActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  productBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: receipt.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  productBtnInk: {
    backgroundColor: receipt.ink,
  },
  productBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },
  productInfoBtn: {
    width: 36,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  storeBtn: {
    marginTop: 20,
  },

  // ===== REVIEWS AND LOGOS =====
  reviewCard: {
    gap: 8,
  },
  reviewStars: {
    fontSize: 15,
    fontWeight: "700",
    color: receipt.accent,
    letterSpacing: 2,
  },
  reviewRule: {
    marginVertical: 4,
  },
  reviewName: {
    fontSize: 13,
    fontWeight: "700",
  },
  reviewBiz: {
    fontSize: 12,
    lineHeight: 17,
    color: receipt.muted,
  },
  logoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
    marginTop: 20,
  },
  logoCard: {
    height: 70,
    padding: 10,
    borderWidth: 1,
    borderColor: receipt.rule,
    alignItems: "center",
    justifyContent: "center",
  },
  logoImg: {
    width: "100%",
    height: "100%",
  },

  // ===== ACCESS, TOTAL AND FOOTER =====
  accessGrid: {
    marginTop: 18,
    gap: 10,
  },
  accessGridWide: {
    flexDirection: "row",
  },
  accessBtn: {
    flex: 1,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 12,
  },
  totalLabel: {
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -0.8,
  },
  totalLabelPhone: {
    fontSize: 25,
    lineHeight: 30,
    letterSpacing: -0.4,
  },
  totalBtn: {
    marginTop: 16,
  },
  textLink: {
    alignSelf: "center",
    minHeight: 44,
    justifyContent: "center",
    marginTop: 4,
  },
  textLinkText: {
    fontSize: 13,
    textDecorationLine: "underline",
  },
  footerGrid: {
    gap: 22,
  },
  footerGridWide: {
    flexDirection: "row",
  },
  footerTitle: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
  },
  footerLink: {
    fontSize: 13,
    lineHeight: 28,
  },
  footerMuted: {
    fontSize: 12,
    lineHeight: 26,
    color: receipt.muted,
  },
  thankYou: {
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 12,
  },
  copyright: {
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
    color: receipt.muted,
    marginTop: 6,
  },

  // ===== FLOATING CART =====
  floatingCart: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 14,
    alignItems: "center",
    zIndex: 90,
  },
  floatingCartInner: {
    width: "100%",
    maxWidth: 560,
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: receipt.ink,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  floatingCartText: {
    fontSize: 13,
    fontWeight: "700",
    color: receipt.paper,
  },
  floatingCartAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
});
