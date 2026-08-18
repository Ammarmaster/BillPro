import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, Pressable,
  ActivityIndicator, SafeAreaView, StatusBar, Alert, FlatList
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/context/ThemeContext";
import { api } from "@/src/lib/api";
import { spacing, radius } from "@/src/theme";

type ExtractedItem = {
  name: string;
  price: number;
  description: string;
  is_veg: boolean;
  confidence: number;
  action?: "create" | "replace" | "skip";
  existing_item_id?: string | null;
  duplicate_name?: string | null;
  original_price?: number | null;
};

type ExtractedCategory = {
  name: string;
  is_existing?: boolean;
  matched_id?: string | null;
  items: ExtractedItem[];
};

export default function MenuAiImportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();

  // Step state: 'upload' | 'analyzing' | 'review'
  const [step, setStep] = useState<"upload" | "analyzing" | "review">("upload");
  const [images, setImages] = useState<string[]>([]);
  const [analyzingStepText, setAnalyzingStepText] = useState("Analyzing menu photos...");
  const [categories, setCategories] = useState<ExtractedCategory[]>([]);
  const [importing, setImporting] = useState(false);
  const [importedData, setImportedData] = useState<{ item_ids: string[]; category_ids: string[] } | null>(null);
  const [showUndo, setShowUndo] = useState(false);

  // -------------------------------------------------------------
  // Step 1: Camera & Gallery Photo Picking
  // -------------------------------------------------------------
  const takePhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission Required", "Camera access is needed to capture menu pages.");
        return;
      }

      const res = await ImagePicker.launchCameraAsync({
        base64: true,
        quality: 0.8,
        allowsEditing: true,
      });

      if (!res.canceled && res.assets[0]?.base64) {
        setImages(prev => [...prev, `data:image/jpeg;base64,${res.assets[0].base64}`]);
      }
    } catch (e: any) {
      Alert.alert("Camera Error", e.message);
    }
  };

  const pickGallery = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission Required", "Gallery access is needed to upload menu photos.");
        return;
      }

      const res = await ImagePicker.launchImageLibraryAsync({
        base64: true,
        quality: 0.8,
        allowsMultipleSelection: true,
      });

      if (!res.canceled && res.assets) {
        const newImages = res.assets.filter(a => a.base64).map(a => `data:image/jpeg;base64,${a.base64}`);
        setImages(prev => [...prev, ...newImages]);
      }
    } catch (e: any) {
      Alert.alert("Gallery Error", e.message);
    }
  };

  const removeImage = (idx: number) => {
    setImages(prev => prev.filter((_, i) => i !== idx));
  };

  // -------------------------------------------------------------
  // Step 2: OCR & AI Processing with Progress Steps
  // -------------------------------------------------------------
  const processMenuPhotos = async () => {
    if (images.length === 0) {
      Alert.alert("No Photos", "Please take or select at least one menu photo first.");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setStep("analyzing");

    const steps = [
      "1. Uploading menu pages...",
      "2. Reading text & layout...",
      "3. Detecting categories...",
      "4. Extracting food items & prices...",
      "5. Checking prices & confidence..."
    ];

    let sIdx = 0;
    const progressTimer = setInterval(() => {
      sIdx++;
      if (sIdx < steps.length) {
        setAnalyzingStepText(steps[sIdx]);
      }
    }, 900);

    try {
      const res = await api.ocrProcessMenu(images);
      clearInterval(progressTimer);

      if (res && res.categories) {
        // Fetch existing menu items to match duplicates
        let existing: any[] = [];
        try {
          existing = await api.listMenu();
        } catch (_) {}

        const normalizeName = (n: string) => n.toLowerCase().replace(/[^a-z0-9]/g, "").trim();

        // Enforce actions on items: "create" | "replace" | "skip"
        const processedCategories = res.categories.map((c: any) => {
          return {
            ...c,
            items: (c.items || []).map((it: any) => {
              const normalizedExtracted = normalizeName(it.name);
              const matchedItem = existing.find(e => normalizeName(e.name) === normalizedExtracted);
              
              return {
                ...it,
                action: matchedItem ? "skip" : "create", // Default duplicate resolution is to skip
                existing_item_id: matchedItem ? matchedItem.id : null,
                duplicate_name: matchedItem ? matchedItem.name : null,
                original_price: matchedItem ? matchedItem.price : null
              };
            })
          };
        });

        setCategories(processedCategories);
        setStep("review");
      } else {
        throw new Error("Could not parse menu structure.");
      }
    } catch (e: any) {
      clearInterval(progressTimer);
      Alert.alert("Processing Error", e.message || "Failed to extract menu. Please check images and try again.");
      setStep("upload");
    }
  };

  // -------------------------------------------------------------
  // Step 3: Interactive Review & Editing
  // -------------------------------------------------------------
  const updateCategoryName = (catIdx: number, newName: string) => {
    setCategories(prev => {
      const copy = [...prev];
      copy[catIdx].name = newName;
      return copy;
    });
  };

  const updateItem = (catIdx: number, itemIdx: number, field: keyof ExtractedItem, val: any) => {
    setCategories(prev => {
      const copy = [...prev];
      const items = [...copy[catIdx].items];
      items[itemIdx] = { ...items[itemIdx], [field]: val };
      copy[catIdx].items = items;
      return copy;
    });
  };

  const deleteItem = (catIdx: number, itemIdx: number) => {
    setCategories(prev => {
      const copy = [...prev];
      copy[catIdx].items = copy[catIdx].items.filter((_, i) => i !== itemIdx);
      return copy;
    });
  };

  const addItemToCategory = (catIdx: number) => {
    setCategories(prev => {
      const copy = [...prev];
      copy[catIdx].items.push({
        name: "New Food Item",
        price: 150,
        description: "",
        is_veg: true,
        confidence: 1.0
      });
      return copy;
    });
  };

  const deleteCategory = (catIdx: number) => {
    setCategories(prev => prev.filter((_, i) => i !== catIdx));
  };

  const addCategory = () => {
    setCategories(prev => [
      ...prev,
      {
        name: "New Category",
        is_existing: false,
        items: [
          { name: "Sample Item", price: 100, description: "", is_veg: true, confidence: 1.0 }
        ]
      }
    ]);
  };

  const handleBulkImport = async () => {
    if (categories.length === 0) {
      Alert.alert("Empty Menu", "Please have at least one category before importing.");
      return;
    }

    setImporting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});

    try {
      const payloadCategories = categories.map(c => ({
        name: c.name.trim(),
        category_id: c.matched_id || undefined,
        items: c.items.map(it => ({
          name: it.name.trim(),
          price: Number(it.price) || 0,
          description: it.description || "",
          is_veg: Boolean(it.is_veg),
          action: it.action || "create",
          existing_item_id: it.existing_item_id || undefined
        }))
      }));

      const res = await api.bulkImportMenu(payloadCategories);
      
      // Save created IDs for Undo
      if (res.imported_item_ids && res.imported_category_ids) {
        setImportedData({
          item_ids: res.imported_item_ids,
          category_ids: res.imported_category_ids
        });
        setShowUndo(true);
      }

      Alert.alert(
        "🎉 Import Successful!",
        res.message || `Menu items successfully processed!`,
        [
          {
            text: "View Menu",
            onPress: () => router.back()
          }
        ]
      );
    } catch (e: any) {
      Alert.alert("Import Failed", e.message);
    } finally {
      setImporting(false);
    }
  };

  const handleUndoImport = async () => {
    if (!importedData) return;
    setImporting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const res = await api.rollbackBulkImport(importedData.item_ids, importedData.category_ids);
      setShowUndo(false);
      setImportedData(null);
      Alert.alert("Import Undone", res.message || "reverted the imported records successfully.");
    } catch (e: any) {
      Alert.alert("Undo Failed", e.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.surface }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.surface} />
      
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { borderColor: theme.border }]}>
          <Ionicons name="chevron-back" size={20} color={theme.onSurface} />
        </Pressable>
        <View style={{ marginLeft: spacing.md, flex: 1 }}>
          <Text style={[styles.title, { color: theme.onSurface }]}>AI Menu from Photos</Text>
          <Text style={[styles.sub, { color: theme.onSurfaceSecondary }]}>Scan physical menu cards into digital items</Text>
        </View>
      </View>

      {/* ----------------- STEP 1: PHOTO CAPTURE ----------------- */}
      {step === "upload" && (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={[styles.card, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
            <View style={styles.iconCircle}>
              <Ionicons name="camera-outline" size={32} color="#635BFF" />
            </View>
            <Text style={[styles.cardTitle, { color: theme.onSurface }]}>Take Photos of Menu Pages</Text>
            <Text style={[styles.cardDesc, { color: theme.onSurfaceSecondary }]}>
              Capture all pages of your physical restaurant menu. Our Vision AI will automatically detect categories, item names, prices, and descriptions.
            </Text>

            <View style={styles.btnRow}>
              <Pressable style={styles.primaryBtn} onPress={takePhoto}>
                <Ionicons name="camera" size={18} color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>Take Photo</Text>
              </Pressable>
              <Pressable style={styles.secondaryBtn} onPress={pickGallery}>
                <Ionicons name="images-outline" size={18} color="#635BFF" />
                <Text style={styles.secondaryBtnText}>Choose Gallery</Text>
              </Pressable>
            </View>
          </View>

          {/* Uploaded Photos Grid */}
          {images.length > 0 && (
            <View style={{ marginTop: spacing.xl }}>
              <Text style={[styles.sectionLabel, { color: theme.onSurface }]}>
                Uploaded Pages ({images.length})
              </Text>
              
              <View style={styles.imageGrid}>
                {images.map((uri, idx) => (
                  <View key={idx} style={styles.imageThumbBox}>
                    <Image source={{ uri }} style={styles.imageThumb} contentFit="cover" />
                    <View style={styles.pageBadge}>
                      <Text style={styles.pageBadgeText}>Page {idx + 1}</Text>
                    </View>
                    <Pressable style={styles.removeBadge} onPress={() => removeImage(idx)}>
                      <Ionicons name="close" size={14} color="#FFFFFF" />
                    </Pressable>
                  </View>
                ))}
              </View>

              <Pressable style={styles.processBtn} onPress={processMenuPhotos}>
                <Ionicons name="sparkles" size={20} color="#FFFFFF" />
                <Text style={styles.processBtnText}>Process Menu with AI</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      )}

      {/* ----------------- STEP 2: ANALYZING ----------------- */}
      {step === "analyzing" && (
        <View style={[styles.center, { backgroundColor: theme.surface }]}>
          <ActivityIndicator size="large" color="#635BFF" />
          <Text style={[styles.analyzingTitle, { color: theme.onSurface }]}>AI Menu Extraction</Text>
          <Text style={[styles.analyzingSub, { color: theme.onSurfaceSecondary }]}>{analyzingStepText}</Text>
          <View style={styles.progressTrack}>
            <View style={styles.progressBar} />
          </View>
        </View>
      )}

      {/* ----------------- STEP 3: REVIEW & EDIT MENU ----------------- */}
      {step === "review" && (
        <View style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.reviewBanner}>
              <Ionicons name="checkmark-circle" size={20} color="#10B981" />
              <Text style={styles.reviewBannerText}>
                Review extracted items and prices below before importing to your live menu.
              </Text>
            </View>

            {categories.map((cat, catIdx) => (
              <View key={catIdx} style={[styles.catCard, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
                {/* Category Header */}
                <View style={styles.catHeader}>
                  <TextInput
                    style={[styles.catNameInput, { color: theme.onSurface }]}
                    value={cat.name}
                    onChangeText={txt => updateCategoryName(catIdx, txt)}
                    placeholder="Category Name"
                    placeholderTextColor="#64748B"
                  />
                  
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    {cat.is_existing && (
                      <View style={styles.matchedBadge}>
                        <Text style={styles.matchedBadgeText}>Existing Cat</Text>
                      </View>
                    )}
                    <Pressable onPress={() => deleteCategory(catIdx)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    </Pressable>
                  </View>
                </View>

                {/* Items in this category */}
                {cat.items.map((item, itemIdx) => {
                  const isUncertain = item.confidence < 0.85 || isNaN(item.price) || item.price <= 0;
                  const isDuplicate = !!item.duplicate_name;
                  return (
                    <View
                      key={itemIdx}
                      style={[
                        styles.itemBox,
                        isUncertain && styles.itemBoxUncertain,
                        isDuplicate && item.action === "skip" && { borderColor: "#635BFF", backgroundColor: isDark ? "rgba(99,91,255,0.05)" : "#EEF2FF" },
                        item.action === "skip" && { opacity: 0.7 }
                      ]}
                    >
                      {isUncertain && (
                        <View style={styles.uncertainWarning}>
                          <Ionicons name="alert-circle" size={14} color="#F59E0B" />
                          <Text style={styles.uncertainWarningText}>Please verify price or name</Text>
                        </View>
                      )}

                      {isDuplicate && (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8, backgroundColor: "rgba(99,91,255,0.1)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                          <Ionicons name="copy-outline" size={12} color="#635BFF" />
                          <Text style={{ fontSize: 11, color: "#635BFF", fontWeight: "700", flex: 1 }}>
                            Duplicate of "{item.duplicate_name}" (₹{item.original_price})
                          </Text>
                        </View>
                      )}

                      <View style={styles.itemRowTop}>
                        {/* Veg / Non-Veg Toggle */}
                        <Pressable
                          style={[styles.vegPill, item.is_veg ? styles.vegPillActive : styles.nonVegPillActive]}
                          onPress={() => updateItem(catIdx, itemIdx, "is_veg", !item.is_veg)}
                        >
                          <Text style={styles.vegPillText}>{item.is_veg ? "🟢 Veg" : "🔴 Non-Veg"}</Text>
                        </Pressable>

                        <TextInput
                          style={[styles.itemNameInput, { color: theme.onSurface }]}
                          value={item.name}
                          onChangeText={txt => updateItem(catIdx, itemIdx, "name", txt)}
                          placeholder="Food Item Name"
                          placeholderTextColor="#64748B"
                        />

                        <View style={styles.priceContainer}>
                          <Text style={styles.rupeePrefix}>₹</Text>
                          <TextInput
                            style={styles.priceInput}
                            value={String(item.price)}
                            onChangeText={txt => updateItem(catIdx, itemIdx, "price", parseFloat(txt) || 0)}
                            keyboardType="numeric"
                            placeholder="0"
                            placeholderTextColor="#64748B"
                          />
                        </View>

                        <Pressable onPress={() => deleteItem(catIdx, itemIdx)} hitSlop={8}>
                          <Ionicons name="close-circle-outline" size={20} color="#94A3B8" />
                        </Pressable>
                      </View>

                      {/* Description Input */}
                      <TextInput
                        style={[styles.itemDescInput, { color: theme.onSurfaceSecondary }]}
                        value={item.description}
                        onChangeText={txt => updateItem(catIdx, itemIdx, "description", txt)}
                        placeholder="Optional description / details"
                        placeholderTextColor="#475569"
                      />

                      {/* Duplicate Resolution Pills */}
                      {isDuplicate && (
                        <View style={{ flexDirection: "row", gap: 8, marginTop: 8, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 8 }}>
                          <Pressable
                            style={[
                              { flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: "center", borderWidth: 1, borderColor: theme.border },
                              item.action === "skip" && { backgroundColor: "#635BFF", borderColor: "#635BFF" }
                            ]}
                            onPress={() => updateItem(catIdx, itemIdx, "action", "skip")}
                          >
                            <Text style={[{ fontSize: 11, fontWeight: "700", color: theme.onSurfaceSecondary }, item.action === "skip" && { color: "#FFF" }]}>
                              Skip
                            </Text>
                          </Pressable>
                          
                          <Pressable
                            style={[
                              { flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: "center", borderWidth: 1, borderColor: theme.border },
                              item.action === "replace" && { backgroundColor: "#E0F2FE", borderColor: "#0284C7" }
                            ]}
                            onPress={() => updateItem(catIdx, itemIdx, "action", "replace")}
                          >
                            <Text style={[{ fontSize: 11, fontWeight: "700", color: theme.onSurfaceSecondary }, item.action === "replace" && { color: "#0284C7" }]}>
                              Replace Price
                            </Text>
                          </Pressable>

                          <Pressable
                            style={[
                              { flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: "center", borderWidth: 1, borderColor: theme.border },
                              item.action === "create" && { backgroundColor: "#DCFCE7", borderColor: "#15803D" }
                            ]}
                            onPress={() => updateItem(catIdx, itemIdx, "action", "create")}
                          >
                            <Text style={[{ fontSize: 11, fontWeight: "700", color: theme.onSurfaceSecondary }, item.action === "create" && { color: "#15803D" }]}>
                              Keep Both
                            </Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  );
                })}

                <Pressable style={styles.addItemBtn} onPress={() => addItemToCategory(catIdx)}>
                  <Ionicons name="add" size={16} color="#635BFF" />
                  <Text style={styles.addItemBtnText}>+ Add Item to {cat.name}</Text>
                </Pressable>
              </View>
            ))}

            <Pressable style={styles.addCatBtn} onPress={addCategory}>
              <Ionicons name="add-circle-outline" size={20} color="#635BFF" />
              <Text style={styles.addCatBtnText}>+ Add New Category</Text>
            </Pressable>
          </ScrollView>

          {/* Bottom Import Confirmation Bar */}
          <View style={[styles.bottomBar, { backgroundColor: theme.surface, borderTopColor: theme.border, paddingBottom: Math.max(insets.bottom, 16) }]}>
            {showUndo ? (
              <View style={{ flexDirection: "row", gap: 12 }}>
                <Pressable
                  style={[styles.importBtn, { backgroundColor: "#EF4444", flex: 1 }]}
                  onPress={handleUndoImport}
                  disabled={importing}
                >
                  {importing ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="refresh" size={20} color="#FFFFFF" />
                      <Text style={styles.importBtnText}>Undo Import</Text>
                    </>
                  )}
                </Pressable>
                <Pressable
                  style={[styles.importBtn, { backgroundColor: "#10B981", flex: 1 }]}
                  onPress={() => router.back()}
                >
                  <Text style={styles.importBtnText}>View Menu</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={[styles.importBtn, importing && { opacity: 0.6 }]}
                onPress={handleBulkImport}
                disabled={importing}
              >
                {importing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="cloud-upload" size={20} color="#FFFFFF" />
                    <Text style={styles.importBtnText}>Import Menu to Restaurant</Text>
                  </>
                )}
              </Pressable>
            )}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  title: { fontSize: 20, fontWeight: "800" },
  sub: { fontSize: 12, marginTop: 2, fontWeight: "500" },
  scroll: { padding: spacing.lg, paddingBottom: 100 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.xl },

  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: spacing.xl,
    alignItems: "center",
    textAlign: "center",
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(99, 91, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  cardTitle: { fontSize: 18, fontWeight: "800", marginBottom: 6, textAlign: "center" },
  cardDesc: { fontSize: 13, textAlign: "center", lineHeight: 20, marginBottom: spacing.xl },

  btnRow: { flexDirection: "row", gap: 12, width: "100%" },
  primaryBtn: {
    flex: 1,
    height: 48,
    backgroundColor: "#635BFF",
    borderRadius: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  primaryBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  secondaryBtn: {
    flex: 1,
    height: 48,
    backgroundColor: "rgba(99, 91, 255, 0.1)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(99, 91, 255, 0.3)",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  secondaryBtnText: { color: "#635BFF", fontSize: 14, fontWeight: "700" },

  sectionLabel: { fontSize: 15, fontWeight: "800", marginBottom: spacing.md },
  imageGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  imageThumbBox: { width: 100, height: 130, borderRadius: 14, overflow: "hidden", position: "relative" },
  imageThumb: { width: "100%", height: "100%" },
  pageBadge: { position: "absolute", bottom: 6, left: 6, backgroundColor: "rgba(0,0,0,0.7)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  pageBadgeText: { color: "#FFF", fontSize: 10, fontWeight: "700" },
  removeBadge: { position: "absolute", top: 6, right: 6, backgroundColor: "#EF4444", width: 22, height: 22, borderRadius: 11, justifyContent: "center", alignItems: "center" },

  processBtn: {
    height: 52,
    backgroundColor: "#635BFF",
    borderRadius: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    marginTop: spacing.xl,
  },
  processBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },

  analyzingTitle: { fontSize: 18, fontWeight: "800", marginTop: 20 },
  analyzingSub: { fontSize: 14, marginTop: 8 },
  progressTrack: { width: 220, height: 6, backgroundColor: "#E2E8F0", borderRadius: 3, marginTop: 20, overflow: "hidden" },
  progressBar: { width: "60%", height: "100%", backgroundColor: "#635BFF" },

  reviewBanner: {
    backgroundColor: "#DCFCE7",
    padding: 12,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: spacing.lg,
  },
  reviewBannerText: { color: "#16A34A", fontSize: 13, fontWeight: "600", flex: 1 },

  catCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  catHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  catNameInput: { fontSize: 17, fontWeight: "800", flex: 1, paddingVertical: 4 },
  matchedBadge: { backgroundColor: "#EEF2FF", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  matchedBadgeText: { color: "#635BFF", fontSize: 11, fontWeight: "700" },

  itemBox: {
    backgroundColor: "rgba(0,0,0,0.02)",
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "transparent",
  },
  itemBoxUncertain: {
    borderColor: "#F59E0B",
    backgroundColor: "rgba(245, 158, 11, 0.05)",
  },
  uncertainWarning: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 6 },
  uncertainWarningText: { fontSize: 11, color: "#F59E0B", fontWeight: "700" },

  itemRowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  vegPill: { paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6, backgroundColor: "#E2E8F0" },
  vegPillActive: { backgroundColor: "#DCFCE7" },
  nonVegPillActive: { backgroundColor: "#FEE2E2" },
  vegPillText: { fontSize: 10, fontWeight: "700" },
  itemNameInput: { flex: 1, fontSize: 14, fontWeight: "700", paddingVertical: 2 },
  priceContainer: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(99,91,255,0.08)", paddingHorizontal: 8, borderRadius: 8 },
  rupeePrefix: { fontSize: 13, fontWeight: "700", color: "#635BFF" },
  priceInput: { fontSize: 14, fontWeight: "800", color: "#635BFF", minWidth: 40, paddingVertical: 4 },
  itemDescInput: { fontSize: 12, marginTop: 4, paddingVertical: 2 },

  addItemBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 8, gap: 6, marginTop: 4 },
  addItemBtnText: { color: "#635BFF", fontSize: 13, fontWeight: "700" },

  addCatBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#635BFF",
    borderStyle: "dashed",
    gap: 8,
    marginBottom: spacing.xl,
  },
  addCatBtnText: { color: "#635BFF", fontSize: 15, fontWeight: "700" },

  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.md,
    borderTopWidth: 1,
  },
  importBtn: {
    height: 52,
    backgroundColor: "#10B981",
    borderRadius: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  importBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
});
