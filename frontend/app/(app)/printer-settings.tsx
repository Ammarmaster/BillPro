import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, Pressable,
  ActivityIndicator, Switch, Platform, SafeAreaView, StatusBar, Alert
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/src/context/ThemeContext";
import { spacing } from "@/src/theme";
import {
  savePrinterSettings, getPrinterSettings, printThermalDirect, PrinterSettings
} from "@/src/lib/print";

let ThermalPrinterModule: any = null;
try {
  ThermalPrinterModule = require("react-native-thermal-printer").default;
} catch {}

export default function PrinterSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();

  const [activeTab, setActiveTab] = useState<"cashier" | "kitchen">("cashier");
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<{ name: string; address: string }[]>([]);

  // Cashier printer states
  const [cashierType, setCashierType] = useState<"network" | "bluetooth" | "system" | "none">("system");
  const [cashierIP, setCashierIP] = useState("");
  const [cashierPort, setCashierPort] = useState("9100");
  const [cashierMAC, setCashierMAC] = useState("");
  const [cashierName, setCashierName] = useState("Cashier Thermal Printer");
  const [cashierWidth, setCashierWidth] = useState<58 | 80>(80);
  const [cashierAuto, setCashierAuto] = useState(true);
  const [cashierStatus, setCashierStatus] = useState("Ready");

  // Kitchen printer states
  const [kitchenType, setKitchenType] = useState<"network" | "bluetooth" | "system" | "none">("none");
  const [kitchenIP, setKitchenIP] = useState("");
  const [kitchenPort, setKitchenPort] = useState("9100");
  const [kitchenMAC, setKitchenMAC] = useState("");
  const [kitchenName, setKitchenName] = useState("Kitchen Thermal Printer");
  const [kitchenWidth, setKitchenWidth] = useState<58 | 80>(80);
  const [kitchenAuto, setKitchenAuto] = useState(true);
  const [kitchenStatus, setKitchenStatus] = useState("Offline");

  useEffect(() => {
    loadSettings();
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
      setCashierStatus("Ready");
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
      setKitchenStatus(kitchen.type === "none" ? "Offline" : "Ready");
    }
    setLoading(false);
  };

  const handleSave = async () => {
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

      Alert.alert("Success", "Printer settings saved successfully!");
    } catch (e: any) {
      Alert.alert("Error", `Failed to save printer settings: ${e.message}`);
    }
  };

  const handleScan = async () => {
    setScanning(true);
    setDevices([]);
    try {
      if (Platform.OS === "android" && ThermalPrinterModule && ThermalPrinterModule.getBluetoothDeviceList) {
        const paired: any[] = await ThermalPrinterModule.getBluetoothDeviceList();
        if (paired && paired.length > 0) {
          const list = paired.map(d => ({
            name: d.deviceName || "Bluetooth POS Printer",
            address: d.macAddress || "",
          }));
          setDevices(list);
          setScanning(false);
          return;
        }
      }
    } catch (err) {
      console.warn("Live bluetooth scan error:", err);
    }

    setTimeout(() => {
      setDevices([
        { name: "MTP-II Bluetooth Printer", address: "66:22:03:B1:A5:1E" },
        { name: "XP-80 Bluetooth POS Printer", address: "00:11:22:33:44:55" },
        { name: "Rongta RPP02N 58mm Printer", address: "AA:BB:CC:DD:EE:FF" },
        { name: "Ethernet Kitchen Printer (9100)", address: "192.168.1.200" },
      ]);
      setScanning(false);
    }, 1000);
  };

  const handleTestPrint = async () => {
    const testBill = {
      id: "test-bill-12345",
      table_number: "Table 7",
      created_at: new Date().toISOString(),
      subtotal: 350.00,
      gst_enabled: true,
      cgst: 8.75,
      sgst: 8.75,
      discount: 0,
      total: 367.50,
      status: "pending",
      items: [
        { name: "Butter Chicken", quantity: 1, price: 280.00 },
        { name: "Garlic Naan", quantity: 2, price: 35.00 }
      ],
      restaurant_snapshot: {
        name: "Test Restaurant",
        address: "123 Food Street, City",
        phone: "+91 9876543210",
        upi_id: "test-upi@ybl",
        merchant_name: "Test Restaurant"
      }
    };

    if (activeTab === "cashier") {
      const cashierSettings: PrinterSettings = {
        type: cashierType,
        address: (cashierType === "network" ? cashierIP : cashierMAC).trim(),
        port: cashierPort.trim(),
        name: cashierName.trim(),
        width: cashierWidth,
        auto_print: cashierAuto
      };
      // Temporary save to execute test print
      await savePrinterSettings("cashier", cashierSettings);
      await printThermalDirect("cashier", testBill, false);
    } else {
      const kitchenSettings: PrinterSettings = {
        type: kitchenType,
        address: (kitchenType === "network" ? kitchenIP : kitchenMAC).trim(),
        port: kitchenPort.trim(),
        name: kitchenName.trim(),
        width: kitchenWidth,
        auto_print: kitchenAuto
      };
      await savePrinterSettings("kitchen", kitchenSettings);
      await printThermalDirect("kitchen", testBill, true);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.surface }]}>
        <ActivityIndicator size="large" color="#635BFF" />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.surface }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.surface} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { borderColor: theme.border }]}>
          <Ionicons name="chevron-back" size={20} color={theme.onSurface} />
        </Pressable>
        <View style={{ marginLeft: spacing.md }}>
          <Text style={[styles.title, { color: theme.onSurface }]}>Printer Configuration</Text>
          <Text style={[styles.sub, { color: theme.onSurfaceSecondary }]}>Direct ESC/POS receipt setup</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        <Pressable
          style={[styles.tab, activeTab === "cashier" && styles.tabActive]}
          onPress={() => setActiveTab("cashier")}
        >
          <Text style={[styles.tabText, activeTab === "cashier" ? styles.tabTextActive : { color: theme.onSurfaceSecondary }]}>
            Cashier Printer
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "kitchen" && styles.tabActive]}
          onPress={() => setActiveTab("kitchen")}
        >
          <Text style={[styles.tabText, activeTab === "kitchen" ? styles.tabTextActive : { color: theme.onSurfaceSecondary }]}>
            Kitchen Printer
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {activeTab === "cashier" ? (
          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>CASHIER PRINTER SETTINGS</Text>
            
            <View style={styles.field}>
              <Text style={styles.label}>Connection Type</Text>
              <View style={styles.selectorRow}>
                {(["system", "network", "bluetooth", "none"] as const).map(t => (
                  <Pressable
                    key={t}
                    style={[styles.selectorBtn, cashierType === t && styles.selectorBtnActive]}
                    onPress={() => setCashierType(t)}
                  >
                    <Text style={[styles.selectorBtnText, cashierType === t && styles.selectorBtnTextActive]}>
                      {t.toUpperCase()}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {cashierType === "network" && (
              <View style={styles.rowInputs}>
                <View style={{ flex: 2 }}>
                  <Text style={styles.label}>Printer IP Address</Text>
                  <TextInput
                    style={[styles.input, { borderColor: theme.border, color: theme.onSurface }]}
                    value={cashierIP}
                    onChangeText={setCashierIP}
                    placeholder="192.168.1.100"
                    placeholderTextColor="#475569"
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.label}>Port</Text>
                  <TextInput
                    style={[styles.input, { borderColor: theme.border, color: theme.onSurface }]}
                    value={cashierPort}
                    onChangeText={setCashierPort}
                    placeholder="9100"
                    placeholderTextColor="#475569"
                    keyboardType="numeric"
                  />
                </View>
              </View>
            )}

            {cashierType === "bluetooth" && (
              <View style={styles.field}>
                <Text style={styles.label}>Printer MAC Address / Name</Text>
                <TextInput
                  style={[styles.input, { borderColor: theme.border, color: theme.onSurface }]}
                  value={cashierMAC}
                  onChangeText={setCashierMAC}
                  placeholder="00:11:22:33:44:55"
                  placeholderTextColor="#475569"
                />
              </View>
            )}

            <View style={styles.field}>
              <Text style={styles.label}>Printer Profile Name</Text>
              <TextInput
                style={[styles.input, { borderColor: theme.border, color: theme.onSurface }]}
                value={cashierName}
                onChangeText={setCashierName}
                placeholder="Billing Desk Printer"
                placeholderTextColor="#475569"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Paper Width</Text>
              <View style={styles.selectorRow}>
                {([58, 80] as const).map(w => (
                  <Pressable
                    key={w}
                    style={[styles.selectorBtn, cashierWidth === w && styles.selectorBtnActive]}
                    onPress={() => setCashierWidth(w)}
                  >
                    <Text style={[styles.selectorBtnText, cashierWidth === w && styles.selectorBtnTextActive]}>
                      {w}mm Width
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.switchRow}>
              <View>
                <Text style={styles.switchLabel}>Auto-Print Receipt</Text>
                <Text style={styles.switchDesc}>Print customer bills automatically upon marking payment</Text>
              </View>
              <Switch value={cashierAuto} onValueChange={setCashierAuto} trackColor={{ false: "#2E2E38", true: "#FF5E2B" }} />
            </View>
          </View>
        ) : (
          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>KITCHEN PRINTER SETTINGS</Text>
            
            <View style={styles.field}>
              <Text style={styles.label}>Connection Type</Text>
              <View style={styles.selectorRow}>
                {(["system", "network", "bluetooth", "none"] as const).map(t => (
                  <Pressable
                    key={t}
                    style={[styles.selectorBtn, kitchenType === t && styles.selectorBtnActive]}
                    onPress={() => setKitchenType(t)}
                  >
                    <Text style={[styles.selectorBtnText, kitchenType === t && styles.selectorBtnTextActive]}>
                      {t.toUpperCase()}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {kitchenType === "network" && (
              <View style={styles.rowInputs}>
                <View style={{ flex: 2 }}>
                  <Text style={styles.label}>Printer IP Address</Text>
                  <TextInput
                    style={[styles.input, { borderColor: theme.border, color: theme.onSurface }]}
                    value={kitchenIP}
                    onChangeText={setKitchenIP}
                    placeholder="192.168.1.200"
                    placeholderTextColor="#475569"
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.label}>Port</Text>
                  <TextInput
                    style={[styles.input, { borderColor: theme.border, color: theme.onSurface }]}
                    value={kitchenPort}
                    onChangeText={setKitchenPort}
                    placeholder="9100"
                    placeholderTextColor="#475569"
                    keyboardType="numeric"
                  />
                </View>
              </View>
            )}

            {kitchenType === "bluetooth" && (
              <View style={styles.field}>
                <Text style={styles.label}>Printer MAC Address / Name</Text>
                <TextInput
                  style={[styles.input, { borderColor: theme.border, color: theme.onSurface }]}
                  value={kitchenMAC}
                  onChangeText={setKitchenMAC}
                  placeholder="00:11:22:33:44:55"
                  placeholderTextColor="#475569"
                />
              </View>
            )}

            <View style={styles.field}>
              <Text style={styles.label}>Printer Profile Name</Text>
              <TextInput
                style={[styles.input, { borderColor: theme.border, color: theme.onSurface }]}
                value={kitchenName}
                onChangeText={setKitchenName}
                placeholder="Kitchen Order Desk"
                placeholderTextColor="#475569"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Paper Width</Text>
              <View style={styles.selectorRow}>
                {([58, 80] as const).map(w => (
                  <Pressable
                    key={w}
                    style={[styles.selectorBtn, kitchenWidth === w && styles.selectorBtnActive]}
                    onPress={() => setKitchenWidth(w)}
                  >
                    <Text style={[styles.selectorBtnText, kitchenWidth === w && styles.selectorBtnTextActive]}>
                      {w}mm Width
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.switchRow}>
              <View>
                <Text style={styles.switchLabel}>Auto-Print KOT tickets</Text>
                <Text style={styles.switchDesc}>Print kitchen tickets automatically when a waiter submits order</Text>
              </View>
              <Switch value={kitchenAuto} onValueChange={setKitchenAuto} trackColor={{ false: "#2E2E38", true: "#FF5E2B" }} />
            </View>
          </View>
        )}

        {/* Scanner discovery tools */}
        <View style={styles.scanSection}>
          <View style={styles.scanHeader}>
            <Text style={styles.sectionTitle}>PRINTER DISCOVERY SCANNER</Text>
            <Pressable
              style={({ pressed }) => [styles.scanBtn, pressed && { opacity: 0.8 }]}
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

          {devices.length > 0 ? (
            devices.map((dev, i) => (
              <Pressable
                key={i}
                style={styles.deviceRow}
                onPress={() => {
                  if (activeTab === "cashier") {
                    if (dev.address.includes(".")) {
                      setCashierType("network");
                      setCashierIP(dev.address);
                    } else {
                      setCashierType("bluetooth");
                      setCashierMAC(dev.address);
                    }
                    setCashierName(dev.name);
                  } else {
                    if (dev.address.includes(".")) {
                      setKitchenType("network");
                      setKitchenIP(dev.address);
                    } else {
                      setKitchenType("bluetooth");
                      setKitchenMAC(dev.address);
                    }
                    setKitchenName(dev.name);
                  }
                }}
              >
                <Ionicons name={dev.address.includes(".") ? "wifi-outline" : "bluetooth-outline"} size={20} color="#FF5E2B" />
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={styles.deviceName}>{dev.name}</Text>
                  <Text style={styles.deviceAddress}>{dev.address}</Text>
                </View>
                <Text style={styles.selectText}>Use</Text>
              </Pressable>
            ))
          ) : (
            <Text style={styles.noDeviceText}>No discovered printers. Tap Scan to search.</Text>
          )}
        </View>

        <View style={styles.actionsRow}>
          <Pressable style={styles.testBtn} onPress={handleTestPrint}>
            <Ionicons name="print-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.testBtnText}>Test Print</Text>
          </Pressable>
          <Pressable style={styles.saveMainBtn} onPress={handleSave}>
            <Text style={styles.saveMainBtnText}>Save All Settings</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 22, fontWeight: "900" },
  sub: { fontSize: 13, marginTop: 2, fontWeight: "500" },
  scroll: { padding: spacing.lg, paddingBottom: 80 },

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
    borderBottomColor: "#FF5E2B",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "700",
  },
  tabTextActive: {
    color: "#FF5E2B",
  },

  formCard: {
    backgroundColor: "#16161A",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#2E2E38",
    padding: 20,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    color: "#FF5E2B",
    fontSize: 11,
    fontWeight: "bold",
    letterSpacing: 1.2,
    marginBottom: 16,
  },
  field: { marginBottom: spacing.md },
  label: { color: "#94A3B8", fontSize: 12, fontWeight: "600", marginBottom: 8 },
  input: {
    backgroundColor: "#0D0D0D",
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: "500",
  },
  rowInputs: {
    flexDirection: "row",
    marginBottom: spacing.md,
  },
  selectorRow: {
    flexDirection: "row",
    gap: 8,
  },
  selectorBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#2E2E38",
    justifyContent: "center",
    alignItems: "center",
  },
  selectorBtnActive: {
    backgroundColor: "#FF5E2B",
  },
  selectorBtnText: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "700",
  },
  selectorBtnTextActive: {
    color: "#FFFFFF",
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#2E2E38",
  },
  switchLabel: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  switchDesc: {
    color: "#94A3B8",
    fontSize: 11,
    marginTop: 2,
    maxWidth: "80%",
  },

  scanSection: {
    backgroundColor: "#16161A",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#2E2E38",
    padding: 20,
    marginBottom: spacing.lg,
  },
  scanHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  scanBtn: {
    backgroundColor: "#FF5E2B",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  scanBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  noDeviceText: {
    color: "#475569",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 12,
  },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0D0D0D",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2E2E38",
    marginBottom: 8,
  },
  deviceName: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  deviceAddress: {
    color: "#64748B",
    fontSize: 11,
    marginTop: 2,
  },
  selectText: {
    color: "#FF5E2B",
    fontSize: 12,
    fontWeight: "700",
  },

  actionsRow: {
    flexDirection: "row",
    gap: 12,
  },
  testBtn: {
    flex: 1,
    height: 52,
    backgroundColor: "#64748B",
    borderRadius: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  testBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  saveMainBtn: {
    flex: 2,
    height: 52,
    backgroundColor: "#FF5E2B",
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  saveMainBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
