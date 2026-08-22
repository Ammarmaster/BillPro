import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, Pressable,
  ActivityIndicator, Switch, Platform, StatusBar, Alert
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { spacing, radius } from "@/src/theme";
import * as Haptics from "expo-haptics";
import {
  savePrinterSettings, getPrinterSettings, printThermalDirect, forgetPrinter,
  subscribePrinterStatus, checkPrinterConnection, scanNearbyPrinters, autoConnectPrinter,
  PrinterSettings, PrinterConnectionStatus
} from "@/src/lib/print";

const BRAND_ORANGE = "#FF5722";
const DARK_BG = "#0B0F19";
const CARD_BG = "#151B2B";
const CARD_BORDER = "#1F293D";
const INPUT_BG = "#0B0F19";
const CHIP_INACTIVE_BG = "#20283A";
const TEXT_MUTED = "#8B9BB4";

export default function PrinterSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<"cashier" | "kitchen">("cashier");
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [connectingAddress, setConnectingAddress] = useState<string | null>(null);
  const [devices, setDevices] = useState<{ name: string; address: string; type: "bluetooth" | "network" }[]>([]);
  const [testingPrint, setTestingPrint] = useState(false);

  // Live status from persistent printer manager
  const [cashierConnStatus, setCashierConnStatus] = useState<PrinterConnectionStatus>("none");
  const [kitchenConnStatus, setKitchenConnStatus] = useState<PrinterConnectionStatus>("none");

  // Cashier printer states
  const [cashierType, setCashierType] = useState<"network" | "bluetooth" | "system" | "none">("bluetooth");
  const [cashierIP, setCashierIP] = useState("");
  const [cashierPort, setCashierPort] = useState("9100");
  const [cashierMAC, setCashierMAC] = useState("MPT-II");
  const [cashierName, setCashierName] = useState("Cashier Thermal Printer");
  const [cashierWidth, setCashierWidth] = useState<58 | 80>(58);
  const [cashierAuto, setCashierAuto] = useState(true);

  // Kitchen printer states
  const [kitchenType, setKitchenType] = useState<"network" | "bluetooth" | "system" | "none">("none");
  const [kitchenIP, setKitchenIP] = useState("");
  const [kitchenPort, setKitchenPort] = useState("9100");
  const [kitchenMAC, setKitchenMAC] = useState("");
  const [kitchenName, setKitchenName] = useState("Kitchen Thermal Printer");
  const [kitchenWidth, setKitchenWidth] = useState<58 | 80>(80);
  const [kitchenAuto, setKitchenAuto] = useState(true);

  useEffect(() => {
    const unsubCashier = subscribePrinterStatus("cashier", s => setCashierConnStatus(s));
    const unsubKitchen = subscribePrinterStatus("kitchen", s => setKitchenConnStatus(s));
    loadSettings();
    handleScan();
    return () => {
      unsubCashier();
      unsubKitchen();
    };
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    const cashier = await getPrinterSettings("cashier");
    if (cashier) {
      setCashierType(cashier.type);
      if (cashier.type === "network") {
        setCashierIP(cashier.address);
        setCashierPort(cashier.port || "9100");
      } else if (cashier.type === "bluetooth") {
        setCashierMAC(cashier.address);
      }
      setCashierName(cashier.name);
      setCashierWidth(cashier.width);
      setCashierAuto(cashier.auto_print);
    }

    const kitchen = await getPrinterSettings("kitchen");
    if (kitchen) {
      setKitchenType(kitchen.type);
      if (kitchen.type === "network") {
        setKitchenIP(kitchen.address);
        setKitchenPort(kitchen.port || "9100");
      } else if (kitchen.type === "bluetooth") {
        setKitchenMAC(kitchen.address);
      }
      setKitchenName(kitchen.name);
      setKitchenWidth(kitchen.width);
      setKitchenAuto(kitchen.auto_print);
    }
    setLoading(false);
    checkPrinterConnection("cashier").catch(() => {});
    checkPrinterConnection("kitchen").catch(() => {});
  };

  const handleScan = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setScanning(true);
    try {
      const found = await scanNearbyPrinters();
      setDevices(found);
    } catch (e: any) {
      console.warn("Scan failed:", e);
    } finally {
      setScanning(false);
    }
  };

  const handleConnectDevice = async (dev: { name: string; address: string; type: "bluetooth" | "network" }) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setConnectingAddress(dev.address);
    try {
      const isCashier = activeTab === "cashier";
      const newType = dev.type;
      
      if (isCashier) {
        setCashierType(newType);
        setCashierName(dev.name);
        if (newType === "network") {
          setCashierIP(dev.address);
          setCashierMAC("");
        } else {
          setCashierMAC(dev.address);
          setCashierIP("");
        }
      } else {
        setKitchenType(newType);
        setKitchenName(dev.name);
        if (newType === "network") {
          setKitchenIP(dev.address);
          setKitchenMAC("");
        } else {
          setKitchenMAC(dev.address);
          setKitchenIP("");
        }
      }

      await autoConnectPrinter(activeTab, {
        name: dev.name,
        address: dev.address,
        type: dev.type,
        width: isCashier ? cashierWidth : kitchenWidth,
        auto_print: isCashier ? cashierAuto : kitchenAuto
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(
        "Printer Connected & Saved",
        `Successfully paired with ${dev.name}. EzBill will now connect to this printer automatically on every print.`
      );
    } catch (e: any) {
      Alert.alert("Connection Failed", e.message || "Failed to auto-connect to printer.");
    } finally {
      setConnectingAddress(null);
    }
  };

  const handleForget = async (role: "cashier" | "kitchen") => {
    Alert.alert(
      "Forget Printer",
      `Are you sure you want to forget the ${role === "cashier" ? "Cashier" : "Kitchen"} printer configuration?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Forget",
          style: "destructive",
          onPress: async () => {
            await forgetPrinter(role);
            if (role === "cashier") {
              setCashierType("none");
              setCashierIP("");
              setCashierMAC("");
            } else {
              setKitchenType("none");
              setKitchenIP("");
              setKitchenMAC("");
            }
            Alert.alert("Printer Removed", "Printer configuration cleared.");
          }
        }
      ]
    );
  };

  const handleSaveManual = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const cashierSettings: PrinterSettings = {
        type: cashierType,
        address: (cashierType === "network" ? cashierIP : cashierMAC).trim(),
        port: cashierPort.trim(),
        name: cashierName.trim(),
        width: cashierWidth,
        auto_print: cashierAuto
      };
      await savePrinterSettings("cashier", cashierSettings);

      const kitchenSettings: PrinterSettings = {
        type: kitchenType,
        address: (kitchenType === "network" ? kitchenIP : kitchenMAC).trim(),
        port: kitchenPort.trim(),
        name: kitchenName.trim(),
        width: kitchenWidth,
        auto_print: kitchenAuto
      };
      await savePrinterSettings("kitchen", kitchenSettings);

      Alert.alert("Success", "Printer settings saved! Auto-reconnection enabled.");
    } catch (e: any) {
      Alert.alert("Error", `Failed to save printer settings: ${e.message}`);
    }
  };

  const handleTestPrint = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setTestingPrint(true);
    const testBill = {
      id: "test-" + Math.random().toString(36).substring(2, 7),
      table_number: "7",
      customer_name: "Test Customer",
      created_at: new Date().toISOString(),
      subtotal: 350.00,
      gst_enabled: true,
      cgst: 8.75,
      sgst: 8.75,
      discount: 0,
      total: 367.50,
      status: "paid",
      payment_method: "UPI",
      items: [
        { name: "Butter Chicken", quantity: 1, price: 280.00 },
        { name: "Garlic Naan", quantity: 2, price: 35.00, notes: "Crispy & hot" }
      ],
      restaurant_snapshot: {
        name: "EzBill Thermal Test",
        address: "Master Chef POS",
        phone: "+91 8152075375",
        upi_id: "8152075375-2@ybl",
        merchant_name: "EzBill POS"
      }
    };

    try {
      if (activeTab === "cashier") {
        await printThermalDirect("cashier", testBill, false);
      } else {
        await printThermalDirect("kitchen", testBill, true);
      }
    } catch (e: any) {
      Alert.alert("Print Test", e.message || "Failed to print test ticket.");
    } finally {
      setTestingPrint(false);
    }
  };

  const currentStatus = activeTab === "cashier" ? cashierConnStatus : kitchenConnStatus;
  const currentType = activeTab === "cashier" ? cashierType : kitchenType;
  const currentName = activeTab === "cashier" ? cashierName : kitchenName;
  const currentAddress = activeTab === "cashier" ? (cashierType === "network" ? cashierIP : cashierMAC) : (kitchenType === "network" ? kitchenIP : kitchenMAC);

  const getStatusBadge = (st: PrinterConnectionStatus) => {
    switch (st) {
      case "connected":
        return { label: "Printer Connected", bg: "#DCFCE7", text: "#10B981", icon: "checkmark-circle" };
      case "reconnecting":
        return { label: "Reconnecting...", bg: "#FEF3C7", text: "#F59E0B", icon: "sync" };
      case "unavailable":
        return { label: "Printer Unavailable", bg: "#FEE2E2", text: "#EF4444", icon: "alert-circle" };
      default:
        return { label: "Not Configured", bg: "#20283A", text: "#8B9BB4", icon: "close-circle" };
    }
  };

  const badge = getStatusBadge(currentStatus);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: DARK_BG }]}>
        <ActivityIndicator size="large" color={BRAND_ORANGE} />
      </View>
    );
  }

  return (
    <View style={[styles.safe, { backgroundColor: DARK_BG, paddingTop: Math.max(insets.top, 16) }]}>
      <StatusBar barStyle="light-content" backgroundColor={DARK_BG} translucent={true} />
      
      {/* Header Matching Screenshot */}
      <View style={styles.header}>
        <Pressable onPress={() => router.replace("/(app)/more")} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
        </Pressable>
        <View style={{ marginLeft: 14, flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>Thermal Printer</Text>
          <Text style={styles.sub} numberOfLines={1}>Auto-reconnect & ESC/POS direct printing</Text>
        </View>
      </View>

      {/* Role Tabs Matching Screenshot */}
      <View style={styles.tabsRow}>
        <Pressable
          style={[styles.tab, activeTab === "cashier" && styles.tabActive]}
          onPress={() => setActiveTab("cashier")}
        >
          <Text style={[styles.tabText, activeTab === "cashier" ? styles.tabTextActive : { color: TEXT_MUTED }]}>
            Cashier Printer
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "kitchen" && styles.tabActive]}
          onPress={() => setActiveTab("kitchen")}
        >
          <Text style={[styles.tabText, activeTab === "kitchen" ? styles.tabTextActive : { color: TEXT_MUTED }]}>
            Kitchen Printer
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        
        {/* Active Remembered Printer Card Matching Screenshot */}
        <View style={styles.activePrinterCard}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
              <Text style={styles.printerNameTitle} numberOfLines={1}>
                {currentName || (currentType !== "none" ? "Cashier Thermal Printer" : "No Printer Configured")}
              </Text>
              <Text style={styles.printerTypeSubtitle} numberOfLines={1}>
                Type: {currentType.toUpperCase()} {currentAddress ? `• ${currentAddress}` : ""}
              </Text>
            </View>
            <View style={[styles.statusPill, { backgroundColor: badge.bg }]}>
              <Ionicons name={badge.icon as any} size={14} color={badge.text} />
              <Text style={[styles.statusPillText, { color: badge.text }]}>{badge.label}</Text>
            </View>
          </View>

          {/* Card Actions Matching Screenshot */}
          <View style={styles.cardActions}>
            <Pressable style={styles.cardActionBtn} onPress={handleTestPrint} disabled={testingPrint}>
              {testingPrint ? (
                <ActivityIndicator size="small" color="#635BFF" />
              ) : (
                <>
                  <Ionicons name="print-outline" size={16} color="#635BFF" />
                  <Text style={[styles.cardActionBtnText, { color: "#635BFF" }]} numberOfLines={1}>Test Print</Text>
                </>
              )}
            </Pressable>

            <Pressable style={styles.cardActionBtn} onPress={handleScan}>
              <Ionicons name="settings-outline" size={16} color="#635BFF" />
              <Text style={[styles.cardActionBtnText, { color: "#635BFF" }]} numberOfLines={1}>Change Printer</Text>
            </Pressable>

            {currentType !== "none" && (
              <Pressable style={[styles.cardActionBtn, { borderColor: "rgba(239, 68, 68, 0.3)" }]} onPress={() => handleForget(activeTab)}>
                <Ionicons name="trash-outline" size={16} color="#EF4444" />
                <Text style={[styles.cardActionBtnText, { color: "#EF4444" }]} numberOfLines={1}>Forget</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Form Card Settings Matching Screenshot */}
        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>
            {activeTab === "cashier" ? "CASHIER PRINTER SETTINGS" : "KITCHEN PRINTER SETTINGS"}
          </Text>

          {/* Connection Type */}
          <View style={styles.field}>
            <Text style={styles.label}>Connection Type</Text>
            <View style={styles.selectorRow}>
              {(["system", "network", "bluetooth", "none"] as const).map(t => {
                const isSel = activeTab === "cashier" ? cashierType === t : kitchenType === t;
                return (
                  <Pressable
                    key={t}
                    style={[styles.selectorBtn, isSel && styles.selectorBtnActive]}
                    onPress={() => activeTab === "cashier" ? setCashierType(t) : setKitchenType(t)}
                  >
                    <Text style={[styles.selectorBtnText, isSel && styles.selectorBtnTextActive]}>
                      {t.toUpperCase()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Network IP or Bluetooth MAC input */}
          {(activeTab === "cashier" ? cashierType : kitchenType) === "network" ? (
            <View style={styles.rowInputs}>
              <View style={{ flex: 2, minWidth: 120 }}>
                <Text style={styles.label}>Printer IP Address</Text>
                <TextInput
                  style={styles.input}
                  value={activeTab === "cashier" ? cashierIP : kitchenIP}
                  onChangeText={activeTab === "cashier" ? setCashierIP : setKitchenIP}
                  placeholder="192.168.1.100"
                  placeholderTextColor={TEXT_MUTED}
                  keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 1, minWidth: 70, marginLeft: 10 }}>
                <Text style={styles.label}>Port</Text>
                <TextInput
                  style={styles.input}
                  value={activeTab === "cashier" ? cashierPort : kitchenPort}
                  onChangeText={activeTab === "cashier" ? setCashierPort : setKitchenPort}
                  placeholder="9100"
                  placeholderTextColor={TEXT_MUTED}
                  keyboardType="numeric"
                />
              </View>
            </View>
          ) : (
            <View style={styles.field}>
              <Text style={styles.label}>Printer MAC Address / Name</Text>
              <TextInput
                style={styles.input}
                value={activeTab === "cashier" ? cashierMAC : kitchenMAC}
                onChangeText={activeTab === "cashier" ? setCashierMAC : setKitchenMAC}
                placeholder="MPT-II"
                placeholderTextColor={TEXT_MUTED}
              />
            </View>
          )}

          {/* Profile Name */}
          <View style={styles.field}>
            <Text style={styles.label}>Printer Profile Name</Text>
            <TextInput
              style={styles.input}
              value={activeTab === "cashier" ? cashierName : kitchenName}
              onChangeText={activeTab === "cashier" ? setCashierName : setKitchenName}
              placeholder="Cashier Thermal Printer"
              placeholderTextColor={TEXT_MUTED}
            />
          </View>

          {/* Paper Width */}
          <View style={styles.field}>
            <Text style={styles.label}>Paper Width</Text>
            <View style={styles.selectorRow}>
              {([58, 80] as const).map(w => {
                const isSel = activeTab === "cashier" ? cashierWidth === w : kitchenWidth === w;
                return (
                  <Pressable
                    key={w}
                    style={[styles.widthBtn, isSel && styles.widthBtnActive]}
                    onPress={() => activeTab === "cashier" ? setCashierWidth(w) : setKitchenWidth(w)}
                  >
                    <Text style={[styles.widthBtnText, isSel && styles.widthBtnTextActive]}>
                      {w}mm Width
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Auto-Print Switch Matching Screenshot */}
          <View style={styles.switchRow}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.switchLabel}>
                {activeTab === "cashier" ? "Auto-Print Receipt" : "Auto-Print KOT Tickets"}
              </Text>
              <Text style={styles.switchDesc}>
                {activeTab === "cashier"
                  ? "Print customer bills automatically upon marking payment"
                  : "Print kitchen tickets automatically when waiter places order"}
              </Text>
            </View>
            <Switch
              value={activeTab === "cashier" ? cashierAuto : kitchenAuto}
              onValueChange={activeTab === "cashier" ? setCashierAuto : setKitchenAuto}
              trackColor={{ false: "#2E2E38", true: BRAND_ORANGE }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Nearby Discovery Scanner Section Matching Screenshot */}
        <View style={styles.formCard}>
          <View style={styles.scanHeader}>
            <Text style={styles.sectionTitle}>PRINTER DISCOVERY SCANNER</Text>
            <Pressable
              style={styles.scanBtn}
              onPress={handleScan}
              disabled={scanning}
            >
              {scanning ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.scanBtnText}>Scan Nearby</Text>
              )}
            </Pressable>
          </View>

          {scanning && (
            <View style={{ paddingVertical: 16, alignItems: "center" }}>
              <ActivityIndicator size="small" color={BRAND_ORANGE} />
              <Text style={{ color: TEXT_MUTED, fontSize: 12, marginTop: 6 }}>
                Searching for Bluetooth & Network thermal printers...
              </Text>
            </View>
          )}

          {!scanning && devices.length > 0 ? (
            devices.map((dev, i) => {
              const isCurrent = (dev.address && currentAddress && dev.address.toLowerCase() === currentAddress.toLowerCase());
              const isConnecting = connectingAddress === dev.address;

              return (
                <Pressable
                  key={i}
                  style={[
                    styles.deviceRow,
                    isCurrent && { borderColor: BRAND_ORANGE, backgroundColor: "rgba(255, 87, 34, 0.08)" }
                  ]}
                  onPress={() => handleConnectDevice(dev)}
                >
                  <Ionicons
                    name={dev.type === "network" ? "wifi-outline" : "bluetooth-outline"}
                    size={20}
                    color={BRAND_ORANGE}
                  />
                  <View style={{ marginLeft: 12, flex: 1, minWidth: 0, paddingRight: 6 }}>
                    <Text style={styles.deviceName} numberOfLines={1}>{dev.name}</Text>
                    <Text style={styles.deviceAddress} numberOfLines={1}>{dev.address}</Text>
                  </View>
                  <View style={[styles.useTag, isCurrent && { backgroundColor: "#10B981" }]}>
                    <Text style={styles.useTagText}>{isCurrent ? "Connected" : "Use"}</Text>
                  </View>
                </Pressable>
              );
            })
          ) : !scanning ? (
            <Text style={styles.noDeviceText}>No discovered printers. Tap Scan to search.</Text>
          ) : null}
        </View>

        {/* Bottom Save & Action Buttons */}
        <View style={styles.actionsRow}>
          <Pressable style={styles.testBtn} onPress={handleTestPrint} disabled={testingPrint}>
            <Ionicons name="print-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.testBtnText}>Test Print</Text>
          </Pressable>
          <Pressable style={styles.saveMainBtn} onPress={handleSaveManual}>
            <Text style={styles.saveMainBtnText}>Save All Settings</Text>
          </Pressable>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: CARD_BORDER,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: CARD_BG,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
  },
  sub: {
    color: TEXT_MUTED,
    fontSize: 13,
    marginTop: 2,
    fontWeight: "500",
  },
  scroll: {
    padding: spacing.lg,
    paddingBottom: 90,
  },

  tabsRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: "#2E2E38",
  },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: BRAND_ORANGE,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "700",
  },
  tabTextActive: {
    color: BRAND_ORANGE,
  },

  activePrinterCard: {
    backgroundColor: CARD_BG,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 16,
    marginBottom: spacing.lg,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  printerNameTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
  },
  printerTypeSubtitle: {
    color: TEXT_MUTED,
    fontSize: 12,
    marginTop: 2,
    fontWeight: "500",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 5,
    flexShrink: 0,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  cardActions: {
    flexDirection: "row",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
    paddingTop: 12,
  },
  cardActionBtn: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(99, 91, 255, 0.2)",
    gap: 5,
  },
  cardActionBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },

  formCard: {
    backgroundColor: CARD_BG,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 20,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    color: BRAND_ORANGE,
    fontSize: 11,
    fontWeight: "bold",
    letterSpacing: 1.2,
    marginBottom: 16,
  },
  field: { marginBottom: spacing.md },
  label: { color: TEXT_MUTED, fontSize: 12, fontWeight: "600", marginBottom: 8 },
  input: {
    backgroundColor: INPUT_BG,
    borderWidth: 1.5,
    borderColor: CARD_BORDER,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: "500",
    color: "#FFFFFF",
  },
  rowInputs: {
    flexDirection: "row",
    marginBottom: spacing.md,
  },
  selectorRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "nowrap",
  },
  selectorBtn: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: CHIP_INACTIVE_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  selectorBtnActive: {
    backgroundColor: BRAND_ORANGE,
  },
  selectorBtnText: {
    color: TEXT_MUTED,
    fontSize: 11,
    fontWeight: "700",
  },
  selectorBtnTextActive: {
    color: "#FFFFFF",
  },
  widthBtn: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: CHIP_INACTIVE_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  widthBtnActive: {
    backgroundColor: BRAND_ORANGE,
  },
  widthBtnText: {
    color: TEXT_MUTED,
    fontSize: 13,
    fontWeight: "700",
  },
  widthBtnTextActive: {
    color: "#FFFFFF",
  },

  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  switchLabel: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  switchDesc: { color: TEXT_MUTED, fontSize: 11, marginTop: 2 },

  scanHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  scanBtn: {
    backgroundColor: BRAND_ORANGE,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  scanBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    marginBottom: 10,
    backgroundColor: INPUT_BG,
  },
  deviceName: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  deviceAddress: {
    color: TEXT_MUTED,
    fontSize: 11,
    marginTop: 2,
  },
  useTag: {
    backgroundColor: BRAND_ORANGE,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  useTagText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  noDeviceText: {
    color: TEXT_MUTED,
    fontSize: 13,
    textAlign: "center",
    marginVertical: 12,
  },

  actionsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  testBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#222B3D",
    paddingVertical: 14,
    borderRadius: 14,
  },
  testBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  saveMainBtn: {
    flex: 1.5,
    backgroundColor: BRAND_ORANGE,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  saveMainBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
});
