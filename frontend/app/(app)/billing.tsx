import { useCallback, useEffect, useState, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, SafeAreaView, StatusBar, BackHandler, Platform,
} from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { printBill, sharePdf, getPrinterSettings, DEFAULT_EZBILL_LOGO_BASE64, getBillLogo, formatCurrency } from "@/src/lib/print";
import { BillingEngine } from "@/src/lib/billingEngine";
import { useTheme } from "@/src/context/ThemeContext";
import { colors, spacing, radius } from "@/src/theme";
import { useResponsive } from "@/src/hooks/useResponsive";
import QRCode from "qrcode";

function base64Encode(str: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  let i = 0;
  const len = str.length;
  while (i < len) {
    const c1 = str.charCodeAt(i++) & 0xff;
    if (i === len) {
      out += chars.charAt(c1 >> 2);
      out += chars.charAt((c1 & 0x3) << 4);
      out += '==';
      break;
    }
    const c2 = str.charCodeAt(i++);
    if (i === len) {
      out += chars.charAt(c1 >> 2);
      out += chars.charAt(((c1 & 0x3) << 4) | ((c2 & 0xf0) >> 4));
      out += chars.charAt((c2 & 0xf) << 2);
      out += '=';
      break;
    }
    const c3 = str.charCodeAt(i++);
    out += chars.charAt(c1 >> 2);
    out += chars.charAt(((c1 & 0x3) << 4) | ((c2 & 0xf0) >> 4));
    out += chars.charAt(((c2 & 0xf) << 2) | ((c3 & 0xc0) >> 6));
    out += chars.charAt(c3 & 0x3f);
  }
  return out;
}

const normalizeTable = (val: string | undefined | null) => {
  if (!val) return "";
  let s = String(val).trim().toLowerCase();
  s = s.replace(/^(table|tbl)[\s\-_:]*/i, "");
  s = s.replace(/\s*-\s*/g, "-").replace(/\s+/g, " ").trim();
  return s;
};

const isSameTable = (a: string | undefined | null, b: string | undefined | null) => {
  if (!a || !b) return false;
  const strA = String(a).trim().toLowerCase();
  const strB = String(b).trim().toLowerCase();
  if (strA === strB) return true;
  const na = normalizeTable(a);
  const nb = normalizeTable(b);
  return na.length > 0 && na === nb;
};

