import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform, Alert, PermissionsAndroid } from "react-native";
import { storage } from "@/src/utils/storage";
import * as Haptics from "expo-haptics";
import QRCode from "qrcode";
import { api } from "./api";

let ThermalPrinterModule: any = null;
try {
  ThermalPrinterModule = require("react-native-thermal-printer").default;
} catch {}

const PRINTER_SETTINGS_PREFIX = "lumina_printer_settings_";

export type PrinterConnectionStatus = "connected" | "reconnecting" | "unavailable" | "none";
export type PrinterConnectionType = "bluetooth" | "network" | "usb" | "sunmi" | "system" | "none";

export interface PrinterSettings {
  type: PrinterConnectionType;
  address: string; // IP for network, MAC for bluetooth, Serial/USB identifier
  port?: string;    // default 9100 for network
  name: string;
  brand?: string;   // TVS, Epson, Xprinter, Sunmi, NGX, Generic, USB, etc.
  width: 58 | 80;
  auto_print: boolean;
  print_kot?: boolean; // When configured on cashier: allow KOT to print from billing printer
  open_drawer?: boolean; // Kick cash drawer automatically on cash settlements
  auto_cut?: boolean;   // Auto paper cut
  copies?: number;      // 1, 2, or 3 copies
  darkness?: "normal" | "dark" | "extra_dark"; // Thermal heating density & darkness
  saved_at?: string;
  last_status?: PrinterConnectionStatus;
}

export interface PrinterPreset {
  id: string;
  name: string;
  brand: string;
  type: PrinterConnectionType;
  defaultWidth: 58 | 80;
  port?: string;
  description: string;
  icon: string;
}

export const PRINTER_PRESETS: PrinterPreset[] = [
  {
    id: "hallet_h80i",
    name: "Hallet H80i (80mm / 3 Inch)",
    brand: "Hallet",
    type: "system",
    defaultWidth: 80,
    description: "Hallet H80i 80mm / 3-inch thermal POS receipt & KOT printer (USB & Windows)",
    icon: "receipt",
  },
  {
    id: "windows_spooler",
    name: "Windows USB Printer / System Spooler",
    brand: "Windows USB",
    type: "system",
    defaultWidth: 80,
    description: "Instant printing for USB printers installed on Windows laptop / PC (Hallet, POS-58, TVS, Epson)",
    icon: "desktop",
  },
  {
    id: "tvs_rp",
    name: "TVS Electronics (RP 3150 / 3200 / 45)",
    brand: "TVS",
    type: "bluetooth",
    defaultWidth: 80,
    description: "High-speed 80mm ESC/POS billing & KOT printers",
    icon: "receipt",
  },
  {
    id: "epson_lan",
    name: "Epson POS LAN / Wi-Fi (TM-T82 / T88)",
    brand: "Epson",
    type: "network",
    port: "9100",
    defaultWidth: 80,
    description: "Ethernet & Wi-Fi network receipt printers (Port 9100)",
    icon: "wifi",
  },
  {
    id: "xprinter_pos",
    name: "Xprinter / Everycom / Rongta / Posiflex",
    brand: "Xprinter",
    type: "bluetooth",
    defaultWidth: 58,
    description: "XP-58 / XP-80 / EC-58 / POS-80 2-inch & 3-inch thermal",
    icon: "bluetooth",
  },
  {
    id: "sunmi_terminal",
    name: "Sunmi POS Terminal Built-in",
    brand: "Sunmi",
    type: "sunmi",
    defaultWidth: 58,
    description: "Built-in thermal printer for Sunmi V1, V2, V2 Pro & T2",
    icon: "phone-portrait",
  },
  {
    id: "usb_thermal",
    name: "USB Thermal Printer (OTG / PC Direct)",
    brand: "USB",
    type: "usb",
    defaultWidth: 80,
    description: "Direct USB cable thermal printers via WebUSB / OTG",
    icon: "git-network",
  },
  {
    id: "ngx_portable",
    name: "NGX / Phomemo / Goojprt Handheld",
    brand: "NGX",
    type: "bluetooth",
    defaultWidth: 58,
    description: "Portable 58mm handheld Bluetooth receipt printers",
    icon: "hardware-chip",
  },
  {
    id: "generic_net",
    name: "Generic Wi-Fi / Ethernet (Port 9100)",
    brand: "Generic",
    type: "network",
    port: "9100",
    defaultWidth: 80,
    description: "Standard IP raw socket printing over Wi-Fi / LAN",
    icon: "globe",
  },
  {
    id: "generic_bt",
    name: "Generic Bluetooth POS (58mm / 80mm)",
    brand: "Generic",
    type: "bluetooth",
    defaultWidth: 58,
    description: "Universal ESC/POS Bluetooth printer (MPT-II, POS-58)",
    icon: "bluetooth",
  },
  {
    id: "system_spooler",
    name: "System Print / AirPrint / Windows / PDF",
    brand: "System",
    type: "system",
    defaultWidth: 80,
    description: "OS printer dialog, AirPrint, HP, Canon, Brother, A4",
    icon: "desktop",
  },
];

// In-memory status & reconnection tracking
const printerStatuses: Record<string, PrinterConnectionStatus> = {
  cashier: "none",
  kitchen: "none"
};
const statusListeners: Record<string, Set<(status: PrinterConnectionStatus) => void>> = {
  cashier: new Set(),
  kitchen: new Set()
};

let activeWebBluetoothDevice: any = null;
let activeWebBluetoothCharacteristic: any = null;
let activeWebUsbDevice: any = null;
let activeWebSerialPort: any = null;
let activeWebSerialWriter: any = null;

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
      if (activeWebSerialWriter || activeWebBluetoothCharacteristic || (activeWebUsbDevice && activeWebUsbDevice.opened)) {
        setPrinterStatus(role, "connected");
        return "connected";
      }
      const reconnected = await autoReconnectAllWebPrinters(role);
      if (reconnected) {
        setPrinterStatus(role, "connected");
        return "connected";
      }
      if (settings.type === "bluetooth" || settings.type === "usb") {
        setPrinterStatus(role, "unavailable");
        return "unavailable";
      }
      setPrinterStatus(role, "connected");
      return "connected";
    }

    if (!ThermalPrinterModule) {
      setPrinterStatus(role, "unavailable");
      return "unavailable";
    }

    if (settings.type === "bluetooth" || settings.type === "sunmi") {
      await requestBluetoothPermissions();
      if (ThermalPrinterModule.getBluetoothDeviceList) {
        const paired: any[] = await ThermalPrinterModule.getBluetoothDeviceList();
        const targetMac = (settings.address || "").trim().toLowerCase();
        const found = paired && paired.some(d => (d.macAddress || "").toLowerCase() === targetMac || (d.deviceName || "").toLowerCase() === settings.name.toLowerCase());
        const status = found ? "connected" : (paired && paired.length > 0 ? "connected" : (settings.type === "sunmi" ? "connected" : "unavailable"));
        setPrinterStatus(role, status);
        return status;
      }
    } else if (settings.type === "network" || settings.type === "usb") {
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
  // Nordic Semiconductor UART Service (Used by 75%+ of modern portable BLE receipt printers)
  "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
  // Standard ESC/POS Services
  "000018f0-0000-1000-8000-00805f9b34fb",
  "000018f1-0000-1000-8000-00805f9b34fb",
  // Common BLE Serial (CC2540/CC2541, HM-10, Feasycom, POS58/80)
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "0000ffe5-0000-1000-8000-00805f9b34fb",
  // Chinese POS Printers (Xprinter, Rongta, Everycom, Zijiang, Milestone, Netum)
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000fff0-0000-1000-8000-00805f9b34fb",
  "0000ff02-0000-1000-8000-00805f9b34fb",
  "0000fef5-0000-1000-8000-00805f9b34fb",
  // Microchip ISSC Transparent BLE
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  // Standard Bluetooth SPP Serial Port Profile (Hallet / POS-58 / Generic BT)
  "00001101-0000-1000-8000-00805f9b34fb",
  "0000e0ff-0000-1000-8000-00805f9b34fb",
  // Xprinter / Posiflex custom BLE
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
  // Telink / Actions BLE printers
  "0000ae00-0000-1000-8000-00805f9b34fb",
  "0000af30-0000-1000-8000-00805f9b34fb",
  // MPT-II / AI-BLE
  "0000abf0-0000-1000-8000-00805f9b34fb",
  // Star / Bixolon / Epson BLE
  "0000fee7-0000-1000-8000-00805f9b34fb",
  "0000fee0-0000-1000-8000-00805f9b34fb",
  "0000fee1-0000-1000-8000-00805f9b34fb",
  // Generic Access & Attributes
  "00001800-0000-1000-8000-00805f9b34fb",
  "00001801-0000-1000-8000-00805f9b34fb",
  "0000180a-0000-1000-8000-00805f9b34fb",
];

export function isWebBluetoothSupported(): boolean {
  return Platform.OS === "web" && typeof navigator !== "undefined" && !!(navigator as any).bluetooth;
}

export function getActiveWebBluetoothDevice(): any {
  return activeWebBluetoothDevice;
}

export async function tryAutoReconnectWebBluetooth(role: "cashier" | "kitchen" = "cashier"): Promise<boolean> {
  if (!isWebBluetoothSupported() || !(navigator as any).bluetooth?.getDevices) return false;
  try {
    const devices = await (navigator as any).bluetooth.getDevices();
    if (devices && devices.length > 0) {
      for (const device of devices) {
        try {
          const server = await device.gatt?.connect();
          if (server && server.connected) {
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
            if (writeChar) {
              activeWebBluetoothDevice = device;
              activeWebBluetoothCharacteristic = writeChar;
              device.addEventListener("gattserverdisconnected", () => {
                activeWebBluetoothCharacteristic = null;
                setPrinterStatus(role, "unavailable");
              });
              setPrinterStatus(role, "connected");
              return true;
            }
          }
        } catch {}
      }
    }
  } catch {}
  return false;
}

export async function connectWebBluetoothPrinter(role: "cashier" | "kitchen" = "cashier"): Promise<boolean> {
  if (!isWebBluetoothSupported()) {
    Alert.alert("Web Bluetooth Not Supported", "Web Bluetooth requires a Chromium browser (Chrome, Edge, Brave, Opera) with Bluetooth enabled.");
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
    } else {
      Alert.alert("Printer Paired", `Connected to ${device.name || "printer"}, but no ESC/POS writable channel was detected. If this is a Bluetooth Classic SPP printer, connect via 'Windows Serial / COM Port'.`);
      return false;
    }
  } catch (err: any) {
    if (err.name !== "NotFoundError") {
      console.warn("Web Bluetooth pairing error:", err);
      Alert.alert("Bluetooth Connection Failed", err.message || "Could not connect to Bluetooth printer.");
    }
    return false;
  }
}

