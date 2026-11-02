import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  SafeAreaView,
  StatusBar,
  Linking,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useCart } from "@/src/context/CartContext";
import { useResponsive } from "@/src/hooks/useResponsive";
import {
  Display,
  Mono,
  PaperEdge,
  ReceiptBarcode,
  ReceiptButton,
  ReceiptField,
  ReceiptNotice,
  ReceiptRow,
  ReceiptRule,
  ReceiptTopBar,
  receipt,
} from "@/src/components/ReceiptKit";

const WHATSAPP_NUMBER = "918152075375";
const WHATSAPP_BASE_URL = `https://api.whatsapp.com/send/?phone=${WHATSAPP_NUMBER}&text=`;

const BACKEND_BASE = (process.env.EXPO_PUBLIC_BACKEND_URL && !process.env.EXPO_PUBLIC_BACKEND_URL.includes("0.0.0.0") ? process.env.EXPO_PUBLIC_BACKEND_URL : "https://billpro-wulv.onrender.com").replace(/\/$/, "");

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
  const [formError, setFormError] = useState<string | null>(null);

  const getImgUri = (imgName: string) => `/assets/images/${imgName}`;

  const handlePlaceOrder = async () => {
    if (!fullName.trim() || !phone.trim() || !addressLine1.trim() || !pincode.trim() || !city.trim()) {
      // react-native-web's Alert.alert does nothing, so the message has to be on the page
      setFormError("Please fill in your name, phone number, delivery address, city, and PIN code.");
      return;
    }

    setFormError(null);
    setSubmitting(true);

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

    // 1. Submit to Backend API (MongoDB order persistence + Brevo email alert to contactprodevopz@gmail.com)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      await fetch(`${BACKEND_BASE}/api/shop/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(orderData),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (err) {
      console.warn("[Checkout] Backend notification warning:", err);
    }

    // 2. Dual redundancy email alert to contactprodevopz@gmail.com
    try {
      const itemsList = orderData.items
        .map((i: any) => `${i.product.title} (Qty: ${i.quantity}) - ${i.product.salePrice}`)
        .join("; ");

      fetch("https://formsubmit.co/ajax/contactprodevopz@gmail.com", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          _subject: `🚀 New Hardware Order: ${orderId} - ₹${orderData.total} (${fullName})`,
          OrderId: orderId,
          CustomerName: fullName,
          StoreBusiness: businessName || "Retail Store",
          Phone: phone,
          Email: email || "Not provided",
          DeliveryAddress: orderData.address,
          GSTIN: gstin || "N/A",
          PaymentMode: orderData.paymentMethod,
          Items: itemsList,
          TotalPayable: `₹${orderData.total}`,
        }),
      }).catch(() => {});
    } catch (e) {}

    // 3. Update order state & clear cart
    setOrderSuccess(orderData);
    clearCart();
    setSubmitting(false);

    // 4. Automatically trigger WhatsApp message to +91 81520 75375
    handleWhatsAppConfirm(orderData);
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

  const isPhone = width < 576;

  const paymentOptions: {
    key: "cod" | "upi" | "online";
    title: string;
    sub: string;
    icon: React.ComponentProps<typeof Ionicons>["name"];
  }[] = [
    {
      key: "cod",
      title: "Cash on delivery",
      sub: "Pay cash or UPI directly to the delivery executive",
      icon: "cash-outline",
    },
    {
      key: "upi",
      title: "Instant UPI QR",
      sub: "PhonePe, GPay or Paytm, with no surcharge",
      icon: "qr-code-outline",
    },
    {
      key: "online",
      title: "Online payment",
      sub: "Debit or credit card and netbanking through Razorpay",
      icon: "card-outline",
    },
  ];

  return (
    <SafeAreaView style={styles.safe} testID="checkout-screen">
      <StatusBar barStyle="dark-content" backgroundColor={receipt.page} />

      <ReceiptTopBar
        label="Checkout"
        right={
          <ReceiptButton
            label={isDesktop ? "Back to store" : "Store"}
            variant="outline"
            style={styles.smallBtn}
            onPress={() => router.push("/shop" as any)}
          />
        }
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {orderSuccess ? (
          /* ================= ORDER SUCCESS SCREEN ================= */
          <View style={styles.narrowColumn}>
            <View style={styles.paper}>
              <View style={styles.section}>
                <Mono style={styles.billBrand}>EZBILL</Mono>
                <Mono style={styles.billSub}>Hardware order</Mono>
                <ReceiptRule style={styles.rule} />
                <Display accessibilityRole="header" style={styles.pageTitle}>
                  Order confirmed.
                </Display>
                <Mono style={styles.pageSub}>
                  Thank you, {orderSuccess.fullName}. Your order has been registered for express dispatch.
                </Mono>
                <ReceiptRule style={styles.rule} />
                <ReceiptRow label="Order ID" value={orderSuccess.orderId} bold />
                <ReceiptRow label="Delivery" value="3-5 business days" />
                <ReceiptRow label="Address" value={orderSuccess.address} />
                <ReceiptRow label="Payment" value={orderSuccess.paymentMethod} />
                <ReceiptRule style={styles.rule} />
                {orderSuccess.items.map((item: any, idx: number) => (
                  <View key={idx} style={styles.itemRow}>
                    <Image
                      source={{ uri: getImgUri(item.product.image) }}
                      style={styles.itemImg}
                      resizeMode="cover"
                      accessibilityLabel={item.product.title}
                    />
                    <View style={styles.itemInfo}>
                      <Mono style={styles.itemTitle}>{item.product.title}</Mono>
                      <Mono style={styles.itemMeta}>
                        Qty: {item.quantity} · {item.product.salePrice}
                      </Mono>
                    </View>
                  </View>
                ))}
                <ReceiptRule style={styles.rule} />
                <View style={styles.totalRow}>
                  <Display style={styles.totalLabel}>Total</Display>
                  <Display style={styles.totalLabel}>₹{orderSuccess.total.toLocaleString("en-IN")}</Display>
                </View>

                <View style={styles.buttonStack}>
                  <ReceiptButton
                    label="Send order on WhatsApp"
                    icon="logo-whatsapp"
                    onPress={() => handleWhatsAppConfirm(orderSuccess)}
                  />
                  <View style={styles.buttonRow}>
                    <ReceiptButton
                      label="Continue shopping"
                      variant="outline"
                      style={styles.buttonHalf}
                      onPress={() => router.push("/shop" as any)}
                    />
                    <ReceiptButton
                      label="Go to home"
                      variant="outline"
                      style={styles.buttonHalf}
                      onPress={() => router.push("/")}
                    />
                  </View>
                </View>

                <ReceiptRule style={styles.rule} />
                <ReceiptBarcode />
                <Mono style={styles.thankYou}>Thank you, visit again</Mono>
              </View>
            </View>
            <PaperEdge />
          </View>
        ) : cartItems.length === 0 ? (
          /* ================= EMPTY CART SCREEN ================= */
          <View style={styles.narrowColumn}>
            <View style={styles.paper}>
              <View style={styles.section}>
                <Mono style={styles.billBrand}>EZBILL</Mono>
                <Mono style={styles.billSub}>Bill no. 0000</Mono>
                <ReceiptRule style={styles.rule} />
                <Display accessibilityRole="header" style={styles.pageTitle}>
                  Nothing on the bill yet.
                </Display>
                <Mono style={styles.pageSub}>
                  Add billing machines, thermal printers or paper rolls from the store before checking out.
                </Mono>
                <ReceiptButton
                  label="Browse the hardware store"
                  icon="storefront-outline"
                  style={styles.emptyBtn}
                  onPress={() => router.push("/shop" as any)}
                />
              </View>
            </View>
            <PaperEdge />
          </View>
        ) : (
          /* ================= ACTIVE CHECKOUT FORM ================= */
          <View style={styles.column}>
            <View style={styles.pageHead}>
              <Display accessibilityRole="header" style={[styles.heroTitle, isPhone && styles.heroTitlePhone]}>
                Almost on the bill.
              </Display>
              <Mono style={styles.heroSub}>Direct dispatch and warranty registration by ProDevOpz.</Mono>
            </View>

            <View style={[styles.grid, isDesktop && styles.gridDesktop]}>
              <View style={isDesktop ? styles.formColDesktop : undefined}>
                <View style={styles.paper}>
                  <View style={styles.section}>
                    <Mono style={styles.stepLabel}>1. Your details</Mono>
                    <ReceiptField
                      label="Full name *"
                      placeholder="e.g. Ramesh Kumar"
                      value={fullName}
                      onChangeText={setFullName}
                    />
                    <View style={isDesktop ? styles.fieldRow : undefined}>
                      <View style={isDesktop ? styles.fieldFlex : undefined}>
                        <ReceiptField
                          label="Restaurant or store name"
                          placeholder="e.g. Royal Cafe"
                          value={businessName}
                          onChangeText={setBusinessName}
                        />
                      </View>
                      <View style={isDesktop ? styles.fieldFlex : undefined}>
                        <ReceiptField
                          label="WhatsApp number *"
                          placeholder="10-digit mobile number"
                          keyboardType="phone-pad"
                          value={phone}
                          onChangeText={setPhone}
                        />
                      </View>
                    </View>
                    <View style={isDesktop ? styles.fieldRow : undefined}>
                      <View style={isDesktop ? styles.fieldFlex : undefined}>
                        <ReceiptField
                          label="Email (for tax invoice)"
                          placeholder="owner@mycafe.com"
                          keyboardType="email-address"
                          value={email}
                          onChangeText={setEmail}
                        />
                      </View>
                      <View style={isDesktop ? styles.fieldFlex : undefined}>
                        <ReceiptField
                          label="GSTIN (optional)"
                          placeholder="15-digit GST number"
                          autoCapitalize="characters"
                          value={gstin}
                          onChangeText={setGstin}
                        />
                      </View>
                    </View>
                  </View>

                  <ReceiptRule />

                  <View style={styles.section}>
                    <Mono style={styles.stepLabel}>2. Delivery address</Mono>
                    <ReceiptField
                      label="Shop, building and street *"
                      placeholder="Shop 12, Main Market Road"
                      value={addressLine1}
                      onChangeText={setAddressLine1}
                    />
                    <View style={isDesktop ? styles.fieldRow : undefined}>
                      <View style={isDesktop ? styles.fieldFlex : undefined}>
                        <ReceiptField label="City *" placeholder="e.g. Bangalore" value={city} onChangeText={setCity} />
                      </View>
                      <View style={isDesktop ? styles.fieldFlex : undefined}>
                        <ReceiptField
                          label="State"
                          placeholder="e.g. Karnataka"
                          value={stateName}
                          onChangeText={setStateName}
                        />
                      </View>
                      <View style={isDesktop ? styles.fieldFlex : undefined}>
                        <ReceiptField
                          label="PIN code *"
                          placeholder="6 digits"
                          keyboardType="number-pad"
                          value={pincode}
                          onChangeText={setPincode}
                        />
                      </View>
                    </View>
                    <Mono style={styles.deliveryNote}>Free express courier included.</Mono>
                  </View>

                  <ReceiptRule />

                  <View style={styles.section}>
                    <Mono style={styles.stepLabel}>3. Payment</Mono>
                    <View style={styles.paymentList}>
                      {paymentOptions.map((option) => {
                        const isActive = paymentMethod === option.key;
                        return (
                          <TouchableOpacity
                            key={option.key}
                            style={[styles.paymentOption, isActive && styles.paymentOptionActive]}
                            onPress={() => setPaymentMethod(option.key)}
                            accessibilityRole="radio"
                            accessibilityState={{ checked: isActive }}
                          >
                            <View style={styles.radio}>{isActive && <View style={styles.radioDot} />}</View>
                            <View style={styles.paymentText}>
                              <Mono style={styles.paymentTitle}>{option.title}</Mono>
                              <Mono style={styles.paymentSub}>{option.sub}</Mono>
                            </View>
                            <Ionicons name={option.icon} size={22} color={receipt.ink} />
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                </View>
                <PaperEdge />
              </View>

              <View style={isDesktop ? styles.summaryColDesktop : undefined}>
                <View style={styles.paper}>
                  <View style={styles.section}>
                    <Mono style={styles.billBrand}>EZBILL</Mono>
                    <Mono style={styles.billSub}>
                      Order review · {cartCount} {cartCount === 1 ? "item" : "items"}
                    </Mono>
                    <ReceiptRule style={styles.rule} />

                    {cartItems.map((item) => (
                      <View key={item.product.id} style={styles.itemRow}>
                        <Image
                          source={{ uri: getImgUri(item.product.image) }}
                          style={styles.itemImg}
                          resizeMode="cover"
                          accessibilityLabel={item.product.title}
                        />
                        <View style={styles.itemInfo}>
                          <Mono style={styles.itemTitle} numberOfLines={2}>
                            {item.product.title}
                          </Mono>
                          <Mono style={styles.itemMeta}>Qty: {item.quantity}</Mono>
                        </View>
                        <Mono style={styles.itemPrice}>{item.product.salePrice}</Mono>
                      </View>
                    ))}

                    <ReceiptRule style={styles.rule} />
                    <ReceiptRow label="Subtotal" value={`₹${cartTotal.toLocaleString("en-IN")}`} />
                    <ReceiptRow label="GST 18% (included)" value={`₹${Math.round((cartTotal * 18) / 118).toLocaleString("en-IN")}`} />
                    <ReceiptRow label="Express delivery" value="free" valueColor={receipt.success} />
                    <ReceiptRule style={styles.rule} />

                    <View style={styles.totalRow}>
                      <Display style={styles.totalLabel}>Total</Display>
                      <Display style={styles.totalLabel}>₹{cartTotal.toLocaleString("en-IN")}</Display>
                    </View>

                    {formError && <ReceiptNotice text={formError} />}

                    <ReceiptButton
                      label={paymentMethod === "cod" ? "Confirm and place COD order" : "Proceed to pay"}
                      icon="bag-check-outline"
                      onPress={handlePlaceOrder}
                      busy={submitting}
                      style={styles.placeOrderBtn}
                    />

                    <View style={styles.trust}>
                      <Mono style={styles.trustText}>1-year on-site warranty</Mono>
                      <Mono style={styles.trustText}>7-day replacement guarantee</Mono>
                    </View>

                    <ReceiptRule style={styles.rule} />
                    <ReceiptBarcode />
                  </View>
                </View>
                <PaperEdge />
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
    backgroundColor: receipt.page,
  },
  smallBtn: {
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  scroll: {
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 20,
    paddingBottom: 48,
  },
  column: {
    width: "100%",
    maxWidth: 1180,
  },
  narrowColumn: {
    width: "100%",
    maxWidth: 560,
  },
  pageHead: {
    gap: 8,
    paddingTop: 8,
    paddingBottom: 22,
  },
  heroTitle: {
    fontSize: 60,
    lineHeight: 62,
    letterSpacing: -1.6,
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
  },
  grid: {
    gap: 20,
  },
  gridDesktop: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  formColDesktop: {
    flex: 1.35,
    minWidth: 0,
  },
  summaryColDesktop: {
    flex: 0.9,
    minWidth: 0,
  },
  paper: {
    width: "100%",
    backgroundColor: receipt.paper,
  },
  section: {
    padding: 20,
  },
  billBrand: {
    fontSize: 22,
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
    marginVertical: 14,
  },
  pageTitle: {
    fontSize: 36,
    lineHeight: 38,
    letterSpacing: -0.7,
  },
  pageSub: {
    fontSize: 14,
    lineHeight: 22,
    color: receipt.muted,
    marginTop: 8,
  },
  stepLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: receipt.accent,
    marginBottom: 12,
  },
  fieldRow: {
    flexDirection: "row",
    gap: 12,
  },
  fieldFlex: {
    flex: 1,
    minWidth: 0,
  },
  deliveryNote: {
    fontSize: 12,
    lineHeight: 18,
    color: receipt.success,
    fontWeight: "700",
  },
  paymentList: {
    gap: 10,
  },
  paymentOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 62,
    padding: 12,
    borderWidth: 1,
    borderColor: receipt.rule,
    borderRadius: 6,
  },
  paymentOptionActive: {
    borderWidth: 2,
    borderColor: receipt.ink,
    backgroundColor: receipt.tint,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: receipt.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: receipt.ink,
  },
  paymentText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  paymentTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  paymentSub: {
    fontSize: 12,
    lineHeight: 17,
    color: receipt.muted,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  itemImg: {
    width: 52,
    height: 52,
    borderWidth: 1,
    borderColor: receipt.ink,
    backgroundColor: receipt.tint,
  },
  itemInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  itemTitle: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  itemMeta: {
    fontSize: 12,
    color: receipt.muted,
  },
  itemPrice: {
    fontSize: 12,
    fontWeight: "700",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 12,
  },
  totalLabel: {
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -0.6,
  },
  placeOrderBtn: {
    marginTop: 14,
  },
  trust: {
    gap: 2,
    marginTop: 12,
    alignItems: "center",
  },
  trustText: {
    fontSize: 12,
    lineHeight: 18,
    color: receipt.muted,
  },
  buttonStack: {
    gap: 10,
    marginTop: 16,
  },
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  buttonHalf: {
    flexGrow: 1,
    flexBasis: 170,
  },
  emptyBtn: {
    marginTop: 18,
  },
  thankYou: {
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 12,
  },
});
