import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Platform } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/context/ThemeContext";
import { useNotifications } from "@/src/context/NotificationContext";
import { spacing, radius } from "@/src/theme";

interface NavItem {
  name: string;
  route: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
  badge?: number;
}

export default function DesktopSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { theme, isDark, toggleTheme } = useTheme();
  const { unreadCount } = useNotifications();

  if (!user) return null;

  const isAdmin = user.role === "super_admin" || user.role === "admin_employee";
  const isWaiter = user.role === "waiter";
  const isKitchen = user.role === "kitchen";
  const isOwnerOrManager = user.role === "owner" || user.role === "manager";

  // Build categorized nav items based on role
  const operationsNav: NavItem[] = [];
  const managementNav: NavItem[] = [];
  const adminNav: NavItem[] = [];
  const systemNav: NavItem[] = [];

  if (isAdmin) {
    adminNav.push(
      { name: "Overview", route: "/(app)/dashboard", icon: "grid-outline", iconActive: "grid" },
      { name: "Payments & Txns", route: "/(app)/admin-payments", icon: "cash-outline", iconActive: "cash" },
      { name: "Restaurants", route: "/(app)/admin-restaurants", icon: "business-outline", iconActive: "business" },
      { name: "Users & Staff", route: "/(app)/admin-users", icon: "people-outline", iconActive: "people" },
      { name: "Subscription Plans", route: "/(app)/admin-plans", icon: "card-outline", iconActive: "card" }
    );
  } else if (isKitchen) {
    operationsNav.push(
      { name: "Kitchen KDS", route: "/(app)/kitchen", icon: "restaurant-outline", iconActive: "restaurant" }
    );
  } else if (isWaiter) {
    operationsNav.push(
      { name: "Tables / POS", route: "/(app)/waiter", icon: "tablet-portrait-outline", iconActive: "tablet-portrait" },
      { name: "Takeaway", route: "/(app)/takeaway", icon: "bag-handle-outline", iconActive: "bag-handle" },
      { name: "Kitchen KDS", route: "/(app)/kitchen", icon: "restaurant-outline", iconActive: "restaurant" },
      { name: "Cash Closing", route: "/(app)/cash-closing", icon: "wallet-outline", iconActive: "wallet" }
    );
  } else {
    // Owner / Manager
    operationsNav.push(
      { name: "Dashboard", route: "/(app)/dashboard", icon: "grid-outline", iconActive: "grid" },
      { name: "Tables / POS", route: "/(app)/waiter", icon: "tablet-portrait-outline", iconActive: "tablet-portrait" },
      { name: "Takeaway", route: "/(app)/takeaway", icon: "bag-handle-outline", iconActive: "bag-handle" },
      { name: "Kitchen KDS", route: "/(app)/kitchen", icon: "restaurant-outline", iconActive: "restaurant" },
      { name: "Billing Register", route: "/(app)/billing", icon: "receipt-outline", iconActive: "receipt" },
      { name: "Bills History", route: "/(app)/bills-history", icon: "file-tray-full-outline", iconActive: "file-tray-full" },
      { name: "Cash Closing & EOD", route: "/(app)/cash-closing", icon: "wallet-outline", iconActive: "wallet" }
    );

    managementNav.push(
      { name: "Menu Catalog", route: "/(app)/menu", icon: "fast-food-outline", iconActive: "fast-food" },
      { name: "Table Setup", route: "/(app)/tables", icon: "grid-outline", iconActive: "grid" },
      { name: "Waiters & Staff", route: "/(app)/staff", icon: "people-outline", iconActive: "people" },
      { name: "Sales Analytics", route: "/(app)/analytics", icon: "bar-chart-outline", iconActive: "bar-chart" },
      { name: "AI Menu Scanner", route: "/(app)/menu-ai-import", icon: "sparkles-outline", iconActive: "sparkles" },
      { name: "Status Poster AI", route: "/(app)/promo-poster", icon: "megaphone-outline", iconActive: "megaphone" }
    );

    systemNav.push(
      { name: "Subscription", route: "/(app)/subscribe", icon: "card-outline", iconActive: "card" },
      { name: "Printer Setup", route: "/(app)/printer-settings", icon: "print-outline", iconActive: "print" },
      { name: "Settings", route: "/(app)/settings-details", icon: "settings-outline", iconActive: "settings" }
    );
  }

  // Common notifications & legal
  systemNav.push(
    { name: "Notifications", route: "/(app)/notifications", icon: "notifications-outline", iconActive: "notifications", badge: unreadCount },
    { name: "Legal & Support", route: "/(app)/legal", icon: "shield-checkmark-outline", iconActive: "shield-checkmark" }
  );

  const isActive = (route: string) => {
    if (!pathname) return false;
    if (route === "/(app)/dashboard") {
      return pathname === "/(app)/dashboard" || pathname === "/" || pathname === "/dashboard";
    }
    return pathname.includes(route.replace("/(app)/", ""));
  };

  const renderNavGroup = (title: string, items: NavItem[]) => {
    if (items.length === 0) return null;
    return (
      <View style={styles.navGroup}>
        <Text style={[styles.navGroupTitle, { color: theme.onSurfaceTertiary }]}>{title}</Text>
        {items.map((item) => {
          const active = isActive(item.route);
          return (
            <Pressable
              key={item.route}
              onPress={() => router.push(item.route as any)}
              style={({ hovered }: any) => [
                styles.navItem,
                {
                  backgroundColor: active
                    ? (isDark ? "rgba(99, 91, 255, 0.16)" : "rgba(99, 91, 255, 0.10)")
                    : (hovered ? (isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.04)") : "transparent"),
                  borderColor: active ? "#635BFF" : "transparent",
                },
              ]}
            >
              <Ionicons
                name={active ? item.iconActive : item.icon}
                size={18}
                color={active ? "#635BFF" : theme.onSurfaceSecondary}
                style={styles.navIcon}
              />
              <Text
                style={[
                  styles.navText,
                  {
                    color: active ? (isDark ? "#FFFFFF" : "#635BFF") : theme.onSurface,
                    fontWeight: active ? "700" : "500",
                  },
                ]}
                numberOfLines={1}
              >
                {item.name}
              </Text>
              {item.badge !== undefined && item.badge > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.badge > 99 ? "99+" : item.badge}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    );
  };

  const roleLabel = isAdmin
    ? "Super Admin"
    : user.role === "owner"
    ? "Restaurant Owner"
    : user.role === "manager"
    ? "Manager"
    : user.role === "waiter"
    ? "Waiter"
    : user.role === "kitchen"
    ? "Kitchen Chef"
    : "Staff";

  return (
    <View
      style={[
        styles.sidebar,
        {
          backgroundColor: isDark ? "#121216" : "#FFFFFF",
          borderRightColor: theme.border,
        },
      ]}
    >
      {/* Brand Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <View style={styles.logoContainer}>
          <View style={styles.logoBadge}>
            <Ionicons name="restaurant" size={18} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.brandTitle, { color: theme.onSurface }]}>EzBill ERP</Text>
            <Text style={[styles.brandSubtitle, { color: theme.onSurfaceSecondary }]}>Windows Web Pro</Text>
          </View>
        </View>

        {/* User Card */}
        <View style={[styles.userBadge, { backgroundColor: isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.03)", borderColor: theme.border }]}>
          <View style={styles.userAvatar}>
            <Text style={styles.avatarText}>{(user.full_name || user.email || "U").charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={[styles.userName, { color: theme.onSurface }]} numberOfLines={1}>
              {user.full_name || user.email?.split("@")[0]}
            </Text>
            <Text style={[styles.userRole, { color: "#635BFF" }]}>{roleLabel}</Text>
          </View>
        </View>
      </View>

      {/* Navigation Links */}
      <ScrollView
        style={styles.scrollNav}
        contentContainerStyle={styles.scrollNavContent}
        showsVerticalScrollIndicator={false}
      >
        {isAdmin && renderNavGroup("ADMINISTRATION", adminNav)}
        {!isAdmin && renderNavGroup("OPERATIONS", operationsNav)}
        {!isAdmin && isOwnerOrManager && renderNavGroup("CATALOG & REPORTS", managementNav)}
        {renderNavGroup("SYSTEM & TOOLS", systemNav)}
      </ScrollView>

      {/* Footer Controls */}
      <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: isDark ? "#0E0E12" : "#F8FAFC" }]}>
        {/* Dark/Light mode toggle */}
        <Pressable
          onPress={toggleTheme}
          style={({ hovered }: any) => [
            styles.footerBtn,
            { backgroundColor: hovered ? (isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.05)") : "transparent" },
          ]}
        >
          <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={18} color={theme.onSurfaceSecondary} />
          <Text style={[styles.footerBtnText, { color: theme.onSurfaceSecondary }]}>
            {isDark ? "Light Mode" : "Dark Mode"}
          </Text>
        </Pressable>

        {/* Logout */}
        <Pressable
          onPress={() => logout()}
          style={({ hovered }: any) => [
            styles.footerBtn,
            { backgroundColor: hovered ? "rgba(239, 68, 68, 0.08)" : "transparent" },
          ]}
        >
          <Ionicons name="log-out-outline" size={18} color="#EF4444" />
          <Text style={[styles.footerBtnText, { color: "#EF4444", fontWeight: "600" }]}>Log Out</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 250,
    height: "100%",
    borderRightWidth: 1,
    flexDirection: "column",
    zIndex: 100,
  },
  header: {
    padding: spacing.md,
    borderBottomWidth: 1,
  },
  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  logoBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#635BFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  brandSubtitle: {
    fontSize: 11,
    fontWeight: "500",
  },
  userBadge: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: 4,
  },
  userAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#635BFF",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 12,
  },
  userName: {
    fontSize: 12,
    fontWeight: "700",
  },
  userRole: {
    fontSize: 10,
    fontWeight: "600",
  },
  scrollNav: {
    flex: 1,
  },
  scrollNavContent: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  navGroup: {
    marginBottom: spacing.md,
  },
  navGroupTitle: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    marginBottom: 2,
    borderLeftWidth: 3,
  },
  navIcon: {
    marginRight: 10,
  },
  navText: {
    fontSize: 13,
    flex: 1,
  },
  badge: {
    backgroundColor: "#EF4444",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 18,
    alignItems: "center",
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },
  footer: {
    padding: spacing.sm,
    borderTopWidth: 1,
    gap: 2,
  },
  footerBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
  },
  footerBtnText: {
    fontSize: 12,
    fontWeight: "500",
    marginLeft: 10,
  },
});
