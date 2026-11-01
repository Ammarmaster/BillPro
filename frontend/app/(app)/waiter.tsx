import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, FlatList, ActivityIndicator, SafeAreaView, StatusBar, PanResponder, Dimensions, Animated as RNAnimated, Alert, BackHandler,
} from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeInDown, FadeInUp, useAnimatedStyle, useSharedValue, withSpring,
} from "react-native-reanimated";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { menuItemImageSource } from "@/src/lib/foodImage";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/context/ThemeContext";
import { useNotifications } from "@/src/context/NotificationContext";
import { colors, spacing, radius } from "@/src/theme";
import { getPrinterSettings, printKitchenKOT } from "@/src/lib/print";
import OrderQRScannerModal from "@/src/components/OrderQRScannerModal";
import SyncStatusIndicator from "@/src/components/SyncStatusIndicator";
import { isTodayBusinessDay } from "@/src/lib/dateUtils";
import { useResponsive } from "@/src/hooks/useResponsive";
type Cat = { id: string; name: string };
type Item = { id: string; category_id: string; name: string; price: number; description: string; image_base64?: string; image_url?: string };
type Table = { id: string; label: string; seats: number };
type Line = { menu_item_id: string; name: string; price: number; quantity: number; notes: string };

const AnimText = Animated.createAnimatedComponent(Text);

