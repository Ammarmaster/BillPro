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

export function getBillLogo(snapshot?: any, width: number = 80): string {
  if (snapshot) {
    if (width === 58 && snapshot.logo_base64_58) {
      return snapshot.logo_base64_58;
    }
    if (width === 80 && snapshot.logo_base64_80) {
      return snapshot.logo_base64_80;
    }
    if (snapshot.logo_base64) {
      return snapshot.logo_base64;
    }
  }
  return DEFAULT_EZBILL_LOGO_BASE64;
}

export function formatCurrency(val: number): string {
  if (val % 1 === 0) {
    return `₹${Math.round(val).toLocaleString('en-IN')}`;
  }
  return `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function formatReceipt(data: any, width: number = 80, isKitchen: boolean = false): Promise<string> {
  const maxChars = width === 58 ? 32 : 48;
  const divider = "-".repeat(maxChars);
  const lines: string[] = [];

  if (isKitchen) {
    // Kitchen Order Ticket (KOT)
    lines.push(`[C]<b><font size='big'>KITCHEN TICKET</font></b>\n`);
    lines.push(`[C]${divider}\n`);
    lines.push(`[L]Table: ${data.table_number || "Takeaway"}\n`);
    if (data.id) {
      lines.push(`[L]Order ID: #${data.id.slice(0, 8).toUpperCase()}\n`);
    }
    lines.push(`[L]Date: ${new Date().toLocaleTimeString()}\n`);
    lines.push(`[C]${divider}\n`);
    
    // Items
    (data.items || []).forEach((it: any) => {
      const qtyText = `${it.quantity} x ${it.name}`;
      lines.push(`[L]<b>${qtyText}</b>\n`);
      if (it.notes) {
        lines.push(`[L]  * Notes: ${it.notes}\n`);
      }
    });
    lines.push(`[C]${divider}\n`);
    lines.push(`[C]\n\n\n`);
  } else {
    // Customer Receipt
    const r = data.restaurant_snapshot || {};
    const logoBase64 = getBillLogo(r, width);
    lines.push(`[C]<img>data:image/png;base64,${logoBase64}</img>\n`);
    lines.push(`[C]<b><font size='big'>${r.name || "Restaurant"}</font></b>\n`);
    if (r.address) lines.push(`[C]${r.address}\n`);
    
    const phoneParts = [];
    if (r.phone) phoneParts.push(r.phone);
    if (r.phone2) phoneParts.push(r.phone2);
    if (phoneParts.length > 0) {
      lines.push(`[C]Phone: ${phoneParts.join(" / ")}\n`);
    }
    
    if (r.gst) lines.push(`[C]GSTIN: ${r.gst}\n`);
    if (r.fssai) lines.push(`[C]FSSAI: ${r.fssai}\n`);
    lines.push(`[C]${divider}\n`);

    const billIdText = `Bill #${data.id ? data.id.slice(0, 8).toUpperCase() : "BILL"}`;
    const dateObj = new Date(data.created_at || Date.now());
    const dateText = dateObj.toLocaleDateString('en-IN');
    const timeText = dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    
    const tableText = data.table_number ? (data.table_number === "Takeaway" ? "Takeaway" : `Table ${data.table_number}`) : "Dine-In";
    
    const formatMetaLine = (left: string, right: string) => {
      const spaces = maxChars - left.length - right.length;
      return `[L]${left}${" ".repeat(Math.max(1, spaces))}${right}\n`;
    };
    
    lines.push(formatMetaLine(billIdText, `Date: ${dateText}`));
    lines.push(formatMetaLine(`Table: ${tableText}`, `Time: ${timeText}`));
    if (data.customer_name) {
      lines.push(`[L]Customer: ${data.customer_name}\n`);
    }
    lines.push(`[C]${divider}\n`);

    // Item Table Header
    const qtyColWidth = 3;
    const rateColWidth = 7;
    const amtColWidth = 8;
    const numColTotalWidth = qtyColWidth + 1 + rateColWidth + 1 + amtColWidth; // 20
    const itemColWidth = maxChars - numColTotalWidth; // 12 or 28

    const headerItem = "ITEM".padEnd(itemColWidth);
    const headerQty = "QTY".padStart(qtyColWidth);
    const headerRate = "RATE".padStart(rateColWidth);
    const headerAmt = "AMOUNT".padStart(amtColWidth);
    
    lines.push(`[L]${headerItem} ${headerQty} ${headerRate} ${headerAmt}\n`);
    lines.push(`[C]${divider}\n`);

    // Items list
    (data.items || []).forEach((it: any) => {
      const name = it.name || "";
      const qtyStr = String(it.quantity).padStart(qtyColWidth);
      const rateStr = Number(it.price).toFixed(2).slice(0, rateColWidth).padStart(rateColWidth);
      const amtStr = Number(it.price * it.quantity).toFixed(2).slice(0, amtColWidth).padStart(amtColWidth);
      
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
        lines.push(`[L]<b>${lbl}${" ".repeat(Math.max(1, spaces))}${valStr}</b>\n`);
      } else {
        lines.push(`[L]${lbl}${" ".repeat(Math.max(1, spaces))}${valStr}\n`);
      }
    };

    addTotalRow("Subtotal", data.subtotal || 0);
    if (data.discount) {
      addTotalRow("Discount", -data.discount);
    }
    
    const taxableAmt = (data.subtotal || 0) - (data.discount || 0);
    if (data.discount || data.gst_enabled) {
      addTotalRow("Taxable Amount", taxableAmt);
    }
    
    if (data.gst_enabled) {
      addTotalRow("CGST", data.cgst || 0);
      addTotalRow("SGST", data.sgst || 0);
    }
    lines.push(`[C]${divider}\n`);
    addTotalRow("TOTAL", data.total || 0, true);
    lines.push(`[C]${divider}\n`);

    if (data.status === "paid") {
      const payMethod = data.payment_method || "CASH";
      lines.push(formatMetaLine(`Payment: ${payMethod}`, `Paid: ${formatCurrency(data.total || 0)}`));
      lines.push(`[C]${divider}\n`);
    }

    // Dynamic UPI Payment QR Code
    if (r.upi_id && data.status !== "paid") {
      const merchant = r.merchant_name || r.name || "Merchant";
      const totalAmount = Number(data.total || 0).toFixed(2);
      const upiUrl = `upi://pay?pa=${r.upi_id}&pn=${encodeURIComponent(merchant)}&am=${totalAmount}&cu=INR`;
      
      try {
        const QRCode = require("qrcode");
        const qrSize = width === 58 ? 160 : 220;
        // Generate QR code data URL (returns data:image/png;base64,...)
        const qrDataUrl = await QRCode.toDataURL(upiUrl, {
          margin: 2,
          width: qrSize,
          errorCorrectionLevel: 'M'
        });
        
        lines.push(`[C]Scan to Pay via UPI (₹${totalAmount})\n`);
        lines.push(`[C]<img>${qrDataUrl}</img>\n`);
        lines.push(`[C]${divider}\n`);
      } catch (qrErr) {
        console.warn("Failed to generate payment QR code:", qrErr);
        lines.push(`[C]Payment QR could not be generated.\n`);
        lines.push(`[C]${divider}\n`);
      }
    }

    lines.push(`[C]Thank you! Visit again.\n`);
    lines.push(`[C]Powered by EZBill\n`);
    lines.push(`[C]\n\n\n`);
  }

  return lines.join("");
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
      } catch (directErr) {
        console.warn("Direct MAC print failed, attempting first paired printer fallback:", directErr);
        // Fallback: connect to first paired Bluetooth printer
        await ThermalPrinterModule.printBluetooth({
          payload,
          macAddress: "",
          printerWidthMM: settings.width || 58,
          printerNbrCharactersPerLine: settings.width === 80 ? 48 : 32,
          mmFeedPaper: 20,
        });
        return true;
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

export async function printKitchenKOT(order: any): Promise<boolean> {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  let handled = await printThermalDirect("kitchen", order, true);
  if (!handled) {
    const cashierSettings = await getPrinterSettings("cashier");
    if (cashierSettings && cashierSettings.type !== "none" && cashierSettings.type !== "system") {
      handled = await printThermalDirect("cashier", order, true);
    }
  }
  return handled;
}

function escapeHtml(s: string) {
  return String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function billHtml(bill: any): string {
  const r = bill.restaurant_snapshot || {};
  const logoBase64 = getBillLogo(r);
  
  const items = (bill.items || []).map(
    (it: any) => `
      <tr>
        <td class="l">${escapeHtml(it.name)}</td>
        <td class="r">${it.quantity}</td>
        <td class="r">${formatCurrency(it.price)}</td>
        <td class="r">${formatCurrency(it.price * it.quantity)}</td>
      </tr>`
  ).join("");

  const logoBlock = `<img class="logo" src="data:image/png;base64,${logoBase64}" />`;

  return `
    <html><head><meta charset="utf-8" />
    <style>
      body { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color:#111; padding:24px; max-width:380px; margin:0 auto; }
      .center { text-align:center; }
      .l { text-align:left; }
      .r { text-align:right; }
      .logo { width:80px; height:80px; object-fit:contain; margin:0 auto 12px; display:block; }
      h1 { font-size:22px; margin:8px 0 2px; text-transform:uppercase; font-weight:800; text-align:center; }
      p.small { font-size:12px; color:#555; margin:3px 0; text-align:center; }
      table { width:100%; border-collapse:collapse; margin-top:12px; }
      td { padding:6px 0; font-size:13px; color:#333; }
      th { font-size:11px; font-weight:700; border-bottom:1px dashed #999; padding-bottom:6px; color:#555; text-transform:uppercase; }
      hr { border:none; border-top:1px dashed #999; margin:8px 0; }
      .meta-table td { font-size:12px; color:#444; padding:3px 0; }
      .totals-table td { padding:4px 0; font-size:13px; }
      .total-row td { font-size:17px; font-weight:800; border-top:1px dashed #999; border-bottom:1px dashed #999; padding:8px 0; color:#000; }
      .payment-row td { font-size:13px; font-weight:700; color:#111; padding-top:8px; }
      .footer { text-align:center; margin-top:16px; font-size:12px; color:#666; font-weight:600; }
    </style></head><body>
      <div class="center">${logoBlock}</div>
      <h1>${escapeHtml(r.name || "Restaurant")}</h1>
      ${r.address ? `<p class="small">${escapeHtml(r.address)}</p>` : ""}
      ${(r.phone && r.phone2) ? `<p class="small">Phone: ${escapeHtml(r.phone)} / ${escapeHtml(r.phone2)}</p>` : (r.phone ? `<p class="small">Phone: ${escapeHtml(r.phone)}</p>` : (r.phone2 ? `<p class="small">Phone: ${escapeHtml(r.phone2)}</p>` : ""))}
      ${r.gst ? `<p class="small">GSTIN: ${escapeHtml(r.gst)}</p>` : ""}
      ${r.fssai ? `<p class="small">FSSAI: ${escapeHtml(r.fssai)}</p>` : ""}
      <hr />
      
      <table class="meta-table">
        <tr>
          <td>Bill No: #${bill.id ? bill.id.slice(0, 8).toUpperCase() : "BILL"}</td>
          <td class="r">Date: ${new Date(bill.created_at || Date.now()).toLocaleDateString('en-IN')}</td>
        </tr>
        <tr>
          <td>Table: ${escapeHtml(bill.table_number ? (bill.table_number === "Takeaway" ? "Takeaway" : "Table " + bill.table_number) : "Dine-In")}</td>
          <td class="r">Time: ${new Date(bill.created_at || Date.now()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td>
        </tr>
        ${bill.customer_name ? `<tr><td colspan="2">Customer: ${escapeHtml(bill.customer_name)}</td></tr>` : ""}
      </table>
      <hr />
      
      <table class="items-table">
        <thead>
          <tr>
            <th class="l">ITEM</th>
            <th class="r" style="width: 40px;">QTY</th>
            <th class="r" style="width: 70px;">RATE</th>
            <th class="r" style="width: 80px;">AMOUNT</th>
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
      
      <p class="footer">Thank you! Visit again.</p>
      <p class="footer" style="font-size: 10px; color: #999;">Powered by EZBill</p>
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
