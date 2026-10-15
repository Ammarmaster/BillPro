import { useCallback, useState, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, Pressable, Modal,
  ActivityIndicator, FlatList,
} from "react-native";
import { Image } from "expo-image";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { pickImageBase64 } from "@/src/lib/imagePicker";
import { menuItemImageSource, foodImageUrl, generateAiDishImageUrl } from "@/src/lib/foodImage";
import { useTheme } from "@/src/context/ThemeContext";
import { colors, spacing, radius } from "@/src/theme";
import { useResponsive } from "@/src/hooks/useResponsive";
import MenuJsonImportModal from "@/src/components/MenuJsonImportModal";

type Cat = { id: string; name: string; sort_order: number };
type Item = { id: string; category_id: string; name: string; description: string; price: number; image_base64?: string; image_url?: string; is_active: boolean };

export default function MenuScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isDark } = useTheme();
  const { isDesktop, isLargeDesktop } = useResponsive();
  const [cats, setCats] = useState<Cat[]>(() => api.getCachedCategories() || []);
  const [items, setItems] = useState<Item[]>(() => api.getCachedMenu() || []);
  const [selCat, setSelCat] = useState<string | "all">("all");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [catModal, setCatModal] = useState(false);
  const [catName, setCatName] = useState("");

  const [jsonImportModal, setJsonImportModal] = useState(false);

  const [itemModal, setItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [iName, setIName] = useState("");
  const [iPrice, setIPrice] = useState("");
  const [iDesc, setIDesc] = useState("");
  const [iCat, setICat] = useState<string>("");
  const [iImg, setIImg] = useState<string>("");
  const [iImgUrl, setIImgUrl] = useState<string>("");
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [aiImgLoading, setAiImgLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const { subscribeToCache } = require("@/src/lib/api");
    const unsubscribe = subscribeToCache((path: string, data: any) => {
      if (path === "/categories" && data) setCats(data);
      if (path === "/menu-items" && data) setItems(data);
    });
    return () => unsubscribe();
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [c, m] = await Promise.all([api.listCategories(), api.listMenu()]);
      setCats(c); setItems(m);
      if (c.length && !iCat) setICat(c[0].id);
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, [iCat]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pickImg = async () => {
    try { const b = await pickImageBase64(0.5); if (b) { setIImg(b); setIImgUrl(""); } }
    catch (e: any) { setErr(e.message); }
  };

  const handleAutoAssignImages = async () => {
    setAutoAssigning(true);
    setErr(null);
    try {
      const res: any = await api.autoAssignMenuImages(false);
      await load();
      alert(res?.message || "Accurate AI dish photos auto-assigned!");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setAutoAssigning(false);
    }
  };

  const addCat = async () => {
    if (!catName.trim()) return;
    setBusy(true);
    try { await api.createCategory({ name: catName.trim(), sort_order: cats.length }); setCatName(""); setCatModal(false); await load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const saveItem = async () => {
    const price = parseFloat(iPrice);
    if (!iName.trim() || !iCat || isNaN(price) || price <= 0) { setErr("Fill name, category, valid price."); return; }
    setBusy(true);
    try {
      if (editingItem) {
        // Update existing item
        await api.updateMenuItem(editingItem.id, {
          category_id: iCat,
          name: iName.trim(),
          description: iDesc,
          price,
          image_base64: iImg || undefined,
          image_url: iImgUrl || undefined,
          is_active: editingItem.is_active
        });
      } else {
        // Create new item
        const autoUrl = iImgUrl || foodImageUrl(iName.trim());
        await api.createMenuItem({
          category_id: iCat,
          name: iName.trim(),
          description: iDesc,
          price,
          image_base64: iImg,
          image_url: autoUrl,
          is_active: true
        });
      }
      setIName(""); setIPrice(""); setIDesc(""); setIImg(""); setIImgUrl(""); setEditingItem(null); setItemModal(false);
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const delItem = async (id: string) => { try { await api.deleteMenuItem(id); await load(); } catch (e: any) { setErr(e.message); } };

  const shown = selCat === "all" ? items : items.filter(i => i.category_id === selCat);
  const numCols = isLargeDesktop ? 3 : isDesktop ? 2 : 1;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]} testID="menu-screen">
      <View style={[{ flex: 1, width: "100%" }, isDesktop && { maxWidth: 1300, alignSelf: "center" }]}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Pressable onPress={() => router.replace("/(app)/more")} style={styles.backBtn} hitSlop={12}>
              <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
            </Pressable>
            <Text style={styles.title} numberOfLines={1}>Menu</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.headerRightScroll}
            style={styles.headerRightWrap}
          >
            <Pressable
              style={styles.iconBtn}
              onPress={handleAutoAssignImages}
              disabled={autoAssigning}
              testID="menu-auto-photos-btn"
            >
              {autoAssigning ? (
                <ActivityIndicator size="small" color={colors.brand} />
              ) : (
                <>
                  <Ionicons name="sparkles" size={15} color={colors.brand} />
                  <Text style={styles.iconBtnText}>AI Photos</Text>
                </>
              )}
            </Pressable>
            <Pressable style={styles.iconBtn} onPress={() => router.push("/(app)/menu-ai-import")} testID="menu-photo-import-btn">
              <Ionicons name="camera" size={15} color={colors.brand} />
              <Text style={styles.iconBtnText}>Photo to Menu</Text>
            </Pressable>
            <Pressable style={styles.iconBtn} onPress={() => setJsonImportModal(true)} testID="menu-json-import-btn">
              <Ionicons name="code-working" size={15} color={colors.brand} />
              <Text style={styles.iconBtnText}>JSON Import</Text>
            </Pressable>
            <Pressable style={styles.iconBtn} onPress={() => setCatModal(true)} testID="menu-add-category-btn">
              <Ionicons name="folder" size={15} color={colors.brand} />
              <Text style={styles.iconBtnText}>Category</Text>
            </Pressable>
            <Pressable style={styles.iconBtnPrimary} onPress={() => {
              if (!cats.length) { setErr("Add a category first."); return; }
              setEditingItem(null);
              setIName("");
              setIPrice("");
              setIDesc("");
              setIImg("");
              setIImgUrl("");
              setICat(cats[0].id);
              setItemModal(true);
            }} testID="menu-add-item-btn">
              <Ionicons name="add" size={16} color={colors.onBrand} />
              <Text style={styles.iconBtnPrimaryText}>Item</Text>
            </Pressable>
          </ScrollView>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow} style={styles.chipsWrap}>
          <Chip label="All" active={selCat === "all"} onPress={() => setSelCat("all")} testID="chip-all" />
          {cats.map(c => (
            <Chip key={c.id} label={c.name} active={selCat === c.id} onPress={() => setSelCat(c.id)} testID={`chip-${c.id}`} />
          ))}
        </ScrollView>

        {loading ? (
          <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
        ) : shown.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="fast-food" size={48} color={colors.onSurfaceTertiary} />
            <Text style={styles.emptyText}>No items yet</Text>
          </View>
        ) : (
          <FlatList
            key={`menu-list-${numCols}`}
            data={shown}
            numColumns={numCols}
            keyExtractor={i => i.id}
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
            columnWrapperStyle={numCols > 1 ? { gap: spacing.md } : undefined}
            renderItem={({ item, index }) => (
              <Pressable
                style={{ flex: 1 }}
                onPress={() => {
                  setEditingItem(item);
                  setIName(item.name);
                  setIPrice(String(item.price));
                  setIDesc(item.description || "");
                  setICat(item.category_id);
                  setIImg(item.image_base64 || "");
                  setIImgUrl(item.image_url || "");
                  setItemModal(true);
                }}
              >
                <Animated.View entering={FadeInUp.delay(index * 40).springify()} style={styles.itemCard} testID={`menu-item-${item.id}`}>
                  <Image source={menuItemImageSource(item)} style={styles.itemImg} contentFit="cover" transition={200} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    {!!item.description && <Text style={styles.itemDesc} numberOfLines={1}>{item.description}</Text>}
                    <Text style={styles.itemPrice}>₹{item.price}</Text>
                  </View>
                  <Pressable onPress={() => delItem(item.id)} hitSlop={8} testID={`menu-item-delete-${item.id}`}>
                    <Ionicons name="trash" size={20} color={colors.onError} />
                  </Pressable>
                </Animated.View>
              </Pressable>
            )}
          />
        )}

        {err && <Text style={styles.err} testID="menu-error">{err}</Text>}

        <Modal transparent visible={catModal} animationType="slide" onRequestClose={() => setCatModal(false)}>
          <View style={[styles.modalBg, isDesktop && { justifyContent: "center", alignItems: "center", padding: spacing.xl }]}>
            <View style={[
              styles.modalCard, 
              { 
                paddingBottom: isDesktop ? spacing.xl : insets.bottom + spacing.xl,
                width: isDesktop ? 460 : "100%",
                borderRadius: isDesktop ? 20 : radius.lg,
              }
            ]}>
              <Text style={styles.modalTitle}>New Category</Text>
              <TextInput value={catName} onChangeText={setCatName} placeholder="e.g. Starters" placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} testID="cat-name-input" />
              <View style={styles.modalActions}>
                <Pressable style={styles.ghostBtn} onPress={() => setCatModal(false)} testID="cat-cancel-btn">
                  <Text style={styles.ghostBtnText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.primaryBtn} onPress={addCat} disabled={busy} testID="cat-save-btn">
                  {busy ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.primaryText}>Save</Text>}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal transparent visible={itemModal} animationType="slide" onRequestClose={() => { setEditingItem(null); setItemModal(false); }}>
          <View style={[styles.modalBg, isDesktop && { justifyContent: "center", alignItems: "center", padding: spacing.xl }]}>
            <ScrollView 
              contentContainerStyle={[
                styles.modalCard, 
                { 
                  paddingBottom: isDesktop ? spacing.xl : insets.bottom + spacing.xl,
                  width: isDesktop ? 520 : "100%",
                  borderRadius: isDesktop ? 20 : radius.lg,
                  alignSelf: isDesktop ? "center" : undefined,
                }
              ]}
              style={isDesktop ? { maxHeight: "90%", width: 520, flexGrow: 0 } : undefined}
            >
              <Text style={styles.modalTitle}>{editingItem ? "Edit Menu Item" : "New Menu Item"}</Text>

              <Pressable style={styles.imgPickerRow} onPress={pickImg} testID="item-image-picker">
                {iImg ? (
                  <Image source={{ uri: iImg.startsWith("data:") ? iImg : `data:image/jpeg;base64,${iImg}` }} style={styles.imgPreview} contentFit="cover" />
                ) : iImgUrl ? (
                  <Image source={{ uri: iImgUrl }} style={styles.imgPreview} contentFit="cover" />
                ) : (
                  <View style={styles.imgPlaceholder}>
                    <Ionicons name="image" size={26} color={colors.onSurfaceSecondary} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.imgPickerTitle}>{iImg || iImgUrl ? "Change photo" : "Add photo"}</Text>
                  <Text style={styles.imgPickerHint}>Upload photo or generate with free AI model.</Text>
                </View>
                <Ionicons name="camera" size={22} color={colors.brand} />
              </Pressable>

              <View style={{ flexDirection: "row", gap: 8, marginBottom: spacing.md, alignItems: "center" }}>
                <Pressable
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: radius.sm,
                    backgroundColor: isDark ? "rgba(99,91,255,0.18)" : "#EEF2FF",
                    borderColor: "#635BFF",
                    borderWidth: 1,
                  }}
                  onPress={async () => {
                    if (!iName.trim()) {
                      setErr("Enter dish name first to generate AI photo.");
                      return;
                    }
                    setAiImgLoading(true);
                    setErr(null);
                    try {
                      const res = await api.generateMenuImage(iName.trim());
                      if (res?.image_base64) {
                        setIImg(res.image_base64);
                        setIImgUrl("");
                      } else if (res?.image_url) {
                        setIImgUrl(res.image_url);
                        setIImg("");
                      } else {
                        const fallbackUrl = generateAiDishImageUrl(iName.trim());
                        setIImgUrl(fallbackUrl);
                        setIImg("");
                      }
                    } catch (e: any) {
                      const fallbackUrl = generateAiDishImageUrl(iName.trim());
                      setIImgUrl(fallbackUrl);
                      setIImg("");
                    } finally {
                      setAiImgLoading(false);
                    }
                  }}
                  disabled={aiImgLoading}
                  testID="generate-gemini-image-btn"
                >
                  {aiImgLoading ? (
                    <ActivityIndicator size="small" color="#635BFF" />
                  ) : (
                    <>
                      <Ionicons name="sparkles" size={14} color="#635BFF" />
                      <Text style={{ color: "#635BFF", fontSize: 12, fontWeight: "700" }}>Generate with Gemini AI</Text>
                    </>
                  )}
                </Pressable>

                {iImgUrl || iImg ? (
                  <Pressable
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      paddingHorizontal: 10,
                      paddingVertical: 7,
                      borderRadius: radius.sm,
                      backgroundColor: isDark ? "rgba(239,68,68,0.15)" : "#FEE2E2",
                    }}
                    onPress={() => {
                      setIImg("");
                      setIImgUrl("");
                    }}
                  >
                    <Ionicons name="close-circle" size={14} color="#EF4444" />
                    <Text style={{ color: "#EF4444", fontSize: 12, fontWeight: "600" }}>Clear</Text>
                  </Pressable>
                ) : null}
              </View>

              <TextInput value={iName} onChangeText={setIName} placeholder="Name" placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} testID="item-name-input" />
              <TextInput value={iPrice} onChangeText={setIPrice} placeholder="Price ₹" keyboardType="decimal-pad" placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} testID="item-price-input" />
              <TextInput value={iDesc} onChangeText={setIDesc} placeholder="Description" placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} multiline testID="item-desc-input" />
              <Text style={styles.label}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }} style={{ marginBottom: spacing.md }}>
                {cats.map(c => (
                  <Chip key={c.id} label={c.name} active={iCat === c.id} onPress={() => setICat(c.id)} testID={`item-cat-chip-${c.id}`} />
                ))}
              </ScrollView>
              <View style={styles.modalActions}>
                <Pressable style={styles.ghostBtn} onPress={() => { setEditingItem(null); setItemModal(false); }} testID="item-cancel-btn">
                  <Text style={styles.ghostBtnText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.primaryBtn} onPress={saveItem} disabled={busy} testID="item-save-btn">
                  {busy ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.primaryText}>Save</Text>}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </Modal>

        {/* JSON Menu Import Modal */}
        <MenuJsonImportModal
          visible={jsonImportModal}
          onClose={() => setJsonImportModal(false)}
          onSuccess={() => load()}
        />
      </View>
    </View>
  );
}

