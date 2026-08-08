import { Platform } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";

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

export async function exportAnalyticsPDF(
  period: string,
  heroRev: number,
  totalOrders: number,
  avgBill: number,
  upiPct: number,
  cashPct: number,
  bills: any[],
  topDishes: any[]
) {
  const periodTitle = period === "7days" ? "7-Day Sales Report" : period === "monthly" ? "30-Day Monthly Sales Report" : "Annual Sales Report";
  
  const dishRows = (topDishes || []).map(d => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #E2E8F0; font-weight: 600;">${d.name || 'Item'}</td>
      <td style="padding: 10px; border-bottom: 1px solid #E2E8F0; text-align: center;">${d.sold || 1} units</td>
      <td style="padding: 10px; border-bottom: 1px solid #E2E8F0; text-align: right; font-weight: bold; color: #635BFF;">₹${d.amt || 0}</td>
    </tr>
  `).join("");

  const billRows = (bills || []).slice(0, 50).map(b => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #F1F5F9; font-size: 12px; font-weight: bold;">#${(b?.id || b?._id || "BILL").slice(-6).toUpperCase()}</td>
      <td style="padding: 8px; border-bottom: 1px solid #F1F5F9; font-size: 12px;">${b?.created_at ? new Date(b.created_at).toLocaleDateString() : new Date().toLocaleDateString()}</td>
      <td style="padding: 8px; border-bottom: 1px solid #F1F5F9; font-size: 12px;">${b?.payment_method || 'UPI'}</td>
      <td style="padding: 8px; border-bottom: 1px solid #F1F5F9; font-size: 12px; text-align: right; font-weight: bold; color: #0F172A;">₹${b?.total || b?.subtotal || 0}</td>
    </tr>
  `).join("");

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${periodTitle}</title>
        <style>
          @page { size: A4; margin: 20mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #0F172A; background: #FFFFFF; }
          .header { text-align: center; border-bottom: 3px solid #635BFF; padding-bottom: 16px; margin-bottom: 24px; }
          .title { font-size: 26px; font-weight: 900; color: #635BFF; margin: 0; text-transform: uppercase; letter-spacing: 0.5px; }
          .sub { font-size: 13px; color: #64748B; margin-top: 6px; font-weight: 500; }
          .grid { display: flex; flex-direction: row; gap: 16px; margin-bottom: 24px; }
          .card { flex: 1; background: #F8FAFC; border: 1.5px solid #E2E8F0; border-radius: 16px; padding: 18px; text-align: center; }
          .card-val { font-size: 22px; font-weight: 900; color: #0F172A; margin-top: 4px; }
          .card-lbl { font-size: 11px; color: #64748B; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th { background: #635BFF; color: #FFFFFF; text-align: left; padding: 10px; font-size: 12px; font-weight: 800; text-transform: uppercase; }
          .section-title { font-size: 16px; font-weight: 800; color: #0F172A; margin-top: 24px; margin-bottom: 8px; }
          .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #94A3B8; border-top: 1px solid #E2E8F0; padding-top: 16px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">ProDevOpz Restaurant ERP</div>
          <div class="sub">Official ${periodTitle} • Generated on ${new Date().toLocaleString()}</div>
        </div>

        <div class="grid">
          <div class="card">
            <div class="card-lbl">TOTAL REVENUE</div>
            <div class="card-val" style="color: #635BFF;">₹${(heroRev || 0).toLocaleString()}</div>
          </div>
          <div class="card">
            <div class="card-lbl">TOTAL ORDERS</div>
            <div class="card-val">${totalOrders || 0}</div>
          </div>
          <div class="card">
            <div class="card-lbl">AVG ORDER VALUE</div>
            <div class="card-val">₹${avgBill || 0}</div>
          </div>
        </div>

        <div>
          <div class="section-title">Top Performing Menu Items</div>
          <table>
            <thead>
              <tr>
                <th>Item Name</th>
                <th style="text-align: center;">Quantity Sold</th>
                <th style="text-align: right;">Total Sales (INR)</th>
              </tr>
            </thead>
            <tbody>
              ${dishRows || '<tr><td colspan="3" style="text-align:center; padding:16px; color:#64748B;">No menu item sales recorded for this period</td></tr>'}
            </tbody>
          </table>
        </div>

        <div>
          <div class="section-title">Transaction Log Audit</div>
          <table>
            <thead>
              <tr>
                <th>Bill ID</th>
                <th>Date</th>
                <th>Payment Mode</th>
                <th style="text-align: right;">Amount (INR)</th>
              </tr>
            </thead>
            <tbody>
              ${billRows || '<tr><td colspan="4" style="text-align:center; padding:16px; color:#64748B;">No completed bills found for this period</td></tr>'}
            </tbody>
          </table>
        </div>

        <div class="footer">
          ProDevOpz Restaurant ERP • Confidential Financial Document
        </div>
      </body>
    </html>
  `;

  if (Platform.OS === "web") {
    // 1. Direct Web File Download
    const filename = `sales_report_${period}_${Date.now()}.html`;
    downloadWebFile(html, filename, "text/html;charset=utf-8;");
    // 2. Open Print Window
    try {
      await Print.printAsync({ html });
    } catch {}
  } else {
    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `Share ${periodTitle} PDF` });
    }
  }
}

export async function exportAnalyticsExcel(period: string, bills: any[], topDishes: any[]) {
  let csv = "ProDevOpz ERP Sales Report\n";
  csv += `Period,${period}\n`;
  csv += `Export Date,${new Date().toLocaleString()}\n\n`;

  csv += "TOP SELLING MENU ITEMS\n";
  csv += "Item Name,Quantity Sold,Total Revenue (INR)\n";
  (topDishes || []).forEach(d => {
    csv += `"${d.name || 'Item'}",${d.sold || 1},${d.amt || 0}\n`;
  });

  csv += "\nTRANSACTION DETAILS\n";
  csv += "Bill ID,Date,Payment Method,Status,Subtotal,Tax,Discount,Total Revenue\n";
  (bills || []).forEach(b => {
    const bId = (b?.id || b?._id || "BILL").slice(-6).toUpperCase();
    const date = b?.created_at ? new Date(b.created_at).toLocaleString() : new Date().toLocaleString();
    csv += `"${bId}","${date}","${b?.payment_method || 'UPI'}","${b?.status || 'paid'}",${b?.subtotal || 0},${b?.tax || 0},${b?.discount || 0},${b?.total || 0}\n`;
  });

  const filename = `sales_report_${period}_${Date.now()}.csv`;

  if (Platform.OS === "web") {
    downloadWebFile(csv, filename, "text/csv;charset=utf-8;");
  } else {
    const fileUri = `${(FileSystem as any).documentDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: (FileSystem as any).EncodingType.UTF8 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, { mimeType: "text/csv", dialogTitle: "Export Excel / CSV Sales Report" });
    }
  }
}

export async function exportAnalyticsDocx(period: string, heroRev: number, totalOrders: number, avgBill: number, bills: any[], topDishes: any[]) {
  let doc = `====================================================\n`;
  doc += `       PRODEVOPZ RESTAURANT ERP - SALES REPORT      \n`;
  doc += `====================================================\n\n`;
  doc += `Period: ${period.toUpperCase()}\n`;
  doc += `Generated On: ${new Date().toLocaleString()}\n\n`;
  doc += `SUMMARY METRICS\n`;
  doc += `----------------------------------------------------\n`;
  doc += `Total Revenue  : INR ${(heroRev || 0).toLocaleString()}\n`;
  doc += `Total Orders   : ${totalOrders || 0}\n`;
  doc += `Avg Order Value: INR ${avgBill || 0}\n\n`;

  doc += `TOP SELLING DISHES\n`;
  doc += `----------------------------------------------------\n`;
  (topDishes || []).forEach(d => {
    doc += `• ${d.name || 'Item'} : ${d.sold || 1} sold | Total: INR ${d.amt || 0}\n`;
  });

  doc += `\nTRANSACTION BREAKDOWN LOG\n`;
  doc += `----------------------------------------------------\n`;
  (bills || []).forEach(b => {
    doc += `[#${(b?.id || b?._id || "BILL").slice(-6).toUpperCase()}] ${b?.created_at ? new Date(b.created_at).toLocaleDateString() : new Date().toLocaleDateString()} | ${b?.payment_method || 'UPI'} | Total: INR ${b?.total || b?.subtotal || 0}\n`;
  });

  const filename = `sales_report_${period}_${Date.now()}.docx`;

  if (Platform.OS === "web") {
    downloadWebFile(doc, filename, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  } else {
    const fileUri = `${(FileSystem as any).documentDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(fileUri, doc, { encoding: (FileSystem as any).EncodingType.UTF8 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, { mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", dialogTitle: "Export DOCX Sales Document" });
    }
  }
}
