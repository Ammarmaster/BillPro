import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, Pressable, Modal,
  ActivityIndicator, FlatList,
} from "react-native";
import { Image } from "expo-image";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { pickImageBase64 } from "@/src/lib/imagePicker";
import { menuItemImageSource } from "@/src/lib/foodImage";
import { colors, spacing, radius } from "@/src/theme";

type Cat = { id: string; name: string; sort_order: number };
type Item = { id: string; category_id: string; name: string; description: string; price: number; image_base64?: string; image_url?: string; is_active: boolean };

export default function MenuScreen() {
  const insets = useSafeAreaInsets();
  const [cats, setCats] = useState<Cat[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [selCat, setSelCat] = useState<string | "all">("all");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [catModal, setCatModal] = useState(false);
  const [catName, setCatName] = useState("");

  const [itemModal, setItemModal] = useState(false);
  const [iName, setIName] = useState("");
  const [iPrice, setIPrice] = useState("");
  const [iDesc, setIDesc] = useState("");
  const [iCat, setICat] = useState<string>("");
  const [iImg, setIImg] = useState<string>("");
  const [busy, setBusy] = useState(false);

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
    try { const b = await pickImageBase64(0.5); if (b) setIImg(b); }
    catch (e: any) { setErr(e.message); }
  };

  const addCat = async () => {
    if (!catName.trim()) return;
    setBusy(true);
    try { await api.createCategory({ name: catName.trim(), sort_order: cats.length }); setCatName(""); setCatModal(false); await load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const addItem = async () => {
    const price = parseFloat(iPrice);
    if (!iName.trim() || !iCat || isNaN(price) || price <= 0) { setErr("Fill name, category, valid price."); return; }
    setBusy(true);
    try {
      await api.createMenuItem({ category_id: iCat, name: iName.trim(), description: iDesc, price, image_base64: iImg, is_active: true });
      setIName(""); setIPrice(""); setIDesc(""); setIImg(""); setItemModal(false);
      await load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const delItem = async (id: string) => { try { await api.deleteMenuItem(id); await load(); } catch (e: any) { setErr(e.message); } };

  const shown = selCat === "all" ? items : items.filter(i => i.category_id === selCat);

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]} testID="menu-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Menu</Text>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Pressable style={styles.iconBtn} onPress={() => setCatModal(true)} testID="menu-add-category-btn">
            <Ionicons name="folder-open" size={18} color={colors.brand} />
            <Text style={styles.iconBtnText}>Category</Text>
          </Pressable>
          <Pressable style={styles.iconBtnPrimary} onPress={() => { if (!cats.length) { setErr("Add a category first."); return; } setItemModal(true); }} testID="menu-add-item-btn">
            <Ionicons name="add" size={18} color={colors.onBrand} />
            <Text style={styles.iconBtnPrimaryText}>Item</Text>
          </Pressable>
        </View>
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
          data={shown}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
          renderItem={({ item, index }) => (
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
          )}
        />
      )}

      {err && <Text style={styles.err} testID="menu-error">{err}</Text>}

      <Modal transparent visible={catModal} animationType="slide" onRequestClose={() => setCatModal(false)}>
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + spacing.xl }]}>
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

      <Modal transparent visible={itemModal} animationType="slide" onRequestClose={() => setItemModal(false)}>
        <View style={styles.modalBg}>
          <ScrollView contentContainerStyle={[styles.modalCard, { paddingBottom: insets.bottom + spacing.xl }]}>
            <Text style={styles.modalTitle}>New Menu Item</Text>

            <Pressable style={styles.imgPickerRow} onPress={pickImg} testID="item-image-picker">
              {iImg ? (
                <Image source={{ uri: `data:image/jpeg;base64,${iImg}` }} style={styles.imgPreview} contentFit="cover" />
              ) : (
                <View style={styles.imgPlaceholder}>
                  <Ionicons name="image" size={26} color={colors.onSurfaceSecondary} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.imgPickerTitle}>{iImg ? "Change photo" : "Add photo"}</Text>
                <Text style={styles.imgPickerHint}>If skipped, an image will be auto-fetched by name.</Text>
              </View>
              <Ionicons name="camera" size={22} color={colors.brand} />
            </Pressable>

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
              <Pressable style={styles.ghostBtn} onPress={() => setItemModal(false)} testID="item-cancel-btn">
                <Text style={styles.ghostBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.primaryBtn} onPress={addItem} disabled={busy} testID="item-save-btn">
                {busy ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.primaryText}>Save</Text>}
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>
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
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  title: { color: colors.onSurface, fontSize: 28, fontFamily: "serif" },
  iconBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong },
  iconBtnText: { color: colors.onSurface, fontSize: 13 },
  iconBtnPrimary: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.brand },
  iconBtnPrimaryText: { color: colors.onBrand, fontSize: 13, fontWeight: "600" },
  chipsWrap: { maxHeight: 56, minHeight: 56 },
  chipsRow: { paddingHorizontal: spacing.xl, gap: spacing.sm, alignItems: "center" },
  chip: { paddingHorizontal: 14, height: 36, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, justifyContent: "center" },
  chipActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brand },
  chipText: { color: colors.onSurfaceSecondary, fontSize: 13 },
  chipTextActive: { color: colors.brand, fontWeight: "600" },
  itemCard: { flexDirection: "row", alignItems: "center", padding: spacing.md, marginBottom: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  itemImg: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  itemName: { color: colors.onSurface, fontSize: 16 },
  itemDesc: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  itemPrice: { color: colors.brand, fontSize: 15, marginTop: 6, fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  emptyText: { color: colors.onSurfaceTertiary },
  err: { color: colors.onError, backgroundColor: colors.error, margin: spacing.lg, padding: spacing.md, borderRadius: radius.md },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.surfaceSecondary, padding: spacing.xl, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, gap: spacing.md },
  modalTitle: { color: colors.onSurface, fontSize: 20, fontFamily: "serif", marginBottom: spacing.sm },
  input: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: spacing.md, color: colors.onSurface, borderWidth: 1, borderColor: colors.border },
  label: { color: colors.onSurfaceSecondary, fontSize: 13 },
  modalActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  ghostBtn: { flex: 1, paddingVertical: 14, borderRadius: radius.md, alignItems: "center", borderWidth: 1, borderColor: colors.borderStrong },
  ghostBtnText: { color: colors.onSurface },
  primaryBtn: { flex: 1, paddingVertical: 14, borderRadius: radius.md, alignItems: "center", backgroundColor: colors.brand },
  primaryText: { color: colors.onBrand, fontWeight: "600" },
  imgPickerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border },
  imgPreview: { width: 56, height: 56, borderRadius: radius.md },
  imgPlaceholder: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  imgPickerTitle: { color: colors.onSurface, fontSize: 14 },
  imgPickerHint: { color: colors.onSurfaceTertiary, fontSize: 11, marginTop: 2 },
});
