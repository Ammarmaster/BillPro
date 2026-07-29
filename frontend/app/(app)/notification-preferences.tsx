import React from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, Switch,
  TextInput, Alert, SafeAreaView, StatusBar
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNotifications } from "@/src/context/NotificationContext";
import { useTheme } from "@/src/context/ThemeContext";
import { spacing } from "@/src/theme";

export default function NotificationPreferencesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();

  const { preferences, updatePreferences } = useNotifications();

  const handleToggleSound = (val: boolean) => {
    updatePreferences({ sound_enabled: val });
  };

  const handleToggleVibration = (val: boolean) => {
    updatePreferences({ vibration_enabled: val });
  };

  const handleToggleQuietHours = (val: boolean) => {
    updatePreferences({ quiet_hours: val });
  };

  const handleUpdateCategory = (cat: string, val: boolean) => {
    const updatedCats = { ...preferences.categories, [cat]: val };
    updatePreferences({ categories: updatedCats as any });
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.surface }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.surface} />
      
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { borderColor: theme.border }]}>
          <Ionicons name="chevron-back" size={20} color={theme.onSurface} />
        </Pressable>
        <View style={{ marginLeft: spacing.md }}>
          <Text style={[styles.title, { color: theme.onSurface }]}>Notification Settings</Text>
          <Text style={[styles.sub, { color: theme.onSurfaceSecondary }]}>Configure device alert behaviors</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Device Alert Toggles */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>DEVICE BEHAVIOURS</Text>
          
          <View style={styles.switchRow}>
            <View>
              <Text style={styles.switchLabel}>Alert Sounds</Text>
              <Text style={styles.switchDesc}>Play a sound on receiving new updates</Text>
            </View>
            <Switch
              value={preferences.sound_enabled}
              onValueChange={handleToggleSound}
              trackColor={{ false: "#2E2E38", true: "#FF5E2B" }}
            />
          </View>

          <View style={styles.switchRow}>
            <View>
              <Text style={styles.switchLabel}>Haptics & Vibration</Text>
              <Text style={styles.switchDesc}>Vibrate device and trigger haptic tick patterns</Text>
            </View>
            <Switch
              value={preferences.vibration_enabled}
              onValueChange={handleToggleVibration}
              trackColor={{ false: "#2E2E38", true: "#FF5E2B" }}
            />
          </View>
        </View>

        {/* Quiet Hours */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>QUIET HOURS (DND)</Text>
          
          <View style={styles.switchRow}>
            <View>
              <Text style={styles.switchLabel}>Enable Quiet Hours</Text>
              <Text style={styles.switchDesc}>Mute all push sounds and vibrations during schedule</Text>
            </View>
            <Switch
              value={preferences.quiet_hours}
              onValueChange={handleToggleQuietHours}
              trackColor={{ false: "#2E2E38", true: "#FF5E2B" }}
            />
          </View>

          {preferences.quiet_hours && (
            <View style={styles.quietHoursTimeRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.timeLabel}>Start Mute</Text>
                <TextInput
                  style={[styles.timeInput, { borderColor: theme.border, color: theme.onSurface }]}
                  value={preferences.quiet_start}
                  onChangeText={val => updatePreferences({ quiet_start: val })}
                  placeholder="22:00"
                  placeholderTextColor="#64748B"
                />
              </View>
              <View style={{ flex: 1, marginLeft: 16 }}>
                <Text style={styles.timeLabel}>Stop Mute</Text>
                <TextInput
                  style={[styles.timeInput, { borderColor: theme.border, color: theme.onSurface }]}
                  value={preferences.quiet_end}
                  onChangeText={val => updatePreferences({ quiet_end: val })}
                  placeholder="07:00"
                  placeholderTextColor="#64748B"
                />
              </View>
            </View>
          )}
        </View>

        {/* Category Subscriptions */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>FILTER BY CATEGORIES</Text>

          <View style={styles.switchRow}>
            <View>
              <Text style={styles.switchLabel}>Sales & Order Notices</Text>
              <Text style={styles.switchDesc}>New KOT order and checkout bills generated</Text>
            </View>
            <Switch
              value={preferences.categories.sales}
              onValueChange={val => handleUpdateCategory("sales", val)}
              trackColor={{ false: "#2E2E38", true: "#FF5E2B" }}
            />
          </View>

          <View style={styles.switchRow}>
            <View>
              <Text style={styles.switchLabel}>Kitchen Operations</Text>
              <Text style={styles.switchDesc}>KOT updates, food preparation alerts</Text>
            </View>
            <Switch
              value={preferences.categories.kitchen}
              onValueChange={val => handleUpdateCategory("kitchen", val)}
              trackColor={{ false: "#2E2E38", true: "#FF5E2B" }}
            />
          </View>

          <View style={styles.switchRow}>
            <View>
              <Text style={styles.switchLabel}>Waiter Updates</Text>
              <Text style={styles.switchDesc}>Waiter actions, table occupancy triggers</Text>
            </View>
            <Switch
              value={preferences.categories.waiter}
              onValueChange={val => handleUpdateCategory("waiter", val)}
              trackColor={{ false: "#2E2E38", true: "#FF5E2B" }}
            />
          </View>

          <View style={styles.switchRow}>
            <View>
              <Text style={styles.switchLabel}>Cashier Audits</Text>
              <Text style={styles.switchDesc}>Billing summaries, POS status, and receipts</Text>
            </View>
            <Switch
              value={preferences.categories.cashier}
              onValueChange={val => handleUpdateCategory("cashier", val)}
              trackColor={{ false: "#2E2E38", true: "#FF5E2B" }}
            />
          </View>

          <View style={styles.switchRow}>
            <View>
              <Text style={styles.switchLabel}>Payments & Collections</Text>
              <Text style={styles.switchDesc}>UPI, cash, card receipts verified alerts</Text>
            </View>
            <Switch
              value={preferences.categories.payment}
              onValueChange={val => handleUpdateCategory("payment", val)}
              trackColor={{ false: "#2E2E38", true: "#FF5E2B" }}
            />
          </View>

          <View style={styles.switchRow}>
            <View>
              <Text style={styles.switchLabel}>System Status</Text>
              <Text style={styles.switchDesc}>Printer offline errors, cloud sync updates</Text>
            </View>
            <Switch
              value={preferences.categories.system}
              onValueChange={val => handleUpdateCategory("system", val)}
              trackColor={{ false: "#2E2E38", true: "#FF5E2B" }}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 22, fontWeight: "900" },
  sub: { fontSize: 13, marginTop: 2, fontWeight: "500" },
  scroll: { padding: spacing.lg, paddingBottom: 60 },

  card: {
    backgroundColor: "#16161A",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#2E2E38",
    padding: 20,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    color: "#FF5E2B",
    fontSize: 11,
    fontWeight: "bold",
    letterSpacing: 1.2,
    marginBottom: 16,
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#2E2E38",
  },
  switchLabel: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  switchDesc: {
    color: "#94A3B8",
    fontSize: 11,
    marginTop: 2,
    maxWidth: "80%",
  },

  quietHoursTimeRow: {
    flexDirection: "row",
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#2E2E38",
  },
  timeLabel: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
  },
  timeInput: {
    backgroundColor: "#0D0D0D",
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
  },
});
