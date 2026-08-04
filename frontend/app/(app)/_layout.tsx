import { useEffect } from "react";
import { Tabs, useRouter, usePathname } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/context/ThemeContext";
import { api } from "@/src/lib/api";
import { colors } from "@/src/theme";

export default function AppLayout() {
  const { user, loading } = useAuth();
  const { theme, isDark } = useTheme();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
    } else if (!loading && user && user.role === "owner") {
      if (pathname && pathname.includes("subscribe")) {
        return;
      }
      api.mySubscription().then(sub => {
        if (!sub) {
          router.replace("/demo-billing");
        } else if (sub.status === "expired" || sub.status !== "active") {
          router.replace("/(app)/subscribe");
        } else if (!user.tenant_id) {
          router.replace("/onboarding");
        }
      }).catch(() => {
        router.replace("/(app)/subscribe");
      });
    }
  }, [user, loading, router, pathname]);

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

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#635BFF",
        tabBarInactiveTintColor: theme.onSurfaceTertiary,
        tabBarStyle: {
          backgroundColor: theme.tabBarBg,
          borderTopColor: theme.border,
          borderTopWidth: 1,
          height: 72,
          paddingBottom: 10,
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
          tabBarIcon: ({ color, size }) => <Ionicons name={isAdmin ? "shield-checkmark" : "stats-chart"} size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="waiter"
        options={{
          href: isAdmin ? null : undefined,
          title: "Waiter",
          tabBarIcon: ({ color, size }) => <Ionicons name="clipboard-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="takeaway"
        options={{
          href: isAdmin ? null : undefined,
          title: "Takeaway",
          tabBarIcon: ({ color, size }) => <Ionicons name="bag-handle-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="kitchen"
        options={{
          href: isAdmin ? null : undefined,
          title: "Kitchen",
          tabBarIcon: ({ color, size }) => <Ionicons name="restaurant-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          href: isStaff ? null : undefined,
          title: isAdmin ? "Account" : "More",
          tabBarIcon: ({ color, size }) => <Ionicons name="ellipsis-horizontal-circle-outline" size={size} color={color} />,
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
      <Tabs.Screen name="admin-users" options={{ href: null, title: "Users" }} />
      <Tabs.Screen name="admin-plans" options={{ href: null, title: "Plans" }} />
      <Tabs.Screen name="subscribe" options={{ href: null, title: "Subscription" }} />
      <Tabs.Screen name="legal" options={{ href: null, title: "Legal & Support" }} />
      <Tabs.Screen name="printer-settings" options={{ href: null, title: "Printer Settings" }} />
      <Tabs.Screen name="notifications" options={{ href: null, title: "Notifications" }} />
      <Tabs.Screen name="notification-preferences" options={{ href: null, title: "Notification Settings" }} />
    </Tabs>
  );
}