export default function WaiterScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { logout } = useAuth();
  const { theme, isDark } = useTheme();
  const { table: tableParam } = useLocalSearchParams<{ table?: string }>();
  const { width, isDesktop, isLargeDesktop } = useResponsive();

  // Responsive column layout taking into account DesktopSidebar (~250px on desktop web)
  const availableWidth = isDesktop ? width - 250 : width;
  const tableCols = availableWidth >= 1300 ? 5 : availableWidth >= 920 ? 4 : availableWidth >= 600 ? 3 : 2;

  const dedupeTables = (tbls: Table[]): Table[] => {
    if (!Array.isArray(tbls)) return [];
    const seen = new Set<string>();
    const filtered = tbls.filter(t => {
      const k = String(t.label || t.id).trim().toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return filtered.sort((a, b) => {
      const numA = parseInt(String(a.label).replace(/\D/g, ""), 10);
      const numB = parseInt(String(b.label).replace(/\D/g, ""), 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return String(a.label).localeCompare(String(b.label));
    });
  };

  const [cats, setCats] = useState<Cat[]>(() => api.getCachedCategories() || []);
  const [items, setItems] = useState<Item[]>(() => api.getCachedMenu() || []);
  const [tables, setTables] = useState<Table[]>(() => {
    const raw = api.getCachedTables() || [];
    return dedupeTables(raw);
  });
  const [orders, setOrders] = useState<any[]>(() => api.getCachedOrders() || []);
  const [bills, setBills] = useState<any[]>(() => api.getCachedBills() || []);
  
  const [selCat, setSelCat] = useState<string | "all">("all");
  const [search, setSearch] = useState("");
  const [table, setTable] = useState(tableParam || "");
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false); // 0ms Instant table display
  useEffect(() => {
    const { subscribeToCache } = require("@/src/lib/api");
    const unsubscribe = subscribeToCache((path: string, data: any) => {
      if (path === "/categories" && data) setCats(data);
      if (path === "/menu-items" && data) setItems(data);
      if (path === "/tables" && data) setTables(dedupeTables(data));
      if (path === "/orders" && data) setOrders(data);
      if (path === "/bills" && data) setBills(data);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Guest session tracking for multi-customer tables
  const [currentGuestName, setCurrentGuestName] = useState("Guest 1");
  const [currentSessionId, setCurrentSessionId] = useState("");
  const [showGuestPicker, setShowGuestPicker] = useState(false);

  // Scanner modal state for Customer Web Order QR handoff
  const [showScanner, setShowScanner] = useState(false);

  // View state: 'tables' | 'order_details' | 'menu_order'
  const [viewMode, setViewMode] = useState<"tables" | "order_details" | "menu_order">("tables");
  const [selectedTableObj, setSelectedTableObj] = useState<Table | null>(null);
  const [activeOrder, setActiveOrder] = useState<any | null>(null);

  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handleScanImport = async (confirmedOrder: any, tableNum?: string) => {
    setShowScanner(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    
    const assignedTable = tableNum || confirmedOrder.table_number || "1";
    const finalOrder = { ...confirmedOrder, table_number: assignedTable };

    // 1. Optimistically insert/update the confirmed order in local state
    setOrders(prev => {
      const filtered = prev.filter(o => o.id !== finalOrder.id);
      return [finalOrder, ...filtered];
    });

    // 2. Mark the table as occupied locally
    setTables(prev =>
      prev.map(t =>
        isSameTable(t.label, assignedTable)
          ? { ...t, status: "occupied" }
          : t
      )
    );

    // 3. 0ms INSTANT Kitchen KOT Print on QR scan confirmation!
    (async () => {
      try {
        const { getPrinterSettings, printKitchenKOT } = require("@/src/lib/print");
        const kSettings = await getPrinterSettings("kitchen");
        const cSettings = await getPrinterSettings("cashier");
        const isKitchenConfigured = !!(kSettings && kSettings.type !== "none");
        const isCashierConfigured = !!(cSettings && cSettings.type !== "none");
        const shouldPrint = isKitchenConfigured ? !!kSettings?.auto_print : (isCashierConfigured ? !!cSettings?.print_kot : false);
        if (shouldPrint) {
          await printKitchenKOT(finalOrder);
        }
      } catch (printErr) {
        console.warn("Scan import KOT auto-print error:", printErr);
      }
    })();

    // 4. Instantly open the table details view in 0ms!
    const targetTbl = tables.find(
      t => isSameTable(t.label, assignedTable)
    ) || { id: "tbl-dyn", label: String(assignedTable), seats: 4, status: "occupied" };
    
    setSelectedTableObj(targetTbl);
    setActiveOrder(finalOrder);
    setViewMode("order_details");

    // 5. Trigger a silent load in background to reconcile state
    load().catch(() => {});
  };

  const handleSeedDefaultTables = async () => {
    try {
      const created: Table[] = [];
      for (let i = 1; i <= 10; i++) {
        const res = await api.createTable({ label: String(i), seats: 4 }).catch(() => null);
        if (res) created.push(res);
      }
      if (created.length > 0) {
        setTables(dedupeTables(created));
      } else {
        const list = await api.listTables().catch(() => null);
        if (list && list.length > 0) setTables(dedupeTables(list));
      }
    } catch {}
  };

  // Priority 1: Fast table & order synchronization
  const load = useCallback(async () => {
    setErr(null);
    try {
      // Sync tables & active orders with highest priority
      const [t, o] = await Promise.all([
        api.listTables().catch(() => null),
        api.listOrders().catch(() => null),
      ]);
      if (t && t.length > 0) {
        setTables(dedupeTables(t));
      } else if (Array.isArray(t) && t.length === 0) {
        await handleSeedDefaultTables();
      }
      if (o) setOrders(o);

      // Background lazy sync for menu and bills without blocking tables UI
      api.listMenu().then(m => { if (m?.length) setItems(m); }).catch(() => {});
      api.listCategories().then(c => { if (c?.length) setCats(c); }).catch(() => {});
      api.listBills().then(b => { if (b) setBills(b); }).catch(() => {});
    } catch (e: any) { 
      setErr(e.message); 
    }
  }, []);

  // Guarantee instant load on web and initial component mount
  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(useCallback(() => {
    // Re-hydrate local state from cache immediately on tab focus
    const cachedTables = api.getCachedTables();
    if (cachedTables && cachedTables.length > 0) setTables(dedupeTables(cachedTables));
    const cachedOrders = api.getCachedOrders();
    if (cachedOrders) setOrders(cachedOrders);
    const cachedBills = api.getCachedBills();
    if (cachedBills) setBills(cachedBills);

    load();
    setViewMode("tables");
    setSelectedTableObj(null);
  }, [load]));

  // Auto-handle table route param if passed
  useEffect(() => {
    if (tableParam && tables.length > 0) {
      const matched = tables.find(t => isSameTable(t.label, tableParam));
      if (matched) {
        onSelectTable(matched);
      } else {
        setTable(tableParam);
        setCurrentGuestName("Guest 1");
        setCurrentSessionId("tsess_" + Math.random().toString(36).substring(2, 9));
        setViewMode("menu_order");
      }
    }
  }, [tableParam, tables]);

  const { subscribe } = useNotifications();

  // Instant WebSocket State Reconciliation (0ms)
  useEffect(() => {
    return subscribe((notif) => {
      const data = notif.data;
      if (data) {
        const { order_id, status, table_number, event, order } = data;
        if (event === "TABLE_SETTLED") {
          setOrders(prev => prev.map(o => (table_number && isSameTable(o.table_number, table_number)) ? { ...o, status: "paid" } : o));
        } else if (order_id && (event === "ORDER_PAID" || status === "paid")) {
          setOrders(prev => prev.map(o => o.id === order_id ? { ...o, status: "paid" } : o));
        } else if (order && order.id) {
          setOrders(prev => {
            const filtered = prev.filter(o => o.id !== order.id);
            return [order, ...filtered];
          });
          if (order.table_number) {
            setTables(prev => prev.map(t => isSameTable(t.label, order.table_number) ? { ...t, status: "occupied" } : t));
          }
        } else if (order_id && status) {
          setOrders(prev => prev.map(o => o.id === order_id ? { ...o, status } : o));
        }
      }

      // If generic notification without embedded payload, sync in background
      if (!data?.order && !data?.order_id && !data?.bill && !data?.event) {
        if (notif.category === "kitchen" || notif.category === "payment" || notif.category === "waiter") {
          api.listOrders().then(fresh => { if (fresh) setOrders(fresh); }).catch(() => {});
          api.listBills().then(fresh => { if (fresh) setBills(fresh); }).catch(() => {});
        }
      }
    });
  }, [subscribe]);

// Table number matching normalizer: strips only "Table" prefix, preserving distinct prefixes like T-1, T-2, A1
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

// Helper to determine table status & matching active orders (kitchen status NEVER clears table until paid)
const getTableStatusInfo = (tblLabel: string, ordersList: any[], billsList: any[]) => {
  const matchingOrders = ordersList.filter((o: any) => {
    if (!o) return false;
    if (String(o.id).startsWith("temp-")) {
      const isSuperseded = ordersList.some((ro: any) => ro && !String(ro.id).startsWith("temp-") && (ro.id === o.id || (ro.session_id && ro.session_id === o.session_id)));
      if (isSuperseded) return false;
    }
    if (!isSameTable(o.table_number, tblLabel)) return false;
    if (!isTodayBusinessDay(o.created_at)) return false; // ONLY CURRENT DAY ORDERS
    if (o.status === "cancelled" || o.status === "pending_scan") return false;
    if (o.status === "paid" || o.status === "completed" || o.status === "settled") return false;
    const isPaid = billsList.some((b: any) => (b.order_id === o.id || (b.order_ids && b.order_ids.includes(o.id))) && b.status === "paid");
    if (isPaid) return false;
    return true;
  });

  if (matchingOrders.length === 0) return { status: "Available", orders: [], bill: null, isWeb: false, activeCount: 0, totalAmount: 0 };

  const totalAmt = matchingOrders.reduce((sum: number, o: any) => {
    const oTotal = o.subtotal || (o.items || []).reduce((acc: number, x: any) => acc + (x.price * x.quantity), 0);
    return sum + oTotal;
  }, 0);

  const matchingBill = billsList.find((b: any) => matchingOrders.some((o: any) => o.id === b.order_id) && b.status !== "paid");
  if (matchingBill) return { status: "Billed", orders: matchingOrders, bill: matchingBill, isWeb: false, activeCount: matchingOrders.length, totalAmount: totalAmt };

  const allWebPaid = matchingOrders.every((o: any) => (o.created_by === "guest" || o.order_source === "qr_web") && billsList.some((b: any) => b.order_id === o.id && b.status === "paid"));

  return { 
    status: allWebPaid ? "Web Paid" : "Occupied", 
    orders: matchingOrders, 
    bill: null, 
    isWeb: allWebPaid, 
    activeCount: matchingOrders.length,
    totalAmount: totalAmt
  };
};

  const counts = tables.reduce(
    (acc, t) => {
      const { status } = getTableStatusInfo(t.label, orders, bills);
      if (status === "Available") acc.available += 1;
      else if (status === "Occupied" || status === "Web Paid") acc.occupied += 1;
      else if (status === "Billed") acc.billed += 1;
      else if (status === "Reserved") acc.reserved += 1;
      return acc;
    },
    { available: 0, occupied: 0, billed: 0, reserved: 0 }
  );

  const onSelectTable = (tbl: Table) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setSelectedTableObj(tbl);
    setTable(tbl.label);
    const { status, orders: tblOrders } = getTableStatusInfo(tbl.label, orders, bills);

    if (tblOrders.length > 0) {
      setActiveOrder(tblOrders[0]);
      setViewMode("order_details");
    } else {
      setActiveOrder(null);
      setCurrentGuestName("Guest 1");
      setCurrentSessionId("tsess_" + Math.random().toString(36).substring(2, 9));
      setLines([]);
      setViewMode("menu_order");
    }
  };

  const filtered = useMemo(() => {
    let list = items;
    if (selCat !== "all") list = list.filter(i => i.category_id === selCat);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i => i.name.toLowerCase().includes(q));
    }
    return list;
  }, [items, selCat, search]);

  const pulse = () => {
    scale.value = withSpring(1.12, { damping: 8 }, () => { scale.value = withSpring(1); });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const add = (it: Item) => {
    pulse();
    setLines(prev => {
      const idx = prev.findIndex(l => l.menu_item_id === it.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + 1 };
        return copy;
      }
      return [...prev, { menu_item_id: it.id, name: it.name, price: it.price, quantity: 1, notes: "" }];
    });
  };
  const inc = (id: string) => { pulse(); setLines(p => p.map(l => l.menu_item_id === id ? { ...l, quantity: l.quantity + 1 } : l)); };
  const dec = (id: string) => { pulse(); setLines(p => p.flatMap(l => l.menu_item_id === id ? (l.quantity > 1 ? [{ ...l, quantity: l.quantity - 1 }] : []) : [l])); };
  const remove = (id: string) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); setLines(p => p.filter(l => l.menu_item_id !== id)); };

  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.price * l.quantity, 0), [lines]);
  const totalQty = useMemo(() => lines.reduce((s, l) => s + l.quantity, 0), [lines]);

  const gridTables = useMemo(() => {
    if (!tables || tables.length === 0) return [];
    const remainder = tables.length % tableCols;
    if (remainder === 0) return tables;
    const dummyCount = tableCols - remainder;
    const dummies = Array.from({ length: dummyCount }, (_, i) => ({
      id: `__dummy_table_${i}`,
      label: "",
      seats: 0,
      __isDummy: true,
    }));
    return [...tables, ...dummies];
  }, [tables, tableCols]);


  const submitOrder = async () => {
    if (!table.trim()) { setErr("Choose a table."); return; }
    if (lines.length === 0) { setErr("Add at least one item."); return; }
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const isEdit = !!activeOrder;
      const guestName = currentGuestName || activeOrder?.customer_name || "Guest 1";
      const sessId = currentSessionId || activeOrder?.session_id || "tsess_" + Math.random().toString(36).substring(2, 9);
      const tblLabel = table.trim();
      const orderSubtotal = lines.reduce((acc, item) => acc + (item.price * item.quantity), 0);
      const tempId = activeOrder?.id || "temp-" + Date.now();
      const orderItems = [...lines];

      // Instant optimistic order
      const optimisticOrder = {
        id: tempId,
        order_number: activeOrder?.order_number || String(Math.floor(100 + Math.random() * 900)),
        table_number: tblLabel,
        session_id: sessId,
        customer_name: guestName,
        items: orderItems,
        subtotal: orderSubtotal,
        status: activeOrder?.status || "placed",
        created_at: activeOrder?.created_at || new Date().toISOString(),
      };

      // 1. 0ms INSTANT UI Transition - Switch to table details immediately!
      setLines([]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      
      const tblObj = tables.find(t => isSameTable(t.label, tblLabel)) || { id: "temp-tbl", label: tblLabel, status: "occupied", seats: 4 };
      setSelectedTableObj(tblObj);
      setTable(tblLabel);
      setActiveOrder(optimisticOrder);
      setTables(prev => prev.map(t => isSameTable(t.label, tblLabel) ? { ...t, status: "occupied" } : t));
      setOrders(prev => [optimisticOrder, ...prev.filter(o => o.id !== tempId)]);
      api.injectCachedOrder(optimisticOrder);
      setViewMode("order_details");
      setBusy(false);

      // 2. Fire 0ms Instant Kitchen KOT Auto-Print
      (async () => {
        try {
          const { getPrinterSettings, printKitchenKOT } = require("@/src/lib/print");
          const kSettings = await getPrinterSettings("kitchen");
          const cSettings = await getPrinterSettings("cashier");
          const isKitchenConfigured = !!(kSettings && kSettings.type !== "none");
          const isCashierConfigured = !!(cSettings && cSettings.type !== "none");
          const shouldPrint = isKitchenConfigured ? !!kSettings?.auto_print : (isCashierConfigured ? !!cSettings?.print_kot : false);
          if (shouldPrint) {
            await printKitchenKOT(optimisticOrder);
          }
        } catch (printErr) {
          console.warn("Instant KOT auto-print error:", printErr);
        }
      })();

      // 3. Network Background Sync
      (async () => {
        try {
          let realOrder: any;
          if (isEdit) {
            realOrder = await api.updateOrder(activeOrder.id, {
              items: orderItems,
              notes: "",
              customer_name: guestName,
              table_number: tblLabel,
              session_id: sessId
            });
          } else {
            realOrder = await api.createOrder({
              table_number: tblLabel,
              items: orderItems,
              notes: "",
              session_id: sessId,
              customer_name: guestName
            });
          }
          if (realOrder && realOrder.id) {
            api.setTempIdMapping(tempId, realOrder.id);
            if (activeOrder?.id) api.setTempIdMapping(activeOrder.id, realOrder.id);
            setActiveOrder(realOrder);
            setOrders(prev => [realOrder, ...prev.filter(o => o.id !== tempId && o.id !== realOrder.id && (activeOrder ? o.id !== activeOrder.id : true))]);
            api.injectCachedOrder(realOrder);
          }
        } catch (syncErr: any) {
          console.warn("Background order sync error:", syncErr);
        }
      })();
    } catch (e: any) {
      setErr(e.message || "Failed to place order.");
      setBusy(false);
    }
  };

  // -------------------------------------------------------------
  // VIEW 1: OCCUPIED TABLE / MULTI-CUSTOMER ORDER DETAILS SCREEN
  // -------------------------------------------------------------
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());

  const tableOrders = selectedTableObj
    ? orders.filter((o: any) => {
        if (!o) return false;
        if (String(o.id).startsWith("temp-")) {
          const isSuperseded = orders.some((ro: any) => ro && !String(ro.id).startsWith("temp-") && (ro.id === o.id || (ro.session_id && ro.session_id === o.session_id)));
          if (isSuperseded) return false;
        }
        if (!isSameTable(o.table_number, selectedTableObj.label)) return false;
        if (!isTodayBusinessDay(o.created_at)) return false; // ONLY CURRENT DAY ORDERS
        if (o.status === "cancelled" || o.status === "pending_scan") return false;
        if (o.status === "paid" || o.status === "completed" || o.status === "settled") return false;
        const isPaid = bills.some((b: any) => (b.order_id === o.id || (b.order_ids && b.order_ids.includes(o.id))) && b.status === "paid");
        if (isPaid) return false;
        return true;
      })
    : [];

  const totalTableAmount = tableOrders.reduce((sum: number, o: any) => {
    const sub = Number(o.subtotal || 0) || (o.items || []).reduce((acc: number, it: any) => acc + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
    return sum + sub;
  }, 0);
  const uniqueGuests = Array.from(new Set(tableOrders.map((o: any) => o.customer_name || "Guest 1")));

  // Persistent refs so BackHandler never gets unsubscribed or drops off on state mutations
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;

  const selectedTableObjRef = useRef(selectedTableObj);
  selectedTableObjRef.current = selectedTableObj;

  const tableOrdersRef = useRef(tableOrders);
  tableOrdersRef.current = tableOrders;

  const tableRef = useRef(table);
  tableRef.current = table;

  const showScannerRef = useRef(showScanner);
  showScannerRef.current = showScanner;

  const showGuestPickerRef = useRef(showGuestPicker);
  showGuestPickerRef.current = showGuestPicker;

  const handleStepBack = useCallback(() => {
    if (showScannerRef.current) {
      setShowScanner(false);
      return true;
    }
    if (showGuestPickerRef.current) {
      setShowGuestPicker(false);
      return true;
    }
    // If inside table menu order creation screen
    if (viewModeRef.current === "menu_order") {
      if (tableOrdersRef.current && tableOrdersRef.current.length > 0) {
        setViewMode("order_details");
        return true;
      } else {
        setSelectedTableObj(null);
        setTable("");
        setLines([]);
        setViewMode("tables");
        if (tableParam) {
          router.setParams({ table: "" });
        }
        return true;
      }
    }
    // If inside table order details screen or any table is selected
    if (viewModeRef.current === "order_details" || selectedTableObjRef.current !== null || (tableRef.current && tableRef.current !== "")) {
      setSelectedTableObj(null);
      setTable("");
      setLines([]);
      setViewMode("tables");
      if (tableParam) {
        router.setParams({ table: "" });
      }
      return true;
    }
    return false;
  }, [tableParam, router]);

  // Re-register BackHandler whenever table/view state changes
  // This ensures our table step-back handler is ALWAYS at the top of the Android hardware back stack
  useEffect(() => {
    const onBackPress = () => {
      return handleStepBack();
    };
    const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => subscription.remove();
  }, [viewMode, selectedTableObj, table, showScanner, showGuestPicker, handleStepBack]);

  // Screen focus listener
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        return handleStepBack();
      };
      const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () => subscription.remove();
    }, [viewMode, selectedTableObj, table, showScanner, showGuestPicker, handleStepBack])
  );

  if (viewMode === "order_details" && selectedTableObj) {
    const allWebPaid = tableOrders.length > 0 && tableOrders.every((o: any) => o.created_by === "guest" || o.order_source === "qr_web" || bills.some((b: any) => b.order_id === o.id && b.status === "paid"));

    const completeIndividualOrder = async (orderIdToComplete: string) => {
      if (completingIds.has(orderIdToComplete)) return;
      setCompletingIds(prev => new Set(prev).add(orderIdToComplete));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      
      // Optimistic local state update
      setOrders(prev => prev.map(o => o.id === orderIdToComplete ? { ...o, status: "paid" } : o));
      
      const remaining = tableOrders.filter((o: any) => o.id !== orderIdToComplete);
      if (remaining.length === 0) {
        setViewMode("tables");
      }

      try {
        await api.settleTable(selectedTableObj.label, "CASH", [orderIdToComplete]);
      } catch (e: any) {
        console.warn("Failed to complete order:", e);
        await load();
      } finally {
        setCompletingIds(prev => {
          const next = new Set(prev);
          next.delete(orderIdToComplete);
          return next;
        });
      }
    };

    const completeAllTableOrders = async () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setOrders(prev => prev.map(o => tableOrders.some(to => to.id === o.id) ? { ...o, status: "paid" } : o));
      setViewMode("tables");

      try {
        await api.settleTable(selectedTableObj.label, "CASH", tableOrders.map(o => o.id), totalTableAmount);
      } catch (e: any) {
        console.warn("Failed to complete all orders:", e);
        await load();
      }
    };

    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.surface }]}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.surface} />
        <View style={[styles.wrap, { paddingTop: insets.top, backgroundColor: theme.surface }]}>
          <View style={[styles.desktopContainer, isDesktop && { maxWidth: 900, alignSelf: "center", width: "100%" }]}>
          {/* Header Bar */}
          <View style={styles.detailsHeader}>
            <Pressable onPress={handleStepBack} style={styles.backBtn} hitSlop={12}>
              <Ionicons name="chevron-back" size={24} color={theme.onSurface} />
            </Pressable>
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={[styles.detailsTitle, { color: theme.onSurface }]}>Table {selectedTableObj.label}</Text>
              <Text style={[styles.detailsSub, { color: theme.onSurfaceSecondary }]}>
                Main • {selectedTableObj.seats} seats • {tableOrders.length} {tableOrders.length === 1 ? "Order" : "Orders"} ({uniqueGuests.length} {uniqueGuests.length === 1 ? "Customer" : "Customers"})
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ fontSize: 11, color: theme.onSurfaceSecondary, fontWeight: "600" }}>ACTIVE TOTAL</Text>
              <Text style={{ fontSize: 17, fontWeight: "800", color: "#635BFF" }}>₹{totalTableAmount}</Text>
            </View>
          </View>

          {/* Orders Scrollable List */}
          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 180 + insets.bottom }} showsVerticalScrollIndicator={false}>
            {tableOrders.length === 0 ? (
              <View style={[styles.center, { paddingVertical: 60 }]}>
                <Ionicons name="checkmark-circle" size={48} color="#10B981" />
                <Text style={{ fontSize: 16, fontWeight: "700", color: theme.onSurface, marginTop: 12 }}>All orders completed!</Text>
                <Text style={{ fontSize: 13, color: theme.onSurfaceSecondary, marginTop: 4 }}>This table is ready for new guests.</Text>
                <View style={{ flexDirection: "row", gap: 12, marginTop: 24, justifyContent: "center", width: "100%", paddingHorizontal: spacing.lg }}>
                  <Pressable
                    style={[styles.addOrderBtn, { flex: 1, backgroundColor: "#635BFF", borderColor: "#635BFF" }]}
                    onPress={() => {
                      setActiveOrder(null);
                      setCurrentGuestName("Guest 1");
                      setCurrentSessionId("tsess_" + Math.random().toString(36).substring(2, 9));
                      setLines([]);
                      setViewMode("menu_order");
                    }}
                  >
                    <Ionicons name="add" size={18} color="#FFFFFF" />
                    <Text style={[styles.addOrderBtnText, { color: "#FFFFFF" }]}>+ Add Order</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.addOrderBtn, { flex: 1, backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}
                    onPress={() => { setSelectedTableObj(null); setViewMode("tables"); }}
                  >
                    <Text style={[styles.addOrderBtnText, { color: theme.onSurface }]}>Back to Tables</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              tableOrders.map((order: any, idx: number) => {
                const orderNum = order.order_number || order.id?.slice(-4) || `${idx + 1}`;
                const statusText = (order.status || "PLACED").toUpperCase();
                const isWebOrder = order.created_by === "guest" || order.order_source === "qr_web" || order.notes?.includes("Web Order");
                const custName = order.customer_name || `Guest ${idx + 1}`;
                const orderTotal = order.subtotal || (order.items || []).reduce((acc: number, x: any) => acc + (x.price * x.quantity), 0);

                return (
                  <View key={order.id || idx} style={[styles.orderCard, { marginBottom: spacing.md, backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
                    <View style={styles.orderCardHeader}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={[styles.orderCardNum, { color: "#635BFF", fontSize: 15 }]}>👤 {custName}</Text>
                        <Text style={[styles.orderCardNum, { fontSize: 13, color: theme.onSurfaceSecondary }]}>#{orderNum}</Text>
                      </View>
                      <View style={[styles.statusPill, { backgroundColor: isWebOrder ? (isDark ? "#065F46" : "#DCFCE7") : (order.status === "placed" ? "#EEF2FF" : "#ECFDF5") }]}>
                        <Text style={[styles.statusPillText, { color: isWebOrder ? (isDark ? "#34D399" : "#16A34A") : (order.status === "placed" ? "#635BFF" : "#10B981") }]}>
                          {isWebOrder ? "WEB QR" : statusText}
                        </Text>
                      </View>
                    </View>

                    {/* Items List */}
                    <View style={{ marginVertical: spacing.sm }}>
                      {(order.items || []).map((it: any, iIdx: number) => (
                        <View key={iIdx} style={styles.itemRow}>
                          <Text style={styles.itemQty}>{it.quantity}×</Text>
                          <Text style={[styles.itemTitle, { color: theme.onSurface }]}>{it.name}</Text>
                          <Text style={[styles.itemAmt, { color: theme.onSurface }]}>₹{it.price * it.quantity}</Text>
                        </View>
                      ))}
                    </View>

                    {/* Special Cooking Instructions / Notes */}
                    {order.notes ? (
                      <View style={[
                        styles.notesContainer, 
                        { 
                          backgroundColor: isDark ? "#2B2212" : "#FFFBEB", 
                          borderColor: isDark ? "#78350F" : "#FDE68A",
                          marginVertical: spacing.xs
                        }
                      ]}>
                        <Ionicons name="document-text-outline" size={14} color={isDark ? "#FBBF24" : "#D97706"} />
                        <Text style={[styles.notesText, { color: isDark ? "#FBBF24" : "#D97706", fontSize: 12 }]}>
                          {order.notes}
                        </Text>
                      </View>
                    ) : null}

                    {/* Footer / Subtotal + Actions */}
                    <View style={[styles.subtotalRow, { borderTopColor: theme.border }]}>
                      <View style={{ flex: 1, minWidth: 90 }}>
                        <Text style={[styles.subtotalLbl, { color: theme.onSurfaceSecondary }]}>Order Amount</Text>
                        <Text style={[styles.subtotalVal, { color: theme.onSurface }]}>₹{orderTotal}</Text>
                      </View>

                      <View style={styles.cardActionsWrap}>
                        <Pressable
                          style={[styles.guestActionBtn, { borderColor: theme.border, backgroundColor: theme.surfaceTertiary }]}
                          onPress={() => {
                            setActiveOrder(order);
                            setCurrentGuestName(custName);
                            setCurrentSessionId(order.session_id || "");
                            const mapped: Line[] = (order.items || []).map((it: any) => ({
                              menu_item_id: it.menu_item_id || it.id || "",
                              name: it.name,
                              price: it.price,
                              quantity: it.quantity,
                              notes: it.notes || "",
                            }));
                            setLines(mapped);
                            setViewMode("menu_order");
                          }}
                        >
                          <Ionicons name="create-outline" size={14} color="#635BFF" />
                          <Text style={{ fontSize: 12, fontWeight: "700", color: "#635BFF", marginLeft: 4 }} numberOfLines={1}>Edit</Text>
                        </Pressable>

                        <Pressable
                          style={[styles.guestActionBtn, { backgroundColor: "#635BFF", borderColor: "#635BFF" }]}
                          onPress={() => router.push({ pathname: "/(app)/billing", params: { orderId: order.id, backTo: "/(app)/waiter" } })}
                        >
                          <Ionicons name="receipt-outline" size={14} color="#FFF" />
                          <Text style={{ fontSize: 12, fontWeight: "700", color: "#FFF", marginLeft: 4 }} numberOfLines={1}>Bill Guest</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* Bottom Action Bar */}
          <View style={[styles.bottomActionBar, { backgroundColor: theme.surface, borderTopColor: theme.border, paddingBottom: Math.max(insets.bottom, 16) + spacing.md }]}>
            <Pressable
              style={styles.addOrderBtn}
              onPress={() => setShowGuestPicker(true)}
            >
              <Ionicons name="person-add-outline" size={18} color="#635BFF" />
              <Text style={styles.addOrderBtnText}>+ Add Order</Text>
            </Pressable>

            <Pressable
              style={styles.genBillBtn}
              onPress={() => {
                const activeIds = tableOrders.map((o: any) => o.id);
                router.push({
                  pathname: "/(app)/billing",
                  params: {
                    tableNumber: selectedTableObj.label,
                    orderIds: JSON.stringify(activeIds),
                    backTo: "/(app)/waiter"
                  }
                });
              }}
            >
              <View>
                <Text style={styles.genBillAmt}>₹{totalTableAmount}</Text>
                <Text style={styles.genBillSub}>Settle Entire Table</Text>
              </View>
              <Ionicons name="receipt-outline" size={22} color="#FFFFFF" />
            </Pressable>
          </View>

          {/* Guest Selector Modal */}
          {showGuestPicker && (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.6)", justifyContent: isDesktop ? "center" : "flex-end", alignItems: isDesktop ? "center" : "stretch", zIndex: 999 }]}>
              <View style={[styles.guestPickerSheet, { backgroundColor: theme.surface, paddingBottom: insets.bottom + 20 }, isDesktop && { maxWidth: 520, width: "90%", borderRadius: radius.xl }]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <Text style={[styles.guestPickerTitle, { color: theme.onSurface }]}>Select Customer for Table {selectedTableObj.label}</Text>
                  <Pressable onPress={() => setShowGuestPicker(false)} hitSlop={12}>
                    <Ionicons name="close" size={22} color={theme.onSurfaceSecondary} />
                  </Pressable>
                </View>

                {uniqueGuests.map((gName, gIdx) => (
                  <Pressable
                    key={gIdx}
                    style={[styles.guestPickerOption, { borderColor: theme.border, backgroundColor: theme.surfaceSecondary }]}
                    onPress={() => {
                      setShowGuestPicker(false);
                      setActiveOrder(null);
                      setCurrentGuestName(gName);
                      setCurrentSessionId("tsess_" + Math.random().toString(36).substring(2, 9));
                      setLines([]);
                      setViewMode("menu_order");
                    }}
                  >
                    <Ionicons name="person" size={18} color="#635BFF" />
                    <Text style={[styles.guestPickerOptionText, { color: theme.onSurface }]}>Add items for {gName}</Text>
                  </Pressable>
                ))}

                <Pressable
                  style={[styles.guestPickerOption, { borderColor: "#635BFF", backgroundColor: isDark ? "rgba(99,91,255,0.15)" : "#EEF2FF" }]}
                  onPress={() => {
                    setShowGuestPicker(false);
                    setActiveOrder(null);
                    const newGuestLabel = `Guest ${uniqueGuests.length + 1}`;
                    setCurrentGuestName(newGuestLabel);
                    setCurrentSessionId("tsess_" + Math.random().toString(36).substring(2, 9));
                    setLines([]);
                    setViewMode("menu_order");
                  }}
                >
                  <Ionicons name="add-circle" size={20} color="#635BFF" />
                  <Text style={[styles.guestPickerOptionText, { color: "#635BFF", fontWeight: "700" }]}>+ New Customer (Guest {uniqueGuests.length + 1})</Text>
                </Pressable>
              </View>
            </View>
          )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // -------------------------------------------------------------
  // VIEW 2: TABLES SELECTION GRID (MAIN WAITER ENTRY SCREEN)
  // -------------------------------------------------------------
  if (viewMode === "tables") {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.surface }]}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.surface} />
        <View style={[styles.wrap, { paddingTop: insets.top, backgroundColor: theme.surface }]} testID="waiter-screen">
          <View style={[styles.desktopContainer, isDesktop && styles.desktopContainerActive]}>
          
          {/* Header with Scan & Printer Action Buttons */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={{ fontSize: 26, fontWeight: "900", color: theme.onSurface }} numberOfLines={1}>Tables</Text>
              <Text style={{ fontSize: 12, color: theme.onSurfaceSecondary, marginTop: 2, fontWeight: "500" }} numberOfLines={1}>
                Tap a table to add items or generate bill
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <SyncStatusIndicator compact />
              <Pressable
                style={{
                  backgroundColor: isDark ? "rgba(99,91,255,0.15)" : "#EEF2FF",
                  borderColor: isDark ? "#635BFF" : "#C7D2FE",
                  borderWidth: 1,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                }}
                onPress={() => setShowScanner(true)}
              >
                <Ionicons name="qr-code-outline" size={15} color="#635BFF" />
                <Text style={{ color: "#635BFF", fontSize: 11, fontWeight: "800" }}>Scan</Text>
              </Pressable>

              <Pressable
                style={{
                  backgroundColor: isDark ? "rgba(245,158,11,0.15)" : "#FFFBEB",
                  borderColor: isDark ? "#F59E0B" : "#FDE68A",
                  borderWidth: 1,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                }}
                onPress={() => router.push("/(app)/printer-settings")}
              >
                <Ionicons name="print-outline" size={15} color="#F59E0B" />
                <Text style={{ color: "#F59E0B", fontSize: 11, fontWeight: "800" }}>Printer</Text>
              </Pressable>

              <Pressable
                style={{
                  backgroundColor: isDark ? "rgba(239,68,68,0.15)" : "#FEF2F2",
                  borderColor: isDark ? "rgba(239,68,68,0.3)" : "#FECACA",
                  borderWidth: 1,
                  paddingHorizontal: 8,
                  paddingVertical: 6,
                  borderRadius: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                }}
                onPress={() => {
                  Alert.alert(
                    "Sign Out",
                    "Are you sure you want to log out of your account?",
                    [
                      { text: "Cancel", style: "cancel" },
                      { text: "Sign Out", style: "destructive", onPress: () => logout() }
                    ]
                  );
                }}
                testID="waiter-logout-btn"
              >
                <Ionicons name="log-out-outline" size={15} color="#EF4444" />
                <Text style={{ color: "#EF4444", fontSize: 11, fontWeight: "800" }}>Logout</Text>
              </Pressable>
            </View>
          </View>

          {/* Legend Summary Row matching Screenshot 2 */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14, paddingHorizontal: spacing.lg, marginVertical: spacing.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#10B981" }} />
              <Text style={{ fontSize: 13, color: theme.onSurfaceSecondary, fontWeight: "600" }}>Available · <Text style={{ color: theme.onSurface, fontWeight: "800" }}>{counts.available}</Text></Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#F59E0B" }} />
              <Text style={{ fontSize: 13, color: theme.onSurfaceSecondary, fontWeight: "600" }}>Occupied · <Text style={{ color: theme.onSurface, fontWeight: "800" }}>{counts.occupied}</Text></Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#EF4444" }} />
              <Text style={{ fontSize: 13, color: theme.onSurfaceSecondary, fontWeight: "600" }}>Billed · <Text style={{ color: theme.onSurface, fontWeight: "800" }}>{counts.billed}</Text></Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#3B82F6" }} />
              <Text style={{ fontSize: 13, color: theme.onSurfaceSecondary, fontWeight: "600" }}>Reserved · <Text style={{ color: theme.onSurface, fontWeight: "800" }}>{counts.reserved}</Text></Text>
            </View>
          </View>

          {/* Main Section Title */}
          <View style={{ paddingHorizontal: spacing.lg, marginTop: 4, marginBottom: 8 }}>
            <Text style={{ fontSize: 18, fontWeight: "900", color: theme.onSurface }}>Main</Text>
          </View>

          {loading ? (
            <View style={styles.center}><ActivityIndicator size="large" color="#635BFF" /></View>
          ) : tables.length === 0 ? (
            <View style={[styles.center, { paddingVertical: 40 }]}>
              <Ionicons name="grid-outline" size={52} color={theme.onSurfaceTertiary} />
              <Text style={{ color: theme.onSurface, marginTop: 12, fontSize: 18, fontWeight: "800" }}>No tables setup yet</Text>
              <Text style={{ color: theme.onSurfaceSecondary, marginTop: 6, fontSize: 14, textAlign: "center", maxWidth: 300 }}>
                Set up dining tables to start taking orders and generating bills.
              </Text>
              <Pressable
                style={{
                  backgroundColor: "#635BFF",
                  paddingHorizontal: 20,
                  paddingVertical: 12,
                  borderRadius: 14,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 18,
                }}
                onPress={handleSeedDefaultTables}
              >
                <Ionicons name="add-circle" size={20} color="#FFFFFF" />
                <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 15 }}>Create Tables 1 - 10</Text>
              </Pressable>
            </View>
          ) : (
            <FlatList
              key={`tbl-grid-${tableCols}`}
              data={gridTables}
              keyExtractor={t => t.id}
              numColumns={tableCols}
              columnWrapperStyle={{ justifyContent: "flex-start", gap: 10, paddingHorizontal: spacing.lg }}
              contentContainerStyle={{ paddingTop: spacing.xs, paddingBottom: spacing.xxxl, gap: 10 }}
              showsVerticalScrollIndicator={false}
              renderItem={({ item, index }) => {
                if ((item as any).__isDummy) {
                  return <View style={{ flex: 1, minWidth: 0 }} />;
                }
                const { status, orders: tblOrders, activeCount, totalAmount } = getTableStatusInfo(item.label, orders, bills);
                
                let cardBg = isDark ? "#161C2E" : "#F0FDF4";
                let cardBorder = isDark ? "#065F46" : "#BBF7D0";
                let iconBg = isDark ? "#064E3B" : "#DCFCE7";
                let iconColor = isDark ? "#34D399" : "#10B981";
                let statusLabel = "Available";
                let statusTextColor = isDark ? "#34D399" : "#10B981";
                let isOccupied = false;
                let iconName: any = "checkmark-circle-outline";

                if (status === "Billed") {
                  cardBg = isDark ? "#2A1417" : "#FFF1F2";
                  cardBorder = isDark ? "#7F1D1D" : "#FECDD3";
                  iconBg = isDark ? "#451216" : "#FEE2E2";
                  iconColor = "#EF4444";
                  statusLabel = "Billed";
                  statusTextColor = "#EF4444";
                  iconName = "stop";
                } else if (status === "Occupied" || status === "Web Paid") {
                  isOccupied = true;
                  cardBg = isDark ? "#2D1E0C" : "#FFFBEB";
                  cardBorder = isDark ? "#78350F" : "#FDE68A";
                  iconBg = isDark ? "#451A03" : "#FEF3C7";
                  iconColor = "#D97706";
                  statusLabel = totalAmount > 0 ? `₹${totalAmount}` : "Occupied";
                  statusTextColor = "#4F46E5";
                  iconName = "people";
                } else if (status === "Reserved") {
                  cardBg = isDark ? "#121F3D" : "#EFF6FF";
                  cardBorder = isDark ? "#1E3A8A" : "#BAE6FD";
                  iconBg = isDark ? "#172554" : "#DBEAFE";
                  iconColor = "#3B82F6";
                  statusLabel = "Reserved";
                  statusTextColor = "#3B82F6";
                  iconName = "bookmark-outline";
                }

                return (
                  <Animated.View entering={FadeInDown.delay(index * 30).springify()} style={{ flex: 1, minWidth: 0 }}>
                    <Pressable
                      style={({ pressed }) => [
                        {
                          backgroundColor: cardBg,
                          borderColor: cardBorder,
                          borderWidth: 1,
                          borderRadius: 20,
                          padding: 12,
                          minHeight: 132,
                          justifyContent: "space-between",
                          width: "100%",
                        },
                        pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] },
                      ]}
                      onPress={() => onSelectTable(item)}
                      testID={`waiter-table-${item.id}`}
                    >
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: iconBg, alignItems: "center", justifyContent: "center" }}>
                          <Ionicons name={iconName} size={15} color={iconColor} />
                        </View>
                        {isOccupied && (
                          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "#4F46E5", alignItems: "center", justifyContent: "center" }}>
                            <Text style={{ color: "#FFFFFF", fontSize: 11, fontWeight: "900" }}>{activeCount || tblOrders.length || 1}</Text>
                          </View>
                        )}
                      </View>

                      <View style={{ marginTop: 8 }}>
                        <Text style={{ fontSize: 24, fontWeight: "900", color: theme.onSurface }} numberOfLines={1}>
                          {item.label}
                        </Text>
                        <Text style={{ fontSize: 12, color: theme.onSurfaceSecondary, marginTop: 2, fontWeight: "500" }}>
                          {item.seats} seats
                        </Text>
                      </View>

                      <Text style={{ fontSize: isOccupied ? 15 : 13, fontWeight: "900", color: statusTextColor, marginTop: 4 }}>
                        {statusLabel}
                      </Text>
                    </Pressable>
                  </Animated.View>
                );
              }}
            />
          )}

          {/* Customer Order QR Scanner Modal with Camera & Manual Fallback */}
          <OrderQRScannerModal
            visible={showScanner}
            onClose={() => setShowScanner(false)}
            onScanSuccess={handleScanImport}
          />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // -------------------------------------------------------------
  // VIEW 3: MENU DISH SELECTION / ORDER CREATION SCREEN
  // -------------------------------------------------------------
  const displayGuests = [...uniqueGuests];
  if (currentGuestName && !displayGuests.includes(currentGuestName)) {
    displayGuests.push(currentGuestName);
  }

  if (isDesktop) {
    const dishCols = isLargeDesktop ? 3 : 2;
    return (
      <View style={[styles.wrap, { paddingTop: insets.top, backgroundColor: theme.surface }]} testID="waiter-screen">
        {/* Top Header with Back to Details */}
        <View style={[styles.menuHeaderBar, { backgroundColor: theme.surface }]}>
          <Pressable onPress={handleStepBack} style={[styles.backBtn, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={theme.onSurface} />
          </Pressable>
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={[styles.detailsTitle, { color: theme.onSurface }]}>Table {selectedTableObj?.label || table}</Text>
            <Text style={[styles.detailsSub, { color: theme.onSurfaceSecondary }]}>
              Main • {selectedTableObj?.seats || 4} seats • {tableOrders.length} open {tableOrders.length === 1 ? "order" : "orders"}
            </Text>
          </View>
        </View>

        {/* 2-Column POS Body */}
        <View style={{ flex: 1, flexDirection: "row" }}>
          {/* Left Column: Menu Items Catalog */}
          <View style={{ flex: 1, borderRightWidth: 1, borderRightColor: theme.border }}>
            <View style={[styles.searchRow, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
              <Ionicons name="search" size={16} color={theme.onSurfaceTertiary} />
              <TextInput
                value={search} onChangeText={setSearch} placeholder="Search dishes"
                placeholderTextColor={theme.onSurfaceTertiary} style={[styles.search, { color: theme.onSurface }]}
                testID="waiter-search-input"
              />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsWrap} contentContainerStyle={styles.chipsRow}>
              <Chip label="All" active={selCat === "all"} onPress={() => setSelCat("all")} testID="wchip-all" />
              {cats.map(c => (
                <Chip key={c.id} label={c.name} active={selCat === c.id} onPress={() => setSelCat(c.id)} testID={`wchip-${c.id}`} />
              ))}
            </ScrollView>

            {loading ? (
              <View style={styles.empty}><ActivityIndicator color={colors.brand} /></View>
            ) : filtered.length === 0 ? (
              <View style={styles.empty}>
                <Text style={{ color: colors.onSurfaceTertiary }}>No items found.</Text>
              </View>
            ) : (
              <FlatList
                key={`menu-pos-grid-${dishCols}`}
                data={filtered}
                keyExtractor={i => i.id}
                numColumns={dishCols}
                columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
                contentContainerStyle={{ paddingBottom: 40, paddingTop: spacing.md, gap: spacing.md }}
                renderItem={({ item, index }) => (
                  <Animated.View entering={FadeInUp.delay(index * 30).springify()} style={{ flex: 1 }}>
                    <Pressable style={styles.menuCard} onPress={() => add(item)} testID={`waiter-add-${item.id}`}>
                      <Image source={menuItemImageSource(item)} style={styles.menuImg} contentFit="cover" transition={200} />
                      <View style={styles.menuOverlay}>
                        <Text style={styles.menuName} numberOfLines={2}>{item.name}</Text>
                        <Text style={styles.menuPrice}>₹{item.price}</Text>
                      </View>
                      <View style={styles.plus}><Ionicons name="add" size={16} color={colors.onBrand} /></View>
                    </Pressable>
                  </Animated.View>
                )}
              />
            )}
          </View>

          {/* Right Column: Active Order Ticket */}
          <View style={{ width: 380, backgroundColor: theme.surfaceSecondary, display: "flex", flexDirection: "column" }}>
            {/* Guest Selector */}
            <View style={{ padding: spacing.md, borderBottomWidth: 1, borderBottomColor: theme.border }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: theme.onSurfaceSecondary, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>Select Guest to Add Items</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
                {displayGuests.map((gName, idx) => {
                  const isActive = gName === currentGuestName;
                  const matchedOrder = tableOrders.find((o: any) => (o.customer_name || "Guest 1") === gName);
                  const orderAmt = matchedOrder ? matchedOrder.subtotal || 0 : 0;
                  return (
                    <Pressable
                      key={gName + idx}
                      style={[
                        {
                          flexDirection: "row",
                          alignItems: "center",
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 12,
                          borderWidth: 1,
                          gap: 6
                        },
                        isActive
                          ? { backgroundColor: "#635BFF", borderColor: "#635BFF" }
                          : { backgroundColor: theme.surfaceTertiary, borderColor: theme.border }
                      ]}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setCurrentGuestName(gName);
                        if (matchedOrder) {
                          setActiveOrder(matchedOrder);
                          setCurrentSessionId(matchedOrder.session_id);
                          setLines((matchedOrder.items || []).map((it: any) => ({
                            menu_item_id: it.menu_item_id || it.id || "",
                            name: it.name,
                            price: it.price,
                            quantity: it.quantity,
                            notes: it.notes || "",
                          })));
                        } else {
                          setActiveOrder(null);
                          setLines([]);
                        }
                      }}
                    >
                      <Ionicons name="person" size={14} color={isActive ? "#FFF" : theme.onSurfaceSecondary} />
                      <Text style={{ fontSize: 13, fontWeight: "700", color: isActive ? "#FFF" : theme.onSurface }}>
                        {gName} {orderAmt > 0 ? `(₹${orderAmt})` : ""}
                      </Text>
                    </Pressable>
                  );
                })}
                
                <Pressable
                  style={[
                    {
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: "#635BFF",
                      backgroundColor: isDark ? "rgba(99,91,255,0.15)" : "#EEF2FF",
                      gap: 6
                    }
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setActiveOrder(null);
                    const nextNum = uniqueGuests.length + 1;
                    const nextLabel = `Guest ${nextNum}`;
                    setCurrentGuestName(nextLabel);
                    setCurrentSessionId("tsess_" + Math.random().toString(36).substring(2, 9));
                    setLines([]);
                  }}
                >
                  <Ionicons name="add-circle" size={16} color="#635BFF" />
                  <Text style={{ fontSize: 13, fontWeight: "800", color: "#635BFF" }}>
                    + Add Guest
                  </Text>
                </Pressable>
              </ScrollView>
            </View>

            {/* Ticket Lines Header */}
            <View style={{ paddingHorizontal: spacing.md, paddingVertical: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: theme.border }}>
              <Text style={[styles.paneTitle, { color: theme.onSurface, fontSize: 16 }]}>Current Order Items</Text>
              <Text style={[styles.subVal, { color: theme.onSurface, fontSize: 20 }]} testID="waiter-subtotal">₹{subtotal.toFixed(0)}</Text>
            </View>

            {/* Ticket Lines List */}
            <View style={{ flex: 1 }}>
              {lines.length === 0 ? (
                <View style={styles.emptyOrder}>
                  <Ionicons name="cart-outline" size={26} color={theme.onSurfaceTertiary} />
                  <Text style={{ color: theme.onSurfaceTertiary, marginTop: 6 }}>No items added</Text>
                </View>
              ) : (
                <FlatList
                  data={lines}
                  keyExtractor={l => l.menu_item_id}
                  contentContainerStyle={{ padding: spacing.md }}
                  renderItem={({ item }) => (
                    <Animated.View entering={FadeInDown.springify()} style={[styles.line, { backgroundColor: theme.surfaceTertiary, borderColor: theme.border }]} testID={`order-line-${item.menu_item_id}`}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.lineName, { color: theme.onSurface }]}>{item.name}</Text>
                        <Text style={[styles.linePrice, { color: theme.onSurfaceSecondary }]}>₹{item.price} × {item.quantity} = ₹{(item.price * item.quantity).toFixed(0)}</Text>
                      </View>
                      <Pressable onPress={() => dec(item.menu_item_id)} style={[styles.qBtn, { backgroundColor: theme.surfaceSecondary }]} testID={`order-dec-${item.menu_item_id}`}>
                        <Ionicons name="remove" size={16} color={theme.onSurface} />
                      </Pressable>
                      <Text style={[styles.qty, { color: theme.onSurface }]}>{item.quantity}</Text>
                      <Pressable onPress={() => inc(item.menu_item_id)} style={[styles.qBtn, { backgroundColor: theme.surfaceSecondary }]} testID={`order-inc-${item.menu_item_id}`}>
                        <Ionicons name="add" size={16} color={theme.onSurface} />
                      </Pressable>
                      <Pressable onPress={() => remove(item.menu_item_id)} style={{ marginLeft: 6 }} testID={`order-del-${item.menu_item_id}`} hitSlop={8}>
                        <Ionicons name="trash" size={18} color={colors.onError} />
                      </Pressable>
                    </Animated.View>
                  )}
                />
              )}
            </View>

            {/* Submit Action Footer */}
            <View style={{ padding: spacing.md, borderTopWidth: 1, borderTopColor: theme.border, backgroundColor: theme.surface }}>
              {err && <Text style={{ color: colors.onError, backgroundColor: colors.error, padding: 8, borderRadius: 8, marginBottom: 8, fontSize: 12, textAlign: "center" }}>{err}</Text>}
              <Pressable
                style={[
                  {
                    backgroundColor: totalQty > 0 ? "#635BFF" : theme.surfaceTertiary,
                    paddingVertical: 14,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "row",
                    gap: 8,
                  }
                ]}
                disabled={totalQty === 0 || busy}
                onPress={submitOrder}
              >
                {busy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="send" size={16} color={totalQty > 0 ? "#FFFFFF" : theme.onSurfaceTertiary} />
                    <Text style={{ color: totalQty > 0 ? "#FFFFFF" : theme.onSurfaceTertiary, fontWeight: "800", fontSize: 15 }}>
                      {totalQty > 0 ? `Send Order (${totalQty} items • ₹${subtotal.toFixed(0)})` : "Add items to place order"}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { paddingTop: insets.top, backgroundColor: theme.surface }]} testID="waiter-screen">
      
      {/* Top Header with Back to Details */}
      <View style={[styles.menuHeaderBar, { backgroundColor: theme.surface }]}>
        <Pressable onPress={handleStepBack} style={[styles.backBtn, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={theme.onSurface} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <Text style={[styles.detailsTitle, { color: theme.onSurface }]}>Table {selectedTableObj?.label || table}</Text>
          <Text style={[styles.detailsSub, { color: theme.onSurfaceSecondary }]}>
            Main • {selectedTableObj?.seats || 4} seats • {tableOrders.length} open {tableOrders.length === 1 ? "order" : "orders"}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Redesigned Add Order - Guest/Customer Selector */}
      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.border, backgroundColor: theme.surface }}>
        <Text style={{ fontSize: 11, fontWeight: "700", color: theme.onSurfaceSecondary, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>Select Guest to Add Items</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
          {displayGuests.map((gName, idx) => {
            const isActive = gName === currentGuestName;
            const matchedOrder = tableOrders.find((o: any) => (o.customer_name || "Guest 1") === gName);
            const orderAmt = matchedOrder ? matchedOrder.subtotal || 0 : 0;
            return (
              <Pressable
                key={gName + idx}
                style={[
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 12,
                    borderWidth: 1,
                    gap: 6
                  },
                  isActive
                    ? { backgroundColor: "#635BFF", borderColor: "#635BFF" }
                    : { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }
                ]}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setCurrentGuestName(gName);
                  if (matchedOrder) {
                    setActiveOrder(matchedOrder);
                    setCurrentSessionId(matchedOrder.session_id);
                    setLines((matchedOrder.items || []).map((it: any) => ({
                      menu_item_id: it.menu_item_id || it.id || "",
                      name: it.name,
                      price: it.price,
                      quantity: it.quantity,
                      notes: it.notes || "",
                    })));
                  } else {
                    setActiveOrder(null);
                    setLines([]);
                  }
                }}
              >
                <Ionicons name="person" size={14} color={isActive ? "#FFF" : theme.onSurfaceSecondary} />
                <Text style={{ fontSize: 13, fontWeight: "700", color: isActive ? "#FFF" : theme.onSurface }}>
                  {gName} {orderAmt > 0 ? `(₹${orderAmt})` : ""}
                </Text>
              </Pressable>
            );
          })}
          
          <Pressable
            style={[
              {
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#635BFF",
                backgroundColor: isDark ? "rgba(99,91,255,0.15)" : "#EEF2FF",
                gap: 6
              }
            ]}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setActiveOrder(null);
              const nextNum = uniqueGuests.length + 1;
              const nextLabel = `Guest ${nextNum}`;
              setCurrentGuestName(nextLabel);
              setCurrentSessionId("tsess_" + Math.random().toString(36).substring(2, 9));
              setLines([]);
            }}
          >
            <Ionicons name="add-circle" size={16} color="#635BFF" />
            <Text style={{ fontSize: 13, fontWeight: "800", color: "#635BFF" }}>
              + Add Guest
            </Text>
          </Pressable>
        </ScrollView>
      </View>

      <View style={[styles.orderPane, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
        <View style={styles.orderHeader}>
          <Text style={[styles.paneTitle, { color: theme.onSurface }]}>Current Order Items</Text>
          <AnimText style={[styles.subVal, animStyle, { color: theme.onSurface }]} testID="waiter-subtotal">₹{subtotal.toFixed(0)}</AnimText>
        </View>
        {lines.length === 0 ? (
          <View style={styles.emptyOrder}>
            <Ionicons name="cart-outline" size={26} color={theme.onSurfaceTertiary} />
            <Text style={{ color: theme.onSurfaceTertiary, marginTop: 6 }}>No items added</Text>
          </View>
        ) : (
          <FlatList
            data={lines}
            keyExtractor={l => l.menu_item_id}
            renderItem={({ item }) => (
              <Animated.View entering={FadeInDown.springify()} style={[styles.line, { backgroundColor: theme.surfaceTertiary, borderColor: theme.border }]} testID={`order-line-${item.menu_item_id}`}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.lineName, { color: theme.onSurface }]}>{item.name}</Text>
                  <Text style={[styles.linePrice, { color: theme.onSurfaceSecondary }]}>₹{item.price} × {item.quantity} = ₹{(item.price * item.quantity).toFixed(0)}</Text>
                </View>
                <Pressable onPress={() => dec(item.menu_item_id)} style={[styles.qBtn, { backgroundColor: theme.surfaceSecondary }]} testID={`order-dec-${item.menu_item_id}`}>
                  <Ionicons name="remove" size={16} color={theme.onSurface} />
                </Pressable>
                <Text style={[styles.qty, { color: theme.onSurface }]}>{item.quantity}</Text>
                <Pressable onPress={() => inc(item.menu_item_id)} style={[styles.qBtn, { backgroundColor: theme.surfaceSecondary }]} testID={`order-inc-${item.menu_item_id}`}>
                  <Ionicons name="add" size={16} color={theme.onSurface} />
                </Pressable>
                <Pressable onPress={() => remove(item.menu_item_id)} style={{ marginLeft: 6 }} testID={`order-del-${item.menu_item_id}`} hitSlop={8}>
                  <Ionicons name="trash" size={18} color={colors.onError} />
                </Pressable>
              </Animated.View>
            )}
          />
        )}
      </View>

      <View style={[styles.menuPane, { backgroundColor: theme.surface }]}>
        <View style={[styles.searchRow, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
          <Ionicons name="search" size={16} color={theme.onSurfaceTertiary} />
          <TextInput
            value={search} onChangeText={setSearch} placeholder="Search dishes"
            placeholderTextColor={theme.onSurfaceTertiary} style={[styles.search, { color: theme.onSurface }]}
            testID="waiter-search-input"
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsWrap} contentContainerStyle={styles.chipsRow}>
          <Chip label="All" active={selCat === "all"} onPress={() => setSelCat("all")} testID="wchip-all" />
          {cats.map(c => (
            <Chip key={c.id} label={c.name} active={selCat === c.id} onPress={() => setSelCat(c.id)} testID={`wchip-${c.id}`} />
          ))}
        </ScrollView>
        {loading ? (
          <View style={styles.empty}><ActivityIndicator color={colors.brand} /></View>
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ color: colors.onSurfaceTertiary }}>No items. Add via Menu tab.</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={i => i.id}
            numColumns={2}
            columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
            contentContainerStyle={{ paddingBottom: 140, paddingTop: spacing.md, gap: spacing.md }}
            renderItem={({ item, index }) => (
              <Animated.View entering={FadeInUp.delay(index * 30).springify()} style={{ flex: 1 }}>
                <Pressable style={styles.menuCard} onPress={() => add(item)} testID={`waiter-add-${item.id}`}>
                  <Image source={menuItemImageSource(item)} style={styles.menuImg} contentFit="cover" transition={200} />
                  <View style={styles.menuOverlay}>
                    <Text style={styles.menuName} numberOfLines={2}>{item.name}</Text>
                    <Text style={styles.menuPrice}>₹{item.price}</Text>
                  </View>
                  <View style={styles.plus}><Ionicons name="add" size={16} color={colors.onBrand} /></View>
                </Pressable>
              </Animated.View>
            )}
          />
        )}
      </View>

      {err && <Text style={styles.err} testID="waiter-error">{err}</Text>}

      {totalQty > 0 && (
        <View style={[styles.cta, { bottom: insets.bottom + 12 }]}>
          <SlideToOrder 
            onSlideComplete={submitOrder} 
            busy={busy} 
            totalQty={totalQty} 
            subtotal={subtotal} 
          />
        </View>
      )}
    </View>
  );
}

