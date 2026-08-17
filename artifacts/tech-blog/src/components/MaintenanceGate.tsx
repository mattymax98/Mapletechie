import { ReactNode, useState } from "react";
import { useGetMaintenanceStatus, getGetMaintenanceStatusQueryKey } from "@workspace/api-client-react";
import { useAdmin } from "@/context/AdminContext";
import { MaintenanceScreen } from "./MaintenanceScreen";
import { X } from "lucide-react";

/**
 * Wraps the public site. Polls the always-available maintenance status
 * endpoint and, when maintenance mode is on:
 *  - mode === 'full'   → replaces the public site with the full maintenance screen
 *  - mode === 'banner' → renders a dismissible amber top banner
 *
 * Signed-in admins/editors bypass the full lockout so they can keep previewing
 * the site while it's "down" for everyone else.
 *
 * While the very first status request is in flight we render nothing (null)
 * rather than failing-open with children — failing open lets child components
 * fire API calls that all return 423 during maintenance, causing crashes/errors
 * before the maintenance screen has a chance to appear.
 */

function MaintenanceBanner({
  message,
  dismissKey,
}: {
  message?: string | null;
  dismissKey: string;
}) {
  const storageKey = `maintenance_dismissed:${dismissKey}`;
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });

  const handleDismiss = () => {
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      // ignore storage errors
    }
    setDismissed(true);
  };

  if (dismissed) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-50 flex items-center justify-between gap-4 bg-amber-500 px-4 py-2.5 text-sm font-medium text-amber-950">
      <span className="flex-1 text-center">
        {message?.trim()
          ? message
          : "We're currently doing some maintenance. The site may be briefly interrupted."}
      </span>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss maintenance notice"
        className="shrink-0 rounded p-0.5 hover:bg-amber-600/30 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function MaintenanceGate({ children }: { children: ReactNode }) {
  const { user } = useAdmin();
  const { data } = useGetMaintenanceStatus({
    query: {
      queryKey: getGetMaintenanceStatusQueryKey(),
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
      staleTime: 0,
    },
  });

  // Status hasn't arrived yet — render nothing rather than letting children
  // fire API calls that will all fail during maintenance.
  // The /api/settings/status response is served from a 5-second in-memory
  // cache on the API server, so this blank is typically < 100 ms.
  if (data === undefined) {
    return null;
  }

  const inMaintenance = data.maintenance === true;
  const severity = data.severity ?? "full";
  const message = data.message;

  // Full lockout: admins bypass, public visitors see the screen
  if (inMaintenance && severity === "full" && !user) {
    return <MaintenanceScreen message={message} eta={data?.eta} />;
  }

  // Banner mode: shown to everyone (including admins) so they see what visitors see
  if (inMaintenance && severity === "banner") {
    // Use the message as part of the dismiss key so it re-shows when message changes
    const dismissKey = message?.trim() || "__default__";
    return (
      <>
        <MaintenanceBanner message={message} dismissKey={dismissKey} />
        {/* Push content down so the fixed banner doesn't overlap it */}
        <div className="pt-10">
          {children}
        </div>
      </>
    );
  }

  return <>{children}</>;
}
