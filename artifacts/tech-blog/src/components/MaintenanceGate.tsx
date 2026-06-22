import { ReactNode } from "react";
import { useGetMaintenanceStatus, getGetMaintenanceStatusQueryKey } from "@workspace/api-client-react";
import { useAdmin } from "@/context/AdminContext";
import { MaintenanceScreen } from "./MaintenanceScreen";

/**
 * Wraps the public site. Polls the always-available maintenance status
 * endpoint (~30s) and, when maintenance mode is on, replaces the public site
 * with the maintenance screen. Signed-in admins/editors bypass the gate so
 * they can keep previewing the site while it's "down" for everyone else.
 *
 * While the very first status request is in flight we render children rather
 * than flashing a maintenance screen — fail-open is the friendlier default.
 */
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

  const inMaintenance = data?.maintenance === true;

  if (inMaintenance && !user) {
    return <MaintenanceScreen message={data?.message} eta={data?.eta} />;
  }

  return <>{children}</>;
}
