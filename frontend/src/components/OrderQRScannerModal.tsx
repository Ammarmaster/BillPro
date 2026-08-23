import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, Modal, Pressable, TextInput,
  ActivityIndicator, Platform, Dimensions, ScrollView
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
  onScanSuccess: (order: any, tableNumber?: string) => Promise<void> | void;
  defaultTable?: string;
};

const BACKEND_BASE = (process.env.EXPO_PUBLIC_BACKEND_URL && !process.env.EXPO_PUBLIC_BACKEND_URL.includes("0.0.0.0") ? process.env.EXPO_PUBLIC_BACKEND_URL : "https://billpro-wulv.onrender.com").replace(/\/$/, "");
const SCAN_SOUND_URL = `${BACKEND_BASE}/static/sounds/notification.wav`;

// Universal 0ms Audio Beep Generator
function playInstantPOSBeep() {
  try {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(1046.5, ctx.currentTime); // C6 crisp POS beep
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.18);
      }
    }
  } catch (err) {
    console.warn("Audio beep error:", err);
  }
}

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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  
  // Scanned order review state
  const [scannedOrderPreview, setScannedOrderPreview] = useState<any | null>(null);
  const [rawScannedPayload, setRawScannedPayload] = useState<string>("");

  // Preload native audio player
  const player = useAudioPlayer(Platform.OS !== "web" ? SCAN_SOUND_URL : null);
  if (player) {
    player.loop = false;
  }

  const scannedRef = useRef(false);

  useEffect(() => {
    if (visible) {
      scannedRef.current = false;
      setBusy(false);
      setManualCode("");
      setTargetTable(defaultTable);
      setTargetTableId(null);
      setTorch(false);
      setErrorMsg(null);
      setScannedOrderPreview(null);
      setRawScannedPayload("");
      
      const timer = setTimeout(() => {
        setIsCameraActive(true);
      }, 300);

      if (!permission?.granted) {
        requestPermission();
      }

      return () => {
        clearTimeout(timer);
      };
    } else {
      setIsCameraActive(false);
      setScannedOrderPreview(null);
    }
  }, [visible, defaultTable]);

  const handleScanData = async (data: string) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    setBusy(true);
    setErrorMsg(null);

    // 1. Play Instant Confirmation Beep & Vibration
    playInstantPOSBeep();
    if (player && Platform.OS !== "web") {
      try {
        player.seekTo(0);
        player.play();
      } catch {}
    }

    const raw = data.trim();
    let parsedOrder: any = null;
    let qrTenant: string | null = null;
    let tblNum = targetTable.trim();

    if (raw.startsWith("EZBILL_ORDER:")) {
      try {
        const stripped = raw.substring("EZBILL_ORDER:".length).trim();
        parsedOrder = JSON.parse(stripped);
        qrTenant = parsedOrder.tenant_id || null;
        if (parsedOrder.table_number && !tblNum) {
          tblNum = parsedOrder.table_number;
        }
      } catch {}
    } else {
      try {
        parsedOrder = JSON.parse(raw);
        qrTenant = parsedOrder.tenant_id || null;
        if (parsedOrder.table_number && !tblNum) {
          tblNum = parsedOrder.table_number;
        }
      } catch {}
    }

    // If local JSON parsing was insufficient, resolve from backend
    if (!parsedOrder || !parsedOrder.items || parsedOrder.items.length === 0) {
      try {
        const res = await api.resolveQrOrder(raw);
        if (res && res.items && res.items.length > 0) {
          parsedOrder = res;
          if (res.table_number && !tblNum) {
            tblNum = res.table_number;
          }
        }
      } catch (resErr: any) {
        console.warn("Backend QR resolve notice:", resErr);
      }
    }

    // Local Restaurant context validation
    if (qrTenant && user?.tenant_id && qrTenant !== user.tenant_id) {
      setErrorMsg("This QR belongs to another restaurant.");
      setBusy(false);
      scannedRef.current = false;
      return;
    }

    if (!parsedOrder) {
      setErrorMsg("Invalid QR code format. Please scan an EzBill customer order QR.");
      setBusy(false);
      scannedRef.current = false;
      return;
    }

    const assignedTable = tblNum || parsedOrder.table_number || "1";
    const orderId = parsedOrder?.order_id || parsedOrder?.id || `qr_${Date.now()}`;
    const orderNum = parsedOrder?.order_number || String(Math.floor(100 + Math.random() * 900));
    const orderItems = parsedOrder?.items || [];
    const subtotal = parsedOrder?.subtotal || orderItems.reduce((sum: number, x: any) => sum + (Number(x.price || 0) * Number(x.quantity || 1)), 0);

    const readyOrder = {
      id: orderId,
      order_number: orderNum,
      table_number: assignedTable,
      customer_name: parsedOrder?.customer_name || "Guest",
      session_id: parsedOrder?.session_id || `tsess_${Date.now()}`,
      items: orderItems,
      notes: parsedOrder?.notes || "",
      subtotal: subtotal,
      status: "placed",
      created_by: "guest",
      order_source: "qr_web",
      created_at: new Date().toISOString(),
    };

    setTargetTable(assignedTable);
    setRawScannedPayload(data);
    setScannedOrderPreview(readyOrder);
    setBusy(false);
  };

  const handleConfirmOrder = async () => {
    if (!scannedOrderPreview) return;
    setBusy(true);

    const assignedTable = targetTable.trim() || scannedOrderPreview.table_number || "1";
    const finalOrder = {
      ...scannedOrderPreview,
      table_number: assignedTable,
    };

    // 1. Immediately Close Modal and Attach in 0ms!
    onClose();
    try {
      await onScanSuccess(finalOrder, assignedTable);
    } catch (cbErr) {
      console.warn("onScanSuccess callback error:", cbErr);
    }

    // 2. Background Authoritative Network Confirmation
    (async () => {
      try {
        const opId = `op_confirm_${finalOrder.id}_${Date.now()}`;
        const res = await api.confirmQrOrder(rawScannedPayload, assignedTable, opId, targetTableId || undefined);
        if (res && res.order) {
          api.updateCachedOrder(finalOrder.id, res.order);
        }
      } catch (e: any) {
        console.warn("Background QR confirm sync error:", e);
      }
    })();
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (scannedRef.current || busy || scannedOrderPreview) return;
    handleScanData(data);
  };

  const handleManualSubmit = () => {
    if (!manualCode.trim()) {
      setErrorMsg("Please enter order ID or scan code.");
      return;
    }
    handleScanData(manualCode.trim());
  };

  const resetScanner = () => {
    setScannedOrderPreview(null);
    setRawScannedPayload("");
    scannedRef.current = false;
    setBusy(false);
    setErrorMsg(null);
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
              <Text style={[styles.title, { color: theme.onSurface }]}>
                {scannedOrderPreview ? "Review Customer Order" : "Scan Customer Order"}
              </Text>
            </View>
            <Pressable onPress={onClose} style={[styles.closeBtn, { backgroundColor: theme.surfaceSecondary }]} hitSlop={12}>
              <Ionicons name="close" size={20} color={theme.onSurface} />
            </Pressable>
          </View>

          {/* IF SCANNED: SHOW SCANNED ORDER PREVIEW & CONFIRM BUTTON */}
          {scannedOrderPreview ? (
            <ScrollView contentContainerStyle={styles.previewContainer} showsVerticalScrollIndicator={false}>
              
              {/* Customer & Table Badge */}
              <View style={[styles.previewHeaderCard, { backgroundColor: isDark ? "#1E293B" : "#EEF2FF", borderColor: isDark ? "#334155" : "#C7D2FE" }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.previewCustName, { color: theme.onSurface }]}>
                    👤 {scannedOrderPreview.customer_name || "Guest"}
                  </Text>
                  <Text style={[styles.previewOrderNum, { color: theme.onSurfaceSecondary }]}>
                    Order #{scannedOrderPreview.order_number || scannedOrderPreview.id?.slice(-4)}
                  </Text>
                </View>
                
                {/* Table Override Pill */}
                <View style={[styles.tablePill, { backgroundColor: "#635BFF" }]}>
                  <Ionicons name="tablet-portrait" size={14} color="#FFF" />
                  <Text style={styles.tablePillText}>Table</Text>
                  <TextInput
                    style={styles.tablePillInput}
                    value={targetTable}
                    onChangeText={setTargetTable}
                    keyboardType="default"
                    selectTextOnFocus
                  />
                </View>
              </View>

              {/* Items List */}
              <View style={styles.itemsSection}>
                <Text style={[styles.itemsSectionTitle, { color: theme.onSurfaceSecondary }]}>ORDERED ITEMS</Text>
                <View style={[styles.itemsCard, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
                  {(scannedOrderPreview.items || []).map((it: any, idx: number) => (
                    <View key={idx} style={[styles.itemRow, idx > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
                      <View style={styles.itemQtyBadge}>
                        <Text style={styles.itemQtyText}>{it.quantity}×</Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={[styles.itemNameText, { color: theme.onSurface }]}>{it.name}</Text>
                        {it.notes ? <Text style={styles.itemNoteText}>* {it.notes}</Text> : null}
                      </View>
                      <Text style={[styles.itemPriceText, { color: "#635BFF" }]}>₹{it.price * it.quantity}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Special Cooking Notes */}
              {scannedOrderPreview.notes ? (
                <View style={[styles.notesBox, { backgroundColor: isDark ? "#2B2212" : "#FFFBEB", borderColor: isDark ? "#78350F" : "#FDE68A" }]}>
                  <Ionicons name="document-text-outline" size={16} color="#D97706" />
                  <Text style={styles.notesBoxText}>{scannedOrderPreview.notes}</Text>
                </View>
              ) : null}

              {/* Subtotal Card */}
              <View style={[styles.totalRow, { borderTopColor: theme.border }]}>
                <Text style={[styles.totalLbl, { color: theme.onSurface }]}>Total Amount</Text>
                <Text style={styles.totalVal}>₹{scannedOrderPreview.subtotal}</Text>
              </View>

              {/* Action Buttons */}
              <View style={styles.actionRow}>
                <Pressable
                  style={[styles.rescanBtn, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}
                  onPress={resetScanner}
                  disabled={busy}
                >
                  <Ionicons name="scan-outline" size={18} color={theme.onSurface} />
                  <Text style={[styles.rescanBtnText, { color: theme.onSurface }]}>Rescan</Text>
                </Pressable>

                <Pressable
                  style={[styles.confirmBtn, busy && { opacity: 0.6 }]}
                  onPress={handleConfirmOrder}
                  disabled={busy}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                      <Text style={styles.confirmBtnText}>Confirm & Send to KOT</Text>
                    </>
                  )}
                </Pressable>
              </View>

            </ScrollView>
          ) : (
            /* SCANNER VIEW */
            <>
              {/* Mode Switcher Pills */}
              <View style={[styles.tabRow, { backgroundColor: theme.surfaceSecondary }]}>
                <Pressable
                  style={[styles.tabBtn, mode === "camera" && styles.tabBtnActive]}
                  onPress={() => { setMode("camera"); resetScanner(); }}
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

              {/* Table Assignment Row */}
              <View style={[styles.tableOverrideRow, { borderColor: theme.border, backgroundColor: theme.surfaceSecondary }]}>
                <Ionicons name="tablet-portrait-outline" size={16} color="#635BFF" />
                <Text style={[styles.tableOverrideLabel, { color: theme.onSurface }]}>Target Table:</Text>
                <TextInput
                  style={[styles.tableOverrideInput, { color: "#635BFF", borderColor: theme.border, backgroundColor: theme.surface }]}
                  value={targetTable}
                  onChangeText={setTargetTable}
                  placeholder="e.g. 5"
                  placeholderTextColor="#94A3B8"
                  keyboardType="default"
                />
              </View>

              {/* ERROR BOX */}
              {errorMsg && (
                <View style={[styles.errBox, { backgroundColor: isDark ? "rgba(239, 68, 68, 0.15)" : "#FEF2F2", borderColor: "rgba(239, 68, 68, 0.2)" }]}>
                  <Ionicons name="alert-circle-outline" size={20} color="#EF4444" style={{ marginRight: 8 }} />
                  <Text style={styles.errText}>{errorMsg}</Text>
                  <Pressable onPress={resetScanner} style={styles.retryBtn}>
                    <Text style={styles.retryBtnText}>Retry</Text>
                  </Pressable>
                </View>
              )}

              {/* CONTENT AREA: CAMERA SCANNER OR MANUAL INPUT */}
              <View style={styles.contentArea}>
                {mode === "camera" ? (
                  <View style={styles.cameraWrapper}>
                    {!permission?.granted ? (
                      <View style={styles.permissionBox}>
                        <Ionicons name="camera-outline" size={48} color="#94A3B8" />
                        <Text style={[styles.permissionText, { color: theme.onSurface }]}>
                          Camera permission is required to scan customer QR codes.
                        </Text>
                        <Pressable style={styles.permissionBtn} onPress={requestPermission}>
                          <Text style={styles.permissionBtnText}>Enable Camera</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <View style={styles.cameraContainer}>
                        {isCameraActive && (
                          <CameraView
                            style={StyleSheet.absoluteFillObject}
                            facing={facing}
                            enableTorch={torch}
                            barcodeScannerSettings={{
                              barcodeTypes: ["qr"],
                            }}
                            onBarcodeScanned={handleBarcodeScanned}
                          />
                        )}
                        
                        {/* Viewfinder Target Box with glowing corners */}
                        <View style={styles.finderOverlay}>
                          <View style={[styles.scanBox, { width: SCAN_BOX_SIZE, height: SCAN_BOX_SIZE }]}>
                            <View style={[styles.corner, styles.tl]} />
                            <View style={[styles.corner, styles.tr]} />
                            <View style={[styles.corner, styles.bl]} />
                            <View style={[styles.corner, styles.br]} />
                            {busy && (
                              <View style={styles.scanningIndicator}>
                                <ActivityIndicator size="large" color="#635BFF" />
                                <Text style={styles.scanningText}>Loading Order...</Text>
                              </View>
                            )}
                          </View>
                        </View>

                        {/* Camera Control Overlay */}
                        <View style={styles.cameraControls}>
                          <Pressable
                            style={[styles.ctrlBtn, torch && styles.ctrlBtnActive]}
                            onPress={() => setTorch(!torch)}
                          >
                            <Ionicons name={torch ? "flash" : "flash-off"} size={20} color={torch ? "#635BFF" : "#FFF"} />
                          </Pressable>

                          <Pressable
                            style={styles.ctrlBtn}
                            onPress={() => setFacing(facing === "back" ? "front" : "back")}
                          >
                            <Ionicons name="camera-reverse" size={20} color="#FFF" />
                          </Pressable>
                        </View>
                      </View>
                    )}
                  </View>
                ) : (
                  <ScrollView contentContainerStyle={styles.manualWrapper}>
                    <View style={[styles.manualCard, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
                      <Text style={[styles.manualTitle, { color: theme.onSurface }]}>Enter Order ID / JSON</Text>
                      <Text style={[styles.manualSub, { color: theme.onSurfaceSecondary }]}>
                        Type the order reference or raw payload from customer's phone.
                      </Text>
                      
                      <TextInput
                        style={[styles.manualInput, { color: theme.onSurface, borderColor: theme.border, backgroundColor: theme.surface }]}
                        value={manualCode}
                        onChangeText={setManualCode}
                        placeholder="e.g. EZBILL_ORDER:..."
                        placeholderTextColor="#94A3B8"
                        autoCapitalize="none"
                        autoCorrect={false}
                        multiline
                      />

                      <Pressable
                        style={[styles.manualSubmitBtn, busy && { opacity: 0.6 }]}
                        onPress={handleManualSubmit}
                        disabled={busy}
                      >
                        {busy ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <>
                            <Ionicons name="search" size={18} color="#FFFFFF" />
                            <Text style={styles.manualSubmitBtnText}>Load Order Preview</Text>
                          </>
                        )}
                      </Pressable>
                    </View>
                  </ScrollView>
                )}
              </View>
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
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "flex-end",
  },
  container: {
    height: "90%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 16,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: "900",
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
    marginHorizontal: 20,
    borderRadius: 14,
    padding: 4,
    marginBottom: 12,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  tabBtnActive: {
    backgroundColor: "#635BFF",
  },
  tabText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748B",
  },
  tabTextActive: {
    color: "#FFFFFF",
  },
  tableOverrideRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    gap: 8,
  },
  tableOverrideLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  tableOverrideInput: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    fontWeight: "800",
    fontSize: 14,
  },
  errBox: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  errText: {
    flex: 1,
    color: "#EF4444",
    fontSize: 13,
    fontWeight: "600",
  },
  retryBtn: {
    backgroundColor: "#EF4444",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  retryBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  contentArea: {
    flex: 1,
  },
  cameraWrapper: {
    flex: 1,
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#000000",
  },
  cameraContainer: {
    flex: 1,
    position: "relative",
  },
  finderOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  scanBox: {
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 20,
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  corner: {
    position: "absolute",
    width: 24,
    height: 24,
    borderColor: "#635BFF",
  },
  tl: { top: -2, left: -2, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 12 },
  tr: { top: -2, right: -2, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 12 },
  bl: { bottom: -2, left: -2, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 12 },
  br: { bottom: -2, right: -2, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 12 },
  scanningIndicator: {
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    gap: 8,
  },
  scanningText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  cameraControls: {
    position: "absolute",
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 20,
  },
  ctrlBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  ctrlBtnActive: {
    backgroundColor: "rgba(99, 91, 255, 0.3)",
    borderColor: "#635BFF",
  },
  permissionBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 12,
  },
  permissionText: {
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
  },
  permissionBtn: {
    backgroundColor: "#635BFF",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 8,
  },
  permissionBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  manualWrapper: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  manualCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  manualTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  manualSub: {
    fontSize: 13,
  },
  manualInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    minHeight: 100,
    textAlignVertical: "top",
    fontSize: 13,
  },
  manualSubmitBtn: {
    backgroundColor: "#635BFF",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  manualSubmitBtnText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 14,
  },

  /* Preview Sheet Styles */
  previewContainer: {
    paddingHorizontal: 20,
    paddingBottom: 30,
    gap: 14,
  },
  previewHeaderCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  previewCustName: {
    fontSize: 16,
    fontWeight: "900",
  },
  previewOrderNum: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  tablePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  tablePillText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  tablePillInput: {
    backgroundColor: "#FFFFFF",
    color: "#635BFF",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    fontWeight: "900",
    fontSize: 13,
    minWidth: 32,
    textAlign: "center",
  },
  itemsSection: {
    gap: 6,
  },
  itemsSectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  itemsCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
  },
  itemQtyBadge: {
    backgroundColor: "rgba(99, 91, 255, 0.12)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  itemQtyText: {
    color: "#635BFF",
    fontSize: 13,
    fontWeight: "800",
  },
  itemNameText: {
    fontSize: 14,
    fontWeight: "700",
  },
  itemNoteText: {
    fontSize: 12,
    color: "#D97706",
    marginTop: 2,
  },
  itemPriceText: {
    fontSize: 14,
    fontWeight: "800",
  },
  notesBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  notesBoxText: {
    fontSize: 13,
    color: "#D97706",
    fontWeight: "600",
    flex: 1,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 12,
    borderTopWidth: 1,
  },
  totalLbl: {
    fontSize: 16,
    fontWeight: "800",
  },
  totalVal: {
    fontSize: 22,
    fontWeight: "900",
    color: "#635BFF",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  rescanBtn: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  rescanBtnText: {
    fontSize: 14,
    fontWeight: "700",
  },
  confirmBtn: {
    flex: 2,
    backgroundColor: "#635BFF",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: "#635BFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
});
