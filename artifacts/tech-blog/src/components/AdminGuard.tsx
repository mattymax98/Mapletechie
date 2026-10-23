import { ReactNode } from "react";
import { Redirect } from "wouter";
import { Helmet } from "react-helmet-async";
import { useAdmin } from "@/context/AdminContext";

/**
 * Wraps every admin-only page. In addition to gating access, it injects a
 * `<meta name="robots" content="noindex, nofollow">` tag so even if Googlebot
 * (or any crawler) reaches an /admin URL, it will not be added to the index.
 */
/**
 * `adminOnly` requires the *admin* role specifically (founding admin), not
 * just any signed-in editor. Use it for pages that bypass per-editor
 * permission checks.
 */
export function AdminGuard({ children, adminOnly = false, ownerOnly = false }: { children: ReactNode; adminOnly?: boolean; ownerOnly?: boolean }) {
  const { isAdmin, user } = useAdmin();
  const allowed = isAdmin && (!adminOnly || user?.role === "admin") && (!ownerOnly || user?.isOwner === true);
  return (
    <>
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="googlebot" content="noindex, nofollow" />
      </Helmet>
      {allowed ? <>{children}</> : <Redirect to={isAdmin ? "/admin" : "/admin/login"} />}
    </>
  );
}
