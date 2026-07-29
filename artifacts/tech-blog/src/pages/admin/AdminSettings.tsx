import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { useGetSiteSettings, useUpdateSiteSettings, getGetSiteSettingsQueryKey } from "@workspace/api-client-react";
import { useAdmin } from "@/context/AdminContext";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Power, AlertTriangle, ShieldAlert, Globe } from "lucide-react";

export default function AdminSettings() {
  const { user } = useAdmin();
  const isAdmin = user?.role === "admin";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useGetSiteSettings({
    query: { queryKey: getGetSiteSettingsQueryKey(), enabled: isAdmin },
  });
  const updateMutation = useUpdateSiteSettings();

  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [message, setMessage] = useState("");
  const [eta, setEta] = useState("");

  useEffect(() => {
    if (data) {
      setMaintenanceMode(!!data.maintenanceMode);
      setMessage(data.maintenanceMessage ?? "");
      setEta(data.maintenanceEta ?? "");
    }
  }, [data]);

  if (!isAdmin) {
    return (
      <AdminShell title="Settings">
        <div className="flex items-center justify-center h-64">
          <p className="text-zinc-400">Admins only.</p>
        </div>
      </AdminShell>
    );
  }

  const envForced = !!data?.envForced;
  const effective = !!data?.effectiveMaintenance;

  const handleSave = () => {
    updateMutation.mutate(
      {
        data: {
          maintenanceMode,
          maintenanceMessage: message.trim() || null,
          maintenanceEta: eta.trim() || null,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries();
          toast({ title: "Settings saved", description: "Site settings updated." });
        },
        onError: (err: any) => {
          toast({
            title: "Couldn't save",
            description: err?.message ?? "Something went wrong.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <AdminShell title="Site Settings">
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Site Settings</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Control site-wide behaviour. Use maintenance mode to take the public
            site offline while keeping the admin panel fully usable.
          </p>
        </div>

        {isLoading ? (
          <Skeleton className="h-64 w-full bg-zinc-900 rounded-lg" />
        ) : (
          <>
            {envForced && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="text-amber-300 font-medium">
                    Maintenance is forced ON by the <code>MAINTENANCE_MODE</code> environment variable.
                  </p>
                  <p className="text-amber-200/70 mt-1">
                    This break-glass override always wins. The toggle below won't
                    take the site back online until the env var is removed and
                    the server restarts.
                  </p>
                </div>
              </div>
            )}

            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-5 space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div
                    className={`flex items-center justify-center w-10 h-10 rounded-lg shrink-0 ${
                      effective ? "bg-orange-500/15 text-orange-400" : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    <Power className="w-5 h-5" />
                  </div>
                  <div>
                    <Label htmlFor="maintenance-toggle" className="text-base font-medium text-white">
                      Maintenance mode
                    </Label>
                    <p className="text-sm text-zinc-400 mt-0.5">
                      {effective ? (
                        <span className="text-orange-400">The public site is currently offline.</span>
                      ) : (
                        "The public site is live."
                      )}
                    </p>
                  </div>
                </div>
                <Switch
                  id="maintenance-toggle"
                  checked={maintenanceMode}
                  onCheckedChange={setMaintenanceMode}
                  disabled={envForced}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="maintenance-message" className="text-sm text-zinc-300">
                  Message <span className="text-zinc-500">(optional)</span>
                </Label>
                <Textarea
                  id="maintenance-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="We're tinkering under the hood and will be back shortly."
                  className="bg-black border-zinc-800 text-white min-h-[90px] resize-y"
                  maxLength={2000}
                />
                <p className="text-xs text-zinc-500">
                  Shown to visitors on the maintenance page. Leave blank for the default copy.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="maintenance-eta" className="text-sm text-zinc-300">
                  Expected back <span className="text-zinc-500">(optional)</span>
                </Label>
                <Input
                  id="maintenance-eta"
                  value={eta}
                  onChange={(e) => setEta(e.target.value)}
                  placeholder="e.g. around 3pm ET, or in about an hour"
                  className="bg-black border-zinc-800 text-white"
                  maxLength={200}
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
                <p className="text-xs text-zinc-500">
                  {data?.updatedBy ? `Last changed by ${data.updatedBy}` : "Not changed yet"}
                </p>
                <Button
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                >
                  {updateMutation.isPending ? "Saving…" : "Save settings"}
                </Button>
              </div>
            </div>

            {maintenanceMode && !envForced && (
              <div className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                <AlertTriangle className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
                <p className="text-sm text-zinc-400">
                  With maintenance mode on, visitors see the maintenance page and
                  public API requests return 503. You and other signed-in editors
                  can still browse the site normally.
                </p>
              </div>
            )}

            <div className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
              <Globe className="w-5 h-5 text-zinc-500 shrink-0 mt-0.5" />
              <p className="text-sm text-zinc-500">
                Need to force maintenance even if the database is unreachable? Set
                the <code className="text-zinc-400">MAINTENANCE_MODE</code> environment
                variable to <code className="text-zinc-400">true</code> and restart the server.
              </p>
            </div>
          </>
        )}
      </main>
    </AdminShell>
  );
}
