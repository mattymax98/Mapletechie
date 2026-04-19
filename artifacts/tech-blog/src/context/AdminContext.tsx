import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";

interface AdminContextValue {
  isAdmin: boolean;
  login: (password: string) => void;
  logout: () => void;
  adminPassword: string | null;
}

const AdminContext = createContext<AdminContextValue>({
  isAdmin: false,
  login: () => {},
  logout: () => {},
  adminPassword: null,
});

const STORAGE_KEY = "mapletechie_admin";

export function AdminProvider({ children }: { children: ReactNode }) {
  const [adminPassword, setAdminPassword] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEY);
  });

  useEffect(() => {
    if (adminPassword) {
      setAuthTokenGetter(() => adminPassword);
    } else {
      setAuthTokenGetter(null);
    }
  }, [adminPassword]);

  const login = (password: string) => {
    localStorage.setItem(STORAGE_KEY, password);
    setAdminPassword(password);
    setAuthTokenGetter(() => password);
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setAdminPassword(null);
    setAuthTokenGetter(null);
  };

  return (
    <AdminContext.Provider value={{ isAdmin: !!adminPassword, login, logout, adminPassword }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  return useContext(AdminContext);
}
