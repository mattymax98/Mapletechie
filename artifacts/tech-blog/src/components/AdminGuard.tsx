import { ReactNode } from "react";
import { Redirect } from "wouter";
import { Helmet } from "react-helmet-async";
import { useAdmin } from "@/context/AdminContext";

/**
 * Wraps every admin-only page. In addition to gating access, it injects a
 * `<meta name="robots" content="noindex, nofollow">` tag so even if Googlebot
 * (or any crawler) reaches an /admin URL, it will not be added to the index.
 */
export function AdminGuard({ children }: { children: ReactNode }) {
  const { isAdmin } = useAdmin();
  return (
    <>
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="googlebot" content="noindex, nofollow" />
      </Helmet>
      {isAdmin ? <>{children}</> : <Redirect to="/admin/login" />}
    </>
  );
}
