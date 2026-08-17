import { ReactNode, useState } from "react";
import { useGetMaintenanceStatus, getGetMaintenanceStatusQueryKey } from "@workspace/api-client-react";
import { useAdmin } from "@/context/AdminContext";
import { MaintenanceScreen } from "./MaintenanceScreen";
import { X } from "lucide-react";

/**
 * Wraps the public site. Polls the always-available maintenance status
 * endpoint (~30s) and, when maintenance mode is on:
 *  - mode === 'full'   → replaces the public site with the full maintenance screen
 *  - mode === 'banner' → renders a dismissible amber top banner
 *
 * Signed-in admins/editors bypass the full lockout so they can keep previewing
 * the site while it's "down" for everyone else. The banner is still shown to
 * admins so they can see what visitors see.
 *
 * While the very first status request is in flight we render children rather
 * than flashing a maintenance screen — fail-open is the friendlier default.
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

const STORAGE_KEY = "mapletechie_maintenance_last";

function readCachedState(): { maintenance: boolean; severity: string } | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCachedState(maintenance: boolean, severity: string) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ maintenance, severity }));
  } catch {
    // ignore
  }
}

export function MaintenanceGate({ children }: { children: ReactNode }) {
  const { user } = useAdmin();

  // Seed from sessionStorage so the very first render already knows the last
  // known maintenance state — prevents the fail-open flash of broken content.
  const cached = readCachedState();
  const [localState] = useState<{ maintenance: boolean; severity: string } | null>(cached);

  const { data, isLoading } = useGetMaintenanceStatus({
    query: {
      queryKey: getGetMaintenanceStatusQueryKey(),
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
      staleTime: 0,
    },
  });

  // Persist the latest known state so the next page render starts correctly.
  if (data !== undefined) {
    writeCachedState(data.maintenance, data.severity ?? "full");
  }

  // Use live data once it arrives; fall back to cached; if neither exists yet
  // and we're still loading, block rendering rather than showing broken content.
  const maintenance = data?.maintenance ?? localState?.maintenance ?? null;
  const severity = (data?.severity ?? localState?.severity ?? "full") as string;
  const message = data?.message;

  // Still on the very first fetch with no cached hint → show nothing rather than
  // letting child components fire API calls that will all fail with 503.
  if (isLoading && maintenance === null) {
    return null;
  }

  const inMaintenance = maintenance === true;

  // Full lockout: admins bypass, public visitors see the screen
  if (inMaintenance && severity === "full" && !user) {
    return <MaintenanceScreen message={message} eta={data?.eta} />;
  }

  // Banner mode: shown to everyone (including admins) so they see what visitors see
  if (inMaintenance && severity === "banner") {
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
