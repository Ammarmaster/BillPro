import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  SafeAreaView,
  StatusBar,
  Linking,
  Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useCart, ProductItem, parsePriceToNumber } from "@/src/context/CartContext";
import { useResponsive } from "@/src/hooks/useResponsive";
import CartDrawerModal from "@/src/components/CartDrawerModal";

const WHATSAPP_NUMBER = "918152075375";
const WHATSAPP_BASE_URL = `https://api.whatsapp.com/send/?phone=${WHATSAPP_NUMBER}&text=`;

export const PRODUCTS: ProductItem[] = [
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
    inStock: true,
    rating: 4.9,
    reviewsCount: 382,
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
    inStock: true,
    rating: 4.8,
    reviewsCount: 215,
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
    title: "EzBill Bada Heavy-Duty Billing Machine",
    category: "machines",
    image: "2.jpeg",
    originalPrice: "Rs. 5,999",
    salePrice: "Rs. 4,499",
    discount: "25% OFF",
    shortDesc: "Heavy-duty 2-inch thermal printer + full billing software.",
    description:
      "Built for busy counters, grocery stores, and cafes. High-speed thermal mechanism designed for continuous non-stop billing.",
    inStock: true,
    rating: 4.9,
    reviewsCount: 194,
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
    inStock: true,
    rating: 5.0,
    reviewsCount: 341,
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
    inStock: true,
    rating: 4.7,
    reviewsCount: 128,
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
    inStock: true,
    rating: 4.9,
    reviewsCount: 412,
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
    inStock: true,
    rating: 4.9,
    reviewsCount: 89,
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
    inStock: true,
    rating: 4.8,
    reviewsCount: 64,
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
    inStock: true,
    rating: 5.0,
    reviewsCount: 52,
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
    inStock: true,
    rating: 5.0,
    reviewsCount: 78,
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
    inStock: true,
    rating: 4.8,
    reviewsCount: 310,
    specs: [
      { label: "Paper Size", value: "58mm Standard Receipt" },
      { label: "Speed", value: "80 mm/s" },
      { label: "Connectivity", value: "Bluetooth + USB" },
      { label: "Battery", value: "Built-in Rechargeable" },
    ],
  },
  {
    id: "printer-2inch-bada",
    title: "EzBill Bada 2-inch Heavy Duty Counter Printer",
    category: "printers",
    image: "11.jpeg",
    originalPrice: "Rs. 4,999",
    salePrice: "Rs. 2,999",
    discount: "40% OFF",
    shortDesc: "Heavy-duty counter receipt printer with fast thermal head.",
    description:
      "Reliable desktop 2-inch receipt printer for continuous counter billing. Durable print head tested for over 100,000 meters of printing.",
    inStock: true,
    rating: 4.9,
    reviewsCount: 165,
  },
  {
    id: "printer-3inch-bada",
    title: "EzBill Bada 3-Inch Wide (80mm) Thermal Printer",
    category: "printers",
    image: "12.jpeg",
    originalPrice: "Rs. 6,999",
    salePrice: "Rs. 3,999",
    discount: "43% OFF",
    shortDesc: "Wide 80mm bill printer for restaurants and retail.",
    description:
      "Wide 3-inch thermal printer supporting full GST bills, itemized dining orders, and clear UPI QR codes.",
    inStock: true,
    rating: 4.9,
    reviewsCount: 280,
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
    inStock: true,
    rating: 5.0,
    reviewsCount: 95,
    specs: [
      { label: "Paper Width", value: "80mm Standard" },
      { label: "Speed", value: "120 mm/s Blazing Fast" },
      { label: "Cutter", value: "Automatic Paper Cut" },
    ],
  },
  {
    id: "paper-rolls-57mm",
    title: "EzBill 57mm Thermal Paper Rolls (Pack of 10)",
    category: "supplies",
    image: "14.jpeg",
    originalPrice: "Rs. 450",
    salePrice: "Rs. 280",
    discount: "38% OFF",
    shortDesc: "55 GSM high-white thermal paper rolls for mini POS.",
    description:
      "Premium 55 GSM thermal paper rolls. High contrast, sharp text, dark barcodes, and long shelf life.",
    inStock: true,
    rating: 4.8,
    reviewsCount: 490,
  },
  {
    id: "paper-rolls-80mm",
    title: "EzBill 80mm Heavy-Duty Paper Rolls (Pack of 10)",
    category: "supplies",
    image: "15.jpeg",
    originalPrice: "Rs. 850",
    salePrice: "Rs. 490",
    discount: "42% OFF",
    shortDesc: "25-meter 80mm rolls for standard counter receipt printers.",
    description:
      "Heavy-duty 80mm thermal receipt rolls with 25-meter continuous length. Compatible with all 3-inch thermal printers.",
    inStock: true,
    rating: 4.9,
    reviewsCount: 360,
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
    inStock: true,
    rating: 4.8,
    reviewsCount: 175,
  },
  {
    id: "stickers-50x50",
    title: "EzBill Square Product Stickers 50×50 mm (250 Labels)",
    category: "supplies",
    image: "17.jpeg",
    originalPrice: "Rs. 200",
    salePrice: "Rs. 100",
    discount: "50% OFF",
    shortDesc: "Square 2×2 inch labels for packaging & product tags.",
    description:
      "50 × 50 mm (2 × 2 inch) square adhesive labels. 250 labels per roll. Perfect for retail boxes, courier tags, and shipping labels.",
    inStock: true,
    rating: 4.7,
    reviewsCount: 130,
  },
];

