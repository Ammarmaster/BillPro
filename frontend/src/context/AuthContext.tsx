import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, saveTokens, clearTokens, getAccess } from "@/src/lib/api";

type User = { id: string; email: string; full_name: string; role: string; tenant_id: string | null };

type Ctx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  staffLogin: (phone: string, pin: string) => Promise<void>;
  register: (email: string, password: string, full_name: string, role?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<Ctx>({
  user: null,
  loading: true,
  login: async () => {},
  staffLogin: async () => {},
  register: async () => {},
  logout: async () => {},
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const t = await getAccess();
      if (!t) { setUser(null); return; }
      const me = await api.me();
      setUser(me);
    } catch {
      setUser(null);
      await clearTokens();
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refreshUser();
      setLoading(false);
    })();
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const r = await api.login(email, password);
    await saveTokens(r.access_token, r.refresh_token);
    setUser(r.user);
  };
  const staffLogin = async (phone: string, pin: string) => {
    const r = await api.staffLogin(phone, pin);
    await saveTokens(r.access_token, r.refresh_token);
    setUser(r.user);
  };
  const register = async (email: string, password: string, full_name: string, role = "owner") => {
    const r = await api.register(email, password, full_name, role);
    await saveTokens(r.access_token, r.refresh_token);
    setUser(r.user);
  };
  const logout = async () => {
    await clearTokens();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, staffLogin, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
