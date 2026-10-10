import { useCallback, useState, useMemo } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Modal, ScrollView, Linking, Switch, Alert, TextInput,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/theme";
import { useTheme } from "@/src/context/ThemeContext";
import { useResponsive } from "@/src/hooks/useResponsive";
import * as Haptics from "expo-haptics";
import MenuJsonImportModal from "@/src/components/MenuJsonImportModal";

type Sub = { id: string; plan_name: string; price: number; interval: string; status: string; ends_at?: string };
type Rest = {
  id: string; name: string; owner_name: string; owner_email?: string;
  phone: string; address: string; upi_id: string; gst?: string; subscription?: Sub | null;
  custom_features?: Record<string, boolean>; custom_staff_limit?: number;
};
type Plan = { id: string; name: string; price: number; interval: string; features?: string[] };

export default function AdminRestaurants() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const { isDesktop } = useResponsive();

  const [items, setItems] = useState<Rest[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "expired">("all");

  // Admin Duration Selector for plan assignment
  const [assignDurationDays, setAssignDurationDays] = useState<number>(30);

  // Custom Feature Overrides State for detail modal
  const [customFeatures, setCustomFeatures] = useState<Record<string, boolean>>({});
  const [customStaffLimit, setCustomStaffLimit] = useState<number>(0);

  // Menu JSON Import Modal
  const [menuImportModal, setMenuImportModal] = useState(false);
  const [importTargetRest, setImportTargetRest] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [r, p] = await Promise.all([api.adminListRestaurants(), api.adminListPlans()]);
      setItems(r || []); setPlans(p || []);
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const open = async (r: Rest) => {
    try {
      setBusy(true);
      const d = await api.adminRestaurantDetail(r.id);
      setDetail(d);
      setCustomFeatures(d.custom_features || {});
      setCustomStaffLimit(d.custom_staff_limit !== undefined ? d.custom_staff_limit : (d.subscription?.status === "active" ? 14 : 0));
    } catch (e: any) { 
      setErr(e.message); 
    } finally {
      setBusy(false);
    }
  };

  const assign = async (planId: string) => {
    if (!detail) return;
    setBusy(true); setErr(null); setMsg(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try { 
      await api.adminAssignSubscription(detail.id, planId, assignDurationDays, "active"); 
      const fresh = await api.adminRestaurantDetail(detail.id);
      setDetail(fresh);
      setMsg(`Plan assigned for ${assignDurationDays >= 3650 ? "👑 Lifetime" : `${assignDurationDays} days`}!`);
      await load(); 
    } catch (e: any) { 
      setErr(e.message); 
    } finally { 
      setBusy(false); 
    }
  };

  const expireNow = async () => {
    if (!detail) return;
    Alert.alert(
      "Expire Subscription Immediately?",
      `This will instantly lock out ${detail.name} from creating orders and bills until they renew.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Expire Now",
          style: "destructive",
          onPress: async () => {
            setBusy(true); setErr(null); setMsg(null);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
            try {
              await api.adminExpireSubscription(detail.id);
              const fresh = await api.adminRestaurantDetail(detail.id);
              setDetail(fresh);
              setMsg("Subscription expired successfully.");
              await load();
            } catch (e: any) {
              setErr(e.message);
            } finally {
              setBusy(false);
            }
          }
        }
      ]
    );
  };

  const cancel = async () => {
    if (!detail) return;
    setBusy(true); setErr(null); setMsg(null);
    try { 
      await api.adminCancelSubscription(detail.id); 
      const fresh = await api.adminRestaurantDetail(detail.id);
      setDetail(fresh); 
      setMsg("Subscription cancelled.");
      await load(); 
    } catch (e: any) { 
      setErr(e.message); 
    } finally { 
      setBusy(false); 
    }
  };

  const saveFeatures = async () => {
    if (!detail) return;
    setBusy(true); setErr(null); setMsg(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      await api.adminUpdateRestaurantFeatures(detail.id, customFeatures, customStaffLimit);
      const fresh = await api.adminRestaurantDetail(detail.id);
      setDetail(fresh);
      setMsg("Custom features & staff limits saved!");
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const removeRest = async () => {
    if (!detail) return;
    Alert.alert(
      "Delete Business?",
      `Are you sure you want to delete ${detail.name}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try { 
              await api.adminDeleteRestaurant(detail.id); 
              setDetail(null); 
              await load(); 
            } catch (e: any) { 
              setErr(e.message); 
            } finally { 
              setBusy(false); 
            }
          }
        }
      ]
    );
  };

  const handleWhatsApp = (phone: string) => {
    const num = phone.replace(/[^0-9]/g, "");
    if (!num) return;
    const finalNum = num.length === 10 ? `91${num}` : num;
    Linking.openURL(`https://wa.me/${finalNum}`).catch(() => {});
  };

  const clearRestaurantMenu = async () => {
    if (!detail) return;
    Alert.alert(
      "Clear Restaurant Menu?",
      `Are you sure you want to delete all menu items and categories for ${detail.name}? This will leave the menu completely empty.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear Menu",
          style: "destructive",
          onPress: async () => {
            setBusy(true); setErr(null); setMsg(null);
            try {
              await api.adminClearRestaurantMenu(detail.id);
              const fresh = await api.adminRestaurantDetail(detail.id);
              setDetail(fresh);
              setMsg("All menu items and categories cleared successfully.");
              await load();
            } catch (e: any) {
              setErr(e.message);
            } finally {
              setBusy(false);
            }
          }
        }
      ]
    );
  };

  const toggleStatus = async () => {
    if (!detail) return;
    setBusy(true); setErr(null); setMsg(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const res = await api.adminToggleRestaurantStatus(detail.id);
      setDetail((p: any) => p ? { ...p, is_active: res.is_active } : p);
      setMsg(res.message);
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const filteredItems = useMemo(() => {
    return items.filter(r => {
      const q = searchQuery.toLowerCase().trim();
      const matchQuery = !q ||
        r.name?.toLowerCase().includes(q) ||
        r.owner_name?.toLowerCase().includes(q) ||
        r.phone?.includes(q) ||
        r.address?.toLowerCase().includes(q);

      if (!matchQuery) return false;
      if (statusFilter === "active") return r.subscription?.status === "active";
      if (statusFilter === "expired") return !r.subscription || r.subscription.status !== "active";
      return true;
    });
  }, [items, searchQuery, statusFilter]);

  const getSubBadge = (sub?: Sub | null) => {
    if (!sub) return { label: "NO PLAN", bg: isDark ? "#2A2A38" : "#E2E8F0", text: isDark ? "#94A3B8" : "#64748B" };
    if (sub.status === "active") return { label: `${sub.plan_name.toUpperCase()}`, bg: "#064E3B", text: "#34D399" };
    if (sub.status === "expired") return { label: "EXPIRED", bg: "#7F1D1D", text: "#F87171" };
    return { label: sub.status.toUpperCase(), bg: "#78350F", text: "#FBBF24" };
  };

  return (
    <View style={[styles.wrap, { paddingTop: insets.top, backgroundColor: theme.surface }]} testID="admin-restaurants-screen">
      <View style={[{ flex: 1, width: "100%" }, isDesktop && { maxWidth: 1200, alignSelf: "center" }]}>
      {/* Header Bar */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="admin-rest-back-btn" hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.onSurface} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.title, { color: theme.onSurface }]}>Businesses</Text>
          <Text style={{ fontSize: 12, color: theme.onSurfaceSecondary, fontWeight: "600" }}>
            {items.length} registered · {items.filter(i => i.subscription?.status === "active").length} active
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Pressable
            onPress={() => {
              setImportTargetRest(null);
              setMenuImportModal(true);
            }}
            hitSlop={12}
            style={[styles.headerActionBtn, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}
          >
            <Ionicons name="code-working" size={16} color="#635BFF" />
            <Text style={[styles.headerActionBtnText, { color: theme.onSurface }]}>JSON Menu Import</Text>
          </Pressable>
          <Pressable onPress={load} hitSlop={12} style={[styles.reloadBtn, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
            <Ionicons name="refresh" size={18} color="#635BFF" />
          </Pressable>
        </View>
      </View>

      {/* Search & Filter Section */}
      <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.sm }}>
        <View style={[styles.searchBox, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
          <Ionicons name="search" size={16} color={theme.onSurfaceSecondary} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search stores, owners, phone..."
            placeholderTextColor={theme.onSurfaceTertiary}
            style={[styles.searchInput, { color: theme.onSurface }]}
          />
          {!!searchQuery && (
            <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={theme.onSurfaceSecondary} />
            </Pressable>
          )}
        </View>

        {/* Filter Tabs */}
        <View style={styles.filterTabsRow}>
          {[
            { key: "all", label: `All (${items.length})` },
            { key: "active", label: `Active (${items.filter(i => i.subscription?.status === "active").length})` },
            { key: "expired", label: `Expired (${items.filter(i => !i.subscription || i.subscription.status !== "active").length})` },
          ].map(tab => (
            <Pressable
              key={tab.key}
              style={[
                styles.filterTabPill,
                { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
                statusFilter === tab.key && { backgroundColor: "#635BFF", borderColor: "#635BFF" }
              ]}
              onPress={() => setStatusFilter(tab.key as any)}
            >
              <Text style={[styles.filterTabText, { color: theme.onSurfaceSecondary }, statusFilter === tab.key && { color: "#FFFFFF", fontWeight: "800" }]}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#635BFF" size="large" /></View>
      ) : filteredItems.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="storefront-outline" size={48} color={theme.onSurfaceTertiary} />
          <Text style={{ color: theme.onSurfaceSecondary, fontSize: 14, fontWeight: "600", marginTop: 8 }}>
            No businesses match your search.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={r => r.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md }}
          renderItem={({ item }) => {
            const badge = getSubBadge(item.subscription);
            const isSubActive = item.subscription?.status === "active";
            return (
              <Pressable
                style={[
                  styles.card,
                  { backgroundColor: theme.surfaceSecondary, borderColor: isSubActive ? theme.border : "#EF444440" }
                ]}
                onPress={() => open(item)}
                testID={`admin-rest-${item.id}`}
              >
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={[styles.cardName, { color: theme.onSurface }]} numberOfLines={1}>{item.name}</Text>
                    {isSubActive ? (
                      <View style={styles.activeDot} />
                    ) : (
                      <View style={styles.expiredDot} />
                    )}
                  </View>
                  <Text style={[styles.cardMeta, { color: theme.onSurfaceSecondary }]}>
                    {item.owner_name} {item.phone ? `· ${item.phone}` : ""}
                  </Text>
                  {!!item.address && (
                    <Text style={[styles.cardAddr, { color: theme.onSurfaceTertiary }]} numberOfLines={1}>
                      {item.address}
                    </Text>
                  )}
                </View>

                <View style={{ gap: spacing.xs, alignItems: "flex-end" }}>
                  <View style={[styles.subBadge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.subBadgeText, { color: badge.text }]}>
                      {badge.label}
                    </Text>
                  </View>
                  
                  <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                    {!!item.phone && (
                      <>
                        <Pressable
                          style={[styles.callPill, { backgroundColor: theme.surfaceTertiary, borderColor: theme.border }]}
                          onPress={(e) => {
                            e.stopPropagation();
                            Linking.openURL(`tel:${item.phone}`).catch(() => {});
                          }}
                        >
                          <Ionicons name="call" size={12} color="#10B981" />
                          <Text style={[styles.callPillText, { color: theme.onSurface }]}>Call</Text>
                        </Pressable>

                        <Pressable
                          style={[styles.callPill, { backgroundColor: theme.surfaceTertiary, borderColor: theme.border }]}
                          onPress={(e) => {
                            e.stopPropagation();
                            handleWhatsApp(item.phone);
                          }}
                        >
                          <Ionicons name="logo-whatsapp" size={12} color="#25D366" />
                          <Text style={[styles.callPillText, { color: theme.onSurface }]}>Chat</Text>
                        </Pressable>
                      </>
                    )}

                    <Pressable
                      style={styles.grantQuickBtn}
                      onPress={(e) => {
                        e.stopPropagation();
                        open(item);
                      }}
                    >
                      <LinearGradient
                        colors={["#635BFF", "#4F46E5"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.grantQuickGrad}
                      >
                        <Ionicons name="flash" size={11} color="#FFFFFF" />
                        <Text style={styles.grantQuickText}>
                          {isSubActive ? "Extend" : "Grant"}
                        </Text>
                      </LinearGradient>
                    </Pressable>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {err && <Text style={styles.err} testID="admin-rest-error">{err}</Text>}

      {/* Restaurant Detail & Super-Admin Feature Control Modal */}
      <Modal transparent visible={!!detail} animationType="slide" onRequestClose={() => setDetail(null)}>
        <View style={[styles.modalBg, isDesktop && { justifyContent: "center", alignItems: "center", padding: spacing.xl }]}>
          <View style={[
            styles.modalCard, 
            { 
              paddingBottom: isDesktop ? spacing.xl : insets.bottom + spacing.xl, 
              backgroundColor: theme.surfaceSecondary,
              width: isDesktop ? 620 : "100%",
              borderRadius: isDesktop ? 20 : undefined,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              maxHeight: isDesktop ? "90%" : undefined,
              borderWidth: isDesktop ? 1 : 0,
              borderColor: theme.border,
            }
          ]}>
            {detail && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Modal Header */}
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md }}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={[styles.modalTitle, { color: theme.onSurface }]} numberOfLines={1}>{detail.name}</Text>
                    <Text style={{ color: theme.onSurfaceSecondary, fontSize: 12, fontWeight: "600" }}>Restaurant Management & Subscriptions</Text>
                  </View>
                  <Pressable onPress={() => setDetail(null)} hitSlop={12}>
                    <Ionicons name="close-circle" size={28} color={theme.onSurfaceSecondary} />
                  </Pressable>
                </View>

                {msg && <Text style={styles.successMsg}>{msg}</Text>}
                {err && <Text style={styles.err}>{err}</Text>}

                {/* Business Info Overview Card */}
                <View style={[styles.infoCard, { backgroundColor: theme.surfaceTertiary, borderColor: theme.border }]}>
                  {/* Status Toggle Row */}
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: theme.border }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <View style={[styles.activeDot, { backgroundColor: detail.is_active !== false ? "#10B981" : "#EF4444" }]} />
                      <Text style={{ color: theme.onSurface, fontWeight: "800", fontSize: 13 }}>
                        Status: {detail.is_active !== false ? "OPERATIONAL (ACTIVE)" : "SUSPENDED"}
                      </Text>
                    </View>
                    <Pressable
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: radius.pill,
                        backgroundColor: detail.is_active !== false ? "rgba(239, 68, 68, 0.12)" : "rgba(16, 185, 129, 0.12)",
                        borderWidth: 1,
                        borderColor: detail.is_active !== false ? "#EF4444" : "#10B981"
                      }}
                      onPress={toggleStatus}
                      disabled={busy}
                    >
                      <Text style={{ color: detail.is_active !== false ? "#EF4444" : "#10B981", fontSize: 11, fontWeight: "800" }}>
                        {detail.is_active !== false ? "Suspend Store" : "Reactivate"}
                      </Text>
                    </Pressable>
                  </View>

                  <Text style={[styles.detailRow, { color: theme.onSurfaceSecondary }]}>
                    Owner: <Text style={[styles.detailVal, { color: theme.onSurface }]}>{detail.owner_name}</Text>
                  </Text>
                  {!!detail.phone && (
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginVertical: 3 }}>
                      <Text style={[styles.detailRow, { color: theme.onSurfaceSecondary }]}>
                        Phone: <Text style={[styles.detailVal, { color: theme.onSurface }]}>{detail.phone}</Text>
                      </Text>
                      <View style={{ flexDirection: "row", gap: 6 }}>
                        <Pressable
                          style={styles.callOwnerBtn}
                          onPress={() => Linking.openURL(`tel:${detail.phone}`).catch(() => {})}
                        >
                          <Ionicons name="call" size={12} color="#FFFFFF" />
                          <Text style={styles.callOwnerText}>Call</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.callOwnerBtn, { backgroundColor: "#25D366" }]}
                          onPress={() => handleWhatsApp(detail.phone)}
                        >
                          <Ionicons name="logo-whatsapp" size={12} color="#FFFFFF" />
                          <Text style={styles.callOwnerText}>WhatsApp</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                  {!!detail.address && <Text style={[styles.detailRow, { color: theme.onSurfaceSecondary }]}>Address: <Text style={[styles.detailVal, { color: theme.onSurface }]}>{detail.address}</Text></Text>}
                  {!!detail.gst && <Text style={[styles.detailRow, { color: theme.onSurfaceSecondary }]}>GSTIN: <Text style={[styles.detailVal, { color: theme.onSurface }]}>{detail.gst}</Text></Text>}
                  {!!detail.upi_id && <Text style={[styles.detailRow, { color: theme.onSurfaceSecondary }]}>UPI: <Text style={[styles.detailVal, { color: theme.onSurface }]}>{detail.upi_id}</Text></Text>}
                  
                  {/* Store Scale Metrics Grid */}
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.border, flexWrap: "wrap", gap: 8 }}>
                    <Text style={[styles.detailRow, { color: theme.onSurfaceSecondary }]}>Tables: <Text style={[styles.detailVal, { color: theme.onSurface }]}>{detail.tables_count ?? "-"}</Text></Text>
                    <Text style={[styles.detailRow, { color: theme.onSurfaceSecondary }]}>Menu: <Text style={[styles.detailVal, { color: theme.onSurface }]}>{detail.menu_count ?? "-"}</Text></Text>
                    <Text style={[styles.detailRow, { color: theme.onSurfaceSecondary }]}>Staff: <Text style={[styles.detailVal, { color: theme.onSurface }]}>{detail.staff_count ?? "-"}</Text></Text>
                    <Text style={[styles.detailRow, { color: theme.onSurfaceSecondary }]}>Orders: <Text style={[styles.detailVal, { color: theme.onSurface }]}>{detail.orders_total}</Text></Text>
                    <Text style={[styles.detailRow, { color: theme.onSurfaceSecondary }]}>Revenue: <Text style={[styles.detailVal, { color: "#10B981", fontWeight: "800" }]}>₹{detail.revenue_total}</Text></Text>
                  </View>

                  {/* Super Admin Direct Menu Actions */}
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border }}>
                    <Pressable
                      style={{
                        flex: 1,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        backgroundColor: "rgba(99, 91, 255, 0.12)",
                        borderColor: "#635BFF",
                        borderWidth: 1,
                        paddingVertical: 7,
                        borderRadius: radius.md,
                      }}
                      onPress={() => {
                        setImportTargetRest({ id: detail.id, name: detail.name });
                        setMenuImportModal(true);
                      }}
                    >
                      <Ionicons name="code-working" size={14} color="#635BFF" />
                      <Text style={{ color: "#635BFF", fontSize: 12, fontWeight: "800" }}>
                        Inject / Import Menu JSON
                      </Text>
                    </Pressable>

                    <Pressable
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 4,
                        backgroundColor: "rgba(239, 68, 68, 0.1)",
                        borderColor: "rgba(239, 68, 68, 0.3)",
                        borderWidth: 1,
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        borderRadius: radius.md,
                      }}
                      onPress={clearRestaurantMenu}
                      disabled={busy}
                    >
                      <Ionicons name="trash-outline" size={14} color="#EF4444" />
                      <Text style={{ color: "#EF4444", fontSize: 12, fontWeight: "700" }}>Clear Menu</Text>
                    </Pressable>
                  </View>
                </View>

                {/* SUBSCRIPTION STATUS & MANAGEMENT */}
                <Text style={[styles.section, { color: "#635BFF" }]}>Current Subscription</Text>
                {detail.subscription?.status === "active" ? (
                  <View style={[styles.subCardActive, { backgroundColor: theme.surfaceTertiary }]}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <View>
                        <Text style={[styles.subActiveTitle, { color: theme.onSurface }]}>{detail.subscription.plan_name} Plan</Text>
                        <Text style={[styles.subActiveMeta, { color: theme.onSurfaceSecondary }]}>₹{detail.subscription.price} / {detail.subscription.interval}</Text>
                        {detail.subscription.ends_at && (
                          <Text style={styles.subActiveEnds}>
                            Ends: {new Date(detail.subscription.ends_at).toLocaleDateString()}
                          </Text>
                        )}
                      </View>
                      <View style={[styles.subBadge, { backgroundColor: "#064E3B" }]}>
                        <Text style={[styles.subBadgeText, { color: "#34D399" }]}>ACTIVE</Text>
                      </View>
                    </View>

                    <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                      <Pressable style={styles.expireBtn} onPress={expireNow} disabled={busy}>
                        <Ionicons name="flash-off-outline" size={15} color="#FFFFFF" />
                        <Text style={styles.expireBtnText}>Expire Now</Text>
                      </Pressable>
                      <Pressable style={[styles.cancelBtn, { borderColor: theme.border }]} onPress={cancel} disabled={busy}>
                        <Text style={[styles.cancelBtnText, { color: theme.onSurfaceSecondary }]}>Cancel</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View style={[styles.subCardInactive, { backgroundColor: theme.surfaceTertiary }]}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={{ color: "#F87171", fontWeight: "700" }}>Subscription Inactive / Expired</Text>
                      <View style={[styles.subBadge, { backgroundColor: "#7F1D1D" }]}>
                        <Text style={[styles.subBadgeText, { color: "#F87171" }]}>EXPIRED</Text>
                      </View>
                    </View>
                  </View>
                )}

                {/* ASSIGN OR EXTEND PLAN */}
                <Text style={[styles.section, { color: "#635BFF", marginTop: spacing.lg }]}>Grant / Extend Subscription</Text>
                <Text style={[styles.hint, { color: theme.onSurfaceSecondary }]}>Choose duration & tap a plan to activate instantly:</Text>
                
                {/* Duration Pills */}
                <View style={styles.durationRow}>
                  {[
                    { label: "1 Month (30d)", days: 30 },
                    { label: "3 Months (90d)", days: 90 },
                    { label: "6 Months (180d)", days: 180 },
                    { label: "1 Year (365d)", days: 365 },
                    { label: "👑 Lifetime", days: 36500 },
                  ].map(d => (
                    <Pressable
                      key={d.days}
                      style={[
                        styles.durationPill,
                        { backgroundColor: theme.surfaceTertiary, borderColor: theme.border },
                        assignDurationDays === d.days && styles.durationPillActive
                      ]}
                      onPress={() => setAssignDurationDays(d.days)}
                    >
                      <Text style={[styles.durationPillText, { color: theme.onSurfaceSecondary }, assignDurationDays === d.days && styles.durationPillTextActive]}>
                        {d.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <View style={{ gap: 8 }}>
                  {plans.map(p => (
                    <Pressable
                      key={p.id}
                      style={[styles.planRow, { backgroundColor: theme.surfaceTertiary, borderColor: theme.border }]}
                      onPress={() => assign(p.id)}
                      disabled={busy}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.planName, { color: theme.onSurface }]}>{p.name}</Text>
                        <Text style={[styles.planInterval, { color: theme.onSurfaceSecondary }]}>{p.interval}</Text>
                        {!!p.features?.length && (
                          <Text style={{ fontSize: 11, color: theme.onSurfaceTertiary, marginTop: 2 }} numberOfLines={1}>
                            {p.features.slice(0, 2).join(" · ")}
                          </Text>
                        )}
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={[styles.planPrice, { color: "#635BFF" }]}>₹{p.price}</Text>
                        <View style={styles.grantBadge}>
                          <Ionicons name="flash" size={10} color="#FFFFFF" />
                          <Text style={styles.grantBadgeText}>Grant</Text>
                        </View>
                      </View>
                    </Pressable>
                  ))}
                </View>

                {/* FEATURE TOGGLES & LIMITS OVERRIDE MATRIX */}
                <Text style={[styles.section, { color: "#635BFF", marginTop: spacing.xl }]}>Feature Flags & Permissions</Text>
                <Text style={[styles.hint, { color: theme.onSurfaceSecondary }]}>Override specific feature access for this business:</Text>

                <View style={[styles.featureMatrix, { backgroundColor: theme.surfaceTertiary, borderColor: theme.border }]}>
                  <View style={styles.featureRow}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={[styles.featureName, { color: theme.onSurface }]}>🤖 AI Smart Menu Import</Text>
                      <Text style={[styles.featureSub, { color: theme.onSurfaceSecondary }]}>Scan physical menu via OCR & AI parsing</Text>
                    </View>
                    <Switch
                      value={customFeatures.ai_menu ?? true}
                      onValueChange={v => setCustomFeatures(p => ({ ...p, ai_menu: v }))}
                      trackColor={{ false: "#3E3E4A", true: "#635BFF" }}
                    />
                  </View>

                  <View style={styles.featureRow}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={[styles.featureName, { color: theme.onSurface }]}>📱 Customer QR Web Menu</Text>
                      <Text style={[styles.featureSub, { color: theme.onSurfaceSecondary }]}>Customer self-ordering via table QR</Text>
                    </View>
                    <Switch
                      value={customFeatures.qr_web_menu ?? true}
                      onValueChange={v => setCustomFeatures(p => ({ ...p, qr_web_menu: v }))}
                      trackColor={{ false: "#3E3E4A", true: "#635BFF" }}
                    />
                  </View>

                  <View style={styles.featureRow}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={[styles.featureName, { color: theme.onSurface }]}>📦 Inventory & Expense Control</Text>
                      <Text style={[styles.featureSub, { color: theme.onSurfaceSecondary }]}>Stock levels and daily expenses</Text>
                    </View>
                    <Switch
                      value={customFeatures.inventory ?? true}
                      onValueChange={v => setCustomFeatures(p => ({ ...p, inventory: v, expenses: v }))}
                      trackColor={{ false: "#3E3E4A", true: "#635BFF" }}
                    />
                  </View>

                  <View style={styles.featureRow}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={[styles.featureName, { color: theme.onSurface }]}>📊 Advanced Reports & Analytics</Text>
                      <Text style={[styles.featureSub, { color: theme.onSurfaceSecondary }]}>Revenue trends, item charts, & exports</Text>
                    </View>
                    <Switch
                      value={customFeatures.advanced_reports ?? true}
                      onValueChange={v => setCustomFeatures(p => ({ ...p, advanced_reports: v }))}
                      trackColor={{ false: "#3E3E4A", true: "#635BFF" }}
                    />
                  </View>

                  <View style={styles.featureRow}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={[styles.featureName, { color: theme.onSurface }]}>⚡ 100% Local-First Engine (1 User)</Text>
                      <Text style={[styles.featureSub, { color: theme.onSurfaceSecondary }]}>0ms on-device speed with single background cloud backup (Starter ₹299/₹2999)</Text>
                    </View>
                    <Switch
                      value={customFeatures.is_local_mode ?? (detail.subscription?.price === 299 || detail.subscription?.price === 2999 || detail.subscription?.plan_name?.toLowerCase().includes("starter") || false)}
                      onValueChange={v => setCustomFeatures(p => ({ ...p, is_local_mode: v }))}
                      trackColor={{ false: "#3E3E4A", true: "#16A34A" }}
                    />
                  </View>

                  {/* Staff Limit Controls */}
                  <View style={{ paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border }}>
                    <Text style={[styles.featureName, { color: theme.onSurface }]}>👥 Maximum Waiter Staff Limit</Text>
                    <View style={styles.staffLimitsRow}>
                      {[0, 4, 14, 50, 100].map(cnt => (
                        <Pressable
                          key={cnt}
                          style={[
                            styles.staffLimitPill,
                            { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
                            customStaffLimit === cnt && styles.staffLimitPillActive
                          ]}
                          onPress={() => setCustomStaffLimit(cnt)}
                        >
                          <Text style={[styles.staffLimitText, { color: theme.onSurfaceSecondary }, customStaffLimit === cnt && styles.staffLimitTextActive]}>
                            {cnt === 0 ? "Owner" : `${cnt} Staff`}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  <Pressable style={styles.saveFeaturesBtn} onPress={saveFeatures} disabled={busy}>
                    <LinearGradient
                      colors={["#635BFF", "#4F46E5"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.saveFeaturesGrad}
                    >
                      <Text style={styles.saveFeaturesText}>Save Feature Overrides</Text>
                    </LinearGradient>
                  </Pressable>
                </View>

                {/* DELETE BUSINESS */}
                <Pressable style={styles.dangerBtn} onPress={removeRest} disabled={busy} testID="admin-rest-delete">
                  <Ionicons name="trash" size={16} color={colors.onError} />
                  <Text style={styles.dangerText}>Delete Business</Text>
                </Pressable>

                <Pressable style={styles.ghostBtn} onPress={() => setDetail(null)} testID="admin-rest-close">
                  <Text style={[styles.ghostText, { color: theme.onSurfaceSecondary }]}>Close</Text>
                </Pressable>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Menu JSON Import & Injector Modal */}
      <MenuJsonImportModal
        visible={menuImportModal}
        onClose={() => {
          setMenuImportModal(false);
          setImportTargetRest(null);
        }}
        onSuccess={() => {
          load();
          if (detail) open(detail);
        }}
        isAdmin={true}
        targetTenantId={importTargetRest?.id}
        targetRestaurantName={importTargetRest?.name}
      />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 38, height: 38, borderRadius: 19, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 20, fontWeight: "900" },
  reloadBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center", borderWidth: 1 },
  headerActionBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.md, borderWidth: 1 },
  headerActionBtnText: { fontSize: 12, fontWeight: "800" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl },

  searchBox: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, height: 42, borderRadius: radius.md, borderWidth: 1, gap: 8, marginBottom: spacing.sm },
  searchInput: { flex: 1, fontSize: 13, fontWeight: "500" },
  filterTabsRow: { flexDirection: "row", gap: 8 },
  filterTabPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1 },
  filterTabText: { fontSize: 11, fontWeight: "700" },

  card: { flexDirection: "row", padding: spacing.md, borderRadius: radius.xl, borderWidth: 1, alignItems: "center", gap: spacing.md },
  cardName: { fontSize: 15, fontWeight: "800" },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#34D399" },
  expiredDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#EF4444" },
  cardMeta: { fontSize: 12, marginTop: 2, fontWeight: "500" },
  cardAddr: { fontSize: 11, marginTop: 2 },
  
  callPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.sm, borderWidth: 1 },
  callPillText: { fontSize: 11, fontWeight: "700" },
  grantQuickBtn: { borderRadius: radius.sm, overflow: "hidden" },
  grantQuickGrad: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5 },
  grantQuickText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },

  subBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  subBadgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  err: { color: colors.onError, backgroundColor: colors.error, marginVertical: spacing.sm, padding: spacing.md, borderRadius: radius.md, fontSize: 13, fontWeight: "700" },
  successMsg: { color: "#34D399", backgroundColor: "#064E3B", marginVertical: spacing.sm, padding: spacing.md, borderRadius: radius.md, fontSize: 13, fontWeight: "700" },
  
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  modalCard: { padding: spacing.xl, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: "92%" },
  modalTitle: { fontSize: 20, fontWeight: "900", marginBottom: 2 },
  infoCard: { padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, marginBottom: spacing.md },
  section: { fontSize: 12, letterSpacing: 0.8, textTransform: "uppercase", fontWeight: "800", marginTop: spacing.md, marginBottom: spacing.xs },
  hint: { fontSize: 12, marginBottom: spacing.sm, fontWeight: "500" },
  detailRow: { marginVertical: 3, fontSize: 13 },
  detailVal: { fontWeight: "700" },
  callOwnerBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "#10B981", paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, gap: 4 },
  callOwnerText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },

  subCardActive: { padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: "#064E3B", marginBottom: spacing.sm },
  subActiveTitle: { fontSize: 16, fontWeight: "800" },
  subActiveMeta: { fontSize: 12, marginTop: 2, fontWeight: "500" },
  subActiveEnds: { color: "#34D399", fontSize: 12, marginTop: 4, fontWeight: "700" },
  expireBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#DC2626", paddingVertical: 8, borderRadius: radius.sm, gap: 5 },
  expireBtnText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.sm, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  cancelBtnText: { fontSize: 12, fontWeight: "600" },

  subCardInactive: { padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: "#7F1D1D", marginBottom: spacing.sm },

  durationRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  durationPill: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.sm, borderWidth: 1 },
  durationPillActive: { backgroundColor: "#635BFF", borderColor: "#635BFF" },
  durationPillText: { fontSize: 11, fontWeight: "700" },
  durationPillTextActive: { color: "#FFFFFF", fontWeight: "800" },

  planRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  planName: { fontSize: 14, fontWeight: "800" },
  planInterval: { fontSize: 12, textTransform: "capitalize", fontWeight: "500" },
  planPrice: { fontSize: 15, fontWeight: "900" },
  grantBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#635BFF", paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, marginTop: 2 },
  grantBadgeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "800" },

  featureMatrix: { padding: spacing.md, borderRadius: radius.lg, gap: 12, borderWidth: 1 },
  featureRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  featureName: { fontSize: 13, fontWeight: "700" },
  featureSub: { fontSize: 11, marginTop: 2 },

  staffLimitsRow: { flexDirection: "row", gap: 6, marginTop: 8 },
  staffLimitPill: { flex: 1, paddingVertical: 6, borderRadius: radius.sm, alignItems: "center", borderWidth: 1 },
  staffLimitPillActive: { backgroundColor: "#635BFF", borderColor: "#635BFF" },
  staffLimitText: { fontSize: 11, fontWeight: "700" },
  staffLimitTextActive: { color: "#FFFFFF", fontWeight: "800" },

  saveFeaturesBtn: { borderRadius: radius.md, overflow: "hidden", marginTop: 8 },
  saveFeaturesGrad: { paddingVertical: 12, alignItems: "center" },
  saveFeaturesText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },

  dangerBtn: { flexDirection: "row", alignItems: "center", gap: spacing.sm, justifyContent: "center", padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.error, marginTop: spacing.xl },
  dangerText: { color: colors.onError, fontWeight: "700" },
  ghostBtn: { padding: spacing.md, alignItems: "center", marginTop: spacing.xs },
  ghostText: { fontWeight: "600" },
});

