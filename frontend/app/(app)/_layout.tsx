import { useEffect, useState, useCallback } from "react";
import { Tabs, useRouter, usePathname } from "expo-router";
import { View, Text, ActivityIndicator, Platform, Pressable, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/context/ThemeContext";
import { api, onSubscriptionNeeded, setPlanLocked } from "@/src/lib/api";

// Screens that take orders, make or print bills, handle cash, print, or use paid AI.
// Owners without a plan can open every other screen to look around and set up.
const PAID_SCREENS = new Set([
  "waiter", "takeaway", "kitchen", "billing", "bills-history", "cash-closing",
  "printer-settings", "menu-ai-import", "promo-poster",
]);
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

  // "unknown" until the plan is checked, so billing screens never open before that
  const [subStatus, setSubStatus] = useState<"active" | "expired" | "unknown">("unknown");
  const [checkingSub, setCheckingSub] = useState<boolean>(true);
  const [needPlan, setNeedPlan] = useState(false);

  // Shown when an owner without a plan tries to take an order or make a bill
  useEffect(() => onSubscriptionNeeded(() => {
    setSubStatus("expired");
    setNeedPlan(true);
  }), []);

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
        // Owners and managers can still look around and set up (menu, tables, settings).
        // Taking orders and making bills needs a plan: the server refuses them and the popup below asks to subscribe.
        setSubStatus("expired");
      } else {
        setSubStatus("active");
        if (!user.tenant_id && !pathname?.includes("onboarding")) {
          router.replace("/onboarding");
        }
      }
    } catch {
      // No internet and nothing saved on this device: keep billing working instead of locking the restaurant out
      setSubStatus(prev => (prev === "unknown" ? "active" : prev));
    } finally {
      setCheckingSub(false);
    }
  }, [user, pathname, router]);

  useEffect(() => {
    if (!loading && !user) {
      if (Platform.OS !== "web") {
        router.replace("/login");
      } else {
        router.replace("/");
      }
    } else if (!loading && user) {
      checkSubscription();
    }
  }, [user, loading, checkSubscription]);

  const ownerOrManager = user?.role === "owner" || user?.role === "manager";
  useEffect(() => {
    setPlanLocked(ownerOrManager && subStatus === "expired");
  }, [ownerOrManager, subStatus]);

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
      <Tabs.Screen name="promo-poster" options={{ href: null, title: "Status Poster AI" }} />
    </Tabs>
  );

  const needPlanPopup = (
    <Modal visible={needPlan} transparent animationType="fade" onRequestClose={() => setNeedPlan(false)}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "center", alignItems: "center", padding: 16 }}>
        <View style={{ width: "100%", maxWidth: 400, backgroundColor: theme.surfaceSecondary, borderColor: theme.border, borderWidth: 1, borderRadius: 24, padding: 24, alignItems: "center" }}>
          <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: isDark ? "rgba(99,91,255,0.16)" : "#EEF2FF", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="rocket-outline" size={30} color="#635BFF" />
          </View>
          <Text style={{ color: theme.onSurface, fontSize: 21, fontWeight: "900", textAlign: "center", marginTop: 14 }}>
            Subscribe to start billing
          </Text>
          <Text style={{ color: theme.onSurfaceSecondary, fontSize: 14, textAlign: "center", marginTop: 6, lineHeight: 21 }}>
            You can look around and set up your menu, tables and settings for free. Taking orders and making bills for real customers needs a plan, from ₹299/month.
          </Text>
          <Pressable
            onPress={() => { setNeedPlan(false); router.push("/(app)/subscribe"); }}
            style={({ pressed }) => [{ marginTop: 20, width: "100%", backgroundColor: "#635BFF", paddingVertical: 15, borderRadius: radius.lg, alignItems: "center" }, pressed && { opacity: 0.88 }]}
            testID="need-plan-subscribe"
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 16 }}>Subscribe Now</Text>
          </Pressable>
          <Pressable onPress={() => setNeedPlan(false)} style={{ marginTop: 12, padding: 4 }}>
            <Text style={{ color: theme.onSurfaceSecondary, fontWeight: "700", fontSize: 13 }}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );

  // Billing screens are covered for an owner/manager until an active plan is confirmed
  const currentScreen = (pathname || "").split("/").filter(p => p && p !== "(app)")[0] || "";
  const coverScreen = ownerOrManager && PAID_SCREENS.has(currentScreen) && subStatus !== "active";
  const tabBarHeight = isDesktop ? 0 : 60 + bottomInset;
  const lockCover = coverScreen ? (
    <View
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: tabBarHeight, backgroundColor: theme.surface, justifyContent: "center", alignItems: "center", padding: spacing.xl, zIndex: 50 }}
      testID="plan-lock-cover"
    >
      {subStatus === "unknown" ? (
        <ActivityIndicator color="#635BFF" />
      ) : (
        <View style={{ width: "100%", maxWidth: 420, alignItems: "center", paddingTop: insets.top }}>
          <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: isDark ? "rgba(99,91,255,0.16)" : "#EEF2FF", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="lock-closed" size={32} color="#635BFF" />
          </View>
          <Text style={{ color: theme.onSurface, fontSize: 22, fontWeight: "900", textAlign: "center", marginTop: spacing.lg }}>
            Subscribe to unlock billing
          </Text>
          <Text style={{ color: theme.onSurfaceSecondary, fontSize: 14, textAlign: "center", marginTop: 8, lineHeight: 21 }}>
            Taking orders, making and printing bills, the kitchen screen and cash closing need a plan. Your menu, tables and settings are free to set up now.
          </Text>
          <Pressable
            onPress={() => router.push("/(app)/subscribe")}
            style={({ pressed }) => [{ marginTop: spacing.xl, width: "100%", backgroundColor: "#635BFF", paddingVertical: 15, borderRadius: radius.lg, alignItems: "center" }, pressed && { opacity: 0.88 }]}
            testID="plan-lock-subscribe"
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 16 }}>Subscribe · from ₹299/month</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/demo-billing")}
            style={({ pressed }) => [{ marginTop: spacing.md, width: "100%", borderWidth: 1.5, borderColor: "#635BFF", paddingVertical: 13, borderRadius: radius.lg, alignItems: "center" }, pressed && { opacity: 0.85 }]}
          >
            <Text style={{ color: "#635BFF", fontWeight: "800", fontSize: 14 }}>Try billing in the demo</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/(app)/dashboard")} style={{ marginTop: spacing.md, padding: 6 }}>
            <Text style={{ color: theme.onSurfaceSecondary, fontWeight: "700", fontSize: 13 }}>Back to Dashboard</Text>
          </Pressable>
        </View>
      )}
    </View>
  ) : null;

  if (isDesktop) {
    return (
      <View style={{ flex: 1, flexDirection: "row", backgroundColor: theme.surface }}>
        <DesktopSidebar />
        <View style={{ flex: 1, height: "100%", overflow: "hidden" }}>
          {tabsContent}
          {lockCover}
        </View>
        {needPlanPopup}
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {tabsContent}
      {lockCover}
      {needPlanPopup}
    </View>
  );
}
