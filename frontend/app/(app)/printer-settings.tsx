import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, Pressable,
  ActivityIndicator, Switch, Platform, StatusBar, Alert
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { spacing, radius } from "@/src/theme";
import { useTheme } from "@/src/context/ThemeContext";
import { useResponsive } from "@/src/hooks/useResponsive";
import * as Haptics from "expo-haptics";
import {
  savePrinterSettings, getPrinterSettings, printThermalDirect, forgetPrinter,
  subscribePrinterStatus, checkPrinterConnection, scanNearbyPrinters, autoConnectPrinter,
  connectWebBluetoothPrinter, isWebBluetoothSupported,
  PrinterSettings, PrinterConnectionStatus
} from "@/src/lib/print";

export default function PrinterSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const { isDesktop } = useResponsive();

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
  const [cashierPrintKOT, setCashierPrintKOT] = useState(false);

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
      setCashierPrintKOT(cashier.print_kot ?? false);
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
      if (Platform.OS === "web" && isWebBluetoothSupported()) {
        const paired = await connectWebBluetoothPrinter(activeTab);
        if (paired) {
          await loadSettings();
          const dev = await getPrinterSettings(activeTab);
          if (dev) {
            setDevices([{ name: dev.name, address: dev.address, type: (dev.type === "network" ? "network" : "bluetooth") }]);
          }
          Alert.alert(
            "Bluetooth Thermal Printer Connected",
            `Connected to Web Bluetooth printer.`
          );
          return;
        }
      }
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
      if (Platform.OS === "web" && dev.type === "bluetooth" && isWebBluetoothSupported()) {
        const paired = await connectWebBluetoothPrinter(activeTab);
        if (paired) {
          await loadSettings();
          return;
        }
      }

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
              setCashierPrintKOT(false);
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
        auto_print: cashierAuto,
        print_kot: cashierPrintKOT,
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
      status: "unpaid",
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
        return { label: "Connected & Ready", bg: isDark ? "rgba(16, 185, 129, 0.18)" : "#DCFCE7", text: "#10B981", icon: "checkmark-circle" };
      case "reconnecting":
        return { label: "Reconnecting...", bg: isDark ? "rgba(245, 158, 11, 0.18)" : "#FEF3C7", text: "#F59E0B", icon: "sync" };
      case "unavailable":
        return { label: "Offline / Unavailable", bg: isDark ? "rgba(239, 68, 68, 0.18)" : "#FEE2E2", text: "#EF4444", icon: "alert-circle" };
      default:
        return { label: "Not Configured", bg: isDark ? "rgba(148, 163, 184, 0.15)" : "#F1F5F9", text: theme.onSurfaceSecondary, icon: "close-circle" };
    }
  };

  const badge = getStatusBadge(currentStatus);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.surface }]}>
        <ActivityIndicator size="large" color="#635BFF" />
      </View>
    );
  }

  return (
    <View style={[styles.safe, { backgroundColor: theme.surface, paddingTop: Math.max(insets.top, 14) }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.surface} />
      <View style={[{ flex: 1, width: "100%" }, isDesktop && { maxWidth: 900, alignSelf: "center" }]}>
        
      {/* Header Matching More & Dashboard */}
      <View style={styles.header}>
        <Pressable 
          onPress={() => router.replace("/(app)/more")} 
          style={[styles.backBtn, { backgroundColor: isDark ? "rgba(99,91,255,0.15)" : "#EEF2FF", borderColor: theme.border }]}
        >
          <Ionicons name="chevron-back" size={20} color="#635BFF" />
        </Pressable>
        <View style={{ marginLeft: 14, flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, { color: theme.onSurface }]} numberOfLines={1}>Thermal Printers</Text>
          <Text style={[styles.sub, { color: theme.onSurfaceSecondary }]} numberOfLines={1}>
            Auto-reconnect & ESC/POS direct printing
          </Text>
        </View>
      </View>

      {/* Role Pill Switcher */}
      <View style={[styles.tabsRow, { backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "#EEF2FF" }]}>
        <Pressable
          style={[styles.tab, activeTab === "cashier" && styles.tabActive]}
          onPress={() => setActiveTab("cashier")}
        >
          <Ionicons 
            name="receipt-outline" 
            size={16} 
            color={activeTab === "cashier" ? "#FFFFFF" : theme.onSurfaceSecondary} 
          />
          <Text style={[styles.tabText, { color: activeTab === "cashier" ? "#FFFFFF" : theme.onSurfaceSecondary }]}>
            Cashier Receipts
          </Text>
        </Pressable>

        <Pressable
          style={[styles.tab, activeTab === "kitchen" && styles.tabActive]}
          onPress={() => setActiveTab("kitchen")}
        >
          <Ionicons 
            name="restaurant-outline" 
            size={16} 
            color={activeTab === "kitchen" ? "#FFFFFF" : theme.onSurfaceSecondary} 
          />
          <Text style={[styles.tabText, { color: activeTab === "kitchen" ? "#FFFFFF" : theme.onSurfaceSecondary }]}>
            Kitchen KOT
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        
        {/* Active Remembered Printer Hero Card */}
        <View style={[styles.card, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
              <Text style={[styles.printerNameTitle, { color: theme.onSurface }]} numberOfLines={1}>
                {currentName || (currentType !== "none" ? "Thermal Printer" : "No Printer Configured")}
              </Text>
              <Text style={[styles.printerTypeSubtitle, { color: theme.onSurfaceSecondary }]} numberOfLines={1}>
                Mode: {currentType.toUpperCase()} {currentAddress ? `• ${currentAddress}` : ""}
              </Text>
            </View>
            <View style={[styles.statusPill, { backgroundColor: badge.bg }]}>
              <Ionicons name={badge.icon as any} size={14} color={badge.text} />
              <Text style={[styles.statusPillText, { color: badge.text }]}>{badge.label}</Text>
            </View>
          </View>

          {/* Card Actions */}
          <View style={[styles.cardActions, { borderTopColor: theme.border }]}>
            <Pressable 
              style={[styles.cardActionBtn, { backgroundColor: isDark ? "rgba(99,91,255,0.12)" : "#EEF2FF", borderColor: isDark ? "#635BFF" : "#C7D2FE" }]} 
              onPress={handleTestPrint} 
              disabled={testingPrint}
            >
              {testingPrint ? (
                <ActivityIndicator size="small" color="#635BFF" />
              ) : (
                <>
                  <Ionicons name="print-outline" size={16} color="#635BFF" />
                  <Text style={[styles.cardActionBtnText, { color: "#635BFF" }]}>Test Print</Text>
                </>
              )}
            </Pressable>

            <Pressable 
              style={[styles.cardActionBtn, { backgroundColor: isDark ? "rgba(99,91,255,0.12)" : "#EEF2FF", borderColor: isDark ? "#635BFF" : "#C7D2FE" }]} 
              onPress={handleScan}
            >
              <Ionicons name="scan-outline" size={16} color="#635BFF" />
              <Text style={[styles.cardActionBtnText, { color: "#635BFF" }]}>Scan Nearby</Text>
            </Pressable>

            {currentType !== "none" && (
              <Pressable 
                style={[styles.cardActionBtn, { backgroundColor: isDark ? "rgba(239,68,68,0.12)" : "#FEF2F2", borderColor: isDark ? "rgba(239,68,68,0.3)" : "#FECDD3" }]} 
                onPress={() => handleForget(activeTab)}
              >
                <Ionicons name="trash-outline" size={16} color="#EF4444" />
                <Text style={[styles.cardActionBtnText, { color: "#EF4444" }]}>Forget</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Form Card Settings */}
        <View style={[styles.card, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: "#635BFF" }]}>
            {activeTab === "cashier" ? "CASHIER RECEIPT CONFIGURATION" : "KITCHEN KOT CONFIGURATION"}
          </Text>

          {/* Connection Type */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Connection Interface</Text>
            <View style={styles.selectorRow}>
              {(["bluetooth", "network", "system", "none"] as const).map(t => {
                const isSel = activeTab === "cashier" ? cashierType === t : kitchenType === t;
                return (
                  <Pressable
                    key={t}
                    style={[
                      styles.selectorBtn,
                      { backgroundColor: isSel ? "#635BFF" : (isDark ? "rgba(255,255,255,0.05)" : "#F1F5F9"), borderColor: isSel ? "#635BFF" : theme.border }
                    ]}
                    onPress={() => activeTab === "cashier" ? setCashierType(t) : setKitchenType(t)}
                  >
                    <Text style={[styles.selectorBtnText, { color: isSel ? "#FFFFFF" : theme.onSurfaceSecondary }]}>
                      {t === "bluetooth" ? "Bluetooth" : t === "network" ? "Network IP" : t === "system" ? "System" : "Off"}
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
                <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Printer IP Address</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.onSurface }]}
                  value={activeTab === "cashier" ? cashierIP : kitchenIP}
                  onChangeText={activeTab === "cashier" ? setCashierIP : setKitchenIP}
                  placeholder="192.168.1.100"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 1, minWidth: 70, marginLeft: 10 }}>
                <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Port</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.onSurface }]}
                  value={activeTab === "cashier" ? cashierPort : kitchenPort}
                  onChangeText={activeTab === "cashier" ? setCashierPort : setKitchenPort}
                  placeholder="9100"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                />
              </View>
            </View>
          ) : (
            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Bluetooth Device Name / MAC</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.onSurface }]}
                value={activeTab === "cashier" ? cashierMAC : kitchenMAC}
                onChangeText={activeTab === "cashier" ? setCashierMAC : setKitchenMAC}
                placeholder="MPT-II or 00:11:22:33:44:55"
                placeholderTextColor="#94A3B8"
              />
            </View>
          )}

          {/* Profile Name */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Printer Label</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.onSurface }]}
              value={activeTab === "cashier" ? cashierName : kitchenName}
              onChangeText={activeTab === "cashier" ? setCashierName : setKitchenName}
              placeholder="e.g. Cashier Thermal Printer"
              placeholderTextColor="#94A3B8"
            />
          </View>

          {/* Paper Width */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Thermal Roll Width</Text>
            <View style={styles.selectorRow}>
              {([58, 80] as const).map(w => {
                const isSel = activeTab === "cashier" ? cashierWidth === w : kitchenWidth === w;
                return (
                  <Pressable
                    key={w}
                    style={[
                      styles.widthBtn,
                      { backgroundColor: isSel ? "#635BFF" : (isDark ? "rgba(255,255,255,0.05)" : "#F1F5F9"), borderColor: isSel ? "#635BFF" : theme.border }
                    ]}
                    onPress={() => activeTab === "cashier" ? setCashierWidth(w) : setKitchenWidth(w)}
                  >
                    <Text style={[styles.widthBtnText, { color: isSel ? "#FFFFFF" : theme.onSurfaceSecondary }]}>
                      {w}mm {w === 58 ? "(Standard)" : "(Wide)"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Auto-Print Switch */}
          <View style={[styles.switchRow, { borderTopColor: theme.border }]}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={[styles.switchLabel, { color: theme.onSurface }]}>
                {activeTab === "cashier" ? "Auto-Print Customer Bills" : "Auto-Print Kitchen Tickets"}
              </Text>
              <Text style={[styles.switchDesc, { color: theme.onSurfaceSecondary }]}>
                {activeTab === "cashier"
                  ? "Print receipt automatically when marking order as paid"
                  : "Print KOT ticket automatically upon order creation"}
              </Text>
            </View>
            <Switch
              value={activeTab === "cashier" ? cashierAuto : kitchenAuto}
              onValueChange={activeTab === "cashier" ? setCashierAuto : setKitchenAuto}
              trackColor={{ false: isDark ? "#334155" : "#E2E8F0", true: "#635BFF" }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* Cashier Print KOT Switch */}
          {activeTab === "cashier" && (
            <View style={[styles.switchRow, { borderTopColor: theme.border }]}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={[styles.switchLabel, { color: theme.onSurface }]}>
                  Print KOT on Bill Printer
                </Text>
                <Text style={[styles.switchDesc, { color: theme.onSurfaceSecondary }]}>
                  Also print Kitchen Order Tickets (KOT) from this cashier/billing printer
                </Text>
              </View>
              <Switch
                value={cashierPrintKOT}
                onValueChange={setCashierPrintKOT}
                trackColor={{ false: isDark ? "#334155" : "#E2E8F0", true: "#635BFF" }}
                thumbColor="#FFFFFF"
              />
            </View>
          )}
        </View>

        {/* Nearby Discovery Scanner Section */}
        <View style={[styles.card, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
          <View style={styles.scanHeader}>
            <Text style={[styles.sectionTitle, { color: "#635BFF", marginBottom: 0 }]}>DISCOVERED PRINTERS</Text>
            <Pressable
              style={[styles.scanBtn, { backgroundColor: isDark ? "rgba(99,91,255,0.15)" : "#EEF2FF", borderColor: isDark ? "#635BFF" : "#C7D2FE" }]}
              onPress={handleScan}
              disabled={scanning}
            >
              {scanning ? (
                <ActivityIndicator size="small" color="#635BFF" />
              ) : (
                <>
                  <Ionicons name="refresh-outline" size={14} color="#635BFF" />
                  <Text style={[styles.scanBtnText, { color: "#635BFF" }]}>Scan Nearby</Text>
                </>
              )}
            </Pressable>
          </View>

          {scanning && (
            <View style={{ paddingVertical: 20, alignItems: "center", gap: 8 }}>
              <ActivityIndicator size="small" color="#635BFF" />
              <Text style={{ color: theme.onSurfaceSecondary, fontSize: 13, fontWeight: "600" }}>
                Searching for Bluetooth & Network printers...
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
                    { 
                      backgroundColor: isCurrent ? (isDark ? "rgba(99,91,255,0.12)" : "#EEF2FF") : theme.surface,
                      borderColor: isCurrent ? "#635BFF" : theme.border 
                    }
                  ]}
                  onPress={() => handleConnectDevice(dev)}
                >
                  <View style={[styles.deviceIconBox, { backgroundColor: isDark ? "rgba(99,91,255,0.2)" : "#EEF2FF" }]}>
                    <Ionicons
                      name={dev.type === "network" ? "wifi-outline" : "bluetooth-outline"}
                      size={20}
                      color="#635BFF"
                    />
                  </View>
                  <View style={{ marginLeft: 12, flex: 1, minWidth: 0, paddingRight: 6 }}>
                    <Text style={[styles.deviceName, { color: theme.onSurface }]} numberOfLines={1}>{dev.name}</Text>
                    <Text style={[styles.deviceAddress, { color: theme.onSurfaceSecondary }]} numberOfLines={1}>{dev.address}</Text>
                  </View>
                  <View style={[styles.useTag, { backgroundColor: isCurrent ? "#10B981" : "#635BFF" }]}>
                    <Text style={styles.useTagText}>{isCurrent ? "Connected" : "Pair"}</Text>
                  </View>
                </Pressable>
              );
            })
          ) : !scanning ? (
            <Text style={[styles.noDeviceText, { color: theme.onSurfaceSecondary }]}>
              No paired thermal printers detected. Tap "Scan Nearby" to search.
            </Text>
          ) : null}
        </View>

        {/* Bottom Save & Action Buttons */}
        <View style={styles.actionsRow}>
          <Pressable 
            style={[styles.testBtn, { backgroundColor: isDark ? "rgba(99,91,255,0.15)" : "#EEF2FF", borderColor: isDark ? "#635BFF" : "#C7D2FE" }]} 
            onPress={handleTestPrint} 
            disabled={testingPrint}
          >
            <Ionicons name="print-outline" size={18} color="#635BFF" style={{ marginRight: 6 }} />
            <Text style={[styles.testBtnText, { color: "#635BFF" }]}>Test Ticket</Text>
          </Pressable>

          <Pressable style={styles.saveMainBtn} onPress={handleSaveManual}>
            <Ionicons name="save-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.saveMainBtnText}>Save Settings</Text>
          </Pressable>
        </View>

      </ScrollView>
      </View>
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
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
  },
  sub: {
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
    marginHorizontal: spacing.lg,
    borderRadius: 14,
    padding: 4,
    marginBottom: spacing.md,
    gap: 6,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: "#635BFF",
  },
  tabText: {
    fontSize: 13,
    fontWeight: "700",
  },

  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    marginBottom: spacing.lg,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  printerNameTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  printerTypeSubtitle: {
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
    paddingTop: 14,
  },
  cardActionBtn: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: 12,
    borderWidth: 1,
    gap: 5,
  },
  cardActionBtnText: {
    fontSize: 12,
    fontWeight: "800",
  },

  sectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginBottom: 14,
    textTransform: "uppercase",
  },
  field: {
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
  },
  selectorRow: {
    flexDirection: "row",
    gap: 8,
  },
  selectorBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  selectorBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  rowInputs: {
    flexDirection: "row",
    marginBottom: 14,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: "600",
  },
  widthBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  widthBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },

  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    paddingTop: 14,
    marginTop: 6,
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: "800",
  },
  switchDesc: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: "500",
  },

  scanHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  scanBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  scanBtnText: {
    fontSize: 12,
    fontWeight: "800",
  },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  deviceIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  deviceName: {
    fontSize: 14,
    fontWeight: "800",
  },
  deviceAddress: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: "500",
  },
  useTag: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
  },
  useTagText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  noDeviceText: {
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 14,
    fontWeight: "500",
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
    paddingVertical: 15,
    borderRadius: 16,
    borderWidth: 1,
  },
  testBtnText: {
    fontSize: 15,
    fontWeight: "800",
  },
  saveMainBtn: {
    flex: 1.5,
    flexDirection: "row",
    backgroundColor: "#635BFF",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    borderRadius: 16,
    shadowColor: "#635BFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveMainBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
});
