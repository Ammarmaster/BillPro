import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/context/AuthContext";
import { colors, spacing, radius } from "@/src/theme";

export default function Dashboard() {
  const { user } = useAuth();
  return user?.role === "super_admin" ? <AdminConsole /> : <OwnerDashboard />;
}

function AdminConsole() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [summary, setSummary] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try { setSummary(await api.adminSummary()); }
    catch (e: any) { setErr(e.message); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]} testID="admin-console">
      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl }}
        refreshControl={<RefreshControl tintColor={colors.brand} refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <Text style={styles.greet}>SUPER ADMIN</Text>
        <Text style={styles.name}>Admin Console</Text>

        <View style={styles.metricsRow}>
          <Metric label="Restaurants" value={`${summary?.total_restaurants ?? 0}`} testID="admin-metric-restaurants" />
          <Metric label="Users" value={`${summary?.total_users ?? 0}`} testID="admin-metric-users" />
        </View>
        <View style={styles.metricsRow}>
          <Metric label="Active Subs" value={`${summary?.active_subscriptions ?? 0}`} testID="admin-metric-subs" />
          <Metric label="MRR" value={`₹${summary?.mrr ?? 0}`} testID="admin-metric-mrr" />
        </View>
        <View style={styles.metricsRow}>
          <Metric label="Owners" value={`${summary?.total_owners ?? 0}`} testID="admin-metric-owners" />
          <Metric label="ARR" value={`₹${summary?.arr ?? 0}`} testID="admin-metric-arr" />
        </View>

        <Text style={styles.section}>Manage</Text>
        <NavRow icon="storefront" label="Restaurants" onPress={() => router.push("/(app)/admin-restaurants")} testID="nav-admin-restaurants" />
        <NavRow icon="people" label="Users & Passwords" onPress={() => router.push("/(app)/admin-users")} testID="nav-admin-users" />
        <NavRow icon="pricetags" label="Subscription Plans" onPress={() => router.push("/(app)/admin-plans")} testID="nav-admin-plans" />

        {err && <Text style={styles.err} testID="admin-error">{err}</Text>}
      </ScrollView>
    </View>
  );
}

function OwnerDashboard() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const router = useRouter();
  const [restaurant, setRestaurant] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const r = await api.getRestaurant();
      setRestaurant(r);
      if (r) setSummary(await api.dashboardSummary());
    } catch (e: any) { setErr(e.message); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]} testID="dashboard-screen">
      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl }}
        refreshControl={<RefreshControl tintColor={colors.brand} refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <Text style={styles.greet}>Welcome</Text>
        <Text style={styles.name}>{user?.full_name}</Text>

        {!restaurant ? (
          <Pressable style={styles.onboardCard} onPress={() => router.push("/(app)/more")} testID="dashboard-onboard-cta">
            <Ionicons name="storefront" size={28} color={colors.brand} />
            <View style={{ flex: 1 }}>
              <Text style={styles.onboardTitle}>Set up your restaurant</Text>
              <Text style={styles.onboardSub}>Add name, UPI, GST to unlock the full ERP.</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={colors.onSurfaceSecondary} />
          </Pressable>
        ) : (
          <>
            <View style={styles.restCard}>
              <Text style={styles.restName}>{restaurant.name}</Text>
              {!!restaurant.address && <Text style={styles.restSub}>{restaurant.address}</Text>}
            </View>

            <View style={styles.metricsRow}>
              <Metric label="Revenue Today" value={`₹${summary?.revenue_today ?? 0}`} testID="metric-revenue-today" />
              <Metric label="Total Revenue" value={`₹${summary?.revenue_total ?? 0}`} testID="metric-revenue-total" />
            </View>
            <View style={styles.metricsRow}>
              <Metric label="Open Orders" value={`${summary?.orders_open ?? 0}`} testID="metric-orders-open" />
              <Metric label="Menu Items" value={`${summary?.menu_count ?? 0}`} testID="metric-menu-count" />
            </View>

            <Text style={styles.section}>Quick Actions</Text>
            <View style={styles.quick}>
              <Quick label="New Order" icon="add-circle" onPress={() => router.push("/(app)/waiter")} testID="qa-new-order" />
              <Quick label="Menu" icon="book" onPress={() => router.push("/(app)/menu")} testID="qa-menu" />
              <Quick label="Kitchen" icon="restaurant" onPress={() => router.push("/(app)/kitchen")} testID="qa-kitchen" />
              <Quick label="Settings" icon="settings" onPress={() => router.push("/(app)/more")} testID="qa-settings" />
            </View>
          </>
        )}

        {err && <Text style={styles.err} testID="dashboard-error">{err}</Text>}
      </ScrollView>
    </View>
  );
}

function Metric({ label, value, testID }: { label: string; value: string; testID: string }) {
  return (
    <View style={styles.metric} testID={testID}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}
function Quick({ label, icon, onPress, testID }: { label: string; icon: any; onPress: () => void; testID: string }) {
  return (
    <Pressable style={styles.quickCell} onPress={onPress} testID={testID}>
      <Ionicons name={icon} size={26} color={colors.brand} />
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}
function NavRow({ icon, label, onPress, testID }: { icon: any; label: string; onPress: () => void; testID: string }) {
  return (
    <Pressable style={styles.navRow} onPress={onPress} testID={testID}>
      <Ionicons name={icon} size={22} color={colors.brand} />
      <Text style={styles.navText}>{label}</Text>
      <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  greet: { color: colors.onSurfaceSecondary, letterSpacing: 1, fontSize: 13 },
  name: { color: colors.onSurface, fontSize: 30, fontFamily: "serif", marginTop: spacing.xs, marginBottom: spacing.xl },
  onboardCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.brandTertiary },
  onboardTitle: { color: colors.onSurface, fontSize: 16, marginBottom: 2 },
  onboardSub: { color: colors.onSurfaceSecondary, fontSize: 13 },
  restCard: { backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.lg, marginBottom: spacing.lg },
  restName: { color: colors.onSurface, fontSize: 22, fontFamily: "serif" },
  restSub: { color: colors.onSurfaceSecondary, marginTop: 4 },
  metricsRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
  metric: { flex: 1, backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  metricLabel: { color: colors.onSurfaceSecondary, fontSize: 12, letterSpacing: 0.5 },
  metricValue: { color: colors.brand, fontSize: 26, fontFamily: "serif", marginTop: spacing.sm },
  section: { color: colors.onSurfaceSecondary, fontSize: 13, letterSpacing: 1, marginTop: spacing.xl, marginBottom: spacing.md, textTransform: "uppercase" },
  quick: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  quickCell: { width: "47%", backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.lg, alignItems: "flex-start", gap: spacing.sm, borderWidth: 1, borderColor: colors.border },
  quickLabel: { color: colors.onSurface, fontSize: 15 },
  navRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  navText: { color: colors.onSurface, fontSize: 15, flex: 1 },
  err: { color: colors.onError, backgroundColor: colors.error, padding: spacing.md, borderRadius: radius.md, marginTop: spacing.lg },
});
