import React from "react";
import { Image, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useResponsive } from "@/src/hooks/useResponsive";
import { Display, Mono, PaperEdge, ReceiptButton, ReceiptRow, ReceiptRule, receipt } from "@/src/components/ReceiptKit";

interface ModalProduct {
  title: string;
  image: string;
  originalPrice: string;
  salePrice: string;
  discount: string;
  description: string;
  features?: string[];
  packageIncludes?: string[];
  specs?: { label: string; value: string }[];
}

export default function ReceiptProductModal<T extends ModalProduct>({
  product,
  onClose,
  onAddToCart,
  onBuyNow,
  onEnquire,
}: {
  product: T | null;
  onClose: () => void;
  onAddToCart: (product: T) => void;
  onBuyNow: (product: T) => void;
  onEnquire?: (product: T) => void;
}) {
  const { isDesktop } = useResponsive();

  return (
    <Modal visible={!!product} transparent={true} animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.column, isDesktop && styles.columnDesktop]}>
          <View style={styles.paper}>
            <View style={styles.header}>
              <Mono style={styles.headerTitle} numberOfLines={1}>
                {product?.title}
              </Mono>
              <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={receipt.ink} />
              </TouchableOpacity>
            </View>
            <ReceiptRule />

            <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={true}>
              {product && (
                <View style={[styles.grid, isDesktop && styles.gridDesktop]}>
                  <View style={isDesktop ? { flex: 1 } : undefined}>
                    <Image
                      source={{ uri: `/assets/images/${product.image}` }}
                      style={styles.image}
                      resizeMode="cover"
                      accessibilityLabel={product.title}
                    />
                  </View>

                  <View style={isDesktop ? { flex: 1.2 } : undefined}>
                    <Display style={styles.title}>{product.title}</Display>

                    <View style={styles.priceRow}>
                      <Mono style={styles.salePrice}>{product.salePrice}</Mono>
                      <Mono style={styles.originalPrice}>{product.originalPrice}</Mono>
                      <View style={styles.stamp}>
                        <Mono style={styles.stampText}>{product.discount}</Mono>
                      </View>
                    </View>

                    <View style={styles.actions}>
                      <ReceiptButton label="Buy now" onPress={() => onBuyNow(product)} />
                      <View style={styles.actionRow}>
                        <ReceiptButton
                          label="Add to cart"
                          icon="cart-outline"
                          variant="outline"
                          style={styles.actionHalf}
                          onPress={() => onAddToCart(product)}
                        />
                        {onEnquire ? (
                          <ReceiptButton
                            label="Enquire"
                            icon="logo-whatsapp"
                            iconColor={receipt.whatsapp}
                            variant="outline"
                            style={styles.actionHalf}
                            onPress={() => onEnquire(product)}
                          />
                        ) : null}
                      </View>
                    </View>

                    <View style={styles.section}>
                      <Mono style={styles.sectionTitle}>Description</Mono>
                      <Mono style={styles.bodyText}>{product.description}</Mono>
                    </View>

                    {product.features && (
                      <View style={styles.section}>
                        <Mono style={styles.sectionTitle}>Key features</Mono>
                        {product.features.map((feat, index) => (
                          <View key={index} style={styles.lineRow}>
                            <Mono style={styles.lineMark}>[x]</Mono>
                            <Mono style={styles.lineText}>{feat}</Mono>
                          </View>
                        ))}
                      </View>
                    )}

                    {product.packageIncludes && (
                      <View style={styles.section}>
                        <Mono style={styles.sectionTitle}>Package includes</Mono>
                        {product.packageIncludes.map((item, index) => (
                          <View key={index} style={styles.lineRow}>
                            <Mono style={styles.lineMark}>1x</Mono>
                            <Mono style={styles.lineText}>{item}</Mono>
                          </View>
                        ))}
                      </View>
                    )}

                    {product.specs && (
                      <View style={styles.section}>
                        <Mono style={styles.sectionTitle}>Hardware specifications</Mono>
                        {product.specs.map((spec, index) => (
                          <ReceiptRow key={index} label={spec.label} value={spec.value} />
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
          <PaperEdge />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(31, 31, 31, 0.72)",
    justifyContent: "center",
    alignItems: "center",
    padding: 12,
  },
  column: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "92%",
  },
  columnDesktop: {
    maxWidth: 940,
  },
  paper: {
    flexShrink: 1,
    backgroundColor: receipt.paper,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    padding: 16,
  },
  grid: {
    gap: 16,
  },
  gridDesktop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 24,
  },
  image: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderWidth: 2,
    borderColor: receipt.ink,
    backgroundColor: receipt.tint,
  },
  title: {
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.4,
  },
  priceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    marginVertical: 12,
  },
  salePrice: {
    fontSize: 22,
    fontWeight: "700",
  },
  originalPrice: {
    fontSize: 12,
    color: receipt.muted,
    textDecorationLine: "line-through",
  },
  stamp: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 2,
    borderColor: receipt.accent,
    borderRadius: 4,
    transform: [{ rotate: "-3deg" }],
  },
  stampText: {
    fontSize: 11,
    fontWeight: "700",
    color: receipt.accent,
  },
  actions: {
    gap: 10,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  actionHalf: {
    flexGrow: 1,
    flexBasis: 170,
  },
  section: {
    marginTop: 18,
    gap: 6,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: receipt.accent,
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 22,
  },
  lineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  lineMark: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "700",
    color: receipt.success,
  },
  lineText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
  },
});
