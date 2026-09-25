import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform, Alert, PermissionsAndroid } from "react-native";
import { storage } from "@/src/utils/storage";
import * as Haptics from "expo-haptics";

let ThermalPrinterModule: any = null;
try {
  ThermalPrinterModule = require("react-native-thermal-printer").default;
} catch {}

const PRINTER_SETTINGS_PREFIX = "lumina_printer_settings_";

export type PrinterConnectionStatus = "connected" | "reconnecting" | "unavailable" | "none";

export interface PrinterSettings {
  type: "network" | "bluetooth" | "system" | "none";
  address: string; // IP for network, MAC for bluetooth
  port?: string;    // default 9100 for network
  name: string;
  width: 58 | 80;
  auto_print: boolean;
  saved_at?: string;
  last_status?: PrinterConnectionStatus;
}

// In-memory status & reconnection tracking
const printerStatuses: Record<string, PrinterConnectionStatus> = {
  cashier: "none",
  kitchen: "none"
};
const statusListeners: Record<string, Set<(status: PrinterConnectionStatus) => void>> = {
  cashier: new Set(),
  kitchen: new Set()
};

export function subscribePrinterStatus(role: "cashier" | "kitchen", listener: (status: PrinterConnectionStatus) => void) {
  statusListeners[role].add(listener);
  listener(printerStatuses[role]);
  return () => {
    statusListeners[role].delete(listener);
  };
}

function setPrinterStatus(role: "cashier" | "kitchen", status: PrinterConnectionStatus) {
  printerStatuses[role] = status;
  statusListeners[role].forEach(fn => {
    try { fn(status); } catch {}
  });
}

export function getPrinterStatus(role: "cashier" | "kitchen"): PrinterConnectionStatus {
  return printerStatuses[role];
}

export async function savePrinterSettings(role: "cashier" | "kitchen", settings: PrinterSettings) {
  const enriched = { ...settings, saved_at: new Date().toISOString() };
  await storage.setItem(`${PRINTER_SETTINGS_PREFIX}${role}`, JSON.stringify(enriched));
  checkPrinterConnection(role).catch(() => {});
}

