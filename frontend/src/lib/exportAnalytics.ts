import { Platform, Share } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

export interface RestaurantGSTProfile {
  name?: string;
  owner_name?: string;
  address?: string;
  phone?: string;
  phone2?: string;
  gst?: string;
  gst_enabled?: boolean;
  gst_rate?: string | number;
  fssai?: string;
}

function downloadWebFile(content: string, filename: string, mimeType: string) {
  if (typeof document !== "undefined") {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

async function saveAndShareMobileFile(
  filename: string,
  content: string,
  mimeType: string,
  uti?: string,
  dialogTitle?: string
) {
  let fileUri = "";

  // 1. Modern Expo SDK FileSystem API
  try {
    const { File, Paths } = require("expo-file-system");
    if (Paths && Paths.cache && typeof File === "function") {
      const file = new File(Paths.cache, filename);
      try {
        if (file.exists) {
          file.delete();
        }
      } catch (_) {}
      file.create({ overwrite: true });
      file.write(content);
      fileUri = file.uri;
    }
  } catch (err) {
    console.warn("[Export] Modern FileSystem File API not available, trying legacy fallback:", err);
  }

  // 2. Legacy FileSystem API Fallback
  if (!fileUri) {
    try {
      const FileSystem = require("expo-file-system/src/legacy/FileSystem");
      const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory || "";
      if (baseDir) {
        fileUri = `${baseDir}${filename}`;
        await FileSystem.writeAsStringAsync(fileUri, content, {
          encoding: FileSystem.EncodingType?.UTF8 || "utf8",
        });
      }
    } catch (legacyErr) {
      console.warn("[Export] Legacy FileSystem write failed:", legacyErr);
    }
  }

  // 3. Share the saved file via native sharing dialog
  if (fileUri) {
    if (await Sharing.isAvailableAsync()) {
      try {
        await Sharing.shareAsync(fileUri, {
          mimeType,
          dialogTitle: dialogTitle || `Share ${filename}`,
          UTI: uti,
        });
        return;
      } catch (shareErr) {
        console.warn("[Export] Sharing.shareAsync failed, trying fallback:", shareErr);
      }
    }
  }

  // 4. Ultimate fallback to standard React Native Share
  try {
    await Share.share({
      title: filename,
      message: content,
      url: Platform.OS === "ios" && fileUri ? fileUri : undefined,
    });
  } catch (shareFallbackErr) {
    console.warn("[Export] Share fallback failed:", shareFallbackErr);
  }
}

function getPeriodTitle(period: string): string {
  switch (period) {
    case "today":
      return "Today's GST Sales Report";
    case "yesterday":
      return "Yesterday's GST Sales Report";
    case "7days":
      return "7-Day GST Sales & Tax Report";
    case "monthly":
      return "Monthly GST Return & Sales Summary";
    case "yearly":
      return "Annual GST Financial Report";
    case "custom":
      return "Custom Period GST Sales Report";
    default:
      return "GST Sales & Tax Audit Report";
  }
}

// Compute comprehensive GST and transaction metrics
function computeGstMetrics(bills: any[]) {
  let totalInvoices = 0;
  let totalGross = 0;
  let totalDiscounts = 0;
  let totalTaxable = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalTax = 0;
  let totalGrand = 0;

  const paymentBreakdown: Record<string, { total: number; count: number }> = {
    CASH: { total: 0, count: 0 },
    UPI: { total: 0, count: 0 },
    CARD: { total: 0, count: 0 },
    OTHER: { total: 0, count: 0 },
  };

  (bills || []).forEach(b => {
    if (!b) return;
    const isPaid = b.status === "paid" || b.status === "PAID" || !b.status;
    if (!isPaid) return;

    totalInvoices++;
    const subtotal = Number(b.subtotal ?? b.total ?? 0);
    const discount = Number(b.discount ?? 0);
    const taxable = Math.max(0, subtotal - discount);

    let cgst = Number(b.cgst ?? 0);
    let sgst = Number(b.sgst ?? 0);
    let tax = Number(b.tax ?? b.total_tax ?? 0);

    if (tax > 0 && cgst === 0 && sgst === 0) {
      cgst = Math.round((tax / 2) * 100) / 100;
      sgst = Math.round((tax / 2) * 100) / 100;
    } else if (cgst > 0 || sgst > 0) {
      tax = cgst + sgst;
    }

    const total = Number(b.total ?? taxable + tax);

    totalGross += subtotal;
    totalDiscounts += discount;
    totalTaxable += taxable;
    totalCgst += cgst;
    totalSgst += sgst;
    totalTax += tax;
    totalGrand += total;

    const rawMode = String(b.payment_method || "UPI").toUpperCase();
    if (rawMode.includes("CASH")) {
      paymentBreakdown.CASH.total += total;
      paymentBreakdown.CASH.count++;
    } else if (rawMode.includes("CARD")) {
      paymentBreakdown.CARD.total += total;
      paymentBreakdown.CARD.count++;
    } else if (rawMode.includes("UPI") || rawMode.includes("QR") || rawMode.includes("ONLINE")) {
      paymentBreakdown.UPI.total += total;
      paymentBreakdown.UPI.count++;
    } else {
      paymentBreakdown.OTHER.total += total;
      paymentBreakdown.OTHER.count++;
    }
  });

  return {
    totalInvoices,
    totalGross: Math.round(totalGross * 100) / 100,
    totalDiscounts: Math.round(totalDiscounts * 100) / 100,
    totalTaxable: Math.round(totalTaxable * 100) / 100,
    totalCgst: Math.round(totalCgst * 100) / 100,
    totalSgst: Math.round(totalSgst * 100) / 100,
    totalTax: Math.round(totalTax * 100) / 100,
    totalGrand: Math.round(totalGrand * 100) / 100,
    paymentBreakdown,
  };
}

export async function exportAnalyticsPDF(
  period: string,
  heroRev: number,
  totalOrders: number,
  avgBill: number,
  upiPct: number,
  cashPct: number,
  bills: any[],
  topDishes: any[],
  restaurant?: RestaurantGSTProfile | null
) {
  const periodTitle = getPeriodTitle(period);
  const gstMetrics = computeGstMetrics(bills);

  const restName = restaurant?.name || "EzBill Restaurant";
  const restGst = restaurant?.gst ? restaurant.gst.toUpperCase() : "Unregistered / Composition";
  const restFssai = restaurant?.fssai || "N/A";
  const restAddress = restaurant?.address || "Registered Premises";
  const restPhone = restaurant?.phone || "";

  const dishRows = (topDishes || [])
    .map(
      d => `
    <tr>
      <td style="padding: 9px 12px; border-bottom: 1px solid #E2E8F0; font-weight: 600; font-size: 11px;">${d.name || "Item"}</td>
      <td style="padding: 9px 12px; border-bottom: 1px solid #E2E8F0; text-align: center; font-size: 11px; color: #64748B;">9963</td>
      <td style="padding: 9px 12px; border-bottom: 1px solid #E2E8F0; text-align: center; font-size: 11px;">${d.sold || 1} units</td>
      <td style="padding: 9px 12px; border-bottom: 1px solid #E2E8F0; text-align: right; font-weight: bold; color: #635BFF; font-size: 11px;">₹${(d.amt || 0).toLocaleString()}</td>
    </tr>
  `
    )
    .join("");

  const billRows = (bills || [])
    .slice(0, 150)
    .map(b => {
      const subtotal = Number(b?.subtotal ?? b?.total ?? 0);
      const discount = Number(b?.discount ?? 0);
      const taxable = Math.max(0, subtotal - discount);
      let cgst = Number(b?.cgst ?? 0);
      let sgst = Number(b?.sgst ?? 0);
      let tax = Number(b?.tax ?? b?.total_tax ?? 0);
      if (tax > 0 && cgst === 0 && sgst === 0) {
        cgst = Math.round((tax / 2) * 100) / 100;
        sgst = Math.round((tax / 2) * 100) / 100;
      }
      const total = Number(b?.total ?? taxable + tax);
      const billId = (b?.id || b?._id || "BILL").slice(-6).toUpperCase();
      const date = b?.created_at ? new Date(b.created_at).toLocaleDateString() : new Date().toLocaleDateString();

      return `
      <tr>
        <td style="padding: 7px 10px; border-bottom: 1px solid #F1F5F9; font-size: 10.5px; font-weight: bold;">#${billId}</td>
        <td style="padding: 7px 10px; border-bottom: 1px solid #F1F5F9; font-size: 10.5px; color: #475569;">${date}</td>
        <td style="padding: 7px 10px; border-bottom: 1px solid #F1F5F9; font-size: 10.5px; text-transform: uppercase;">${b?.payment_method || "UPI"}</td>
        <td style="padding: 7px 10px; border-bottom: 1px solid #F1F5F9; font-size: 10.5px; text-align: right;">₹${taxable.toFixed(2)}</td>
        <td style="padding: 7px 10px; border-bottom: 1px solid #F1F5F9; font-size: 10.5px; text-align: right; color: #475569;">₹${cgst.toFixed(2)}</td>
        <td style="padding: 7px 10px; border-bottom: 1px solid #F1F5F9; font-size: 10.5px; text-align: right; color: #475569;">₹${sgst.toFixed(2)}</td>
        <td style="padding: 7px 10px; border-bottom: 1px solid #F1F5F9; font-size: 10.5px; text-align: right; font-weight: bold; color: #0F172A;">₹${total.toFixed(2)}</td>
      </tr>
    `;
    })
    .join("");

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${periodTitle}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 20px; color: #0F172A; background: #FFFFFF; font-size: 12px; }
          .header-box { border-bottom: 2.5px solid #635BFF; padding-bottom: 14px; margin-bottom: 20px; }
          .title-row { display: flex; justify-content: space-between; align-items: flex-start; }
          .restaurant-name { font-size: 22px; font-weight: 900; color: #635BFF; margin: 0; text-transform: uppercase; letter-spacing: 0.5px; }
          .doc-badge { background: #EEF2FF; border: 1px solid #C7D2FE; color: #4338CA; font-weight: 800; font-size: 10px; padding: 4px 10px; border-radius: 6px; text-transform: uppercase; }
          .meta-info { margin-top: 6px; font-size: 11px; color: #475569; line-height: 1.5; }
          .gstin-pill { font-weight: 800; color: #0F172A; }
          
          .grid-summary { display: flex; flex-direction: row; gap: 12px; margin-bottom: 20px; }
          .card { flex: 1; background: #F8FAFC; border: 1.5px solid #E2E8F0; border-radius: 12px; padding: 12px 14px; text-align: center; }
          .card-lbl { font-size: 9.5px; color: #64748B; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; }
          .card-val { font-size: 17px; font-weight: 900; color: #0F172A; margin-top: 3px; }
          
          .gst-box { background: #FAF5FF; border: 1.5px solid #E9D5FF; border-radius: 12px; padding: 14px; margin-bottom: 20px; }
          .gst-box-title { font-size: 12px; font-weight: 900; color: #7E22CE; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; display: flex; justify-content: space-between; }
          .gst-table { width: 100%; border-collapse: collapse; }
          .gst-table td { padding: 6px 8px; font-size: 11px; border-bottom: 1px solid #F3E8FF; }
          .gst-table tr:last-child td { border-bottom: none; font-weight: bold; font-size: 12px; color: #581C87; }
          
          table.data-table { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 20px; }
          table.data-table th { background: #635BFF; color: #FFFFFF; text-align: left; padding: 8px 10px; font-size: 10.5px; font-weight: 800; text-transform: uppercase; }
          .section-title { font-size: 13px; font-weight: 900; color: #0F172A; margin-top: 18px; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.4px; }
          
          .payment-row { display: flex; gap: 10px; margin-bottom: 18px; }
          .pay-card { flex: 1; border: 1px solid #E2E8F0; border-radius: 10px; padding: 10px; background: #FFFFFF; }
          .pay-mode { font-size: 10px; font-weight: 800; color: #64748B; text-transform: uppercase; }
          .pay-val { font-size: 14px; font-weight: 900; color: #0F172A; margin-top: 2px; }
          
          .footer { margin-top: 30px; text-align: center; font-size: 10px; color: #94A3B8; border-top: 1px solid #E2E8F0; padding-top: 12px; line-height: 1.5; }
        </style>
      </head>
      <body>
        <div class="header-box">
          <div class="title-row">
            <div>
              <div class="restaurant-name">${restName}</div>
              <div class="meta-info">
                GSTIN: <span class="gstin-pill">${restGst}</span> &nbsp;|&nbsp; FSSAI: ${restFssai}<br/>
                ${restAddress} ${restPhone ? `&nbsp;|&nbsp; Ph: ${restPhone}` : ""}<br/>
                <strong>Report:</strong> ${periodTitle} &nbsp;|&nbsp; <strong>Generated:</strong> ${new Date().toLocaleString()}
              </div>
            </div>
            <div class="doc-badge">CA / GST Filing Summary</div>
          </div>
        </div>

        <!-- 4 Key Financial KPIs -->
        <div class="grid-summary">
          <div class="card">
            <div class="card-lbl">Total Taxable Turnover</div>
            <div class="card-val" style="color: #635BFF;">₹${gstMetrics.totalTaxable.toLocaleString()}</div>
          </div>
          <div class="card">
            <div class="card-lbl">Total GST Collected</div>
            <div class="card-val" style="color: #10B981;">₹${gstMetrics.totalTax.toLocaleString()}</div>
          </div>
          <div class="card">
            <div class="card-lbl">Gross Invoiced Value</div>
            <div class="card-val">₹${gstMetrics.totalGrand.toLocaleString()}</div>
          </div>
          <div class="card">
            <div class="card-lbl">Settled Invoices</div>
            <div class="card-val">${gstMetrics.totalInvoices}</div>
          </div>
        </div>

        <!-- Official GST Tax Computation Box for CA -->
        <div class="gst-box">
          <div class="gst-box-title">
            <span>GST Output Tax Computation (SAC 9963 - Food & Beverage Service)</span>
            <span>Rate: 5% (2.5% CGST + 2.5% SGST)</span>
          </div>
          <table class="gst-table">
            <tr>
              <td><strong>Taxable Value (Turnover subject to GST)</strong></td>
              <td style="text-align: right;">₹${gstMetrics.totalTaxable.toFixed(2)}</td>
            </tr>
            <tr>
              <td>Central GST Output Tax (CGST @ 2.5%)</td>
              <td style="text-align: right;">₹${gstMetrics.totalCgst.toFixed(2)}</td>
            </tr>
            <tr>
              <td>State GST Output Tax (SGST @ 2.5%)</td>
              <td style="text-align: right;">₹${gstMetrics.totalSgst.toFixed(2)}</td>
            </tr>
            <tr>
              <td>Total Discounts Allowed</td>
              <td style="text-align: right; color: #DC2626;">- ₹${gstMetrics.totalDiscounts.toFixed(2)}</td>
            </tr>
            <tr>
              <td><strong>Net Revenue / Total Invoice Value (Taxable + GST)</strong></td>
              <td style="text-align: right; font-weight: 900;">₹${gstMetrics.totalGrand.toFixed(2)}</td>
            </tr>
          </table>
        </div>

        <!-- Payment Mode Reconciliation -->
        <div class="section-title">Payment Mode & Bank Reconciliation</div>
        <div class="payment-row">
          <div class="pay-card">
            <div class="pay-mode">Cash Payments</div>
            <div class="pay-val">₹${gstMetrics.paymentBreakdown.CASH.total.toFixed(2)}</div>
            <div style="font-size: 9.5px; color: #64748B;">${gstMetrics.paymentBreakdown.CASH.count} invoices</div>
          </div>
          <div class="pay-card">
            <div class="pay-mode">UPI / Online QR</div>
            <div class="pay-val" style="color: #635BFF;">₹${gstMetrics.paymentBreakdown.UPI.total.toFixed(2)}</div>
            <div style="font-size: 9.5px; color: #64748B;">${gstMetrics.paymentBreakdown.UPI.count} invoices</div>
          </div>
          <div class="pay-card">
            <div class="pay-mode">Card POS</div>
            <div class="pay-val">₹${gstMetrics.paymentBreakdown.CARD.total.toFixed(2)}</div>
            <div style="font-size: 9.5px; color: #64748B;">${gstMetrics.paymentBreakdown.CARD.count} invoices</div>
          </div>
        </div>

        <!-- Menu Items HSN/SAC Breakdown -->
        <div class="section-title">Food & Beverage Sales by SAC (SAC 9963)</div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Menu Item</th>
              <th style="text-align: center;">SAC</th>
              <th style="text-align: center;">Quantity</th>
              <th style="text-align: right;">Taxable Amount (INR)</th>
            </tr>
          </thead>
          <tbody>
            ${dishRows || '<tr><td colspan="4" style="text-align:center; padding:12px; color:#64748B;">No menu item transactions recorded for this period</td></tr>'}
          </tbody>
        </table>

        <!-- Tax Invoice Register Table -->
        <div class="section-title">Invoice-wise Tax Register (Audit Trail)</div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Date</th>
              <th>Mode</th>
              <th style="text-align: right;">Taxable</th>
              <th style="text-align: right;">CGST</th>
              <th style="text-align: right;">SGST</th>
              <th style="text-align: right;">Invoice Total</th>
            </tr>
          </thead>
          <tbody>
            ${billRows || '<tr><td colspan="7" style="text-align:center; padding:12px; color:#64748B;">No completed bills found for this period</td></tr>'}
          </tbody>
        </table>

        <div class="footer">
          Generated via EzBill Restaurant ERP for Statutory GST Compliance & CA Audit (GSTR-1 & GSTR-3B).<br/>
          Confidential Tax Record • Page 1
        </div>
      </body>
    </html>
  `;

  if (Platform.OS === "web") {
    const filename = `gst_sales_report_${period}_${Date.now()}.html`;
    downloadWebFile(html, filename, "text/html;charset=utf-8;");
    try {
      await Print.printAsync({ html });
    } catch {}
  } else {
    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: `Share ${periodTitle} PDF (CA Filing)`,
      });
    }
  }
}

export async function exportAnalyticsExcel(
  period: string,
  bills: any[],
  topDishes: any[],
  restaurant?: RestaurantGSTProfile | null
) {
  const periodTitle = getPeriodTitle(period);
  const gstMetrics = computeGstMetrics(bills);

  const restName = restaurant?.name || "EzBill Restaurant";
  const restGst = restaurant?.gst ? restaurant.gst.toUpperCase() : "Unregistered / Composition";
  const restFssai = restaurant?.fssai || "N/A";
  const restAddress = restaurant?.address || "Registered Premises";
  const restPhone = restaurant?.phone || "";

  let csv = "EZBILL RESTAURANT ERP - GST SALES & TAX AUDIT REPORT\n";
  csv += `Business Name,"${restName.replace(/"/g, '""')}"\n`;
  csv += `GSTIN,"${restGst.replace(/"/g, '""')}"\n`;
  csv += `FSSAI License,"${restFssai.replace(/"/g, '""')}"\n`;
  csv += `Address,"${restAddress.replace(/"/g, '""')}"\n`;
  csv += `Contact Phone,"${restPhone.replace(/"/g, '""')}"\n`;
  csv += `Reporting Period,"${periodTitle}"\n`;
  csv += `Generated Date,"${new Date().toLocaleString()}"\n\n`;

  // 1. GST Summary for CA
  csv += "=== GST TAX SUMMARY FOR GSTR-1 / GSTR-3B FILING (SAC 9963) ===\n";
  csv += "Description,Amount (INR),Notes\n";
  csv += `Total Settled Tax Invoices,${gstMetrics.totalInvoices},Number of completed sales bills\n`;
  csv += `Total Gross Sales,${gstMetrics.totalGross.toFixed(2)},Gross bill value before discounts\n`;
  csv += `Total Discounts Allowed,${gstMetrics.totalDiscounts.toFixed(2)},Discounts provided to customers\n`;
  csv += `Total Taxable Turnover,${gstMetrics.totalTaxable.toFixed(2)},Taxable value subject to GST\n`;
  csv += `Central GST (CGST @ 2.5%),${gstMetrics.totalCgst.toFixed(2)},Central tax liability\n`;
  csv += `State GST (SGST @ 2.5%),${gstMetrics.totalSgst.toFixed(2)},State tax liability\n`;
  csv += `Total GST Output Tax Collected,${gstMetrics.totalTax.toFixed(2)},Total GST payable\n`;
  csv += `Gross Invoiced Turnover (Net Revenue),${gstMetrics.totalGrand.toFixed(2)},Final revenue inclusive of GST\n\n`;

  // 2. Payment Channel Reconciliation
  csv += "=== PAYMENT CHANNEL & BANK RECONCILIATION ===\n";
  csv += "Payment Mode,Invoice Count,Total Collected (INR)\n";
  csv += `CASH,${gstMetrics.paymentBreakdown.CASH.count},${gstMetrics.paymentBreakdown.CASH.total.toFixed(2)}\n`;
  csv += `UPI / QR ONLINE,${gstMetrics.paymentBreakdown.UPI.count},${gstMetrics.paymentBreakdown.UPI.total.toFixed(2)}\n`;
  csv += `CARD POS,${gstMetrics.paymentBreakdown.CARD.count},${gstMetrics.paymentBreakdown.CARD.total.toFixed(2)}\n`;
  csv += `OTHER / SPLIT,${gstMetrics.paymentBreakdown.OTHER.count},${gstMetrics.paymentBreakdown.OTHER.total.toFixed(2)}\n\n`;

  // 3. Item-wise Sales
  csv += "=== MENU ITEM SALES SUMMARY (SAC 9963) ===\n";
  csv += "Item Name,SAC Code,Quantity Sold,Total Revenue (INR)\n";
  (topDishes || []).forEach(d => {
    const safeName = String(d.name || "Item").replace(/"/g, '""');
    csv += `"${safeName}",9963,${d.sold || 1},${(d.amt || 0).toFixed(2)}\n`;
  });

  // 4. Detailed Invoice Register
  csv += "\n=== DETAILED TAX INVOICE REGISTER (CA AUDIT LOG) ===\n";
  csv += "Invoice No,Date,Table,Payment Mode,Status,Gross Subtotal (INR),Discount (INR),Taxable Turnover (INR),CGST (INR),SGST (INR),Total GST (INR),Invoice Grand Total (INR)\n";
  (bills || []).forEach(b => {
    const billId = (b?.id || b?._id || "BILL").slice(-6).toUpperCase();
    const date = b?.created_at ? new Date(b.created_at).toLocaleString() : new Date().toLocaleString();
    const table = String(b?.table_number || "-").replace(/"/g, '""');
    const safeMethod = String(b?.payment_method || "UPI").replace(/"/g, '""');
    const safeStatus = String(b?.status || "paid").replace(/"/g, '""');

    const subtotal = Number(b?.subtotal ?? b?.total ?? 0);
    const discount = Number(b?.discount ?? 0);
    const taxable = Math.max(0, subtotal - discount);

    let cgst = Number(b?.cgst ?? 0);
    let sgst = Number(b?.sgst ?? 0);
    let tax = Number(b?.tax ?? b?.total_tax ?? 0);
    if (tax > 0 && cgst === 0 && sgst === 0) {
      cgst = Math.round((tax / 2) * 100) / 100;
      sgst = Math.round((tax / 2) * 100) / 100;
    }
    const total = Number(b?.total ?? taxable + tax);

    csv += `"#${billId}","${date}","${table}","${safeMethod}","${safeStatus}",${subtotal.toFixed(2)},${discount.toFixed(2)},${taxable.toFixed(2)},${cgst.toFixed(2)},${sgst.toFixed(2)},${tax.toFixed(2)},${total.toFixed(2)}\n`;
  });

  const filename = `gst_sales_report_${period}_${Date.now()}.csv`;
  const utf8Csv = "\uFEFF" + csv; // UTF-8 BOM ensures Excel natively opens Indian Rupee and column characters

  if (Platform.OS === "web") {
    downloadWebFile(utf8Csv, filename, "text/csv;charset=utf-8;");
  } else {
    await saveAndShareMobileFile(
      filename,
      utf8Csv,
      "text/csv",
      "public.comma-separated-values-text",
      "Export Excel GST Sales Report (CA Ready)"
    );
  }
}

export async function exportAnalyticsDocx(
  period: string,
  heroRev: number,
  totalOrders: number,
  avgBill: number,
  bills: any[],
  topDishes: any[],
  restaurant?: RestaurantGSTProfile | null
) {
  const periodTitle = getPeriodTitle(period);
  const gstMetrics = computeGstMetrics(bills);

  const restName = restaurant?.name || "EzBill Restaurant";
  const restGst = restaurant?.gst ? restaurant.gst.toUpperCase() : "Unregistered / Composition";
  const restFssai = restaurant?.fssai || "N/A";
  const restAddress = restaurant?.address || "Registered Premises";
  const restPhone = restaurant?.phone || "";

  const dishRows = (topDishes || [])
    .map(
      d => `
    <tr>
      <td style="padding: 7pt; border: 1pt solid #E2E8F0; font-weight: 600; font-size: 9.5pt;">${d.name || "Item"}</td>
      <td style="padding: 7pt; border: 1pt solid #E2E8F0; text-align: center; font-size: 9.5pt; color: #64748B;">9963</td>
      <td style="padding: 7pt; border: 1pt solid #E2E8F0; text-align: center; font-size: 9.5pt;">${d.sold || 1} units</td>
      <td style="padding: 7pt; border: 1pt solid #E2E8F0; text-align: right; font-weight: bold; color: #635BFF; font-size: 9.5pt;">₹${(d.amt || 0).toLocaleString()}</td>
    </tr>
  `
    )
    .join("");

  const billRows = (bills || [])
    .slice(0, 150)
    .map(b => {
      const subtotal = Number(b?.subtotal ?? b?.total ?? 0);
      const discount = Number(b?.discount ?? 0);
      const taxable = Math.max(0, subtotal - discount);
      let cgst = Number(b?.cgst ?? 0);
      let sgst = Number(b?.sgst ?? 0);
      let tax = Number(b?.tax ?? b?.total_tax ?? 0);
      if (tax > 0 && cgst === 0 && sgst === 0) {
        cgst = Math.round((tax / 2) * 100) / 100;
        sgst = Math.round((tax / 2) * 100) / 100;
      }
      const total = Number(b?.total ?? taxable + tax);
      const billId = (b?.id || b?._id || "BILL").slice(-6).toUpperCase();
      const date = b?.created_at ? new Date(b.created_at).toLocaleDateString() : new Date().toLocaleDateString();

      return `
      <tr>
        <td style="padding: 6pt; border: 1pt solid #E2E8F0; font-size: 9pt; font-weight: bold;">#${billId}</td>
        <td style="padding: 6pt; border: 1pt solid #E2E8F0; font-size: 9pt; color: #475569;">${date}</td>
        <td style="padding: 6pt; border: 1pt solid #E2E8F0; font-size: 9pt; text-transform: uppercase;">${b?.payment_method || "UPI"}</td>
        <td style="padding: 6pt; border: 1pt solid #E2E8F0; font-size: 9pt; text-align: right;">₹${taxable.toFixed(2)}</td>
        <td style="padding: 6pt; border: 1pt solid #E2E8F0; font-size: 9pt; text-align: right;">₹${cgst.toFixed(2)}</td>
        <td style="padding: 6pt; border: 1pt solid #E2E8F0; font-size: 9pt; text-align: right;">₹${sgst.toFixed(2)}</td>
        <td style="padding: 6pt; border: 1pt solid #E2E8F0; font-size: 9pt; text-align: right; font-weight: bold; color: #0F172A;">₹${total.toFixed(2)}</td>
      </tr>
    `;
    })
    .join("");

  const docHtml = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>${periodTitle}</title>
        <!--[if gte mso 9]>
        <xml>
          <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
            <w:DoNotOptimizeForBrowser/>
          </w:WordDocument>
        </xml>
        <![endif]-->
        <style>
          body { font-family: 'Calibri', 'Arial', sans-serif; font-size: 11pt; color: #1E293B; margin: 20pt; }
          h1 { color: #635BFF; font-size: 20pt; text-transform: uppercase; margin-bottom: 2pt; }
          .business-meta { color: #475569; font-size: 10pt; line-height: 1.4; margin-bottom: 16pt; }
          .subtitle { color: #635BFF; font-size: 13pt; font-weight: bold; margin-bottom: 14pt; border-bottom: 1.5pt solid #635BFF; padding-bottom: 4pt; }
          
          table.kpi-table { width: 100%; border-collapse: collapse; margin-bottom: 16pt; }
          td.kpi-card { background: #F8FAFC; border: 1.5pt solid #CBD5E1; padding: 12pt; text-align: center; width: 25%; }
          .kpi-val { font-size: 14pt; font-weight: bold; color: #0F172A; margin-top: 3pt; }
          .kpi-lbl { font-size: 8.5pt; color: #64748B; font-weight: bold; text-transform: uppercase; }
          
          table.gst-table { width: 100%; border-collapse: collapse; background: #FAF5FF; border: 1.5pt solid #E9D5FF; margin-bottom: 18pt; }
          table.gst-table td { padding: 8pt 10pt; font-size: 10pt; border-bottom: 1pt solid #F3E8FF; }
          
          table.data-table { width: 100%; border-collapse: collapse; margin-top: 6pt; margin-bottom: 16pt; }
          table.data-table th { background: #635BFF; color: #FFFFFF; font-weight: bold; padding: 7pt 9pt; text-align: left; font-size: 9.5pt; border: 1pt solid #635BFF; }
          table.data-table td { padding: 6pt 9pt; border: 1pt solid #E2E8F0; font-size: 9.5pt; }
          .section-head { font-size: 12pt; font-weight: bold; color: #0F172A; margin-top: 16pt; margin-bottom: 4pt; }
          .footer { margin-top: 25pt; font-size: 8.5pt; color: #94A3B8; text-align: center; border-top: 1pt solid #E2E8F0; padding-top: 8pt; }
        </style>
      </head>
      <body>
        <h1>${restName}</h1>
        <div class="business-meta">
          <strong>GSTIN:</strong> ${restGst} &nbsp;|&nbsp; <strong>FSSAI:</strong> ${restFssai}<br/>
          ${restAddress} ${restPhone ? `&nbsp;|&nbsp; Ph: ${restPhone}` : ""}<br/>
          <strong>Report:</strong> ${periodTitle} &nbsp;|&nbsp; <strong>Generated on:</strong> ${new Date().toLocaleString()}
        </div>

        <div class="subtitle">STATUTORY GST TAX RETURN SUMMARY (GSTR-1 & 3B COMPANION)</div>

        <table class="kpi-table">
          <tr>
            <td class="kpi-card">
              <div class="kpi-lbl">Taxable Turnover</div>
              <div class="kpi-val" style="color: #635BFF;">₹${gstMetrics.totalTaxable.toLocaleString()}</div>
            </td>
            <td class="kpi-card">
              <div class="kpi-lbl">CGST (2.5%)</div>
              <div class="kpi-val">₹${gstMetrics.totalCgst.toLocaleString()}</div>
            </td>
            <td class="kpi-card">
              <div class="kpi-lbl">SGST (2.5%)</div>
              <div class="kpi-val">₹${gstMetrics.totalSgst.toLocaleString()}</div>
            </td>
            <td class="kpi-card">
              <div class="kpi-lbl">Gross Invoiced Total</div>
              <div class="kpi-val" style="color: #10B981;">₹${gstMetrics.totalGrand.toLocaleString()}</div>
            </td>
          </tr>
        </table>

        <table class="gst-table">
          <tr>
            <td><strong>Taxable Turnover (Food & Beverage Service - SAC 9963)</strong></td>
            <td style="text-align: right; font-weight: bold;">₹${gstMetrics.totalTaxable.toFixed(2)}</td>
          </tr>
          <tr>
            <td>Central GST (CGST @ 2.5%)</td>
            <td style="text-align: right;">₹${gstMetrics.totalCgst.toFixed(2)}</td>
          </tr>
          <tr>
            <td>State GST (SGST @ 2.5%)</td>
            <td style="text-align: right;">₹${gstMetrics.totalSgst.toFixed(2)}</td>
          </tr>
          <tr>
            <td>Total Output GST Tax Collected</td>
            <td style="text-align: right; font-weight: bold; color: #7E22CE;">₹${gstMetrics.totalTax.toFixed(2)}</td>
          </tr>
          <tr>
            <td>Total Customer Discounts Allowed</td>
            <td style="text-align: right; color: #DC2626;">- ₹${gstMetrics.totalDiscounts.toFixed(2)}</td>
          </tr>
          <tr style="background: #F3E8FF;">
            <td><strong>Total Invoice Value / Net Realization (Taxable + GST)</strong></td>
            <td style="text-align: right; font-weight: 900; font-size: 11pt; color: #581C87;">₹${gstMetrics.totalGrand.toFixed(2)}</td>
          </tr>
        </table>

        <div class="section-head">Payment Mode & Banking Reconciliation</div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Payment Mode</th>
              <th style="text-align: center;">Invoices Count</th>
              <th style="text-align: right;">Total Realized (INR)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>CASH</td>
              <td style="text-align: center;">${gstMetrics.paymentBreakdown.CASH.count}</td>
              <td style="text-align: right;">₹${gstMetrics.paymentBreakdown.CASH.total.toFixed(2)}</td>
            </tr>
            <tr>
              <td>UPI / ONLINE QR</td>
              <td style="text-align: center;">${gstMetrics.paymentBreakdown.UPI.count}</td>
              <td style="text-align: right;">₹${gstMetrics.paymentBreakdown.UPI.total.toFixed(2)}</td>
            </tr>
            <tr>
              <td>CARD POS</td>
              <td style="text-align: center;">${gstMetrics.paymentBreakdown.CARD.count}</td>
              <td style="text-align: right;">₹${gstMetrics.paymentBreakdown.CARD.total.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        <div class="section-head">Food Sales by SAC (SAC 9963)</div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Item Name</th>
              <th style="text-align: center;">SAC</th>
              <th style="text-align: center;">Quantity Sold</th>
              <th style="text-align: right;">Taxable Amount (INR)</th>
            </tr>
          </thead>
          <tbody>
            ${dishRows || '<tr><td colspan="4" style="text-align:center; padding:10pt; color:#64748B;">No menu item transactions recorded for this period</td></tr>'}
          </tbody>
        </table>

        <div class="section-head">Invoice-wise Tax Register</div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Date</th>
              <th>Mode</th>
              <th style="text-align: right;">Taxable Value</th>
              <th style="text-align: right;">CGST</th>
              <th style="text-align: right;">SGST</th>
              <th style="text-align: right;">Invoice Total</th>
            </tr>
          </thead>
          <tbody>
            ${billRows || '<tr><td colspan="7" style="text-align:center; padding:10pt; color:#64748B;">No completed bills found for this period</td></tr>'}
          </tbody>
        </table>

        <div class="footer">
          EzBill Restaurant ERP • Official GST Statement for CA Audit & Tax Return (GSTR-1/3B).
        </div>
      </body>
    </html>
  `;

  const filename = `gst_sales_report_${period}_${Date.now()}.doc`;

  if (Platform.OS === "web") {
    downloadWebFile(docHtml, filename, "application/msword;charset=utf-8;");
  } else {
    await saveAndShareMobileFile(
      filename,
      docHtml,
      "application/msword",
      "com.microsoft.word.doc",
      "Export Word GST Sales Document (CA Ready)"
    );
  }
}
