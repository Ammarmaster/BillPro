import { useEffect } from "react";
import { Tabs, useRouter } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { colors } from "@/src/theme";

export default function AppLayout() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  const isAdmin = user.role === "super_admin";
  const isStaff = user.role === "waiter" || user.role === "kitchen";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.onSurfaceTertiary,
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 68,
          paddingBottom: 10,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 11, letterSpacing: 0.4 },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: isAdmin ? "Admin" : "Dashboard",
          tabBarIcon: ({ color, size }) => <Ionicons name={isAdmin ? "shield-checkmark" : "stats-chart"} size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          href: isAdmin ? null : undefined,
          title: "Menu",
          tabBarIcon: ({ color, size }) => <Ionicons name="book" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="waiter"
        options={{
          href: isAdmin ? null : undefined,
          title: "Waiter",
          tabBarIcon: ({ color, size }) => <Ionicons name="clipboard" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="kitchen"
        options={{
          href: isAdmin ? null : undefined,
          title: "Kitchen",
          tabBarIcon: ({ color, size }) => <Ionicons name="restaurant" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          href: isStaff ? null : undefined,
          title: isAdmin ? "Account" : "More",
          tabBarIcon: ({ color, size }) => <Ionicons name="settings" size={size} color={color} />,
        }}
      />
      <Tabs.Screen name="billing" options={{ href: null, title: "Billing" }} />
      <Tabs.Screen name="tables" options={{ href: null, title: "Tables" }} />
      <Tabs.Screen name="staff" options={{ href: null, title: "Waiters" }} />
      <Tabs.Screen name="admin-restaurants" options={{ href: null, title: "Restaurants" }} />
      <Tabs.Screen name="admin-users" options={{ href: null, title: "Users" }} />
      <Tabs.Screen name="admin-plans" options={{ href: null, title: "Plans" }} />
      <Tabs.Screen name="subscribe" options={{ href: null, title: "Subscription" }} />
    </Tabs>
  );
}
