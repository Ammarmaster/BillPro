import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Alert,
  Linking,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/context/ThemeContext";
import { api } from "@/src/lib/api";
import { spacing, radius, colors } from "@/src/theme";
import { useResponsive } from "@/src/hooks/useResponsive";

const SUGGESTED_TAGLINES = [
  "🔥 Today's Special",
  "⭐ Weekend Special",
  "👨‍🍳 Chef's Recommendation",
  "🎉 Flat 20% OFF",
  "😋 Must Try Dish",
  "💥 Limited Time Deal",
];

export default function PromoPosterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const { isDesktop } = useResponsive();

  const [quota, setQuota] = useState<{ used: number; limit: number; remaining: number; history?: any[] }>({
    used: 0,
    limit: 2,
    remaining: 2,
    history: [],
  });
  const [loadingQuota, setLoadingQuota] = useState<boolean>(true);

  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [selectedMenuItemId, setSelectedMenuItemId] = useState<string | null>(null);

  const [dishName, setDishName] = useState<string>("");
  const [price, setPrice] = useState<string>("");
  const [tagline, setTagline] = useState<string>("🔥 Today's Special");
  const [customTagline, setCustomTagline] = useState<string>("");

  const [generating, setGenerating] = useState<boolean>(false);
  const [currentPoster, setCurrentPoster] = useState<{
    image_url: string;
    caption: string;
    dish_name: string;
    price?: number;
    tagline?: string;
  } | null>(null);

  const [copiedCaption, setCopiedCaption] = useState<boolean>(false);

  // Load quota and menu items
  const loadInitialData = async () => {
    setLoadingQuota(true);
    try {
      const [qData, items] = await Promise.all([
        api.getPromoQuota().catch(() => ({ used: 0, limit: 2, remaining: 2, history: [] })),
        api.listMenu().catch(() => []),
      ]);
      if (qData) {
        setQuota({
          used: qData.used ?? 0,
          limit: qData.limit ?? 2,
          remaining: qData.remaining ?? 2,
          history: qData.history || [],
        });
        if (qData.history && qData.history.length > 0 && !currentPoster) {
          const latest = qData.history[qData.history.length - 1];
          if (latest && latest.image_url) {
            setCurrentPoster(latest);
          }
        }
      }
      if (Array.isArray(items)) {
        setMenuItems(items.filter((i: any) => !i.is_deleted));
      }
    } catch (e: any) {
      console.warn("Error loading promo poster initial data:", e);
    } finally {
      setLoadingQuota(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  const handleSelectMenuItem = (item: any) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setSelectedMenuItemId(item.id);
    setDishName(item.name || "");
    if (item.price !== undefined && item.price !== null) {
      setPrice(String(item.price));
    }
  };

  const activeTagline = customTagline.trim() ? customTagline.trim() : tagline;

  const handleGenerate = async () => {
    const cleanDish = dishName.trim();
    if (!cleanDish) {
      Alert.alert("Dish Name Required", "Please enter or select a dish from your menu.");
      return;
    }

    if (quota.remaining <= 0) {
      Alert.alert(
        "Daily Limit Reached",
        "You have used your 2 promotional posters for today. Your limit resets at midnight!"
      );
      return;
    }

    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setGenerating(true);
    setCopiedCaption(false);

    try {
      const parsedPrice = price.trim() ? parseFloat(price.trim()) : undefined;
      const res = await api.generatePromoPoster({
        dish_name: cleanDish,
        price: !isNaN(Number(parsedPrice)) ? Number(parsedPrice) : undefined,
        tagline: activeTagline,
      });

      if (res && res.image_url) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setCurrentPoster({
          image_url: res.image_url,
          caption: res.caption,
          dish_name: res.dish_name || cleanDish,
          price: res.price,
          tagline: res.tagline || activeTagline,
        });
        setQuota((prev) => ({
          ...prev,
          used: res.used_today ?? prev.used + 1,
          remaining: res.remaining_today ?? Math.max(0, prev.remaining - 1),
          history: [...(prev.history || []), res],
        }));
      } else {
        Alert.alert("Generation Failed", "Could not generate poster. Please try again.");
      }
    } catch (err: any) {
      const msg = err?.message || "Failed to generate promotional poster";
      Alert.alert("Poster Generation Notice", msg);
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyCaption = async (captionText: string) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(captionText);
      }
      setCopiedCaption(true);
      setTimeout(() => setCopiedCaption(false), 3000);
      Alert.alert("Caption Copied!", "Caption copied to clipboard. Ready to paste on WhatsApp!");
    } catch {
      Alert.alert("Caption Copied", captionText);
    }
  };

  const handleShareToWhatsApp = async (captionText: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const url = `whatsapp://send?text=${encodeURIComponent(captionText)}`;
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        await Linking.openURL(`https://api.whatsapp.com/send?text=${encodeURIComponent(captionText)}`);
      }
    } catch {
      Alert.alert("WhatsApp Share", "Could not open WhatsApp directly. You can copy the caption above!");
    }
  };

  const handleOpenHdImage = async (url: string) => {
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Poster Image", url);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.surface }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.surface} />
      <View style={[styles.wrap, { paddingTop: insets.top }]}>
        
        {/* Header Bar */}
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable
            onPress={() => router.back()}
            testID="promo-poster-back-btn"
            style={styles.backBtn}
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={24} color={theme.onSurface} />
          </Pressable>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={[styles.title, { color: theme.onSurface }]}>WhatsApp Status Poster AI</Text>
            <Text style={[styles.subtitle, { color: theme.onSurfaceSecondary }]}>Social Marketing & Status Ads</Text>
          </View>
          <View style={[styles.quotaPill, { backgroundColor: quota.remaining > 0 ? "#10B98120" : "#EF444420" }]}>
            <Text style={[styles.quotaPillText, { color: quota.remaining > 0 ? "#10B981" : "#EF4444" }]}>
              {quota.remaining}/2 LEFT TODAY
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{
            padding: spacing.md,
            paddingBottom: spacing.xxxl * 2,
            gap: spacing.lg,
            maxWidth: isDesktop ? 800 : undefined,
            width: "100%",
            alignSelf: isDesktop ? "center" : undefined,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Daily Quota Banner */}
          <View
            style={[
              styles.quotaBanner,
              {
                backgroundColor: isDark ? (quota.remaining > 0 ? "#1E1B4B" : "#2E1A1A") : (quota.remaining > 0 ? "#EEF2FF" : "#FEF2F2"),
                borderColor: quota.remaining > 0 ? "#635BFF" : "#EF4444",
              },
            ]}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View
                style={[
                  styles.quotaIconCircle,
                  { backgroundColor: quota.remaining > 0 ? "#635BFF" : "#EF4444" },
                ]}
              >
                <Ionicons
                  name={quota.remaining > 0 ? "sparkles" : "time-outline"}
                  size={20}
                  color="#FFFFFF"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.quotaBannerTitle, { color: theme.onSurface }]}>
                  {quota.remaining > 0
                    ? `⚡ ${quota.remaining} of 2 Daily Posters Remaining`
                    : "⚠️ Daily Limit Reached (2 of 2 Used)"}
                </Text>
                <Text style={[styles.quotaBannerSub, { color: theme.onSurfaceSecondary }]}>
                  {quota.remaining > 0
                    ? "Generate viral 9:16 vertical food posters with your dish, price & restaurant branding. Ready for WhatsApp Status!"
                    : "You've created 2 promotional posters today. Your free daily quota resets tonight at midnight."}
                </Text>
              </View>
            </View>
          </View>

          {/* Poster Preview if Generated */}
          {currentPoster && (
            <View style={[styles.card, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
              <View style={styles.cardHeader}>
                <Ionicons name="image" size={20} color="#635BFF" />
                <Text style={[styles.cardTitle, { color: theme.onSurface }]}>Latest Generated Poster</Text>
                <View style={{ flex: 1 }} />
                <Pressable onPress={() => handleOpenHdImage(currentPoster.image_url)} hitSlop={8}>
                  <Text style={{ color: "#635BFF", fontSize: 13, fontWeight: "700" }}>Open Full HD ↗</Text>
                </Pressable>
              </View>

              {/* 9:16 Vertical Poster Container */}
              <View style={[styles.posterImageWrap, { backgroundColor: isDark ? "#0A0B10" : "#F8FAFC" }]}>
                <Image
                  source={{ uri: currentPoster.image_url }}
                  style={styles.posterImage}
                  contentFit="contain"
                  transition={400}
                />
              </View>

              {/* Caption & Actions */}
              <View style={[styles.captionBox, { backgroundColor: isDark ? "#13141F" : "#F1F5F9", borderColor: theme.border }]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <Text style={{ color: theme.onSurfaceSecondary, fontSize: 12, fontWeight: "700" }}>
                    READY-TO-POST WHATSAPP CAPTION:
                  </Text>
                  <Pressable
                    onPress={() => handleCopyCaption(currentPoster.caption)}
                    style={[styles.copyBtn, copiedCaption && { backgroundColor: "#10B981" }]}
                  >
                    <Ionicons
                      name={copiedCaption ? "checkmark" : "copy-outline"}
                      size={14}
                      color="#FFFFFF"
                    />
                    <Text style={styles.copyBtnText}>
                      {copiedCaption ? "Copied!" : "Copy"}
                    </Text>
                  </Pressable>
                </View>
                <Text style={{ color: theme.onSurface, fontSize: 13, lineHeight: 20 }}>
                  {currentPoster.caption}
                </Text>
              </View>

              <View style={styles.posterActionsRow}>
                <Pressable
                  style={[styles.actionBtn, styles.shareBtn]}
                  onPress={() => handleShareToWhatsApp(currentPoster.caption)}
                >
                  <Ionicons name="logo-whatsapp" size={18} color="#FFFFFF" />
                  <Text style={styles.shareBtnText}>Share to WhatsApp</Text>
                </Pressable>

                <Pressable
                  style={[styles.actionBtn, styles.downloadBtn, { borderColor: theme.border }]}
                  onPress={() => handleOpenHdImage(currentPoster.image_url)}
                >
                  <Ionicons name="download-outline" size={18} color={theme.onSurface} />
                  <Text style={[styles.downloadBtnText, { color: theme.onSurface }]}>Download HD</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Form: Create Promotional Poster */}
          <View style={[styles.card, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
            <View style={styles.cardHeader}>
              <Ionicons name="sparkles" size={20} color="#FF5E2B" />
              <Text style={[styles.cardTitle, { color: theme.onSurface }]}>Create New Status Poster</Text>
            </View>

            {/* Quick Pick from Menu Items */}
            {menuItems.length > 0 && (
              <View style={{ marginBottom: spacing.md }}>
                <Text style={[styles.inputLabel, { color: theme.onSurfaceSecondary }]}>
                  QUICK PICK FROM YOUR MENU
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.menuChipsWrap}>
                  {menuItems.slice(0, 15).map((item) => {
                    const isSelected = selectedMenuItemId === item.id;
                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => handleSelectMenuItem(item)}
                        style={[
                          styles.menuChip,
                          {
                            backgroundColor: isSelected ? "#635BFF" : isDark ? "#26294D" : "#EEF2FF",
                            borderColor: isSelected ? "#635BFF" : theme.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.menuChipText,
                            { color: isSelected ? "#FFFFFF" : theme.onSurface },
                          ]}
                          numberOfLines={1}
                        >
                          {item.name}
                        </Text>
                        {item.price ? (
                          <Text
                            style={[
                              styles.menuChipPrice,
                              { color: isSelected ? "rgba(255,255,255,0.85)" : "#FF5E2B" },
                            ]}
                          >
                            ₹{item.price}
                          </Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Dish Name Input */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.onSurfaceSecondary }]}>DISH NAME *</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: isDark ? "#13141F" : "#FFFFFF",
                    borderColor: theme.border,
                    color: theme.onSurface,
                  },
                ]}
                placeholder="e.g. Chicken Dum Biryani, Paneer Butter Masala..."
                placeholderTextColor={theme.onSurfaceTertiary}
                value={dishName}
                onChangeText={(text) => {
                  setDishName(text);
                  setSelectedMenuItemId(null);
                }}
              />
            </View>

            {/* Price Input */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.onSurfaceSecondary }]}>PRICE (OPTIONAL)</Text>
              <View style={styles.priceInputWrapper}>
                <View style={[styles.currencyPrefix, { backgroundColor: isDark ? "#26294D" : "#E2E8F0" }]}>
                  <Text style={[styles.currencyPrefixText, { color: theme.onSurface }]}>₹</Text>
                </View>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: isDark ? "#13141F" : "#FFFFFF",
                      borderColor: theme.border,
                      color: theme.onSurface,
                      borderTopLeftRadius: 0,
                      borderBottomLeftRadius: 0,
                      flex: 1,
                    },
                  ]}
                  placeholder="e.g. 299"
                  placeholderTextColor={theme.onSurfaceTertiary}
                  keyboardType="numeric"
                  value={price}
                  onChangeText={setPrice}
                />
              </View>
            </View>

            {/* Suggested Taglines / Offers */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.onSurfaceSecondary }]}>
                PROMOTIONAL BADGE / OFFER
              </Text>
              <View style={styles.taglineChipsRow}>
                {SUGGESTED_TAGLINES.map((tag) => {
                  const isSelected = tagline === tag && !customTagline.trim();
                  return (
                    <Pressable
                      key={tag}
                      onPress={() => {
                        setTagline(tag);
                        setCustomTagline("");
                      }}
                      style={[
                        styles.taglineChip,
                        {
                          backgroundColor: isSelected ? "#FF5E2B" : isDark ? "#26294D" : "#EEF2FF",
                          borderColor: isSelected ? "#FF5E2B" : theme.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.taglineChipText,
                          { color: isSelected ? "#FFFFFF" : theme.onSurface },
                        ]}
                      >
                        {tag}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: isDark ? "#13141F" : "#FFFFFF",
                    borderColor: theme.border,
                    color: theme.onSurface,
                    marginTop: 8,
                  },
                ]}
                placeholder="Or type custom offer (e.g. Buy 1 Get 1 Free, Weekend Delight)..."
                placeholderTextColor={theme.onSurfaceTertiary}
                value={customTagline}
                onChangeText={setCustomTagline}
              />
            </View>

            {/* Generate Button */}
            <Pressable
              style={[
                styles.generateBtn,
                (generating || quota.remaining <= 0 || !dishName.trim()) && styles.generateBtnDisabled,
              ]}
              disabled={generating || quota.remaining <= 0 || !dishName.trim()}
              onPress={handleGenerate}
            >
              {generating ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.generateBtnText}>Gemini & Flux Rendering Poster...</Text>
                </View>
              ) : quota.remaining <= 0 ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="lock-closed" size={18} color="#FFFFFF" />
                  <Text style={styles.generateBtnText}>Daily Limit Reached (2/2 Used)</Text>
                </View>
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="sparkles" size={18} color="#FFFFFF" />
                  <Text style={styles.generateBtnText}>
                    Generate Status Poster ({quota.remaining} Left Today)
                  </Text>
                </View>
              )}
            </Pressable>
            {generating && (
              <Text style={{ color: theme.onSurfaceSecondary, fontSize: 12, textAlign: "center", marginTop: 8 }}>
                AI is designing high-impact commercial typography, appetizing dish macro photo & marketing badge. This takes ~5-10s.
              </Text>
            )}
          </View>

          {/* Today's Generation History */}
          {quota.history && quota.history.length > 0 && (
            <View style={[styles.card, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
              <Text style={[styles.cardTitle, { color: theme.onSurface, marginBottom: spacing.sm }]}>
                Today's Poster History ({quota.history.length}/2)
              </Text>
              <View style={{ gap: spacing.md }}>
                {quota.history.map((hItem: any, idx: number) => (
                  <View
                    key={idx}
                    style={[
                      styles.historyItem,
                      { backgroundColor: isDark ? "#13141F" : "#FFFFFF", borderColor: theme.border },
                    ]}
                  >
                    <Image
                      source={{ uri: hItem.image_url }}
                      style={styles.historyThumb}
                      contentFit="cover"
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.historyTitle, { color: theme.onSurface }]}>
                        {hItem.dish_name}
                      </Text>
                      {hItem.price ? (
                        <Text style={{ color: "#FF5E2B", fontSize: 13, fontWeight: "700" }}>
                          ₹{hItem.price}
                        </Text>
                      ) : null}
                      <Text style={{ color: theme.onSurfaceSecondary, fontSize: 12, marginTop: 2 }}>
                        {hItem.tagline}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => {
                        setCurrentPoster(hItem);
                        if (Platform.OS !== "web") Haptics.selectionAsync();
                      }}
                      style={[styles.historyViewBtn, { backgroundColor: isDark ? "#26294D" : "#EEF2FF" }]}
                    >
                      <Text style={{ color: "#635BFF", fontSize: 12, fontWeight: "700" }}>View</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          )}

        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  wrap: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: spacing.xs,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 12,
  },
  quotaPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  quotaPillText: {
    fontSize: 11,
    fontWeight: "800",
  },
  quotaBanner: {
    borderWidth: 1.5,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  quotaIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
  },
  quotaBannerTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  quotaBannerSub: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  card: {
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  posterImageWrap: {
    width: "100%",
    height: 440,
    borderRadius: radius.lg,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
  },
  posterImage: {
    width: "100%",
    height: "100%",
  },
  captionBox: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#635BFF",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  copyBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  posterActionsRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  shareBtn: {
    backgroundColor: "#25D366",
  },
  shareBtnText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 14,
  },
  downloadBtn: {
    borderWidth: 1,
  },
  downloadBtnText: {
    fontWeight: "700",
    fontSize: 14,
  },
  menuChipsWrap: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 4,
  },
  menuChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  menuChipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  menuChipPrice: {
    fontSize: 12,
    fontWeight: "800",
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
  },
  priceInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
  },
  currencyPrefix: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopLeftRadius: radius.md,
    borderBottomLeftRadius: radius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  currencyPrefixText: {
    fontSize: 14,
    fontWeight: "700",
  },
  taglineChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  taglineChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  taglineChipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  generateBtn: {
    backgroundColor: "#FF5E2B",
    paddingVertical: 14,
    borderRadius: radius.md,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 4,
  },
  generateBtnDisabled: {
    opacity: 0.6,
  },
  generateBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  historyThumb: {
    width: 48,
    height: 72,
    borderRadius: radius.sm,
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  historyViewBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
});