export default function Billing() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const { orderId, tableNumber, orderIds, backTo, billId } = useLocalSearchParams<{ orderId?: string; tableNumber?: string; orderIds?: string; backTo?: string; billId?: string }>();

  // Synchronous cache lookup helper
  const computeInitialState = () => {
    const oList = api.getCachedOrders() || [];
    const bList = api.getCachedBills() || [];
    const r = api.getCachedRestaurant();
    const gst = r?.gst_enabled;
    const gstRate = Number(r?.gst_rate ?? 5);

    let initialOrder = null;
    let initialBill = null;

    if (billId) {
      const foundBill = bList.find((x: any) => x && x.id === billId);
      if (foundBill) {
        initialBill = foundBill;
        if (foundBill.order_id) {
          const foundOrd = oList.find((x: any) => x && x.id === foundBill.order_id);
          if (foundOrd) initialOrder = foundOrd;
        }
      }
    }

    if (orderId && !initialBill) {
      const targetOrderId = api.resolveTempId(orderId);
      const o = oList.find((x: any) => x.id === targetOrderId || x.id === orderId);
      initialOrder = o || null;
      const existing = bList.find((x: any) => (x.order_id === targetOrderId || x.order_id === orderId || (x.order_ids && (x.order_ids.includes(targetOrderId) || x.order_ids.includes(orderId)))) && x.status !== "cancelled");
      if (existing) {
        initialBill = existing;
      } else if (o) {
        const isOrderPaid = o.status === "paid" || o.status === "completed" || o.status === "served";
        const itemsToBill = o.items || [];
        const subtotalToBill = Number(o.subtotal || 0) || itemsToBill.reduce((acc: number, it: any) => acc + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
        const tax = gst ? Math.round(subtotalToBill * (gstRate / 100) * 100) / 100 : 0;
        const cgst = gst ? Math.round((tax / 2) * 100) / 100 : 0;
        const sgst = gst ? Math.round((tax - cgst) * 100) / 100 : 0;
        const total = Math.round((subtotalToBill + tax) * 100) / 100;
        initialBill = {
          id: "temp-" + Date.now(),
          order_id: targetOrderId,
          table_number: o.table_number || "",
          customer_name: o.customer_name || "Guest",
          items: itemsToBill,
          subtotal: subtotalToBill,
          tax_percent: gst ? gstRate : 0,
          tax: tax,
          cgst: cgst,
          sgst: sgst,
          gst_enabled: !!gst,
          discount: 0,
          total: total,
          status: isOrderPaid ? "paid" : "pending",
          restaurant_snapshot: r,
          created_at: o.created_at || new Date().toISOString(),
        };
      }
    } else if (tableNumber) {
      let targetOrderIds: string[] = [];
      try { if (orderIds) targetOrderIds = JSON.parse(orderIds); } catch {}

      const tOrders = oList.filter((x: any) => 
        (targetOrderIds.length > 0 ? (targetOrderIds.includes(x.id) || (x.id && targetOrderIds.some((tid: string) => api.resolveTempId(tid) === x.id || api.resolveTempId(x.id) === tid))) : isSameTable(x.table_number, tableNumber)) &&
        x.status !== "paid" && x.status !== "completed" && x.status !== "cancelled" && x.status !== "pending_scan"
      );

      if (tOrders.length > 0) {
        const itemsToBill = tOrders.flatMap((o: any) => o.items || []);
        const subtotalToBill = tOrders.reduce((sum: number, o: any) => {
          const sub = Number(o.subtotal || 0) || (o.items || []).reduce((acc: number, it: any) => acc + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
          return sum + sub;
        }, 0);
        initialOrder = {
          table_number: tableNumber,
          items: itemsToBill,
          subtotal: subtotalToBill,
          id: tOrders[0].id
        };
        const existingTableBill = bList.find((x: any) => 
          isSameTable(x.table_number, tableNumber) && 
          x.status === "pending" &&
          Math.abs(Number(x.subtotal || 0) - subtotalToBill) < 0.01
        );
        if (existingTableBill) {
          initialBill = existingTableBill;
        } else {
          const tax = gst ? Math.round(subtotalToBill * (gstRate / 100) * 100) / 100 : 0;
          const cgst = gst ? Math.round((tax / 2) * 100) / 100 : 0;
          const sgst = gst ? Math.round((tax - cgst) * 100) / 100 : 0;
          const total = Math.round((subtotalToBill + tax) * 100) / 100;
          initialBill = {
            id: "temp-" + Date.now(),
            order_id: tOrders[0].id,
            order_ids: tOrders.map((o: any) => o.id),
            table_number: tableNumber,
            items: itemsToBill,
            subtotal: subtotalToBill,
            tax_percent: gst ? gstRate : 0,
            tax: tax,
            cgst: cgst,
            sgst: sgst,
            gst_enabled: !!gst,
            discount: 0,
            total: total,
            status: "pending",
            restaurant_snapshot: r,
            created_at: new Date().toISOString(),
          };
        }
      }
    }

    return { initialOrder, initialBill };
  };

  const initial = computeInitialState();
  const [order, setOrder] = useState<any>(initial.initialOrder);
  const [restaurant, setRestaurant] = useState<any>(() => api.getCachedRestaurant() || null);
  const [bill, setBill] = useState<any>(initial.initialBill);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [qrUri, setQrUri] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  
  // Payment Modal state
  const [payModal, setPayModal] = useState(false);

  // 1. Immediately reset state on route param changes (Eliminates old bill flashing completely)
  useEffect(() => {
    const { initialOrder, initialBill } = computeInitialState();
    setOrder(initialOrder);
    setBill(initialBill);
  }, [orderId, tableNumber, orderIds]);

  useEffect(() => {
    const { subscribeToCache } = require("@/src/lib/api");
    const unsubscribe = subscribeToCache((path: string, data: any) => {
      if (path === "/restaurant" && data) setRestaurant(data);
      if (path === "/orders" || path === "/bills") {
        const oList = api.getCachedOrders() || [];
        const bList = api.getCachedBills() || [];
        if (orderId) {
          const foundO = oList.find((o: any) => o.id === orderId);
          if (foundO) setOrder(foundO);
        } else if (tableNumber) {
          const activeO = oList.find((o: any) => String(o.table_number).toLowerCase() === String(tableNumber).toLowerCase() && o.status !== "paid" && o.status !== "completed" && o.status !== "cancelled");
          if (activeO) setOrder(activeO);
        }
        if (orderId || tableNumber) {
          const targetOrdId = orderId || (order ? order.id : null);
          if (targetOrdId) {
            const foundB = bList.find((b: any) => b.order_id === targetOrdId || (b.order_ids && b.order_ids.includes(targetOrdId)));
            if (foundB) {
              setBill((prev: any) => {
                if (prev && prev.status === "paid" && foundB.status !== "paid") {
                  return prev; // NEVER revert a paid bill back to pending/open!
                }
                return foundB;
              });
            }
          }
        }
      }
    });
    return () => unsubscribe();
  }, [orderId, tableNumber, order]);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [orders, bills, r] = await Promise.all([
        api.listOrders().catch(() => []),
        api.listBills().catch(() => []),
        api.getRestaurant().catch(() => null)
      ]);
      if (r) setRestaurant(r);
      
      const targetOrderId = orderId ? api.resolveTempId(orderId) : "";
      
      let b: any = null;
      if (billId) {
        b = (bills || []).find((x: any) => x && x.id === billId) || (api.getCachedBills() || []).find((x: any) => x && x.id === billId);
      }

      if (orderId && targetOrderId) {
        // Individual order billing - STAGED ONLY TO THIS SPECIFIC ORDER
        const o = (orders || []).find((x: any) => x.id === targetOrderId || x.id === orderId) || (api.getCachedOrders() || []).find((x: any) => x.id === targetOrderId || x.id === orderId);
        if (o) setOrder(o);
        if (!b) {
          b = (bills || []).find((x: any) => 
            x.order_id === targetOrderId || x.order_id === orderId || (x.order_ids && (x.order_ids.includes(targetOrderId) || x.order_ids.includes(orderId)))
          ) || (api.getCachedBills() || []).find((x: any) => 
            x.order_id === targetOrderId || x.order_id === orderId || (x.order_ids && (x.order_ids.includes(targetOrderId) || x.order_ids.includes(orderId)))
          );
        }
        
        if (!b && o) {
          const isOrderPaid = o.status === "paid" || o.status === "completed" || o.status === "served";
          // Instant calculation without blocking UI
          const calc = BillingEngine.calculate({
            items: o.items || [],
            discount: 0,
            taxPercent: r?.gst_enabled ? (r.gst_rate || 5.0) : 0,
            gstEnabled: !!r?.gst_enabled
          });
          const localSeq = Math.random().toString(36).substring(2, 8);
          b = {
            id: "temp-bill-" + Math.random().toString(36).substring(2, 10),
            bill_number: `EZ-${new Date().getFullYear()}-${localSeq}`,
            order_id: o.id,
            order_ids: [o.id],
            table_number: o.table_number || "Takeaway",
            items: o.items || [],
            subtotal: calc.subtotal,
            tax_percent: r?.gst_enabled ? (r.gst_rate || 5.0) : 0,
            tax: calc.tax,
            cgst: calc.cgst,
            sgst: calc.sgst,
            gst_enabled: !!r?.gst_enabled,
            discount: calc.discount,
            total: calc.total,
            status: isOrderPaid ? "paid" : "pending",
            created_at: new Date().toISOString()
          };
          setBill((prev: any) => {
            if (prev && prev.status === "paid" && b.status !== "paid") return prev;
            return b;
          });

          if (!isOrderPaid && !api.isLocalProcessingMode() && !String(targetOrderId).startsWith("temp-")) {
            api.createBill({ order_id: targetOrderId }).then((createdBill: any) => {
              if (createdBill) {
                setBill((prev: any) => {
                  if (prev && prev.status === "paid" && createdBill.status !== "paid") return prev;
                  return createdBill;
                });
              }
            }).catch(() => {});
          }
        } else if (b) {
          setBill((prev: any) => {
            if (prev && prev.status === "paid" && b.status !== "paid") {
              return prev;
            }
            return b;
          });
        } else if (!o) {
          setErr("Order not found or already settled.");
        }
      } else if (tableNumber) {
        let targetOrderIds: string[] = [];
        try { if (orderIds) targetOrderIds = JSON.parse(orderIds); } catch {}

        // Combined table billing for Settle Entire Table
        const tableOrders = (orders || []).filter((x: any) => 
          (targetOrderIds.length > 0 ? (targetOrderIds.includes(x.id) || (x.id && targetOrderIds.some((tid: string) => api.resolveTempId(tid) === x.id || api.resolveTempId(x.id) === tid))) : isSameTable(x.table_number, tableNumber)) &&
          x.status !== "paid" && x.status !== "completed" && x.status !== "cancelled" && x.status !== "pending_scan"
        );
        const subtotalToBill = tableOrders.reduce((sum: number, o: any) => {
          const sub = Number(o.subtotal || 0) || (o.items || []).reduce((acc: number, it: any) => acc + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
          return sum + sub;
        }, 0);

        let b = (bills || []).find((x: any) => 
          isSameTable(x.table_number, tableNumber) && 
          x.status === "pending" &&
          Math.abs(Number(x.subtotal || 0) - subtotalToBill) < 0.01
        );

        if (!b && tableOrders.length > 0) {
          const combinedItems = tableOrders.flatMap((o: any) => o.items || []);
          const calc = BillingEngine.calculate({
            items: combinedItems,
            discount: 0,
            taxPercent: r?.gst_enabled ? (r.gst_rate || 5.0) : 0,
            gstEnabled: !!r?.gst_enabled
          });
          const localSeq = Math.random().toString(36).substring(2, 8);
          b = {
            id: "temp-bill-" + Math.random().toString(36).substring(2, 10),
            bill_number: `EZ-${new Date().getFullYear()}-${localSeq}`,
            order_id: tableOrders[0].id,
            order_ids: tableOrders.map((o: any) => o.id),
            table_number: tableNumber,
            items: combinedItems,
            subtotal: calc.subtotal,
            tax_percent: r?.gst_enabled ? (r.gst_rate || 5.0) : 0,
            tax: calc.tax,
            cgst: calc.cgst,
            sgst: calc.sgst,
            gst_enabled: !!r?.gst_enabled,
            discount: calc.discount,
            total: calc.total,
            status: "pending",
            created_at: new Date().toISOString()
          };

          if (!api.isLocalProcessingMode()) {
            const confirmedIds = tableOrders.map((o: any) => o.id).filter((id: string) => !String(id).startsWith("temp-"));
            if (confirmedIds.length > 0) {
              api.createBill({
                table_number: tableNumber,
                order_ids: confirmedIds
              }).then((createdBill: any) => {
                if (createdBill) setBill(createdBill);
              }).catch(() => {});
            }
          }
        }
        if (b) {
          setBill((prev: any) => {
            if (prev && prev.status === "paid" && b.status !== "paid") {
              return prev;
            }
            return b;
          });
          setOrder({ table_number: tableNumber, items: b.items || [], subtotal: b.subtotal || 0, id: b.order_id || (tableOrders[0] ? tableOrders[0].id : targetOrderId) });
        } else if (tableOrders.length > 0) {
          setOrder({ table_number: tableNumber, items: tableOrders.flatMap((o: any) => o.items || []), subtotal: subtotalToBill, id: tableOrders[0].id });
        } else {
          setErr(`No active orders found on Table ${tableNumber}`);
        }
      } else {
        setErr("No table or order specified for billing.");
      }
    } catch (e: any) { 
      setErr(e.message || "Failed to load bill details."); 
    }
  }, [orderId, tableNumber, orderIds]);

  const payModalRef = useRef(payModal);
  payModalRef.current = payModal;
  const backToRef = useRef(backTo);
  backToRef.current = backTo;
  const redirectTimeoutRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
      }
    };
  }, []);

  const handleBack = useCallback(() => {
    if (redirectTimeoutRef.current) {
      clearTimeout(redirectTimeoutRef.current);
    }
    if (payModalRef.current) {
      setPayModal(false);
      return true;
    }
    if (backToRef.current) {
      router.replace(backToRef.current as any);
    } else if (router.canGoBack()) {
      router.back();
    } else {
      const isTakeaway =
        String(tableNumber || "").trim().toLowerCase() === "takeaway" ||
        String(bill?.table_number || "").trim().toLowerCase() === "takeaway" ||
        String(order?.table_number || "").trim().toLowerCase() === "takeaway";
      router.replace(isTakeaway ? "/(app)/takeaway" : "/(app)/waiter");
    }
    return true;
  }, [router, tableNumber, bill?.table_number, order?.table_number]);

  useEffect(() => {
    const onBackPress = () => {
      return handleBack();
    };
    const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => subscription.remove();
  }, [handleBack]);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        return handleBack();
      };
      const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () => subscription.remove();
    }, [handleBack])
  );

  useEffect(() => {
    load();
  }, [orderId, tableNumber, orderIds, load]);

  const handleMarkPaidWithMethod = async (method: string) => {
    if (!bill) return;
    
    // Play haptic success immediately (0ms user feedback)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    
    const targetTbl = bill.table_number || order?.table_number || tableNumber;
    const isIndividualOrder = !!orderId;

    const activeItems = (bill?.items && bill.items.length > 0)
      ? bill.items
      : (order?.items && order.items.length > 0)
        ? order.items
        : [];
    const activeSubtotal = Number(bill?.subtotal || order?.subtotal || 0) || activeItems.reduce((s: number, it: any) => s + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
    const activeTotal = Number(bill?.total || activeSubtotal);

    // Optimistic UI updates
    const updatedLocalBill = {
      ...bill,
      items: activeItems,
      subtotal: activeSubtotal,
      total: activeTotal,
      table_number: targetTbl,
      customer_name: bill?.customer_name || order?.customer_name || "Guest",
      status: "paid",
      payment_method: method,
      restaurant_snapshot: bill?.restaurant_snapshot || restaurant || api.getCachedRestaurant()
    };
    setBill(updatedLocalBill);
    setPayModal(false);
    
    // Update local cache
    api.updateCachedBill(bill.id, updatedLocalBill);
    const oList = api.getCachedOrders() || [];

    if (api.isLocalProcessingMode && api.isLocalProcessingMode()) {
      if (isIndividualOrder) {
        api.markBillPaid(updatedLocalBill, method).catch(() => {});
      } else {
        const targetOrderIds = bill?.order_ids || (order?.id ? [order.id] : undefined);
        const finalAmt = Number(bill?.total || order?.subtotal || 0);
        if (targetTbl && targetTbl !== "Takeaway") {
          api.settleTable(targetTbl, method, targetOrderIds, finalAmt).catch(() => {});
        } else {
          api.markBillPaid(updatedLocalBill, method).catch(() => {});
        }
      }
    } else if (isIndividualOrder) {
      // 1. INDIVIDUAL ORDER MARK PAID: Update ONLY the specific order paid!
      let targetOid = api.resolveTempId(orderId || bill.order_id);
      let realBillId = api.resolveTempId(bill.id);

      if (targetOid && targetOid.startsWith("temp-")) {
        const resolved = await api.resolvePendingOrder(targetOid);
        if (resolved && resolved.id) {
          targetOid = resolved.id;
          api.setTempIdMapping(orderId || bill.order_id, resolved.id);
        }
      }

      const updatedOrders = oList.map((o: any) => {
        if (o.id === targetOid || o.id === orderId || o.id === bill.order_id || (bill.order_ids && bill.order_ids.includes(o.id))) {
          return { ...o, status: "paid" };
        }
        return o;
      });
      api.setCachedOrders(updatedOrders);

      // If still temp ID, create the order on the backend first!
      if ((!targetOid || targetOid.startsWith("temp-")) && (!realBillId || realBillId.startsWith("temp-"))) {
        try {
          const created = await api.createOrder({
            table_number: bill.table_number || "Takeaway",
            items: bill.items || order?.items || [],
            notes: "Takeaway"
          }, targetOid);
          targetOid = created.id;
          api.setTempIdMapping(orderId || bill.order_id, created.id);
        } catch {}
      }

      // Perform targeted mutation for both bill and order
      const mutationId = (!realBillId || realBillId.startsWith("temp-")) ? targetOid : realBillId;
      if (mutationId && !mutationId.startsWith("temp-")) {
        api.markBillPaid(mutationId, method).catch((e: any) => {
          console.warn("Individual markBillPaid sync failed:", e.message);
        });
      }
      if (bill.id && !String(bill.id).startsWith("temp-") && bill.id !== mutationId) {
        api.markBillPaid(bill.id, method).catch(() => {});
      }
      if (targetOid && !String(targetOid).startsWith("temp-") && targetOid !== mutationId) {
        api.markBillPaid(targetOid, method).catch(() => {});
      }
    } else {
      // 2. SETTLE ENTIRE TABLE: Update all active orders on that table to PAID!
      const targetOrderIds = bill?.order_ids || (order?.id ? [order.id] : undefined);
      const updatedOrders = oList.map((o: any) => {
        if ((targetOrderIds && targetOrderIds.includes(o.id)) || (targetTbl && isSameTable(o.table_number, targetTbl))) {
          return { ...o, status: "paid" };
        }
        return o;
      });
      api.setCachedOrders(updatedOrders);

      // Perform single table settlement mutation
      if (targetTbl && targetTbl !== "Takeaway") {
        const finalAmt = Number(bill?.total || order?.subtotal || 0);
        api.settleTable(targetTbl, method, targetOrderIds, finalAmt).catch((e: any) => {
          console.warn("Table settlement sync failed:", e.message);
        });
      } else {
        api.markBillPaid(bill.id, method).catch(() => {});
      }
    }

    // Auto-print receipt optimistically if cashier printer is configured for auto-print
    const triggerAutoPrint = async () => {
      try {
        const settings = await getPrinterSettings("cashier");
        if (settings && settings.type !== "none" && settings.auto_print) {
          await printBill(updatedLocalBill);
        }
      } catch (printErr) {
        console.warn("Auto-print error:", printErr);
      }
    };
    triggerAutoPrint();

    // Redirect to Takeaway (for next billing) or Tables section
    const isTakeawayBill =
      String(targetTbl || "").trim().toLowerCase() === "takeaway" ||
      String(bill?.table_number || "").trim().toLowerCase() === "takeaway" ||
      String(order?.table_number || "").trim().toLowerCase() === "takeaway" ||
      String(tableNumber || "").trim().toLowerCase() === "takeaway" ||
      backTo === "/(app)/takeaway" ||
      (typeof backTo === "string" && backTo.includes("takeaway"));

    const targetRoute = isTakeawayBill ? "/(app)/takeaway" : (backTo ? (backTo as any) : "/(app)/waiter");

    if (redirectTimeoutRef.current) clearTimeout(redirectTimeoutRef.current);
    const navDelay = Platform.OS === "web" ? 1200 : 500;
    redirectTimeoutRef.current = setTimeout(() => {
      router.replace(targetRoute as any);
    }, navDelay);
  };

  const doPrint = async () => {
    if (!bill) return;
    try {
      const activeItems = (bill?.items && bill.items.length > 0)
        ? bill.items
        : (order?.items && order.items.length > 0)
          ? order.items
          : [];
      const activeSubtotal = Number(bill?.subtotal || order?.subtotal || 0) || activeItems.reduce((s: number, it: any) => s + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
      const activeTotal = Number(bill?.total || activeSubtotal);

      const printableBill = {
        ...bill,
        items: activeItems,
        subtotal: activeSubtotal,
        total: activeTotal,
        table_number: bill?.table_number || order?.table_number || tableNumber || "Takeaway",
        customer_name: bill?.customer_name || order?.customer_name || "Guest",
        restaurant_snapshot: bill.restaurant_snapshot || restaurant || api.getCachedRestaurant()
      };
      await printBill(printableBill);
    }
    catch (e: any) { setErr(`Print failed: ${e.message}`); }
  };

  const billNo = bill?.bill_number || order?.order_number || "40";
  const tableName = order?.table_number ? (order.table_number === "Takeaway" ? "Takeaway" : `Table ${order.table_number}`) : "Takeaway";
  const dateStr = bill?.created_at ? new Date(bill.created_at).toLocaleString() : new Date().toLocaleString();
  const isPaid = bill?.status === "paid";
  const restaurantName = (bill?.restaurant_snapshot?.name) || restaurant?.name || "Master Chef";
  const restaurantAddress = (bill?.restaurant_snapshot?.address) || restaurant?.address || "";
  const restaurantPhone = (bill?.restaurant_snapshot?.phone) || restaurant?.phone || "";
  const restaurantPhone2 = (bill?.restaurant_snapshot?.phone2) || restaurant?.phone2 || "";
  const logoBase64 = getBillLogo(bill?.restaurant_snapshot || restaurant);
  const upiId = restaurant?.upi_id || "8152075375-2@ybl";
  const totalAmt = bill?.total || order?.subtotal || 760;
  const itemsList = bill?.items || order?.items || [];

  // Local QR Code Generator (runs instantly in < 1ms offline without canvas dependencies)
  useEffect(() => {
    const upi = bill?.upi_url || `upi://pay?pa=${upiId}&pn=${encodeURIComponent(restaurantName)}&am=${totalAmt}&cu=INR`;
    if (upi) {
      QRCode.toString(upi, { type: 'svg', margin: 1, width: 220 })
        .then(svgString => {
          const b64 = base64Encode(svgString);
          setQrUri(`data:image/svg+xml;base64,${b64}`);
        })
        .catch(() => {});
    }
  }, [bill?.upi_url, upiId, restaurantName, totalAmt]);

  if (!order && !bill) {
    return (
      <View style={[styles.wrap, { paddingTop: insets.top, justifyContent: "center", alignItems: "center", padding: 24 }]}>
        {err ? (
          <>
            <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
            <Text style={{ color: "#EF4444", marginTop: spacing.md, textAlign: "center", fontWeight: "600" }}>{err}</Text>
            <Pressable onPress={load} style={{ marginTop: 16, backgroundColor: "#635BFF", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 }}>
              <Text style={{ color: "#FFF", fontWeight: "700" }}>Retry</Text>
            </Pressable>
          </>
        ) : (
          <>
             <ActivityIndicator size="large" color="#635BFF" />
             <Text style={{ color: theme.onSurfaceSecondary, marginTop: spacing.md }}>Loading bill details…</Text>
          </>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.surface }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.surface} />
      <View style={[styles.wrap, { paddingTop: insets.top, backgroundColor: theme.surface }]} testID="billing-screen">
        
        {/* Header Bar matching Image 2 & 3 */}
        <View style={styles.header}>
          <Pressable 
            onPress={handleBack} 
            style={[styles.backBtn, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]} 
            testID="billing-back-btn" 
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={24} color={theme.onSurface} />
          </Pressable>
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={[styles.title, { color: theme.onSurface }]}>Bill #{billNo}</Text>
            <Text style={[styles.subTitle, { color: theme.onSurfaceSecondary }]}>{tableName} · {dateStr}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={[styles.statusBadge, { backgroundColor: isPaid ? "#DCFCE7" : "#FEF3C7" }]}>
              <Text style={[styles.statusBadgeText, { color: isPaid ? "#10B981" : "#F59E0B" }]}>
                {isPaid ? "PAID" : "OPEN"}
              </Text>
            </View>
          </View>
        </View>

        <ScrollView 
          contentContainerStyle={{ 
            padding: spacing.lg, 
            paddingBottom: 160,
            alignItems: isDesktop ? "center" : undefined,
          }} 
          showsVerticalScrollIndicator={false}
        >
          <View style={[
            styles.billCard, 
            { 
              backgroundColor: theme.surfaceSecondary, 
              borderColor: theme.border,
              width: "100%",
              maxWidth: isDesktop ? 640 : undefined,
            }
          ]}>
            
            {/* Centered Logo block */}
            {!!logoBase64 && (
              <View style={{ alignItems: "center", marginBottom: spacing.sm }}>
                <Image
                  source={{ uri: `data:image/png;base64,${logoBase64}` }}
                  style={styles.previewLogo}
                  contentFit="contain"
                />
              </View>
            )}

            <Text style={[styles.restaurantHeaderTitle, { color: theme.onSurface }]}>{restaurantName}</Text>
            {!!restaurantAddress && (
              <Text style={[styles.restaurantSubText, { color: theme.onSurfaceSecondary }]} numberOfLines={2}>{restaurantAddress}</Text>
            )}
            {(restaurantPhone || (bill?.restaurant_snapshot?.gst || restaurant?.gst)) ? (
              <Text style={[styles.restaurantSubText, { color: theme.onSurfaceSecondary }]}>
                {[
                  restaurantPhone ? `Ph: ${restaurantPhone}${restaurantPhone2 && restaurantPhone2 !== restaurantPhone ? ` / ${restaurantPhone2}` : ''}` : '',
                  (bill?.restaurant_snapshot?.gst || restaurant?.gst) ? `GST: ${bill?.restaurant_snapshot?.gst || restaurant?.gst}` : ''
                ].filter(Boolean).join(" · ")}
              </Text>
            ) : null}
            
            <View style={styles.divider} />

            {/* Metadata Rows */}
            <View style={{ gap: 2, marginBottom: spacing.xs }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={[styles.metaText, { color: theme.onSurfaceSecondary }]}>Bill #{billNo}</Text>
                <Text style={[styles.metaText, { color: theme.onSurfaceSecondary }]}>{dateStr}</Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={[styles.metaText, { color: theme.onSurfaceSecondary }]}>{tableName}</Text>
                {!!(bill?.customer_name || order?.customer_name) && (bill?.customer_name !== "Guest" && order?.customer_name !== "Guest") ? (
                  <Text style={[styles.metaText, { color: theme.onSurfaceSecondary }]}>Guest: {bill?.customer_name || order?.customer_name}</Text>
                ) : null}
              </View>
            </View>

            <View style={styles.divider} />

            {/* Mathematically Aligned Column Header */}
            <View style={styles.previewHeaderRow}>
              <Text style={[styles.previewHeaderCell, { color: theme.onSurfaceSecondary, flex: 1, textAlign: "left" }]}>ITEM</Text>
              <Text style={[styles.previewHeaderCell, { color: theme.onSurfaceSecondary, width: 32, textAlign: "right" }]}>QTY</Text>
              <Text style={[styles.previewHeaderCell, { color: theme.onSurfaceSecondary, width: 64, textAlign: "right" }]}>RATE</Text>
              <Text style={[styles.previewHeaderCell, { color: theme.onSurfaceSecondary, width: 72, textAlign: "right" }]}>AMOUNT</Text>
            </View>

            <View style={styles.divider} />
            
            {/* Items List */}
            <View style={{ marginVertical: 2, gap: 4 }}>
              {itemsList.map((it: any, idx: number) => (
                <View key={idx} style={styles.previewItemRow}>
                  <Text style={[styles.itemNameText, { color: theme.onSurface, flex: 1, textAlign: "left" }]} numberOfLines={1}>{it.name}</Text>
                  <Text style={[styles.itemQtyText, { color: theme.onSurfaceSecondary, width: 32, textAlign: "right" }]}>{it.quantity}x</Text>
                  <Text style={[styles.itemRateText, { color: theme.onSurfaceSecondary, width: 64, textAlign: "right" }]}>{formatCurrency(it.price)}</Text>
                  <Text style={[styles.itemPriceText, { color: theme.onSurface, width: 72, textAlign: "right" }]}>{formatCurrency(it.price * it.quantity)}</Text>
                </View>
              ))}
            </View>

            <View style={styles.divider} />

            {/* Totals Section */}
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLbl, { color: theme.onSurfaceSecondary }]}>Subtotal</Text>
              <Text style={[styles.summaryVal, { color: theme.onSurface }]}>{formatCurrency(bill?.subtotal || order?.subtotal || totalAmt)}</Text>
            </View>
            
            {!!(bill?.discount || order?.discount) && (
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLbl, { color: theme.onSurfaceSecondary }]}>Discount</Text>
                <Text style={[styles.summaryVal, { color: theme.onSurface }]}>-{formatCurrency(bill?.discount || order?.discount || 0)}</Text>
              </View>
            )}

            {!!(bill?.gst_enabled || order?.gst_enabled) && ((Number(bill?.cgst || 0) + Number(bill?.sgst || 0)) > 0) && (
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLbl, { color: theme.onSurfaceSecondary }]}>GST (Taxes)</Text>
                <Text style={[styles.summaryVal, { color: theme.onSurface }]}>{formatCurrency(Number(bill?.cgst || 0) + Number(bill?.sgst || 0))}</Text>
              </View>
            )}

            <View style={styles.divider} />
            <View style={styles.totalRow}>
              <Text style={[styles.totalLbl, { color: theme.onSurface }]}>TOTAL</Text>
              <Text style={[styles.totalVal, { color: theme.onSurface }]} testID="bill-total">{formatCurrency(totalAmt)}</Text>
            </View>

            {isPaid && (
              <>
                <View style={styles.divider} />
                <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: theme.onSurfaceSecondary }}>Payment: {(bill?.payment_method || "CASH").toUpperCase()}</Text>
                  <Text style={{ fontSize: 13, fontWeight: "800", color: theme.onSurface }}>{formatCurrency(totalAmt)}</Text>
                </View>
              </>
            )}

            {/* Always Crisp Black & White UPI QR Container */}
            {!isPaid && (
              <View style={[styles.upiBox, { backgroundColor: isDark ? "#1E2235" : "#FFFFFF", borderColor: theme.border }]}>
                <Text style={styles.upiTitle}>Scan & Pay (UPI)</Text>
                {qrUri ? (
                  <Image source={{ uri: qrUri }} style={styles.qrCodeImg} contentFit="contain" testID="bill-qr-image" />
                ) : (
                  <View style={[styles.qrCodeImg, { justifyContent: "center", alignItems: "center", backgroundColor: "#F8FAFC" }]}>
                    <ActivityIndicator color="#635BFF" />
                  </View>
                )}
                <Text style={[styles.upiIdText, { color: theme.onSurface }]}>{upiId}</Text>
                <Text style={[styles.upiSubText, { color: theme.onSurfaceSecondary }]}>Auto-fills {formatCurrency(totalAmt)}</Text>
              </View>
            )}
          </View>
        </ScrollView>

        {err && <Text style={styles.err} testID="billing-error">{err}</Text>}

        {/* Bottom Action Bar matching Image 2 & 3 */}
        <View style={[
          styles.bottomActionBar, 
          { 
            backgroundColor: theme.surfaceSecondary, 
            borderTopColor: theme.border, 
            paddingBottom: insets.bottom + spacing.md,
            justifyContent: isDesktop ? "center" : "flex-start",
          }
        ]}>
          <View style={{
            flexDirection: "row",
            gap: spacing.md,
            width: "100%",
            maxWidth: isDesktop ? 640 : undefined,
          }}>
            <Pressable style={[styles.printBtn, { backgroundColor: isDark ? "rgba(99,91,255,0.15)" : "#F1F0FF", borderColor: isDark ? "rgba(99,91,255,0.2)" : "rgba(99,91,255,0.15)" }]} onPress={doPrint} testID="bill-print-btn">
              <Ionicons name="print-outline" size={20} color="#635BFF" />
              <Text style={styles.printBtnText}>Print</Text>
            </Pressable>

            {!isPaid ? (
              <Pressable style={styles.markPaidBtn} onPress={() => setPayModal(true)} testID="bill-mark-paid-btn">
                <Text style={styles.markPaidBtnText}>Mark Paid  ✓</Text>
              </Pressable>
            ) : (
              <Pressable 
                style={[styles.alreadyPaidBadge, { backgroundColor: theme.success }]}
                onPress={() => {
                  if (redirectTimeoutRef.current) clearTimeout(redirectTimeoutRef.current);
                  const isTakeaway =
                    String(bill?.table_number || order?.table_number || tableNumber || "").trim().toLowerCase() === "takeaway" ||
                    backTo === "/(app)/takeaway" ||
                    (typeof backTo === "string" && backTo.includes("takeaway"));
                  const targetRoute = isTakeaway ? "/(app)/takeaway" : (backTo ? (backTo as any) : "/(app)/waiter");
                  router.replace(targetRoute as any);
                }}
                testID="bill-already-paid-btn"
              >
                <Ionicons name="checkmark-circle" size={20} color={theme.onSuccess} />
                <Text style={[styles.alreadyPaidText, { color: theme.onSuccess }]}>Payment Complete</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Payment Method Selection Modal matching Image 3 */}
        <Modal transparent visible={payModal} animationType="slide" onRequestClose={() => setPayModal(false)}>
          <Pressable 
            style={[
              styles.modalBg,
              isDesktop && { justifyContent: "center", alignItems: "center", padding: spacing.xl }
            ]} 
            onPress={() => setPayModal(false)}
          >
            <Pressable 
              style={[
                styles.modalCard, 
                { 
                  backgroundColor: theme.surfaceSecondary, 
                  paddingBottom: isDesktop ? spacing.xl : insets.bottom + spacing.xl,
                  width: isDesktop ? 480 : "100%",
                  borderRadius: isDesktop ? 20 : undefined,
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                  borderWidth: isDesktop ? 1 : 0,
                  borderColor: theme.border,
                }
              ]} 
              onPress={() => {}}
            >
              <View style={[styles.modalHandle, { backgroundColor: theme.borderStrong }]} />
              <Text style={[styles.modalTitle, { color: theme.onSurface }]}>Mark paid by</Text>

              <View style={styles.methodsRow}>
                <Pressable
                  style={[styles.methodCard, { backgroundColor: isDark ? "rgba(99,91,255,0.15)" : "#F1F0FF", borderColor: isDark ? "rgba(99,91,255,0.2)" : "rgba(99,91,255,0.15)" }]}
                  onPress={() => handleMarkPaidWithMethod("CASH")}
                >
                  <Ionicons name="cash-outline" size={28} color="#635BFF" />
                  <Text style={styles.methodText}>CASH</Text>
                </Pressable>

                <Pressable
                  style={[styles.methodCard, { backgroundColor: isDark ? "rgba(99,91,255,0.15)" : "#F1F0FF", borderColor: isDark ? "rgba(99,91,255,0.2)" : "rgba(99,91,255,0.15)" }]}
                  onPress={() => handleMarkPaidWithMethod("CARD")}
                >
                  <Ionicons name="card-outline" size={28} color="#635BFF" />
                  <Text style={styles.methodText}>CARD</Text>
                </Pressable>

                <Pressable
                  style={[styles.methodCard, { backgroundColor: isDark ? "rgba(99,91,255,0.15)" : "#F1F0FF", borderColor: isDark ? "rgba(99,91,255,0.2)" : "rgba(99,91,255,0.15)" }]}
                  onPress={() => handleMarkPaidWithMethod("UPI")}
                >
                  <Ionicons name="qr-code-outline" size={28} color="#635BFF" />
                  <Text style={styles.methodText}>UPI</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F8F9FD" },
  wrap: { flex: 1, backgroundColor: "#F8F9FD" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2E8F0", justifyContent: "center", alignItems: "center" },
  title: { color: "#0F172A", fontSize: 24, fontWeight: "900" },
  subTitle: { color: "#64748B", fontSize: 13, marginTop: 2, fontWeight: "500" },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill },
  statusBadgeText: { fontSize: 12, fontWeight: "900", letterSpacing: 0.5 },

  billCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "rgba(0,0,0,0.03)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 2,
  },
  restaurantHeaderTitle: { color: "#0F172A", fontSize: 18, fontWeight: "900", textAlign: "center", marginBottom: 2 },
  restaurantSubText: { color: "#64748B", fontSize: 12, textAlign: "center", marginBottom: 2, fontWeight: "500" },
  itemRow: { flexDirection: "row", alignItems: "center", paddingVertical: 2 },
  itemQty: { color: "#635BFF", fontSize: 14, fontWeight: "800", width: 32 },
  itemName: { color: "#0F172A", fontSize: 14, fontWeight: "600", flex: 1 },
  itemPrice: { color: "#0F172A", fontSize: 14, fontWeight: "700" },
  divider: { height: 1, backgroundColor: "#F1F5F9", marginVertical: 8 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 1 },
  summaryLbl: { color: "#64748B", fontSize: 13.5, fontWeight: "500" },
  summaryVal: { color: "#0F172A", fontSize: 14.5, fontWeight: "800" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 2 },
  totalLbl: { color: "#0F172A", fontSize: 16, fontWeight: "900", letterSpacing: 0.5 },
  totalVal: { color: "#0F172A", fontSize: 20, fontWeight: "900" },

  upiBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    width: "100%",
    maxWidth: 320,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 2,
  },
  upiTitle: { color: "#635BFF", fontSize: 14, fontWeight: "900", marginBottom: 2 },
  qrCodeImg: { width: 200, height: 200, marginVertical: 6, alignSelf: "center", borderRadius: radius.md },
  upiIdText: { color: "#0F172A", fontSize: 13, fontWeight: "800", marginTop: 4 },
  upiSubText: { color: "#64748B", fontSize: 11, fontWeight: "600", marginTop: 1 },

  bottomActionBar: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#FFFFFF", flexDirection: "row", padding: spacing.lg, gap: spacing.md, borderTopWidth: 1, borderTopColor: "#E2E8F0" },
  printBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 16, borderRadius: radius.lg, backgroundColor: "#F1F0FF", borderWidth: 1, borderColor: "rgba(99,91,255,0.2)" },
  printBtnText: { color: "#635BFF", fontSize: 15, fontWeight: "800" },
  markPaidBtn: { flex: 1.5, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 16, borderRadius: radius.lg, backgroundColor: "#635BFF" },
  markPaidBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  alreadyPaidBadge: { flex: 1.5, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 16, borderRadius: radius.lg, backgroundColor: "#ECFDF5" },
  alreadyPaidText: { color: "#10B981", fontSize: 15, fontWeight: "800" },

  err: { color: colors.onError, backgroundColor: colors.error, margin: spacing.lg, padding: spacing.md, borderRadius: radius.md },

  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#FFFFFF", padding: spacing.xl, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: spacing.md },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#CBD5E1", alignSelf: "center", marginBottom: spacing.xs },
  modalTitle: { color: "#0F172A", fontSize: 20, fontWeight: "900", marginBottom: spacing.xs },
  methodsRow: { flexDirection: "row", gap: spacing.md },
  methodCard: { flex: 1, aspectRatio: 1, backgroundColor: "#F1F0FF", borderRadius: radius.xl, alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: "rgba(99,91,255,0.15)" },
  methodText: { color: "#635BFF", fontSize: 14, fontWeight: "800" },
  previewLogo: { width: 80, height: 80, borderRadius: 12 },
  metaText: { fontSize: 13, fontWeight: "600" },
  previewHeaderRow: { flexDirection: "row", alignItems: "center", paddingVertical: 4 },
  previewHeaderCell: { fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
  previewItemRow: { flexDirection: "row", alignItems: "center", paddingVertical: 4 },
  itemNameText: { fontSize: 14, fontWeight: "600" },
  itemQtyText: { fontSize: 14, fontWeight: "600" },
  itemRateText: { fontSize: 14, fontWeight: "600" },
  itemPriceText: { fontSize: 14, fontWeight: "700" },
});
