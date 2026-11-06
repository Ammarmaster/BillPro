import React, { useState, useEffect, useRef } from "react";
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
import {
  getBackendUrl, getDefaultBackendUrl, setCustomBackendUrl, resetCustomBackendUrl, testBackendHealth,
  getLiveBackendUrl, getBackupServers, refreshBackupServers, saveBackupServers, checkServer, subscribeToCache,
  type BackupServer, type ServerCheck,
} from "@/src/lib/api";
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

  // Backup servers, shared with every restaurant's app
  const [liveUrl, setLiveUrl] = useState(() => getLiveBackendUrl());
  const [servers, setServers] = useState<BackupServer[]>([]);
  const [edited, setEdited] = useState(false);
  const editedRef = useRef(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [checks, setChecks] = useState<Record<string, ServerCheck | "checking">>({});
  const [listMsg, setListMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingList, setSavingList] = useState(false);

  useEffect(() => {
    if (visible) {
      const active = getBackendUrl();
      setCurrentUrl(active);
      setInputUrl(active);
      setTestResult(null);
      // Auto-ping current server
      pingCurrentServer(active);

      setLiveUrl(getLiveBackendUrl());
      setServers(getBackupServers());
      setEdited(false);
      editedRef.current = false;
      setNewName("");
      setNewUrl("");
      setChecks({});
      setListMsg(null);
      refreshBackupServers()
        .then((list) => { if (!editedRef.current) setServers(list); })
        .catch(() => {});
    }
  }, [visible]);

  useEffect(() => subscribeToCache((path) => {
    if (path === "/system/backend-url") setLiveUrl(getLiveBackendUrl());
  }), []);

  const changeList = (next: BackupServer[]) => {
    editedRef.current = true;
    setEdited(true);
    setServers(next);
  };

  const testServer = async (url: string) => {
    setChecks((c) => ({ ...c, [url]: "checking" }));
    const result = await checkServer(url);
    setChecks((c) => ({ ...c, [url]: result }));
  };

  const handleAddServer = () => {
    const name = newName.trim();
    let url = newUrl.trim().replace(/\/+$/, "");
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
    if (!name) return setListMsg({ ok: false, text: "Give the server a name, like Railway backup." });
    if (!/^https:\/\/[^\s/?#]+[^\s?#]*$/i.test(url)) return setListMsg({ ok: false, text: "Use a full https:// address, like https://my-backup.onrender.com" });
    if (servers.some((s) => s.url.toLowerCase() === url.toLowerCase())) return setListMsg({ ok: false, text: "That address is already in the list." });
    if (servers.length >= 10) return setListMsg({ ok: false, text: "You can add up to 10 servers." });
    changeList([...servers, { name, url }]);
    setNewName("");
    setNewUrl("");
    setListMsg(null);
    testServer(url);
  };

  const handleMoveUp = (index: number) => {
    const next = [...servers];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    changeList(next);
  };

  const handleSaveList = async () => {
    setSavingList(true);
    setListMsg(null);
    try {
      const saved = await saveBackupServers(servers);
      editedRef.current = false;
      setEdited(false);
      setServers(saved);
      setListMsg({
        ok: true,
        text: saved.length
          ? "Saved. Apps get the new list when they open, or within 30 minutes."
          : "Saved. There are no backup servers now.",
      });
    } catch (err: any) {
      setListMsg({ ok: false, text: err.message || "Could not save the list." });
    } finally {
      setSavingList(false);
    }
  };

  const renderCheck = (check?: ServerCheck | "checking") => {
    if (!check) return null;
    if (check === "checking") {
      return (
        <View style={styles.checkRow}>
          <ActivityIndicator size="small" color="#06B6D4" />
          <Text style={[styles.checkText, { color: theme.onSurfaceSecondary }]}>Checking...</Text>
        </View>
      );
    }
    const look = {
      ok: { color: "#10B981", text: "Working" },
      login: { color: "#F59E0B", text: "Online, but your login does not work there. It needs the same database and secret key as your main server." },
      down: { color: "#EF4444", text: "Not reachable" },
    }[check];
    return (
      <View style={styles.checkRow}>
        <View style={[styles.healthDot, { backgroundColor: look.color }]} />
        <Text style={[styles.checkText, { color: look.color }]}>{look.text}</Text>
      </View>
    );
  };

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

              {liveUrl !== currentUrl && (
                <View style={styles.failoverNote} testID="backup-in-use-note">
                  <Ionicons name="swap-horizontal" size={14} color="#F59E0B" />
                  <Text style={[styles.failoverText, { color: theme.onSurface }]}>
                    {`This server is not answering, so this app is using "${servers.find((s) => s.url === liveUrl)?.name || liveUrl}" for now. ` +
                      "It moves back by itself when this server answers again."}
                  </Text>
                </View>
              )}
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

            {/* Backup servers, shared with every restaurant's app */}
            <View style={[styles.backupSection, { borderTopColor: theme.border }]}>
              <Text style={[styles.sectionLabel, { color: theme.onSurfaceSecondary }]}>BACKUP SERVERS</Text>
              <Text style={[styles.helperText, { color: theme.onSurfaceTertiary, marginBottom: spacing.sm }]}>
                {"For every restaurant's app. If the main server stops answering, the app moves to the first backup below " +
                  "that works, and moves back when the main server answers again. Each backup must use the same database " +
                  "and secret keys as your main server."}
              </Text>

              {servers.length === 0 ? (
                <Text style={[styles.emptyText, { color: theme.onSurfaceSecondary }]}>No backup servers yet.</Text>
              ) : (
                servers.map((s, i) => (
                  <View
                    key={s.url}
                    testID={`backup-server-${i}`}
                    style={[styles.serverRow, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={[styles.serverName, { color: theme.onSurface }]} numberOfLines={1}>
                          {i + 1}. {s.name}
                        </Text>
                        {s.url === liveUrl && (
                          <View style={styles.inUseBadge}>
                            <Text style={styles.inUseText}>IN USE</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.serverUrl, { color: theme.onSurfaceSecondary }]} numberOfLines={1} selectable>
                        {s.url}
                      </Text>
                      {renderCheck(checks[s.url])}
                    </View>
                    {i > 0 && (
                      <Pressable style={styles.rowBtn} onPress={() => handleMoveUp(i)} hitSlop={6} accessibilityLabel={`Move ${s.name} up`}>
                        <Ionicons name="arrow-up" size={16} color={theme.onSurfaceSecondary} />
                      </Pressable>
                    )}
                    <Pressable style={styles.rowBtn} onPress={() => testServer(s.url)} hitSlop={6} accessibilityLabel={`Test ${s.name}`}>
                      <Ionicons name="pulse-outline" size={16} color="#06B6D4" />
                    </Pressable>
                    <Pressable
                      style={styles.rowBtn}
                      onPress={() => changeList(servers.filter((x) => x.url !== s.url))}
                      hitSlop={6}
                      accessibilityLabel={`Remove ${s.name}`}
                    >
                      <Ionicons name="trash-outline" size={16} color="#EF4444" />
                    </Pressable>
                  </View>
                ))
              )}

              <View style={[styles.inputBox, { backgroundColor: isDark ? "#1A1B26" : "#F8FAFC", borderColor: theme.border, marginTop: spacing.sm }]}>
                <Ionicons name="pricetag-outline" size={18} color="#06B6D4" style={{ marginRight: 8 }} />
                <TextInput
                  style={[styles.input, { color: theme.onSurface }]}
                  value={newName}
                  onChangeText={(val) => { setNewName(val); setListMsg(null); }}
                  placeholder="Name, like Railway backup"
                  placeholderTextColor={isDark ? "#64748B" : "#94A3B8"}
                  maxLength={40}
                  testID="backup-name-input"
                />
              </View>
              <View style={[styles.inputBox, { backgroundColor: isDark ? "#1A1B26" : "#F8FAFC", borderColor: theme.border, marginTop: 8 }]}>
                <Ionicons name="globe-outline" size={18} color="#06B6D4" style={{ marginRight: 8 }} />
                <TextInput
                  style={[styles.input, { color: theme.onSurface }]}
                  value={newUrl}
                  onChangeText={(val) => { setNewUrl(val); setListMsg(null); }}
                  placeholder="https://my-backup.onrender.com"
                  placeholderTextColor={isDark ? "#64748B" : "#94A3B8"}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  testID="backup-url-input"
                />
              </View>

              {listMsg && (
                <Text style={[styles.listMsg, { color: listMsg.ok ? "#10B981" : "#EF4444" }]} testID="backup-list-msg">
                  {listMsg.text}
                </Text>
              )}
              {edited && !listMsg && (
                <Text style={[styles.listMsg, { color: "#F59E0B" }]}>Changes are not saved yet.</Text>
              )}

              <View style={{ flexDirection: "row", gap: 10, marginTop: spacing.md }}>
                <Pressable
                  style={({ pressed }) => [styles.testBtn, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }, pressed && { opacity: 0.7 }]}
                  onPress={handleAddServer}
                  testID="backup-add-btn"
                >
                  <Ionicons name="add" size={16} color="#06B6D4" />
                  <Text style={[styles.testBtnText, { color: "#06B6D4" }]}>Add to List</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.8 }, savingList && { opacity: 0.6 }]}
                  onPress={handleSaveList}
                  disabled={savingList}
                  testID="backup-save-btn"
                >
                  {savingList ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="cloud-upload-outline" size={16} color="#FFFFFF" />
                      <Text style={styles.saveBtnText}>Save List</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
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
  failoverNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 8,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#F59E0B",
    backgroundColor: "rgba(245, 158, 11, 0.12)",
  },
  failoverText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
  },
  backupSection: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
  },
  emptyText: {
    fontSize: 12,
    fontStyle: "italic",
    marginBottom: 4,
  },
  serverRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: 8,
  },
  serverName: {
    fontSize: 13,
    fontWeight: "800",
    flexShrink: 1,
  },
  serverUrl: {
    fontSize: 11,
    marginTop: 2,
  },
  inUseBadge: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#10B981",
  },
  inUseText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#10B981",
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  checkText: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "700",
  },
  rowBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  listMsg: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 8,
  },
});
