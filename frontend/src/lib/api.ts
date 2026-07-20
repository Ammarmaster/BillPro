import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

const KEYS = { access: "lumina_access", refresh: "lumina_refresh" };

// SecureStore is unreliable on web -> fallback to localStorage
async function setItem(k: string, v: string) {
  if (Platform.OS === "web") {
    try { window.localStorage.setItem(k, v); } catch {}
    return;
  }
  await SecureStore.setItemAsync(k, v);
}
async function getItem(k: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try { return window.localStorage.getItem(k); } catch { return null; }
  }
  return await SecureStore.getItemAsync(k);
}
async function delItem(k: string) {
  if (Platform.OS === "web") {
    try { window.localStorage.removeItem(k); } catch {}
    return;
  }
  await SecureStore.deleteItemAsync(k);
}

export async function saveTokens(access: string, refresh: string) {
  await setItem(KEYS.access, access);
  await setItem(KEYS.refresh, refresh);
}
export async function clearTokens() {
  await delItem(KEYS.access);
  await delItem(KEYS.refresh);
}
export async function getAccess() { return getItem(KEYS.access); }
export async function getRefresh() { return getItem(KEYS.refresh); }

async function req(path: string, opts: RequestInit = {}, auth = true): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((opts.headers as any) || {}),
  };
  if (auth) {
    const t = await getAccess();
    if (t) headers["Authorization"] = `Bearer ${t}`;
  }
  const res = await fetch(`${BASE}/api${path}`, { ...opts, headers });
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) {
    const msg = (data && (data.detail || data.message)) || `HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data;
}

export const api = {
  login: (email: string, password: string) =>
    req("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }, false),
  staffLogin: (phone: string, pin: string) =>
    req("/auth/staff-login", { method: "POST", body: JSON.stringify({ phone, pin }) }, false),
  register: (email: string, password: string, full_name: string, role = "owner") =>
    req("/auth/register", { method: "POST", body: JSON.stringify({ email, password, full_name, role }) }, false),
  me: () => req("/auth/me"),
  getRestaurant: () => req("/restaurant"),
  saveRestaurant: (payload: any) => req("/restaurant", { method: "POST", body: JSON.stringify(payload) }),
  listCategories: () => req("/categories"),
  createCategory: (payload: any) => req("/categories", { method: "POST", body: JSON.stringify(payload) }),
  deleteCategory: (id: string) => req(`/categories/${id}`, { method: "DELETE" }),
  listMenu: () => req("/menu-items"),
  createMenuItem: (payload: any) => req("/menu-items", { method: "POST", body: JSON.stringify(payload) }),
  updateMenuItem: (id: string, payload: any) => req(`/menu-items/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteMenuItem: (id: string) => req(`/menu-items/${id}`, { method: "DELETE" }),
  listTables: () => req("/tables"),
  createTable: (payload: any) => req("/tables", { method: "POST", body: JSON.stringify(payload) }),
  deleteTable: (id: string) => req(`/tables/${id}`, { method: "DELETE" }),
  listWaiters: () => req("/staff/waiters"),
  createWaiter: (payload: any) => req("/staff/waiters", { method: "POST", body: JSON.stringify(payload) }),
  deleteWaiter: (id: string) => req(`/staff/waiters/${id}`, { method: "DELETE" }),
  createOrder: (payload: any) => req("/orders", { method: "POST", body: JSON.stringify(payload) }),
  listOrders: (status?: string) => req(`/orders${status ? `?status_filter=${status}` : ""}`),
  updateOrderStatus: (id: string, status: string) =>
    req(`/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  createBill: (payload: any) => req("/bills", { method: "POST", body: JSON.stringify(payload) }),
  markBillPaid: (id: string) => req(`/bills/${id}/pay`, { method: "PATCH" }),
  listBills: () => req("/bills"),
  dashboardSummary: () => req("/dashboard/summary"),
  // Super admin
  adminSummary: () => req("/admin/summary"),
  adminListRestaurants: () => req("/admin/restaurants"),
  adminRestaurantDetail: (id: string) => req(`/admin/restaurants/${id}`),
  adminDeleteRestaurant: (id: string) => req(`/admin/restaurants/${id}`, { method: "DELETE" }),
  adminListUsers: () => req("/admin/users"),
  adminResetPassword: (uid: string, new_password: string) =>
    req(`/admin/users/${uid}/reset-password`, { method: "POST", body: JSON.stringify({ new_password }) }),
  adminDeleteUser: (uid: string) => req(`/admin/users/${uid}`, { method: "DELETE" }),
  adminListPlans: () => req("/admin/plans"),
  adminCreatePlan: (payload: any) => req("/admin/plans", { method: "POST", body: JSON.stringify(payload) }),
  adminDeletePlan: (id: string) => req(`/admin/plans/${id}`, { method: "DELETE" }),
  adminAssignSubscription: (tid: string, plan_id: string) =>
    req(`/admin/restaurants/${tid}/subscription`, { method: "POST", body: JSON.stringify({ plan_id, status: "active" }) }),
  adminCancelSubscription: (tid: string) => req(`/admin/restaurants/${tid}/subscription`, { method: "DELETE" }),
  // Razorpay subscription flow (owner)
  mySubscription: () => req("/subscriptions/mine"),
  publicPlans: () => req("/plans"),
  checkout: (plan_id: string) => req("/subscriptions/checkout", { method: "POST", body: JSON.stringify({ plan_id }) }),
  verifyPayment: (payload: any) => req("/subscriptions/verify", { method: "POST", body: JSON.stringify(payload) }),
};
