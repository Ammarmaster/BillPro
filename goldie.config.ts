import type { GoldieConfig } from "./src/config.ts";

const config = {
  appRoot: ".",
  bundleId: "com.prodevopz.billpro",
  devices: ["pixel-10-pro"],
  locales: ["en-US"],
  appearance: "dark",
  frame: { variant: "17-pro-blue" },

  theme: {
    background: "linear-gradient(160deg, #090D16 0%, #111827 45%, #1E1B4B 100%)",
    headlineColor: "#FFFFFF",
    subheadColor: "#94A3B8",
    fontFamily: 'system-ui, -apple-system, Roboto, "Segoe UI", sans-serif',
    copyHeightRatio: 0.22,
    deviceWidthRatio: 0.84,
    layout: "hero",
    template: ["hero", "tilt", "tilt-right", "hero", "tilt", "tilt-right", "hero", "hero"],
  },

  store: {
    name: "BillPro - Restaurant POS & Billing",
    subtitle: { "en-US": "Fast Billing, KOT & Offline POS" },
    developer: "ProDevOpz",
    category: "Food & Drink",
    rating: 4.9,
    ratingCount: "2.4K Reviews",
    price: "Free",
    description: {
      "en-US": "India's #1 Restaurant POS & Billing Software built for Indian restaurant, cafe, dhaba, hotel, bakery & cloud kitchen owners. Features ultra-fast 3-second billing, 58mm/80mm thermal receipts with GST & dynamic PhonePe/GPay UPI QR, visual live table management, kitchen display system (KDS), universal Bluetooth/USB printer support, daily cash drawer audit, and 100% offline resilience."
    },
  },

  scenes: [
    {
      kind: "screenshot",
      id: "pos-billing",
      flow: "pos-billing",
      headline: { "en-US": "3-Second Fast Billing" },
      subhead: { "en-US": "Punch Biryani, Dosas & Thalis in seconds. End counter queues during peak rush." },
      layout: "hero",
      decorations: [
        {
          kind: "badge",
          text: { "en-US": "3-SEC BILLING" },
          position: "top-right",
          background: "#FF5E2B",
          color: "#FFFFFF"
        }
      ]
    },
    {
      kind: "screenshot",
      id: "thermal-receipt",
      flow: "thermal-receipt",
      headline: { "en-US": "One-Tap GST Thermal Receipts" },
      subhead: { "en-US": "Instant 58mm & 80mm bills with CGST/SGST tax split and dynamic UPI QR code." },
      layout: "tilt",
      decorations: [
        {
          kind: "badge",
          text: { "en-US": "GST & UPI QR" },
          position: "top-right",
          background: "#10B981",
          color: "#FFFFFF"
        }
      ]
    },
    {
      kind: "screenshot",
      id: "table-management",
      flow: "table-management",
      headline: { "en-US": "Visual Dine-In Table Status" },
      subhead: { "en-US": "Track occupied, running and vacant tables in real time. Boost table turnover by 35%." },
      layout: "tilt-right",
      decorations: [
        {
          kind: "badge",
          text: { "en-US": "TABLE POS" },
          position: "top-right",
          background: "#3B82F6",
          color: "#FFFFFF"
        }
      ]
    },
    {
      kind: "screenshot",
      id: "kitchen-display",
      flow: "kitchen-display",
      headline: { "en-US": "Live Kitchen Display & KOT" },
      subhead: { "en-US": "Route orders straight to chefs in 1 sec with live timers. Zero lost paper slips." },
      layout: "hero",
      decorations: [
        {
          kind: "badge",
          text: { "en-US": "ZERO LOST KOTS" },
          position: "top-right",
          background: "#F59E0B",
          color: "#FFFFFF"
        }
      ]
    },
    {
      kind: "screenshot",
      id: "universal-printers",
      flow: "universal-printers",
      headline: { "en-US": "Universal Printer Hub" },
      subhead: { "en-US": "Auto-connects to TVS, Epson, Sunmi & NGX via Bluetooth, USB OTG, and Wi-Fi LAN." },
      layout: "tilt",
      decorations: [
        {
          kind: "badge",
          text: { "en-US": "PLUG & PLAY" },
          position: "top-right",
          background: "#8B5CF6",
          color: "#FFFFFF"
        }
      ]
    },
    {
      kind: "screenshot",
      id: "offline-sync",
      flow: "offline-sync",
      headline: { "en-US": "100% Offline Billing Guarantee" },
      subhead: { "en-US": "Internet down or power cut? Never stop billing. Data auto-syncs when online." },
      layout: "tilt-right",
      decorations: [
        {
          kind: "badge",
          text: { "en-US": "NO WI-FI NEEDED" },
          position: "top-right",
          background: "#EC4899",
          color: "#FFFFFF"
        }
      ]
    },
    {
      kind: "screenshot",
      id: "cash-closing",
      flow: "cash-closing",
      headline: { "en-US": "Daily Cash & Shift Closing" },
      subhead: { "en-US": "Reconcile cash drawers to the rupee, verify UPI sales, and prevent counter pilferage." },
      layout: "hero",
      decorations: [
        {
          kind: "badge",
          text: { "en-US": "ZERO THEFT" },
          position: "top-right",
          background: "#10B981",
          color: "#FFFFFF"
        }
      ]
    },
    {
      kind: "screenshot",
      id: "profit-engine",
      flow: "profit-engine",
      headline: { "en-US": "Cut Math Errors & Boost Profits" },
      subhead: { "en-US": "Save Rs 21,600+ monthly with error-free billing. Keep 100% of your restaurant earnings." },
      layout: "hero",
      decorations: [
        {
          kind: "badge",
          text: { "en-US": "SAVE RS 21,600/MO" },
          position: "top-right",
          background: "#FF5E2B",
          color: "#FFFFFF"
        }
      ]
    }
  ]
};

export default config;
