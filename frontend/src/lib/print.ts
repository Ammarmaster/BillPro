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
  print_kot?: boolean; // When configured on cashier: allow KOT to print from billing printer
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

// ============================================================================
// WEB BLUETOOTH THERMAL PRINTER DRIVER (ESC/POS)
// ============================================================================
const BLUETOOTH_PRINTER_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb", // Standard ESC/POS Service
  "0000ffe0-0000-1000-8000-00805f9b34fb", // Common BLE Serial (Feasycom, HM-10, POS58/80)
  "0000ff00-0000-1000-8000-00805f9b34fb", // Chinese POS printer default
  "49535343-fe7d-4ae5-8fa9-9fafd205e455", // ISSC Transparent BLE
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
  "0000fff0-0000-1000-8000-00805f9b34fb",
  "0000ae00-0000-1000-8000-00805f9b34fb",
  "0000ff02-0000-1000-8000-00805f9b34fb",
];

let activeWebBluetoothDevice: any = null;
let activeWebBluetoothCharacteristic: any = null;

export function isWebBluetoothSupported(): boolean {
  return Platform.OS === "web" && typeof navigator !== "undefined" && "bluetooth" in navigator;
}

export function getActiveWebBluetoothDevice(): any {
  return activeWebBluetoothDevice;
}

export async function connectWebBluetoothPrinter(role: "cashier" | "kitchen" = "cashier"): Promise<boolean> {
  if (!isWebBluetoothSupported()) {
    return false;
  }
  try {
    const navBt = (navigator as any).bluetooth;
    const device = await navBt.requestDevice({
      acceptAllDevices: true,
      optionalServices: BLUETOOTH_PRINTER_SERVICES,
    });

    if (!device) return false;

    const server = await device.gatt.connect();
    let writeChar: any = null;

    for (const serviceUuid of BLUETOOTH_PRINTER_SERVICES) {
      try {
        const service = await server.getPrimaryService(serviceUuid);
        const chars = await service.getCharacteristics();
        for (const c of chars) {
          if (c.properties.write || c.properties.writeWithoutResponse) {
            writeChar = c;
            break;
          }
        }
        if (writeChar) break;
      } catch {}
    }

    if (!writeChar && server.getPrimaryServices) {
      try {
        const allServices = await server.getPrimaryServices();
        for (const s of allServices) {
          try {
            const chars = await s.getCharacteristics();
            for (const c of chars) {
              if (c.properties.write || c.properties.writeWithoutResponse) {
                writeChar = c;
                break;
              }
            }
            if (writeChar) break;
          } catch {}
        }
      } catch {}
    }

    if (writeChar) {
      activeWebBluetoothDevice = device;
      activeWebBluetoothCharacteristic = writeChar;

      device.addEventListener("gattserverdisconnected", () => {
        console.log("Web Bluetooth thermal printer disconnected.");
        activeWebBluetoothCharacteristic = null;
        setPrinterStatus(role, "unavailable");
      });

      const devName = device.name || "Bluetooth Thermal Printer";
      const devAddress = device.id || "Web-Bluetooth";
      await autoConnectPrinter(role, {
        name: devName,
        address: devAddress,
        type: "bluetooth",
      });
      setPrinterStatus(role, "connected");
      return true;
    }
    return false;
  } catch (err: any) {
    console.warn("Web Bluetooth pairing cancelled or failed:", err);
    return false;
  }
}

