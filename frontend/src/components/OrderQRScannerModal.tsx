import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, Modal, Pressable, TextInput,
  ActivityIndicator, Platform, Alert, Dimensions, ScrollView
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAudioPlayer } from "expo-audio";
import { useTheme } from "@/src/context/ThemeContext";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/lib/api";
import { spacing, radius } from "@/src/theme";

const { width } = Dimensions.get("window");
const SCAN_BOX_SIZE = Math.min(width * 0.7, 260);

type Props = {
  visible: boolean;
  onClose: () => void;
  onScanSuccess: (qrData: string, tableNumber?: string) => Promise<void>;
  defaultTable?: string;
};

const BACKEND_BASE = (process.env.EXPO_PUBLIC_BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");
const SCAN_SOUND_URL = `${BACKEND_BASE}/static/sounds/notification.wav`;

export default function OrderQRScannerModal({ visible, onClose, onScanSuccess, defaultTable = "" }: Props) {
  const { theme, isDark } = useTheme();
  const { user } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<"camera" | "manual">("camera");
  const [torch, setTorch] = useState(false);
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [manualCode, setManualCode] = useState("");
  const [targetTable, setTargetTable] = useState(defaultTable);
  const [targetTableId, setTargetTableId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Preload native player
  const player = useAudioPlayer(Platform.OS !== "web" ? SCAN_SOUND_URL : null);
  if (player) {
    player.loop = false;
  }
  const webAudioRef = useRef<any>(null);

  // Preload web Audio constructor on mount
  useEffect(() => {
    if (Platform.OS === "web") {
      try {
        const audio = new window.Audio(SCAN_SOUND_URL);
        audio.preload = "auto";
        audio.loop = false;
        audio.volume = 1.0;
        webAudioRef.current = audio;
      } catch (err) {
        console.error("Failed to preload web scanner audio:", err);
      }
    }
  }, []);

  const playSuccessEffects = () => {
    // 1. Success Haptics
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    
    // 2. Play Scan Success Beep
    try {
      if (Platform.OS === "web") {
        if (webAudioRef.current) {
          webAudioRef.current.currentTime = 0;
          webAudioRef.current.play().catch((err: any) => console.log("Web audio play blocked or failed:", err));
        }
      } else {
        if (player) {
          player.seekTo(0);
          player.play();
        }
      }
    } catch (err) {
      console.warn("Failed to play scan sound:", err);
    }
  };
  
  const [previewOrder, setPreviewOrder] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [scannedData, setScannedData] = useState<string>("");
  const [isCameraActive, setIsCameraActive] = useState(false);

  const scannedRef = useRef(false);

  useEffect(() => {
    if (visible) {
      scannedRef.current = false;
      setBusy(false);
      setManualCode("");
      setTargetTable(defaultTable);
      setTargetTableId(null);
      setTorch(false);
      setPreviewOrder(null);
      setErrorMsg(null);
      setScannedData("");
      
      const timer = setTimeout(() => {
        setIsCameraActive(true);
      }, 350);

      if (!permission?.granted) {
        requestPermission();
      }

      return () => {
        clearTimeout(timer);
      };
    } else {
      setIsCameraActive(false);
    }
  }, [visible, defaultTable]);

  const processScannedCode = async (data: string) => {
    setScannedData(data);
    setErrorMsg(null);
    setBusy(true);

    const raw = data.trim();
    let qrTenant: string | null = null;

    if (raw.startsWith("EZBILL_ORDER:")) {
      try {
        const stripped = raw.substring("EZBILL_ORDER:".length).trim();
        const parsed = JSON.parse(stripped);
        qrTenant = parsed.tenant_id || null;
        if (parsed.table_id) {
          setTargetTableId(parsed.table_id);
        }
        if (parsed.table_number && !targetTable) {
          setTargetTable(parsed.table_number);
        }
      } catch {}
    } else {
      try {
        const parsed = JSON.parse(raw);
        qrTenant = parsed.tenant_id || null;
        if (parsed.table_id) {
          setTargetTableId(parsed.table_id);
        }
        if (parsed.table_number && !targetTable) {
          setTargetTable(parsed.table_number);
        }
      } catch {}
    }

    // Local Restaurant context validation
    if (qrTenant && user?.tenant_id && qrTenant !== user.tenant_id) {
      setErrorMsg("This QR belongs to another restaurant.");
      setBusy(false);
      return;
    }

    try {
      const res = await api.resolveQrOrder(data);
      setPreviewOrder(res);
      if (res.tableId) {
        setTargetTableId(res.tableId);
      }
      if (res.tableName && !targetTable) {
        // Fallback to table label
        setTargetTable(res.tableName.replace("Table ", ""));
      }
      playSuccessEffects();
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to resolve order details.");
    } finally {
      setBusy(false);
    }
  };

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (scannedRef.current || busy || previewOrder) return;
    scannedRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    await processScannedCode(data);
  };

  const handleManualSubmit = async () => {
    if (!manualCode.trim()) {
      Alert.alert("Input Required", "Please enter the order ID or scan payload.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    await processScannedCode(manualCode.trim());
  };

  const handleConfirmOrder = async () => {
    if (!scannedData || busy) return;
    setBusy(true);
    setErrorMsg(null);

    const opId = `op_confirm_${previewOrder?.orderId || "qr"}_${Date.now()}`;

    try {
      const res = await api.confirmQrOrder(scannedData, targetTable.trim() || undefined, opId, targetTableId || undefined);
      // Clean up and notify parent component
      await onScanSuccess(res.order);
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to confirm order.");
      setBusy(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: theme.surface }]}>
          
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="qr-code" size={22} color="#635BFF" />
              <Text style={[styles.title, { color: theme.onSurface }]}>Scan Customer Order</Text>
            </View>
            <Pressable onPress={onClose} style={[styles.closeBtn, { backgroundColor: theme.surfaceSecondary }]} hitSlop={12}>
              <Ionicons name="close" size={20} color={theme.onSurface} />
            </Pressable>
          </View>

          {/* Mode Switcher Pills */}
          <View style={[styles.tabRow, { backgroundColor: theme.surfaceSecondary }]}>
            <Pressable
              style={[styles.tabBtn, mode === "camera" && styles.tabBtnActive]}
              onPress={() => { setMode("camera"); scannedRef.current = false; }}
            >
              <Ionicons name="camera" size={16} color={mode === "camera" ? "#FFFFFF" : theme.onSurfaceSecondary} />
              <Text style={[styles.tabText, mode === "camera" && styles.tabTextActive]}>Camera Scanner</Text>
            </Pressable>
            
            <Pressable
              style={[styles.tabBtn, mode === "manual" && styles.tabBtnActive]}
              onPress={() => setMode("manual")}
            >
              <Ionicons name="keypad" size={16} color={mode === "manual" ? "#FFFFFF" : theme.onSurfaceSecondary} />
              <Text style={[styles.tabText, mode === "manual" && styles.tabTextActive]}>Manual Code</Text>
            </Pressable>
          </View>

          {/* Table Override Row */}
          {!previewOrder && (
            <View style={[styles.tableOverrideRow, { borderColor: theme.border, backgroundColor: theme.surfaceSecondary }]}>
              <Ionicons name="hardware-chip-outline" size={16} color="#635BFF" />
              <Text style={[styles.tableOverrideLabel, { color: theme.onSurface }]}>Table Assignment:</Text>
              <TextInput
                style={[styles.tableOverrideInput, { color: "#635BFF", borderColor: theme.border }]}
                value={targetTable}
                onChangeText={setTargetTable}
                placeholder="e.g. 5"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
              />
            </View>
          )}

          {/* ERROR BOX */}
          {errorMsg && (
            <View style={[styles.errBox, { backgroundColor: isDark ? "rgba(239, 68, 68, 0.15)" : "#FEF2F2", borderColor: "rgba(239, 68, 68, 0.2)" }]}>
              <Ionicons name="alert-circle-outline" size={20} color="#EF4444" style={{ marginRight: 8 }} />
              <Text style={styles.errText}>{errorMsg}</Text>
              <Pressable
                onPress={() => {
                  setErrorMsg(null);
                  scannedRef.current = false;
                  setPreviewOrder(null);
                  setBusy(false);
                }}
                style={styles.retryBtn}
              >
                <Text style={styles.retryBtnText}>Reset</Text>
              </Pressable>
            </View>
          )}

          {/* PREVIEW ORDER MODE */}
          {previewOrder ? (
            <View style={styles.previewContainer}>
              <View style={styles.previewHeader}>
                <Ionicons name="checkmark-circle" size={22} color="#10B981" />
                <Text style={styles.previewTitle}>Order Found</Text>
              </View>

              <Text style={[styles.previewMetaText, { color: theme.onSurfaceSecondary, marginBottom: 8 }]}>
                Table {targetTable || previewOrder.tableName || previewOrder.tableId || "-"} • Customer: {previewOrder.customerName}
              </Text>

              <View style={[styles.previewItemsCard, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
                <ScrollView style={{ maxHeight: 160 }} showsVerticalScrollIndicator={true}>
                  {(previewOrder.items || []).map((it: any, idx: number) => (
                    <View key={idx} style={styles.previewItemRow}>
                      <Text style={styles.previewItemQty}>{it.quantity}×</Text>
                      <Text style={[styles.previewItemName, { color: theme.onSurface }]}>{it.name}</Text>
                      <Text style={[styles.previewItemPrice, { color: theme.onSurface }]}>₹{it.price * it.quantity}</Text>
                    </View>
                  ))}
                </ScrollView>

                <View style={[styles.previewTotalRow, { borderTopColor: theme.border }]}>
                  <Text style={[styles.previewTotalLbl, { color: theme.onSurfaceSecondary }]}>Order Total</Text>
                  <Text style={[styles.previewTotalVal, { color: theme.onSurface }]} testID="preview-total-val">₹{previewOrder.total}</Text>
                </View>
              </View>

              {/* Warning if already confirmed or paid */}
              {previewOrder.status !== "pending_scan" && (
                <View style={{ backgroundColor: "rgba(245,158,11,0.15)", padding: 10, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name="warning" size={16} color="#F59E0B" />
                  <Text style={{ fontSize: 12, color: "#F59E0B", fontWeight: "700" }}>
                    This order is already {previewOrder.status.toUpperCase()}.
                  </Text>
                </View>
              )}

              {/* Preview Action Buttons */}
              <View style={styles.previewButtonsRow}>
                <Pressable
                  style={[styles.previewCancelBtn, { borderColor: theme.border, backgroundColor: theme.surfaceSecondary }]}
                  onPress={() => {
                    setPreviewOrder(null);
                    setErrorMsg(null);
                    setScannedData("");
                    scannedRef.current = false;
                    setBusy(false);
                  }}
                  disabled={busy}
                >
                  <Text style={{ color: theme.onSurfaceSecondary, fontWeight: "700" }}>Scan Again</Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.previewConfirmBtn,
                    { backgroundColor: "#635BFF" },
                    (busy || previewOrder.status !== "pending_scan") && { opacity: 0.6 }
                  ]}
                  onPress={handleConfirmOrder}
                  disabled={busy || previewOrder.status !== "pending_scan"}
                  testID="qr-confirm-order-btn"
                >
                  {busy ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                      <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 15 }}>Confirm Order</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          ) : (
            /* CAMERA / MANUAL FORMS */
            <>
              {mode === "camera" && (
                <View style={styles.cameraContainer}>
                  {isCameraActive ? (
                    permission?.granted ? (
                      <View style={styles.cameraWrap}>
                        <CameraView
                          style={StyleSheet.absoluteFill}
                          facing={facing}
                          enableTorch={torch}
                          barcodeScannerSettings={{
                            barcodeTypes: ["qr"],
                          }}
                          onBarcodeScanned={handleBarcodeScanned}
                        />

                        {/* Viewfinder Target Box Overlay */}
                        <View style={styles.finderOverlay}>
                          <View style={styles.scanTargetBox}>
                            <View style={[styles.corner, styles.cornerTL]} />
                            <View style={[styles.corner, styles.cornerTR]} />
                            <View style={[styles.corner, styles.cornerBL]} />
                            <View style={[styles.corner, styles.cornerBR]} />
                          </View>
                        </View>

                        {/* Camera Action Buttons */}
                        <View style={styles.camControls}>
                          <Pressable
                            style={[styles.camCircleBtn, torch && styles.camCircleBtnActive]}
                            onPress={() => setTorch(!torch)}
                          >
                            <Ionicons name={torch ? "flash" : "flash-outline"} size={20} color="#FFFFFF" />
                          </Pressable>

                          <Pressable
                            style={styles.camCircleBtn}
                            onPress={() => setFacing(facing === "back" ? "front" : "back")}
                          >
                            <Ionicons name="camera-reverse-outline" size={20} color="#FFFFFF" />
                          </Pressable>
                        </View>

                        {busy && (
                          <View style={styles.busyOverlay}>
                            <ActivityIndicator size="large" color="#635BFF" />
                            <Text style={styles.busyText}>Checking QR details...</Text>
                          </View>
                        )}
                      </View>
                    ) : (
                      <View style={[styles.noCamBox, { borderColor: theme.border, backgroundColor: theme.surfaceSecondary }]}>
                        <Ionicons name="camera-outline" size={48} color="#94A3B8" />
                        <Text style={[styles.noCamTitle, { color: theme.onSurface }]}>Camera Permission Required</Text>
                        <Text style={[styles.noCamSub, { color: theme.onSurfaceSecondary }]}>
                          Please allow camera access to scan customer QR codes, or use manual entry.
                        </Text>
                        <Pressable style={styles.grantBtn} onPress={requestPermission}>
                          <Text style={styles.grantBtnText}>Grant Camera Permission</Text>
                        </Pressable>
                        <Pressable style={styles.switchManualBtn} onPress={() => setMode("manual")}>
                          <Text style={styles.switchManualBtnText}>Switch to Manual Code Entry</Text>
                        </Pressable>
                      </View>
                    )
                  ) : (
                    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: theme.surfaceSecondary }}>
                      <ActivityIndicator size="large" color="#635BFF" />
                      <Text style={{ color: theme.onSurfaceSecondary, marginTop: 12, fontSize: 13, fontWeight: "600" }}>
                        Initializing scanner...
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {mode === "manual" && (
                <View style={styles.manualContainer}>
                  <Text style={[styles.manualPrompt, { color: theme.onSurfaceSecondary }]}>
                    Enter the 16-character token, full QR string, or Order ID shown on the customer's phone:
                  </Text>

                  <TextInput
                    style={[styles.manualInput, { color: theme.onSurface, borderColor: theme.border, backgroundColor: theme.surfaceSecondary }]}
                    value={manualCode}
                    onChangeText={setManualCode}
                    placeholder="e.g. EZBILL_ORDER:{...} or Token"
                    placeholderTextColor="#64748B"
                    autoFocus
                  />

                  <Pressable
                    style={[styles.submitBtn, (!manualCode.trim() || busy) && { opacity: 0.6 }]}
                    onPress={handleManualSubmit}
                    disabled={!manualCode.trim() || busy}
                  >
                    {busy ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                        <Text style={styles.submitBtnText}>Check Order Code</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              )}
            </>
          )}

        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  container: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: spacing.xl,
    paddingBottom: Platform.OS === "ios" ? 40 : spacing.xl,
    maxHeight: "90%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  tabRow: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 4,
    marginBottom: spacing.md,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
  },
  tabBtnActive: {
    backgroundColor: "#635BFF",
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  tabTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  tableOverrideRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: spacing.md,
    gap: 8,
  },
  tableOverrideLabel: {
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
  },
  tableOverrideInput: {
    fontSize: 15,
    fontWeight: "800",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 60,
    textAlign: "center",
    backgroundColor: "rgba(99,91,255,0.08)",
  },
  cameraContainer: {
    height: 320,
    borderRadius: 20,
    overflow: "hidden",
  },
  cameraWrap: {
    flex: 1,
    position: "relative",
  },
  finderOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  scanTargetBox: {
    width: SCAN_BOX_SIZE,
    height: SCAN_BOX_SIZE,
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: 24,
    height: 24,
    borderColor: "#635BFF",
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 8 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 8 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 8 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 8 },
  camControls: {
    position: "absolute",
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 20,
  },
  camCircleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  camCircleBtnActive: {
    backgroundColor: "#635BFF",
  },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  busyText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  noCamBox: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
    textAlign: "center",
  },
  noCamTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginTop: 12,
    textAlign: "center",
  },
  noCamSub: {
    fontSize: 13,
    textAlign: "center",
    marginTop: 6,
    marginBottom: spacing.lg,
  },
  grantBtn: {
    backgroundColor: "#635BFF",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  grantBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },
  switchManualBtn: {
    marginTop: 12,
  },
  switchManualBtnText: {
    color: "#635BFF",
    fontWeight: "700",
    fontSize: 13,
  },
  manualContainer: {
    paddingVertical: spacing.md,
  },
  manualPrompt: {
    fontSize: 13,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  manualInput: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    fontSize: 14,
    marginBottom: spacing.lg,
  },
  submitBtn: {
    height: 50,
    backgroundColor: "#635BFF",
    borderRadius: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  errBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  errText: {
    flex: 1,
    color: "#EF4444",
    fontSize: 13,
    fontWeight: "600",
  },
  retryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#EF4444",
    borderRadius: 8,
  },
  retryBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  previewContainer: {
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: spacing.xs,
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#10B981",
  },
  previewMetaText: {
    fontSize: 13,
    fontWeight: "700",
  },
  previewItemsCard: {
    padding: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
  },
  previewItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  previewItemQty: {
    fontWeight: "800",
    color: "#635BFF",
    width: 24,
  },
  previewItemName: {
    flex: 1,
    fontWeight: "600",
  },
  previewItemPrice: {
    fontWeight: "700",
  },
  previewTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: spacing.md,
    borderTopWidth: 1,
    marginTop: spacing.sm,
  },
  previewTotalLbl: {
    fontSize: 13,
    fontWeight: "700",
  },
  previewTotalVal: {
    fontSize: 18,
    fontWeight: "900",
  },
  previewButtonsRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  previewCancelBtn: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  previewConfirmBtn: {
    flex: 1.5,
    height: 50,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
});