export async function sendWebBluetoothPrint(bytes: Uint8Array): Promise<boolean> {
  if (!activeWebBluetoothCharacteristic) {
    await tryAutoReconnectWebBluetooth();
    if (!activeWebBluetoothCharacteristic && activeWebBluetoothDevice && activeWebBluetoothDevice.gatt) {
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
    const canWriteWithoutResponse = !!activeWebBluetoothCharacteristic.properties?.writeWithoutResponse;
    const canWriteWithResponse = !!activeWebBluetoothCharacteristic.properties?.write;

    // Fast high-speed BLE chunking:
    // With writeWithoutResponse (supported by Hallet H80i, MPT-II, Xprinter), 128-byte chunks with 2ms pacing
    // allow the entire receipt to print in one smooth, continuous fluid pass (< 0.2s) without line-by-line stutter!
    const chunkSize = canWriteWithoutResponse ? 128 : 64;

    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.slice(i, i + chunkSize);
      let written = false;

      // 1. Try writeWithoutResponse first (fastest continuous stream without round-trip ACK lag)
      if (canWriteWithoutResponse && activeWebBluetoothCharacteristic.writeValueWithoutResponse) {
        try {
          await activeWebBluetoothCharacteristic.writeValueWithoutResponse(chunk);
          written = true;
        } catch (wErr) {
          console.warn("[BLE] writeWithoutResponse failed, falling back to writeValue:", wErr);
        }
      }

      // 2. Fallback to writeValue (with response acknowledgment)
      if (!written && (canWriteWithResponse || activeWebBluetoothCharacteristic.writeValue)) {
        try {
          await activeWebBluetoothCharacteristic.writeValue(chunk);
          written = true;
        } catch (wErr2) {
          console.warn("[BLE] writeValue failed:", wErr2);
        }
      }

      // 3. Fallback to writeValueWithResponse
      if (!written && activeWebBluetoothCharacteristic.writeValueWithResponse) {
        try {
          await activeWebBluetoothCharacteristic.writeValueWithResponse(chunk);
          written = true;
        } catch {}
      }

      // Tiny 2ms pacing between 128-byte chunks so UART buffer never overflows
      if (canWriteWithoutResponse && i + chunkSize < bytes.length) {
        await new Promise(r => setTimeout(r, 2));
      }
    }
    return true;
  } catch (e) {
    console.warn("Error sending Web Bluetooth bytes:", e);
    return false;
  }
}

// ============================================================================
// WEB USB & WEB SERIAL THERMAL PRINTER DRIVERS (ESC/POS)
// ============================================================================
export function isWebUsbSupported(): boolean {
  return Platform.OS === "web" && typeof navigator !== "undefined" && "usb" in navigator;
}

export function isWebSerialSupported(): boolean {
  return Platform.OS === "web" && typeof navigator !== "undefined" && "serial" in navigator;
}

export async function tryAutoReconnectWebSerial(role: "cashier" | "kitchen" = "cashier"): Promise<boolean> {
  if (!isWebSerialSupported() || !(navigator as any).serial?.getPorts) return false;
  try {
    const ports = await (navigator as any).serial.getPorts();
    if (ports && ports.length > 0) {
      for (const port of ports) {
        try {
          if (!port.readable || !port.writable) {
            const baudRates = [9600, 115200, 38400, 19200];
            for (const baud of baudRates) {
              try {
                await port.open({ baudRate: baud });
                break;
              } catch (e: any) {
                if (e?.message?.includes("already open")) break;
              }
            }
          }
          if (port.writable) {
            activeWebSerialPort = port;
            if (activeWebSerialWriter) {
              try { activeWebSerialWriter.releaseLock(); } catch {}
              activeWebSerialWriter = null;
            }
            if (!port.writable.locked) {
              activeWebSerialWriter = port.writable.getWriter();
            }
            setPrinterStatus(role, "connected");
            return true;
          }
        } catch (portErr) {
          console.warn("Error opening remembered serial port:", portErr);
        }
      }
    }
  } catch (err) {
    console.warn("Web Serial auto-reconnect error:", err);
  }
  return false;
}

export async function tryAutoReconnectWebUsb(role: "cashier" | "kitchen" = "cashier"): Promise<boolean> {
  if (!isWebUsbSupported() || !(navigator as any).usb?.getDevices) return false;
  try {
    const devices = await (navigator as any).usb.getDevices();
    if (devices && devices.length > 0) {
      for (const device of devices) {
        try {
          if (!device.opened) {
            await device.open();
          }
          if (!device.configuration || device.configuration.configurationValue !== 1) {
            try { await device.selectConfiguration(1); } catch {}
          }
          let ifaceNumber = 0;
          if (device.configuration?.interfaces?.length) {
            const printerIface = device.configuration.interfaces.find((iface: any) =>
              iface.alternates?.some((alt: any) => alt.interfaceClass === 7)
            );
            ifaceNumber = printerIface ? printerIface.interfaceNumber : device.configuration.interfaces[0].interfaceNumber;
          }
          try { await device.claimInterface(ifaceNumber); } catch {}
          activeWebUsbDevice = device;
          setPrinterStatus(role, "connected");
          return true;
        } catch (usbErr) {
          console.warn("Error opening remembered usb device:", usbErr);
        }
      }
    }
  } catch (err) {
    console.warn("Web USB auto-reconnect error:", err);
  }
  return false;
}

export async function autoReconnectAllWebPrinters(role: "cashier" | "kitchen" = "cashier"): Promise<boolean> {
  if (Platform.OS !== "web") return false;
  if (activeWebSerialWriter || activeWebBluetoothCharacteristic || (activeWebUsbDevice && activeWebUsbDevice.opened)) {
    setPrinterStatus(role, "connected");
    return true;
  }
  const serialOk = await tryAutoReconnectWebSerial(role);
  if (serialOk) return true;

  const btOk = await tryAutoReconnectWebBluetooth(role);
  if (btOk) return true;

  const usbOk = await tryAutoReconnectWebUsb(role);
  if (usbOk) return true;

  return false;
}

// Global browser connect/disconnect listeners
if (Platform.OS === "web" && typeof navigator !== "undefined") {
  if ("serial" in navigator) {
    try {
      (navigator as any).serial.addEventListener("connect", () => {
        autoReconnectAllWebPrinters("cashier").catch(() => {});
        autoReconnectAllWebPrinters("kitchen").catch(() => {});
      });
      (navigator as any).serial.addEventListener("disconnect", () => {
        activeWebSerialWriter = null;
        activeWebSerialPort = null;
        checkPrinterConnection("cashier").catch(() => {});
        checkPrinterConnection("kitchen").catch(() => {});
      });
    } catch {}
  }
  if ("usb" in navigator) {
    try {
      (navigator as any).usb.addEventListener("connect", () => {
        autoReconnectAllWebPrinters("cashier").catch(() => {});
        autoReconnectAllWebPrinters("kitchen").catch(() => {});
      });
      (navigator as any).usb.addEventListener("disconnect", () => {
        activeWebUsbDevice = null;
        checkPrinterConnection("cashier").catch(() => {});
        checkPrinterConnection("kitchen").catch(() => {});
      });
    } catch {}
  }
}

export async function connectWebUsbPrinter(role: "cashier" | "kitchen" = "cashier"): Promise<boolean> {
  if (!isWebUsbSupported()) {
    Alert.alert("WebUSB Not Supported", "Direct USB connection requires a Chromium browser (Chrome or Edge).");
    return false;
  }
  try {
    const navUsb = (navigator as any).usb;
    const device = await navUsb.requestDevice({ filters: [] });
    if (!device) return false;

    if (!device.opened) {
      await device.open();
    }
    if (!device.configuration || device.configuration.configurationValue !== 1) {
      try {
        await device.selectConfiguration(1);
      } catch (confErr) {
        console.warn("selectConfiguration skipped:", confErr);
      }
    }
    let ifaceNumber = 0;
    if (device.configuration?.interfaces?.length) {
      const printerIface = device.configuration.interfaces.find((iface: any) =>
        iface.alternates?.some((alt: any) => alt.interfaceClass === 7)
      );
      ifaceNumber = printerIface ? printerIface.interfaceNumber : device.configuration.interfaces[0].interfaceNumber;
    }
    try {
      await device.claimInterface(ifaceNumber);
    } catch (claimErr) {
      console.warn("claimInterface note:", claimErr);
    }

    activeWebUsbDevice = device;
    const devName = device.productName || "USB Thermal POS Printer";
    const devAddress = `USB-${device.vendorId || "0"}-${device.productId || "0"}`;
    await autoConnectPrinter(role, {
      name: devName,
      address: devAddress,
      type: "usb",
      brand: "USB",
      width: 58,
      auto_cut: false,
      darkness: "extra_dark"
    });
    setPrinterStatus(role, "connected");
    Alert.alert("USB Printer Connected", `Successfully paired with ${devName} via USB! Auto-reconnect is active. You can now tap 'Test Ticket' or print bills.`);
    return true;
  } catch (err: any) {
    if (err.name !== "NotFoundError") {
      console.warn("WebUSB connect error:", err);
      Alert.alert(
        "USB Connection Tip",
        "Could not claim USB interface directly. On Windows, if this printer has a CH340 chip, install the free CH340 driver to connect via 'Windows Serial / COM Port', or connect wirelessly via Bluetooth."
      );
    }
    return false;
  }
}

export async function connectWebSerialPrinter(role: "cashier" | "kitchen" = "cashier"): Promise<boolean> {
  if (!isWebSerialSupported()) {
    Alert.alert("Web Serial Not Supported", "Web Serial requires a Chromium browser (Chrome or Edge).");
    return false;
  }
  try {
    const navSerial = (navigator as any).serial;
    const port = await navSerial.requestPort();
    if (!port) return false;

    // Release any previous locked writer before opening new connection
    if (activeWebSerialWriter) {
      try { activeWebSerialWriter.releaseLock(); } catch {}
      activeWebSerialWriter = null;
    }
    if (activeWebSerialPort && activeWebSerialPort !== port) {
      try { await activeWebSerialPort.close(); } catch {}
    }

    if (!port.readable || !port.writable) {
      const baudRates = [9600, 115200, 38400, 19200];
      for (const baud of baudRates) {
        try {
          await port.open({ baudRate: baud });
          break;
        } catch (e: any) {
          if (e?.message?.includes("already open")) break;
        }
      }
    }

    activeWebSerialPort = port;
    if (port.writable && !port.writable.locked) {
      activeWebSerialWriter = port.writable.getWriter();
    }

    const devName = "MPT-II Thermal Printer";
    const devAddress = "MPT-II";
    await autoConnectPrinter(role, {
      name: devName,
      address: devAddress,
      type: "bluetooth",
      brand: "Generic",
      width: 58,
      auto_cut: false,
      darkness: "extra_dark"
    });
    setPrinterStatus(role, "connected");
    Alert.alert(
      "MPT-II Connected!",
      "Successfully connected to MPT-II thermal printer! Auto-reconnect is now active. Bills and KOT tickets will print automatically without any popups."
    );
    return true;
  } catch (err: any) {
    if (err.name !== "NotFoundError") {
      console.warn("Web Serial connect error:", err);
      Alert.alert("Serial Connection", err.message || "Could not connect to serial port. On Windows, ensure CH340 driver is installed.");
    }
    return false;
  }
}

async function writeSerialChunks(writer: any, bytes: Uint8Array): Promise<void> {
  const chunkSize = 256;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize);
    await writer.write(chunk);
    if (i + chunkSize < bytes.length) {
      await new Promise(r => setTimeout(r, 12));
    }
  }
}