export async function sendWebBluetoothPrint(bytes: Uint8Array): Promise<boolean> {
  if (!activeWebBluetoothCharacteristic) {
    if (activeWebBluetoothDevice && activeWebBluetoothDevice.gatt) {
      try {
        const server = await activeWebBluetoothDevice.gatt.connect();
        for (const serviceUuid of BLUETOOTH_PRINTER_SERVICES) {
          try {
            const service = await server.getPrimaryService(serviceUuid);
            const chars = await service.getCharacteristics();
            for (const c of chars) {
              if (c.properties.write || c.properties.writeWithoutResponse) {
                activeWebBluetoothCharacteristic = c;
                break;
              }
            }
            if (activeWebBluetoothCharacteristic) break;
          } catch {}
        }
      } catch {}
    }
  }

  if (!activeWebBluetoothCharacteristic) {
    return false;
  }

  try {
    const chunkSize = 100;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.slice(i, i + chunkSize);
      if (activeWebBluetoothCharacteristic.writeValueWithoutResponse) {
        await activeWebBluetoothCharacteristic.writeValueWithoutResponse(chunk);
      } else {
        await activeWebBluetoothCharacteristic.writeValue(chunk);
      }
      await new Promise(r => setTimeout(r, 25));
    }
    return true;
  } catch (e) {
    console.warn("Error sending Web Bluetooth bytes:", e);
    return false;
  }
}

function encodeUtf8(str: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(str);
  }
  const utf8: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let charcode = str.charCodeAt(i);
    if (charcode < 0x80) utf8.push(charcode);
    else if (charcode < 0x800) {
      utf8.push(0xc0 | (charcode >> 6), 0x80 | (charcode & 0x3f));
    } else if (charcode < 0xd800 || charcode >= 0xe000) {
      utf8.push(0xe0 | (charcode >> 12), 0x80 | ((charcode >> 6) & 0x3f), 0x80 | (charcode & 0x3f));
    } else {
      i++;
      charcode = 0x10000 + (((charcode & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
      utf8.push(0xf0 | (charcode >> 18), 0x80 | ((charcode >> 12) & 0x3f), 0x80 | ((charcode >> 6) & 0x3f), 0x80 | (charcode & 0x3f));
    }
  }
  return new Uint8Array(utf8);
}

export function convertThermalPayloadToEscPos(payload: string, width: 58 | 80 = 80): Uint8Array {
  const maxChars = width === 58 ? 32 : 48;
  const bytes: number[] = [];

  // Init printer: ESC @ (0x1B, 0x40)
  bytes.push(0x1B, 0x40);

  const lines = payload.split("\n");

  for (const rawLine of lines) {
    if (!rawLine.trim()) {
      bytes.push(0x0A);
      continue;
    }

    // Check for QR code tag: <qrcode size='...'>data</qrcode>
    const qrMatch = rawLine.match(/<qrcode[^>]*>(.*?)<\/qrcode>/i);
    if (qrMatch) {
      const qrData = qrMatch[1];
      const qrBytes = encodeUtf8(qrData);
      const len = qrBytes.length + 3;
      const pL = len % 256;
      const pH = Math.floor(len / 256);

      // Align Center
      bytes.push(0x1B, 0x61, 0x01);
      // QR Model 2: GS ( k 4 0 49 65 50 0
      bytes.push(0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
      // QR Module size 6: GS ( k 3 0 49 67 6
      bytes.push(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x06);
      // Error correction L: GS ( k 3 0 49 69 48
      bytes.push(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x30);
      // Store QR data: GS ( k pL pH 49 80 48 ...
      bytes.push(0x1D, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30);
      for (const b of qrBytes) bytes.push(b);
      // Print QR: GS ( k 3 0 49 81 48
      bytes.push(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30);
      bytes.push(0x0A);
      // Reset align to Left
      bytes.push(0x1B, 0x61, 0x00);
      continue;
    }

    let isBold = false;
    let isDoubleSize = false;
    let isTall = false;

    if (rawLine.includes("<b>") || rawLine.includes("</b>")) {
      isBold = true;
    }
    if (rawLine.includes("<font size='big'>")) {
      isDoubleSize = true;
    } else if (rawLine.includes("<font size='tall'>")) {
      isTall = true;
    }

    // Strip HTML formatting tags
    const clean = rawLine
      .replace(/<font[^>]*>/gi, "")
      .replace(/<\/font>/gi, "")
      .replace(/<b>/gi, "")
      .replace(/<\/b>/gi, "");

    let align = 0; // 0: Left, 1: Center, 2: Right
    let formattedText = "";

    if (clean.includes("[L]") && clean.includes("[C]") && clean.includes("[R]")) {
      const parts = clean.split(/\[L\]|\[C\]|\[R\]/).filter(p => p !== "");
      const colL = (parts[0] || "").trim();
      const colC = (parts[1] || "").trim();
      const colR = (parts[2] || "").trim();

      const leftCenter = colL + " ".repeat(Math.max(1, Math.floor((maxChars - colC.length) / 2) - colL.length)) + colC;
      const spaces = Math.max(1, maxChars - leftCenter.length - colR.length);
      formattedText = leftCenter + " ".repeat(spaces) + colR;
      align = 0;
    } else if (clean.includes("[L]") && clean.includes("[R]")) {
      const parts = clean.split(/\[L\]|\[R\]/).filter(p => p !== "");
      const colL = (parts[0] || "").trim();
      const colR = (parts[1] || "").trim();
      const spaces = Math.max(1, maxChars - colL.length - colR.length);
      formattedText = colL + " ".repeat(spaces) + colR;
      align = 0;
    } else if (clean.startsWith("[C]")) {
      align = 1;
      formattedText = clean.replace("[C]", "").trim();
    } else if (clean.startsWith("[R]")) {
      align = 2;
      formattedText = clean.replace("[R]", "").trim();
    } else if (clean.startsWith("[L]")) {
      align = 0;
      formattedText = clean.replace("[L]", "").trim();
    } else {
      formattedText = clean.trim();
    }

    // Alignment: ESC a n
    bytes.push(0x1B, 0x61, align);

    // Bold: ESC E n
    bytes.push(0x1B, 0x45, isBold ? 0x01 : 0x00);

    // Font size: GS ! n
    if (isDoubleSize) {
      bytes.push(0x1D, 0x21, 0x11);
    } else if (isTall) {
      bytes.push(0x1D, 0x21, 0x01);
    } else {
      bytes.push(0x1D, 0x21, 0x00);
    }

    const textEncoded = encodeUtf8(formattedText);
    for (const b of textEncoded) bytes.push(b);
    bytes.push(0x0A);
  }

  // Reset styles
  bytes.push(0x1B, 0x45, 0x00);
  bytes.push(0x1D, 0x21, 0x00);
  bytes.push(0x1B, 0x61, 0x00);

  // Feed 5 lines for easy tearing
  bytes.push(0x1B, 0x64, 0x05);
  // Cut paper (partial)
  bytes.push(0x1D, 0x56, 0x42, 0x00);

  return new Uint8Array(bytes);
}

export function printViaIframe(html: string) {
  if (typeof document === "undefined") return;
  let iframe = document.getElementById("ezbill-print-frame") as HTMLIFrameElement;
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = "ezbill-print-frame";
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    document.body.appendChild(iframe);
  }
  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        console.warn("Iframe print error:", e);
      }
    }, 250);
  }
}

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

