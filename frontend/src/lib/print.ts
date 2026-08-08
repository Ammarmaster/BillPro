import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform, Alert } from "react-native";
import { storage } from "@/src/utils/storage";

let ThermalPrinterModule: any = null;
try {
  ThermalPrinterModule = require("react-native-thermal-printer").default;
} catch {}

const PRINTER_SETTINGS_PREFIX = "lumina_printer_settings_";

export interface PrinterSettings {
  type: "network" | "bluetooth" | "system" | "none";
  address: string; // IP for network, MAC for bluetooth
  port?: string;    // default 9100 for network
  name: string;
  width: 58 | 80;
  auto_print: boolean;
}

export function formatReceipt(data: any, width: number = 80, isKitchen: boolean = false): string {
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
    if (r.logo_base64) {
      lines.push(`[C]<img>data:image/jpeg;base64,${r.logo_base64}</img>\n`);
    }
    lines.push(`[C]<b><font size='big'>${r.name || "Restaurant"}</font></b>\n`);
    if (r.address) lines.push(`[C]${r.address}\n`);
    if (r.phone) lines.push(`[C]Ph: ${r.phone}\n`);
    if (r.gst) lines.push(`[C]GSTIN: ${r.gst}\n`);
    if (r.fssai) lines.push(`[C]FSSAI: ${r.fssai}\n`);
    lines.push(`[C]${divider}\n`);

    lines.push(`[L]Table: ${data.table_number || "-"}  ·  Bill #${data.id.slice(0, 8).toUpperCase()}\n`);
    lines.push(`[L]Date: ${new Date(data.created_at).toLocaleString()}\n`);
    lines.push(`[C]${divider}\n`);

    // Items list
    (data.items || []).forEach((it: any) => {
      const qtyText = `${it.quantity} x ${it.name}`;
      const priceText = `₹${(it.price * it.quantity).toFixed(2)}`;
      const spaces = maxChars - qtyText.length - priceText.length;
      if (spaces > 0) {
        lines.push(`[L]${qtyText}${" ".repeat(spaces)}${priceText}\n`);
      } else {
        lines.push(`[L]${qtyText}\n`);
        lines.push(`[R]${priceText}\n`);
      }
    });
    lines.push(`[C]${divider}\n`);

    // Totals
    const addRow = (lbl: string, val: number, isTotal = false) => {
      const valText = `₹${val.toFixed(2)}`;
      const spaces = maxChars - lbl.length - valText.length;
      const formattedLine = `[L]${lbl}${" ".repeat(Math.max(1, spaces))}${valText}\n`;
      if (isTotal) {
        lines.push(`[C]<b><font size='big'>${lbl}: ${valText}</font></b>\n`);
      } else {
        lines.push(formattedLine);
      }
    };

    addRow("Subtotal", data.subtotal);
    if (data.gst_enabled) {
      addRow("CGST", data.cgst);
      addRow("SGST", data.sgst);
    }
    if (data.discount) {
      addRow("Discount", -data.discount);
    }
    lines.push(`[C]${divider}\n`);
    addRow("TOTAL", data.total, true);
    lines.push(`[C]${divider}\n`);

    // UPI Payment QR code
    if (data.status === "pending" && r.upi_id) {
      const merchant = r.merchant_name || r.name || "Merchant";
      const upiUrl = `upi://pay?pa=${r.upi_id}&pn=${encodeURIComponent(merchant)}&am=${data.total.toFixed(2)}&cu=INR`;
      lines.push(`[C]Scan to Pay via UPI\n`);
      lines.push(`[C]<QRCode version='0' errorCorrectionLevel='3' magnification='5'>${upiUrl}</QRCode>\n`);
      lines.push(`[C]${divider}\n`);
    }

    lines.push(`[C]Thank you! Visit again.\n`);
    lines.push(`[C]\n\n\n`);
  }

  return lines.join("");
}

