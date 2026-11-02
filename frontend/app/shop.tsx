import React, { useState, useMemo } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  SafeAreaView,
  StatusBar,
  Linking,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useCart, ProductItem, parsePriceToNumber } from "@/src/context/CartContext";
import { useResponsive } from "@/src/hooks/useResponsive";
import CartDrawerModal from "@/src/components/CartDrawerModal";
import ReceiptProductModal from "@/src/components/ReceiptProductModal";
import {
  Display,
  Mono,
  PaperEdge,
  ReceiptBarcode,
  ReceiptButton,
  ReceiptRule,
  ReceiptSectionTitle,
  ReceiptTopBar,
  receipt,
  receiptFonts,
} from "@/src/components/ReceiptKit";

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

  const isPhone = width < 600;

  return (
    <SafeAreaView style={styles.safe} testID="hardware-store-screen">
      <StatusBar barStyle="dark-content" backgroundColor={receipt.page} />

      <ReceiptTopBar
        label="Hardware store"
        right={
          <View style={styles.navActions}>
            <ReceiptButton label="Home" variant="outline" style={styles.smallBtn} onPress={() => router.push("/")} />
            <TouchableOpacity
              style={styles.navCart}
              onPress={() => setIsCartOpen(true)}
              testID="shop-cart-header-btn"
              accessibilityLabel="Open cart"
            >
              <Ionicons name="cart-outline" size={21} color={receipt.ink} />
              {cartCount > 0 && (
                <View style={styles.navCartBadge}>
                  <Mono style={styles.navCartBadgeText}>{cartCount}</Mono>
                </View>
              )}
            </TouchableOpacity>
          </View>
        }
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.column}>
          <View style={styles.hero}>
            <Display accessibilityRole="header" style={[styles.heroTitle, isPhone && styles.heroTitlePhone]}>
              Everything for your counter.
            </Display>
            <Mono style={styles.heroSub}>
              Thermal printers, billing machines and paper rolls, set up to work with EzBill, with a 1-year on-site warranty.
            </Mono>
            <View style={styles.pills}>
              {["Pan-India express dispatch", "7-day replacement guarantee", "Remote setup support"].map((item) => (
                <View key={item} style={styles.pill}>
                  <Mono style={styles.pillText}>{item}</Mono>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.paper}>
            <View style={styles.section}>
              <View style={styles.searchBox}>
                <Ionicons name="search" size={18} color={receipt.muted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search machines, printers, rolls..."
                  placeholderTextColor={receipt.muted}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {searchQuery ? (
                  <TouchableOpacity style={styles.searchClear} onPress={() => setSearchQuery("")} accessibilityLabel="Clear search">
                    <Ionicons name="close-circle" size={18} color={receipt.muted} />
                  </TouchableOpacity>
                ) : null}
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipScroll}>
                {[
                  { key: "all", label: "All items" },
                  { key: "machines", label: "Billing machines" },
                  { key: "printers", label: "Printers" },
                  { key: "software", label: "Software" },
                  { key: "supplies", label: "Paper and stickers" },
                ].map((tab) => (
                  <TouchableOpacity
                    key={tab.key}
                    style={[styles.chip, activeCategory === tab.key && styles.chipActive]}
                    onPress={() => setActiveCategory(tab.key)}
                  >
                    <Mono style={[styles.chipText, activeCategory === tab.key && styles.chipTextActive]}>{tab.label}</Mono>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {[
                  { key: "featured", label: "Featured" },
                  { key: "price_asc", label: "Price: low to high" },
                  { key: "price_desc", label: "Price: high to low" },
                  { key: "discount", label: "Top discount" },
                ].map((s) => (
                  <TouchableOpacity
                    key={s.key}
                    style={[styles.chipSmall, sortBy === s.key && styles.chipActive]}
                    onPress={() => setSortBy(s.key as any)}
                  >
                    <Mono style={[styles.chipSmallText, sortBy === s.key && styles.chipTextActive]}>{s.label}</Mono>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <ReceiptRule />

            <View style={styles.section}>
              <View style={styles.resultsRow}>
                <Mono style={styles.resultsText}>{filteredProducts.length} items</Mono>
                <Mono style={styles.resultsText}>Free Pan-India delivery</Mono>
              </View>

              <View style={styles.grid}>
                {filteredProducts.map((prod) => (
                  <View
                    key={prod.id}
                    style={[styles.card, isPhone ? styles.cardPhone : { width: isDesktop ? "23.5%" : "48.5%" }]}
                  >
                    <TouchableOpacity
                      style={isPhone ? styles.imgWrapPhone : styles.imgWrap}
                      onPress={() => setSelectedProduct(prod)}
                      activeOpacity={0.85}
                    >
                      <Image
                        source={{ uri: getImgUri(prod.image) }}
                        style={styles.img}
                        resizeMode="cover"
                        accessibilityLabel={prod.title}
                      />
                      <View style={styles.stamp}>
                        <Mono style={styles.stampText}>{prod.discount}</Mono>
                      </View>
                    </TouchableOpacity>

                    <View style={styles.info}>
                      <Mono style={styles.rating}>
                        * {prod.rating || 4.9} ({prod.reviewsCount || 100}+ reviews)
                      </Mono>
                      <TouchableOpacity onPress={() => setSelectedProduct(prod)}>
                        <Mono style={styles.title} numberOfLines={2}>
                          {prod.title}
                        </Mono>
                      </TouchableOpacity>
                      {!isPhone && (
                        <Mono style={styles.desc} numberOfLines={2}>
                          {prod.shortDesc}
                        </Mono>
                      )}
                      <View style={styles.priceRow}>
                        <Mono style={styles.salePrice}>{prod.salePrice}</Mono>
                        <Mono style={styles.originalPrice}>{prod.originalPrice}</Mono>
                      </View>
                      <View style={styles.actions}>
                        <TouchableOpacity style={styles.actionBtn} onPress={() => addToCart(prod, 1)} activeOpacity={0.8}>
                          <Mono style={styles.actionText}>Add</Mono>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.actionBtnInk]}
                          onPress={() => {
                            addToCart(prod, 1);
                            router.push("/checkout" as any);
                          }}
                          activeOpacity={0.8}
                        >
                          <Mono style={[styles.actionText, { color: receipt.paper }]}>Buy</Mono>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.infoBtn}
                          onPress={() => setSelectedProduct(prod)}
                          accessibilityLabel={`Details for ${prod.title}`}
                        >
                          <Ionicons name="information-circle-outline" size={18} color={receipt.ink} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </View>

            <ReceiptRule />

            <View style={styles.section}>
              <ReceiptSectionTitle
                label="Need help?"
                title="Not sure what to buy?"
                subtitle="Our hardware team will recommend the right printers and machines for your counter."
                compact={isPhone}
              />
              <ReceiptButton
                label="Chat on WhatsApp"
                icon="logo-whatsapp"
                style={styles.supportBtn}
                onPress={() => openWhatsApp("Hi, I want assistance with choosing the right POS hardware for my business.")}
              />
              <ReceiptRule style={styles.rule} />
              <ReceiptBarcode />
              <Mono style={styles.copyright}>
                © {new Date().getFullYear()} EzBill Solutions by ProDevOpz. All rights reserved. Express courier delivery across India.
              </Mono>
            </View>
          </View>
          <PaperEdge />
        </View>
      </ScrollView>

      {cartCount > 0 && (
        <View style={styles.floatingCart}>
          <TouchableOpacity style={styles.floatingCartInner} onPress={() => setIsCartOpen(true)} activeOpacity={0.9}>
            <Mono style={styles.floatingCartText}>
              {cartCount} {cartCount === 1 ? "item" : "items"} in your cart
            </Mono>
            <View style={styles.floatingCartAction}>
              <Mono style={styles.floatingCartText}>View cart</Mono>
              <Ionicons name="arrow-forward" size={15} color={receipt.paper} />
            </View>
          </TouchableOpacity>
        </View>
      )}

      <ReceiptProductModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={(product) => {
          addToCart(product, 1);
          setSelectedProduct(null);
        }}
        onBuyNow={(product) => {
          addToCart(product, 1);
          setSelectedProduct(null);
          router.push("/checkout" as any);
        }}
      />

      <CartDrawerModal />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: receipt.page,
  },
  navActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  smallBtn: {
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  navCart: {
    width: 42,
    height: 42,
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
  scroll: {
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 96,
  },
  column: {
    width: "100%",
    maxWidth: 1240,
  },
  hero: {
    paddingTop: 30,
    paddingBottom: 24,
    gap: 12,
  },
  heroTitle: {
    fontSize: 64,
    lineHeight: 64,
    letterSpacing: -1.8,
    maxWidth: 900,
  },
  heroTitlePhone: {
    fontSize: 40,
    lineHeight: 42,
    letterSpacing: -1,
  },
  heroSub: {
    fontSize: 14,
    lineHeight: 22,
    color: receipt.pageInk,
    maxWidth: 660,
  },
  pills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 2,
    borderColor: receipt.ink,
    borderRadius: 6,
  },
  pillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  paper: {
    width: "100%",
    backgroundColor: receipt.paper,
  },
  section: {
    padding: 18,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 50,
    paddingLeft: 12,
    borderWidth: 2,
    borderColor: receipt.ink,
    borderRadius: 6,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    height: 46,
    paddingHorizontal: 10,
    fontFamily: receiptFonts.mono,
    fontSize: 14,
    color: receipt.ink,
  },
  searchClear: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  chipScroll: {
    marginVertical: 12,
    flexGrow: 0,
  },
  chips: {
    gap: 8,
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
  resultsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 14,
  },
  resultsText: {
    fontSize: 12,
    color: receipt.muted,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 16,
  },
  card: {
    borderWidth: 2,
    borderColor: receipt.ink,
  },
  cardPhone: {
    width: "100%",
    flexDirection: "row",
  },
  imgWrap: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderBottomWidth: 2,
    borderBottomColor: receipt.ink,
  },
  imgWrapPhone: {
    width: 116,
    borderRightWidth: 2,
    borderRightColor: receipt.ink,
  },
  img: {
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
  info: {
    flex: 1,
    minWidth: 0,
    padding: 12,
    gap: 6,
  },
  rating: {
    fontSize: 11,
    color: receipt.muted,
  },
  title: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
    minHeight: 38,
  },
  desc: {
    fontSize: 12,
    lineHeight: 17,
    color: receipt.muted,
    minHeight: 34,
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
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  actionBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: receipt.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnInk: {
    backgroundColor: receipt.ink,
  },
  actionText: {
    fontSize: 13,
    fontWeight: "700",
  },
  infoBtn: {
    width: 36,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  supportBtn: {
    marginTop: 14,
  },
  rule: {
    marginVertical: 18,
  },
  copyright: {
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
    color: receipt.muted,
    marginTop: 10,
  },
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
