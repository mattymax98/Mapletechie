import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { setAuthTokenGetter, getCurrentUser } from "@workspace/api-client-react";

export interface AdminUser {
  id: number;
  username: string;
  displayName: string;
  email?: string;
  bio?: string;
  avatarUrl?: string;
  twitterUrl?: string;
  linkedinUrl?: string;
  instagramUrl?: string;
  githubUrl?: string;
  websiteUrl?: string;
  role: string;
  canPublishDirectly: boolean;
  isActive: boolean;
}

interface AdminContextValue {
  isAdmin: boolean;
  user: AdminUser | null;
  token: string | null;
  login: (token: string, user: AdminUser) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AdminContext = createContext<AdminContextValue>({
  isAdmin: false,
  user: null,
  token: null,
  login: () => {},
  logout: () => {},
  refreshUser: async () => {},
});

const TOKEN_KEY = "mapletechie_admin_token";
const USER_KEY = "mapletechie_admin_user";

export function AdminProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<AdminUser | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  });

  useEffect(() => {
    if (token) {
      setAuthTokenGetter(() => token);
    } else {
      setAuthTokenGetter(null);
    }
  }, [token]);

  // Validate token on mount — if it's been revoked, log out
  useEffect(() => {
    if (!token) return;
    getCurrentUser()
      .then((u: any) => {
        setUser(u);
        localStorage.setItem(USER_KEY, JSON.stringify(u));
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        setToken(null);
        setUser(null);
        setAuthTokenGetter(null);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = (newToken: string, newUser: AdminUser) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    setAuthTokenGetter(() => newToken);
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
    setAuthTokenGetter(null);
  };

  const refreshUser = async () => {
    try {
      const u = await getCurrentUser();
      setUser(u as AdminUser);
      localStorage.setItem(USER_KEY, JSON.stringify(u));
    } catch {
      // ignore
    }
  };

  return (
    <AdminContext.Provider value={{ isAdmin: !!token && !!user, user, token, login, logout, refreshUser }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  return useContext(AdminContext);
}
