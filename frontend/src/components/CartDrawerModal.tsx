import React from "react";
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCart } from "@/src/context/CartContext";
import { useResponsive } from "@/src/hooks/useResponsive";
import { Display, Mono, ReceiptButton, ReceiptRow, ReceiptRule, receipt } from "@/src/components/ReceiptKit";

export default function CartDrawerModal() {
  const { isCartOpen, setIsCartOpen, cartItems, cartCount, cartTotal, updateQuantity, removeFromCart, clearCart } =
    useCart();
  const { isDesktop } = useResponsive();
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

        <View style={[styles.drawer, isDesktop ? styles.drawerDesktop : styles.drawerMobile]}>
          <View style={styles.header}>
            <Mono style={styles.headerTitle}>Your cart · {cartCount}</Mono>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => setIsCartOpen(false)}
              accessibilityLabel="Close cart"
            >
              <Ionicons name="close" size={24} color={receipt.ink} />
            </TouchableOpacity>
          </View>
          <ReceiptRule />

          {cartItems.length === 0 ? (
            <View style={styles.empty}>
              <Display style={styles.emptyTitle}>Nothing on the bill yet.</Display>
              <Mono style={styles.emptySub}>Browse EzBill machines, printers and paper rolls to build your setup.</Mono>
              <ReceiptButton
                label="Browse the store"
                icon="storefront-outline"
                style={styles.emptyBtn}
                onPress={() => {
                  setIsCartOpen(false);
                  router.push("/shop" as any);
                }}
              />
            </View>
          ) : (
            <ScrollView style={styles.items} contentContainerStyle={styles.itemsContent}>
              {cartItems.map((item) => (
                <View key={item.product.id} style={styles.item}>
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
                    <View style={styles.priceRow}>
                      <Mono style={styles.salePrice}>{item.product.salePrice}</Mono>
                      {item.product.originalPrice ? (
                        <Mono style={styles.originalPrice}>{item.product.originalPrice}</Mono>
                      ) : null}
                    </View>
                    <View style={styles.stepperRow}>
                      <View style={styles.stepper}>
                        <TouchableOpacity
                          style={styles.stepperBtn}
                          onPress={() => updateQuantity(item.product.id, item.quantity - 1)}
                          accessibilityLabel={`Remove one ${item.product.title}`}
                        >
                          <Ionicons name="remove" size={16} color={receipt.ink} />
                        </TouchableOpacity>
                        <Mono style={styles.stepperQty}>{item.quantity}</Mono>
                        <TouchableOpacity
                          style={styles.stepperBtn}
                          onPress={() => updateQuantity(item.product.id, item.quantity + 1)}
                          accessibilityLabel={`Add one ${item.product.title}`}
                        >
                          <Ionicons name="add" size={16} color={receipt.ink} />
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={() => removeFromCart(item.product.id)}
                        accessibilityLabel={`Delete ${item.product.title}`}
                      >
                        <Ionicons name="trash-outline" size={18} color={receipt.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}

              <TouchableOpacity style={styles.clearLink} onPress={clearCart}>
                <Mono style={styles.clearText}>Clear all items</Mono>
              </TouchableOpacity>
            </ScrollView>
          )}

          {cartItems.length > 0 && (
            <View>
              <ReceiptRule />
              <View style={styles.footer}>
                <ReceiptRow label="Subtotal" value={`₹${cartTotal.toLocaleString("en-IN")}`} />
                <ReceiptRow label="GST 18% (included)" value={`₹${Math.round((cartTotal * 18) / 118).toLocaleString("en-IN")}`} />
                <ReceiptRow label="Express delivery" value="free" valueColor={receipt.success} />
                <ReceiptRule style={styles.footerRule} />
                <View style={styles.totalRow}>
                  <Display style={styles.totalText}>Total</Display>
                  <Display style={styles.totalText}>₹{cartTotal.toLocaleString("en-IN")}</Display>
                </View>
                <ReceiptButton
                  label="Proceed to checkout"
                  icon="arrow-forward"
                  style={styles.checkoutBtn}
                  onPress={handleProceedToCheckout}
                />
                <Mono style={styles.guarantee}>1-year warranty · COD and UPI supported</Mono>
              </View>
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
    backgroundColor: "rgba(31, 31, 31, 0.72)",
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  backdropTouch: {
    flex: 1,
  },
  drawer: {
    height: "100%",
    backgroundColor: receipt.paper,
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 18,
    paddingRight: 8,
    paddingVertical: 6,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 34,
    lineHeight: 36,
    letterSpacing: -0.6,
  },
  emptySub: {
    fontSize: 14,
    lineHeight: 22,
    color: receipt.muted,
  },
  emptyBtn: {
    marginTop: 8,
  },
  items: {
    flex: 1,
  },
  itemsContent: {
    padding: 16,
    gap: 14,
  },
  item: {
    flexDirection: "row",
    gap: 12,
  },
  itemImg: {
    width: 80,
    height: 80,
    borderWidth: 2,
    borderColor: receipt.ink,
    backgroundColor: receipt.tint,
  },
  itemInfo: {
    flex: 1,
    minWidth: 0,
  },
  itemTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  priceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: 8,
    marginVertical: 4,
  },
  salePrice: {
    fontSize: 14,
    fontWeight: "700",
  },
  originalPrice: {
    fontSize: 12,
    color: receipt.muted,
    textDecorationLine: "line-through",
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderColor: receipt.ink,
    borderRadius: 6,
  },
  stepperBtn: {
    width: 38,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperQty: {
    minWidth: 24,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  clearLink: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  clearText: {
    fontSize: 13,
    color: receipt.muted,
    textDecorationLine: "underline",
  },
  footer: {
    padding: 18,
  },
  footerRule: {
    marginVertical: 10,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 12,
  },
  totalText: {
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.5,
  },
  checkoutBtn: {
    marginTop: 12,
  },
  guarantee: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    color: receipt.muted,
    marginTop: 10,
  },
});
