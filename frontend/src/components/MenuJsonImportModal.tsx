import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { api } from "@/src/lib/api";
import { colors, spacing, radius } from "@/src/theme";
import { useTheme } from "@/src/context/ThemeContext";
import { useResponsive } from "@/src/hooks/useResponsive";

const SAMPLE_MENU_JSON = `[
  {
    "category": "Starters & Appetizers",
    "items": [
      {
        "name": "Paneer Tikka",
        "price": 260,
        "description": "Charcoal grilled marinated cottage cheese cubes with mint chutney",
        "is_veg": true
      },
      {
        "name": "Crispy Chilli Corn",
        "price": 220,
        "description": "Wok-tossed sweet corn kernels with scallions and mild peppers",
        "is_veg": true
      },
      {
        "name": "Chicken Malai Tikka",
        "price": 340,
        "description": "Creamy cashew and cardamom marinated chicken kebab",
        "is_veg": false
      }
    ]
  },
  {
    "category": "Main Course",
    "items": [
      {
        "name": "Butter Chicken Silk",
        "price": 380,
        "description": "Tandoori chicken simmered in rich creamy tomato velvet gravy",
        "is_veg": false
      },
      {
        "name": "Dal Makhani Grand",
        "price": 280,
        "description": "Slow cooked black lentils with churned white butter and cream",
        "is_veg": true
      },
      {
        "name": "Butter Garlic Naan",
        "price": 70,
        "description": "Clay oven charred flatbread infused with roasted garlic",
        "is_veg": true
      }
    ]
  },
  {
    "category": "Beverages & Desserts",
    "items": [
      {
        "name": "Fresh Lime Soda",
        "price": 90,
        "description": "Sweet and salty fizz with fresh mint and crushed ice",
        "is_veg": true
      },
      {
        "name": "Gulab Jamun with Ice Cream",
        "price": 140,
        "description": "Warm saffron dumplings served with vanilla bean scoop",
        "is_veg": true
      }
    ]
  }
]`;

interface MenuJsonImportModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: (stats: any) => void;
  targetTenantId?: string;
  targetRestaurantName?: string;
  isAdmin?: boolean;
}