export default function Shop() {
  const router = useRouter();
  const { addToCart, cartCount, setIsCartOpen } = useCart();
  const { isDesktop, width } = useResponsive();

  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"featured" | "price_asc" | "price_desc" | "discount">("featured");
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);

  const getImgUri = (imgName: string) => `/assets/images/${imgName}`;

  const openWhatsApp = (msg: string) => {
    const url = `${WHATSAPP_BASE_URL}${encodeURIComponent(msg)}`;
    Linking.openURL(url).catch(() => {});
  };

  // Filter & Sort
  const filteredProducts = useMemo(() => {
    return PRODUCTS.filter((p) => {
      const matchCat = activeCategory === "all" || p.category === activeCategory;
      const matchSearch =
        !searchQuery ||
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.shortDesc.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    }).sort((a, b) => {
      const pA = parsePriceToNumber(a.salePrice);
      const pB = parsePriceToNumber(b.salePrice);
      if (sortBy === "price_asc") return pA - pB;
      if (sortBy === "price_desc") return pB - pA;
      if (sortBy === "discount") {
        const dA = parsePriceToNumber(a.discount);
        const dB = parsePriceToNumber(b.discount);
        return dB - dA;
      }
      return 0;
    });
  }, [activeCategory, searchQuery, sortBy]);

  return (
    <SafeAreaView style={styles.safe} testID="hardware-store-screen">
      <StatusBar barStyle="light-content" backgroundColor="#08090C" />

      {/* Top Navbar */}
      <View style={styles.navbar}>
        <View style={[styles.navContainer, isDesktop && styles.navContainerDesktop]}>
          <TouchableOpacity style={styles.brandRow} onPress={() => router.push("/")} activeOpacity={0.8}>
            <View style={styles.navLogoBox}>
              <Ionicons name="receipt" size={22} color="#FFFFFF" />
            </View>
            <View>
              <Text style={styles.navBrandTitle}>
                EzBill <Text style={styles.navBrandHighlight}>Store</Text>
              </Text>
              <Text style={styles.navBrandSubtitle}>BY PRODEVOPZ · HARDWARE & POS</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.navActionsRow}>
            <TouchableOpacity style={styles.navBackBtn} onPress={() => router.push("/")}>
              <Ionicons name="home-outline" size={16} color="#CBD5E1" />
              <Text style={styles.navBackBtnText}>Home</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.navCartBtn}
              onPress={() => setIsCartOpen(true)}
              testID="shop-cart-header-btn"
            >
              <Ionicons name="cart" size={18} color="#FFFFFF" />
              <Text style={styles.navCartBtnText}>Cart</Text>
              {cartCount > 0 && (
                <View style={styles.navCartBadge}>
                  <Text style={styles.navCartBadgeText}>{cartCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Hero Banner */}
        <View style={styles.heroBanner}>
          <View style={[styles.sectionContainer, isDesktop && styles.heroBannerDesktop]}>
            <View style={{ flex: 1 }}>
              <View style={styles.heroBadge}>
                <Ionicons name="shield-checkmark" size={14} color="#10B981" />
                <Text style={styles.heroBadgeText}>100% GENUINE PRODEVOPZ CERTIFIED HARDWARE</Text>
              </View>
              <Text style={styles.heroTitle}>
                Official <Text style={{ color: "#FF5E2B" }}>EzBill</Text> Hardware Store
              </Text>
              <Text style={styles.heroSub}>
                Pre-configured ESC/POS thermal printers, portable billing terminals, and continuous supplies. Plug & Play with 1-Year on-site warranty.
              </Text>

              {/* Guarantees row */}
              <View style={styles.guaranteesRow}>
                <View style={styles.guaranteePill}>
                  <Ionicons name="flash" size={14} color="#FF8A3D" />
                  <Text style={styles.guaranteeText}>Pan-India Express Dispatch</Text>
                </View>
                <View style={styles.guaranteePill}>
                  <Ionicons name="sync" size={14} color="#10B981" />
                  <Text style={styles.guaranteeText}>7-Day Replacement Guarantee</Text>
                </View>
                <View style={styles.guaranteePill}>
                  <Ionicons name="headset" size={14} color="#635BFF" />
                  <Text style={styles.guaranteeText}>Remote Setup Support Included</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Filter & Search Bar */}
        <View style={styles.filterSection}>
          <View style={styles.sectionContainer}>
            {/* Search + Sort */}
            <View style={[styles.searchSortRow, isDesktop && { flexDirection: "row", alignItems: "center" }]}>
              <View style={styles.searchBox}>
                <Ionicons name="search" size={18} color="#94A3B8" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search machines, printers, rolls, stickers..."
                  placeholderTextColor="#64748B"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {searchQuery ? (
                  <TouchableOpacity onPress={() => setSearchQuery("")}>
                    <Ionicons name="close-circle" size={18} color="#94A3B8" />
                  </TouchableOpacity>
                ) : null}
              </View>

              <View style={styles.sortPillsRow}>
                {[
                  { key: "featured", label: "Featured" },
                  { key: "price_asc", label: "Price: Low to High" },
                  { key: "price_desc", label: "Price: High to Low" },
                  { key: "discount", label: "Top Discount" },
                ].map((s) => (
                  <TouchableOpacity
                    key={s.key}
                    style={[styles.sortPill, sortBy === s.key && styles.sortPillActive]}
                    onPress={() => setSortBy(s.key as any)}
                  >
                    <Text style={[styles.sortPillText, sortBy === s.key && styles.sortPillTextActive]}>
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Category Tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryTabsScroll}>
              {[
                { key: "all", label: "All Items", icon: "grid-outline" },
                { key: "machines", label: "Billing Terminals", icon: "hardware-chip-outline" },
                { key: "printers", label: "Thermal Printers", icon: "print-outline" },
                { key: "software", label: "Software Plans", icon: "laptop-outline" },
                { key: "supplies", label: "Paper & Stickers", icon: "layers-outline" },
              ].map((tab) => (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.catTab, activeCategory === tab.key && styles.catTabActive]}
                  onPress={() => setActiveCategory(tab.key)}
                >
                  <Ionicons
                    name={tab.icon as any}
                    size={16}
                    color={activeCategory === tab.key ? "#FFFFFF" : "#94A3B8"}
                  />
                  <Text style={[styles.catTabText, activeCategory === tab.key && styles.catTabTextActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>

        {/* Product Grid */}
        <View style={styles.gridSection}>
          <View style={styles.sectionContainer}>
            <View style={styles.resultsInfoRow}>
              <Text style={styles.resultsCountText}>
                Showing <Text style={{ color: "#FFFFFF", fontWeight: "800" }}>{filteredProducts.length}</Text> certified items
              </Text>
              <Text style={styles.freeShipTag}>🚚 Free Pan-India Delivery on all orders</Text>
            </View>

            <View style={styles.productsGrid}>
              {filteredProducts.map((prod) => {
                // Responsive card width calculation
                const cardWidth = isDesktop ? "23.5%" : width < 600 ? "100%" : "48%";

                return (
                  <View key={prod.id} style={[styles.productCard, { width: cardWidth }]}>
                    {/* Image with discount badge */}
                    <TouchableOpacity
                      style={styles.prodImgWrapper}
                      onPress={() => setSelectedProduct(prod)}
                      activeOpacity={0.85}
                    >
                      <Image source={{ uri: getImgUri(prod.image) }} style={styles.prodImg} resizeMode="cover" />
                      <View style={styles.discountBadge}>
                        <Text style={styles.discountBadgeText}>{prod.discount}</Text>
                      </View>
                      <View style={styles.stockBadge}>
                        <View style={styles.greenDot} />
                        <Text style={styles.stockText}>In Stock</Text>
                      </View>
                    </TouchableOpacity>

                    {/* Content */}
                    <View style={styles.prodInfo}>
                      {/* Rating row */}
                      <View style={styles.ratingRow}>
                        <View style={styles.starsBox}>
                          <Ionicons name="star" size={13} color="#F59E0B" />
                          <Text style={styles.ratingVal}>{prod.rating || 4.9}</Text>
                        </View>
                        <Text style={styles.reviewsCount}>({prod.reviewsCount || 100}+ reviews)</Text>
                      </View>

                      {/* Title */}
                      <TouchableOpacity onPress={() => setSelectedProduct(prod)}>
                        <Text style={styles.prodTitle} numberOfLines={2}>
                          {prod.title}
                        </Text>
                      </TouchableOpacity>

                      <Text style={styles.prodDesc} numberOfLines={2}>
                        {prod.shortDesc}
                      </Text>

                      {/* Price Row */}
                      <View style={styles.priceRow}>
                        <Text style={styles.prodSalePrice}>{prod.salePrice}</Text>
                        <Text style={styles.prodOriginalPrice}>{prod.originalPrice}</Text>
                      </View>

                      {/* Action buttons */}
                      <View style={styles.actionsRow}>
                        <TouchableOpacity
                          style={styles.addToCartBtn}
                          onPress={() => addToCart(prod, 1)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="cart-outline" size={16} color="#FFFFFF" />
                          <Text style={styles.addToCartBtnText}>Add</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.buyNowBtn}
                          onPress={() => {
                            addToCart(prod, 1);
                            router.push("/checkout" as any);
                          }}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="flash" size={14} color="#FFFFFF" />
                          <Text style={styles.buyNowBtnText}>Buy Now</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.detailsIconBtn}
                          onPress={() => setSelectedProduct(prod)}
                        >
                          <Ionicons name="information-circle-outline" size={18} color="#94A3B8" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        {/* Footer info */}
        <View style={styles.footerSection}>
          <View style={styles.sectionContainer}>
            <View style={styles.supportCard}>
              <View style={styles.supportHeader}>
                <Ionicons name="headset" size={28} color="#FF5E2B" />
                <View>
                  <Text style={styles.supportTitle}>Need Custom Bulk Setup or Hardware Consultation?</Text>
                  <Text style={styles.supportSub}>
                    Our POS hardware engineers will recommend the exact printers and terminals for your counter setup.
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.supportWhatsappBtn}
                onPress={() => openWhatsApp("Hi, I want assistance with choosing the right POS hardware for my business.")}
              >
                <Ionicons name="logo-whatsapp" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.supportWhatsappText}>Chat with Hardware Specialist</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.footerCopyright}>
              © {new Date().getFullYear()} EzBill Solutions by ProDevOpz. All rights reserved. Express courier delivery across India.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Floating Bottom Cart Bar for Quick Checkout */}
      {cartCount > 0 && (
        <View style={styles.floatingCartBar}>
          <View style={styles.floatingCartInfo}>
            <View style={styles.floatingCartCount}>
              <Text style={styles.floatingCartCountText}>{cartCount}</Text>
            </View>
            <Text style={styles.floatingCartText}>
              Items in your cart · Pan-India Free Delivery
            </Text>
          </View>

          <TouchableOpacity style={styles.floatingCheckoutBtn} onPress={() => setIsCartOpen(true)}>
            <Text style={styles.floatingCheckoutText}>View Cart / Checkout</Text>
            <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}

      {/* Product Detail Modal */}
      <Modal
        visible={!!selectedProduct}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedProduct(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, isDesktop && styles.modalCardDesktop]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderTitle} numberOfLines={1}>
                {selectedProduct?.title}
              </Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setSelectedProduct(null)}>
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScrollBody}>
              {selectedProduct && (
                <View style={[styles.modalContentGrid, isDesktop && styles.modalContentGridDesktop]}>
                  <View style={[styles.modalImgCol, isDesktop && { flex: 1 }]}>
                    <Image source={{ uri: getImgUri(selectedProduct.image) }} style={styles.modalLargeImg} resizeMode="cover" />
                  </View>

                  <View style={[styles.modalInfoCol, isDesktop && { flex: 1.2 }]}>
                    <Text style={styles.modalProdTitle}>{selectedProduct.title}</Text>
                    <View style={styles.modalPriceRow}>
                      <Text style={styles.modalOriginalPrice}>{selectedProduct.originalPrice}</Text>
                      <Text style={styles.modalSalePrice}>{selectedProduct.salePrice}</Text>
                      <View style={styles.discountBadge}>
                        <Text style={styles.discountBadgeText}>{selectedProduct.discount}</Text>
                      </View>
                    </View>

                    {/* Add to Cart in modal */}
                    <View style={styles.modalCtaRow}>
                      <TouchableOpacity
                        style={styles.modalAddCartBtn}
                        onPress={() => {
                          addToCart(selectedProduct, 1);
                          setSelectedProduct(null);
                        }}
                      >
                        <Ionicons name="cart" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
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
                    </View>

                    {/* Description */}
                    <View style={styles.modalSection}>
                      <Text style={styles.modalSectionTitle}>Description</Text>
                      <Text style={styles.modalSectionText}>{selectedProduct.description}</Text>
                    </View>

                    {/* Features list */}
                    {selectedProduct.features && (
                      <View style={styles.modalSection}>
                        <Text style={styles.modalSectionTitle}>Features</Text>
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

      {/* Cart Drawer */}
      <CartDrawerModal />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#08090C",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 80,
  },
  navbar: {
    backgroundColor: "#08090C",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
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
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  navLogoBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#FF5E2B",
    justifyContent: "center",
    alignItems: "center",
  },
  navBrandTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#FFFFFF",
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
  navActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  navBackBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  navBackBtnText: {
    color: "#CBD5E1",
    fontSize: 13,
    fontWeight: "700",
  },
  navCartBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FF5E2B",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  navCartBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  navCartBadge: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    marginLeft: 2,
  },
  navCartBadgeText: {
    color: "#FF5E2B",
    fontSize: 11,
    fontWeight: "900",
  },
  sectionContainer: {
    maxWidth: 1280,
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: 16,
  },
  heroBanner: {
    paddingVertical: 32,
    backgroundColor: "rgba(255, 94, 43, 0.05)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 94, 43, 0.15)",
  },
  heroBannerDesktop: {
    flexDirection: "row",
    alignItems: "center",
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: "flex-start",
    marginBottom: 12,
  },
  heroBadgeText: {
    color: "#34D399",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "900",
    lineHeight: 40,
    marginBottom: 10,
  },
  heroSub: {
    color: "#94A3B8",
    fontSize: 15,
    lineHeight: 24,
    maxWidth: 720,
    marginBottom: 18,
  },
  guaranteesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  guaranteePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  guaranteeText: {
    color: "#CBD5E1",
    fontSize: 12,
    fontWeight: "600",
  },
  filterSection: {
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
    backgroundColor: "#0D1117",
  },
  searchSortRow: {
    gap: 12,
    marginBottom: 16,
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 14,
  },
  sortPillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  sortPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  sortPillActive: {
    backgroundColor: "rgba(255, 94, 43, 0.15)",
    borderColor: "#FF5E2B",
  },
  sortPillText: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "700",
  },
  sortPillTextActive: {
    color: "#FF8A3D",
  },
  categoryTabsScroll: {
    gap: 10,
    paddingBottom: 4,
  },
  catTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  catTabActive: {
    backgroundColor: "#FF5E2B",
    borderColor: "#FF7D52",
  },
  catTabText: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "700",
  },
  catTabTextActive: {
    color: "#FFFFFF",
  },
  gridSection: {
    paddingVertical: 28,
  },
  resultsInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    marginBottom: 20,
    gap: 10,
  },
  resultsCountText: {
    color: "#94A3B8",
    fontSize: 14,
  },
  freeShipTag: {
    color: "#10B981",
    fontSize: 12,
    fontWeight: "700",
  },
  productsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 24,
    columnGap: 16,
    justifyContent: "flex-start",
  },
  productCard: {
    backgroundColor: "#12161E",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    overflow: "hidden",
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
  stockBadge: {
    position: "absolute",
    bottom: 10,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
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
  prodInfo: {
    padding: 16,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  starsBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  ratingVal: {
    color: "#F59E0B",
    fontSize: 12,
    fontWeight: "800",
  },
  reviewsCount: {
    color: "#64748B",
    fontSize: 11,
  },
  prodTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 21,
    height: 42,
    marginBottom: 4,
  },
  prodDesc: {
    color: "#94A3B8",
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
    height: 34,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  prodSalePrice: {
    color: "#FF8A3D",
    fontSize: 16,
    fontWeight: "900",
  },
  prodOriginalPrice: {
    color: "#64748B",
    fontSize: 13,
    textDecorationLine: "line-through",
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  addToCartBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.16)",
    paddingVertical: 9,
    borderRadius: 8,
  },
  addToCartBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  buyNowBtn: {
    flex: 1.2,
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
    padding: 8,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: 8,
  },
  footerSection: {
    paddingVertical: 40,
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
  },
  supportCard: {
    backgroundColor: "#10141D",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    gap: 16,
  },
  supportHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  supportTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 4,
  },
  supportSub: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 19,
    maxWidth: 680,
  },
  supportWhatsappBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#15803D",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
  },
  supportWhatsappText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  footerCopyright: {
    color: "#64748B",
    fontSize: 12,
    textAlign: "center",
  },
  floatingCartBar: {
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: "#161B22",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 94, 43, 0.4)",
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 8,
    zIndex: 99,
  },
  floatingCartInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  floatingCartCount: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FF5E2B",
    alignItems: "center",
    justifyContent: "center",
  },
  floatingCartCountText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  floatingCartText: {
    color: "#F1F5F9",
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
  },
  floatingCheckoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FF5E2B",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  floatingCheckoutText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxHeight: "90%",
    backgroundColor: "#10141D",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    overflow: "hidden",
  },
  modalCardDesktop: {
    maxWidth: 960,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
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
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8,
  },
  modalScrollBody: {
    padding: 20,
  },
  modalContentGrid: {
    gap: 20,
  },
  modalContentGridDesktop: {
    flexDirection: "row",
  },
  modalImgCol: {
    alignItems: "center",
    justifyContent: "center",
  },
  modalLargeImg: {
    width: "100%",
    height: 320,
    borderRadius: 14,
    backgroundColor: "#161B22",
  },
  modalInfoCol: {
    gap: 12,
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
  modalSalePrice: {
    color: "#FF8A3D",
    fontSize: 24,
    fontWeight: "900",
  },
  modalOriginalPrice: {
    color: "#64748B",
    fontSize: 16,
    textDecorationLine: "line-through",
  },
  modalCtaRow: {
    flexDirection: "row",
    gap: 12,
    marginVertical: 12,
  },
  modalAddCartBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.16)",
    paddingVertical: 14,
    borderRadius: 12,
  },
  modalAddCartBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  modalBuyBtn: {
    flex: 1.2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF5E2B",
    paddingVertical: 14,
    borderRadius: 12,
  },
  modalBuyBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  modalSection: {
    marginTop: 10,
    gap: 6,
  },
  modalSectionTitle: {
    color: "#CBD5E1",
    fontSize: 14,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  modalSectionText: {
    color: "#94A3B8",
    fontSize: 14,
    lineHeight: 22,
  },
  modalBulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  modalBulletText: {
    color: "#E2E8F0",
    fontSize: 13,
    flex: 1,
    lineHeight: 20,
  },
  modalSpecRow: {
    flexDirection: "row",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
  },
  modalSpecLabel: {
    color: "#94A3B8",
    width: 140,
    fontSize: 13,
    fontWeight: "600",
  },
  modalSpecValue: {
    color: "#FFFFFF",
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
  },
});