function SlideToOrder({ onSlideComplete, busy, totalQty, subtotal }: { onSlideComplete: () => void; busy: boolean; totalQty: number; subtotal: number }) {
  const onSlideCompleteRef = useRef(onSlideComplete);
  useEffect(() => {
    onSlideCompleteRef.current = onSlideComplete;
  }, [onSlideComplete]);

  const pan = useRef(new RNAnimated.Value(0)).current;
  const [completed, setCompleted] = useState(false);
  const [trackWidth, setTrackWidth] = useState(Dimensions.get("window").width - 32);

  const thumbSize = 48;
  const maxDistance = Math.max(0, trackWidth - thumbSize - 8);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !busy && !completed,
      onMoveShouldSetPanResponder: () => !busy && !completed,
      onPanResponderMove: (e, gestureState) => {
        const x = Math.max(0, Math.min(maxDistance, gestureState.dx));
        pan.setValue(x);
      },
      onPanResponderRelease: (e, gestureState) => {
        if (gestureState.dx >= maxDistance * 0.75) {
          setCompleted(true);
          RNAnimated.spring(pan, {
            toValue: maxDistance,
            useNativeDriver: true,
            bounciness: 0,
          }).start(() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            onSlideCompleteRef.current();
            setTimeout(() => {
              RNAnimated.spring(pan, {
                toValue: 0,
                useNativeDriver: true,
              }).start(() => {
                setCompleted(false);
              });
            }, 1000);
          });
        } else {
          RNAnimated.spring(pan, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  const textOpacity = pan.interpolate({
    inputRange: [0, maxDistance * 0.5],
    outputRange: [1, 0.1],
    extrapolate: "clamp",
  });

  return (
    <View 
      style={styles.slideTrack}
      onLayout={(e) => {
        const width = e.nativeEvent.layout.width;
        if (width > 0) setTrackWidth(width);
      }}
      testID="waiter-send-btn"
    >
      <RNAnimated.Text style={[styles.slideText, { opacity: textOpacity }]}>
        👉 Slide to Place Order ({totalQty} • ₹{subtotal.toFixed(0)})
      </RNAnimated.Text>

      <RNAnimated.View
        {...panResponder.panHandlers}
        style={[
          styles.slideThumb,
          {
            transform: [{ translateX: pan }],
          },
        ]}
      >
        {busy ? (
          <ActivityIndicator color="#635BFF" size="small" />
        ) : (
          <Ionicons name="chevron-forward" size={24} color="#635BFF" />
        )}
      </RNAnimated.View>
    </View>
  );
}

function Chip({ label, active, onPress, testID }: { label: string; active: boolean; onPress: () => void; testID: string }) {
  const { theme } = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.chip, { backgroundColor: active ? "#635BFF" : theme.surfaceSecondary, borderColor: active ? "#635BFF" : theme.border }, { flexShrink: 0 }]} testID={testID}>
      <Text style={[styles.chipText, { color: active ? "#FFFFFF" : theme.onSurfaceSecondary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  wrap: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  title: { color: colors.onSurface, fontSize: 28, fontWeight: "900" },
  subtitle: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 2, fontWeight: "500" },
  logoutPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FEF2F2", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: "#FECACA" },
  logoutText: { color: "#EF4444", fontSize: 13, fontWeight: "800" },
  legendRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, paddingHorizontal: spacing.lg, marginVertical: spacing.md },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "600" },
  legendCount: { color: colors.onSurface, fontWeight: "800" },
  sectionHeader: { paddingHorizontal: spacing.lg, marginBottom: spacing.xs },
  sectionTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "800" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  
  tableCard: {
    width: "100%",
    minHeight: 116,
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    alignItems: "flex-start",
    justifyContent: "space-between",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  cardPressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
  badgeIconBox: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  cardLabel: { color: colors.onSurface, fontSize: 19, fontWeight: "900", marginTop: 4 },
  cardSeats: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "600" },
  cardStatus: { fontSize: 12, fontWeight: "800", marginTop: 2 },

  // Details View Styles (Matching Screenshot)
  detailsHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, justifyContent: "center", alignItems: "center" },
  detailsTitle: { color: colors.onSurface, fontSize: 24, fontWeight: "900" },
  detailsSub: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 2, fontWeight: "500" },
  orderCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "rgba(0,0,0,0.03)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 3,
  },
  orderCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderCardNum: { color: colors.onSurface, fontSize: 20, fontWeight: "900" },
  statusPill: { backgroundColor: "#ECEBFF", paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill },
  statusPillText: { color: "#635BFF", fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
  itemRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.xs },
  itemQty: { color: "#635BFF", fontSize: 15, fontWeight: "800", width: 30 },
  itemTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "600", flex: 1 },
  itemAmt: { color: colors.onSurface, fontSize: 16, fontWeight: "700" },
  subtotalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: "#F1F5F9", gap: 8 },
  cardActionsWrap: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 },
  subtotalLbl: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "500" },
  subtotalVal: { color: colors.onSurface, fontSize: 17, fontWeight: "900" },

  bottomActionBar: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#FFFFFF", flexDirection: "row", padding: spacing.lg, gap: spacing.md, borderTopWidth: 1, borderTopColor: "#E2E8F0" },
  addOrderBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 16, borderRadius: radius.lg, backgroundColor: "#F1F0FF", borderWidth: 1, borderColor: "rgba(99,91,255,0.2)" },
  addOrderBtnText: { color: "#635BFF", fontSize: 15, fontWeight: "800" },
  genBillBtn: { flex: 1.3, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: 12, borderRadius: radius.lg, backgroundColor: "#635BFF" },
  genBillAmt: { color: "#FFFFFF", fontSize: 18, fontWeight: "900" },
  genBillSub: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "600" },

  // Menu Order Mode Styles
  menuHeaderBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  menuHeaderTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "800" },
  orderPane: { height: "32%", backgroundColor: colors.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  orderHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  paneTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "700" },
  tableChipsWrap: { maxHeight: 44, minHeight: 44 },
  tableChipsRow: { gap: spacing.sm, alignItems: "center", paddingRight: spacing.md },
  tableInputInline: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 8, color: colors.onSurface, minWidth: 100, borderWidth: 1, borderColor: colors.border },
  emptyOrder: { flex: 1, alignItems: "center", justifyContent: "center" },
  line: { flexDirection: "row", alignItems: "center", paddingVertical: 8, gap: 6 },
  lineName: { color: colors.onSurface, fontSize: 14, fontWeight: "600" },
  linePrice: { color: colors.onSurfaceSecondary, fontSize: 11 },
  qBtn: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  qty: { color: colors.onSurface, minWidth: 20, textAlign: "center", fontWeight: "600" },
  subVal: { color: colors.brand, fontSize: 22, fontWeight: "700" },

  menuPane: { flex: 1 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surfaceSecondary, marginHorizontal: spacing.lg, marginTop: spacing.md, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  search: { flex: 1, color: colors.onSurface, paddingVertical: 10 },
  chipsWrap: { maxHeight: 56, minHeight: 56, marginTop: spacing.sm },
  chipsRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: "center" },
  chip: { paddingHorizontal: 14, height: 36, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, justifyContent: "center" },
  chipActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brand },
  chipText: { color: colors.onSurfaceSecondary, fontSize: 13 },
  chipTextActive: { color: colors.brand, fontWeight: "600" },
  menuCard: { aspectRatio: 0.95, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  menuImg: { flex: 1, width: "100%" },
  menuOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomLeftRadius: radius.lg - 1,
    borderBottomRightRadius: radius.lg - 1,
  },
  menuName: {
    color: "#FFFFFF",
    fontSize: 13.5,
    fontWeight: "800",
    letterSpacing: 0.2,
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  menuPrice: {
    color: "#A5B4FC",
    fontSize: 15,
    fontWeight: "900",
    marginTop: 2,
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  plus: { position: "absolute", right: 8, top: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  cta: { position: "absolute", left: spacing.lg, right: spacing.lg, backgroundColor: "transparent", overflow: "visible" },
  slideTrack: {
    height: 56,
    borderRadius: 28,
    backgroundColor: "#635BFF",
    paddingHorizontal: 4,
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
    width: "100%",
    shadowColor: "#635BFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  slideText: {
    position: "absolute",
    alignSelf: "center",
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  slideThumb: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  ctaText: { color: colors.onBrand, fontWeight: "700", fontSize: 15, letterSpacing: 0.3 },
  err: { position: "absolute", left: spacing.lg, right: spacing.lg, bottom: 140, color: colors.onError, backgroundColor: colors.error, padding: spacing.md, borderRadius: radius.md, textAlign: "center" },
  notesContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  notesText: {
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
  },
  guestActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.md,
    borderWidth: 1,
    minHeight: 34,
  },
  guestPickerSheet: {
    padding: spacing.xl,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  guestPickerTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  guestPickerOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: 10,
  },
  guestPickerOptionText: {
    fontSize: 15,
    fontWeight: "600",
  },
  desktopContainer: {
    flex: 1,
    width: "100%",
  },
  desktopContainerActive: {
    maxWidth: 1400,
    alignSelf: "center",
    width: "100%",
  },
});