function formatThermalMoney(val: number): string {
  const num = Number(val || 0);
  if (num % 1 === 0) {
    return `${Math.round(num)}`;
  }
  return num.toFixed(2);
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
    const rawTable = String(data.table_number || "").trim();
    const tableLabel = isTakeaway ? "TAKEAWAY" : (rawTable ? (rawTable.toUpperCase().startsWith("TABLE") ? rawTable.toUpperCase() : `TABLE ${rawTable.toUpperCase()}`) : "TAKEAWAY");
    const orderNo = data.order_number || (data.id ? data.id.slice(0, 6).toUpperCase() : "1");
    const dateObj = new Date(data.created_at || Date.now());
    const timeStr = dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
    const items = data.items || [];
    const totalQty = items.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 1), 0);

    lines.push(`[C]<b><font size='big'>KOT · ${tableLabel}</font></b>\n`);
    lines.push(`[L]#${orderNo}[R]${timeStr}\n`);
    lines.push(`[C]${divider}\n`);
    lines.push(`[L]<b>QTY  ITEM</b>\n`);

    items.forEach((it: any) => {
      const q = it.quantity || 1;
      const name = it.name || "Item";
      lines.push(`[L]<b>${q}x</b>  ${name}\n`);
      if (it.notes && String(it.notes).trim()) {
        lines.push(`[L]   * Note: ${String(it.notes).trim()}\n`);
      }
    });

    lines.push(`[C]${divider}\n`);
    lines.push(`[L]<b>Total Items: ${totalQty}</b>[R]Dishes: ${items.length}\n`);
    lines.push(`\n\n\n\n\n`);
  } else {
    // ==========================================
    // CUSTOMER BILL RECEIPT — COMPACT & ELEGANT
    // ==========================================
    const r = data.restaurant_snapshot || {};
    const restaurantName = (r.name || "RESTAURANT").toUpperCase();
    lines.push(`[C]<b><font size='big'>${restaurantName}</font></b>\n`);

    if (r.address) {
      const cleanAddr = String(r.address).replace(/\s+/g, " ").trim();
      if (cleanAddr.length <= maxChars) {
        lines.push(`[C]${cleanAddr}\n`);
      } else {
        const words = cleanAddr.split(" ");
        let l1 = "";
        let l2 = "";
        for (const w of words) {
          if ((l1 + " " + w).trim().length <= maxChars && !l2) {
            l1 = (l1 + " " + w).trim();
          } else if ((l2 + " " + w).trim().length <= maxChars) {
            l2 = (l2 + " " + w).trim();
          }
        }
        if (l1) lines.push(`[C]${l1}\n`);
        if (l2) lines.push(`[C]${l2}\n`);
      }
    }

    const phone = r.phone || r.phone2 || "";
    const gst = r.gst || "";
    if (phone && gst && (phone.length + gst.length + 14 <= maxChars)) {
      lines.push(`[C]Ph: ${phone} | GST: ${gst}\n`);
    } else {
      if (phone) lines.push(`[C]Ph: ${phone}\n`);
      if (gst) lines.push(`[C]GSTIN: ${gst}\n`);
    }
    lines.push(`[C]${divider}\n`);

    // Bill Metadata (compact 2 lines)
    const billIdText = `Bill: #${data.bill_number || (data.id ? data.id.slice(0, 6).toUpperCase() : "BILL")}`;
    const dateObj = new Date(data.created_at || Date.now());
    const dateStr = dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' });
    const timeStr = dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
    const isTakeaway = String(data.table_number || "").toLowerCase() === "takeaway" || String(data.order_type || "").toLowerCase() === "takeaway";
    const rawTable = String(data.table_number || "").trim();
    const tableText = isTakeaway ? "Takeaway" : (rawTable ? (rawTable.toUpperCase().startsWith("TABLE") ? rawTable : `Table ${rawTable}`) : "Dine-In");

    lines.push(`[L]${billIdText}[R]${dateStr} ${timeStr}\n`);
    if (data.customer_name && data.customer_name !== "Guest") {
      lines.push(`[L]${tableText}[R]${String(data.customer_name).slice(0, 14)}\n`);
    } else {
      lines.push(`[L]${tableText}\n`);
    }
    lines.push(`[C]${divider}\n`);

    // Item Table
    if (width === 58) {
      lines.push(`[L]<b>ITEM</b>[R]<b>QTY   AMOUNT</b>\n`);
      lines.push(`[C]${divider}\n`);
      (data.items || []).forEach((it: any) => {
        const name = it.name || "Item";
        const qty = it.quantity || 1;
        const amt = formatThermalMoney((it.price || 0) * qty);
        const rightCol = `${qty}x  ${amt}`;
        const availNameWidth = maxChars - rightCol.length - 1;
        if (name.length <= availNameWidth) {
          lines.push(`[L]${name}[R]${rightCol}\n`);
        } else {
          lines.push(`[L]${name}\n`);
          lines.push(`[R]${rightCol}\n`);
        }
      });
    } else {
      lines.push(`[L]<b>ITEM</b>[C]<b>QTY x RATE</b>[R]<b>AMOUNT</b>\n`);
      lines.push(`[C]${divider}\n`);
      (data.items || []).forEach((it: any) => {
        const name = it.name || "Item";
        const qty = it.quantity || 1;
        const rate = formatThermalMoney(it.price || 0);
        const amt = formatThermalMoney((it.price || 0) * qty);
        const centerCol = `${qty} x ${rate}`;
        const rightCol = `${amt}`;
        if (name.length <= 22) {
          lines.push(`[L]${name}[C]${centerCol}[R]${rightCol}\n`);
        } else {
          lines.push(`[L]${name}\n`);
          lines.push(`[L] [C]${centerCol}[R]${rightCol}\n`);
        }
      });
    }
    lines.push(`[C]${divider}\n`);

    // Totals Section
    const itemsSubtotal = (data.items || []).reduce((acc: number, it: any) => acc + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
    const subtotalVal = Number(data.subtotal || 0) || itemsSubtotal;
    const totalVal = Number(data.total || 0) || subtotalVal;

    lines.push(`[L]Subtotal[R]${formatThermalMoney(subtotalVal)}\n`);
    if (data.discount && Number(data.discount) > 0) {
      lines.push(`[L]Discount[R]-${formatThermalMoney(data.discount)}\n`);
    }
    if (data.gst_enabled) {
      const totalTax = Number(data.cgst || 0) + Number(data.sgst || 0);
      if (totalTax > 0) {
        lines.push(`[L]GST (Taxes)[R]${formatThermalMoney(totalTax)}\n`);
      }
    }
    lines.push(`[C]${divider}\n`);
    lines.push(`[L]<b><font size='tall'>TOTAL</font></b>[R]<b><font size='tall'>Rs.${formatThermalMoney(totalVal)}</font></b>\n`);
    lines.push(`[C]${divider}\n`);

    const isPaid = data.status === "paid";
    if (isPaid) {
      const payMethod = (data.payment_method || "CASH").toUpperCase();
      lines.push(`[C]<b>PAID (${payMethod})</b>\n`);
      lines.push(`[C]${divider}\n`);
    } else {
      const upiId = r.upi_id || r.upi || "8152075375-2@ybl";
      const merchant = r.merchant_name || r.name || "Restaurant";
      const totalAmount = Number(totalVal).toFixed(2);
      const upiUrl = data.upi_url || `upi://pay?pa=${upiId}&pn=${encodeURIComponent(merchant)}&am=${totalAmount}&cu=INR`;
      const qrSize = width === 58 ? 30 : 36;
      if (upiId) {
        lines.push(`[C]<b>Scan to Pay: Rs.${formatThermalMoney(totalVal)}</b>\n`);
        lines.push(`[C]<qrcode size='${qrSize}'>${upiUrl}</qrcode>\n`);
        lines.push(`[C]${upiId}\n`);
        lines.push(`[C]${divider}\n`);
      }
    }

    lines.push(`[C]Thank you! Visit again.\n`);
    lines.push(`[C]EzBill POS\n`);
    lines.push(`\n\n\n\n`);
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
  // If NOT a manual print, strictly evaluate whether KOT auto-print is active
  if (!isManual) {
    if (hasKitchenPrinter) {
      // 1. When dedicated kitchen printer is configured: strictly follow kitchen auto_print setting
      if (!kSettings?.auto_print) {
        console.log("[PRINT] Suppressed KOT print: Kitchen KOT auto_print is turned OFF.");
        return false;
      }
    } else if (hasCashierPrinter) {
      // 2. When NO dedicated kitchen printer: ONLY print from cashier printer if print_kot is toggled ON
      if (!cSettings?.print_kot) {
        console.log("[PRINT] Suppressed KOT print: Billing printer KOT print is not enabled.");
        return false;
      }
    } else {
      // No thermal printer is active
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
  
  // 1. Try dedicated kitchen printer first (if manual or auto_print is on)
  if (hasKitchenPrinter && (isManual || kSettings?.auto_print)) {
    return await printThermalDirect("kitchen", order, true);
  }
  
  // 2. Fallback to cashier printer ONLY if manual or cSettings.print_kot is enabled
  if (hasCashierPrinter && (isManual || cSettings?.print_kot)) {
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
  printer: { name: string; address: string; type?: "bluetooth" | "network" | "system"; width?: 58 | 80; auto_print?: boolean; print_kot?: boolean }
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
    print_kot: printer.print_kot ?? (existing ? existing.print_kot : false),
  };

  await savePrinterSettings(role, settings);
  const status = await checkPrinterConnection(role);
  return status;
}

export async function printThermalDirect(role: "cashier" | "kitchen", data: any, isKitchen = false): Promise<boolean> {
  const settings = await getPrinterSettings(role);
  if (!settings || settings.type === "none" || settings.type === "system") {
    if (Platform.OS === "web") {
      if (isKitchen) {
        await printKOTLegacy(data);
      } else {
        await printBillLegacy(data);
      }
      return true;
    }
    return false; // Fallback to system print sheet on mobile
  }

  const payload = await formatReceipt(data, settings.width, isKitchen);
  
  if (Platform.OS === "web") {
    // 1. Direct Web Bluetooth ESC/POS printing if connected
    if (activeWebBluetoothCharacteristic || (activeWebBluetoothDevice && activeWebBluetoothDevice.gatt?.connected)) {
      try {
        const escPosBytes = convertThermalPayloadToEscPos(payload, settings.width);
        const success = await sendWebBluetoothPrint(escPosBytes);
        if (success) return true;
      } catch (e) {
        console.warn("Web Bluetooth direct print failed, falling back to silent iframe:", e);
      }
    }

    // 2. Fallback on Web: Silent in-page iframe printing (no about:blank tabs)
    if (isKitchen) {
      await printKOTLegacy(data);
    } else {
      await printBillLegacy(data);
    }
    return true;
  }

  if (!ThermalPrinterModule) {
    console.warn("ThermalPrinterModule is not loaded.");
    return false;
  }

  const mmFeed = isKitchen ? 25 : 12;

  try {
    if (settings.type === "network") {
      await ThermalPrinterModule.printTcp({
        payload,
        ip: (settings.address || "").trim(),
        port: parseInt(settings.port || "9100"),
        autoCut: true,
        mmFeedPaper: mmFeed,
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
          mmFeedPaper: mmFeed,
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
              mmFeedPaper: mmFeed,
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
    handled = true;
  }
  return handled;
}



function escapeHtml(s: string) {
  return String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export function kotHtml(order: any): string {
  const isTakeaway = String(order.table_number || "").toLowerCase() === "takeaway" || String(order.order_type || "").toLowerCase() === "takeaway";
  const rawTable = String(order.table_number || "").trim();
  const tableLabel = isTakeaway ? "TAKEAWAY" : (rawTable ? (rawTable.toUpperCase().startsWith("TABLE") ? rawTable.toUpperCase() : `TABLE ${rawTable.toUpperCase()}`) : "TAKEAWAY");
  const orderNo = order.order_number || (order.id ? order.id.slice(0, 6).toUpperCase() : "1");
  const dateObj = new Date(order.created_at || Date.now());
  const timeStr = dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const items = order.items || [];
  const totalQty = items.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 1), 0);

  const itemsRows = items.map((it: any) => `
    <tr>
      <td class="qty">${it.quantity || 1}x</td>
      <td class="name">
        ${escapeHtml(it.name || "Item")}
        ${it.notes ? `<div class="note">* ${escapeHtml(it.notes)}</div>` : ""}
      </td>
    </tr>
  `).join("");

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <style>
        @page { margin: 3mm 3mm 20mm 3mm; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; color: #000; padding: 6px; padding-bottom: 25px; max-width: 280px; margin: 0 auto; font-size: 13px; line-height: 1.25; }
        .center { text-align: center; }
        .title { font-size: 17px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 2px; }
        .meta { display: flex; justify-content: space-between; font-size: 12px; font-weight: 700; color: #333; margin: 3px 0 5px; }
        hr { border: none; border-top: 1px dashed #000; margin: 5px 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 4px; }
        th { font-size: 11px; font-weight: 800; border-bottom: 1.5px solid #000; padding: 2px 0 4px; text-align: left; }
        td { padding: 3px 0; vertical-align: top; }
        .qty { width: 36px; font-size: 15px; font-weight: 900; }
        .name { font-size: 13.5px; font-weight: 700; }
        .note { font-size: 11px; font-weight: 600; color: #444; margin-top: 1px; }
        .footer { text-align: center; font-size: 12px; font-weight: 800; margin-top: 6px; border-top: 1px dashed #000; padding-top: 5px; }
        .tear-spacer { height: 40px; width: 100%; }
      </style>
    </head>
    <body>
      <div class="center title">KOT · ${escapeHtml(tableLabel)}</div>
      <div class="meta">
        <span>#${escapeHtml(orderNo)}</span>
        <span>${escapeHtml(timeStr)}</span>
      </div>
      <hr />
      <table>
        <thead>
          <tr>
            <th style="width: 36px;">QTY</th>
            <th>ITEM</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>
      <div class="footer">
        TOTAL ITEMS: ${totalQty} (${items.length} dishes)
      </div>
      <div class="tear-spacer"></div>
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
        <td class="r">${it.quantity}x</td>
        <td class="r">${formatCurrency((it.price || 0) * (it.quantity || 1))}</td>
      </tr>`
  ).join("");

  const logoBlock = customLogo ? `<img class="logo" src="data:image/png;base64,${customLogo}" style="max-height: 44px; max-width: 130px; display: block; margin: 0 auto 4px;" />` : "";
  const isPaid = bill.status === "paid";
  const dateObj = new Date(bill.created_at || Date.now());
  const dateStr = dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const timeStr = dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const isTakeaway = String(bill.table_number || "").toLowerCase() === "takeaway" || String(bill.order_type || "").toLowerCase() === "takeaway";
  const rawTable = String(bill.table_number || "").trim();
  const tableText = isTakeaway ? "Takeaway" : (rawTable ? (rawTable.toUpperCase().startsWith("TABLE") ? rawTable : `Table ${rawTable}`) : "Dine-In");

  const totalVal = Number(bill.total || bill.subtotal || 0);
  const upiId = r.upi_id || r.upi || "8152075375-2@ybl";
  const merchant = r.merchant_name || r.name || "Restaurant";
  const upiUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(merchant)}&am=${totalVal.toFixed(2)}&cu=INR`;

  return `
    <!DOCTYPE html>
    <html><head><meta charset="utf-8" />
    <style>
      @page { margin: 3mm 3mm 15mm 3mm; }
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; color: #111; padding: 6px; padding-bottom: 20px; max-width: 290px; margin: 0 auto; font-size: 12px; line-height: 1.3; }
      .center { text-align: center; }
      .l { text-align: left; }
      .r { text-align: right; }
      h1 { font-size: 15px; margin: 2px 0; text-transform: uppercase; font-weight: 900; text-align: center; letter-spacing: 0.5px; }
      p.sub { font-size: 10.5px; color: #444; margin: 1px 0; text-align: center; }
      hr { border: none; border-top: 1px dashed #777; margin: 4px 0; }
      .meta { display: flex; justify-content: space-between; font-size: 11px; color: #333; margin: 2px 0; }
      table { width: 100%; border-collapse: collapse; margin-top: 3px; }
      th { font-size: 10.5px; font-weight: 800; border-bottom: 1px solid #222; padding: 2px 0; color: #111; text-transform: uppercase; }
      td { padding: 3px 0; font-size: 11.5px; }
      .total-row td { font-size: 14px; font-weight: 900; border-top: 1px solid #111; border-bottom: 1px solid #111; padding: 4px 0; }
      .status-pill { text-align: center; font-weight: 800; font-size: 11px; margin: 4px 0; padding: 2px 0; }
      .qr-block { text-align: center; margin: 5px 0; }
      .footer { text-align: center; margin-top: 5px; font-size: 10px; color: #666; font-weight: 600; }
    </style></head><body>
      ${logoBlock}
      <h1>${escapeHtml(r.name || "RESTAURANT")}</h1>
      ${r.address ? `<p class="sub">${escapeHtml(r.address)}</p>` : ""}
      ${r.phone ? `<p class="sub">Ph: ${escapeHtml(r.phone)}${r.phone2 && r.phone2 !== r.phone ? ` / ${escapeHtml(r.phone2)}` : ""}${r.gst ? ` | GST: ${escapeHtml(r.gst)}` : ""}</p>` : (r.gst ? `<p class="sub">GSTIN: ${escapeHtml(r.gst)}</p>` : "")}
      <hr />
      
      <div class="meta">
        <span>Bill: #${escapeHtml(bill.bill_number || (bill.id ? bill.id.slice(0, 6).toUpperCase() : "BILL"))}</span>
        <span>${escapeHtml(dateStr)} ${escapeHtml(timeStr)}</span>
      </div>
      <div class="meta">
        <span>${escapeHtml(tableText)}</span>
        <span>${bill.customer_name && bill.customer_name !== "Guest" ? escapeHtml(bill.customer_name) : ""}</span>
      </div>
      <hr />
      
      <table>
        <thead>
          <tr>
            <th class="l">ITEM</th>
            <th class="r" style="width: 36px;">QTY</th>
            <th class="r" style="width: 64px;">AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          ${items}
        </tbody>
      </table>
      <hr />
      
      <table>
        <tr>
          <td>Subtotal</td>
          <td class="r">${formatCurrency(bill.subtotal || 0)}</td>
        </tr>
        ${bill.discount && Number(bill.discount) > 0 ? `
          <tr>
            <td>Discount</td>
            <td class="r">-${formatCurrency(bill.discount)}</td>
          </tr>
        ` : ""}
        ${bill.gst_enabled && ((Number(bill.cgst || 0) + Number(bill.sgst || 0)) > 0) ? `
          <tr>
            <td>GST (Taxes)</td>
            <td class="r">${formatCurrency(Number(bill.cgst || 0) + Number(bill.sgst || 0))}</td>
          </tr>
        ` : ""}
        <tr class="total-row">
          <td>TOTAL</td>
          <td class="r">${formatCurrency(totalVal)}</td>
        </tr>
      </table>
      
      ${isPaid ? `
        <div class="status-pill">PAID (${(bill.payment_method || "CASH").toUpperCase()})</div>
      ` : (upiId ? `
        <div class="qr-block">
          <div style="font-size: 11px; font-weight: 800; margin-bottom: 2px;">Scan to Pay via UPI (${formatCurrency(totalVal)})</div>
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(upiUrl)}" style="width: 105px; height: 105px; display: block; margin: 4px auto;" />
          <div style="font-size: 10px; font-weight: 600; color: #444; margin-top: 2px;">${escapeHtml(upiId)}</div>
        </div>
      ` : "")}
      <hr />
      
      <p class="footer">Thank you! Visit again. · EzBill</p>
      <div style="height: 30px; width: 100%;"></div>
    </body></html>
  `;
}

export async function printBillLegacy(bill: any) {
  const html = billHtml(bill);
  if (Platform.OS === "web") {
    printViaIframe(html);
    return;
  }
  await Print.printAsync({ html });
}

export async function printKOTLegacy(order: any) {
  const html = kotHtml(order);
  if (Platform.OS === "web") {
    printViaIframe(html);
    return;
  }
  await Print.printAsync({ html });
}

export async function sharePdf(bill: any) {
  const html = billHtml(bill);
  if (Platform.OS === "web") {
    printViaIframe(html);
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
