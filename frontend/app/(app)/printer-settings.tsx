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
  subscribePrinterStatus, checkPrinterConnection, scanNearbyPrinters, scanNetworkPrinters, autoConnectPrinter,
  connectWebBluetoothPrinter, isWebBluetoothSupported,
  connectWebUsbPrinter, isWebUsbSupported,
  connectWebSerialPrinter, isWebSerialSupported,
  autoReconnectAllWebPrinters,
  kickCashDrawer,
  PrinterSettings, PrinterConnectionStatus, PrinterConnectionType, PRINTER_PRESETS, PrinterPreset
} from "@/src/lib/print";

export default function PrinterSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const { isDesktop } = useResponsive();

  const [activeTab, setActiveTab] = useState<"cashier" | "kitchen">("cashier");
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanningSubnet, setScanningSubnet] = useState(false);
  const [connectingAddress, setConnectingAddress] = useState<string | null>(null);
  const [devices, setDevices] = useState<{ name: string; address: string; type: PrinterConnectionType; brand?: string }[]>([]);
  const [testingPrint, setTestingPrint] = useState(false);
  const [testingDrawer, setTestingDrawer] = useState(false);

  // Live status from persistent printer manager
  const [cashierConnStatus, setCashierConnStatus] = useState<PrinterConnectionStatus>("none");
  const [kitchenConnStatus, setKitchenConnStatus] = useState<PrinterConnectionStatus>("none");

  // Cashier printer states
  const [cashierType, setCashierType] = useState<PrinterConnectionType>("bluetooth");
  const [cashierIP, setCashierIP] = useState("");
  const [cashierPort, setCashierPort] = useState("9100");
  const [cashierMAC, setCashierMAC] = useState("MPT-II");
  const [cashierName, setCashierName] = useState("Cashier Thermal Printer");
  const [cashierBrand, setCashierBrand] = useState("TVS");
  const [cashierWidth, setCashierWidth] = useState<58 | 80>(58);
  const [cashierAuto, setCashierAuto] = useState(true);
  const [cashierPrintKOT, setCashierPrintKOT] = useState(false);
  const [cashierOpenDrawer, setCashierOpenDrawer] = useState(true);
  const [cashierAutoCut, setCashierAutoCut] = useState(true);
  const [cashierCopies, setCashierCopies] = useState<number>(1);

  // Kitchen printer states
  const [kitchenType, setKitchenType] = useState<PrinterConnectionType>("none");
  const [kitchenIP, setKitchenIP] = useState("");
  const [kitchenPort, setKitchenPort] = useState("9100");
  const [kitchenMAC, setKitchenMAC] = useState("");
  const [kitchenName, setKitchenName] = useState("Kitchen Thermal Printer");
  const [kitchenBrand, setKitchenBrand] = useState("Epson");
  const [kitchenWidth, setKitchenWidth] = useState<58 | 80>(80);
  const [kitchenAuto, setKitchenAuto] = useState(true);
  const [kitchenAutoCut, setKitchenAutoCut] = useState(true);
  const [kitchenCopies, setKitchenCopies] = useState<number>(1);

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
      } else if (cashier.type === "bluetooth" || cashier.type === "sunmi" || cashier.type === "usb") {
        setCashierMAC(cashier.address);
      }
      setCashierName(cashier.name);
      setCashierBrand(cashier.brand || "Generic");
      setCashierWidth(cashier.width);
      setCashierAuto(cashier.auto_print ?? true);
      setCashierPrintKOT(cashier.print_kot ?? false);
      setCashierOpenDrawer(cashier.open_drawer ?? true);
      setCashierAutoCut(cashier.auto_cut ?? true);
      setCashierCopies(cashier.copies || 1);
    }

    const kitchen = await getPrinterSettings("kitchen");
    if (kitchen) {
      setKitchenType(kitchen.type);
      if (kitchen.type === "network") {
        setKitchenIP(kitchen.address);
        setKitchenPort(kitchen.port || "9100");
      } else if (kitchen.type === "bluetooth" || kitchen.type === "sunmi" || kitchen.type === "usb") {
        setKitchenMAC(kitchen.address);
      }
      setKitchenName(kitchen.name);
      setKitchenBrand(kitchen.brand || "Generic");
      setKitchenWidth(kitchen.width);
      setKitchenAuto(kitchen.auto_print ?? true);
      setKitchenAutoCut(kitchen.auto_cut ?? true);
      setKitchenCopies(kitchen.copies || 1);
    }
    if (Platform.OS === "web") {
      await autoReconnectAllWebPrinters("cashier").catch(() => {});
      await autoReconnectAllWebPrinters("kitchen").catch(() => {});
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

  const handleSubnetScan = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setScanningSubnet(true);
    try {
      const netPrinters = await scanNetworkPrinters();
      setDevices(prev => {
        const merged = [...prev];
        netPrinters.forEach(np => {
          if (!merged.some(m => m.address === np.address)) {
            merged.push(np);
          }
        });
        return merged;
      });
      Alert.alert("Network Scan Complete", "Discovered potential network LAN thermal printer IP addresses.");
    } catch (e: any) {
      console.warn("Subnet scan error:", e);
    } finally {
      setScanningSubnet(false);
    }
  };

  const handleApplyPreset = async (preset: PrinterPreset) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const isCashier = activeTab === "cashier";

    if (isCashier) {
      setCashierType(preset.type);
      setCashierName(preset.name);
      setCashierBrand(preset.brand);
      setCashierWidth(preset.defaultWidth);
      if (preset.type === "network") {
        setCashierPort(preset.port || "9100");
        if (!cashierIP) setCashierIP("192.168.1.100");
      } else if (preset.type === "sunmi") {
        setCashierMAC("inner");
      } else if (preset.type === "usb") {
        setCashierMAC("USB-Direct");
      }
    } else {
      setKitchenType(preset.type);
      setKitchenName(preset.name);
      setKitchenBrand(preset.brand);
      setKitchenWidth(preset.defaultWidth);
      if (preset.type === "network") {
        setKitchenPort(preset.port || "9100");
        if (!kitchenIP) setKitchenIP("192.168.1.200");
      } else if (preset.type === "sunmi") {
        setKitchenMAC("inner");
      } else if (preset.type === "usb") {
        setKitchenMAC("USB-Direct");
      }
    }

    // Auto-connect with preset defaults
    await autoConnectPrinter(activeTab, {
      name: preset.name,
      address: preset.type === "network" ? (isCashier ? (cashierIP || "192.168.1.100") : (kitchenIP || "192.168.1.200")) : (preset.type === "sunmi" ? "inner" : (isCashier ? cashierMAC : kitchenMAC)),
      type: preset.type,
      brand: preset.brand,
      width: preset.defaultWidth,
      auto_print: true,
      open_drawer: isCashier,
      auto_cut: true
    });

    Alert.alert(
      `${preset.brand} Preset Applied`,
      `${preset.name} configured for ${isCashier ? "Cashier Billing" : "Kitchen KOT"}. Auto-print & auto-reconnect are now active!`
    );
  };

  const handleConnectDevice = async (dev: { name: string; address: string; type: PrinterConnectionType; brand?: string }) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setConnectingAddress(dev.address);
    try {
      if (Platform.OS === "web") {
        if (dev.type === "usb" || dev.address === "web-serial-pair") {
          let paired = false;
          if (isWebSerialSupported()) {
            paired = await connectWebSerialPrinter(activeTab);
          }
          if (!paired && isWebUsbSupported()) {
            paired = await connectWebUsbPrinter(activeTab);
          }
          if (paired) {
            await loadSettings();
            return;
          }
        } else if (dev.type === "bluetooth" || dev.address === "web-bluetooth-pair") {
          let paired = false;
          const upper = (dev.name || "").toUpperCase();
          if (upper.includes("MPT") || upper.includes("SPP") || upper.includes("COM")) {
            paired = await connectWebSerialPrinter(activeTab);
          }
          if (!paired) {
            paired = await connectWebBluetoothPrinter(activeTab);
          }
          if (!paired && isWebSerialSupported()) {
            paired = await connectWebSerialPrinter(activeTab);
          }
          if (paired) {
            await loadSettings();
            return;
          }
        }
      }

      const isCashier = activeTab === "cashier";
      const newType = dev.type;
      
      if (isCashier) {
        setCashierType(newType);
        setCashierName(dev.name);
        setCashierBrand(dev.brand || "Generic");
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
        setKitchenBrand(dev.brand || "Generic");
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
        brand: dev.brand,
        width: isCashier ? cashierWidth : kitchenWidth,
        auto_print: isCashier ? cashierAuto : kitchenAuto,
        open_drawer: isCashier ? cashierOpenDrawer : false,
        auto_cut: isCashier ? cashierAutoCut : kitchenAutoCut,
        copies: isCashier ? cashierCopies : kitchenCopies
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
        brand: cashierBrand,
        width: cashierWidth,
        auto_print: cashierAuto,
        print_kot: cashierPrintKOT,
        open_drawer: cashierOpenDrawer,
        auto_cut: cashierAutoCut,
        copies: cashierCopies,
      };
      await savePrinterSettings("cashier", cashierSettings);

      const kitchenSettings: PrinterSettings = {
        type: kitchenType,
        address: (kitchenType === "network" ? kitchenIP : kitchenMAC).trim(),
        port: kitchenPort.trim(),
        name: kitchenName.trim(),
        brand: kitchenBrand,
        width: kitchenWidth,
        auto_print: kitchenAuto,
        auto_cut: kitchenAutoCut,
        copies: kitchenCopies,
      };
      await savePrinterSettings("kitchen", kitchenSettings);

      Alert.alert("Success", "Printer settings saved! Automatic printing and auto-reconnect are active.");
    } catch (e: any) {
      Alert.alert("Error", `Failed to save printer settings: ${e.message}`);
    }
  };

  const handleTestPrint = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setTestingPrint(true);
    const testBill = {
      id: "test-" + Math.random().toString(36).substring(2, 7),
      bill_number: "TEST-001",
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
        { name: "Butter Chicken Special", quantity: 1, price: 280.00 },
        { name: "Garlic Butter Naan", quantity: 2, price: 35.00, notes: "Crispy & piping hot" }
      ],
      restaurant_snapshot: {
        name: "Master Chef Restaurant",
        address: "Halyal road Beside HP Petrol pump Athani -591304",
        phone: "8152075375",
        phone2: "9164360375",
        upi_id: "8152075375-2@ybl",
        merchant_name: "Master Chef"
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

  const handleTestDrawer = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setTestingDrawer(true);
    try {
      const res = await kickCashDrawer(activeTab);
      if (res) {
        Alert.alert("Cash Drawer Pulse Sent", "Drawer kick pulse command successfully sent to printer.");
      } else {
        Alert.alert("Cash Drawer", "Drawer kick pulse sent. Ensure the drawer RJ11 cable is plugged into the thermal printer.");
      }
    } catch (e: any) {
      Alert.alert("Drawer Error", e.message || "Could not pulse cash drawer.");
    } finally {
      setTestingDrawer(false);
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
        return { label: "Auto-Reconnecting...", bg: isDark ? "rgba(245, 158, 11, 0.18)" : "#FEF3C7", text: "#F59E0B", icon: "sync" };
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
          <Text style={[styles.title, { color: theme.onSurface }]} numberOfLines={1}>Thermal & POS Printers</Text>
          <Text style={[styles.sub, { color: theme.onSurfaceSecondary }]} numberOfLines={1}>
            Universal auto-connection & automatic background printing
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
            Cashier Billing Printer
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
            Kitchen KOT Printer
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        
        {/* Active Remembered Printer Hero Card */}
        <View style={[styles.card, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={[styles.printerNameTitle, { color: theme.onSurface }]} numberOfLines={1}>
                  {currentName || (currentType !== "none" ? "Thermal Printer" : "No Printer Configured")}
                </Text>
              </View>
              <Text style={[styles.printerTypeSubtitle, { color: theme.onSurfaceSecondary }]} numberOfLines={1}>
                Type: {currentType.toUpperCase()} • Width: {activeTab === "cashier" ? cashierWidth : kitchenWidth}mm {currentAddress ? `• ${currentAddress}` : ""}
              </Text>
            </View>
            <View style={[styles.statusPill, { backgroundColor: badge.bg }]}>
              <Ionicons name={badge.icon as any} size={14} color={badge.text} />
              <Text style={[styles.statusPillText, { color: badge.text }]}>{badge.label}</Text>
            </View>
          </View>

          {/* Quick Diagnostics Action Grid */}
          <View style={[styles.cardActions, { borderTopColor: theme.border }]}>
            {Platform.OS === "web" && currentType === "bluetooth" && (
              <Pressable 
                style={[styles.cardActionBtn, { backgroundColor: currentStatus === "connected" ? "rgba(16,185,129,0.15)" : "#635BFF", borderColor: currentStatus === "connected" ? "#10B981" : "#635BFF" }]} 
                onPress={async () => {
                  const ok = await connectWebBluetoothPrinter(activeTab);
                  if (ok) await loadSettings();
                }}
              >
                <Ionicons name="bluetooth" size={16} color={currentStatus === "connected" ? "#10B981" : "#FFFFFF"} />
                <Text style={[styles.cardActionBtnText, { color: currentStatus === "connected" ? "#10B981" : "#FFFFFF" }]}>
                  {currentStatus === "connected" ? "Bluetooth Ready" : "Pair Bluetooth"}
                </Text>
              </Pressable>
            )}

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
                  <Text style={[styles.cardActionBtnText, { color: "#635BFF" }]}>
                    {activeTab === "cashier" ? "Test Receipt" : "Test KOT"}
                  </Text>
                </>
              )}
            </Pressable>

            {activeTab === "cashier" && (
              <Pressable 
                style={[styles.cardActionBtn, { backgroundColor: isDark ? "rgba(16,185,129,0.12)" : "#ECFDF5", borderColor: isDark ? "#10B981" : "#A7F3D0" }]} 
                onPress={handleTestDrawer} 
                disabled={testingDrawer}
              >
                {testingDrawer ? (
                  <ActivityIndicator size="small" color="#10B981" />
                ) : (
                  <>
                    <Ionicons name="cash-outline" size={16} color="#10B981" />
                    <Text style={[styles.cardActionBtnText, { color: "#10B981" }]}>Kick Drawer</Text>
                  </>
                )}
              </Pressable>
            )}

            <Pressable 
              style={[styles.cardActionBtn, { backgroundColor: isDark ? "rgba(99,91,255,0.12)" : "#EEF2FF", borderColor: isDark ? "#635BFF" : "#C7D2FE" }]} 
              onPress={handleScan}
            >
              <Ionicons name="scan-outline" size={16} color="#635BFF" />
              <Text style={[styles.cardActionBtnText, { color: "#635BFF" }]}>Scan All</Text>
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

        {/* Brand & Model 1-Click Presets */}
        <View style={[styles.card, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: "#635BFF" }]}>
            POPULAR PRINTER PRESETS (1-TAP AUTO SETUP)
          </Text>
          <Text style={[styles.sectionDesc, { color: theme.onSurfaceSecondary }]}>
            Select your printer brand to auto-apply optimal communication protocols, ESC/POS formatting, and paper sizes:
          </Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetsRow}>
            {PRINTER_PRESETS.map(preset => {
              const isBrandMatch = (activeTab === "cashier" ? cashierBrand : kitchenBrand) === preset.brand;
              return (
                <Pressable
                  key={preset.id}
                  style={[
                    styles.presetCard,
                    {
                      backgroundColor: isBrandMatch ? (isDark ? "rgba(99,91,255,0.2)" : "#EEF2FF") : theme.surface,
                      borderColor: isBrandMatch ? "#635BFF" : theme.border
                    }
                  ]}
                  onPress={() => handleApplyPreset(preset)}
                >
                  <View style={[styles.presetIconBox, { backgroundColor: isBrandMatch ? "#635BFF" : (isDark ? "rgba(255,255,255,0.08)" : "#F1F5F9") }]}>
                    <Ionicons name={preset.icon as any} size={20} color={isBrandMatch ? "#FFFFFF" : "#635BFF"} />
                  </View>
                  <Text style={[styles.presetName, { color: theme.onSurface }]} numberOfLines={1}>{preset.name}</Text>
                  <Text style={[styles.presetDesc, { color: theme.onSurfaceSecondary }]} numberOfLines={2}>{preset.description}</Text>
                  <View style={[styles.presetTag, { backgroundColor: isBrandMatch ? "#635BFF" : (isDark ? "rgba(255,255,255,0.06)" : "#E2E8F0") }]}>
                    <Text style={[styles.presetTagText, { color: isBrandMatch ? "#FFFFFF" : theme.onSurfaceSecondary }]}>
                      {preset.type.toUpperCase()} • {preset.defaultWidth}mm
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Form Card Settings */}
        <View style={[styles.card, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: "#635BFF" }]}>
            {activeTab === "cashier" ? "CASHIER BILLING PRINTER SETTINGS" : "KITCHEN KOT PRINTER SETTINGS"}
          </Text>

          {/* Connection Type Interface Selector */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Printer Hardware Interface</Text>
            <View style={styles.selectorGrid}>
              {([
                { id: "bluetooth", label: "Bluetooth", icon: "bluetooth" },
                { id: "network", label: "Wi-Fi / LAN", icon: "wifi" },
                { id: "usb", label: "USB Cable", icon: "git-network" },
                { id: "sunmi", label: "Sunmi POS", icon: "phone-portrait" },
                { id: "system", label: "System Spooler", icon: "desktop" },
                { id: "none", label: "Disabled", icon: "close-circle" }
              ] as const).map(t => {
                const isSel = (activeTab === "cashier" ? cashierType : kitchenType) === t.id;
                return (
                  <Pressable
                    key={t.id}
                    style={[
                      styles.selectorGridBtn,
                      { backgroundColor: isSel ? "#635BFF" : (isDark ? "rgba(255,255,255,0.05)" : "#F1F5F9"), borderColor: isSel ? "#635BFF" : theme.border }
                    ]}
                    onPress={() => activeTab === "cashier" ? setCashierType(t.id) : setKitchenType(t.id)}
                  >
                    <Ionicons name={t.icon as any} size={16} color={isSel ? "#FFFFFF" : theme.onSurfaceSecondary} />
                    <Text style={[styles.selectorBtnText, { color: isSel ? "#FFFFFF" : theme.onSurfaceSecondary }]}>
                      {t.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Network IP or Bluetooth MAC or USB input */}
          {(activeTab === "cashier" ? cashierType : kitchenType) === "network" ? (
            <View style={styles.rowInputs}>
              <View style={{ flex: 2, minWidth: 120 }}>
                <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Printer IP Address (LAN)</Text>
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
                <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>TCP Port</Text>
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
          ) : (activeTab === "cashier" ? cashierType : kitchenType) === "bluetooth" ? (
            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Bluetooth Thermal Connection</Text>
              {Platform.OS === "web" ? (
                <View style={{ gap: 10, marginTop: 4 }}>
                  <View style={{
                    backgroundColor: isDark ? "rgba(99,91,255,0.12)" : "#EEF2FF",
                    padding: 14,
                    borderRadius: radius.md,
                    borderLeftWidth: 4,
                    borderLeftColor: "#635BFF",
                  }}>
                    <Text style={{ fontSize: 13, fontWeight: "800", color: theme.onSurface }}>
                      💡 How to Connect MPT-II in Chrome / Edge:
                    </Text>
                    <Text style={{ fontSize: 12, color: theme.onSurfaceSecondary, marginTop: 4, lineHeight: 18 }}>
                      1. Click <Text style={{ fontWeight: "800", color: "#635BFF" }}>"Connect MPT-II / Serial Printer"</Text> below.{"\n"}
                      2. In the browser popup window, <Text style={{ fontWeight: "900", color: "#635BFF" }}>click on "MPT-II"</Text> to highlight it.{"\n"}
                      3. The browser's <Text style={{ fontWeight: "900", color: "#10B981" }}>"Connect"</Text> button will activate — click it!{"\n"}
                      4. EzBill will <Text style={{ fontWeight: "800", color: "#10B981" }}>auto-reconnect silently</Text> every time you visit or print!
                    </Text>
                  </View>

                  <Pressable
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      paddingVertical: 13,
                      paddingHorizontal: 16,
                      borderRadius: radius.md,
                      backgroundColor: currentStatus === "connected" ? "#10B981" : "#635BFF",
                    }}
                    onPress={async () => {
                      const ok = await connectWebSerialPrinter(activeTab);
                      if (ok) await loadSettings();
                    }}
                  >
                    <Ionicons name="hardware-chip" size={18} color="#FFFFFF" />
                    <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "800" }}>
                      {currentStatus === "connected" ? "✓ MPT-II / Thermal Connected (Tap to Re-pair)" : "Connect MPT-II / Serial Printer (COM Port)"}
                    </Text>
                  </Pressable>

                  {isWebBluetoothSupported() && (
                    <Pressable
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        paddingVertical: 12,
                        paddingHorizontal: 16,
                        borderRadius: radius.md,
                        backgroundColor: isDark ? "rgba(99,91,255,0.15)" : "#EEF2FF",
                        borderWidth: 1,
                        borderColor: "#635BFF",
                      }}
                      onPress={async () => {
                        const ok = await connectWebBluetoothPrinter(activeTab);
                        if (ok) await loadSettings();
                      }}
                    >
                      <Ionicons name="bluetooth" size={16} color="#635BFF" />
                      <Text style={{ color: "#635BFF", fontSize: 13, fontWeight: "700" }}>
                        Or Connect via Web Bluetooth (BLE)
                      </Text>
                    </Pressable>
                  )}
                  <Text style={{ fontSize: 11, color: theme.onSurfaceSecondary, marginTop: 2 }}>
                    {currentStatus === "connected" ? `Active connection: ${currentName || "Bluetooth Printer"}` : "Click above to select your printer from the browser popup."}
                  </Text>
                </View>
              ) : (
                <TextInput
                  style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.onSurface }]}
                  value={activeTab === "cashier" ? cashierMAC : kitchenMAC}
                  onChangeText={activeTab === "cashier" ? setCashierMAC : setKitchenMAC}
                  placeholder="MPT-II or 00:11:22:33:44:55"
                  placeholderTextColor="#94A3B8"
                />
              )}
            </View>
          ) : (activeTab === "cashier" ? cashierType : kitchenType) === "usb" ? (
            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>USB / Serial Connection</Text>
              {Platform.OS === "web" ? (
                <View style={{ gap: 10, marginTop: 4 }}>
                  <View style={{
                    backgroundColor: isDark ? "rgba(99,91,255,0.12)" : "#EEF2FF",
                    padding: 12,
                    borderRadius: radius.md,
                    borderLeftWidth: 4,
                    borderLeftColor: "#635BFF",
                  }}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: theme.onSurface }}>
                      💡 Tip for Browser Popup:
                    </Text>
                    <Text style={{ fontSize: 12, color: theme.onSurfaceSecondary, marginTop: 4, lineHeight: 18 }}>
                      In the popup window, <Text style={{ fontWeight: "800", color: "#635BFF" }}>click on your printer name</Text> in the list so it is highlighted, then click the <Text style={{ fontWeight: "800", color: "#10B981" }}>"Connect"</Text> button.
                    </Text>
                  </View>

                  <Pressable
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      paddingVertical: 13,
                      paddingHorizontal: 16,
                      borderRadius: radius.md,
                      backgroundColor: currentStatus === "connected" ? "#10B981" : "#635BFF",
                    }}
                    onPress={async () => {
                      const ok = await connectWebSerialPrinter(activeTab) || await connectWebUsbPrinter(activeTab);
                      if (ok) await loadSettings();
                    }}
                  >
                    <Ionicons name="git-network-outline" size={18} color="#FFFFFF" />
                    <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "800" }}>
                      {currentStatus === "connected" ? "✓ USB / Serial Connected (Tap to Change)" : "Select USB / Serial Thermal Printer"}
                    </Text>
                  </Pressable>
                  <Text style={{ fontSize: 11, color: theme.onSurfaceSecondary, marginTop: 2 }}>
                    Connects directly to USB or virtual serial COM port without system print dialogs.
                  </Text>
                </View>
              ) : (
                <TextInput
                  style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.onSurface }]}
                  value={activeTab === "cashier" ? cashierMAC : kitchenMAC}
                  onChangeText={activeTab === "cashier" ? setCashierMAC : setKitchenMAC}
                  placeholder="USB-Direct or USB-Serial"
                  placeholderTextColor="#94A3B8"
                />
              )}
            </View>
          ) : (activeTab === "cashier" ? cashierType : kitchenType) === "sunmi" ? (
            <View style={[styles.infoBanner, { backgroundColor: isDark ? "rgba(99,91,255,0.15)" : "#EEF2FF", borderColor: "#635BFF" }]}>
              <Ionicons name="phone-portrait-outline" size={20} color="#635BFF" />
              <Text style={[styles.infoBannerText, { color: theme.onSurface }]}>
                Sunmi built-in thermal printer active. EzBill will directly stream high-speed ESC/POS receipts to the internal printer mechanism.
              </Text>
            </View>
          ) : null}

          {/* Profile Name */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Custom Printer Label</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.onSurface }]}
              value={activeTab === "cashier" ? cashierName : kitchenName}
              onChangeText={activeTab === "cashier" ? setCashierName : setKitchenName}
              placeholder="e.g. Cashier Thermal Billing Printer"
              placeholderTextColor="#94A3B8"
            />
          </View>

          {/* Paper Width */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Thermal Paper Roll Width</Text>
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
                      {w}mm {w === 58 ? "(2-inch / 32 cols)" : "(3-inch / 48 cols)"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Number of Copies */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.onSurfaceSecondary }]}>Number of Print Copies</Text>
            <View style={styles.selectorRow}>
              {([1, 2, 3] as const).map(c => {
                const isSel = (activeTab === "cashier" ? cashierCopies : kitchenCopies) === c;
                return (
                  <Pressable
                    key={c}
                    style={[
                      styles.widthBtn,
                      { backgroundColor: isSel ? "#635BFF" : (isDark ? "rgba(255,255,255,0.05)" : "#F1F5F9"), borderColor: isSel ? "#635BFF" : theme.border }
                    ]}
                    onPress={() => activeTab === "cashier" ? setCashierCopies(c) : setKitchenCopies(c)}
                  >
                    <Text style={[styles.widthBtnText, { color: isSel ? "#FFFFFF" : theme.onSurfaceSecondary }]}>
                      {c} {c === 1 ? "Copy" : "Copies"}
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
                {activeTab === "cashier" ? "Instant Auto-Print on Settle" : "Instant Auto-Print on Order"}
              </Text>
              <Text style={[styles.switchDesc, { color: theme.onSurfaceSecondary }]}>
                {activeTab === "cashier"
                  ? "Automatically prints customer receipt when marking paid (0 manual clicks needed)"
                  : "Automatically prints kitchen ticket (KOT) as soon as waiter/cashier places an order"}
              </Text>
            </View>
            <Switch
              value={activeTab === "cashier" ? cashierAuto : kitchenAuto}
              onValueChange={activeTab === "cashier" ? setCashierAuto : setKitchenAuto}
              trackColor={{ false: isDark ? "#334155" : "#E2E8F0", true: "#635BFF" }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* Auto Cash Drawer Kick */}
          {activeTab === "cashier" && (
            <View style={[styles.switchRow, { borderTopColor: theme.border }]}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={[styles.switchLabel, { color: theme.onSurface }]}>
                  Auto-Kick Cash Drawer
                </Text>
                <Text style={[styles.switchDesc, { color: theme.onSurfaceSecondary }]}>
                  Automatically pulses the cash drawer kick solenoid on cash payment settlements
                </Text>
              </View>
              <Switch
                value={cashierOpenDrawer}
                onValueChange={setCashierOpenDrawer}
                trackColor={{ false: isDark ? "#334155" : "#E2E8F0", true: "#635BFF" }}
                thumbColor="#FFFFFF"
              />
            </View>
          )}

          {/* Auto Paper Cut Switch */}
          <View style={[styles.switchRow, { borderTopColor: theme.border }]}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={[styles.switchLabel, { color: theme.onSurface }]}>
                Auto-Paper Cut (ESC/POS)
              </Text>
              <Text style={[styles.switchDesc, { color: theme.onSurfaceSecondary }]}>
                Executes partial paper cut at the end of each bill or KOT ticket
              </Text>
            </View>
            <Switch
              value={activeTab === "cashier" ? cashierAutoCut : kitchenAutoCut}
              onValueChange={activeTab === "cashier" ? setCashierAutoCut : setKitchenAutoCut}
              trackColor={{ false: isDark ? "#334155" : "#E2E8F0", true: "#635BFF" }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* Cashier Print KOT Switch */}
          {activeTab === "cashier" && (
            <View style={[styles.switchRow, { borderTopColor: theme.border }]}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={[styles.switchLabel, { color: theme.onSurface }]}>
                  Print KOT on Billing Printer
                </Text>
                <Text style={[styles.switchDesc, { color: theme.onSurfaceSecondary }]}>
                  Also print Kitchen Order Tickets (KOT) from this cashier printer if no kitchen printer is connected
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
            <View>
              <Text style={[styles.sectionTitle, { color: "#635BFF", marginBottom: 2 }]}>DISCOVERED PRINTERS</Text>
              <Text style={[styles.sub, { color: theme.onSurfaceSecondary, fontSize: 11 }]}>Bluetooth, USB & LAN Network Devices</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 6 }}>
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
                    <Text style={[styles.scanBtnText, { color: "#635BFF" }]}>Scan All</Text>
                  </>
                )}
              </Pressable>

              <Pressable
                style={[styles.scanBtn, { backgroundColor: isDark ? "rgba(16,185,129,0.15)" : "#ECFDF5", borderColor: isDark ? "#10B981" : "#A7F3D0" }]}
                onPress={handleSubnetScan}
                disabled={scanningSubnet}
              >
                {scanningSubnet ? (
                  <ActivityIndicator size="small" color="#10B981" />
                ) : (
                  <>
                    <Ionicons name="wifi-outline" size={14} color="#10B981" />
                    <Text style={[styles.scanBtnText, { color: "#10B981" }]}>Scan LAN</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>

          {scanning && (
            <View style={{ paddingVertical: 20, alignItems: "center", gap: 8 }}>
              <ActivityIndicator size="small" color="#635BFF" />
              <Text style={{ color: theme.onSurfaceSecondary, fontSize: 13, fontWeight: "600" }}>
                Searching across Bluetooth, USB & Wi-Fi networks...
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
                      name={dev.type === "network" ? "wifi-outline" : (dev.type === "usb" ? "git-network-outline" : (dev.type === "sunmi" ? "phone-portrait-outline" : "bluetooth-outline"))}
                      size={20}
                      color="#635BFF"
                    />
                  </View>
                  <View style={{ marginLeft: 12, flex: 1, minWidth: 0, paddingRight: 6 }}>
                    <Text style={[styles.deviceName, { color: theme.onSurface }]} numberOfLines={1}>{dev.name}</Text>
                    <Text style={[styles.deviceAddress, { color: theme.onSurfaceSecondary }]} numberOfLines={1}>
                      {dev.type.toUpperCase()} • {dev.address} {dev.brand ? `• ${dev.brand}` : ""}
                    </Text>
                  </View>
                  <View style={[styles.useTag, { backgroundColor: isCurrent ? "#10B981" : "#635BFF" }]}>
                    {isConnecting ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.useTagText}>{isCurrent ? "Connected" : "Connect"}</Text>
                    )}
                  </View>
                </Pressable>
              );
            })
          ) : !scanning ? (
            <Text style={[styles.noDeviceText, { color: theme.onSurfaceSecondary }]}>
              No paired thermal printers detected. Tap "Scan All" to search Bluetooth, USB & LAN.
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
            <Text style={styles.saveMainBtnText}>Save & Auto-Connect</Text>
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
    gap: 8,
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
    fontSize: 11,
    fontWeight: "800",
  },

  sectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  sectionDesc: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 12,
  },

  presetsRow: {
    gap: 10,
    paddingVertical: 4,
  },
  presetCard: {
    width: 170,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
  },
  presetIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  presetName: {
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 4,
  },
  presetDesc: {
    fontSize: 11,
    lineHeight: 14,
    marginBottom: 8,
  },
  presetTag: {
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  presetTagText: {
    fontSize: 9,
    fontWeight: "800",
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
  selectorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  selectorGridBtn: {
    flexBasis: "31%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
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

  infoBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
    gap: 10,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
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
    paddingHorizontal: 10,
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
    minWidth: 70,
    alignItems: "center",
    justifyContent: "center",
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
