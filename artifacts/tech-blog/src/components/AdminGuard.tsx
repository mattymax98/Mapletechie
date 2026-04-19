import { ReactNode } from "react";
import { Redirect } from "wouter";
import { useAdmin } from "@/context/AdminContext";

export function AdminGuard({ children }: { children: ReactNode }) {
  const { isAdmin } = useAdmin();
  if (!isAdmin) {
    return <Redirect to="/admin/login" />;
  }
  return <>{children}</>;
}
