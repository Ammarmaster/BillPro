import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { storage } from "@/src/utils/storage";

const PRINTER_KEY = "lumina_printer_url";

function money(n: number) { return `₹${n.toFixed(2)}`; }

function billHtml(bill: any): string {
  const r = bill.restaurant_snapshot || {};
  const items = (bill.items || []).map(
    (it: any) => `
      <tr>
        <td>${it.quantity} × ${escape(it.name)}</td>
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
      <h1 class="center">${escape(r.name || "Restaurant")}</h1>
      ${r.address ? `<p class="small center">${escape(r.address)}</p>` : ""}
      ${r.phone ? `<p class="small center">Ph: ${escape(r.phone)}</p>` : ""}
      ${r.gst ? `<p class="small center">GSTIN: ${escape(r.gst)}</p>` : ""}
      ${r.fssai ? `<p class="small center">FSSAI: ${escape(r.fssai)}</p>` : ""}
      <hr />
      <p class="small">Table: ${escape(bill.table_number || "-")}  ·  Bill #${bill.id.slice(0, 8).toUpperCase()}</p>
      <p class="small">${new Date(bill.created_at).toLocaleString()}</p>
      <hr />
      <table>${items}</table>
      <hr />
      <table>
        <tr><td>Subtotal</td><td class="r">${money(bill.subtotal)}</td></tr>
        ${bill.gst_enabled ? `
          <tr><td>CGST</td><td class="r">${money(bill.cgst)}</td></tr>
          <tr><td>SGST</td><td class="r">${money(bill.sgst)}</td></tr>
        ` : ""}
        ${bill.discount ? `<tr><td>Discount</td><td class="r">-${money(bill.discount)}</td></tr>` : ""}
        <tr><td class="total">TOTAL</td><td class="r total">${money(bill.total)}</td></tr>
      </table>
      <hr />
      <p class="footer">Status: ${(bill.status || "").toUpperCase()}</p>
      <p class="footer">Thank you! Visit again.</p>
    </body></html>
  `;
}

function escape(s: string) {
  return String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export async function selectDefaultPrinter(): Promise<string | null> {
  if (Platform.OS !== "ios") return null;
  try {
    const res = await Print.selectPrinterAsync();
    if (res?.url) {
      await storage.setItem(PRINTER_KEY, res.url);
      return res.url;
    }
  } catch { /* user cancelled */ }
  return null;
}

export async function getDefaultPrinter(): Promise<string | null> {
  return await storage.getItem<string>(PRINTER_KEY, "");
}

export async function clearDefaultPrinter() {
  await storage.removeItem(PRINTER_KEY);
}

export async function printBill(bill: any) {
  const html = billHtml(bill);
  if (Platform.OS === "web") {
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); w.focus(); w.print(); }
    return;
  }
  if (Platform.OS === "ios") {
    // One-tap thermal print: reuse saved printer URL. First run prompts a picker.
    let printerUrl = await getDefaultPrinter();
    if (!printerUrl) {
      printerUrl = await selectDefaultPrinter();
    }
    if (printerUrl) {
      try {
        await Print.printAsync({ html, printerUrl });
        return;
      } catch (e: any) {
        // Fall through to the standard print sheet if the saved printer is unavailable
        await clearDefaultPrinter();
      }
    }
  }
  await Print.printAsync({ html });
}

export async function sharePdf(bill: any) {
  const html = billHtml(bill);
  if (Platform.OS === "web") {
    // Web fallback: trigger browser print dialog (user can save as PDF)
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); w.focus(); w.print(); }
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Share Bill" });
  }
}