export async function sendWebUsbPrint(bytes: Uint8Array): Promise<boolean> {
  if (activeWebSerialPort?.writable) {
    try {
      if (activeWebSerialWriter) {
        await writeSerialChunks(activeWebSerialWriter, bytes);
        return true;
      } else if (!activeWebSerialPort.writable.locked) {
        activeWebSerialWriter = activeWebSerialPort.writable.getWriter();
        await writeSerialChunks(activeWebSerialWriter, bytes);
        return true;
      }
    } catch (e) {
      console.warn("Web Serial write error, attempting fresh writer:", e);
      try {
        if (activeWebSerialWriter) {
          try { activeWebSerialWriter.releaseLock(); } catch {}
          activeWebSerialWriter = null;
        }
        if (activeWebSerialPort?.writable && !activeWebSerialPort.writable.locked) {
          activeWebSerialWriter = activeWebSerialPort.writable.getWriter();
          await writeSerialChunks(activeWebSerialWriter, bytes);
          return true;
        }
      } catch (retryErr) {
        console.warn("Serial write retry failed:", retryErr);
      }
    }
  }
  if (activeWebUsbDevice) {
    try {
      if (!activeWebUsbDevice.opened) {
        await activeWebUsbDevice.open();
      }
      let ifaceNumber = 0;
      if (activeWebUsbDevice.configuration?.interfaces?.length) {
        const printerIface = activeWebUsbDevice.configuration.interfaces.find((iface: any) =>
          iface.alternates?.some((alt: any) => alt.interfaceClass === 7)
        );
        ifaceNumber = printerIface ? printerIface.interfaceNumber : activeWebUsbDevice.configuration.interfaces[0].interfaceNumber;
      }
      try {
        await activeWebUsbDevice.claimInterface(ifaceNumber);
      } catch {}

      let outEndpoint = 1;
      try {
        const currentInterface = activeWebUsbDevice.configuration?.interfaces?.find(
          (iface: any) => iface.interfaceNumber === ifaceNumber
        ) || activeWebUsbDevice.configuration?.interfaces?.[0];
        const alternate = currentInterface?.alternates?.[0];
        const foundOut = alternate?.endpoints?.find((ep: any) => ep.direction === "out");
        if (foundOut) {
          outEndpoint = foundOut.endpointNumber;
        }
      } catch {}

      const chunkSize = 512;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.slice(i, i + chunkSize);
        await activeWebUsbDevice.transferOut(outEndpoint, chunk);
        if (i + chunkSize < bytes.length) {
          await new Promise(r => setTimeout(r, 10));
        }
      }
      return true;
    } catch (e) {
      console.warn("WebUSB transferOut error:", e);
    }
  }
  return false;
}

export function getDrawerKickCommand(): Uint8Array {
  // ESC p 0 25 250 (Pin 2 kick) & ESC p 1 25 250 (Pin 5 kick)
  return new Uint8Array([0x1B, 0x70, 0x00, 0x19, 0xFA, 0x1B, 0x70, 0x01, 0x19, 0xFA]);
}

export async function kickCashDrawer(role: "cashier" | "kitchen" = "cashier"): Promise<boolean> {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  const settings = await getPrinterSettings(role);
  if (!settings || settings.type === "none" || settings.type === "system") {
    return false;
  }

  const kickBytes = getDrawerKickCommand();

  if (Platform.OS === "web") {
    if (activeWebBluetoothCharacteristic || (activeWebBluetoothDevice && activeWebBluetoothDevice.gatt?.connected)) {
      try {
        await sendWebBluetoothPrint(kickBytes);
        return true;
      } catch {}
    }
    if (activeWebUsbDevice || activeWebSerialWriter) {
      try {
        await sendWebUsbPrint(kickBytes);
        return true;
      } catch {}
    }
    return false;
  }

  if (ThermalPrinterModule) {
    try {
      if (settings.type === "network") {
        await ThermalPrinterModule.printTcp({
          payload: "\x1B\x70\x00\x19\xFA",
          ip: (settings.address || "").trim(),
          port: parseInt(settings.port || "9100"),
          openCashbox: true,
          autoCut: false,
          mmFeedPaper: 0,
        });
        return true;
      } else if (settings.type === "bluetooth" || settings.type === "sunmi" || settings.type === "usb") {
        await ThermalPrinterModule.printBluetooth({
          payload: "\x1B\x70\x00\x19\xFA",
          macAddress: (settings.address || "").trim(),
          openCashbox: true,
          autoCut: false,
          mmFeedPaper: 0,
        });
        return true;
      }
    } catch (e) {
      console.warn("Cash drawer kick error:", e);
    }
  }
  return false;
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

export function generateEscPosRasterQr(text: string, paperWidth: 58 | 80 = 58): number[] {
  if (!text || !text.trim()) return [];
  try {
    const qr = QRCode.create(text.trim(), { errorCorrectionLevel: "M" });
    const qrSize = qr.modules.size;
    const quietZone = 2; // 2 modules quiet margin
    const totalQrModules = qrSize + quietZone * 2;

    const totalPaperDots = paperWidth === 58 ? 384 : 576;
    const maxQrDots = paperWidth === 58 ? 220 : 360;
    const scale = Math.max(2, Math.floor(maxQrDots / totalQrModules));
    const qrPixelWidth = totalQrModules * scale;

    const bytesPerRow = Math.floor(totalPaperDots / 8); // 48 bytes for 58mm, 72 bytes for 80mm
    const leftOffsetDots = Math.max(0, Math.floor((totalPaperDots - qrPixelWidth) / 2));
    const totalRows = qrPixelWidth;

    const bytes: number[] = [];
    // ESC/POS GS v 0 0 xL xH yL yH
    const xL = bytesPerRow % 256;
    const xH = Math.floor(bytesPerRow / 256);
    const yL = totalRows % 256;
    const yH = Math.floor(totalRows / 256);

    bytes.push(0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH);

    for (let y = 0; y < totalRows; y++) {
      const rowModY = Math.floor(y / scale) - quietZone;
      for (let byteIdx = 0; byteIdx < bytesPerRow; byteIdx++) {
        let byteVal = 0;
        for (let bit = 0; bit < 8; bit++) {
          const dotX = byteIdx * 8 + bit;
          const relX = dotX - leftOffsetDots;
          if (relX >= 0 && relX < qrPixelWidth) {
            const modX = Math.floor(relX / scale) - quietZone;
            if (rowModY >= 0 && rowModY < qrSize && modX >= 0 && modX < qrSize) {
              if (qr.modules.get(rowModY, modX)) {
                byteVal |= (1 << (7 - bit));
              }
            }
          }
        }
        bytes.push(byteVal);
      }
    }

    return bytes;
  } catch (err) {
    console.warn("[PRINT] Raster QR generation failed:", err);
    return [];
  }
}

export async function convertBase64ToEscPosRaster(
  base64Data: string,
  paperWidth: number = 58
): Promise<number[]> {
  if (!base64Data || typeof base64Data !== "string") return [];
  const cleanBase64 = base64Data.replace(/^data:image\/[a-z]+;base64,/i, "").trim();
  if (cleanBase64.length < 20) return [];

  if (typeof Image === "undefined" || typeof document === "undefined") {
    return [];
  }

  try {
    let mime = "image/png";
    if (cleanBase64.startsWith("/9j/")) mime = "image/jpeg";
    else if (cleanBase64.startsWith("R0lGOD")) mime = "image/gif";
    else if (cleanBase64.startsWith("UklGR")) mime = "image/webp";

    const dataUri = `data:${mime};base64,${cleanBase64}`;
    const img = new Image();

    // Race image loading against a 2-second timeout to prevent hanging
    const loaded = new Promise<boolean>((resolve) => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
    });
    const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2000));

    img.src = dataUri;
    if (!img.complete || !img.naturalWidth) {
      const ok = await Promise.race([loaded, timeout]);
      if (!ok) return [];
    }

    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (w <= 0 || h <= 0) return [];

    const totalPaperDots = paperWidth === 58 ? 384 : 576;
    // Accurate sizing matching System Print proportions (max-height: 56px, max-width: 120px):
    // 58mm (384 dots): max width 160 dots (~42% of width), max height 80 dots
    // 80mm (576 dots): max width 240 dots (~42% of width), max height 110 dots
    const maxTargetWidth = paperWidth === 58 ? 160 : 240;
    const maxTargetHeight = paperWidth === 58 ? 80 : 110;

    const scale = Math.min(maxTargetWidth / w, maxTargetHeight / h);
    const targetWidth = Math.max(16, Math.floor(w * scale));
    const targetHeight = Math.max(16, Math.floor(h * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return [];

    // Fill white background for transparent PNGs
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
    const data = imgData.data;

    // Raster bitmap across full paper width with centered left offset
    const bytesPerRow = Math.floor(totalPaperDots / 8); // 48 bytes for 58mm, 72 bytes for 80mm
    const leftOffsetDots = Math.max(0, Math.floor((totalPaperDots - targetWidth) / 2));
    const totalRows = targetHeight;

    const bytes: number[] = [];
    // ESC/POS GS v 0 0 xL xH yL yH
    const xL = bytesPerRow % 256;
    const xH = Math.floor(bytesPerRow / 256);
    const yL = totalRows % 256;
    const yH = Math.floor(totalRows / 256);

    bytes.push(0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH);

    for (let y = 0; y < totalRows; y++) {
      const rowOffset = y * targetWidth * 4;
      for (let byteIdx = 0; byteIdx < bytesPerRow; byteIdx++) {
        let byteVal = 0;
        for (let bit = 0; bit < 8; bit++) {
          const dotX = byteIdx * 8 + bit;
          const relX = dotX - leftOffsetDots;
          if (relX >= 0 && relX < targetWidth) {
            const pixelOffset = rowOffset + relX * 4;
            const r = data[pixelOffset];
            const g = data[pixelOffset + 1];
            const b = data[pixelOffset + 2];
            const a = data[pixelOffset + 3];

            if (a > 64) {
              const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
              if (luminance < 170) {
                byteVal |= (1 << (7 - bit));
              }
            }
          }
        }
        bytes.push(byteVal);
      }
    }

    return bytes;
  } catch (err) {
    console.warn("[PRINT] Logo raster generation error:", err);
    return [];
  }
}

