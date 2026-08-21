import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, saveTokens, clearTokens, getAccess, getStoredUser, getRefresh } from "@/src/lib/api";

type User = { 
  id: string; 
  email: string; 
  full_name: string; 
  role: string; 
  tenant_id: string | null; 
  privacy_consent?: boolean; 
  marketing_consent?: boolean; 
};

type Ctx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  staffLogin: (phone: string, pin: string) => Promise<void>;
  register: (email: string, password: string, full_name: string, role?: string, terms_accepted?: boolean, privacy_consent?: boolean, marketing_consent?: boolean) => Promise<void>;
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
      const stored = await getStoredUser();
      if (stored) {
        setUser(stored);
      }
      const t = await getAccess();
      if (!t && !stored) { setUser(null); return; }
      
      const me = await api.me();
      if (me) {
        setUser(me);
      }
    } catch (e: any) {
      // Only clear tokens on explicit unrecoverable 401 Unauthorized, never on network failure
      if (e?.status === 401) {
        setUser(null);
        await clearTokens();
      }
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        // Hydrate stored user immediately to determine route on Frame 0
        const stored = await getStoredUser();
        if (stored) {
          setUser(stored);
        } else {
          setUser(null);
        }
      } catch {
        setUser(null);
      } finally {
        // Unblock UI rendering instantly
        setLoading(false);
      }

      // Validate session and refresh user profile silently in the background
      try {
        const t = await getAccess();
        if (t) {
          const me = await api.me();
          if (me) {
            setUser(me);
            const r = await getRefresh();
            await saveTokens(t, r || "", me);
          }
        }
      } catch (e: any) {
        if (e?.status === 401) {
          setUser(null);
          await clearTokens();
        }
      }
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const r = await api.login(email, password);
    await saveTokens(r.access_token, r.refresh_token, r.user);
    setUser(r.user);
  };
  const staffLogin = async (phone: string, pin: string) => {
    const r = await api.staffLogin(phone, pin);
    await saveTokens(r.access_token, r.refresh_token, r.user);
    setUser(r.user);
  };
  const register = async (email: string, password: string, full_name: string, role = "owner", terms_accepted = false, privacy_consent = false, marketing_consent = false) => {
    const r = await api.register(email, password, full_name, role, terms_accepted, privacy_consent, marketing_consent);
    await saveTokens(r.access_token, r.refresh_token, r.user);
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