function Chip({ label, active, onPress, testID }: { label: string; active: boolean; onPress: () => void; testID: string }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive, { flexShrink: 0 }]} testID={testID}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 0 },
  headerRightWrap: { flex: 1, marginLeft: spacing.sm },
  headerRightScroll: { flexDirection: "row", gap: spacing.sm, alignItems: "center", paddingRight: spacing.md },
  title: { color: colors.onSurface, fontSize: 20, fontWeight: "700" },
  iconBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceSecondary, flexShrink: 0 },
  iconBtnText: { color: colors.onSurface, fontSize: 13, fontWeight: "600" },
  iconBtnPrimary: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.brand, flexShrink: 0 },
  iconBtnPrimaryText: { color: colors.onBrand, fontSize: 13, fontWeight: "600" },
  chipsWrap: { maxHeight: 56, minHeight: 56 },
  chipsRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: "center" },
  chip: { paddingHorizontal: 14, height: 36, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, justifyContent: "center" },
  chipActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brand },
  chipText: { color: colors.onSurfaceSecondary, fontSize: 13 },
  chipTextActive: { color: colors.brand, fontWeight: "600" },
  itemCard: { flexDirection: "row", alignItems: "center", padding: spacing.md, marginBottom: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  itemImg: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  itemName: { color: colors.onSurface, fontSize: 16, fontWeight: "600" },
  itemDesc: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  itemPrice: { color: colors.brand, fontSize: 15, marginTop: 6, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  emptyText: { color: colors.onSurfaceTertiary },
  err: { color: colors.onError, backgroundColor: colors.error, margin: spacing.lg, padding: spacing.md, borderRadius: radius.md },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.surfaceSecondary, padding: spacing.xl, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, gap: spacing.md },
  modalTitle: { color: colors.onSurface, fontSize: 20, fontWeight: "700", marginBottom: spacing.sm },
  input: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: spacing.md, color: colors.onSurface, borderWidth: 1, borderColor: colors.border },
  label: { color: colors.onSurfaceSecondary, fontSize: 13 },
  modalActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  ghostBtn: { flex: 1, paddingVertical: 14, borderRadius: radius.md, alignItems: "center", borderWidth: 1, borderColor: colors.borderStrong },
  ghostBtnText: { color: colors.onSurface, fontWeight: "600" },
  primaryBtn: { flex: 1, paddingVertical: 14, borderRadius: radius.md, alignItems: "center", backgroundColor: colors.brand },
  primaryText: { color: colors.onBrand, fontWeight: "700" },
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center" },
  imgPickerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border },
  imgPreview: { width: 56, height: 56, borderRadius: radius.md },
  imgPlaceholder: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  imgPickerTitle: { color: colors.onSurface, fontSize: 14, fontWeight: "600" },
  imgPickerHint: { color: colors.onSurfaceTertiary, fontSize: 11, marginTop: 2 },
});
