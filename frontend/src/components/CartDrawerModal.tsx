import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Image,
  Platform,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCart } from "@/src/context/CartContext";
import { useResponsive } from "@/src/hooks/useResponsive";

export default function CartDrawerModal() {
  const { isCartOpen, setIsCartOpen, cartItems, cartCount, cartTotal, updateQuantity, removeFromCart, clearCart } =
    useCart();
  const { isDesktop, width } = useResponsive();
  const router = useRouter();

  if (!isCartOpen) return null;

  const getImgUri = (imgName: string) => {
    return `/assets/images/${imgName}`;
  };

  const handleProceedToCheckout = () => {
    setIsCartOpen(false);
    router.push("/checkout" as any);
  };

  return (
    <Modal
      visible={isCartOpen}
      transparent={true}
      animationType="fade"
      onRequestClose={() => setIsCartOpen(false)}
    >
      <View style={styles.backdrop}>
        {isDesktop && (
          <TouchableOpacity
            style={styles.backdropTouch}
            activeOpacity={1}
            onPress={() => setIsCartOpen(false)}
          />
        )}

        <View
          style={[
            styles.drawerCard,
            isDesktop ? styles.drawerDesktop : styles.drawerMobile,
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.cartIconCircle}>
                <Ionicons name="cart" size={20} color="#FF5E2B" />
              </View>
              <Text style={styles.headerTitle}>Shopping Cart</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{cartCount}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setIsCartOpen(false)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Free Shipping Banner */}
          <View style={styles.freeShippingBanner}>
            <Ionicons name="shield-checkmark" size={16} color="#10B981" />
            <Text style={styles.freeShippingText}>
              Free Pan-India Delivery & 1-Year ProDevOpz Onsite Warranty
            </Text>
          </View>

          {/* Cart Item List */}
          {cartItems.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="cart-outline" size={64} color="#475569" />
              <Text style={styles.emptyTitle}>Your cart is empty</Text>
              <Text style={styles.emptySub}>
                Browse our EzBill certified POS hardware, printers, and rolls to build your setup.
              </Text>
              <TouchableOpacity
                style={styles.exploreStoreBtn}
                onPress={() => {
                  setIsCartOpen(false);
                  router.push("/shop" as any);
                }}
              >
                <Ionicons name="storefront" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.exploreStoreBtnText}>Browse Hardware Store</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView style={styles.itemListScroll} contentContainerStyle={styles.itemListContent}>
              {cartItems.map((item) => (
                <View key={item.product.id} style={styles.cartItemCard}>
                  <Image
                    source={{ uri: getImgUri(item.product.image) }}
                    style={styles.itemImg}
                    resizeMode="cover"
                  />

                  <View style={styles.itemInfo}>
                    <Text style={styles.itemTitle} numberOfLines={2}>
                      {item.product.title}
                    </Text>
                    <View style={styles.priceRow}>
                      <Text style={styles.itemSalePrice}>{item.product.salePrice}</Text>
                      {item.product.originalPrice ? (
                        <Text style={styles.itemOriginalPrice}>{item.product.originalPrice}</Text>
                      ) : null}
                    </View>

                    {/* Stepper + Remove */}
                    <View style={styles.stepperRow}>
                      <View style={styles.stepperBox}>
                        <TouchableOpacity
                          style={styles.stepperBtn}
                          onPress={() => updateQuantity(item.product.id, item.quantity - 1)}
                        >
                          <Ionicons name="remove" size={14} color="#FFFFFF" />
                        </TouchableOpacity>

                        <Text style={styles.stepperQty}>{item.quantity}</Text>

                        <TouchableOpacity
                          style={styles.stepperBtn}
                          onPress={() => updateQuantity(item.product.id, item.quantity + 1)}
                        >
                          <Ionicons name="add" size={14} color="#FFFFFF" />
                        </TouchableOpacity>
                      </View>

                      <TouchableOpacity
                        style={styles.trashBtn}
                        onPress={() => removeFromCart(item.product.id)}
                      >
                        <Ionicons name="trash-outline" size={18} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}

              <TouchableOpacity style={styles.clearCartLink} onPress={clearCart}>
                <Ionicons name="trash-bin-outline" size={14} color="#94A3B8" />
                <Text style={styles.clearCartText}>Clear all items</Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          {/* Footer Checkout Summary */}
          {cartItems.length > 0 && (
            <View style={styles.footerContainer}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Subtotal</Text>
                <Text style={styles.summaryValue}>₹{cartTotal.toLocaleString("en-IN")}</Text>
              </View>
              <View style={styles.summaryRow}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Text style={styles.summaryLabel}>Estimated GST (18%)</Text>
                  <Text style={styles.inclusiveTag}>(Included)</Text>
                </View>
                <Text style={styles.summaryMuted}>₹{Math.round((cartTotal * 18) / 118).toLocaleString("en-IN")}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Pan-India Express Shipping</Text>
                <Text style={styles.freeShippingValue}>FREE</Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total Payable</Text>
                <Text style={styles.totalValue}>₹{cartTotal.toLocaleString("en-IN")}</Text>
              </View>

              <TouchableOpacity style={styles.checkoutBtn} onPress={handleProceedToCheckout}>
                <Text style={styles.checkoutBtnText}>Proceed to Checkout</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
              </TouchableOpacity>

              <Text style={styles.secureGuaranteeText}>
                🔒 256-Bit SSL Encrypted  ·  Instant Tax Invoice  ·  COD & UPI Supported
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  backdropTouch: {
    flex: 1,
  },
  drawerCard: {
    backgroundColor: "#0D1117",
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255, 255, 255, 0.1)",
    height: "100%",
    display: "flex",
    flexDirection: "column",
  },
  drawerDesktop: {
    width: 440,
    maxWidth: "100%",
  },
  drawerMobile: {
    width: "100%",
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cartIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 94, 43, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },
  countBadge: {
    backgroundColor: "#FF5E2B",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  countBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  closeBtn: {
    padding: 6,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8,
  },
  freeShippingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(16, 185, 129, 0.2)",
  },
  freeShippingText: {
    color: "#34D399",
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
    marginTop: 8,
  },
  emptySub: {
    color: "#94A3B8",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
  },
  exploreStoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FF5E2B",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 12,
  },
  exploreStoreBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  itemListScroll: {
    flex: 1,
  },
  itemListContent: {
    padding: 16,
    gap: 14,
  },
  cartItemCard: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 14,
    padding: 12,
    gap: 12,
  },
  itemImg: {
    width: 80,
    height: 80,
    borderRadius: 10,
    backgroundColor: "#161B22",
  },
  itemInfo: {
    flex: 1,
    justifyContent: "space-between",
  },
  itemTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 19,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginVertical: 4,
  },
  itemSalePrice: {
    color: "#FF8A3D",
    fontSize: 15,
    fontWeight: "800",
  },
  itemOriginalPrice: {
    color: "#64748B",
    fontSize: 12,
    textDecorationLine: "line-through",
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  stepperBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  stepperBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  stepperQty: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
    minWidth: 24,
    textAlign: "center",
  },
  trashBtn: {
    padding: 6,
  },
  clearCartLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
  },
  clearCartText: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "600",
  },
  footerContainer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    backgroundColor: "#0A0D14",
    gap: 8,
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
  inclusiveTag: {
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
    fontWeight: "600",
  },
  freeShippingValue: {
    color: "#10B981",
    fontSize: 13,
    fontWeight: "800",
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    marginVertical: 4,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  totalLabel: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  totalValue: {
    color: "#FF5E2B",
    fontSize: 22,
    fontWeight: "900",
  },
  checkoutBtn: {
    backgroundColor: "#FF5E2B",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: "#FF5E2B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 4,
  },
  checkoutBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  secureGuaranteeText: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 4,
  },
});
