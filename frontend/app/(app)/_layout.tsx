import { useEffect, useState, useCallback } from "react";
import { Tabs, useRouter, usePathname } from "expo-router";
import { View, Text, ActivityIndicator, Platform, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/context/ThemeContext";
import { api } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/theme";
import { useResponsive } from "@/src/hooks/useResponsive";
import DesktopSidebar from "@/src/components/DesktopSidebar";

export default function AppLayout() {
  const insets = useSafeAreaInsets();
  const { user, loading, logout } = useAuth();
  const { theme, isDark } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const { isDesktop } = useResponsive();

  const [subStatus, setSubStatus] = useState<"active" | "expired" | "unknown">("active");
  const [checkingSub, setCheckingSub] = useState<boolean>(true);

  const checkSubscription = useCallback(async () => {
    if (!user) return;
    if (user.role === "super_admin" || user.role === "admin_employee") {
      setSubStatus("active");
      setCheckingSub(false);
      return;
    }
    try {
      const sub = await api.mySubscription();
      if (!sub || sub.status === "expired" || sub.status !== "active") {
        setSubStatus("expired");
        if ((user.role === "owner" || user.role === "manager") && !pathname?.includes("subscribe")) {
          router.replace("/(app)/subscribe");
        }
      } else {
        setSubStatus("active");
        if (!user.tenant_id && !pathname?.includes("onboarding")) {
          router.replace("/onboarding");
        }
      }
    } catch {
      if (user.role === "owner" || user.role === "manager") {
        setSubStatus("expired");
        if (!pathname?.includes("subscribe")) {
          router.replace("/(app)/subscribe");
        }
      }
    } finally {
      setCheckingSub(false);
    }
  }, [user, pathname, router]);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
    } else if (!loading && user) {
      checkSubscription();
    }
  }, [user, loading, checkSubscription]);

  if (loading || !user) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.surface, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color="#635BFF" />
      </View>
    );
  }

  const isAdmin = user.role === "super_admin" || user.role === "admin_employee";
  const isWaiter = user.role === "waiter";
  const isKitchen = user.role === "kitchen";
  const isStaff = isWaiter || isKitchen;

  // If staff member of an expired tenant, show the locked screen with Logout option
  if (!isAdmin && isStaff && subStatus === "expired") {
    return (
      <View style={{ flex: 1, backgroundColor: theme.surface, justifyContent: "center", alignItems: "center", padding: spacing.xl }}>
        <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: "#7F1D1D", justifyContent: "center", alignItems: "center", marginBottom: spacing.lg }}>
          <Ionicons name="lock-closed" size={38} color="#F87171" />
        </View>
        <Text style={{ color: theme.onSurface, fontSize: 22, fontWeight: "900", textAlign: "center" }}>
          Subscription Expired
        </Text>
        <Text style={{ color: theme.onSurfaceSecondary, fontSize: 14, textAlign: "center", marginTop: 8, lineHeight: 22, maxWidth: 320 }}>
          Your restaurant's EzBill subscription has ended. Please notify your restaurant owner or manager to renew the plan.
        </Text>
        
        <Pressable 
          style={{ marginTop: spacing.xl, backgroundColor: "#635BFF", paddingHorizontal: 24, paddingVertical: 14, borderRadius: radius.md, width: "100%", maxWidth: 280, alignItems: "center" }}
          onPress={checkSubscription}
          disabled={checkingSub}
        >
          {checkingSub ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 14 }}>Check Status Again</Text>
          )}
        </Pressable>

        <Pressable 
          style={{ marginTop: spacing.md, paddingVertical: 12 }}
          onPress={() => logout()}
        >
          <Text style={{ color: "#EF4444", fontWeight: "700", fontSize: 14 }}>Log Out</Text>
        </Pressable>
      </View>
    );
  }

  const bottomInset = Math.max(insets.bottom, Platform.OS === "android" ? 14 : 10);

  const tabsContent = (
    <Tabs
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#635BFF",
        tabBarInactiveTintColor: theme.onSurfaceTertiary,
        tabBarStyle: isDesktop
          ? { display: "none" }
          : {
              backgroundColor: theme.tabBarBg,
              borderTopColor: theme.border,
              borderTopWidth: 1,
              height: 60 + bottomInset,
              paddingBottom: bottomInset,
              paddingTop: 8,
              elevation: 0,
            },
        tabBarLabelStyle: { fontSize: 11, letterSpacing: 0.4, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          href: isStaff ? null : undefined,
          title: isAdmin ? "Admin" : "Dashboard",
          tabBarIcon: ({ color, size }) => <Ionicons name={isAdmin ? "shield-checkmark" : "grid-outline"} size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="waiter"
        options={{
          href: isAdmin ? null : undefined,
          title: "Tables",
          tabBarIcon: ({ color, size }) => <Ionicons name="tablet-portrait-outline" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="takeaway"
        options={{
          href: isAdmin ? null : undefined,
          title: "Takeaway",
          tabBarIcon: ({ color, size }) => <Ionicons name="bag-handle-outline" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="kitchen"
        options={{
          href: isAdmin ? null : undefined,
          title: "Kitchen",
          tabBarIcon: ({ color, size }) => <Ionicons name="restaurant-outline" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          href: isStaff ? null : undefined,
          title: isAdmin ? "Account" : "More",
          tabBarIcon: ({ color, size }) => <Ionicons name="ellipsis-horizontal-circle-outline" size={22} color={color} />,
        }}
      />
      <Tabs.Screen name="tables" options={{ href: null, title: "Tables" }} />
      <Tabs.Screen name="menu" options={{ href: null, title: "Menu" }} />
      <Tabs.Screen name="billing" options={{ href: null, title: "Billing" }} />
      <Tabs.Screen name="staff" options={{ href: null, title: "Waiters" }} />
      <Tabs.Screen name="bills-history" options={{ href: null, title: "Bills" }} />
      <Tabs.Screen name="analytics" options={{ href: null, title: "Analytics" }} />
      <Tabs.Screen name="settings-details" options={{ href: null, title: "Settings" }} />
      <Tabs.Screen name="admin-restaurants" options={{ href: null, title: "Restaurants" }} />
      <Tabs.Screen name="admin-payments" options={{ href: null, title: "Payments & Transactions" }} />
      <Tabs.Screen name="admin-users" options={{ href: null, title: "Users" }} />
      <Tabs.Screen name="admin-plans" options={{ href: null, title: "Plans" }} />
      <Tabs.Screen name="subscribe" options={{ href: null, title: "Subscription" }} />
      <Tabs.Screen name="legal" options={{ href: null, title: "Legal & Support" }} />
      <Tabs.Screen name="printer-settings" options={{ href: null, title: "Printer Settings" }} />
      <Tabs.Screen name="cash-closing" options={{ href: null, title: "Cash Closing & EOD" }} />
      <Tabs.Screen name="notifications" options={{ href: null, title: "Notifications" }} />
      <Tabs.Screen name="notification-preferences" options={{ href: null, title: "Notification Settings" }} />
      <Tabs.Screen name="menu-ai-import" options={{ href: null, title: "Scan Physical Menu" }} />
    </Tabs>
  );

  if (isDesktop) {
    return (
      <View style={{ flex: 1, flexDirection: "row", backgroundColor: theme.surface }}>
        <DesktopSidebar />
        <View style={{ flex: 1, height: "100%", overflow: "hidden" }}>
          {tabsContent}
        </View>
      </View>
    );
  }

  return tabsContent;
}
