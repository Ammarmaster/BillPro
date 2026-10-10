import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import QRCode from "qrcode";
import { colors, spacing, radius } from "@/src/theme";
import { useTheme } from "@/src/context/ThemeContext";
import { useResponsive } from "@/src/hooks/useResponsive";

export interface AttractiveQRStandeeModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  restaurantName: string;
  badgeText: string;
  targetUrl: string;
  isTable?: boolean;
  tableLabel?: string;
  customQrValue?: string;
  onSaveCustomQr?: (customVal: string) => Promise<void>;
  onClearCustomQr?: () => Promise<void>;
  callToActionText?: string;
  helperText?: string;
}

export default function AttractiveQRStandeeModal({
  visible,
  onClose,
  title,
  restaurantName,
  badgeText,
  targetUrl,
  isTable = false,
  tableLabel = "",
  customQrValue = "",
  onSaveCustomQr,
  onClearCustomQr,
  callToActionText,
  helperText,
}: AttractiveQRStandeeModalProps) {
  const { theme, isDark } = useTheme();
  const { isDesktop } = useResponsive();

  const finalCta = callToActionText || (isTable ? "✦ ORDER NOW ✦" : "✦ SCAN FOR MENU ✦");
  const finalHelper = helperText || (isTable ? "Scan with any smartphone camera\nto view contactless menu & order" : "Scan with phone camera to view our digital menu");
  const finalHelperInline = finalHelper.replace(/\n/g, "<br>");
  const finalHelperOneLine = finalHelper.replace(/\n/g, " ");

  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [loadingQr, setLoadingQr] = useState<boolean>(true);
  const [downloading, setDownloading] = useState<boolean>(false);
  const [printing, setPrinting] = useState<boolean>(false);

  // Link existing QR state
  const [showLinkSection, setShowLinkSection] = useState<boolean>(false);
  const [customInput, setCustomInput] = useState<string>(customQrValue || "");
  const [savingCustom, setSavingCustom] = useState<boolean>(false);
  const [copiedToast, setCopiedToast] = useState<boolean>(false);

  // Determine active target URL
  const effectiveUrl = targetUrl;

  useEffect(() => {
    setCustomInput(customQrValue || "");
  }, [customQrValue]);

  useEffect(() => {
    let isMounted = true;
    if (visible && effectiveUrl) {
      setLoadingQr(true);
      QRCode.toDataURL(effectiveUrl, {
        width: 450,
        margin: 2,
        color: { dark: "#0F172A", light: "#FFFFFF" },
      })
        .then((url: string) => {
          if (isMounted) {
            setQrDataUrl(url);
            setLoadingQr(false);
          }
        })
        .catch(() => {
          if (isMounted) {
            const fallback = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(
              effectiveUrl
            )}`;
            setQrDataUrl(fallback);
            setLoadingQr(false);
          }
        });
    }
    return () => {
      isMounted = false;
    };
  }, [visible, effectiveUrl]);

  const handleCopyLink = async () => {
    try {
      if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(effectiveUrl);
        setCopiedToast(true);
        setTimeout(() => setCopiedToast(false), 2000);
      } else {
        await Share.share({
          message: effectiveUrl,
          url: effectiveUrl,
          title: `${restaurantName} Menu`,
        });
      }
    } catch {
      Alert.alert("Link", effectiveUrl);
    }
  };

  const getStandeeHtml = () => {
    const finalImgSrc =
      qrDataUrl ||
      `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(
        effectiveUrl
      )}`;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${restaurantName} — QR Standee</title>
        <style>
          @page { size: A5 portrait; margin: 0; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            background-color: #080C14;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 24px;
            color: #FFFFFF;
          }
          .standee-card {
            width: 380px;
            background: linear-gradient(180deg, #151B2E 0%, #0A0E1A 100%);
            border: 2px solid rgba(255, 255, 255, 0.15);
            border-radius: 28px;
            padding: 32px 24px;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
            position: relative;
          }
          .brand-name {
            font-size: 24px;
            font-weight: 800;
            color: #FFFFFF;
            letter-spacing: -0.5px;
            margin-bottom: 6px;
          }
          .badge {
            display: inline-block;
            background: #635BFF;
            color: #FFFFFF;
            font-size: 12px;
            font-weight: 800;
            padding: 6px 16px;
            border-radius: 99px;
            letter-spacing: 0.8px;
            text-transform: uppercase;
            margin-bottom: 20px;
          }
          .qr-container {
            background: #FFFFFF;
            border-radius: 20px;
            padding: 18px;
            display: inline-block;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
            margin-bottom: 20px;
          }
          .qr-image {
            width: 220px;
            height: 220px;
            display: block;
            border-radius: 8px;
          }
          .order-now-btn {
            background: linear-gradient(135deg, #635BFF 0%, #7B61FF 100%);
            color: #FFFFFF;
            font-size: 18px;
            font-weight: 900;
            padding: 14px 20px;
            border-radius: 14px;
            letter-spacing: 1.5px;
            text-transform: uppercase;
            box-shadow: 0 8px 20px rgba(99, 91, 255, 0.4);
            margin-bottom: 14px;
          }
          .instructions {
            font-size: 12px;
            color: #CBD5E1;
            font-weight: 600;
            margin-bottom: 16px;
            line-height: 1.4;
          }
          .footer-badge {
            display: inline-block;
            background: rgba(0, 0, 0, 0.5);
            border: 1px solid rgba(255, 255, 255, 0.15);
            padding: 6px 16px;
            border-radius: 99px;
            font-size: 11px;
            color: #F8FAFC;
            font-weight: 800;
            letter-spacing: 0.8px;
            text-transform: uppercase;
          }
        </style>
      </head>
      <body>
        <div class="standee-card">
          <div class="brand-name">${restaurantName}</div>
          <div class="badge">${badgeText}</div>
          <div class="qr-container">
            <img src="${finalImgSrc}" class="qr-image" alt="QR Code" />
          </div>
          <div class="order-now-btn">${finalCta}</div>
          <div class="instructions">${finalHelperInline}</div>
          <div class="footer-badge">⚡ POWERED BY EZBILL POS</div>
        </div>
      </body>
      </html>
    `;
  };

  const handlePrint = async () => {
    try {
      setPrinting(true);
      const html = getStandeeHtml();
      await Print.printAsync({ html });
    } catch (err: any) {
      Alert.alert("Print Error", err?.message || "Could not print standee.");
    } finally {
      setPrinting(false);
    }
  };

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const html = getStandeeHtml();

      if (Platform.OS === "web") {
        if (typeof document !== "undefined") {
          const canvas = document.createElement("canvas");
          canvas.width = 720;
          canvas.height = 960;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            // Helper for rounded rectangles with path isolation
            const drawRound = (x: number, y: number, w: number, h: number, r: number) => {
              ctx.beginPath();
              if (typeof (ctx as any).roundRect === "function") {
                (ctx as any).roundRect(x, y, w, h, r);
              } else {
                ctx.moveTo(x + r, y);
                ctx.lineTo(x + w - r, y);
                ctx.arcTo(x + w, y, x + w, y + r, r);
                ctx.lineTo(x + w, y + h - r);
                ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
                ctx.lineTo(x + r, y + h);
                ctx.arcTo(x, y + h, x, y + h - r, r);
                ctx.lineTo(x, y + r);
                ctx.arcTo(x, y, x + r, y, r);
                ctx.closePath();
              }
            };

            // 1. Outer Dark Canvas
            ctx.fillStyle = "#080C14";
            ctx.fillRect(0, 0, 720, 960);

            // 2. Standee Luxury Card Container
            const cardGrad = ctx.createLinearGradient(0, 30, 0, 930);
            cardGrad.addColorStop(0, "#151B2E");
            cardGrad.addColorStop(1, "#0A0E1A");
            drawRound(30, 30, 660, 900, 32);
            ctx.fillStyle = cardGrad;
            ctx.fill();

            // Card Border
            drawRound(30, 30, 660, 900, 32);
            ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
            ctx.lineWidth = 2;
            ctx.stroke();

            // 3. Restaurant Name
            ctx.fillStyle = "#FFFFFF";
            ctx.font = "bold 34px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(restaurantName || "Restaurant", 360, 95);

            // 4. Badge Pill
            const badgeStr = badgeText || "DIGITAL MENU";
            ctx.font = "bold 15px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
            const bWidth = ctx.measureText(badgeStr).width + 36;
            drawRound(360 - bWidth / 2, 130, bWidth, 32, 16);
            ctx.fillStyle = "#635BFF";
            ctx.fill();
            ctx.fillStyle = "#FFFFFF";
            ctx.fillText(badgeStr, 360, 146);

            // 5. White QR Plaque
            drawRound(170, 190, 380, 380, 24);
            ctx.fillStyle = "#FFFFFF";
            ctx.fill();

            // 6. Generate and Draw QR Code directly inside White Plaque
            const qrData = qrDataUrl || (await QRCode.toDataURL(effectiveUrl, {
              width: 500,
              margin: 2,
              color: { dark: "#000000", light: "#FFFFFF" },
            }));

            const img = new (window as any).Image();
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = reject;
              img.src = qrData;
            });

            ctx.drawImage(img, 195, 215, 330, 330);

            // 7. Prominent CTA Banner Button
            const btnGrad = ctx.createLinearGradient(130, 610, 590, 678);
            btnGrad.addColorStop(0, "#635BFF");
            btnGrad.addColorStop(1, "#7B61FF");
            drawRound(130, 610, 460, 68, 18);
            ctx.fillStyle = btnGrad;
            ctx.fill();

            ctx.fillStyle = "#FFFFFF";
            ctx.font = "bold 23px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
            ctx.letterSpacing = "1.5px";
            ctx.fillText(finalCta, 360, 644);

            // 8. Helper Instructions
            ctx.fillStyle = "#CBD5E1";
            ctx.font = "600 16px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
            ctx.letterSpacing = "0px";
            ctx.fillText(finalHelperOneLine, 360, 715);

            // 9. Powerful, Sleek EzBill Brand Badge
            const brandPillText = "⚡ POWERED BY EZBILL POS";
            ctx.font = "bold 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
            const bpWidth = ctx.measureText(brandPillText).width + 36;
            drawRound(360 - bpWidth / 2, 790, bpWidth, 36, 18);
            ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
            ctx.fill();
            drawRound(360 - bpWidth / 2, 790, bpWidth, 36, 18);
            ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
            ctx.lineWidth = 1.5;
            ctx.stroke();

            ctx.fillStyle = "#F8FAFC";
            ctx.fillText(brandPillText, 360, 808);

            // 10. Direct Download Action
            const link = document.createElement("a");
            const safeName = (restaurantName || "restaurant").replace(/[^a-z0-9]/gi, "_").toLowerCase();
            const safeBadge = (badgeText || "qr").replace(/[^a-z0-9]/gi, "_").toLowerCase();
            link.download = `standee_${safeName}_${safeBadge}.png`;
            link.href = canvas.toDataURL("image/png");
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setDownloading(false);
            return;
          }
        }
      }

      // Native iOS / Android: Generate PDF and share
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          UTI: ".pdf",
          mimeType: "application/pdf",
          dialogTitle: `${restaurantName} — QR Standee`,
        });
      } else {
        Alert.alert("Saved", `Standee saved to:\n${uri}`);
      }
    } catch (err: any) {
      Alert.alert("Export Error", err?.message || "Could not export standee.");
    } finally {
      setDownloading(false);
    }
  };

  const handleSaveCustom = async () => {
    if (!onSaveCustomQr) return;
    const trimmed = customInput.trim();
    if (!trimmed) {
      Alert.alert("Input Required", "Please enter an existing QR code value or table identifier.");
      return;
    }
    setSavingCustom(true);
    try {
      await onSaveCustomQr(trimmed);
      setShowLinkSection(false);
      Alert.alert("Success", `Custom QR linked successfully to Table ${tableLabel}!`);
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to link custom QR.");
    } finally {
      setSavingCustom(false);
    }
  };

  const handleClearCustom = async () => {
    if (!onClearCustomQr) return;
    setSavingCustom(true);
    try {
      await onClearCustomQr();
      setCustomInput("");
      setShowLinkSection(false);
      Alert.alert("Restored", "Reverted to auto-generated Table QR.");
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to reset custom QR.");
    } finally {
      setSavingCustom(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View
          style={[
            styles.modalContent,
            {
              backgroundColor: isDark ? "#0A0E1A" : "#FFFFFF",
              borderColor: isDark ? "#1E293B" : "#E2E8F0",
              maxWidth: isDesktop ? 540 : 420,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.headerTitle, { color: theme.onSurface }]}>{title}</Text>
              <Text style={[styles.headerSub, { color: theme.onSurfaceSecondary }]}>
                {restaurantName} • Ready to display & print
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
              <Ionicons name="close" size={24} color={theme.onSurfaceSecondary} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollBody}
            showsVerticalScrollIndicator={false}
          >
            {/* Attractive Acrylic Standee Preview Card */}
            <View style={styles.standeePreviewCard}>
              <View style={styles.standeeGlow} />

              {/* Standee Content */}
              <View style={styles.standeeInner}>
                <Text style={styles.standeeBrand} numberOfLines={1}>
                  {restaurantName}
                </Text>

                <View style={styles.badgePill}>
                  <Text style={styles.badgeText}>{badgeText}</Text>
                </View>

                {/* QR Box */}
                <View style={styles.qrWhiteBox}>
                  {loadingQr ? (
                    <View style={styles.qrLoadingBox}>
                      <ActivityIndicator size="large" color="#635BFF" />
                    </View>
                  ) : (
                    <Image
                      source={{ uri: qrDataUrl }}
                      style={styles.qrImg}
                      contentFit="contain"
                    />
                  )}
                </View>

                {/* Prominent Call-to-action Banner */}
                <View style={styles.orderNowBanner}>
                  <Text style={styles.orderNowText}>{finalCta}</Text>
                </View>

                <Text style={styles.standeeHelper}>
                  {finalHelperOneLine}
                </Text>

                <View style={styles.standeeFooter}>
                  <View style={styles.brandBadgePill}>
                    <Text style={styles.poweredByText}>⚡ POWERED BY EZBILL POS</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Link Any Existing QR Section (Table Specific) */}
            {isTable && (
              <View
                style={[
                  styles.linkSectionCard,
                  {
                    backgroundColor: isDark ? "#111827" : "#F8FAFC",
                    borderColor: isDark ? "#1F2937" : "#E2E8F0",
                  },
                ]}
              >
                <Pressable
                  style={styles.linkToggleRow}
                  onPress={() => setShowLinkSection(!showLinkSection)}
                >
                  <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons
                      name={customQrValue ? "link" : "scan-outline"}
                      size={18}
                      color={customQrValue ? "#10B981" : "#635BFF"}
                    />
                    <Text style={[styles.linkSectionTitle, { color: theme.onSurface }]}>
                      {customQrValue ? "Linked to Custom QR" : "Link Any Existing QR Code"}
                    </Text>
                  </View>
                  <Ionicons
                    name={showLinkSection ? "chevron-up" : "chevron-down"}
                    size={18}
                    color={theme.onSurfaceSecondary}
                  />
                </Pressable>

                {customQrValue && !showLinkSection && (
                  <View style={styles.linkedChip}>
                    <Text style={styles.linkedChipText} numberOfLines={1}>
                      Code: {customQrValue}
                    </Text>
                    <Pressable onPress={() => setShowLinkSection(true)}>
                      <Text style={styles.linkedChipChange}>Change</Text>
                    </Pressable>
                  </View>
                )}

                {showLinkSection && (
                  <View style={styles.linkInputContainer}>
                    <Text style={[styles.linkInputLabel, { color: theme.onSurfaceSecondary }]}>
                      Enter any existing QR sticker token, table code, or custom ID to link to Table {tableLabel}:
                    </Text>
                    <TextInput
                      value={customInput}
                      onChangeText={setCustomInput}
                      placeholder="e.g. TBL-05 or physical QR sticker code"
                      placeholderTextColor={theme.onSurfaceTertiary}
                      style={[
                        styles.linkInput,
                        {
                          backgroundColor: isDark ? "#1F2937" : "#FFFFFF",
                          color: theme.onSurface,
                          borderColor: theme.border,
                        },
                      ]}
                    />

                    <View style={styles.linkBtnRow}>
                      {customQrValue ? (
                        <Pressable
                          style={[styles.linkGhostBtn, { borderColor: "#EF4444" }]}
                          onPress={handleClearCustom}
                          disabled={savingCustom}
                        >
                          <Text style={{ color: "#EF4444", fontWeight: "700", fontSize: 13 }}>
                            Revert to Default
                          </Text>
                        </Pressable>
                      ) : null}

                      <Pressable
                        style={[styles.linkPrimaryBtn, { flex: 1 }]}
                        onPress={handleSaveCustom}
                        disabled={savingCustom}
                      >
                        {savingCustom ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Text style={styles.linkPrimaryBtnText}>Save & Link QR</Text>
                        )}
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Target URL Info & Copy Button */}
            <View
              style={[
                styles.urlContainer,
                {
                  backgroundColor: isDark ? "#111827" : "#F8FAFC",
                  borderColor: isDark ? "#1F2937" : "#E2E8F0",
                },
              ]}
            >
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={[styles.urlLabel, { color: theme.onSurfaceSecondary }]}>
                  Destination URL
                </Text>
                <Text style={[styles.urlText, { color: theme.onSurface }]} numberOfLines={1}>
                  {effectiveUrl}
                </Text>
              </View>

              <Pressable
                onPress={handleCopyLink}
                style={[
                  styles.copyBtn,
                  copiedToast && { backgroundColor: "#10B981" },
                ]}
              >
                <Ionicons
                  name={copiedToast ? "checkmark" : "copy-outline"}
                  size={16}
                  color="#FFFFFF"
                />
                <Text style={styles.copyBtnText}>
                  {copiedToast ? "Copied" : "Copy"}
                </Text>
              </Pressable>
            </View>

            {/* Actions: Download Standee & Print Standee */}
            <View style={styles.actionRow}>
              <Pressable
                style={[styles.downloadBtn, downloading && { opacity: 0.8 }]}
                onPress={handleDownload}
                disabled={downloading || printing}
              >
                {downloading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="download-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.downloadBtnText}>Download Standee</Text>
                  </>
                )}
              </Pressable>

              <Pressable
                style={[styles.printBtn, printing && { opacity: 0.8 }]}
                onPress={handlePrint}
                disabled={downloading || printing}
              >
                {printing ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="print-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.printBtnText}>Print Standee</Text>
                  </>
                )}
              </Pressable>
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
    backgroundColor: "rgba(0, 0, 0, 0.78)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.md,
  },
  modalContent: {
    width: "100%",
    maxHeight: "92%",
    borderRadius: 24,
    borderWidth: 1.5,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: "500",
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollBody: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },

  // Acrylic Standee Preview Card
  standeePreviewCard: {
    backgroundColor: "#0F172A",
    borderRadius: 24,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    shadowColor: "#635BFF",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 8,
    overflow: "hidden",
    position: "relative",
  },
  standeeGlow: {
    position: "absolute",
    top: -50,
    width: 200,
    height: 100,
    backgroundColor: "rgba(99, 91, 255, 0.25)",
    borderRadius: 100,
    transform: [{ scaleX: 2 }],
  },
  standeeInner: {
    width: "100%",
    alignItems: "center",
  },
  standeeBrand: {
    fontSize: 22,
    fontWeight: "900",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  badgePill: {
    backgroundColor: "#635BFF",
    paddingHorizontal: 16,
    paddingVertical: 5,
    borderRadius: radius.pill,
    marginBottom: 16,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  qrWhiteBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
    marginBottom: 16,
  },
  qrLoadingBox: {
    width: 190,
    height: 190,
    alignItems: "center",
    justifyContent: "center",
  },
  qrImg: {
    width: 190,
    height: 190,
  },
  orderNowBanner: {
    backgroundColor: "#635BFF",
    width: "100%",
    maxWidth: 280,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#635BFF",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 4,
    marginBottom: 10,
  },
  orderNowText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  standeeHelper: {
    fontSize: 11,
    color: "#94A3B8",
    textAlign: "center",
    fontWeight: "600",
    marginBottom: 12,
    lineHeight: 15,
  },
  standeeFooter: {
    paddingTop: 8,
    width: "100%",
    alignItems: "center",
  },
  brandBadgePill: {
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  poweredByText: {
    fontSize: 10,
    color: "#F8FAFC",
    fontWeight: "800",
    letterSpacing: 0.8,
  },

  // Link Existing QR Section
  linkSectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: spacing.md,
  },
  linkToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  linkSectionTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  linkedChip: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  linkedChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#10B981",
    flex: 1,
  },
  linkedChipChange: {
    fontSize: 12,
    fontWeight: "800",
    color: "#635BFF",
    marginLeft: 8,
  },
  linkInputContainer: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
    gap: 8,
  },
  linkInputLabel: {
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 16,
  },
  linkInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  linkBtnRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  linkGhostBtn: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  linkPrimaryBtn: {
    backgroundColor: "#635BFF",
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  linkPrimaryBtnText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 13,
  },

  // URL Info Row
  urlContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    padding: spacing.md,
  },
  urlLabel: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  urlText: {
    fontSize: 12,
    fontWeight: "600",
  },
  copyBtn: {
    backgroundColor: "#635BFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  copyBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },

  // Action Buttons
  actionRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: 4,
  },
  downloadBtn: {
    flex: 1,
    backgroundColor: "#635BFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    shadowColor: "#635BFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  downloadBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  printBtn: {
    flex: 1,
    backgroundColor: "#0F172A",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  printBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
});