export function convertThermalPayloadToEscPos(
  payload: string,
  width: 58 | 80 = 58,
  autoCut: boolean = false,
  darkness: "normal" | "dark" | "extra_dark" = "extra_dark"
): Uint8Array {
  const maxChars = width === 58 ? 32 : 48;
  const bytes: number[] = [];

  // 1. Reset / Initialize printer: ESC @
  bytes.push(0x1B, 0x40);

  // 2. Cancel Chinese Character Mode (FS .): Essential for Hallet H80i, Xprinter, POS-58/80!
  // Prevents the printer from misinterpreting any control bytes or data as Chinese characters.
  bytes.push(0x1C, 0x2E);

  // 3. Select Character Code Table 0 (PC437: Standard USA / Western English): ESC t 0
  bytes.push(0x1B, 0x74, 0x00);

  // 4. Select International Character Set (USA): ESC R 0
  bytes.push(0x1B, 0x52, 0x00);

  // 5. Set default line spacing (30 dots): ESC 3 30
  bytes.push(0x1B, 0x33, 0x1E);

  // Universal ESC/POS double-strike for clean, high-contrast dark text
  if (darkness === "extra_dark" || darkness === "dark") {
    bytes.push(0x1B, 0x47, 0x01);
  }

  const lines = payload.split("\n");

  for (const rawLine of lines) {
    if (!rawLine.trim()) {
      bytes.push(0x0A);
      continue;
    }

    // Check for QR code tag: <qrcode size='...'>data</qrcode>
    const qrMatch = rawLine.match(/<qrcode[^>]*>(.*?)<\/qrcode>/i);
    if (qrMatch) {
      const qrData = (qrMatch[1] || "").trim();
      if (qrData) {
        try {
          const qrBytes = generateEscPosRasterQr(qrData, width);
          if (qrBytes.length > 0) {
            for (const b of qrBytes) bytes.push(b);
            bytes.push(0x0A);
          }
        } catch (qrErr) {
          console.warn("[PRINT] Raster QR error:", qrErr);
        }
      }
      continue;
    }

    // Skip raster images and raw <img> tags in ESC/POS byte conversion so raw graphics bytes
    // are never sent to thermal printers as text (which causes Chinese character output on Hallet/POS printers)
    if (rawLine.includes("<rasterimg>") || rawLine.includes("</rasterimg>") || rawLine.includes("<img>") || rawLine.includes("</img>")) {
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

    let formattedText = "";

    const lineCols = isDoubleSize ? Math.floor(maxChars / 2) : maxChars;
    const cleanText = clean.trim();

    if (cleanText.includes("[L]") && cleanText.includes("[C]") && cleanText.includes("[R]")) {
      const parts = cleanText.split(/\[L\]|\[C\]|\[R\]/).filter(p => p !== "");
      const colL = (parts[0] || "").trim();
      const colC = (parts[1] || "").trim();
      const colR = (parts[2] || "").trim();

      const leftCenter = colL + " ".repeat(Math.max(1, Math.floor((lineCols - colC.length) / 2) - colL.length)) + colC;
      const spaces = Math.max(1, lineCols - leftCenter.length - colR.length);
      formattedText = leftCenter + " ".repeat(spaces) + colR;
    } else if (cleanText.includes("[L]") && cleanText.includes("[R]")) {
      const parts = cleanText.split(/\[L\]|\[R\]/).filter(p => p !== "");
      const colL = (parts[0] || "").trim();
      const colR = (parts[1] || "").trim();
      const spaces = Math.max(1, lineCols - colL.length - colR.length);
      formattedText = colL + " ".repeat(spaces) + colR;
    } else if (cleanText.startsWith("[C]")) {
      const rawText = cleanText.slice(3).trim();
      const leftPad = Math.max(0, Math.floor((lineCols - rawText.length) / 2));
      formattedText = " ".repeat(leftPad) + rawText;
    } else if (cleanText.startsWith("[R]")) {
      const rawText = cleanText.slice(3).trim();
      const leftPad = Math.max(0, lineCols - rawText.length);
      formattedText = " ".repeat(leftPad) + rawText;
    } else if (cleanText.startsWith("[L]")) {
      formattedText = cleanText.slice(3).trim();
    } else {
      formattedText = cleanText;
    }

    // 1. Alignment: ESC a 0 (Always Left Align; software spaces guarantee exact centering on 100% of printers)
    bytes.push(0x1B, 0x61, 0x00);

    // 2. Font size: GS ! n
    if (isDoubleSize) {
      bytes.push(0x1D, 0x21, 0x11);
    } else if (isTall) {
      bytes.push(0x1D, 0x21, 0x01);
    } else {
      bytes.push(0x1D, 0x21, 0x00);
    }

    // 3. Bold / Emphasized: ESC E n
    const shouldEmphasize = isBold || darkness === "extra_dark" || darkness === "dark";
    bytes.push(0x1B, 0x45, shouldEmphasize ? 0x01 : 0x00);

    // 4. Output text bytes
    const textEncoded = encodeUtf8(formattedText);
    for (const b of textEncoded) bytes.push(b);
    bytes.push(0x0A);

    // 5. Reset font size back to normal
    if (isDoubleSize || isTall) {
      bytes.push(0x1D, 0x21, 0x00);
    }
  }

  // Reset styles
  bytes.push(0x1B, 0x47, 0x00);
  bytes.push(0x1B, 0x45, 0x00);
  bytes.push(0x1D, 0x21, 0x00);
  bytes.push(0x1B, 0x61, 0x00);

  // Paper feed & Cut logic tailored to width:
  // For 58mm portable printers (like MPT-II): manual tear bar only needs 1 single line feed. NO cut command!
  if (width === 58) {
    bytes.push(0x1B, 0x64, 0x01);
  } else {
    // Feed 4 lines on 80mm desktop printers so the QR code and total are well above the auto-cutter blade
    bytes.push(0x1B, 0x64, 0x04);
    if (autoCut) {
      // Use GS V 1 (0x1D, 0x56, 0x01) for instant partial cut without feeding extra blank paper
      bytes.push(0x1D, 0x56, 0x01);
    }
  }

  return new Uint8Array(bytes);
}

export function printViaIframe(html: string) {
  if (typeof document === "undefined") return;

  // Inject automatic onload print trigger directly into HTML document
  let printableHtml = html;
  if (!printableHtml.includes("window.print()")) {
    printableHtml = printableHtml.replace(
      "</body>",
      `<script>
        window.addEventListener("load", function() {
          setTimeout(function() {
            try { window.focus(); window.print(); } catch(e) {}
          }, 120);
        });
      </script></body>`
    );
  }

  let iframe = document.getElementById("ezbill-print-frame") as HTMLIFrameElement;
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = "ezbill-print-frame";
    iframe.style.position = "fixed";
    iframe.style.top = "-9999px";
    iframe.style.left = "-9999px";
    iframe.style.width = "420px";
    iframe.style.height = "600px";
    iframe.style.border = "none";
    document.body.appendChild(iframe);
  }
  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (doc) {
    doc.open();
    doc.write(printableHtml);
    doc.close();
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        console.warn("Iframe print error, falling back to popup window:", e);
        try {
          const win = window.open("", "_blank", "width=420,height=600");
          if (win) {
            win.document.write(printableHtml);
            win.document.close();
            win.focus();
            win.print();
            setTimeout(() => win.close(), 1000);
          }
        } catch {}
      }
    }, 280);
  }
}

export function getRestaurantSnapshot(data?: any): any {
  if (data?.restaurant_snapshot && (data.restaurant_snapshot.name || data.restaurant_snapshot.address)) {
    return data.restaurant_snapshot;
  }
  const fromApi = api.getCachedRestaurant();
  if (fromApi && (fromApi.name || fromApi.address)) {
    return fromApi;
  }
  if (Platform.OS === "web" && typeof window !== "undefined") {
    try {
      const diskR = window.localStorage.getItem("disk_cache_/restaurant");
      if (diskR) {
        const parsed = JSON.parse(diskR);
        if (parsed && (parsed.name || parsed.address)) return parsed;
      }
      const userStr = window.localStorage.getItem("lumina_user");
      if (userStr) {
        const u = JSON.parse(userStr);
        if (u?.restaurant_profile && (u.restaurant_profile.name || u.restaurant_profile.address)) {
          return u.restaurant_profile;
        }
      }
    } catch {}
  }
  return data?.restaurant_snapshot || fromApi || {};
}

export function getBillLogo(snapshot?: any, width: number = 80): string | null {
  const r = snapshot || getRestaurantSnapshot();
  if (!r) return null;

  const raw = width === 58
    ? (r.logo_base64_58 || r.logo_base64 || r.logo || r.logo_url)
    : (r.logo_base64_80 || r.logo_base64 || r.logo || r.logo_url);

  if (raw && typeof raw === "string" && raw.trim().length > 20) {
    const cleaned = raw.replace(/^data:image\/[a-z]+;base64,/i, "").trim();
    if (cleaned.length > 20) return cleaned;
  }

  // Check cached restaurant in case snapshot was created before logo upload
  const cachedR = api.getCachedRestaurant();
  if (cachedR && cachedR !== r) {
    const cachedRaw = width === 58
      ? (cachedR.logo_base64_58 || cachedR.logo_base64 || cachedR.logo || cachedR.logo_url)
      : (cachedR.logo_base64_80 || cachedR.logo_base64 || cachedR.logo || cachedR.logo_url);
    if (cachedRaw && typeof cachedRaw === "string" && cachedRaw.trim().length > 20) {
      const cleaned = cachedRaw.replace(/^data:image\/[a-z]+;base64,/i, "").trim();
      if (cleaned.length > 20) return cleaned;
    }
  }

  return null;
}

// Helper to wrap text cleanly at word boundaries so that wrapped lines are all independently centered
export function wrapCenteredLines(text: string, maxLineChars: number): string[] {
  const clean = (text || "").trim();
  if (!clean) return [];
  if (clean.length <= maxLineChars) return [clean];
  const words = clean.split(/\s+/);
  const result: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (!currentLine) {
      if (word.length <= maxLineChars) {
        currentLine = word;
      } else {
        let rem = word;
        while (rem.length > maxLineChars) {
          result.push(rem.slice(0, maxLineChars));
          rem = rem.slice(maxLineChars);
        }
        currentLine = rem;
      }
    } else {
      if ((currentLine + " " + word).length <= maxLineChars) {
        currentLine = currentLine + " " + word;
      } else {
        result.push(currentLine);
        if (word.length <= maxLineChars) {
          currentLine = word;
        } else {
          let rem = word;
          while (rem.length > maxLineChars) {
            result.push(rem.slice(0, maxLineChars));
            rem = rem.slice(maxLineChars);
          }
          currentLine = rem;
        }
      }
    }
  }
  if (currentLine) result.push(currentLine);
  return result;
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

