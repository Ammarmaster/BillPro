import { useEffect } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Pressable, SafeAreaView, StatusBar, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { spacing, radius } from "@/src/theme";

export default function Index() {
  const { user, loading } = useAuth();
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
    <SafeAreaView style={styles.safe} testID="landing-screen">
      <StatusBar barStyle="light-content" backgroundColor="#111111" />
      <ScrollView contentContainerStyle={styles.scrollContent} bounces={false} showsVerticalScrollIndicator={false}>
        
        {/* Brand Hero Section */}
        <View style={styles.heroSection}>
          <View style={styles.logoBox}>
            <Ionicons name="restaurant" size={44} color="#FFFFFF" />
          </View>
          <Text style={styles.brandTitle}>ProDevOpz ERP</Text>
          <Text style={styles.tagline}>Restaurant Management Platform</Text>

          <View style={styles.pillBadge}>
            <View style={styles.pillDot} />
            <Text style={styles.pillText}>ENTERPRISE POS & KOT SYSTEM</Text>
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
              <Text style={styles.primaryBtnText}>Business Owner Login</Text>
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
              <Ionicons name="person-add-outline" size={16} color="#FF5E2B" style={styles.btnIconLeft} />
              <Text style={styles.ghostText}>Create Business Account</Text>
            </View>
          </Pressable>
        </View>

        {/* Footer Note */}
        <Text style={styles.footerNote}>Trusted by leading retail & restaurant businesses</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#111111" },
  center: { flex: 1, backgroundColor: "#111111", justifyContent: "center", alignItems: "center" },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xxl,
  },
  heroSection: {
    alignItems: "center",
    marginTop: spacing.xxl,
  },
  logoBox: {
    width: 90,
    height: 90,
    borderRadius: 24,
    backgroundColor: "#FF5E2B",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.lg,
    shadowColor: "#FF5E2B",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 6,
  },
  brandTitle: {
    fontSize: 34,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  tagline: {
    color: "#64748B",
    marginTop: 6,
    fontSize: 14,
    fontWeight: "600",
  },
  pillBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255, 94, 43, 0.1)",
    borderColor: "rgba(255, 94, 43, 0.2)",
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: radius.pill,
    marginTop: spacing.xl,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FF5E2B",
  },
  pillText: {
    color: "#FF5E2B",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },

  actionsCard: {
    gap: spacing.md,
    width: "100%",
    backgroundColor: "#16161C",
    padding: spacing.xl,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#2E2E38",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
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
    height: 54,
    borderRadius: 14,
    backgroundColor: "#FF5E2B",
    shadowColor: "#FF5E2B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
  
  secondaryBtn: {
    height: 54,
    borderColor: "#2E2E38",
    borderWidth: 1,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1C1C21",
  },
  secondaryBtnText: { color: "#FF5E2B", fontSize: 15, fontWeight: "700" },
  
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
    backgroundColor: "#2E2E38",
  },
  dividerText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "600",
  },
  
  ghostBtn: {
    height: 54,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  ghostText: { color: "#FF5E2B", fontSize: 14, fontWeight: "700" },
  
  footerNote: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    marginTop: spacing.xl,
  },
});