export async function getPrinterSettings(role: "cashier" | "kitchen"): Promise<PrinterSettings | null> {
  const data = await storage.getItem<string>(`${PRINTER_SETTINGS_PREFIX}${role}`, "");
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function forgetPrinter(role: "cashier" | "kitchen"): Promise<void> {
  await storage.removeItem(`${PRINTER_SETTINGS_PREFIX}${role}`);
  setPrinterStatus(role, "none");
}

export async function checkPrinterConnection(role: "cashier" | "kitchen"): Promise<PrinterConnectionStatus> {
  const settings = await getPrinterSettings(role);
  if (!settings || settings.type === "none") {
    setPrinterStatus(role, "none");
    return "none";
  }
  if (settings.type === "system") {
    setPrinterStatus(role, "connected");
    return "connected";
  }

  setPrinterStatus(role, "reconnecting");

  try {
    if (Platform.OS === "web") {
      setPrinterStatus(role, "connected");
      return "connected";
    }

    if (!ThermalPrinterModule) {
      setPrinterStatus(role, "unavailable");
      return "unavailable";
    }

    if (settings.type === "bluetooth") {
      await requestBluetoothPermissions();
      if (ThermalPrinterModule.getBluetoothDeviceList) {
        const paired: any[] = await ThermalPrinterModule.getBluetoothDeviceList();
        const targetMac = (settings.address || "").trim().toLowerCase();
        const found = paired && paired.some(d => (d.macAddress || "").toLowerCase() === targetMac || (d.deviceName || "").toLowerCase() === settings.name.toLowerCase());
        const status = found ? "connected" : (paired && paired.length > 0 ? "connected" : "unavailable");
        setPrinterStatus(role, status);
        return status;
      }
    } else if (settings.type === "network") {
      setPrinterStatus(role, "connected");
      return "connected";
    }

    setPrinterStatus(role, "connected");
    return "connected";
  } catch (e) {
    setPrinterStatus(role, "unavailable");
    return "unavailable";
  }
}

export const DEFAULT_EZBILL_LOGO_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAIAAAACAAQAAAADrRVxmAAACjElEQVR4nM2Vv2sUQRTHvzO3p3eoeIJHEEUXKyHEuzKg4PoXGAiKjWhn4X9gk9U/QLSyjZ2SJpVilWtEuxxaWCiyGJBoILkiMae5vSfz3szu3CS52OkrNnfffN6792tmgX9iyjzqVxIA+uxNAJERTt9aRI7hzzgTikVjif0bOyFKyzD7WMLP2hiiNhpzD1P8lN/ax1JTwjgA435ArOGSIWM9qwI4XH7UTJ2YC4i77LJpeiXENMsVSiNE6AEV6eVW3XlE7EFr5MpSIqx/4kRj4JwIGzRvYmRAX8BvbzEQoiUEUaKFaAvxtAk91F7FL2aTIbQh7ogw+RkaHpE3V1IhVEeEyYsY+sT36x+4fK7jl1JqauE87wZvyQ4Ba8eeWIKALaXU7MvnrmtEXf7QKQXTval7CAmUg+yFQjcUGiPC0F9GDaAKky4VEKq2XfBijFqVAYnkE+neLhrgYYzYEY6R74pxoJCHwu9Q2CwF2YbVMs4EZ24HJi6klLYTFyLn1AYloR5UlFLFgk9QzovYTz2BFxHWxQxl24xx3goXAJwKa9kxabQ9oepmpyUxYMYGE6GCLzPePdGiPMVxIlq1908GtcQ5ZGXqV1V7/VXmNvS2HBaid1Yw7rRsYxgXd7BQxrBfYl9wROSEzqVOs+43eaMIGssYDJ750y8JyBDTgojNrhMt//jIBFcy56WuTXsSLzGYO/RaQURyCL8CJMRQghzlthETnPo2uSM0KK+/VypGYyzfsB5bu901RxdmnR6/fN0Zu8GdvTnrtAepnplcS/0Ae4orL0+lZzf8S+23+O0sOeN9Ajqr3slDh9a9Dj4ifu95RHufefH5M8+/HTqiEzqZ4ph52bywAdLkdxvif7A9XHChgusoMPAAAAABJRU5ErkJggg==";

export function getBillLogo(snapshot?: any, width: number = 80): string | null {
  return null;
}

export function formatCurrency(val: number): string {
  if (val % 1 === 0) {
    return `₹${Math.round(val).toLocaleString('en-IN')}`;
  }
  return `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// KOT Print de-duplication cache to prevent double printing
const recentPrintedKOTs = new Map<string, number>();

export function getOrderPrintSignature(order: any): string {
  if (!order) return "";
  const items = Array.isArray(order.items) ? order.items : [];
  const itemsSig = items
    .map((it: any) => `${String(it.name || it.item_name || "").trim().toLowerCase()}_${it.quantity || 1}`)
    .sort()
    .join("|");
  const tbl = String(order.table_number || order.table || order.order_type || "takeaway").trim().toLowerCase();
  return `${tbl}__${itemsSig}`;
}

export async function formatReceipt(data: any, width: number = 80, isKitchen: boolean = false): Promise<string> {
  const maxChars = width === 58 ? 32 : 48;
  const divider = "-".repeat(maxChars);
  const lines: string[] = [];

  if (isKitchen) {
    // ==========================================
    // CLEAN, COMPACT KITCHEN ORDER TICKET (KOT)
    // ==========================================
    const isTakeaway = String(data.table_number || "").toLowerCase() === "takeaway" || String(data.order_type || "").toLowerCase() === "takeaway";
    const tableLabel = isTakeaway ? "TAKEAWAY" : (data.table_number ? (String(data.table_number).startsWith("Table") ? data.table_number : `TABLE ${data.table_number}`) : "TAKEAWAY");
    const orderNo = data.order_number || (data.id ? data.id.slice(0, 6).toUpperCase() : "1");
    const timeStr = new Date(data.created_at || Date.now()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
    const items = data.items || [];
    const totalQty = items.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 1), 0);

    lines.push(`[C]<b><font size='big'>*** KOT ***</font></b>\n`);
    lines.push(`[C]<b><font size='big'>${isTakeaway ? ">>> TAKEAWAY <<<" : `>>> ${tableLabel.toUpperCase()} <<<`}</font></b>\n`);
    lines.push(`[L]Order: #${orderNo}       Time: ${timeStr}\n`);
    lines.push(`[C]${divider}\n`);
    lines.push(`[L]<b>QTY   ITEM</b>\n`);
    lines.push(`[C]${divider}\n`);

    items.forEach((it: any) => {
      const qtyStr = `${it.quantity || 1}x`.padEnd(5);
      lines.push(`[L]<b><font size='big'>${qtyStr}</font></b><b>${it.name || "Item"}</b>\n`);
      if (it.notes && String(it.notes).trim()) {
        lines.push(`[L]     * Note: ${it.notes}\n`);
      }
    });

    lines.push(`[C]${divider}\n`);
    lines.push(`[C]<b>Total Items: ${totalQty}</b>\n`);
    lines.push(`[C]\n\n`);
  } else {
    // ==========================================
    // CUSTOMER BILL RECEIPT — MATCHING GENERATED BILL
    // ==========================================
    const r = data.restaurant_snapshot || {};
    
    // Restaurant Header (Master cheff style - Strictly Centered)
    lines.push(`[C]<b><font size='big'>${(r.name || "MASTER CHEFF").toUpperCase()}</font></b>\n`);
    
    if (r.address) {
      const addrLines = r.address.split(/,|\n/).map((s: string) => s.trim()).filter(Boolean);
      addrLines.forEach((addrLine: string) => {
        lines.push(`[C]${addrLine}\n`);
      });
    }
    
    const phoneParts = [];
    if (r.phone) phoneParts.push(r.phone);
    if (r.phone2) phoneParts.push(r.phone2);
    if (phoneParts.length > 0) {
      lines.push(`[C]Phone: ${phoneParts.join(" / ")}\n`);
    }
    
    if (r.gst) lines.push(`[C]GSTIN: ${r.gst}\n`);
    if (r.fssai) lines.push(`[C]FSSAI: ${r.fssai}\n`);
    lines.push(`[C]${divider}\n`);

    // Bill Metadata (Matching screenshot 2 columns)
    const billIdText = `Bill No: #${data.bill_number || (data.id ? data.id.slice(0, 8).toUpperCase() : "313")}`;
    const dateObj = new Date(data.created_at || Date.now());
    const dateText = `Date: ${dateObj.toLocaleDateString('en-IN')}`;
    const timeText = `Time: ${dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}`;
    
    const isTakeaway = String(data.table_number || "").toLowerCase() === "takeaway" || String(data.order_type || "").toLowerCase() === "takeaway";
    const tableText = isTakeaway ? "Takeaway" : (data.table_number ? (String(data.table_number).startsWith("Table") ? data.table_number : `Table ${data.table_number}`) : "Dine-In");
    
    const formatMetaLine = (left: string, right: string) => {
      const spaces = maxChars - left.length - right.length;
      return `[L]${left}${" ".repeat(Math.max(1, spaces))}${right}\n`;
    };
    
    lines.push(formatMetaLine(billIdText, dateText));
    lines.push(formatMetaLine(tableText, timeText));
    if (data.customer_name && data.customer_name !== "Guest") {
      lines.push(`[L]Customer: ${data.customer_name}\n`);
    }
    lines.push(`[C]${divider}\n`);

    // Item Table Header
    const qtyColWidth = 4;
    const rateColWidth = 7;
    const amtColWidth = 8;
    const numColTotalWidth = qtyColWidth + 1 + rateColWidth + 1 + amtColWidth; // 21
    const itemColWidth = maxChars - numColTotalWidth;

    const headerItem = "ITEM".padEnd(itemColWidth);
    const headerQty = "QTY".padStart(qtyColWidth);
    const headerRate = "RATE".padStart(rateColWidth);
    const headerAmt = "AMOUNT".padStart(amtColWidth);
    
    lines.push(`[L]<b>${headerItem} ${headerQty} ${headerRate} ${headerAmt}</b>\n`);
    lines.push(`[C]${divider}\n`);

    // Items list
    (data.items || []).forEach((it: any) => {
      const name = it.name || "";
      const qtyStr = String(it.quantity).padStart(qtyColWidth);
      const rateStr = `₹${Math.round(it.price)}`.padStart(rateColWidth);
      const amtStr = `₹${Math.round(it.price * it.quantity)}`.padStart(amtColWidth);
      
      if (name.length <= itemColWidth) {
        lines.push(`[L]${name.padEnd(itemColWidth)} ${qtyStr} ${rateStr} ${amtStr}\n`);
      } else {
        lines.push(`[L]${name}\n`);
        const spacingPad = "".padEnd(itemColWidth);
        lines.push(`[R]${spacingPad} ${qtyStr} ${rateStr} ${amtStr}\n`);
      }
    });
    lines.push(`[C]${divider}\n`);

    // Totals Section
    const addTotalRow = (lbl: string, val: number, isBig = false) => {
      const valStr = formatCurrency(val);
      const spaces = maxChars - lbl.length - valStr.length;
      if (isBig) {
        lines.push(`[L]<b><font size='big'>${lbl}${" ".repeat(Math.max(1, spaces))}${valStr}</font></b>\n`);
      } else {
        lines.push(`[L]${lbl}${" ".repeat(Math.max(1, spaces))}${valStr}\n`);
      }
    };

    const itemsSubtotal = (data.items || []).reduce((acc: number, it: any) => acc + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
    const subtotalVal = Number(data.subtotal || 0) || itemsSubtotal;
    const totalVal = Number(data.total || 0) || subtotalVal;

    addTotalRow("Subtotal", subtotalVal);
    if (data.discount) {
      addTotalRow("Discount", -data.discount);
    }
    
    const taxableAmt = subtotalVal - (data.discount || 0);
    if (data.discount || data.gst_enabled) {
      addTotalRow("Taxable Amount", taxableAmt);
    }
    
    if (data.gst_enabled) {
      addTotalRow("CGST", data.cgst || 0);
      addTotalRow("SGST", data.sgst || 0);
    }
    lines.push(`[C]${divider}\n`);
    addTotalRow("TOTAL", totalVal, true);
    lines.push(`[C]${divider}\n`);

    if (data.status === "paid") {
      const payMethod = (data.payment_method || "CASH").toUpperCase();
      lines.push(formatMetaLine(`Status: PAID (${payMethod})`, `Paid: ${formatCurrency(data.total || 0)}`));
      lines.push(`[C]${divider}\n`);
    }

    // Dynamic UPI Payment QR Code
    const isBillPaid = data.status === "paid";
    const upiId = r.upi_id || r.upi || "8152075375-2@ybl";
    const merchant = r.merchant_name || r.name || "Master Chef";
    const totalAmount = Number(data.total || data.subtotal || 0).toFixed(2);
    const upiUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(merchant)}&am=${totalAmount}&cu=INR`;

    if (!isBillPaid && upiId) {
      lines.push(`[C]<b>Scan to Pay via UPI</b>\n`);
      lines.push(`[C]<qrcode size='20'>${upiUrl}</qrcode>\n`);
      lines.push(`[C]${divider}\n`);
    }

    lines.push(`[C]Thank you! Visit again.\n`);
    lines.push(`[C]Powered by EzBill\n`);
    lines.push(`[C]\n\n`);
  }

  return lines.join("");
}

export async function printKitchenKOT(order: any, isManual = false): Promise<boolean> {
  if (!order) return false;

  const kSettings = await getPrinterSettings("kitchen");
  const cSettings = await getPrinterSettings("cashier");

  const hasKitchenPrinter = kSettings && kSettings.type !== "none" && kSettings.type !== "system";
  const hasCashierPrinter = cSettings && cSettings.type !== "none" && cSettings.type !== "system";

  // Strict Auto-Print Setting Guard:
  // If NOT a manual print, verify that auto_print is turned ON
  if (!isManual) {
    const isAutoPrintEnabled = hasKitchenPrinter ? !!kSettings?.auto_print : (hasCashierPrinter ? !!cSettings?.auto_print : false);
    if (!isAutoPrintEnabled) {
      console.log("[PRINT] Suppressed KOT print: auto_print is disabled in printer settings.");
      return false;
    }

    // Never auto-print if order is already past "placed" / "new" status
    if (order.status && order.status !== "placed" && order.status !== "new") {
      console.log("[PRINT] Suppressed KOT print for non-placed order status:", order.status);
      return false;
    }
  }

  const orderSig = getOrderPrintSignature(order);
  const now = Date.now();
  
  // De-duplicate: Never print the exact same KOT twice within 30 seconds
  if (orderSig && recentPrintedKOTs.has(orderSig)) {
    const lastTime = recentPrintedKOTs.get(orderSig) || 0;
    if (now - lastTime < 30000) {
      console.log("[PRINT] Suppressed duplicate KOT print for:", orderSig);
      return true;
    }
  }
  if (orderSig) {
    recentPrintedKOTs.set(orderSig, now);
  }

  // Clean old entries
  if (recentPrintedKOTs.size > 100) {
    for (const [k, t] of recentPrintedKOTs.entries()) {
      if (now - t > 60000) recentPrintedKOTs.delete(k);
    }
  }

  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  
  // 1. Try dedicated kitchen printer first
  if (hasKitchenPrinter) {
    return await printThermalDirect("kitchen", order, true);
  }
  
  // 2. If no kitchen printer is configured, fallback to cashier printer
  if (hasCashierPrinter) {
    return await printThermalDirect("cashier", order, true);
  }

  return false;
}

// Background auto-reconnect manager with backoff
let isAutoReconnecting = false;
export function startAutoReconnect() {
  if (isAutoReconnecting) return;
  isAutoReconnecting = true;

  const attempt = async () => {
    try {
      await checkPrinterConnection("cashier");
      await checkPrinterConnection("kitchen");
    } catch {}
  };

  // Immediate check
  attempt();

  // Periodic intelligent background health check every 30 seconds
  setInterval(attempt, 30000);
}

// Start auto-reconnection immediately on module import
startAutoReconnect();

export async function requestBluetoothPermissions(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  try {
    const version = typeof Platform.Version === "number" ? Platform.Version : parseInt(String(Platform.Version), 10);
    if (version >= 31) {
      const results = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      return results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED;
    } else {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
  } catch (err) {
    console.warn("Bluetooth permission request error:", err);
    return false;
  }
}

export async function scanNearbyPrinters(): Promise<{ name: string; address: string; type: "bluetooth" | "network" }[]> {
  const discovered: { name: string; address: string; type: "bluetooth" | "network" }[] = [];

  if (Platform.OS === "android") {
    await requestBluetoothPermissions();
    if (ThermalPrinterModule && ThermalPrinterModule.getBluetoothDeviceList) {
      try {
        const paired: any[] = await ThermalPrinterModule.getBluetoothDeviceList();
        if (paired && Array.isArray(paired)) {
          paired.forEach(d => {
            const name = (d.deviceName || d.name || "Bluetooth POS Printer").trim();
            const address = (d.macAddress || d.address || "").trim();
            if (address && !discovered.some(x => x.address.toLowerCase() === address.toLowerCase())) {
              discovered.push({ name, address, type: "bluetooth" });
            }
          });
        }
      } catch (err) {
        console.warn("Bluetooth scan error:", err);
      }
    }
  }

  // Also include any currently remembered printers if not already in list
  const cashier = await getPrinterSettings("cashier");
  if (cashier && cashier.address && cashier.type !== "none" && cashier.type !== "system") {
    if (!discovered.some(x => x.address.toLowerCase() === cashier.address.toLowerCase())) {
      discovered.push({
        name: cashier.name || (cashier.type === "network" ? "Network Printer" : "Bluetooth Printer"),
        address: cashier.address,
        type: cashier.type as "bluetooth" | "network"
      });
    }
  }

  const kitchen = await getPrinterSettings("kitchen");
  if (kitchen && kitchen.address && kitchen.type !== "none" && kitchen.type !== "system") {
    if (!discovered.some(x => x.address.toLowerCase() === kitchen.address.toLowerCase())) {
      discovered.push({
        name: kitchen.name || (kitchen.type === "network" ? "Network Printer" : "Bluetooth Printer"),
        address: kitchen.address,
        type: kitchen.type as "bluetooth" | "network"
      });
    }
  }

  // Fallback defaults for testing/development if no hardware detected
  if (discovered.length === 0 && (Platform.OS === "web" || !ThermalPrinterModule)) {
    discovered.push(
      { name: "MTP-II Bluetooth Printer", address: "66:22:03:B1:A5:1E", type: "bluetooth" },
      { name: "XP-80 Bluetooth POS Printer", address: "00:11:22:33:44:55", type: "bluetooth" },
      { name: "Ethernet Kitchen Printer (9100)", address: "192.168.1.200", type: "network" }
    );
  }

  return discovered;
}

export async function autoConnectPrinter(
  role: "cashier" | "kitchen",
  printer: { name: string; address: string; type?: "bluetooth" | "network" | "system"; width?: 58 | 80; auto_print?: boolean }
): Promise<PrinterConnectionStatus> {
  const isNetwork = printer.type === "network" || (printer.address && printer.address.includes("."));
  const existing = await getPrinterSettings(role);
  const settings: PrinterSettings = {
    type: isNetwork ? "network" : "bluetooth",
    name: printer.name || (isNetwork ? "Network Printer" : "Bluetooth Thermal Printer"),
    address: printer.address.trim(),
    port: isNetwork ? "9100" : undefined,
    width: printer.width || (existing ? existing.width : 80),
    auto_print: printer.auto_print ?? (existing ? existing.auto_print : true),
  };

  await savePrinterSettings(role, settings);
  const status = await checkPrinterConnection(role);
  return status;
}

export async function printThermalDirect(role: "cashier" | "kitchen", data: any, isKitchen = false): Promise<boolean> {
  const settings = await getPrinterSettings(role);
  if (!settings || settings.type === "none" || settings.type === "system") {
    return false; // Fallback to system print sheet
  }

  const payload = await formatReceipt(data, settings.width, isKitchen);
  
  if (Platform.OS === "web") {
    console.log("Thermal print (web fallback):\n", payload);
    return false;
  }

  if (!ThermalPrinterModule) {
    console.warn("ThermalPrinterModule is not loaded.");
    return false;
  }

  try {
    if (settings.type === "network") {
      await ThermalPrinterModule.printTcp({
        payload,
        ip: (settings.address || "").trim(),
        port: parseInt(settings.port || "9100"),
        autoCut: true,
      });
      return true;
    } else if (settings.type === "bluetooth") {
      const cleanAddress = (settings.address || "").trim();

      await requestBluetoothPermissions();

      // Pre-fetch paired device list to initialize internal Java native device connection array
      try {
        if (ThermalPrinterModule.getBluetoothDeviceList) {
          await ThermalPrinterModule.getBluetoothDeviceList();
        }
      } catch (devErr) {
        console.warn("Could not pre-fetch bluetooth device list:", devErr);
      }

      try {
        await ThermalPrinterModule.printBluetooth({
          payload,
          macAddress: cleanAddress,
          printerWidthMM: settings.width || 58,
          printerNbrCharactersPerLine: settings.width === 80 ? 48 : 32,
          mmFeedPaper: 20,
        });
        return true;
      } catch (directErr: any) {
        console.warn("Direct MAC print error:", directErr);
        // Only attempt general first-paired fallback if no specific MAC address was configured
        if (!cleanAddress) {
          try {
            await ThermalPrinterModule.printBluetooth({
              payload,
              macAddress: "",
              printerWidthMM: settings.width || 58,
              printerNbrCharactersPerLine: settings.width === 80 ? 48 : 32,
              mmFeedPaper: 20,
            });
            return true;
          } catch {}
        }
        return false;
      }
    }
  } catch (e: any) {
    console.warn("Direct thermal printing failed:", e);
    return false;
  }

  return false;
}

export async function printBill(bill: any): Promise<boolean> {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  let handled = await printThermalDirect("cashier", bill, false);
  if (!handled && Platform.OS === "web") {
    await printBillLegacy(bill);
  }
  return handled;
}



function escapeHtml(s: string) {
  return String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export function kotHtml(order: any): string {
  const isTakeaway = String(order.table_number || "").toLowerCase() === "takeaway" || String(order.order_type || "").toLowerCase() === "takeaway";
  const tableLabel = isTakeaway ? "TAKEAWAY" : (order.table_number ? (String(order.table_number).startsWith("Table") ? order.table_number : `TABLE ${order.table_number}`) : "TAKEAWAY");
  const orderNo = order.order_number || (order.id ? order.id.slice(0, 6).toUpperCase() : "1");
  const timeStr = new Date(order.created_at || Date.now()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const items = order.items || [];
  const totalQty = items.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 1), 0);

  const itemsRows = items.map((it: any) => `
    <tr>
      <td class="qty-col">${it.quantity || 1}x</td>
      <td class="item-col">
        <div class="item-name">${escapeHtml(it.name || "Item")}</div>
        ${it.notes ? `<div class="note-text">* Note: ${escapeHtml(it.notes)}</div>` : ""}
      </td>
    </tr>
  `).join("");

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #000; padding: 16px; max-width: 320px; margin: 0 auto; }
        .center { text-align: center; }
        .kot-badge { font-size: 13px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 4px; }
        .table-banner { font-size: 22px; font-weight: 900; text-align: center; margin: 4px 0 8px; padding: 6px 0; border-top: 2px solid #000; border-bottom: 2px solid #000; text-transform: uppercase; letter-spacing: 1px; }
        .meta-row { display: flex; justify-content: space-between; font-size: 13px; font-weight: 700; margin: 4px 0; color: #222; }
        hr { border: none; border-top: 1px dashed #000; margin: 8px 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th { font-size: 12px; font-weight: 800; border-bottom: 1.5px solid #000; padding-bottom: 4px; text-align: left; }
        td { padding: 6px 0; vertical-align: top; border-bottom: 1px dashed #ddd; }
        .qty-col { width: 42px; font-size: 17px; font-weight: 900; text-align: left; }
        .item-name { font-size: 15px; font-weight: 800; color: #000; }
        .note-text { font-size: 12px; font-weight: 600; color: #555; margin-top: 2px; font-style: italic; }
        .summary-box { text-align: center; font-size: 14px; font-weight: 900; margin-top: 12px; border-top: 2px solid #000; padding-top: 6px; }
      </style>
    </head>
    <body>
      <div class="center kot-badge">*** KITCHEN ORDER TICKET ***</div>
      <div class="table-banner">${isTakeaway ? ">>> TAKEAWAY <<<" : `>>> ${escapeHtml(tableLabel.toUpperCase())} <<<`}</div>
      <div class="meta-row">
        <span>Order #${orderNo}</span>
        <span>Time: ${timeStr}</span>
      </div>
      ${order.created_by && order.created_by !== "guest" && order.created_by !== "staff" ? `<div class="meta-row" style="font-size: 12px; color: #555;"><span>Server: ${escapeHtml(order.created_by)}</span></div>` : ""}
      
      <table>
        <thead>
          <tr>
            <th style="width: 42px;">QTY</th>
            <th>ITEM</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>

      <div class="summary-box">
        TOTAL ITEMS: ${totalQty} (${items.length} dishes)
      </div>
    </body>
    </html>
  `;
}

export function billHtml(bill: any): string {
  const r = bill.restaurant_snapshot || {};
  const customLogo = getBillLogo(r);
  
  const items = (bill.items || []).map(
    (it: any) => `
      <tr>
        <td class="l">${escapeHtml(it.name)}</td>
        <td class="r">${it.quantity}</td>
        <td class="r">${formatCurrency(it.price)}</td>
        <td class="r">${formatCurrency(it.price * it.quantity)}</td>
      </tr>`
  ).join("");

  const logoBlock = customLogo ? `<img class="logo" src="data:image/png;base64,${customLogo}" />` : "";

  return `
    <html><head><meta charset="utf-8" />
    <style>
      body { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color:#111; padding:20px; max-width:360px; margin:0 auto; font-size: 13px; }
      .center { text-align:center; }
      .l { text-align:left; }
      .r { text-align:right; }
      h1 { font-size:18px; margin:4px 0 2px; text-transform:uppercase; font-weight:900; text-align:center; letter-spacing: 0.5px; }
      p.small { font-size:11px; color:#555; margin:2px 0; text-align:center; }
      table { width:100%; border-collapse:collapse; margin-top:8px; }
      td { padding:5px 0; font-size:12.5px; color:#222; }
      th { font-size:11px; font-weight:800; border-bottom:1px solid #333; padding-bottom:4px; color:#222; text-transform:uppercase; }
      hr { border:none; border-top:1px dashed #aaa; margin:6px 0; }
      .meta-table td { font-size:11.5px; color:#444; padding:2px 0; }
      .totals-table td { padding:3px 0; font-size:12.5px; }
      .total-row td { font-size:16px; font-weight:900; border-top:1.5px solid #111; border-bottom:1.5px solid #111; padding:6px 0; color:#000; }
      .payment-row td { font-size:12.5px; font-weight:700; color:#111; padding-top:6px; }
      .footer { text-align:center; margin-top:14px; font-size:11.5px; color:#555; font-weight:600; }
    </style></head><body>
      <h1>${escapeHtml(r.name || "RESTAURANT")}</h1>
      ${r.address ? `<p class="small">${escapeHtml(r.address)}</p>` : ""}
      ${(r.phone && r.phone2) ? `<p class="small">Tel: ${escapeHtml(r.phone)} / ${escapeHtml(r.phone2)}</p>` : (r.phone ? `<p class="small">Tel: ${escapeHtml(r.phone)}</p>` : (r.phone2 ? `<p class="small">Tel: ${escapeHtml(r.phone2)}</p>` : ""))}
      ${r.gst ? `<p class="small">GSTIN: ${escapeHtml(r.gst)}</p>` : ""}
      ${r.fssai ? `<p class="small">FSSAI: ${escapeHtml(r.fssai)}</p>` : ""}
      <hr />
      
      <table class="meta-table">
        <tr>
          <td>Bill: #${escapeHtml(bill.bill_number || (bill.id ? bill.id.slice(0, 8).toUpperCase() : "BILL"))}</td>
          <td class="r">Date: ${new Date(bill.created_at || Date.now()).toLocaleDateString('en-IN')}</td>
        </tr>
        <tr>
          <td>Table: ${escapeHtml(bill.table_number ? (bill.table_number === "Takeaway" ? "Takeaway" : "Table " + bill.table_number) : "Dine-In")}</td>
          <td class="r">Time: ${new Date(bill.created_at || Date.now()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</td>
        </tr>
        ${bill.customer_name && bill.customer_name !== "Guest" ? `<tr><td colspan="2">Guest: ${escapeHtml(bill.customer_name)}</td></tr>` : ""}
      </table>
      <hr />
      
      <table class="items-table">
        <thead>
          <tr>
            <th class="l">ITEM</th>
            <th class="r" style="width: 36px;">QTY</th>
            <th class="r" style="width: 64px;">RATE</th>
            <th class="r" style="width: 74px;">AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          ${items}
        </tbody>
      </table>
      <hr />
      
      <table class="totals-table">
        <tr>
          <td>Subtotal</td>
          <td class="r">${formatCurrency(bill.subtotal || 0)}</td>
        </tr>
        ${bill.discount ? `
          <tr>
            <td>Discount</td>
            <td class="r">-${formatCurrency(bill.discount)}</td>
          </tr>
        ` : ""}
        ${(bill.discount || bill.gst_enabled) ? `
          <tr>
            <td>Taxable Amount</td>
            <td class="r">${formatCurrency((bill.subtotal || 0) - (bill.discount || 0))}</td>
          </tr>
        ` : ""}
        ${bill.gst_enabled ? `
          <tr>
            <td>CGST</td>
            <td class="r">${formatCurrency(bill.cgst || 0)}</td>
          </tr>
          <tr>
            <td>SGST</td>
            <td class="r">${formatCurrency(bill.sgst || 0)}</td>
          </tr>
        ` : ""}
        <tr class="total-row">
          <td class="total">TOTAL</td>
          <td class="r total">${formatCurrency(bill.total || 0)}</td>
        </tr>
        ${bill.status === "paid" ? `
          <tr class="payment-row">
            <td>Payment: ${(bill.payment_method || "CASH").toUpperCase()}</td>
            <td class="r">${formatCurrency(bill.total || 0)}</td>
          </tr>
        ` : ""}
      </table>
      <hr />
      
      ${r.upi_id && bill.status !== "paid" ? `
        <div class="center" style="margin: 10px 0;">
          <div style="font-size: 11px; font-weight: 700; margin-bottom: 4px;">Scan to Pay via UPI (₹${Number(bill.total || 0).toFixed(2)})</div>
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(`upi://pay?pa=${r.upi_id}&pn=${encodeURIComponent(r.merchant_name || r.name || "Merchant")}&am=${Number(bill.total || 0).toFixed(2)}&cu=INR`)}" style="width: 130px; height: 130px; display: block; margin: 0 auto;" />
        </div>
        <hr />
      ` : ""}

      <p class="footer">Thank you! Visit again.</p>
      <p class="footer" style="font-size: 10px; color: #888; margin-top: 2px;">Powered by EzBill</p>
    </body></html>
  `;
}