export async function formatReceipt(data: any, width: number = 58, isKitchen: boolean = false): Promise<string> {
  const maxChars = width === 58 ? 32 : 48;
  const divider = "-".repeat(maxChars);
  const doubleDivider = "=".repeat(maxChars);
  const lines: string[] = [];

  if (isKitchen) {
    // ==========================================
    // SIMPLE, ULTRA-CLEAN KITCHEN ORDER TICKET (KOT)
    // Highlighted Table, Order # and Dish Names Only
    // ==========================================
    const isTakeaway = String(data.table_number || "").toLowerCase() === "takeaway" || String(data.order_type || "").toLowerCase() === "takeaway";
    const rawTable = String(data.table_number || "").trim();
    const tableLabel = isTakeaway ? "TAKEAWAY" : (rawTable ? (rawTable.toUpperCase().startsWith("TABLE") ? rawTable.toUpperCase() : `TABLE ${rawTable.toUpperCase()}`) : "TAKEAWAY");
    const orderNo = data.order_number || (data.id ? data.id.slice(0, 6).toUpperCase() : "1");
    const dateObj = new Date(data.created_at || Date.now());
    const timeStr = dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
    const items = data.items || [];

    lines.push(`[C]${divider}\n`);
    lines.push(`[C]<b><font size='big'>${tableLabel}</font></b>\n`);
    lines.push(`[C]<b>#${orderNo} · ${timeStr}</b>\n`);
    lines.push(`[C]${divider}\n`);

    items.forEach((it: any) => {
      const q = Number(it.quantity || 1);
      const name = String(it.name || "Item").trim().toUpperCase();
      const qPrefix = `${q}x`;

      // Highlighted, bold, tall dish line for clear visibility in kitchen
      lines.push(`[L]<b><font size='tall'>${qPrefix} ${name}</font></b>\n`);
      if (it.notes && String(it.notes).trim()) {
        lines.push(`[L]   * ${String(it.notes).trim()}\n`);
      }
    });

    lines.push(`[C]${divider}\n`);
  } else {
    // ==========================================
    // CUSTOMER BILL RECEIPT — COMPACT & ELEGANT
    // ==========================================
    const r = getRestaurantSnapshot(data);
    const rawName = (r.name || "Master Chef").trim();
    const restaurantName = rawName.toUpperCase();

    // 1. Print restaurant icon / logo in native Android app
    const logoBase64 = getBillLogo(r, width);
    if (logoBase64 && Platform.OS !== "web") {
      lines.push(`[C]<img>data:image/png;base64,${logoBase64}</img>\n`);
    }

    // Centered restaurant name:
    // Full printable width: 30 chars for 58mm (2-inch), 46 chars for 80mm (3-inch).
    // Allows text to start from left and end to right across the full paper width, center aligned.
    // Only wraps to the next line if text overflows the line capacity (only for restaurant name).
    const maxNameCols = width === 58 ? 30 : 46;
    const nameLines = wrapCenteredLines(restaurantName, maxNameCols);
    nameLines.forEach(line => {
      lines.push(`[C]<b><font size='tall'>${line}</font></b>\n`);
    });

    if (r.address) {
      const cleanAddr = String(r.address).replace(/\s+/g, " ").trim();
      const addrLines = wrapCenteredLines(cleanAddr, maxChars - 2);
      addrLines.forEach(line => {
        lines.push(`[C]${line}\n`);
      });
    }

    const phone1 = (r.phone || "").trim();
    const phone2 = (r.phone2 || "").trim();
    const phone = phone1 ? (phone2 && phone2 !== phone1 ? `${phone1} / ${phone2}` : phone1) : phone2;
    const gst = r.gst || r.gst_number || r.gstin || "";
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
    const billItems = (data.items && data.items.length > 0)
      ? data.items
      : (data.order?.items && data.order.items.length > 0)
        ? data.order.items
        : (data.order_id || data.order_ids)
          ? ((api.getCachedOrders() || []).find((o: any) => o.id === data.order_id || (data.order_ids && data.order_ids.includes(o.id)))?.items || [])
          : [];

    if (width === 58) {
      lines.push(`[L]<b>ITEM</b>[R]<b>QTY   AMOUNT</b>\n`);
      lines.push(`[C]${divider}\n`);
      billItems.forEach((it: any) => {
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
      billItems.forEach((it: any) => {
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
    const itemsSubtotal = billItems.reduce((acc: number, it: any) => acc + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
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
      lines.push(`[C]<b>*** PAID (${payMethod}) ***</b>\n`);
      lines.push(`[C]${divider}\n`);
    } else {
      lines.push(`[C]<b>Scan & Pay with UPI</b>\n`);
      lines.push(`[C]<b>Amount: Rs.${formatThermalMoney(totalVal)}</b>\n`);
    }

    const upiId = r.upi_id || r.upi || "8152075375-2@ybl";
    const merchant = r.merchant_name || r.name || "Restaurant";
    const totalAmount = Number(totalVal).toFixed(2);
    const upiUrl = data.upi_url || `upi://pay?pa=${upiId}&pn=${encodeURIComponent(merchant)}&am=${totalAmount}&cu=INR`;
    const qrSize = width === 58 ? 35 : 44;

    // Always output the QR code on the bill!
    lines.push(`[C]<qrcode size='${qrSize}'>${upiUrl}</qrcode>\n`);
    if (!isPaid) {
      lines.push(`[C]GPay / PhonePe / Paytm / UPI\n`);
    } else {
      lines.push(`[C]UPI: ${upiId}\n`);
    }
    lines.push(`[C]${divider}\n`);

    lines.push(`[C]Thank you! Visit again.\n`);
    lines.push(`[C]EzBill POS\n`);
  }

  return lines.join("");
}

export async function printKitchenKOT(order: any, isManual = false): Promise<boolean> {
  if (!order) return false;

  const kSettings = await getPrinterSettings("kitchen");
  const cSettings = await getPrinterSettings("cashier");

  const hasKitchenPrinter = !!(kSettings && kSettings.type !== "none");
  const hasCashierPrinter = !!(cSettings && cSettings.type !== "none");

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
  let handled = false;
  if (hasKitchenPrinter && (isManual || kSettings?.auto_print)) {
    handled = await printThermalDirect("kitchen", order, true);
  } else if (hasCashierPrinter && (isManual || cSettings?.print_kot)) {
    handled = await printThermalDirect("cashier", order, true);
  }

  // Fallback to system print on web so KOT NEVER fails on laptop / PC
  if (!handled && Platform.OS === "web") {
    try {
      await printKOTLegacy(order);
      handled = true;
    } catch (kotErr) {
      console.warn("[PRINT] KOT system fallback error:", kotErr);
    }
  }

  return handled;
}

// Background auto-reconnect manager with backoff
let isAutoReconnecting = false;
export function startAutoReconnect() {
  if (isAutoReconnecting) return;
  isAutoReconnecting = true;

  const attempt = async () => {
    try {
      if (Platform.OS === "web") {
        await autoReconnectAllWebPrinters("cashier");
        await autoReconnectAllWebPrinters("kitchen");
      }
      await checkPrinterConnection("cashier");
      await checkPrinterConnection("kitchen");
    } catch {}
  };

  // Immediate check
  attempt();

  // Periodic intelligent background health check every 20 seconds
  setInterval(attempt, 20000);
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

export async function scanNetworkPrinters(subnetPrefix = "192.168.1"): Promise<{ name: string; address: string; type: PrinterConnectionType; brand: string }[]> {
  const discovered: { name: string; address: string; type: PrinterConnectionType; brand: string }[] = [];
  const commonIps = [
    `${subnetPrefix}.100`, `${subnetPrefix}.200`, `${subnetPrefix}.87`,
    `${subnetPrefix}.168`, `${subnetPrefix}.199`, `${subnetPrefix}.250`,
    "192.168.0.100", "192.168.0.200", "192.168.29.100", "192.168.29.200"
  ];
  
  commonIps.forEach(ip => {
    discovered.push({
      name: `Network POS Printer (${ip}:9100)`,
      address: ip,
      type: "network",
      brand: "Epson"
    });
  });
  
  return discovered;
}

export async function scanNearbyPrinters(): Promise<{ name: string; address: string; type: PrinterConnectionType; brand: string }[]> {
  const discovered: { name: string; address: string; type: PrinterConnectionType; brand: string }[] = [];

  // 1. Android Bluetooth bonded devices
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
              let brand = "Generic";
              const upper = name.toUpperCase();
              if (upper.includes("TVS") || upper.includes("RP")) brand = "TVS";
              else if (upper.includes("EPSON") || upper.includes("TM-")) brand = "Epson";
              else if (upper.includes("XP") || upper.includes("XPRINTER") || upper.includes("POS")) brand = "Xprinter";
              else if (upper.includes("NGX") || upper.includes("MPT") || upper.includes("RONGTA")) brand = "NGX";
              else if (upper.includes("SUNMI") || upper.includes("INNER")) brand = "Sunmi";

              discovered.push({ name, address, type: "bluetooth", brand });
            }
          });
        }
      } catch (err) {
        console.warn("Bluetooth scan error:", err);
      }
    }
  }

  // 2. Web Bluetooth & WebUSB devices if already paired/connected
  if (Platform.OS === "web") {
    if (activeWebBluetoothDevice) {
      discovered.push({
        name: activeWebBluetoothDevice.name || "Connected Web Bluetooth Printer",
        address: activeWebBluetoothDevice.id || "Web-Bluetooth",
        type: "bluetooth",
        brand: "Generic"
      });
    } else if (isWebBluetoothSupported()) {
      discovered.push({
        name: "Pair Web Bluetooth Thermal Printer (BLE)",
        address: "web-bluetooth-pair",
        type: "bluetooth",
        brand: "Generic"
      });
    }

    if (activeWebUsbDevice) {
      discovered.push({
        name: activeWebUsbDevice.productName || "Connected USB Thermal Printer",
        address: `USB-${activeWebUsbDevice.vendorId || "0"}`,
        type: "usb",
        brand: "USB"
      });
    } else if (isWebUsbSupported()) {
      discovered.push({
        name: "Connect Direct USB Cable Printer (WebUSB)",
        address: "web-usb-pair",
        type: "usb",
        brand: "USB"
      });
    }
    if (activeWebSerialPort) {
      discovered.push({
        name: "Connected USB Serial Thermal Printer",
        address: "USB-Serial",
        type: "usb",
        brand: "USB"
      });
    } else if (isWebSerialSupported()) {
      discovered.push({
        name: "Connect Windows Serial / COM Port (CH340 / USB)",
        address: "web-serial-pair",
        type: "usb",
        brand: "USB"
      });
    }
  }

  // 3. Saved configured printers
  const cashier = await getPrinterSettings("cashier");
  if (cashier && cashier.address && cashier.type !== "none") {
    if (!discovered.some(x => x.address.toLowerCase() === cashier.address.toLowerCase())) {
      discovered.push({
        name: cashier.name || `${cashier.type.toUpperCase()} Cashier Printer`,
        address: cashier.address,
        type: cashier.type,
        brand: cashier.brand || "Generic"
      });
    }
  }

  const kitchen = await getPrinterSettings("kitchen");
  if (kitchen && kitchen.address && kitchen.type !== "none") {
    if (!discovered.some(x => x.address.toLowerCase() === kitchen.address.toLowerCase())) {
      discovered.push({
        name: kitchen.name || `${kitchen.type.toUpperCase()} Kitchen Printer`,
        address: kitchen.address,
        type: kitchen.type,
        brand: kitchen.brand || "Generic"
      });
    }
  }

  // 4. Default quick presets for instant 1-click test if no physical device detected
  if (discovered.length === 0) {
    discovered.push(
      { name: "TVS RP 3150 Bluetooth Printer", address: "66:22:03:B1:A5:1E", type: "bluetooth", brand: "TVS" },
      { name: "Epson TM-T82 LAN (192.168.1.200:9100)", address: "192.168.1.200", type: "network", brand: "Epson" },
      { name: "Xprinter XP-58 Handheld Printer", address: "00:11:22:33:44:55", type: "bluetooth", brand: "Xprinter" },
      { name: "Sunmi POS Built-in Thermal Printer", address: "inner", type: "sunmi", brand: "Sunmi" },
      { name: "USB Direct Cable POS Printer", address: "USB-Direct", type: "usb", brand: "USB" },
      { name: "System Print / AirPrint / Spooler", address: "System-Default", type: "system", brand: "System" }
    );
  }

  return discovered;
}

