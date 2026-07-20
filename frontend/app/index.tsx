import { useEffect } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Pressable, ImageBackground } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
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
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  return (
    <ImageBackground
      source={{ uri: "https://images.pexels.com/photos/6634140/pexels-photo-6634140.jpeg" }}
      style={styles.bg}
      testID="landing-screen"
    >
      <LinearGradient
        colors={["rgba(13,13,13,0.2)", "rgba(13,13,13,0.75)", colors.surface]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.content}>
        <View style={styles.top}>
          <Text style={styles.brand}>LUMINA</Text>
          <Text style={styles.tagline}>Restaurant Excellence, Redefined.</Text>
        </View>
        <View style={styles.actions}>
          <Pressable
            style={styles.primaryBtn}
            testID="landing-login-btn"
            onPress={() => router.push("/login")}
          >
            <Text style={styles.primaryBtnText}>Owner Sign In</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryBtn}
            testID="landing-staff-btn"
            onPress={() => router.push("/staff-login")}
          >
            <Text style={styles.secondaryBtnText}>Staff Sign In (PIN)</Text>
          </Pressable>
          <Pressable
            style={styles.ghostBtn}
            testID="landing-register-btn"
            onPress={() => router.push("/register")}
          >
            <Text style={styles.ghostText}>Create Restaurant Account</Text>
          </Pressable>
        </View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, backgroundColor: colors.surface, justifyContent: "center", alignItems: "center" },
  content: { flex: 1, justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingVertical: spacing.xxxl },
  top: { marginTop: spacing.xxxl * 1.5, alignItems: "center" },
  brand: { fontSize: 56, fontFamily: "serif", color: colors.brand, letterSpacing: 8 },
  tagline: { color: colors.onSurfaceSecondary, marginTop: spacing.md, fontSize: 14, letterSpacing: 1 },
  actions: { gap: spacing.md, marginBottom: spacing.xl },
  primaryBtn: {
    backgroundColor: colors.brand, paddingVertical: 16, borderRadius: radius.lg, alignItems: "center",
  },
  primaryBtnText: { color: colors.onBrand, fontWeight: "600", fontSize: 16, letterSpacing: 1 },
  secondaryBtn: {
    borderColor: colors.borderStrong, borderWidth: 1, paddingVertical: 16, borderRadius: radius.lg,
    alignItems: "center", backgroundColor: "rgba(255,255,255,0.04)",
  },
  secondaryBtnText: { color: colors.onSurface, fontSize: 16, letterSpacing: 1 },
  ghostBtn: { paddingVertical: 12, alignItems: "center" },
  ghostText: { color: colors.brand, fontSize: 13, letterSpacing: 0.5 },
});
