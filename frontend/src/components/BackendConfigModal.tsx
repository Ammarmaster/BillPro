import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
  Alert,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/context/ThemeContext";
import { useResponsive } from "@/src/hooks/useResponsive";
import { api, getBackendUrl, getDefaultBackendUrl, setCustomBackendUrl, resetCustomBackendUrl, testBackendHealth } from "@/src/lib/api";
import { spacing, radius } from "@/src/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSuccess?: (newUrl: string) => void;
};

export default function BackendConfigModal({ visible, onClose, onSuccess }: Props) {
  const { theme, isDark } = useTheme();
  const { isDesktop } = useResponsive();

  const [currentUrl, setCurrentUrl] = useState(() => getBackendUrl());
  const [inputUrl, setInputUrl] = useState(() => getBackendUrl());
  const [activeHealth, setActiveHealth] = useState<{ ok: boolean; status?: string; latencyMs: number; error?: string } | null>(null);
  const [testingHealth, setTestingHealth] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; latencyMs?: number; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      const active = getBackendUrl();
      setCurrentUrl(active);
      setInputUrl(active);
      setTestResult(null);
      // Auto-ping current server
      pingCurrentServer(active);
    }
  }, [visible]);

  const pingCurrentServer = async (url: string) => {
    setTestingHealth(true);
    try {
      const res = await testBackendHealth(url);
      setActiveHealth(res);
    } catch {
      setActiveHealth({ ok: false, latencyMs: 0, error: "Ping failed" });
    } finally {
      setTestingHealth(false);
    }
  };

  const handleTestInputUrl = async () => {
    if (!inputUrl.trim()) {
      Alert.alert("Empty URL", "Please enter a valid backend server URL.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setTestingHealth(true);
    setTestResult(null);
    try {
      let candidate = inputUrl.trim();
      if (!/^https?:\/\//i.test(candidate)) {
        candidate = `https://${candidate}`;
      }
      const res = await testBackendHealth(candidate);
      setTestResult(res);
      if (res.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      }
    } catch (err: any) {
      setTestResult({ ok: false, error: err.message || "Failed to reach host" });
    } finally {
      setTestingHealth(false);
    }
  };

  const handleSave = async () => {
    if (!inputUrl.trim()) {
      Alert.alert("Empty URL", "Please enter a valid backend server URL.");
      return;
    }
    setSaving(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      const saved = await setCustomBackendUrl(inputUrl);
      setCurrentUrl(saved);
      Alert.alert(
        "Backend URL Updated",
        `App is now connected to:\n${saved}\n\nNo app rebuild was required!`,
        [
          {
            text: "OK",
            onPress: () => {
              onSuccess?.(saved);
              onClose();
            },
          },
        ]
      );
    } catch (err: any) {
      Alert.alert("Error Saving URL", err.message || "Could not save custom URL.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    Alert.alert(
      "Reset Backend URL",
      `Reset to default cloud server?\n${getDefaultBackendUrl()}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset to Default",
          style: "destructive",
          onPress: async () => {
            const def = await resetCustomBackendUrl();
            setCurrentUrl(def);
            setInputUrl(def);
            pingCurrentServer(def);
            onSuccess?.(def);
            Alert.alert("Reset Successful", "Reverted back to default cloud server.");
          },
        },
      ]
    );
  };

  if (!visible) return null;

  const defaultUrl = getDefaultBackendUrl();
  const isCustom = currentUrl.toLowerCase() !== defaultUrl.toLowerCase();

  return (
    <Modal visible={visible} transparent animationType={isDesktop ? "fade" : "slide"} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, isDesktop && styles.desktopCard, { backgroundColor: isDark ? "#12131A" : "#FFFFFF", borderColor: theme.border }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={[styles.iconBox, { backgroundColor: isDark ? "rgba(6,182,212,0.15)" : "#ECFEFF" }]}>
                <Ionicons name="server" size={20} color="#06B6D4" />
              </View>
              <View>
                <Text style={[styles.title, { color: theme.onSurface }]}>Backend Server URL</Text>
                <Text style={[styles.subtitle, { color: theme.onSurfaceSecondary }]}>
                  Dynamically update API host without rebuilding
                </Text>
              </View>
            </View>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.closeBtn, { backgroundColor: theme.surfaceSecondary, opacity: pressed ? 0.6 : 1 }]}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={20} color={theme.onSurface} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.md }}>
            {/* Active URL & Health Card */}
            <View style={[styles.activeCard, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <Text style={[styles.sectionLabel, { color: theme.onSurfaceSecondary }]}>CURRENT ACTIVE BACKEND</Text>
                {isCustom && (
                  <View style={styles.customBadge}>
                    <Text style={styles.customBadgeText}>CUSTOM HOST</Text>
                  </View>
                )}
              </View>

              <Text style={[styles.activeUrlText, { color: theme.onSurface }]} numberOfLines={2} selectable>
                {currentUrl}
              </Text>

              {/* Ping Health Badge */}
              <View style={styles.healthRow}>
                {testingHealth ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <ActivityIndicator size="small" color="#06B6D4" />
                    <Text style={{ fontSize: 12, color: theme.onSurfaceSecondary }}>Testing server connection...</Text>
                  </View>
                ) : activeHealth ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View style={[styles.healthDot, { backgroundColor: activeHealth.ok ? "#10B981" : "#EF4444" }]} />
                    <Text style={{ fontSize: 12, fontWeight: "700", color: activeHealth.ok ? "#10B981" : "#EF4444" }}>
                      {activeHealth.ok ? `Online (${activeHealth.latencyMs}ms)` : `Offline (${activeHealth.error || "Unreachable"})`}
                    </Text>
                  </View>
                ) : null}

                <Pressable
                  style={styles.recheckBtn}
                  onPress={() => pingCurrentServer(currentUrl)}
                  disabled={testingHealth}
                >
                  <Ionicons name="refresh-outline" size={14} color="#06B6D4" />
                  <Text style={styles.recheckBtnText}>Ping</Text>
                </Pressable>
              </View>
            </View>

            {/* Input New URL */}
            <View style={{ marginTop: spacing.md }}>
              <Text style={[styles.sectionLabel, { color: theme.onSurfaceSecondary, marginBottom: 6 }]}>
                NEW BACKEND SERVER ADDRESS
              </Text>

              <View style={[styles.inputBox, { backgroundColor: isDark ? "#1A1B26" : "#F8FAFC", borderColor: theme.border }]}>
                <Ionicons name="globe-outline" size={18} color="#06B6D4" style={{ marginRight: 8 }} />
                <TextInput
                  style={[styles.input, { color: theme.onSurface }]}
                  value={inputUrl}
                  onChangeText={(val) => {
                    setInputUrl(val);
                    setTestResult(null);
                  }}
                  placeholder="https://api.ezbill.com or http://192.168.1.100:8000"
                  placeholderTextColor={isDark ? "#64748B" : "#94A3B8"}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
                {inputUrl.length > 0 && (
                  <Pressable onPress={() => setInputUrl("")} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color={theme.onSurfaceSecondary} />
                  </Pressable>
                )}
              </View>
              <Text style={[styles.helperText, { color: theme.onSurfaceTertiary }]}>
                Enter full URL including protocol (HTTPS or HTTP) and port if self-hosting.
              </Text>
            </View>

            {/* Quick Presets */}
            <View style={{ marginTop: spacing.md }}>
              <Text style={[styles.sectionLabel, { color: theme.onSurfaceSecondary, marginBottom: 6 }]}>
                QUICK PRESETS
              </Text>
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                <Pressable
                  style={[styles.presetBtn, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}
                  onPress={() => {
                    setInputUrl(defaultUrl);
                    setTestResult(null);
                  }}
                >
                  <Ionicons name="cloud-outline" size={14} color="#635BFF" />
                  <Text style={[styles.presetBtnText, { color: theme.onSurface }]}>Cloud (Render Default)</Text>
                </Pressable>

                <Pressable
                  style={[styles.presetBtn, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}
                  onPress={() => {
                    const devUrl = Platform.OS === "android" ? "http://10.0.2.2:8000" : "http://localhost:8000";
                    setInputUrl(devUrl);
                    setTestResult(null);
                  }}
                >
                  <Ionicons name="laptop-outline" size={14} color="#10B981" />
                  <Text style={[styles.presetBtnText, { color: theme.onSurface }]}>Local Dev (Port 8000)</Text>
                </Pressable>
              </View>
            </View>

            {/* Test Connection Banner */}
            {testResult && (
              <View
                style={[
                  styles.testBanner,
                  {
                    backgroundColor: testResult.ok ? (isDark ? "rgba(16,185,129,0.15)" : "#ECFDF5") : (isDark ? "rgba(239,68,68,0.15)" : "#FEF2F2"),
                    borderColor: testResult.ok ? "#10B981" : "#EF4444",
                  },
                ]}
              >
                <Ionicons
                  name={testResult.ok ? "checkmark-circle" : "alert-circle"}
                  size={20}
                  color={testResult.ok ? "#10B981" : "#EF4444"}
                  style={{ marginRight: 8 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: testResult.ok ? "#10B981" : "#EF4444" }}>
                    {testResult.ok ? "Server Reachable & Live!" : "Connection Failed"}
                  </Text>
                  <Text style={{ fontSize: 11, color: theme.onSurfaceSecondary, marginTop: 2 }}>
                    {testResult.ok ? `Responded in ${testResult.latencyMs}ms. Ready to save.` : (testResult.error || "Please verify the IP, domain, and port.")}
                  </Text>
                </View>
              </View>
            )}

            {/* Buttons Row */}
            <View style={{ flexDirection: "row", gap: 10, marginTop: spacing.lg }}>
              <Pressable
                style={({ pressed }) => [
                  styles.testBtn,
                  { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
                  pressed && { opacity: 0.7 },
                ]}
                onPress={handleTestInputUrl}
                disabled={testingHealth}
              >
                {testingHealth ? (
                  <ActivityIndicator size="small" color="#06B6D4" />
                ) : (
                  <>
                    <Ionicons name="pulse-outline" size={16} color="#06B6D4" />
                    <Text style={[styles.testBtnText, { color: "#06B6D4" }]}>Test URL</Text>
                  </>
                )}
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.saveBtn,
                  pressed && { opacity: 0.8 },
                  saving && { opacity: 0.6 },
                ]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="save-outline" size={16} color="#FFFFFF" />
                    <Text style={styles.saveBtnText}>Save & Apply</Text>
                  </>
                )}
              </Pressable>
            </View>

            {/* Reset to Default */}
            {isCustom && (
              <Pressable style={styles.resetRow} onPress={handleReset}>
                <Ionicons name="refresh" size={14} color="#EF4444" />
                <Text style={styles.resetText}>Reset to Default Cloud Server</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "flex-end",
  },
  card: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    borderWidth: 1,
    maxHeight: "85%",
  },
  desktopCard: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 540,
    borderRadius: 24,
    marginBottom: "auto",
    marginTop: "auto",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 17,
    fontWeight: "900",
  },
  subtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  activeCard: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  customBadge: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
  customBadgeText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#F59E0B",
  },
  activeUrlText: {
    fontSize: 13,
    fontWeight: "800",
    marginTop: 2,
    marginBottom: 8,
  },
  healthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(148, 163, 184, 0.15)",
  },
  healthDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  recheckBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "rgba(6, 182, 212, 0.1)",
  },
  recheckBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#06B6D4",
  },
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    height: 48,
  },
  input: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
  },
  helperText: {
    fontSize: 11,
    marginTop: 4,
  },
  presetBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  presetBtnText: {
    fontSize: 11,
    fontWeight: "700",
  },
  testBanner: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.md,
  },
  testBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 46,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  testBtnText: {
    fontSize: 13,
    fontWeight: "800",
  },
  saveBtn: {
    flex: 1.3,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 46,
    borderRadius: radius.lg,
    backgroundColor: "#06B6D4",
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  resetRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: spacing.lg,
    paddingVertical: 6,
  },
  resetText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#EF4444",
  },
});