export async function autoConnectPrinter(
  role: "cashier" | "kitchen",
  printer: {
    name: string;
    address: string;
    type?: PrinterConnectionType;
    brand?: string;
    width?: 58 | 80;
    auto_print?: boolean;
    print_kot?: boolean;
    open_drawer?: boolean;
    auto_cut?: boolean;
    copies?: number;
    darkness?: "normal" | "dark" | "extra_dark";
  }
): Promise<PrinterConnectionStatus> {
  const isNetwork = printer.type === "network" || (printer.address && printer.address.includes("."));
  const existing = await getPrinterSettings(role);
  const inferredType: PrinterConnectionType = printer.type || (isNetwork ? "network" : "bluetooth");
  
  const is58 = printer.width === 58 ||
    (printer.name && printer.name.toUpperCase().includes("MPT")) ||
    (printer.address && printer.address.toUpperCase().includes("MPT")) ||
    (printer.name && printer.name.includes("58")) ||
    (existing && existing.width === 58);
  const resolvedWidth: 58 | 80 = is58 ? 58 : (printer.width || existing?.width || 58);
  const resolvedAutoCut = resolvedWidth === 58 ? false : (printer.auto_cut ?? (existing ? existing.auto_cut : false));
  const resolvedDarkness = printer.darkness || existing?.darkness || "extra_dark";

  const settings: PrinterSettings = {
    type: inferredType,
    name: printer.name || (isNetwork ? "Network Printer" : "Thermal Printer"),
    address: printer.address.trim(),
    port: isNetwork ? "9100" : undefined,
    brand: printer.brand || (existing ? existing.brand : "Generic"),
    width: resolvedWidth,
    auto_print: printer.auto_print ?? (existing ? existing.auto_print : true),
    print_kot: printer.print_kot ?? (existing ? existing.print_kot : false),
    open_drawer: printer.open_drawer ?? (existing ? existing.open_drawer : true),
    auto_cut: resolvedAutoCut,
    copies: printer.copies ?? (existing ? existing.copies : 1),
    darkness: resolvedDarkness,
  };

  await savePrinterSettings(role, settings);
  const status = await checkPrinterConnection(role);
  return status;
}

export async function printThermalDirect(role: "cashier" | "kitchen", data: any, isKitchen = false): Promise<boolean> {
  let settings = await getPrinterSettings(role);
  const cashierSettings = await getPrinterSettings("cashier");

  // If kitchen printer is not configured or disabled, fallback to cashier printer
  if ((!settings || settings.type === "none") && role === "kitchen") {
    if (cashierSettings && cashierSettings.type !== "none") {
      settings = cashierSettings;
      role = "cashier";
    }
  }

  if (!settings || settings.type === "none") {
    if (Platform.OS === "web") {
      Alert.alert(
        "Printer Not Configured",
        "Please connect your thermal printer in Printer Settings, or select System Spooler to use your browser's print dialog."
      );
      return false;
    }
    return false;
  }

  // Detect 58mm hardware (MPT-II, POS-58, etc.) to guarantee 58mm formatting even if accidentally saved as 80
  const is58 = (settings.width === 58) ||
    (cashierSettings?.width === 58) ||
    (settings.name && settings.name.toUpperCase().includes("MPT")) ||
    (cashierSettings?.name && cashierSettings.name.toUpperCase().includes("MPT")) ||
    (settings.address && settings.address.toUpperCase().includes("MPT")) ||
    (cashierSettings?.address && cashierSettings.address.toUpperCase().includes("MPT")) ||
    (settings.name && settings.name.includes("58")) ||
    (cashierSettings?.name && cashierSettings.name.includes("58")) ||
    !!activeWebSerialPort ||
    (activeWebUsbDevice && (activeWebUsbDevice.productName || "").toUpperCase().includes("MPT")) ||
    (activeWebBluetoothDevice && (activeWebBluetoothDevice.name || "").toUpperCase().includes("MPT"));
  const effectiveWidth: 58 | 80 = is58 ? 58 : (settings.width || 58);
  const effectiveAutoCut = effectiveWidth === 58 ? false : (settings.auto_cut !== false);
  const effectiveDarkness = settings.darkness || cashierSettings?.darkness || "extra_dark";

  if (settings.type === "system") {
    if (isKitchen) {
      await printKOTLegacy(data);
    } else {
      await printBillLegacy(data);
    }
    return true;
  }

  let payload: string;
  try {
    payload = await formatReceipt(data, effectiveWidth, isKitchen);
  } catch (fmtErr) {
    console.warn("[PRINT] formatReceipt error, retrying without logo:", fmtErr);
    // Fallback: try again — formatReceipt should still work even if logo raster fails
    try {
      payload = await formatReceipt(data, effectiveWidth, isKitchen);
    } catch {
      console.warn("[PRINT] formatReceipt failed completely");
      return false;
    }
  }
  const copiesCount = Math.max(1, Math.min(3, settings.copies || 1));

  // Auto-Kick Cash Drawer on Cash Payments
  if (!isKitchen && settings.open_drawer && data.status === "paid" && String(data.payment_method || "").toUpperCase() === "CASH") {
    kickCashDrawer(role).catch(() => {});
  }

  for (let c = 0; c < copiesCount; c++) {
    if (c > 0) {
      await new Promise(r => setTimeout(r, 200));
    }

    if (Platform.OS === "web") {
      // Auto-reconnect if connection not currently cached in memory
      if (!activeWebSerialWriter && !activeWebBluetoothCharacteristic && !activeWebUsbDevice) {
        await autoReconnectAllWebPrinters(role);
      }

      // 1. Direct Web Bluetooth / Serial ESC/POS printing
      if (settings.type === "bluetooth") {
        if (activeWebSerialPort?.writable || activeWebSerialWriter) {
          try {
            const escPosBytes = convertThermalPayloadToEscPos(payload, effectiveWidth, effectiveAutoCut, effectiveDarkness);
            const success = await sendWebUsbPrint(escPosBytes);
            if (success) {
              if (c === copiesCount - 1) return true;
              continue;
            }
          } catch (e) {
            console.warn("Serial print failed:", e);
          }
        }

        if (activeWebBluetoothCharacteristic) {
          try {
            const escPosBytes = convertThermalPayloadToEscPos(payload, effectiveWidth, effectiveAutoCut, effectiveDarkness);
            const success = await sendWebBluetoothPrint(escPosBytes);
            if (success) {
              if (c === copiesCount - 1) return true;
              continue;
            }
          } catch (e) {
            console.warn("Web Bluetooth direct print failed:", e);
          }
        }

        // Attempt silent reconnection with previously granted ports/devices (NO popups!)
        const serialOk = await tryAutoReconnectWebSerial(role);
        if (serialOk && (activeWebSerialPort?.writable || activeWebSerialWriter)) {
          try {
            const escPosBytes = convertThermalPayloadToEscPos(payload, effectiveWidth, effectiveAutoCut, effectiveDarkness);
            const success = await sendWebUsbPrint(escPosBytes);
            if (success) {
              if (c === copiesCount - 1) return true;
              continue;
            }
          } catch (e) {
            console.warn("Serial print retry failed:", e);
          }
        }

        const btOk = await tryAutoReconnectWebBluetooth(role);
        if (btOk && activeWebBluetoothCharacteristic) {
          try {
            const escPosBytes = convertThermalPayloadToEscPos(payload, effectiveWidth, effectiveAutoCut, effectiveDarkness);
            const success = await sendWebBluetoothPrint(escPosBytes);
            if (success) {
              if (c === copiesCount - 1) return true;
              continue;
            }
          } catch (e) {
            console.warn("Web Bluetooth retry failed:", e);
          }
        }

        // Direct Web Bluetooth failed or not active:
        // Automatically fallback to Windows Spooler on Web so prints NEVER get lost!
        try {
          if (isKitchen) {
            await printKOTLegacy(data);
          } else {
            await printBillLegacy(data);
          }
          return true;
        } catch (fbErr) {
          console.warn("[PRINT] Bluetooth fallback to spooler error:", fbErr);
          return false;
        }
      }

      // 2. Direct WebUSB / Web Serial ESC/POS
      if (settings.type === "usb") {
        if (activeWebUsbDevice || activeWebSerialWriter || activeWebSerialPort?.writable) {
          try {
            const escPosBytes = convertThermalPayloadToEscPos(payload, effectiveWidth, effectiveAutoCut, effectiveDarkness);
            const success = await sendWebUsbPrint(escPosBytes);
            if (success) {
              if (c === copiesCount - 1) return true;
              continue;
            }
          } catch (e) {
            console.warn("Web USB print error:", e);
          }
        }

        // Attempt silent reconnection with previously granted USB/Serial ports (NO popups!)
        const usbOk = await tryAutoReconnectWebUsb(role) || await tryAutoReconnectWebSerial(role);
        if (usbOk && (activeWebUsbDevice || activeWebSerialWriter || activeWebSerialPort?.writable)) {
          try {
            const escPosBytes = convertThermalPayloadToEscPos(payload, effectiveWidth, effectiveAutoCut, effectiveDarkness);
            const success = await sendWebUsbPrint(escPosBytes);
            if (success) {
              if (c === copiesCount - 1) return true;
              continue;
            }
          } catch (e) {
            console.warn("Web USB print retry failed:", e);
          }
        }

        // Direct WebUSB failed or claimed by Windows driver:
        // Automatically fallback to Windows Spooler on Web so prints NEVER get lost!
        try {
          if (isKitchen) {
            await printKOTLegacy(data);
          } else {
            await printBillLegacy(data);
          }
          return true;
        } catch (fbErr) {
          console.warn("[PRINT] USB fallback to spooler error:", fbErr);
          return false;
        }
      }

      // 3. Network TCP printer on Web
      if (settings.type === "network") {
        Alert.alert("Network Printing on Web", "Direct raw TCP socket to IP is not allowed by browser security sandbox. Connect thermal printer via Bluetooth, USB/Serial, or use the mobile app.");
        return false;
      }

      return false;
    }

    if (!ThermalPrinterModule) {
      console.warn("ThermalPrinterModule is not loaded.");
      return false;
    }

    const mmFeed = effectiveWidth === 58 ? 3 : 10;
    const shouldCut = effectiveWidth === 58 ? false : (settings.auto_cut !== false);

    try {
      if (settings.type === "network") {
        await ThermalPrinterModule.printTcp({
          payload,
          ip: (settings.address || "").trim(),
          port: parseInt(settings.port || "9100"),
          printerWidthMM: effectiveWidth === 58 ? 48 : 72,
          printerNbrCharactersPerLine: effectiveWidth === 80 ? 48 : 32,
          autoCut: shouldCut,
          mmFeedPaper: mmFeed,
        });
      } else if (settings.type === "bluetooth" || settings.type === "sunmi" || settings.type === "usb") {
        const cleanAddress = (settings.address || "").trim();

        await requestBluetoothPermissions();

        let targetMac = cleanAddress === "inner" ? "" : cleanAddress;

        try {
          if (ThermalPrinterModule.getBluetoothDeviceList) {
            const list: any[] = await ThermalPrinterModule.getBluetoothDeviceList();
            if (list && Array.isArray(list) && list.length > 0) {
              if (cleanAddress && !cleanAddress.includes(":")) {
                const match = list.find(d => 
                  (d.deviceName || d.name || "").toLowerCase().includes(cleanAddress.toLowerCase())
                );
                if (match?.macAddress) {
                  targetMac = match.macAddress;
                }
              }
              if (!targetMac && list[0]?.macAddress) {
                targetMac = list[0].macAddress;
              }
            }
          }
        } catch (devErr) {
          console.warn("Could not pre-fetch bluetooth device list:", devErr);
        }

        try {
          await ThermalPrinterModule.printBluetooth({
            payload,
            macAddress: targetMac,
            printerWidthMM: effectiveWidth === 58 ? 48 : 72,
            printerNbrCharactersPerLine: effectiveWidth === 80 ? 48 : 32,
            mmFeedPaper: mmFeed,
            autoCut: shouldCut,
          });
        } catch (directErr: any) {
          console.warn("Direct MAC print error, trying default paired device:", directErr);
          try {
            await ThermalPrinterModule.printBluetooth({
              payload,
              macAddress: "",
              printerWidthMM: effectiveWidth === 58 ? 48 : 72,
              printerNbrCharactersPerLine: effectiveWidth === 80 ? 48 : 32,
              mmFeedPaper: mmFeed,
              autoCut: shouldCut,
            });
          } catch (fallbackErr: any) {
            console.warn("Fallback bluetooth print also failed:", fallbackErr);
            return false;
          }
        }
      }
    } catch (e: any) {
      console.warn("Direct thermal printing failed:", e);
      return false;
    }
  }

  return true;
}

