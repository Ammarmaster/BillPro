import { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, Switch, SafeAreaView, StatusBar, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/context/ThemeContext";
import { api } from "@/src/lib/api";
import { radius, spacing } from "@/src/theme";
import { useResponsive } from "@/src/hooks/useResponsive";
import FeatureLockModal from "@/src/components/FeatureLockModal";

export default function More() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { isDark, toggleTheme, theme } = useTheme();
  const { isDesktop } = useResponsive();
  const router = useRouter();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.surface }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.surface} />
      <View style={[styles.wrap, { backgroundColor: theme.surface }]} testID="more-screen">
        <ScrollView
          contentContainerStyle={{ 
            padding: spacing.lg, 
            paddingBottom: spacing.xxxl,
            maxWidth: isDesktop ? 800 : undefined,
            width: "100%",
            alignSelf: isDesktop ? "center" : undefined,
          }}
          showsVerticalScrollIndicator={false}
        >
          
          {/* User Profile Header Card matching Screenshot 1 */}
          <View style={[styles.userCard, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
            <View style={[styles.avatarCircle, { backgroundColor: isDark ? "#26294D" : "#EEF2FF" }]}>
              <Ionicons name="person" size={24} color="#635BFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.userName, { color: theme.onSurface }]}>{user?.full_name || "System Owner"}</Text>
              <Text style={[styles.userMeta, { color: theme.onSurfaceSecondary }]}>{user?.email || "owner@prodevopz.com"}</Text>
              <View style={[styles.rolePill, { backgroundColor: isDark ? "#26294D" : "#EEF2FF" }]}>
                <Text style={styles.rolePillText}>{(user?.role || "OWNER").toUpperCase()}</Text>
              </View>
            </View>
          </View>

          {/* Section 1: APPEARANCE matching Screenshot 1 */}
          <Text style={[styles.sectionTitle, { color: theme.onSurfaceSecondary }]}>APPEARANCE</Text>
          <View style={[styles.groupCard, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
            <View style={styles.rowItem}>
              <View style={[styles.iconBox, { backgroundColor: isDark ? "#26294D" : "#EEF2FF" }]}>
                <Ionicons name="sunny-outline" size={20} color="#635BFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: theme.onSurface }]}>Dark Mode</Text>
                <Text style={[styles.rowSub, { color: theme.onSurfaceSecondary }]}>Reduce eye strain in low light</Text>
              </View>
              <Switch
                value={isDark}
                onValueChange={toggleTheme}
                trackColor={{ false: "#E2E8F0", true: "#635BFF" }}
                thumbColor="#FFFFFF"
                testID="dark-mode-toggle"
              />
            </View>
          </View>

          {/* Section 2: MANAGEMENT matching Screenshot 1 */}
          <Text style={[styles.sectionTitle, { color: theme.onSurfaceSecondary }]}>MANAGEMENT</Text>
          <View style={[styles.groupCard, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
            
            {/* 1. Staff & Roles */}
            <Pressable style={styles.rowItem} onPress={() => router.push("/(app)/staff")} testID="manage-staff-btn">
              <View style={[styles.iconBox, { backgroundColor: isDark ? "#26294D" : "#EEF2FF" }]}>
                <Ionicons name="people" size={20} color="#635BFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: theme.onSurface }]}>Staff & Roles</Text>
                <Text style={[styles.rowSub, { color: theme.onSurfaceSecondary }]}>Add or remove waiters / managers</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.onSurfaceTertiary} />
            </Pressable>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            {/* 2. Menu Management */}
            <Pressable style={styles.rowItem} onPress={() => router.push("/(app)/menu")} testID="manage-menu-btn">
              <View style={[styles.iconBox, { backgroundColor: isDark ? "#26294D" : "#EEF2FF" }]}>
                <Ionicons name="restaurant" size={20} color="#635BFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: theme.onSurface }]}>Menu Management</Text>
                <Text style={[styles.rowSub, { color: theme.onSurfaceSecondary }]}>Categories, items, prices</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.onSurfaceTertiary} />
            </Pressable>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            {/* 3. Table Management */}
            <Pressable style={styles.rowItem} onPress={() => router.push("/(app)/tables")} testID="manage-tables-btn">
              <View style={[styles.iconBox, { backgroundColor: isDark ? "#26294D" : "#EEF2FF" }]}>
                <Ionicons name="tablet-portrait-outline" size={20} color="#635BFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: theme.onSurface }]}>Table Management</Text>
                <Text style={[styles.rowSub, { color: theme.onSurfaceSecondary }]}>Add, edit, delete tables</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.onSurfaceTertiary} />
            </Pressable>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            {/* 4. Settings */}
            <Pressable style={styles.rowItem} onPress={() => router.push("/(app)/settings-details")} testID="manage-settings-btn">
              <View style={[styles.iconBox, { backgroundColor: isDark ? "#26294D" : "#EEF2FF" }]}>
                <Ionicons name="settings" size={20} color="#635BFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: theme.onSurface }]}>Settings</Text>
                <Text style={[styles.rowSub, { color: theme.onSurfaceSecondary }]}>GST, UPI, printer, restaurant info</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.onSurfaceTertiary} />
            </Pressable>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            {/* 5. Subscription */}
            <Pressable style={styles.rowItem} onPress={() => router.push("/(app)/subscribe")} testID="manage-subscribe-btn">
              <View style={[styles.iconBox, { backgroundColor: isDark ? "#26294D" : "#EEF2FF" }]}>
                <Ionicons name="card" size={20} color="#635BFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: theme.onSurface }]}>Subscription</Text>
                <Text style={[styles.rowSub, { color: theme.onSurfaceSecondary }]}>Plan, billing, auto-pay</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.onSurfaceTertiary} />
            </Pressable>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            {/* 6. Bills History */}
            <Pressable style={styles.rowItem} onPress={() => router.push("/(app)/bills-history")} testID="manage-bills-history-btn">
              <View style={[styles.iconBox, { backgroundColor: isDark ? "#26294D" : "#EEF2FF" }]}>
                <Ionicons name="receipt" size={20} color="#635BFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: theme.onSurface }]}>Bills History</Text>
                <Text style={[styles.rowSub, { color: theme.onSurfaceSecondary }]}>All past bills</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.onSurfaceTertiary} />
            </Pressable>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            {/* 7. Printer Settings */}
            <Pressable style={styles.rowItem} onPress={() => router.push("/(app)/printer-settings")} testID="manage-printers-btn">
              <View style={[styles.iconBox, { backgroundColor: isDark ? "#26294D" : "#EEF2FF" }]}>
                <Ionicons name="print" size={20} color="#635BFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: theme.onSurface }]}>Printer Settings</Text>
                <Text style={[styles.rowSub, { color: theme.onSurfaceSecondary }]}>Setup Cashier and Kitchen thermal printers</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.onSurfaceTertiary} />
            </Pressable>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            {/* 8. Notifications */}
            <Pressable style={styles.rowItem} onPress={() => router.push("/(app)/notifications")} testID="manage-notifications-btn">
              <View style={[styles.iconBox, { backgroundColor: isDark ? "#26294D" : "#EEF2FF" }]}>
                <Ionicons name="notifications" size={20} color="#635BFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: theme.onSurface }]}>Notifications</Text>
                <Text style={[styles.rowSub, { color: theme.onSurfaceSecondary }]}>View logs, category filters, sound & quiet hour setup</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.onSurfaceTertiary} />
            </Pressable>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            {/* 9. Sales Analytics */}
            <Pressable 
              style={styles.rowItem} 
              onPress={() => {
                if (api.hasFeature("analytics") || api.hasFeature("advanced_reports")) {
                  router.push("/(app)/analytics");
                } else {
                  setShowUpgradeModal(true);
                }
              }} 
              testID="manage-analytics-btn"
            >
              <View style={[styles.iconBox, { backgroundColor: isDark ? "#26294D" : "#EEF2FF" }]}>
                <Ionicons name="bar-chart" size={20} color="#635BFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: theme.onSurface }]}>Sales Analytics</Text>
                <Text style={[styles.rowSub, { color: theme.onSurfaceSecondary }]}>7-day, monthly & yearly sales</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.onSurfaceTertiary} />
            </Pressable>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            {/* 10. Legal, Privacy & Compliance */}
            <Pressable style={styles.rowItem} onPress={() => router.push("/(app)/legal")} testID="manage-legal-btn">
              <View style={[styles.iconBox, { backgroundColor: isDark ? "#26294D" : "#EEF2FF" }]}>
                <Ionicons name="shield-checkmark" size={20} color="#635BFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: theme.onSurface }]}>Legal, Privacy & DPDP</Text>
                <Text style={[styles.rowSub, { color: theme.onSurfaceSecondary }]}>Terms, Privacy notice, data export & grievance</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.onSurfaceTertiary} />
            </Pressable>

          </View>

          {/* Sign Out Card Button matching Image */}
          <Pressable 
            style={[styles.signOutCard, { backgroundColor: isDark ? "#1C141E" : "#FEF2F2", borderColor: isDark ? "rgba(239,68,68,0.3)" : "#FECACA" }]} 
            onPress={logout} 
            testID="more-logout-btn"
          >
            <Ionicons name="exit-outline" size={22} color="#EF4444" />
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>

          {/* Footer App Version */}
          <Text style={[styles.footerText, { color: theme.onSurfaceSecondary }]}>EzBill Restaurant ERP · v2.1</Text>

        </ScrollView>
      </View>
      <FeatureLockModal
        visible={showUpgradeModal}
        title="Sales Analytics"
        description="Track daily, weekly, monthly and yearly restaurant performance with Growth."
        requiredPlan="Growth"
        onUpgrade={() => {
          setShowUpgradeModal(false);
          router.push("/(app)/subscribe");
        }}
        onCancel={() => setShowUpgradeModal(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: { flex: 1 },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    borderRadius: 20,
    marginBottom: spacing.md,
    gap: spacing.md,
    borderWidth: 1,
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  userName: { fontSize: 18, fontWeight: "800" },
  userMeta: { fontSize: 13, marginTop: 2, fontWeight: "500" },
  rolePill: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    marginTop: 6,
  },
  rolePillText: { color: "#635BFF", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },

  sectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 8,
    marginTop: 16,
    paddingLeft: spacing.xs,
  },
  groupCard: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    overflow: "hidden",
  },
  rowItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 12,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { fontSize: 15, fontWeight: "700" },
  rowSub: { fontSize: 12, marginTop: 2, fontWeight: "500" },
  divider: { height: 1, width: "100%" },

  signOutCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderWidth: 1,
    paddingVertical: 14,
    borderRadius: 20,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  signOutText: { color: "#EF4444", fontSize: 15, fontWeight: "800" },
  footerText: { textAlign: "center", fontSize: 12, fontWeight: "600", marginBottom: spacing.xl },
});
