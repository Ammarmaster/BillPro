import React, { useState } from "react";
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
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useCart } from "@/src/context/CartContext";
import { useResponsive } from "@/src/hooks/useResponsive";

const WHATSAPP_NUMBER = "918152075375";
const WHATSAPP_BASE_URL = `https://api.whatsapp.com/send/?phone=${WHATSAPP_NUMBER}&text=`;

export default function Checkout() {
  const router = useRouter();
  const { cartItems, cartCount, cartTotal, clearCart } = useCart();
  const { isDesktop, width } = useResponsive();

  // Form State
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [city, setCity] = useState("");
  const [stateName, setStateName] = useState("");
  const [pincode, setPincode] = useState("");
  const [gstin, setGstin] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "upi" | "online">("cod");
  const [orderNotes, setOrderNotes] = useState("");

  // Order submission state
  const [submitting, setSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<any>(null);

  const getImgUri = (imgName: string) => `/assets/images/${imgName}`;

  const handlePlaceOrder = () => {
    if (!fullName.trim() || !phone.trim() || !addressLine1.trim() || !pincode.trim() || !city.trim()) {
      Alert.alert(
        "Missing Information",
        "Please fill in your Name, Phone Number, Delivery Address, City, and PIN Code to complete dispatch."
      );
      return;
    }

    setSubmitting(true);

    setTimeout(() => {
      const orderId = `EZB-${Math.floor(100000 + Math.random() * 900000)}`;
      const orderData = {
        orderId,
        date: new Date().toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
        fullName,
        businessName,
        phone,
        email,
        address: `${addressLine1}, ${city}, ${stateName} - ${pincode}`,
        gstin,
        paymentMethod: paymentMethod === "cod" ? "Cash on Delivery" : paymentMethod === "upi" ? "Instant UPI QR" : "Online Payment",
        items: [...cartItems],
        total: cartTotal,
      };

      setOrderSuccess(orderData);
      clearCart();
      setSubmitting(false);
    }, 1200);
  };

  const handleWhatsAppConfirm = (order: any) => {
    const itemsList = order.items
      .map((i: any) => `• ${i.product.title} (Qty: ${i.quantity}) - ${i.product.salePrice}`)
      .join("\n");

    const message = `*EzBill Hardware Order Placed (${order.orderId})*\n\n` +
      `*Customer:* ${order.fullName} (${order.businessName || "Retail"})\n` +
      `*Phone:* ${order.phone}\n` +
      `*Address:* ${order.address}\n` +
      `*Payment:* ${order.paymentMethod}\n` +
      `*Total Amount:* ₹${order.total.toLocaleString("en-IN")}\n\n` +
      `*Items:*\n${itemsList}\n\n` +
      `Please confirm order dispatch and send tracking details.`;

    const url = `${WHATSAPP_BASE_URL}${encodeURIComponent(message)}`;
    Linking.openURL(url).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.safe} testID="checkout-screen">
      <StatusBar barStyle="light-content" backgroundColor="#08090C" />

      {/* Top Navbar */}
      <View style={styles.navbar}>
        <View style={[styles.navContainer, isDesktop && styles.navContainerDesktop]}>
          <TouchableOpacity style={styles.brandRow} onPress={() => router.push("/")} activeOpacity={0.8}>
            <View style={styles.navLogoBox}>
              <Ionicons name="receipt" size={20} color="#FFFFFF" />
            </View>
            <View>
              <Text style={styles.navBrandTitle}>
                EzBill <Text style={styles.navBrandHighlight}>Checkout</Text>
              </Text>
              <Text style={styles.navBrandSubtitle}>100% SECURE DISPATCH BY PRODEVOPZ</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.backShopBtn} onPress={() => router.push("/shop" as any)}>
            <Ionicons name="storefront-outline" size={16} color="#CBD5E1" />
            <Text style={styles.backShopBtnText}>Back to Store</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {orderSuccess ? (
          /* ================= ORDER SUCCESS SCREEN ================= */
          <View style={styles.sectionContainer}>
            <View style={styles.successCard}>
              <View style={styles.successIconBox}>
                <Ionicons name="checkmark-circle" size={64} color="#10B981" />
              </View>

              <Text style={styles.successTitle}>Hardware Order Confirmed!</Text>
              <Text style={styles.successSub}>
                Thank you, <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>{orderSuccess.fullName}</Text>. Your order has been registered for express dispatch.
              </Text>

              <View style={styles.orderPill}>
                <Text style={styles.orderPillLabel}>ORDER ID:</Text>
                <Text style={styles.orderPillValue}>{orderSuccess.orderId}</Text>
              </View>

              {/* Order Overview details */}
              <View style={styles.successDetailsBox}>
                <View style={styles.successDetailRow}>
                  <Text style={styles.detailLabel}>Estimated Delivery:</Text>
                  <Text style={styles.detailValue}>3 - 5 Business Days (Express Courier)</Text>
                </View>
                <View style={styles.successDetailRow}>
                  <Text style={styles.detailLabel}>Delivery Address:</Text>
                  <Text style={styles.detailValue}>{orderSuccess.address}</Text>
                </View>
                <View style={styles.successDetailRow}>
                  <Text style={styles.detailLabel}>Payment Mode:</Text>
                  <Text style={styles.detailValue}>{orderSuccess.paymentMethod}</Text>
                </View>
                <View style={styles.successDetailRow}>
                  <Text style={styles.detailLabel}>Total Amount:</Text>
                  <Text style={[styles.detailValue, { color: "#FF5E2B", fontSize: 18, fontWeight: "900" }]}>
                    ₹{orderSuccess.total.toLocaleString("en-IN")}
                  </Text>
                </View>
              </View>

              {/* Ordered items preview */}
              <View style={styles.orderedItemsContainer}>
                <Text style={styles.orderedItemsTitle}>Ordered Hardware & Software</Text>
                {orderSuccess.items.map((item: any, idx: number) => (
                  <View key={idx} style={styles.successItemRow}>
                    <Image source={{ uri: getImgUri(item.product.image) }} style={styles.successItemImg} resizeMode="cover" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.successItemTitle}>{item.product.title}</Text>
                      <Text style={styles.successItemMeta}>Qty: {item.quantity} · {item.product.salePrice}</Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* WhatsApp instant dispatch confirmation */}
              <TouchableOpacity
                style={styles.whatsappConfirmBtn}
                onPress={() => handleWhatsAppConfirm(orderSuccess)}
              >
                <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.whatsappConfirmText}>Send Order Details on WhatsApp</Text>
              </TouchableOpacity>

              <View style={styles.successActionsRow}>
                <TouchableOpacity style={styles.successReturnBtn} onPress={() => router.push("/shop" as any)}>
                  <Ionicons name="arrow-back" size={16} color="#CBD5E1" />
                  <Text style={styles.successReturnText}>Continue Shopping</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.successHomeBtn} onPress={() => router.push("/")}>
                  <Ionicons name="home" size={16} color="#FFFFFF" />
                  <Text style={styles.successHomeText}>Go to Home</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : cartItems.length === 0 ? (
          /* ================= EMPTY CART SCREEN ================= */
          <View style={styles.sectionContainer}>
            <View style={styles.emptyCard}>
              <Ionicons name="cart-outline" size={72} color="#475569" />
              <Text style={styles.emptyHeading}>Your Cart is Empty</Text>
              <Text style={styles.emptySub}>
                Add POS billing machines, thermal receipt printers, or thermal paper rolls from our store before proceeding to checkout.
              </Text>
              <TouchableOpacity style={styles.shopNowBtn} onPress={() => router.push("/shop" as any)}>
                <Ionicons name="storefront" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.shopNowBtnText}>Browse EzBill Hardware Store</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          /* ================= ACTIVE CHECKOUT FORM ================= */
          <View style={styles.sectionContainer}>
            <Text style={styles.pageTitle}>Express Hardware Checkout</Text>
            <Text style={styles.pageSubtitle}>
              Direct Dispatch & Warranty Registration by ProDevOpz
            </Text>

            <View style={[styles.checkoutGrid, isDesktop && styles.checkoutGridDesktop]}>
              {/* Left Column: Delivery & Shipping Form */}
              <View style={[styles.formCol, isDesktop && { flex: 1.3 }]}>
                {/* 1. Contact & Business */}
                <View style={styles.formSectionCard}>
                  <View style={styles.formSectionHeader}>
                    <View style={styles.stepCircle}>
                      <Text style={styles.stepNum}>1</Text>
                    </View>
                    <Text style={styles.formSectionTitle}>Customer & Business Details</Text>
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Full Name *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. Ramesh Kumar"
                      placeholderTextColor="#64748B"
                      value={fullName}
                      onChangeText={setFullName}
                    />
                  </View>

                  <View style={styles.inputRow}>
                    <View style={[styles.inputGroup, { flex: 1 }]}>
                      <Text style={styles.inputLabel}>Restaurant / Store Name</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. Royal Cafe & Bakery"
                        placeholderTextColor="#64748B"
                        value={businessName}
                        onChangeText={setBusinessName}
                      />
                    </View>

                    <View style={[styles.inputGroup, { flex: 1 }]}>
                      <Text style={styles.inputLabel}>WhatsApp Phone Number *</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="10-digit mobile number"
                        placeholderTextColor="#64748B"
                        keyboardType="phone-pad"
                        value={phone}
                        onChangeText={setPhone}
                      />
                    </View>
                  </View>

                  <View style={styles.inputRow}>
                    <View style={[styles.inputGroup, { flex: 1 }]}>
                      <Text style={styles.inputLabel}>Email (for Tax Invoice)</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="owner@mycafe.com"
                        placeholderTextColor="#64748B"
                        keyboardType="email-address"
                        value={email}
                        onChangeText={setEmail}
                      />
                    </View>

                    <View style={[styles.inputGroup, { flex: 1 }]}>
                      <Text style={styles.inputLabel}>GSTIN (Optional, for Input Credit)</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="15-digit GST Number"
                        placeholderTextColor="#64748B"
                        autoCapitalize="characters"
                        value={gstin}
                        onChangeText={setGstin}
                      />
                    </View>
                  </View>
                </View>

                {/* 2. Shipping Address */}
                <View style={styles.formSectionCard}>
                  <View style={styles.formSectionHeader}>
                    <View style={styles.stepCircle}>
                      <Text style={styles.stepNum}>2</Text>
                    </View>
                    <Text style={styles.formSectionTitle}>Delivery Address (Pan-India Dispatch)</Text>
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Address Line (Shop / Building / Street) *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Shop #12, Ground Floor, Main Market Road"
                      placeholderTextColor="#64748B"
                      value={addressLine1}
                      onChangeText={setAddressLine1}
                    />
                  </View>

                  <View style={styles.inputRow}>
                    <View style={[styles.inputGroup, { flex: 1.2 }]}>
                      <Text style={styles.inputLabel}>City / Town *</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. Bangalore"
                        placeholderTextColor="#64748B"
                        value={city}
                        onChangeText={setCity}
                      />
                    </View>

                    <View style={[styles.inputGroup, { flex: 1 }]}>
                      <Text style={styles.inputLabel}>State *</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. Karnataka"
                        placeholderTextColor="#64748B"
                        value={stateName}
                        onChangeText={setStateName}
                      />
                    </View>

                    <View style={[styles.inputGroup, { flex: 0.9 }]}>
                      <Text style={styles.inputLabel}>PIN Code *</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="6 digits"
                        placeholderTextColor="#64748B"
                        keyboardType="number-pad"
                        value={pincode}
                        onChangeText={setPincode}
                      />
                    </View>
                  </View>

                  <View style={styles.deliveryBadge}>
                    <Ionicons name="airplane" size={16} color="#10B981" />
                    <Text style={styles.deliveryBadgeText}>
                      Free Blue Dart / Delhivery Express Air Courier Included (2-4 Days)
                    </Text>
                  </View>
                </View>

                {/* 3. Payment Method */}
                <View style={styles.formSectionCard}>
                  <View style={styles.formSectionHeader}>
                    <View style={styles.stepCircle}>
                      <Text style={styles.stepNum}>3</Text>
                    </View>
                    <Text style={styles.formSectionTitle}>Select Payment Option</Text>
                  </View>

                  <TouchableOpacity
                    style={[styles.paymentOptionCard, paymentMethod === "cod" && styles.paymentOptionActive]}
                    onPress={() => setPaymentMethod("cod")}
                  >
                    <View style={styles.radioCircle}>
                      {paymentMethod === "cod" && <View style={styles.radioInnerDot} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.paymentOptionTitle}>Cash on Delivery (Pay on Dispatch)</Text>
                      <Text style={styles.paymentOptionSub}>Pay cash or UPI directly to courier delivery executive</Text>
                    </View>
                    <Ionicons name="cash-outline" size={22} color="#10B981" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.paymentOptionCard, paymentMethod === "upi" && styles.paymentOptionActive]}
                    onPress={() => setPaymentMethod("upi")}
                  >
                    <View style={styles.radioCircle}>
                      {paymentMethod === "upi" && <View style={styles.radioInnerDot} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.paymentOptionTitle}>Instant UPI QR (PhonePe / GPay / Paytm)</Text>
                      <Text style={styles.paymentOptionSub}>Direct 0% surcharge UPI QR booking for instant dispatch</Text>
                    </View>
                    <Ionicons name="qr-code-outline" size={22} color="#FF8A3D" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.paymentOptionCard, paymentMethod === "online" && styles.paymentOptionActive]}
                    onPress={() => setPaymentMethod("online")}
                  >
                    <View style={styles.radioCircle}>
                      {paymentMethod === "online" && <View style={styles.radioInnerDot} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.paymentOptionTitle}>Online Payment (Debit / Credit Cards / Netbanking)</Text>
                      <Text style={styles.paymentOptionSub}>Secure Razorpay 256-Bit encrypted checkout</Text>
                    </View>
                    <Ionicons name="card-outline" size={22} color="#635BFF" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Right Column: Order Summary */}
              <View style={[styles.summaryCol, isDesktop && { flex: 0.9 }]}>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryCardTitle}>Order Review ({cartCount} Items)</Text>

                  {/* Items list */}
                  <ScrollView style={styles.orderItemsScroll} showsVerticalScrollIndicator={false}>
                    {cartItems.map((item) => (
                      <View key={item.product.id} style={styles.summaryItemRow}>
                        <Image source={{ uri: getImgUri(item.product.image) }} style={styles.summaryItemImg} resizeMode="cover" />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.summaryItemTitle} numberOfLines={2}>
                            {item.product.title}
                          </Text>
                          <Text style={styles.summaryItemQty}>Qty: {item.quantity}</Text>
                        </View>
                        <Text style={styles.summaryItemPrice}>{item.product.salePrice}</Text>
                      </View>
                    ))}
                  </ScrollView>

                  <View style={styles.summaryDivider} />

                  {/* Price breakdown */}
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Subtotal</Text>
                    <Text style={styles.summaryValue}>₹{cartTotal.toLocaleString("en-IN")}</Text>
                  </View>

                  <View style={styles.summaryRow}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Text style={styles.summaryLabel}>GST (18%)</Text>
                      <Text style={styles.inclusiveText}>(Included)</Text>
                    </View>
                    <Text style={styles.summaryMuted}>₹{Math.round((cartTotal * 18) / 118).toLocaleString("en-IN")}</Text>
                  </View>

                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Pan-India Express Delivery</Text>
                    <Text style={styles.freeDeliveryText}>FREE</Text>
                  </View>

                  <View style={styles.summaryDivider} />

                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Total Payable</Text>
                    <Text style={styles.totalValue}>₹{cartTotal.toLocaleString("en-IN")}</Text>
                  </View>

                  {/* Submit Button */}
                  <TouchableOpacity
                    style={styles.placeOrderBtn}
                    onPress={handlePlaceOrder}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <>
                        <Ionicons name="bag-check" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
                        <Text style={styles.placeOrderBtnText}>
                          {paymentMethod === "cod" ? "Confirm & Place COD Order" : "Proceed to Pay"}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>

                  {/* Guarantees */}
                  <View style={styles.trustBadgesBox}>
                    <View style={styles.trustBadgeItem}>
                      <Ionicons name="shield-checkmark" size={16} color="#10B981" />
                      <Text style={styles.trustBadgeText}>1-Year ProDevOpz On-Site Warranty</Text>
                    </View>
                    <View style={styles.trustBadgeItem}>
                      <Ionicons name="refresh" size={16} color="#635BFF" />
                      <Text style={styles.trustBadgeText}>7-Day Replacement Guarantee</Text>
                    </View>
                    <View style={styles.trustBadgeItem}>
                      <Ionicons name="lock-closed" size={16} color="#FF8A3D" />
                      <Text style={styles.trustBadgeText}>100% Verified SSL Secure</Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
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
    paddingBottom: 60,
  },
  navbar: {
    backgroundColor: "#08090C",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  navContainer: {
    paddingHorizontal: 16,
    paddingVertical: 14,
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
  backShopBtn: {
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
  backShopBtnText: {
    color: "#CBD5E1",
    fontSize: 13,
    fontWeight: "700",
  },
  sectionContainer: {
    maxWidth: 1280,
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  pageTitle: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    color: "#94A3B8",
    fontSize: 14,
    marginTop: 4,
    marginBottom: 24,
  },
  checkoutGrid: {
    gap: 24,
  },
  checkoutGridDesktop: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  formCol: {
    gap: 20,
  },
  formSectionCard: {
    backgroundColor: "#10141D",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 16,
    padding: 20,
    gap: 14,
  },
  formSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  stepCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#FF5E2B",
    alignItems: "center",
    justifyContent: "center",
  },
  stepNum: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  formSectionTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  inputGroup: {
    gap: 6,
  },
  inputRow: {
    flexDirection: "row",
    gap: 12,
  },
  inputLabel: {
    color: "#CBD5E1",
    fontSize: 12,
    fontWeight: "700",
  },
  input: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: "#FFFFFF",
    fontSize: 14,
  },
  deliveryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  deliveryBadgeText: {
    color: "#34D399",
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
  },
  paymentOptionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  paymentOptionActive: {
    backgroundColor: "rgba(255, 94, 43, 0.08)",
    borderColor: "#FF5E2B",
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#FF5E2B",
    alignItems: "center",
    justifyContent: "center",
  },
  radioInnerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FF5E2B",
  },
  paymentOptionTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  paymentOptionSub: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 2,
  },
  summaryCol: {},
  summaryCard: {
    backgroundColor: "#10141D",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  summaryCardTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
  },
  orderItemsScroll: {
    maxHeight: 280,
  },
  summaryItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  summaryItemImg: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: "#161B22",
  },
  summaryItemTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  summaryItemQty: {
    color: "#64748B",
    fontSize: 11,
    marginTop: 2,
  },
  summaryItemPrice: {
    color: "#FF8A3D",
    fontSize: 13,
    fontWeight: "800",
  },
  summaryDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    marginVertical: 4,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  summaryLabel: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "600",
  },
  inclusiveText: {
    color: "#10B981",
    fontSize: 10,
    fontWeight: "700",
  },
  summaryValue: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  summaryMuted: {
    color: "#64748B",
    fontSize: 13,
  },
  freeDeliveryText: {
    color: "#10B981",
    fontSize: 13,
    fontWeight: "800",
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 4,
  },
  totalLabel: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
  },
  totalValue: {
    color: "#FF5E2B",
    fontSize: 24,
    fontWeight: "900",
  },
  placeOrderBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF5E2B",
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
    shadowColor: "#FF5E2B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 4,
  },
  placeOrderBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  trustBadgesBox: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 10,
    padding: 12,
    gap: 8,
    marginTop: 4,
  },
  trustBadgeItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  trustBadgeText: {
    color: "#CBD5E1",
    fontSize: 11,
    fontWeight: "600",
  },
  emptyCard: {
    backgroundColor: "#10141D",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    padding: 40,
    alignItems: "center",
    gap: 14,
    marginTop: 40,
  },
  emptyHeading: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
  },
  emptySub: {
    color: "#94A3B8",
    fontSize: 14,
    textAlign: "center",
    maxWidth: 480,
    lineHeight: 22,
  },
  shopNowBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FF5E2B",
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 10,
  },
  shopNowBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  successCard: {
    backgroundColor: "#10141D",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
    padding: 30,
    alignItems: "center",
    gap: 16,
    maxWidth: 700,
    alignSelf: "center",
    width: "100%",
  },
  successIconBox: {
    marginTop: 8,
  },
  successTitle: {
    color: "#FFFFFF",
    fontSize: 26,
    fontWeight: "900",
    textAlign: "center",
  },
  successSub: {
    color: "#94A3B8",
    fontSize: 14,
    textAlign: "center",
    maxWidth: 520,
    lineHeight: 22,
  },
  orderPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255, 94, 43, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 94, 43, 0.3)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  orderPillLabel: {
    color: "#FF8A3D",
    fontSize: 12,
    fontWeight: "800",
  },
  orderPillValue: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1,
  },
  successDetailsBox: {
    width: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  successDetailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  detailLabel: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "600",
    width: 140,
  },
  detailValue: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
    textAlign: "right",
  },
  orderedItemsContainer: {
    width: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  orderedItemsTitle: {
    color: "#CBD5E1",
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  successItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  successItemImg: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: "#161B22",
  },
  successItemTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  successItemMeta: {
    color: "#94A3B8",
    fontSize: 11,
    marginTop: 2,
  },
  whatsappConfirmBtn: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#15803D",
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  whatsappConfirmText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  successActionsRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
    marginTop: 4,
  },
  successReturnBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    paddingVertical: 12,
    borderRadius: 10,
  },
  successReturnText: {
    color: "#CBD5E1",
    fontSize: 13,
    fontWeight: "700",
  },
  successHomeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#FF5E2B",
    paddingVertical: 12,
    borderRadius: 10,
  },
  successHomeText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
});
