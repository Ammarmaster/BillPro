import { useEffect } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Pressable, SafeAreaView, StatusBar, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { colors, spacing, radius } from "@/src/theme";

export default function Index() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace("/(app)/dashboard");
  }, [user, loading, router]);

  if (loading) {
    return (
      <View style={styles.center} testID="landing-loading">
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} testID="landing-screen">
      <StatusBar barStyle="dark-content" backgroundColor="#F8F9FD" />
      <View style={styles.bg}>
        
        {/* Modern Double Glow Mesh Overlay */}
        <View style={styles.glowContainer}>
          <LinearGradient
            colors={["rgba(99,91,255,0.15)", "rgba(79,70,229,0.05)", "transparent"]}
            style={styles.glowGradientLeft}
          />
          <LinearGradient
            colors={["rgba(59,130,246,0.12)", "rgba(59,130,246,0.02)", "transparent"]}
            style={styles.glowGradientRight}
          />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Brand & Hero Section */}
          <View style={styles.heroSection}>
            <View style={styles.logoBadgeOuter}>
              <LinearGradient
                colors={["#818CF8", "#635BFF", "#4F46E5"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.logoBadge}
              >
                <Ionicons name="receipt" size={36} color="#FFFFFF" />
              </LinearGradient>
            </View>

            <Text style={styles.brandTitle}>EzBill</Text>
            <Text style={styles.tagline}>Smart Billing. Simplified.</Text>

            <View style={styles.pillBadge}>
              <View style={styles.pillDot} />
              <Text style={styles.pillText}>ENTERPRISE POS SYSTEM</Text>
            </View>
          </View>

          {/* Action Buttons Glass Container */}
          <View style={styles.actionsCard}>
            <Text style={styles.cardHeaderTitle}>Portal Access</Text>
            
            <Pressable
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed]}
              testID="landing-login-btn"
              onPress={() => router.push("/login")}
            >
              <LinearGradient
                colors={["#635BFF", "#4F46E5"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.gradientBtnBg}
              >
                <View style={styles.btnRow}>
                  <Ionicons name="business" size={18} color="#FFFFFF" style={styles.btnIconLeft} />
                  <Text style={styles.primaryBtnText}>Business Owner Login</Text>
                  <Ionicons name="arrow-forward" size={16} color="#FFFFFF" style={styles.btnIconRight} />
                </View>
              </LinearGradient>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.secondaryBtn, pressed && styles.btnPressed]}
              testID="landing-staff-btn"
              onPress={() => router.push("/staff-login")}
            >
              <View style={styles.btnRow}>
                <Ionicons name="keypad" size={18} color={colors.brand} style={styles.btnIconLeft} />
                <Text style={styles.secondaryBtnText}>Staff PIN Login</Text>
              </View>
            </Pressable>

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
                <Ionicons name="person-add" size={16} color={colors.brand} style={styles.btnIconLeft} />
                <Text style={styles.ghostText}>Create Business Account</Text>
              </View>
            </Pressable>
          </View>

          {/* Footer Note */}
          <Text style={styles.footerNote}>Trusted by leading retail & restaurant businesses</Text>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F8F9FD" },
  bg: { flex: 1, backgroundColor: "#F8F9FD" },
  center: { flex: 1, backgroundColor: "#F8F9FD", justifyContent: "center", alignItems: "center" },
  glowContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 380,
    flexDirection: "row",
    overflow: "hidden"
  },
  glowGradientLeft: {
    width: "70%",
    height: "100%",
    borderBottomRightRadius: 150,
  },
  glowGradientRight: {
    width: "70%",
    height: "100%",
    borderBottomLeftRadius: 150,
    marginLeft: "-40%",
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
    marginBottom: spacing.xxl,
  },
  logoBadgeOuter: {
    padding: 6,
    borderRadius: radius.xl,
    backgroundColor: "rgba(99, 91, 255, 0.1)",
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 4,
    marginBottom: spacing.lg,
  },
  logoBadge: {
    width: 72,
    height: 72,
    borderRadius: radius.xl - 6,
    justifyContent: "center",
    alignItems: "center",
  },
  brandTitle: {
    fontSize: 40,
    fontWeight: "900",
    color: colors.onSurface,
    letterSpacing: -0.5,
  },
  tagline: {
    color: colors.brand,
    marginTop: 4,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  pillBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(99, 91, 255, 0.06)",
    borderColor: "rgba(99, 91, 255, 0.15)",
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: radius.pill,
    marginTop: spacing.lg,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.brand,
  },
  pillText: {
    color: colors.brand,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  actionsCard: {
    gap: spacing.md,
    width: "100%",
    backgroundColor: "#FFFFFF",
    padding: spacing.xl,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: "rgba(99, 91, 255, 0.1)",
    shadowColor: "rgba(99, 91, 255, 0.06)",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 3,
  },
  cardHeaderTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.onSurfaceSecondary,
    letterSpacing: 1,
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
    height: 54,
    borderRadius: radius.lg,
    overflow: "hidden",
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  gradientBtnBg: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  primaryBtnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15, letterSpacing: 0.3 },
  secondaryBtn: {
    height: 54,
    borderColor: "rgba(99, 91, 255, 0.2)",
    borderWidth: 1,
    borderRadius: radius.lg,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(99, 91, 255, 0.02)",
  },
  secondaryBtnText: { color: colors.brand, fontSize: 15, fontWeight: "700" },
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
    backgroundColor: "rgba(99, 91, 255, 0.1)",
  },
  dividerText: {
    color: colors.onSurfaceTertiary,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "lowercase",
  },
  ghostBtn: {
    height: 54,
    borderRadius: radius.lg,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(99, 91, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(99, 91, 255, 0.12)",
  },
  ghostText: { color: colors.brand, fontSize: 14, fontWeight: "700" },
  footerNote: {
    color: colors.onSurfaceTertiary,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    marginTop: spacing.xl,
  },
});
