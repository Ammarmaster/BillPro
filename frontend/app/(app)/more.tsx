import {
  View, Text, StyleSheet, ScrollView, Pressable, Switch, SafeAreaView, StatusBar,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/context/ThemeContext";
import { radius, spacing } from "@/src/theme";

export default function More() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { isDark, toggleTheme, theme } = useTheme();
  const router = useRouter();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.surface }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.surface} />
      <View style={[styles.wrap, { backgroundColor: theme.surface }]} testID="more-screen">
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
          showsVerticalScrollIndicator={false}
        >
          
          {/* User Profile Header Card */}
          <View style={[styles.userCard, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
            <View style={styles.avatarCircle}>
              <Ionicons name="person" size={24} color="#635BFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.userName, { color: theme.onSurface }]}>{user?.full_name || "System Owner"}</Text>
              <Text style={[styles.userMeta, { color: theme.onSurfaceSecondary }]}>{user?.email || "owner@prodevopz.com"}</Text>
              <View style={styles.rolePill}>
                <Text style={styles.rolePillText}>{(user?.role || "OWNER").toUpperCase()}</Text>
              </View>
            </View>
          </View>

          {/* Section 1: APPEARANCE matching Image */}
          <Text style={[styles.sectionTitle, { color: theme.onSurfaceSecondary }]}>APPEARANCE</Text>
          <View style={[styles.groupCard, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
            <View style={styles.rowItem}>
              <View style={styles.iconBox}>
                <Ionicons name="moon" size={20} color="#635BFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: theme.onSurface }]}>Dark Mode</Text>
                <Text style={[styles.rowSub, { color: theme.onSurfaceSecondary }]}>Reduce eye strain in low light</Text>
              </View>
              <Switch
                value={isDark}
                onValueChange={toggleTheme}
                trackColor={{ false: "#CBD5E1", true: "#635BFF" }}
                thumbColor="#FFFFFF"
                testID="dark-mode-toggle"
              />
            </View>
          </View>

          {/* Section 2: MANAGEMENT matching Image */}
          <Text style={[styles.sectionTitle, { color: theme.onSurfaceSecondary }]}>MANAGEMENT</Text>
          <View style={[styles.groupCard, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
            
            {/* Staff & Roles */}
            <Pressable style={styles.rowItem} onPress={() => router.push("/(app)/staff")} testID="manage-staff-btn">
              <View style={styles.iconBox}>
                <Ionicons name="people" size={20} color="#635BFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: theme.onSurface }]}>Staff & Roles</Text>
                <Text style={[styles.rowSub, { color: theme.onSurfaceSecondary }]}>Add or remove waiters / managers</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.onSurfaceSecondary} />
            </Pressable>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            {/* Menu Management */}
            <Pressable style={styles.rowItem} onPress={() => router.push("/(app)/menu")} testID="manage-menu-btn">
              <View style={styles.iconBox}>
                <Ionicons name="restaurant" size={20} color="#635BFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: theme.onSurface }]}>Menu Management</Text>
                <Text style={[styles.rowSub, { color: theme.onSurfaceSecondary }]}>Categories, items, prices</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.onSurfaceSecondary} />
            </Pressable>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            {/* Table Management */}
            <Pressable style={styles.rowItem} onPress={() => router.push("/(app)/tables")} testID="manage-tables-btn">
              <View style={styles.iconBox}>
                <Ionicons name="hardware-chip-outline" size={20} color="#635BFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: theme.onSurface }]}>Table Management</Text>
                <Text style={[styles.rowSub, { color: theme.onSurfaceSecondary }]}>Add, edit, delete tables</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.onSurfaceSecondary} />
            </Pressable>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            {/* Settings (Opens Separate Page!) */}
            <Pressable style={styles.rowItem} onPress={() => router.push("/(app)/settings-details")} testID="manage-settings-btn">
              <View style={styles.iconBox}>
                <Ionicons name="settings" size={20} color="#635BFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: theme.onSurface }]}>Settings</Text>
                <Text style={[styles.rowSub, { color: theme.onSurfaceSecondary }]}>GST, UPI, printer, restaurant info</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.onSurfaceSecondary} />
            </Pressable>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            {/* Printer Settings */}
            <Pressable style={styles.rowItem} onPress={() => router.push("/(app)/printer-settings")} testID="manage-printers-btn">
              <View style={styles.iconBox}>
                <Ionicons name="print" size={20} color="#635BFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: theme.onSurface }]}>Printer Settings</Text>
                <Text style={[styles.rowSub, { color: theme.onSurfaceSecondary }]}>Setup Cashier and Kitchen thermal printers</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.onSurfaceSecondary} />
            </Pressable>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            {/* Notifications */}
            <Pressable style={styles.rowItem} onPress={() => router.push("/(app)/notifications")} testID="manage-notifications-btn">
              <View style={styles.iconBox}>
                <Ionicons name="notifications" size={20} color="#635BFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: theme.onSurface }]}>Notifications</Text>
                <Text style={[styles.rowSub, { color: theme.onSurfaceSecondary }]}>View logs, category filters, sound & quiet hour setup</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.onSurfaceSecondary} />
            </Pressable>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            {/* Subscription */}
            <Pressable style={styles.rowItem} onPress={() => router.push("/(app)/subscribe")} testID="manage-subscribe-btn">
              <View style={styles.iconBox}>
                <Ionicons name="subtitles" size={20} color="#635BFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: theme.onSurface }]}>Subscription</Text>
                <Text style={[styles.rowSub, { color: theme.onSurfaceSecondary }]}>Plan, billing, auto-pay</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.onSurfaceSecondary} />
            </Pressable>
            {/* Legal & Support */}
            <Pressable style={styles.rowItem} onPress={() => router.push("/(app)/legal")} testID="manage-legal-btn">
              <View style={styles.iconBox}>
                <Ionicons name="document-text" size={20} color="#635BFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: theme.onSurface }]}>Legal & Support</Text>
                <Text style={[styles.rowSub, { color: theme.onSurfaceSecondary }]}>Privacy Policy, Terms & Data deletion</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.onSurfaceSecondary} />
            </Pressable>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            {/* Bills History */}
            <Pressable style={styles.rowItem} onPress={() => router.push("/(app)/bills-history")} testID="manage-bills-history-btn">
              <View style={styles.iconBox}>
                <Ionicons name="receipt" size={20} color="#635BFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: theme.onSurface }]}>Bills History</Text>
                <Text style={[styles.rowSub, { color: theme.onSurfaceSecondary }]}>All past bills</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.onSurfaceSecondary} />
            </Pressable>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            {/* Sales Analytics */}
            <Pressable style={styles.rowItem} onPress={() => router.push("/(app)/analytics")} testID="manage-analytics-btn">
              <View style={styles.iconBox}>
                <Ionicons name="bar-chart" size={20} color="#635BFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: theme.onSurface }]}>Sales Analytics</Text>
                <Text style={[styles.rowSub, { color: theme.onSurfaceSecondary }]}>7-day, monthly & yearly sales</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.onSurfaceSecondary} />
            </Pressable>

          </View>

          {/* Sign Out Card Button matching Image */}
          <Pressable style={styles.signOutCard} onPress={logout} testID="more-logout-btn">
            <Ionicons name="exit-outline" size={22} color="#EF4444" />
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>

          {/* Footer App Version */}
          <Text style={[styles.footerText, { color: theme.onSurfaceSecondary }]}>EzBill Restaurant ERP · v2.1</Text>

        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: { flex: 1 },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.xl,
    borderRadius: 28,
    marginBottom: spacing.xl,
    gap: spacing.lg,
    borderWidth: 1,
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#26294D",
    alignItems: "center",
    justifyContent: "center",
  },
  userName: { fontSize: 20, fontWeight: "900" },
  userMeta: { fontSize: 13, marginTop: 2, fontWeight: "500" },
  rolePill: {
    alignSelf: "flex-start",
    backgroundColor: "#26294D",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    marginTop: 6,
  },
  rolePillText: { color: "#635BFF", fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },

  sectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
    marginTop: spacing.md,
    paddingLeft: spacing.xs,
  },
  groupCard: {
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    overflow: "hidden",
  },
  rowItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: "#26294D",
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { fontSize: 16, fontWeight: "800" },
  rowSub: { fontSize: 12, marginTop: 2, fontWeight: "500" },
  divider: { height: 1, width: "100%" },

  signOutCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: "#1C141E",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.3)",
    paddingVertical: 18,
    borderRadius: 28,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  signOutText: { color: "#EF4444", fontSize: 16, fontWeight: "900" },
  footerText: { textAlign: "center", fontSize: 12, fontWeight: "600", marginBottom: spacing.xl },
});
