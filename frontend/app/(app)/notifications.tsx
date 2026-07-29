import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  ActivityIndicator, FlatList, Alert, Platform, SafeAreaView, StatusBar
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import { useNotifications, Notification } from "@/src/context/NotificationContext";
import { useTheme } from "@/src/context/ThemeContext";
import { spacing } from "@/src/theme";

const CATEGORY_COLORS: Record<string, string> = {
  sales: "#10B981",
  kitchen: "#635BFF",
  waiter: "#3B82F6",
  cashier: "#F59E0B",
  system: "#64748B",
  payment: "#EF4444"
};

const CATEGORIES = ["all", "sales", "kitchen", "waiter", "cashier", "payment", "system"];

export default function NotificationCentreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();

  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllRead,
    deleteNotif,
    clearAll,
    fetchNotifications
  } = useNotifications();

  const [search, setSearch] = useState("");
  const [selectedCat, setSelectedCat] = useState("all");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  };

  const handleClearAll = () => {
    Alert.alert(
      "Clear History",
      "Are you sure you want to delete all notifications? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete All",
          style: "destructive",
          onPress: async () => {
            await clearAll();
          }
        }
      ]
    );
  };

  const handleExport = async () => {
    if (notifications.length === 0) {
      Alert.alert("No Data", "There are no notifications to export.");
      return;
    }

    try {
      // Build CSV content
      const headers = "ID,Date,Category,Title,Message,Read\n";
      const rows = notifications
        .map(
          n =>
            `"${n.id}","${new Date(n.created_at).toLocaleString()}","${n.category}","${n.title.replace(
              /"/g,
              '""'
            )}","${n.message.replace(/"/g, '""')}","${n.is_read}"`
        )
        .join("\n");

      const csvContent = headers + rows;

      if (Platform.OS === "web") {
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `ezbill_notifications_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        const filename = `${FileSystem.documentDirectory}notifications_export_${Date.now()}.csv`;
        await FileSystem.writeAsStringAsync(filename, csvContent, {
          encoding: FileSystem.EncodingType.UTF8
        });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(filename, {
            mimeType: "text/csv",
            dialogTitle: "Export Notifications Log"
          });
        } else {
          Alert.alert("Export Success", "Saved csv to device folder");
        }
      }
    } catch (e: any) {
      Alert.alert("Export Error", `Failed to export CSV: ${e.message}`);
    }
  };

  const filteredNotifs = notifications.filter(n => {
    const matchesSearch =
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      n.message.toLowerCase().includes(search.toLowerCase());
    const matchesCat = selectedCat === "all" || n.category === selectedCat;
    return matchesSearch && matchesCat;
  });

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.surface }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.surface} />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable onPress={() => router.back()} style={[styles.backBtn, { borderColor: theme.border }]}>
            <Ionicons name="chevron-back" size={20} color={theme.onSurface} />
          </Pressable>
          <View style={{ marginLeft: spacing.md }}>
            <Text style={[styles.title, { color: theme.onSurface }]}>Notification Centre</Text>
            {unreadCount > 0 ? (
              <Text style={[styles.badgeText, { color: "#FF5E2B" }]}>{unreadCount} unread updates</Text>
            ) : (
              <Text style={[styles.sub, { color: theme.onSurfaceSecondary }]}>All up to date</Text>
            )}
          </View>
        </View>

        <Pressable
          style={[styles.prefBtn, { borderColor: theme.border }]}
          onPress={() => router.push("/(app)/notification-preferences")}
        >
          <Ionicons name="options-outline" size={20} color={theme.onSurface} />
        </Pressable>
      </View>

      {/* Action Bar */}
      <View style={styles.actionBar}>
        <Pressable style={styles.actionItem} onPress={markAllRead}>
          <Ionicons name="checkmark-done" size={16} color="#635BFF" />
          <Text style={[styles.actionText, { color: theme.onSurface }]}>Mark all read</Text>
        </Pressable>

        <Pressable style={styles.actionItem} onPress={handleExport}>
          <Ionicons name="download-outline" size={16} color="#10B981" />
          <Text style={[styles.actionText, { color: theme.onSurface }]}>Export CSV</Text>
        </Pressable>

        <Pressable style={styles.actionItem} onPress={handleClearAll}>
          <Ionicons name="trash-outline" size={16} color="#EF4444" />
          <Text style={[styles.actionText, { color: theme.onSurface }]}>Clear all</Text>
        </Pressable>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <View style={styles.searchWrapper}>
          <Ionicons name="search" size={18} color="#64748B" style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: theme.onSurface }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search notifications..."
            placeholderTextColor="#64748B"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")} style={styles.clearBtn}>
              <Ionicons name="close-circle" size={16} color="#64748B" />
            </Pressable>
          )}
        </View>
      </View>

      {/* Category Pills */}
      <View style={styles.categoriesRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoriesScroll}>
          {CATEGORIES.map(cat => (
            <Pressable
              key={cat}
              style={[
                styles.categoryPill,
                selectedCat === cat && styles.categoryPillActive,
                { borderColor: theme.border }
              ]}
              onPress={() => setSelectedCat(cat)}
            >
              <Text style={[styles.categoryText, selectedCat === cat && styles.categoryTextActive]}>
                {cat.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Logs List */}
      <FlatList
        data={filteredNotifs}
        keyExtractor={item => item.id}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="notifications-off-outline" size={48} color="#64748B" />
            <Text style={styles.emptyText}>No notifications found</Text>
          </View>
        }
        renderItem={({ item }) => {
          const color = CATEGORY_COLORS[item.category] || "#FF5E2B";
          return (
            <Pressable
              style={[
                styles.notifCard,
                !item.is_read && styles.notifCardUnread,
                { borderColor: theme.border }
              ]}
              onPress={() => markAsRead(item.id)}
            >
              <View style={styles.cardHeader}>
                <View style={styles.catIndicator}>
                  <View style={[styles.dot, { backgroundColor: color }]} />
                  <Text style={styles.catLabel}>{item.category.toUpperCase()}</Text>
                </View>
                <Text style={styles.timeLabel}>
                  {new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>

              <Text style={[styles.cardTitle, { color: theme.onSurface }]}>{item.title}</Text>
              <Text style={styles.cardMessage}>{item.message}</Text>

              <View style={styles.cardFooter}>
                {!item.is_read && <View style={styles.unreadTag}><Text style={styles.unreadTagText}>NEW</Text></View>}
                <View style={{ flex: 1 }} />
                <Pressable onPress={() => deleteNotif(item.id)} style={styles.deleteBtn}>
                  <Ionicons name="trash-outline" size={16} color="#64748B" />
                </Pressable>
              </View>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center"
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center"
  },
  prefBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center"
  },
  title: { fontSize: 20, fontWeight: "900" },
  sub: { fontSize: 12, marginTop: 2, fontWeight: "500" },
  badgeText: { fontSize: 12, marginTop: 2, fontWeight: "700" },

  actionBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#2E2E38"
  },
  actionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  actionText: {
    fontSize: 12,
    fontWeight: "700"
  },

  searchContainer: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md
  },
  searchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16161A",
    borderRadius: 12,
    height: 44,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#2E2E38"
  },
  searchIcon: {
    marginRight: 8
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    height: "100%"
  },
  clearBtn: {
    padding: 4
  },

  categoriesRow: {
    marginVertical: spacing.md
  },
  categoriesScroll: {
    paddingHorizontal: spacing.lg,
    gap: 8
  },
  categoryPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    backgroundColor: "#16161A"
  },
  categoryPillActive: {
    backgroundColor: "#FF5E2B",
    borderColor: "#FF5E2B"
  },
  categoryText: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700"
  },
  categoryTextActive: {
    color: "#FFFFFF"
  },

  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 40
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80
  },
  emptyText: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 12
  },

  notifCard: {
    backgroundColor: "#16161A",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#2E2E38",
    padding: 16,
    marginBottom: 12
  },
  notifCardUnread: {
    borderColor: "rgba(255, 94, 43, 0.4)",
    backgroundColor: "rgba(255, 94, 43, 0.03)"
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8
  },
  catIndicator: {
    flexDirection: "row",
    alignItems: "center"
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6
  },
  catLabel: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "800"
  },
  timeLabel: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "600"
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "800"
  },
  cardMessage: {
    color: "#94A3B8",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#2E2E38",
    paddingTop: 10
  },
  unreadTag: {
    backgroundColor: "rgba(255, 94, 43, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  unreadTagText: {
    color: "#FF5E2B",
    fontSize: 9,
    fontWeight: "800"
  },
  deleteBtn: {
    padding: 4
  }
});