export default function MenuJsonImportModal({
  visible,
  onClose,
  onSuccess,
  targetTenantId,
  targetRestaurantName,
  isAdmin = false,
}: MenuJsonImportModalProps) {
  const { theme, isDark } = useTheme();
  const { isDesktop } = useResponsive();

  const [jsonText, setJsonText] = useState("");
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Admin restaurant picker
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>(targetTenantId || "");
  const [loadingRestaurants, setLoadingRestaurants] = useState(false);

  useEffect(() => {
    if (targetTenantId) {
      setSelectedTenantId(targetTenantId);
    }
  }, [targetTenantId]);

  useEffect(() => {
    if (visible && isAdmin && !targetTenantId) {
      loadAdminRestaurants();
    }
    if (visible) {
      setErr(null);
      setSuccessMsg(null);
    }
  }, [visible, isAdmin, targetTenantId]);

  const loadAdminRestaurants = async () => {
    setLoadingRestaurants(true);
    try {
      const list = await api.adminListRestaurants();
      setRestaurants(list || []);
      if (list?.length && !selectedTenantId) {
        setSelectedTenantId(list[0].id);
      }
    } catch (e: any) {
      console.warn("Failed to load restaurants for admin import", e);
    } finally {
      setLoadingRestaurants(false);
    }
  };

  // Copy sample template to clipboard
  const handleCopySample = async () => {
    try {
      if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(SAMPLE_MENU_JSON);
      } else {
        // Fallback or RN
        try {
          const { setStringAsync } = require("expo-clipboard");
          await setStringAsync(SAMPLE_MENU_JSON);
        } catch {
          // If expo-clipboard is not present, noop
        }
      }
      setCopied(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setTimeout(() => setCopied(false), 2500);
    } catch (e: any) {
      Alert.alert("Copy Failed", "Please manually select and copy the sample JSON code.");
    }
  };

  // Load sample template directly into the input
  const handleLoadSample = () => {
    setJsonText(SAMPLE_MENU_JSON);
    setErr(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  // Web file upload helper
  const handleFileUpload = () => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json,text/plain";
      input.onchange = (e: any) => {
        const file = e.target.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const content = event.target?.result as string;
            if (content) {
              setJsonText(content);
              setErr(null);
            }
          };
          reader.readAsText(file);
        }
      };
      input.click();
    } else {
      Alert.alert("File Upload", "Please paste your JSON text directly into the input box below.");
    }
  };

  // Real-time JSON validation & preview parser
  const parsedPreview = useMemo(() => {
    const trimmed = jsonText.trim();
    if (!trimmed) return null;

    try {
      const parsed = JSON.parse(trimmed);
      let categories: { name: string; items: any[] }[] = [];

      if (Array.isArray(parsed)) {
        if (parsed.length > 0 && ("category" in parsed[0] || "category_name" in parsed[0] || "items" in parsed[0])) {
          // Array of categories
          categories = parsed.map((c: any, idx: number) => ({
            name: c.category || c.category_name || c.name || `Category ${idx + 1}`,
            items: Array.isArray(c.items || c.dishes) ? (c.items || c.dishes) : [],
          }));
        } else {
          // Flat list of dishes
          const map: Record<string, any[]> = {};
          for (const item of parsed) {
            const cat = item.category || item.category_name || "General Menu";
            if (!map[cat]) map[cat] = [];
            map[cat].push(item);
          }
          categories = Object.entries(map).map(([name, items]) => ({ name, items }));
        }
      } else if (typeof parsed === "object" && parsed !== null) {
        if (Array.isArray(parsed.categories)) {
          categories = parsed.categories.map((c: any, idx: number) => ({
            name: c.category || c.category_name || c.name || `Category ${idx + 1}`,
            items: Array.isArray(c.items || c.dishes) ? (c.items || c.dishes) : [],
          }));
        } else if (Array.isArray(parsed.menu || parsed.items || parsed.dishes)) {
          const list = parsed.menu || parsed.items || parsed.dishes;
          const map: Record<string, any[]> = {};
          for (const item of list) {
            const cat = item.category || item.category_name || "General Menu";
            if (!map[cat]) map[cat] = [];
            map[cat].push(item);
          }
          categories = Object.entries(map).map(([name, items]) => ({ name, items }));
        } else {
          // Key-value object where keys are categories
          for (const [key, val] of Object.entries(parsed)) {
            if (Array.isArray(val)) {
              categories.push({ name: key, items: val });
            }
          }
        }
      }

      const totalDishes = categories.reduce((sum, c) => sum + (c.items?.length || 0), 0);

      return {
        isValid: true,
        categories,
        totalCategories: categories.length,
        totalDishes,
        error: null,
      };
    } catch (e: any) {
      return {
        isValid: false,
        categories: [],
        totalCategories: 0,
        totalDishes: 0,
        error: e.message,
      };
    }
  }, [jsonText]);

  // Submit Import
  const handleImport = async () => {
    if (!jsonText.trim()) {
      setErr("Please input or upload JSON menu data first.");
      return;
    }
    if (!parsedPreview?.isValid || parsedPreview.totalDishes === 0) {
      setErr("Invalid JSON syntax or no dishes found. Please check your data.");
      return;
    }

    const tid = isAdmin ? selectedTenantId : targetTenantId;
    if (isAdmin && !tid) {
      setErr("Please select a target restaurant to import the menu to.");
      return;
    }

    setBusy(true);
    setErr(null);
    setSuccessMsg(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    try {
      let res: any;
      if (isAdmin && tid) {
        res = await api.adminImportRestaurantMenuJson(tid, {
          raw_json: jsonText,
          replace_existing: replaceExisting,
        });
      } else {
        res = await api.importMenuJson({
          tenant_id: tid,
          raw_json: jsonText,
          replace_existing: replaceExisting,
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setSuccessMsg(
        `🎉 Successfully imported ${res.items_created ?? parsedPreview.totalDishes} dishes across ${res.categories_created ?? parsedPreview.totalCategories} categories!`
      );

      if (onSuccess) {
        onSuccess(res);
      }

      setTimeout(() => {
        onClose();
      }, 1600);
    } catch (e: any) {
      setErr(e.message || "Failed to import menu JSON.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const selectedRestObj = restaurants.find((r) => r.id === selectedTenantId);
  const targetDisplayName = targetRestaurantName || selectedRestObj?.name || "Selected Restaurant";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.overlay, isDesktop && styles.overlayDesktop]}>
        <View
          style={[
            styles.modalContainer,
            {
              backgroundColor: theme.surfaceSecondary,
              borderColor: theme.border,
            },
            isDesktop && styles.modalContainerDesktop,
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <View style={{ flex: 1, paddingRight: spacing.md }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={styles.headerIconWrap}>
                  <Ionicons name="code-working" size={20} color="#635BFF" />
                </View>
                <View>
                  <Text style={[styles.title, { color: theme.onSurface }]}>JSON Menu Import & Injector</Text>
                  <Text style={[styles.subtitle, { color: theme.onSurfaceSecondary }]}>
                    {isAdmin
                      ? `Super Admin Direct Menu Provisioning • ${targetDisplayName}`
                      : "Bulk Menu Setup with Auto-Category & Dish Mapping"}
                  </Text>
                </View>
              </View>
            </View>
            <Pressable onPress={onClose} style={[styles.closeBtn, { backgroundColor: theme.surfaceTertiary }]}>
              <Ionicons name="close" size={20} color={theme.onSurface} />
            </Pressable>
          </View>

          <ScrollView style={styles.scrollBody} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Restaurant Selector for Super Admin */}
            {isAdmin && !targetTenantId && (
              <View style={[styles.sectionCard, { backgroundColor: theme.surfaceTertiary, borderColor: theme.border }]}>
                <Text style={[styles.sectionTitle, { color: theme.onSurface }]}>
                  🏢 Target Restaurant ({restaurants.length})
                </Text>
                {loadingRestaurants ? (
                  <ActivityIndicator size="small" color="#635BFF" style={{ marginVertical: 8 }} />
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      {restaurants.map((r) => (
                        <Pressable
                          key={r.id}
                          style={[
                            styles.restPill,
                            { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
                            selectedTenantId === r.id && styles.restPillActive,
                          ]}
                          onPress={() => setSelectedTenantId(r.id)}
                        >
                          <Text
                            style={[
                              styles.restPillText,
                              { color: theme.onSurfaceSecondary },
                              selectedTenantId === r.id && styles.restPillTextActive,
                            ]}
                          >
                            {r.name}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </ScrollView>
                )}
              </View>
            )}

            {/* Template & Quick Actions Bar */}
            <View style={[styles.sectionCard, { backgroundColor: theme.surfaceTertiary, borderColor: theme.border }]}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <View>
                  <Text style={[styles.sectionTitle, { color: theme.onSurface }]}>📋 Sample Data Template</Text>
                  <Text style={{ fontSize: 12, color: theme.onSurfaceSecondary }}>
                    Standard JSON schema with categories, items, prices, veg tags & descriptions
                  </Text>
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable
                    style={[styles.actionBtn, { backgroundColor: copied ? "#064E3B" : theme.surfaceSecondary, borderColor: theme.border }]}
                    onPress={handleCopySample}
                  >
                    <Ionicons name={copied ? "checkmark-circle" : "copy-outline"} size={14} color={copied ? "#34D399" : "#635BFF"} />
                    <Text style={[styles.actionBtnText, { color: copied ? "#34D399" : theme.onSurface }]}>
                      {copied ? "Copied Sample!" : "Copy Sample JSON"}
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[styles.actionBtn, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}
                    onPress={handleLoadSample}
                  >
                    <Ionicons name="flash-outline" size={14} color="#F59E0B" />
                    <Text style={[styles.actionBtnText, { color: theme.onSurface }]}>Load Template</Text>
                  </Pressable>

                  {Platform.OS === "web" && (
                    <Pressable
                      style={[styles.actionBtn, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}
                      onPress={handleFileUpload}
                    >
                      <Ionicons name="cloud-upload-outline" size={14} color="#10B981" />
                      <Text style={[styles.actionBtnText, { color: theme.onSurface }]}>Upload .json</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </View>

            {/* Input Editor Area */}
            <View style={{ marginTop: spacing.md }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <Text style={[styles.inputLabel, { color: theme.onSurface }]}>Paste or Edit JSON Data</Text>
                {parsedPreview && (
                  <View
                    style={[
                      styles.validationBadge,
                      {
                        backgroundColor: parsedPreview.isValid ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                        borderColor: parsedPreview.isValid ? "#10B981" : "#EF4444",
                      },
                    ]}
                  >
                    <Ionicons
                      name={parsedPreview.isValid ? "checkmark-circle" : "alert-circle"}
                      size={13}
                      color={parsedPreview.isValid ? "#10B981" : "#EF4444"}
                    />
                    <Text
                      style={[
                        styles.validationBadgeText,
                        { color: parsedPreview.isValid ? "#10B981" : "#EF4444" },
                      ]}
                    >
                      {parsedPreview.isValid
                        ? `Valid: ${parsedPreview.totalCategories} Categories, ${parsedPreview.totalDishes} Dishes`
                        : "Invalid JSON Syntax"}
                    </Text>
                  </View>
                )}
              </View>

              <View
                style={[
                  styles.codeEditorWrap,
                  {
                    backgroundColor: isDark ? "#0D1117" : "#F8FAFC",
                    borderColor: parsedPreview && !parsedPreview.isValid ? "#EF4444" : theme.border,
                  },
                ]}
              >
                <TextInput
                  value={jsonText}
                  onChangeText={(t) => {
                    setJsonText(t);
                    setErr(null);
                  }}
                  placeholder={`Paste JSON here...\n[\n  {\n    "category": "Starters",\n    "items": [{"name": "Paneer Tikka", "price": 260, "is_veg": true}]\n  }\n]`}
                  placeholderTextColor={theme.onSurfaceTertiary}
                  multiline
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[styles.codeEditor, { color: isDark ? "#E6EDF3" : "#0F172A" }]}
                />
              </View>
            </View>

            {/* Mode Option: Append vs Replace */}
            <View style={[styles.optionCard, { backgroundColor: theme.surfaceTertiary, borderColor: theme.border }]}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[styles.optionTitle, { color: theme.onSurface }]}>Replace Existing Restaurant Menu?</Text>
                <Text style={{ fontSize: 12, color: theme.onSurfaceSecondary }}>
                  {replaceExisting
                    ? "⚠️ Will remove all existing categories and items, then insert this new JSON menu."
                    : "✨ Append mode: Will keep existing menu items and add new ones (creating categories as needed)."}
                </Text>
              </View>
              <View style={{ flexDirection: "row", gap: 6 }}>
                <Pressable
                  style={[
                    styles.modeToggleBtn,
                    { backgroundColor: !replaceExisting ? "#635BFF" : theme.surfaceSecondary, borderColor: theme.border },
                  ]}
                  onPress={() => setReplaceExisting(false)}
                >
                  <Text style={[styles.modeToggleText, { color: !replaceExisting ? "#FFFFFF" : theme.onSurfaceSecondary }]}>
                    Append
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.modeToggleBtn,
                    { backgroundColor: replaceExisting ? "#EF4444" : theme.surfaceSecondary, borderColor: theme.border },
                  ]}
                  onPress={() => setReplaceExisting(true)}
                >
                  <Text style={[styles.modeToggleText, { color: replaceExisting ? "#FFFFFF" : theme.onSurfaceSecondary }]}>
                    Replace
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Live Visual Preview Section */}
            {parsedPreview?.isValid && parsedPreview.categories.length > 0 && (
              <View style={[styles.previewSection, { backgroundColor: theme.surfaceTertiary, borderColor: theme.border }]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <Text style={[styles.sectionTitle, { color: theme.onSurface }]}>
                    👀 Live Menu Structure Preview ({parsedPreview.totalDishes} Dishes)
                  </Text>
                  <Text style={{ fontSize: 11, color: "#10B981", fontWeight: "700" }}>✓ Ready to Import</Text>
                </View>

                {parsedPreview.categories.map((cat, cIdx) => (
                  <View key={cIdx} style={[styles.catPreviewCard, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
                    <View style={styles.catPreviewHeader}>
                      <Ionicons name="folder-open" size={14} color="#635BFF" />
                      <Text style={[styles.catPreviewTitle, { color: theme.onSurface }]}>{cat.name}</Text>
                      <Text style={{ fontSize: 11, color: theme.onSurfaceSecondary, marginLeft: "auto" }}>
                        {cat.items?.length || 0} items
                      </Text>
                    </View>

                    <View style={{ gap: 6, marginTop: 6 }}>
                      {cat.items?.slice(0, 10).map((dish: any, dIdx: number) => {
                        const isVeg = dish.is_veg !== false && dish.veg !== false && dish.type !== "non-veg";
                        return (
                          <View key={dIdx} style={[styles.dishPreviewRow, { borderColor: theme.border }]}>
                            <View style={[styles.vegBadge, { borderColor: isVeg ? "#10B981" : "#EF4444" }]}>
                              <View style={[styles.vegDot, { backgroundColor: isVeg ? "#10B981" : "#EF4444" }]} />
                            </View>
                            <View style={{ flex: 1, marginHorizontal: 8 }}>
                              <Text style={[styles.dishName, { color: theme.onSurface }]}>{dish.name || dish.item_name || "Unnamed Item"}</Text>
                              {!!dish.description && (
                                <Text style={[styles.dishDesc, { color: theme.onSurfaceSecondary }]} numberOfLines={1}>
                                  {dish.description}
                                </Text>
                              )}
                            </View>
                            <Text style={[styles.dishPrice, { color: "#635BFF" }]}>₹{dish.price ?? 0}</Text>
                          </View>
                        );
                      })}
                      {cat.items && cat.items.length > 10 && (
                        <Text style={{ fontSize: 11, color: theme.onSurfaceSecondary, textAlign: "center", marginTop: 4 }}>
                          + {cat.items.length - 10} more items in this category
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Error Message */}
            {err && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color={colors.onError} />
                <Text style={styles.errorText}>{err}</Text>
              </View>
            )}

            {/* Success Message */}
            {successMsg && (
              <View style={styles.successBox}>
                <Ionicons name="checkmark-circle" size={18} color="#34D399" />
                <Text style={styles.successText}>{successMsg}</Text>
              </View>
            )}
          </ScrollView>

          {/* Footer Actions */}
          <View style={[styles.footer, { borderTopColor: theme.border }]}>
            <Pressable style={[styles.cancelBtn, { borderColor: theme.border }]} onPress={onClose} disabled={busy}>
              <Text style={[styles.cancelBtnText, { color: theme.onSurfaceSecondary }]}>Cancel</Text>
            </Pressable>

            <Pressable
              style={[styles.importBtn, (!parsedPreview?.isValid || parsedPreview?.totalDishes === 0 || busy) && { opacity: 0.6 }]}
              onPress={handleImport}
              disabled={!parsedPreview?.isValid || parsedPreview?.totalDishes === 0 || busy}
            >
              <LinearGradient
                colors={["#635BFF", "#4F46E5"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.importBtnGrad}
              >
                {busy ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="cloud-upload" size={18} color="#FFFFFF" />
                    <Text style={styles.importBtnText}>
                      {replaceExisting ? "Replace & Import Menu" : "Import & Sync Menu Now"}
                    </Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "flex-end",
  },
  overlayDesktop: {
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  modalContainer: {
    width: "100%",
    maxHeight: "92%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
  },
  modalContainerDesktop: {
    maxWidth: 780,
    borderRadius: 24,
    maxHeight: "90%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  headerIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(99, 91, 255, 0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollBody: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  sectionCard: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  restPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  restPillActive: {
    backgroundColor: "#635BFF",
    borderColor: "#635BFF",
  },
  restPillText: {
    fontSize: 12,
    fontWeight: "600",
  },
  restPillTextActive: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  validationBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  validationBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  codeEditorWrap: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 8,
    minHeight: 180,
    maxHeight: 260,
  },
  codeEditor: {
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Menlo" : Platform.OS === "android" ? "monospace" : "monospace",
    minHeight: 160,
    textAlignVertical: "top",
  },
  optionCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  optionTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  modeToggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  modeToggleText: {
    fontSize: 12,
    fontWeight: "800",
  },
  previewSection: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  catPreviewCard: {
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: 8,
  },
  catPreviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingBottom: 4,
  },
  catPreviewTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  dishPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  vegBadge: {
    width: 14,
    height: 14,
    borderRadius: 2,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  vegDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dishName: {
    fontSize: 12,
    fontWeight: "700",
  },
  dishDesc: {
    fontSize: 10,
  },
  dishPrice: {
    fontSize: 12,
    fontWeight: "800",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.error,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  errorText: {
    color: colors.onError,
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
  },
  successBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#064E3B",
    padding: spacing.md,
    borderRadius: radius.md,
  },
  successText: {
    color: "#34D399",
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
  },
  cancelBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },
  importBtn: {
    borderRadius: radius.md,
    overflow: "hidden",
  },
  importBtnGrad: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing.xl,
    paddingVertical: 10,
  },
  importBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
});