export async function savePrinterSettings(role: "cashier" | "kitchen", settings: PrinterSettings) {
  await storage.setItem(`${PRINTER_SETTINGS_PREFIX}${role}`, JSON.stringify(settings));
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

export async function printThermalDirect(role: "cashier" | "kitchen", data: any, isKitchen = false): Promise<boolean> {
  const settings = await getPrinterSettings(role);
  if (!settings || settings.type === "none" || settings.type === "system") {
    return false; // Fallback to system print sheet
  }

  const payload = formatReceipt(data, settings.width, isKitchen);
  
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
        ip: settings.address,
        port: parseInt(settings.port || "9100"),
        autoCut: true,
      });
      return true;
    } else if (settings.type === "bluetooth") {
      await ThermalPrinterModule.printBluetooth({
        payload,
        macAddress: settings.address,
      });
      return true;
    }
  } catch (e: any) {
    console.warn("Direct thermal printing failed:", e);
    Alert.alert(
      "Printer Offline",
      `Could not print to ${settings.name}. Fallback to standard print dialog?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Print Dialog", onPress: () => printBillLegacy(data) }
      ]
    );
    return true; // Alert handled, so return true to bypass automatic legacy print triggering twice
  }

  return false;
}

export async function printBill(bill: any) {
  const handled = await printThermalDirect("cashier", bill, false);
  if (!handled) {
    await printBillLegacy(bill);
  }
}

export async function printKitchenKOT(order: any) {
  const handled = await printThermalDirect("kitchen", order, true);
  if (!handled) {
    await printBillLegacy(order);
  }
}

function escapeHtml(s: string) {
  return String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function money(n: number) { return `₹${n.toFixed(2)}`; }

function billHtml(bill: any): string {
  const r = bill.restaurant_snapshot || {};
  const items = (bill.items || []).map(
    (it: any) => `
      <tr>
        <td>${it.quantity} × ${escapeHtml(it.name)}</td>
        <td class="r">${money(it.price * it.quantity)}</td>
      </tr>`
  ).join("");

  const logoBlock = r.logo_base64
    ? `<img class="logo" src="data:image/jpeg;base64,${r.logo_base64}" />`
    : `<div class="logo-fallback">${(r.name || "L").charAt(0).toUpperCase()}</div>`;

  return `
    <html><head><meta charset="utf-8" />
    <style>
      body { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color:#111; padding:24px; max-width:380px; margin:0 auto; }
      .center { text-align:center; }
      .r { text-align:right; }
      .logo { width:64px; height:64px; object-fit:cover; border-radius:12px; }
      .logo-fallback { width:64px; height:64px; border-radius:12px; background:#D4AF37; color:#0D0D0D; display:flex; align-items:center; justify-content:center; font-size:32px; font-weight:700; margin:0 auto; }
      h1 { font-size:20px; margin:8px 0 2px; }
      p.small { font-size:11px; color:#555; margin:2px 0; }
      table { width:100%; border-collapse:collapse; margin-top:12px; }
      td { padding:4px 0; font-size:13px; }
      hr { border:none; border-top:1px dashed #999; margin:8px 0; }
      .total { font-size:18px; font-weight:700; }
      .footer { text-align:center; margin-top:16px; font-size:11px; color:#666; }
    </style></head><body>
      <div class="center">${logoBlock}</div>
      <h1 class="center">${escapeHtml(r.name || "Restaurant")}</h1>
      ${r.address ? `<p class="small center">${escapeHtml(r.address)}</p>` : ""}
      ${r.phone ? `<p class="small center">Ph: ${escapeHtml(r.phone)}</p>` : ""}
      ${r.gst ? `<p class="small center">GSTIN: ${escapeHtml(r.gst)}</p>` : ""}
      ${r.fssai ? `<p class="small center">FSSAI: ${escapeHtml(r.fssai)}</p>` : ""}
      <hr />
      <p class="small">Table: ${escapeHtml(bill.table_number || "-")}  ·  Bill #${bill.id ? bill.id.slice(0, 8).toUpperCase() : "KOT"}</p>
      <p class="small">${new Date(bill.created_at || Date.now()).toLocaleString()}</p>
      <hr />
      <table>${items}</table>
      <hr />
      <table>
        <tr><td>Subtotal</td><td class="r">${money(bill.subtotal || 0)}</td></tr>
        ${bill.gst_enabled ? `
          <tr><td>CGST</td><td class="r">${money(bill.cgst || 0)}</td></tr>
          <tr><td>SGST</td><td class="r">${money(bill.sgst || 0)}</td></tr>
        ` : ""}
        ${bill.discount ? `<tr><td>Discount</td><td class="r">-${money(bill.discount)}</td></tr>` : ""}
        <tr><td class="total">TOTAL</td><td class="r total">${money(bill.total || 0)}</td></tr>
      </table>
      <hr />
      <p class="footer">Status: ${(bill.status || "").toUpperCase()}</p>
      <p class="footer">Thank you! Visit again.</p>
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