export async function printBill(bill: any): Promise<boolean> {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  let handled = false;
  try {
    handled = await printThermalDirect("cashier", bill, false);
  } catch (err) {
    console.warn("[PRINT] printThermalDirect failed:", err);
  }

  // Universal Fallback on Web / Laptop / Desktop:
  // If direct raw ESC/POS failed (e.g. USB claimed by Windows printer driver or Bluetooth dropped),
  // seamlessly print via Windows/Browser system spooler so the receipt ALWAYS prints!
  if (!handled && Platform.OS === "web") {
    try {
      await printBillLegacy(bill);
      handled = true;
    } catch (legErr) {
      console.warn("[PRINT] System print fallback error:", legErr);
    }
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

  const itemsRows = items.map((it: any) => `
    <div style="font-size: 15px; font-weight: 900; margin: 4px 0; text-transform: uppercase;">
      ${it.quantity || 1}x ${escapeHtml(String(it.name || "Item").toUpperCase())}
      ${it.notes ? `<div style="font-size: 11px; font-weight: 600; color: #555; margin-left: 14px;">* ${escapeHtml(it.notes)}</div>` : ""}
    </div>
  `).join("");

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <style>
        @page { size: 58mm auto; margin: 2mm 0; }
        @media print {
          @page { size: 58mm auto; margin: 2mm 0; }
          html, body { width: 58mm !important; max-width: 58mm !important; margin: 0 auto !important; padding: 2mm 1mm !important; }
        }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; color: #000; padding: 6px; padding-bottom: 6px; max-width: 280px; margin: 0 auto; font-size: 13px; line-height: 1.25; }
        .center { text-align: center; }
        .title { font-size: 18px; font-weight: 900; text-transform: uppercase; margin-bottom: 2px; }
        .meta { font-size: 12px; font-weight: 700; color: #333; margin: 2px 0 4px; text-align: center; }
        hr { border: none; border-top: 1px dashed #000; margin: 4px 0; }
        .tear-spacer { height: 10px; width: 100%; }
      </style>
    </head>
    <body>
      <hr />
      <div class="center title">${escapeHtml(tableLabel)}</div>
      <div class="meta">#${escapeHtml(orderNo)} · ${escapeHtml(timeStr)}</div>
      <hr />
      <div style="margin: 6px 0;">
        ${itemsRows}
      </div>
      <hr />
      <div class="tear-spacer"></div>
    </body>
    </html>
  `;
}

export function billHtml(bill: any): string {
  const r = getRestaurantSnapshot(bill);
  const customLogo = getBillLogo(r);
  
  const billItems = (bill.items && bill.items.length > 0)
    ? bill.items
    : (bill.order?.items && bill.order.items.length > 0)
      ? bill.order.items
      : (bill.order_id || bill.order_ids)
        ? ((api.getCachedOrders() || []).find((o: any) => o.id === bill.order_id || (bill.order_ids && bill.order_ids.includes(o.id)))?.items || [])
        : [];

  const items = billItems.map(
    (it: any) => `
      <tr>
        <td class="l">${escapeHtml(it.name)}</td>
        <td class="r">${it.quantity}x</td>
        <td class="r">${formatCurrency(it.price || 0)}</td>
        <td class="r">${formatCurrency((it.price || 0) * (it.quantity || 1))}</td>
      </tr>`
  ).join("");

  const logoBlock = customLogo ? `<div style="text-align: center; margin-bottom: 6px;"><img class="logo" src="data:image/png;base64,${customLogo}" style="max-height: 56px; max-width: 120px; display: inline-block; object-fit: contain;" /></div>` : "";
  const isPaid = bill.status === "paid";
  const dateObj = new Date(bill.created_at || Date.now());
  const dateStr = dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const timeStr = dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const isTakeaway = String(bill.table_number || "").toLowerCase() === "takeaway" || String(bill.order_type || "").toLowerCase() === "takeaway";
  const rawTable = String(bill.table_number || "").trim();
  const tableText = isTakeaway ? "Takeaway" : (rawTable ? (rawTable.toUpperCase().startsWith("TABLE") ? rawTable : `Table ${rawTable}`) : "Dine-In");

  const totalVal = Number(bill.total || bill.subtotal || 0);
  const upiId = r.upi_id || r.upi || "8152075375-2@ybl";
  const merchant = r.merchant_name || r.name || "Master Chef";
  const upiUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(merchant)}&am=${totalVal.toFixed(2)}&cu=INR`;

  const phone1 = (r.phone || "").trim();
  const phone2 = (r.phone2 || "").trim();
  const phone = phone1 ? (phone2 && phone2 !== phone1 ? `${phone1} / ${phone2}` : phone1) : phone2;
  const gst = r.gst || r.gst_number || r.gstin || "";

  return `
    <!DOCTYPE html>
    <html><head><meta charset="utf-8" />
    <style>
      @page {
        size: 58mm auto;
        margin: 2mm 0;
      }
      @media print {
        @page {
          size: 58mm auto;
          margin: 2mm 0;
        }
        html, body {
          width: 58mm !important;
          max-width: 58mm !important;
          margin: 0 auto !important;
          padding: 2mm 1mm !important;
        }
      }
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; color: #111; padding: 6px; padding-bottom: 6px; max-width: 290px; margin: 0 auto; font-size: 12px; line-height: 1.3; }
      .center { text-align: center; }
      .l { text-align: left; }
      .r { text-align: right; }
      .title { font-size: 17px; margin: 2px 0 4px; text-transform: uppercase; font-weight: 900; text-align: center; letter-spacing: 0.5px; }
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
      <div class="center title">${escapeHtml(r.name || "Master Chef")}</div>
      ${r.address ? `<p class="sub">${escapeHtml(r.address)}</p>` : ""}
      ${phone ? `<p class="sub">Ph: ${escapeHtml(phone)}${gst ? ` | GST: ${escapeHtml(gst)}` : ""}</p>` : (gst ? `<p class="sub">GSTIN: ${escapeHtml(gst)}</p>` : "")}
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
            <th class="r" style="width: 32px;">QTY</th>
            <th class="r" style="width: 48px;">RATE</th>
            <th class="r" style="width: 58px;">AMOUNT</th>
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
      ` : ""}
      ${upiId ? `
        <div class="qr-block" style="text-align: center; margin: 12px auto; padding: 10px; background: #fafafa; border: 1px dashed #cbd5e1; border-radius: 8px; width: 220px;">
          <div style="font-size: 13px; font-weight: 800; color: #1e293b; margin-bottom: 4px;">${isPaid ? "UPI / Restaurant QR" : "Scan & Pay (UPI)"}</div>
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiUrl)}" style="width: 180px; height: 180px; display: block; margin: 0 auto;" />
          <div style="font-size: 12px; font-weight: 800; color: #0f172a; margin-top: 6px;">${escapeHtml(upiId)}</div>
          ${!isPaid ? `<div style="font-size: 11px; font-weight: 600; color: #64748b; margin-top: 2px;">Auto-fills ${formatCurrency(totalVal)}</div>` : ""}
        </div>
      ` : ""}
      <hr />
      
      <p class="footer">Thank you! Visit again. · EzBill</p>
      <div style="height: 10px; width: 100%;"></div>
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

export function closingReportHtml(session: any, restaurant?: any): string {
  const r = getRestaurantSnapshot(restaurant || session);
  const dateObj = new Date(session.closed_at || session.opened_at || Date.now());
  const dateStr = dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const openTime = session.opened_at ? new Date(session.opened_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : "-";
  const closeTime = session.closed_at ? new Date(session.closed_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : "In Progress";
  
  const expectedCash = Number(session.expected_cash || 0);
  const countedCash = Number(session.actual_cash_counted || session.counted_cash || 0);
  const variance = Number(session.discrepancy_amount || (countedCash - expectedCash));
  const denoms = session.cash_denominations || {};

  const denomRows = [
    { label: "₹500", count: denoms["500"] || 0, val: (denoms["500"] || 0) * 500 },
    { label: "₹200", count: denoms["200"] || 0, val: (denoms["200"] || 0) * 200 },
    { label: "₹100", count: denoms["100"] || 0, val: (denoms["100"] || 0) * 100 },
    { label: "₹50",  count: denoms["50"] || 0,  val: (denoms["50"] || 0) * 50 },
    { label: "₹20",  count: denoms["20"] || 0,  val: (denoms["20"] || 0) * 20 },
    { label: "₹10",  count: denoms["10"] || 0,  val: (denoms["10"] || 0) * 10 },
    { label: "Coins", count: "-", val: denoms["coins"] || 0 },
  ].filter(d => d.val > 0);

  const phone1 = (r.phone || "").trim();
  const phone2 = (r.phone2 || "").trim();
  const phone = phone1 ? (phone2 && phone2 !== phone1 ? `${phone1} / ${phone2}` : phone1) : phone2;
  const gst = r.gst || r.gst_number || r.gstin || "";

  return `
    <!DOCTYPE html>
    <html><head><meta charset="utf-8" />
    <style>
      @page { margin: 4mm 4mm 15mm 4mm; }
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; color: #111; padding: 8px; max-width: 320px; margin: 0 auto; font-size: 12px; line-height: 1.3; }
      .center { text-align: center; }
      .l { text-align: left; }
      .r { text-align: right; }
      h1 { font-size: 16px; margin: 2px 0; text-transform: uppercase; font-weight: 900; text-align: center; letter-spacing: 0.5px; }
      h2 { font-size: 13px; margin: 6px 0 2px; text-transform: uppercase; font-weight: 800; text-align: center; color: #333; }
      p.sub { font-size: 10.5px; color: #444; margin: 1px 0; text-align: center; }
      hr { border: none; border-top: 1px dashed #555; margin: 6px 0; }
      .meta { display: flex; justify-content: space-between; font-size: 11px; color: #333; margin: 2px 0; }
      table { width: 100%; border-collapse: collapse; margin-top: 3px; }
      th { font-size: 10.5px; font-weight: 800; border-bottom: 1px solid #222; padding: 2px 0; text-transform: uppercase; }
      td { padding: 3px 0; font-size: 11.5px; }
      .bold-row td { font-weight: 800; border-top: 1px solid #333; padding: 4px 0; }
      .variance-balanced { color: #047857; font-weight: 900; }
      .variance-shortage { color: #B91C1C; font-weight: 900; }
      .variance-overage { color: #D97706; font-weight: 900; }
      .footer { text-align: center; margin-top: 8px; font-size: 10px; color: #666; font-weight: 600; }
      .sign-line { margin-top: 25px; border-top: 1px solid #888; width: 140px; text-align: center; font-size: 10px; color: #444; }
    </style></head><body>
      <h1>${escapeHtml(r.name || "Master Chef")}</h1>
      ${r.address ? `<p class="sub">${escapeHtml(r.address)}</p>` : ""}
      ${phone ? `<p class="sub">Ph: ${escapeHtml(phone)}${gst ? ` | GST: ${escapeHtml(gst)}` : ""}</p>` : (gst ? `<p class="sub">GSTIN: ${escapeHtml(gst)}</p>` : "")}
      <hr />
      <h2>END-OF-DAY CLOSING REPORT</h2>
      <div class="meta">
        <span><b>Date:</b> ${escapeHtml(session.business_date || dateStr)}</span>
        <span><b>Shift ID:</b> #${String(session.id || session._id || "SESSION").slice(-6).toUpperCase()}</span>
      </div>
      <div class="meta">
        <span><b>Cashier:</b> ${escapeHtml(session.cashier_name || "Staff")}</span>
        <span>${escapeHtml(openTime)} - ${escapeHtml(closeTime)}</span>
      </div>
      <hr />

      <div style="font-weight: 800; font-size: 11px; margin-bottom: 2px;">CASH DRAWER RECONCILIATION</div>
      <table>
        <tr><td>Opening Float</td><td class="r">${formatCurrency(session.opening_float || 0)}</td></tr>
        <tr><td>(+) Cash Sales (${session.cash_sales_count || 0} bills)</td><td class="r">${formatCurrency(session.total_cash_sales || 0)}</td></tr>
        ${Number(session.cash_in || 0) > 0 ? `<tr><td>(+) Cash In (Additions)</td><td class="r">${formatCurrency(session.cash_in)}</td></tr>` : ""}
        ${Number(session.cash_refunds || 0) > 0 ? `<tr><td>(-) Cash Refunds</td><td class="r">-${formatCurrency(session.cash_refunds)}</td></tr>` : ""}
        ${Number(session.cash_out || 0) > 0 ? `<tr><td>(-) Cash Out (Payouts)</td><td class="r">-${formatCurrency(session.cash_out)}</td></tr>` : ""}
        ${Number(session.cash_drop || 0) > 0 ? `<tr><td>(-) Safe Drops</td><td class="r">-${formatCurrency(session.cash_drop)}</td></tr>` : ""}
        <tr class="bold-row"><td>Expected Drawer Cash</td><td class="r">${formatCurrency(expectedCash)}</td></tr>
        <tr><td>Counted Cash</td><td class="r"><b>${formatCurrency(countedCash)}</b></td></tr>
        <tr class="bold-row">
          <td>Variance (Discrepancy)</td>
          <td class="r ${variance === 0 ? "variance-balanced" : (variance < 0 ? "variance-shortage" : "variance-overage")}">
            ${variance === 0 ? "BALANCED (₹0.00)" : (variance < 0 ? `SHORTAGE (-${formatCurrency(Math.abs(variance))})` : `OVERAGE (+${formatCurrency(variance)})`)}
          </td>
        </tr>
      </table>
      <hr />

      ${denomRows.length > 0 ? `
        <div style="font-weight: 800; font-size: 11px; margin-bottom: 2px;">DENOMINATION BREAKDOWN</div>
        <table>
          ${denomRows.map(d => `<tr><td>${d.label}${d.count !== "-" ? ` x ${d.count}` : ""}</td><td class="r">${formatCurrency(d.val)}</td></tr>`).join("")}
          <tr class="bold-row"><td>Total Counted</td><td class="r">${formatCurrency(countedCash)}</td></tr>
        </table>
        <hr />
      ` : ""}

      <div style="font-weight: 800; font-size: 11px; margin-bottom: 2px;">COLLECTIONS SUMMARY</div>
      <table>
        <tr><td>Cash Total</td><td class="r">${formatCurrency(session.total_cash_sales || 0)}</td></tr>
        <tr><td>UPI Total (${session.upi_sales_count || 0} bills)</td><td class="r">${formatCurrency(session.total_upi_sales || 0)}</td></tr>
        <tr><td>Card Total (${session.card_sales_count || 0} bills)</td><td class="r">${formatCurrency(session.total_card_sales || 0)}</td></tr>
        ${Number(session.total_other_sales || 0) > 0 ? `<tr><td>Other Methods</td><td class="r">${formatCurrency(session.total_other_sales)}</td></tr>` : ""}
        <tr class="bold-row"><td>Gross Sales</td><td class="r">${formatCurrency(session.gross_sales || 0)}</td></tr>
        <tr><td>Total Taxes (GST)</td><td class="r">${formatCurrency(session.total_taxes || 0)}</td></tr>
        <tr><td>Total Discounts</td><td class="r">-${formatCurrency(session.total_discounts || 0)}</td></tr>
        <tr class="bold-row"><td>Net Revenue</td><td class="r">${formatCurrency(session.net_sales || session.gross_sales || 0)}</td></tr>
        <tr><td>Settled Bills</td><td class="r">${session.paid_bills_count || 0}</td></tr>
        ${Number(session.unpaid_bills_count || 0) > 0 ? `<tr><td style="color:#B91C1C;">Open / Unpaid Bills</td><td class="r" style="color:#B91C1C;">${session.unpaid_bills_count} (${formatCurrency(session.unpaid_bills_amount || 0)})</td></tr>` : ""}
      </table>
      <hr />

      ${session.discrepancy_reason ? `
        <div style="font-size: 10.5px; margin: 4px 0;">
          <b>Discrepancy Note:</b> ${escapeHtml(session.discrepancy_reason)}
        </div>
      ` : ""}

      ${session.is_approved ? `
        <div style="font-size: 10.5px; color: #047857; margin: 4px 0;">
          <b>Manager Approved:</b> ${escapeHtml(session.approved_by_name || "Manager")} ${session.approval_notes ? `(${escapeHtml(session.approval_notes)})` : ""}
        </div>
      ` : ""}

      <div style="display: flex; justify-content: space-between; margin-top: 20px;">
        <div class="sign-line">Cashier Signature</div>
        <div class="sign-line">Manager Signature</div>
      </div>

      <p class="footer">Printed from EzBill POS ERP</p>
      <div style="height: 25px;"></div>
    </body></html>
  `;
}

export async function formatClosingReceipt(session: any, width: number = 80): Promise<string> {
  const maxChars = width === 58 ? 32 : 48;
  const divider = "-".repeat(maxChars);
  const lines: string[] = [];

  const r = getRestaurantSnapshot(session);
  const restaurantName = (r.name || "Master Chef").toUpperCase();
  lines.push(`[C]<b><font size='big'>${restaurantName}</font></b>\n`);
  lines.push(`[C]<b>CLOSING SHIFT REPORT</b>\n`);
  lines.push(`[C]${divider}\n`);

  lines.push(`[L]Date: ${session.business_date || new Date().toISOString().split("T")[0]}[R]Shift: #${String(session.id || "000").slice(-6).toUpperCase()}\n`);
  lines.push(`[L]Cashier: ${session.cashier_name || "Staff"}\n`);
  lines.push(`[C]${divider}\n`);

  const expectedCash = Number(session.expected_cash || 0);
  const countedCash = Number(session.actual_cash_counted || session.counted_cash || 0);
  const variance = Number(session.discrepancy_amount || (countedCash - expectedCash));

  lines.push(`[L]Opening Float[R]${formatThermalMoney(session.opening_float || 0)}\n`);
  lines.push(`[L](+) Cash Sales[R]${formatThermalMoney(session.total_cash_sales || 0)}\n`);
  if (Number(session.cash_in || 0) > 0) lines.push(`[L](+) Cash In[R]${formatThermalMoney(session.cash_in)}\n`);
  if (Number(session.cash_refunds || 0) > 0) lines.push(`[L](-) Refunds[R]-${formatThermalMoney(session.cash_refunds)}\n`);
  if (Number(session.cash_out || 0) > 0) lines.push(`[L](-) Cash Out[R]-${formatThermalMoney(session.cash_out)}\n`);
  if (Number(session.cash_drop || 0) > 0) lines.push(`[L](-) Safe Drop[R]-${formatThermalMoney(session.cash_drop)}\n`);
  lines.push(`[C]${divider}\n`);

  lines.push(`[L]<b>Expected Cash</b>[R]<b>Rs.${formatThermalMoney(expectedCash)}</b>\n`);
  lines.push(`[L]<b>Counted Cash</b>[R]<b>Rs.${formatThermalMoney(countedCash)}</b>\n`);
  const varText = variance === 0 ? "Rs.0.00 (Balanced)" : (variance < 0 ? `-Rs.${formatThermalMoney(Math.abs(variance))} (Short)` : `+Rs.${formatThermalMoney(variance)} (Over)`);
  lines.push(`[L]<b>Variance</b>[R]<b>${varText}</b>\n`);
  lines.push(`[C]${divider}\n`);

  lines.push(`[L]UPI Total[R]Rs.${formatThermalMoney(session.total_upi_sales || 0)}\n`);
  lines.push(`[L]Card Total[R]Rs.${formatThermalMoney(session.total_card_sales || 0)}\n`);
  lines.push(`[L]<b>Gross Sales</b>[R]<b>Rs.${formatThermalMoney(session.gross_sales || 0)}</b>\n`);
  lines.push(`[L]Settled Bills[R]${session.paid_bills_count || 0}\n`);
  lines.push(`[C]${divider}\n`);
  lines.push(`[C]End of Day Close · EzBill POS\n`);
  lines.push(`\n\n\n\n`);

  return lines.join("");
}

export async function printClosingReport(session: any, restaurant?: any): Promise<boolean> {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  const settings = await getPrinterSettings("cashier");
  
  if (settings && settings.type !== "none" && settings.type !== "system") {
    const payload = await formatClosingReceipt(session, settings.width);
    if (Platform.OS === "web") {
      if (activeWebBluetoothCharacteristic || (activeWebBluetoothDevice && activeWebBluetoothDevice.gatt?.connected)) {
        try {
          const escPosBytes = convertThermalPayloadToEscPos(payload, settings.width, false, settings.darkness || "extra_dark");
          const success = await sendWebBluetoothPrint(escPosBytes);
          if (success) return true;
        } catch {}
      }
      const html = closingReportHtml(session, restaurant);
      printViaIframe(html);
      return true;
    }

    if (ThermalPrinterModule) {
      try {
        if (settings.type === "network") {
          await ThermalPrinterModule.printTcp({
            payload,
            ip: (settings.address || "").trim(),
            port: parseInt(settings.port || "9100"),
            printerWidthMM: (settings.width || 58) === 58 ? 48 : 72,
            printerNbrCharactersPerLine: (settings.width || 58) === 80 ? 48 : 32,
            autoCut: true,
            mmFeedPaper: 15,
          });
          return true;
        } else if (settings.type === "bluetooth") {
          await ThermalPrinterModule.printBluetooth({
            payload,
            macAddress: (settings.address || "").trim(),
            printerWidthMM: (settings.width || 58) === 58 ? 48 : 72,
            printerNbrCharactersPerLine: (settings.width || 58) === 80 ? 48 : 32,
            mmFeedPaper: 15,
          });
          return true;
        }
      } catch {}
    }
  }

  // Fallback to HTML print dialog / PDF
  const html = closingReportHtml(session, restaurant);
  if (Platform.OS === "web") {
    printViaIframe(html);
    return true;
  }
  await Print.printAsync({ html });
  return true;
}

