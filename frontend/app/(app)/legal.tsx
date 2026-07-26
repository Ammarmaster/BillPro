import { useState } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView, Alert, ActivityIndicator, SafeAreaView, StatusBar,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/context/ThemeContext";
import { colors, spacing, radius } from "@/src/theme";

export default function Legal() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { logout } = useAuth();
  const { theme, isDark } = useTheme();
  const [busy, setBusy] = useState(false);

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account?",
      "This action is permanent. All your restaurant data, menu items, bills history, waiter profiles, and subscriptions will be deleted forever.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Yes, Delete",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await api.deleteAccount();
              await logout();
              router.replace("/");
            } catch (e: any) {
              Alert.alert("Error", e.message || "Failed to delete account.");
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.surface }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.surface} />
      <View style={styles.wrap} testID="legal-screen">
        
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.replace("/(app)/more")} testID="legal-back-btn" hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={theme.onSurface} />
          </Pressable>
          <Text style={[styles.title, { color: theme.onSurface }]}>Legal & Support</Text>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          
          {/* Privacy Policy Card */}
          <View style={[styles.card, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
            <View style={styles.cardHeader}>
              <Ionicons name="shield-checkmark" size={22} color={colors.brand} />
              <Text style={[styles.cardTitle, { color: theme.onSurface }]}>Privacy Policy</Text>
            </View>
            <Text style={[styles.cardBody, { color: theme.onSurfaceSecondary }]}>
              EzBill respects your privacy. We collect and store restaurant details, menu items, order lists, and billing metrics locally and securely in our cloud server to keep your POS synced in real-time across your staff's devices.{"\n\n"}
              We do not share your private business data, customer phone numbers, or transaction logs with third parties. Payments are securely processed through Razorpay, and we do not store credit card or bank credentials. For any privacy queries or data requests, contact us at contactprodevopz@gmail.com.
            </Text>
          </View>

          {/* Terms & Conditions Card */}
          <View style={[styles.card, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
            <View style={styles.cardHeader}>
              <Ionicons name="document-text" size={22} color={colors.brand} />
              <Text style={[styles.cardTitle, { color: theme.onSurface }]}>Terms of Service</Text>
            </View>
            <Text style={[styles.cardBody, { color: theme.onSurfaceSecondary }]}>
              By using EzBill, you agree to comply with our usage guidelines. You are responsible for ensuring that your employee credentials, waiter PINs, and transaction reports remain confidential.{"\n\n"}
              EzBill is provided "as is" without warranties of any kind. Subscription plans auto-renew according to the chosen monthly or yearly interval and can be managed or canceled in the Subscriptions settings tab. For terms violation or service inquiries, email contactprodevopz@gmail.com.
            </Text>
          </View>

          {/* Support Section */}
          <View style={[styles.card, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
            <View style={styles.cardHeader}>
              <Ionicons name="mail" size={22} color={colors.brand} />
              <Text style={[styles.cardTitle, { color: theme.onSurface }]}>Support & Contact</Text>
            </View>
            <Text style={[styles.cardBody, { color: theme.onSurfaceSecondary }]}>
              For customer support, technical assistance, bug reporting, or custom integrations:{"\n\n"}
              📧 Email: contactprodevopz@gmail.com
            </Text>
          </View>

          {/* Dangerous Zone - Account Deletion */}
          <View style={[styles.card, { backgroundColor: theme.surfaceSecondary, borderColor: "#EF444450" }]}>
            <View style={styles.cardHeader}>
              <Ionicons name="warning" size={22} color="#EF4444" />
              <Text style={[styles.cardTitle, { color: "#EF4444" }]}>Danger Zone</Text>
            </View>
            <Text style={[styles.cardBody, { color: theme.onSurfaceSecondary }]}>
              Permanently delete your account, restaurant setup, orders history, waiters profiles, categories, and subscription details. This action cannot be undone.
            </Text>
            <Pressable
              style={[styles.deleteBtn, busy && { opacity: 0.6 }]}
              onPress={handleDeleteAccount}
              disabled={busy}
              testID="delete-account-btn"
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.deleteBtnText}>Delete My Account & Data</Text>
              )}
            </Pressable>
          </View>

        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  title: { fontSize: 22, fontWeight: "700" },
  card: { padding: spacing.xl, borderRadius: radius.lg, borderWidth: 1, gap: spacing.md },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  cardTitle: { fontSize: 16, fontWeight: "800" },
  cardBody: { fontSize: 13, lineHeight: 20, fontWeight: "500" },
  deleteBtn: { backgroundColor: "#EF4444", paddingVertical: 14, borderRadius: radius.md, alignItems: "center", marginTop: spacing.xs },
  deleteBtnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 14 },
});
