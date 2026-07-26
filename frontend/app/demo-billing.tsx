import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView, SafeAreaView, StatusBar, Modal, ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { useTheme } from "@/src/context/ThemeContext";
import { useAuth } from "@/src/context/AuthContext";
import { menuItemImageSource } from "@/src/lib/foodImage";
import { radius, spacing } from "@/src/theme";

export default function DemoBilling() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const { logout } = useAuth();

  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [billModal, setBillModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [mList, pList] = await Promise.all([
        api.listMenu().catch(() => []),
        api.publicPlans().catch(() => []),
      ]);
      setMenuItems(Array.isArray(mList) && mList.length ? mList.slice(0, 2) : [
        { id: "demo-1", name: "Paneer Butter Masala", price: 220, description: "Fresh cottage cheese curry" },
        { id: "demo-2", name: "Jeera Rice", price: 140, description: "Basmati rice with cumin" }
      ]);
      setPlans(Array.isArray(pList) ? pList : []);
    } catch {
      setMenuItems([
        { id: "demo-1", name: "Paneer Butter Masala", price: 220, description: "Fresh cottage cheese curry" },
        { id: "demo-2", name: "Jeera Rice", price: 140, description: "Basmati rice with cumin" }
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const updateQty = (id: string, delta: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setQuantities(prev => {
      const current = prev[id] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [id]: next };
    });
  };

  const selectedItems = menuItems.map(item => ({
    ...item,
    qty: quantities[item.id] || 0,
  })).filter(i => i.qty > 0);

  const subtotal = selectedItems.reduce((sum, i) => sum + (i.price * i.qty), 0);
  const totalQty = selectedItems.reduce((sum, i) => sum + i.qty, 0);

  const handleGenerate = () => {
    if (totalQty === 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setBillModal(true);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.surface }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.surface} />
      <View style={[styles.wrap, { paddingTop: insets.top, backgroundColor: theme.surface }]}>
        
        {/* Upside Subscription Alert Banner */}
        <View style={styles.topBanner}>
          <Ionicons name="lock-closed" size={20} color="#F59E0B" />
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>PREVIEW MODE • UNSUBSCRIBED</Text>
            <Text style={styles.bannerSub}>Subscribe to unlock full ERP (Dashboard, Kitchen & Waiter App)</Text>
          </View>
          <Pressable style={styles.subNowBtn} onPress={() => router.push("/(app)/subscribe")}>
            <Text style={styles.subNowText}>Subscribe →</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 180 }} showsVerticalScrollIndicator={false}>
          
          {/* Header Bar */}
          <View style={styles.header}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
              <Text style={[styles.title, { color: theme.onSurface }]}>Instant POS Billing Demo</Text>
              <Pressable
                style={styles.logoutBtn}
                onPress={async () => {
                  await logout();
                  router.replace("/");
                }}
                testID="demo-logout-btn"
              >
                <Ionicons name="log-out-outline" size={16} color="#EF4444" style={{ marginRight: 4 }} />
                <Text style={styles.logoutText}>Log Out</Text>
              </Pressable>
            </View>
            <Text style={[styles.sub, { color: theme.onSurfaceSecondary }]}>Try tapping items below to generate instant receipt</Text>
          </View>

          {/* 2 Demo Dish Cards from Database */}
          {loading ? (
            <ActivityIndicator color="#635BFF" style={{ marginVertical: 20 }} />
          ) : (
            menuItems.map(item => {
              const qty = quantities[item.id] || 0;
              return (
                <Pressable
                  key={item.id}
                  style={[styles.itemCard, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}
                  onPress={() => updateQty(item.id, 1)}
                >
                  <Image source={menuItemImageSource(item)} style={styles.itemImg} contentFit="cover" />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <View style={styles.vegSquare} />
                      <Text style={[styles.itemName, { color: theme.onSurface }]}>{item.name}</Text>
                    </View>
                    <Text style={[styles.itemPrice, { color: theme.onSurfaceSecondary }]}>₹{item.price} • {item.description || "Freshly cooked"}</Text>
                  </View>

                  {qty > 0 ? (
                    <View style={styles.counterPill}>
                      <Pressable onPress={() => updateQty(item.id, -1)} style={styles.counterBtn}>
                        <Ionicons name="remove" size={16} color="#635BFF" />
                      </Pressable>
                      <Text style={styles.counterText}>{qty}</Text>
                      <Pressable onPress={() => updateQty(item.id, 1)} style={styles.counterBtn}>
                        <Ionicons name="add" size={16} color="#635BFF" />
                      </Pressable>
                    </View>
                  ) : (
                    <View style={styles.addBtn}>
                      <Ionicons name="add" size={22} color="#FFFFFF" />
                    </View>
                  )}
                </Pressable>
              );
            })
          )}

          {/* High-Converting Subscription Benefits Card */}
          <View style={[styles.convertCard, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
            <View style={styles.convertHeader}>
              <Ionicons name="sparkles" size={24} color="#635BFF" />
              <Text style={[styles.convertTitle, { color: theme.onSurface }]}>Unlock Full Restaurant ERP</Text>
            </View>
            <Text style={[styles.convertSub, { color: theme.onSurfaceSecondary }]}>Subscribe now to access all powerful modules without limits:</Text>

            <View style={styles.featureList}>
              {[
                "⚡ Live Kitchen KDS (Real-time order statuses & timer)",
                "🪑 Waiter & Table Order Management (Instant sync)",
                "📊 Real-time Sales Analytics & Monthly Reports",
                "👥 Unlimited Staff Accounts & Custom Permissions",
                "🖨️ Thermal Bluetooth & Network Printer Support",
              ].map((feat, idx) => (
                <View key={idx} style={styles.featureRow}>
                  <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                  <Text style={[styles.featureText, { color: theme.onSurface }]}>{feat}</Text>
                </View>
              ))}
            </View>

            {/* Plans List from Database API */}
            {plans.length > 0 && (
              <View style={{ gap: spacing.md, marginTop: spacing.md }}>
                {plans.map(p => (
                  <Pressable key={p.id} style={styles.planBannerBtn} onPress={() => router.push("/(app)/subscribe")}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.planBannerName}>{p.name}</Text>
                      <Text style={styles.planBannerSub}>Full features • Auto sync</Text>
                    </View>
                    <Text style={styles.planBannerPrice}>₹{p.price} / {p.interval}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            <Pressable style={styles.unlockCtaBtn} onPress={() => router.push("/(app)/subscribe")}>
              <Text style={styles.unlockCtaText}>Subscribe Now to Unlock All Features →</Text>
            </Pressable>
          </View>

        </ScrollView>

        {/* Bottom Bar */}
        <View style={[styles.bottomBar, { backgroundColor: theme.surfaceSecondary, borderTopColor: theme.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.onSurfaceSecondary, fontSize: 12, fontWeight: "600" }}>{totalQty} items selected</Text>
            <Text style={{ color: theme.onSurface, fontSize: 22, fontWeight: "900" }}>₹{subtotal}</Text>
          </View>
          <Pressable
            style={[styles.genBtn, totalQty === 0 && { opacity: 0.5 }]}
            onPress={handleGenerate}
            disabled={totalQty === 0}
          >
            <Text style={styles.genBtnText}>Generate Bill →</Text>
          </Pressable>
        </View>

        {/* Sample Bill Preview Modal */}
        <Modal visible={billModal} transparent animationType="slide">
          <Pressable style={styles.modalBg} onPress={() => setBillModal(false)}>
            <Pressable style={[styles.modalCard, { backgroundColor: theme.surfaceSecondary }]} onPress={() => {}}>
              <Text style={[styles.modalTitle, { color: theme.onSurface }]}>Instant Receipt Sample</Text>
              
              <View style={{ gap: 8, marginVertical: spacing.md }}>
                {selectedItems.map((it, idx) => (
                  <View key={idx} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: theme.onSurface, fontSize: 15 }}>{it.qty}× {it.name}</Text>
                    <Text style={{ color: theme.onSurface, fontSize: 15, fontWeight: "700" }}>₹{it.qty * it.price}</Text>
                  </View>
                ))}
              </View>

              <View style={{ height: 1, backgroundColor: theme.border, marginVertical: spacing.sm }} />
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: theme.onSurface, fontSize: 18, fontWeight: "900" }}>TOTAL</Text>
                <Text style={{ color: "#635BFF", fontSize: 22, fontWeight: "900" }}>₹{subtotal}</Text>
              </View>

              <View style={styles.qrContainer}>
                <Image
                  source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?data=upi://pay?pa=8152075375-2@ybl&pn=Restaurant&am=${subtotal}&cu=INR&size=300x300&bgcolor=ffffff&color=000000&margin=8` }}
                  style={{ width: 160, height: 160 }}
                  contentFit="contain"
                />
                <Text style={{ color: "#0F172A", fontSize: 12, fontWeight: "800" }}>UPI QR Payment Code</Text>
              </View>

              <Pressable style={styles.subscribeCta} onPress={() => { setBillModal(false); router.push("/(app)/subscribe"); }}>
                <Text style={styles.subscribeCtaText}>Subscribe Now to Unlock Full App →</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: { flex: 1 },
  topBanner: { backgroundColor: "#FEF3C7", flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md },
  bannerTitle: { color: "#92400E", fontSize: 12, fontWeight: "900", letterSpacing: 0.5 },
  bannerSub: { color: "#B45309", fontSize: 11, fontWeight: "600", marginTop: 1 },
  subNowBtn: { backgroundColor: "#635BFF", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  subNowText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },

  header: { paddingVertical: spacing.xs },
  title: { fontSize: 24, fontWeight: "900" },
  sub: { fontSize: 13, marginTop: 2 },

  itemCard: { flexDirection: "row", alignItems: "center", padding: spacing.lg, borderRadius: 28, borderWidth: 1.5, gap: spacing.md },
  itemImg: { width: 56, height: 56, borderRadius: 16 },
  vegSquare: { width: 12, height: 12, borderRadius: 3, backgroundColor: "#10B981" },
  itemName: { fontSize: 16, fontWeight: "800" },
  itemPrice: { fontSize: 13, marginTop: 2 },

  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#635BFF", justifyContent: "center", alignItems: "center" },
  counterPill: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#F1F0FF", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  counterBtn: { padding: 4 },
  counterText: { color: "#635BFF", fontWeight: "900", fontSize: 15 },

  convertCard: { padding: spacing.xl, borderRadius: 28, borderWidth: 1.5, gap: spacing.md, marginTop: spacing.md },
  convertHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  convertTitle: { fontSize: 20, fontWeight: "900" },
  convertSub: { fontSize: 13, fontWeight: "500" },

  featureList: { gap: spacing.sm, marginVertical: spacing.xs },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  featureText: { fontSize: 13, fontWeight: "600", flex: 1 },

  planBannerBtn: { backgroundColor: "#635BFF15", borderColor: "#635BFF", borderWidth: 1.5, padding: spacing.md, borderRadius: 18, flexDirection: "row", alignItems: "center" },
  planBannerName: { color: "#635BFF", fontSize: 15, fontWeight: "900" },
  planBannerSub: { color: "#64748B", fontSize: 12 },
  planBannerPrice: { color: "#635BFF", fontSize: 16, fontWeight: "900" },

  unlockCtaBtn: { backgroundColor: "#635BFF", paddingVertical: 16, borderRadius: 20, alignItems: "center", marginTop: spacing.sm },
  unlockCtaText: { color: "#FFFFFF", fontWeight: "900", fontSize: 15 },

  bottomBar: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", padding: spacing.lg, borderTopWidth: 1.5 },
  genBtn: { backgroundColor: "#635BFF", paddingHorizontal: 24, paddingVertical: 14, borderRadius: 20 },
  genBtnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },

  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalCard: { padding: spacing.xl, borderTopLeftRadius: 28, borderTopRightRadius: 28, gap: spacing.md },
  modalTitle: { fontSize: 20, fontWeight: "900" },
  qrContainer: { backgroundColor: "#FFFFFF", padding: spacing.lg, borderRadius: 20, alignItems: "center", gap: 8, marginVertical: spacing.md },
  subscribeCta: { backgroundColor: "#635BFF", paddingVertical: 16, borderRadius: 20, alignItems: "center" },
  subscribeCtaText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
  logoutBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(239, 68, 68, 0.1)", borderWidth: 1, borderColor: "rgba(239, 68, 68, 0.2)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  logoutText: { color: "#EF4444", fontSize: 13, fontWeight: "700" },
});
