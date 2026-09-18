import { useEffect } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Pressable, SafeAreaView, StatusBar, ScrollView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { useResponsive } from "@/src/hooks/useResponsive";
import { spacing, radius } from "@/src/theme";

export default function Index() {
  const { user, loading } = useAuth();
  const { isDesktop } = useResponsive();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      if (user.role === "waiter" || user.role === "kitchen") {
        router.replace("/(app)/waiter");
      } else {
        router.replace("/(app)/dashboard");
      }
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <View style={styles.center} testID="landing-loading">
        <ActivityIndicator size="large" color="#FF5E2B" />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: isDesktop ? "#08090C" : "#0D0E12" }]} testID="landing-screen">
      <StatusBar barStyle="light-content" backgroundColor={isDesktop ? "#08090C" : "#0D0E12"} />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            backgroundColor: isDesktop ? "#08090C" : "#0D0E12",
            alignItems: isDesktop ? "center" : undefined,
            justifyContent: isDesktop ? "center" : "space-between",
            paddingVertical: isDesktop ? 48 : spacing.xxl,
          },
        ]}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <View style={[isDesktop && styles.desktopCardWrapper]}>
          {/* Brand Hero Section */}
          <View style={styles.heroSection}>
            <View style={styles.logoBox}>
              <Ionicons name="restaurant" size={44} color="#FFFFFF" />
            </View>
            <Text style={styles.brandTitle}>
              EzBill <Text style={styles.brandSubTitle}>POS</Text>
            </Text>
            <Text style={styles.tagline}>Smart Restaurant POS, Table Management & GST ERP</Text>

            <Text style={styles.cursiveTag}>
              ✨ Zero lag 0ms speed · Instant thermal KOT prints
            </Text>

            <View style={styles.pillBadge}>
              <View style={styles.pillDot} />
              <Text style={styles.pillText}>0ms OFFLINE SPEED · FLOAT-SAFE GST · ESC/POS 80mm</Text>
            </View>
          </View>

          {/* Portal Access Action Buttons */}
          <View style={styles.actionsCard}>
            <Text style={styles.cardHeaderTitle}>Portal Access</Text>
            
            <Pressable
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed]}
              testID="landing-login-btn"
              onPress={() => router.push("/login")}
            >
              <View style={styles.btnRow}>
                <Ionicons name="business-outline" size={18} color="#FFFFFF" style={styles.btnIconLeft} />
                <Text style={styles.primaryBtnText}>Restaurant Owner Login</Text>
                <Ionicons name="arrow-forward" size={16} color="#FFFFFF" style={styles.btnIconRight} />
              </View>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.secondaryBtn, pressed && styles.btnPressed]}
              testID="landing-staff-btn"
              onPress={() => router.push("/staff-login")}
            >
              <View style={styles.btnRow}>
                <Ionicons name="keypad-outline" size={18} color="#FF5E2B" style={styles.btnIconLeft} />
                <Text style={styles.secondaryBtnText}>Staff PIN Login (Waiter / Kitchen)</Text>
              </View>
            </Pressable>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                style={({ pressed }) => [styles.demoBtn, { flex: 1, marginTop: 0 }, pressed && styles.btnPressed]}
                onPress={() => router.push("/pricing")}
              >
                <View style={styles.btnRow}>
                  <Ionicons name="pricetag-outline" size={15} color="#10B981" style={styles.btnIconLeft} />
                  <Text style={[styles.demoBtnText, { color: "#10B981", fontSize: 13 }]}>Pricing (₹299/mo)</Text>
                </View>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.demoBtn, { flex: 1, marginTop: 0 }, pressed && styles.btnPressed]}
                onPress={() => router.push("/pos-erp")}
              >
                <View style={styles.btnRow}>
                  <Ionicons name="sparkles-outline" size={15} color="#FF8A3D" style={styles.btnIconLeft} />
                  <Text style={[styles.demoBtnText, { color: "#FF8A3D", fontSize: 13 }]}>Features & POS</Text>
                </View>
              </Pressable>
            </View>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable
              style={({ pressed }) => [styles.ghostBtn, pressed && styles.btnPressed]}
              testID="landing-register-btn"
              onPress={() => router.push("/register")}
            >
              <View style={styles.btnRow}>
                <Ionicons name="person-add-outline" size={16} color="#FF5E2B" style={styles.btnIconLeft} />
                <Text style={styles.ghostText}>Create Business Account (₹299/mo)</Text>
              </View>
            </Pressable>
          </View>

          {/* Footer Note */}
          <Text style={styles.footerNote}>Trusted by leading restaurants, cafes, cloud kitchens & bars across India</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#08090C" },
  center: { flex: 1, backgroundColor: "#08090C", justifyContent: "center", alignItems: "center" },
  desktopCardWrapper: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    backgroundColor: "rgba(18, 22, 28, 0.9)",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    padding: 32,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 28,
    elevation: 8,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xxl,
  },
  heroSection: {
    alignItems: "center",
    marginTop: spacing.xl,
  },
  logoBox: {
    width: 86,
    height: 86,
    borderRadius: 24,
    backgroundColor: "#FF5E2B",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.lg,
    shadowColor: "#FF5E2B",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 6,
  },
  brandTitle: {
    fontSize: 34,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  brandSubTitle: {
    color: "#34D399",
    fontFamily: Platform.OS === "web" ? "'Playfair Display', Georgia, serif" : undefined,
    fontStyle: "italic",
    fontWeight: "700",
  },
  tagline: {
    color: "#94A3B8",
    marginTop: 6,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  cursiveTag: {
    fontFamily: Platform.OS === "web" ? "'Caveat', cursive, sans-serif" : undefined,
    fontSize: 20,
    color: "#FDBA74",
    fontWeight: "600",
    marginTop: 8,
    textAlign: "center",
  },
  pillBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255, 94, 43, 0.12)",
    borderColor: "rgba(255, 94, 43, 0.3)",
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: radius.pill,
    marginTop: spacing.md,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#10B981",
  },
  pillText: {
    color: "#FF8A3D",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },

  actionsCard: {
    gap: spacing.md,
    width: "100%",
    backgroundColor: "rgba(24, 28, 36, 0.9)",
    padding: spacing.xl,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 4,
    marginTop: spacing.xl,
  },
  cardHeaderTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: spacing.xs,
    textAlign: "center",
  },
  btnRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: "100%",
  },
  btnIconLeft: { marginRight: spacing.sm },
  btnIconRight: { marginLeft: spacing.sm },
  btnPressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
  
  primaryBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: "#FF5E2B",
    shadowColor: "#FF5E2B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryBtnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
  
  secondaryBtn: {
    height: 52,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  secondaryBtnText: { color: "#FF8A3D", fontSize: 14, fontWeight: "700" },
  demoBtn: {
    height: 48,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },
  demoBtnText: { fontWeight: "700" },
  
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: spacing.xs,
    gap: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  dividerText: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600",
  },
  
  ghostBtn: {
    height: 50,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255, 94, 43, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(255, 94, 43, 0.2)",
  },
  ghostText: { color: "#FF8A3D", fontSize: 14, fontWeight: "700" },
  
  footerNote: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    marginTop: spacing.xl,
  },
});