export async function printBillLegacy(bill: any) {
  const html = billHtml(bill);
  if (Platform.OS === "web") {
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); w.focus(); w.print(); }
    return;
  }
  await Print.printAsync({ html });
}

export async function printKOTLegacy(order: any) {
  const html = kotHtml(order);
  if (Platform.OS === "web") {
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); w.focus(); w.print(); }
    return;
  }
  await Print.printAsync({ html });
}

export async function sharePdf(bill: any) {
  const html = billHtml(bill);
  if (Platform.OS === "web") {
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); w.focus(); w.print(); }
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Share Bill" });
  }
}

export async function getDefaultPrinter(): Promise<string | null> {
  try {
    const val = await storage.getItem("lumina_default_printer_url", null);
    return typeof val === "string" ? val : null;
  } catch {
    return null;
  }
}

export async function selectDefaultPrinter(): Promise<string | null> {
  if (Platform.OS === "web") {
    Alert.alert("Print Settings", "Browser printing is handled natively by your OS print dialog.");
    return null;
  }
  
  if (Platform.OS === "android") {
    Alert.alert(
      "Android Thermal Printing",
      "Android uses the system print service. Make sure your thermal printer is connected and active in your phone's Settings -> Connection & Sharing -> Print."
    );
    return null;
  }
  
  try {
    const result = await Print.selectPrinterAsync();
    if (result && result.url) {
      await storage.setItem("lumina_default_printer_url", result.url);
      return result.url;
    }
    return null;
  } catch (e: any) {
    Alert.alert("Printer Error", e.message || "Failed to select printer");
    return null;
  }
}

export async function clearDefaultPrinter(): Promise<void> {
  try {
    await storage.removeItem("lumina_default_printer_url");
  } catch {}
}
