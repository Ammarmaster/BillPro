import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, Modal, Pressable, TextInput,
  ActivityIndicator, Platform, Alert, Dimensions
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/context/ThemeContext";
import { spacing, radius } from "@/src/theme";

const { width } = Dimensions.get("window");
const SCAN_BOX_SIZE = Math.min(width * 0.7, 260);

type Props = {
  visible: boolean;
  onClose: () => void;
  onScanSuccess: (qrData: string, tableNumber?: string) => Promise<void>;
  defaultTable?: string;
};

export default function OrderQRScannerModal({ visible, onClose, onScanSuccess, defaultTable = "" }: Props) {
  const { theme, isDark } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<"camera" | "manual">("camera");
  const [torch, setTorch] = useState(false);
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [manualCode, setManualCode] = useState("");
  const [targetTable, setTargetTable] = useState(defaultTable);
  const [busy, setBusy] = useState(false);
  const scannedRef = useRef(false);

  useEffect(() => {
    if (visible) {
      scannedRef.current = false;
      setBusy(false);
      setManualCode("");
      setTargetTable(defaultTable);
      setTorch(false);
      if (!permission?.granted) {
        requestPermission();
      }
    }
  }, [visible, defaultTable]);

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (scannedRef.current || busy) return;
    scannedRef.current = true;
    setBusy(true);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    try {
      await onScanSuccess(data, targetTable.trim() || undefined);
    } catch (e: any) {
      Alert.alert("Scan Failed", e.message || "Failed to import order.");
      scannedRef.current = false;
      setBusy(false);
    }
  };

  const handleManualSubmit = async () => {
    if (!manualCode.trim()) {
      Alert.alert("Input Required", "Please enter the order ID or scan payload.");
      return;
    }
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    try {
      await onScanSuccess(manualCode.trim(), targetTable.trim() || undefined);
    } catch (e: any) {
      Alert.alert("Import Failed", e.message || "Failed to import order.");
      setBusy(false);
    }
  };

  if (!visible) return null;

  const hasCamera = permission?.granted;

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

          {/* CAMERA MODE */}
          {mode === "camera" && (
            <View style={styles.cameraContainer}>
              {hasCamera ? (
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
                      <Text style={styles.busyText}>Attaching Order to Table...</Text>
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
              )}
            </View>
          )}

          {/* MANUAL MODE */}
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
                    <Text style={styles.submitBtnText}>Import Order to Table</Text>
                  </>
                )}
              </Pressable>
            </View>
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
});
