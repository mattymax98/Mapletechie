import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  useGetSiteSettings,
  useUpdateSiteSettings,
  getGetSiteSettingsQueryKey,
} from "@workspace/api-client-react";
import { useAdmin } from "@/context/AdminContext";
import { adminJson } from "@/lib/adminFetch";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  Power,
  AlertTriangle,
  ShieldAlert,
  Globe,
  Mail,
  Search,
} from "lucide-react";

const MAPLETECHIE_DOMAIN = "@mapletechie.com";

export default function AdminSettings() {
  const { user } = useAdmin();
  const isAdmin = user?.role === "admin";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useGetSiteSettings({
    query: { queryKey: getGetSiteSettingsQueryKey(), enabled: isAdmin },
  });
  const updateMutation = useUpdateSiteSettings();

  // Bing IndexNow backfill
  const [bingSubmitting, setBingSubmitting] = useState(false);
  const handleBingBackfill = async () => {
    setBingSubmitting(true);
    try {
      const data = await adminJson<{ submitted: number; postCount: number }>(
        "/api/admin/indexnow/backfill",
        { method: "POST" },
      );
      toast({
        title: "Submitted to Bing",
        description: `${data.submitted} URLs queued for re-indexing across ${data.postCount} articles.`,
      });
    } catch (err: unknown) {
      toast({
        title: "Submission failed",
        description: err instanceof Error ? err.message : "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setBingSubmitting(false);
    }
  };

  // Maintenance fields
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [message, setMessage] = useState("");
  const [eta, setEta] = useState("");

  // Email settings fields
  const [notificationEmail, setNotificationEmail] = useState("");
  const [newsletterFromName, setNewsletterFromName] = useState("");
  const [newsletterFromAddress, setNewsletterFromAddress] = useState("");
  const [newsletterReplyTo, setNewsletterReplyTo] = useState("");

  useEffect(() => {
    if (data) {
      setMaintenanceMode(!!data.maintenanceMode);
      setMessage(data.maintenanceMessage ?? "");
      setEta(data.maintenanceEta ?? "");
      setNotificationEmail(data.notificationEmail ?? "");
      setNewsletterFromName(data.newsletterFromName ?? "");
      setNewsletterFromAddress(data.newsletterFromAddress ?? "");
      setNewsletterReplyTo(data.newsletterReplyTo ?? "");
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

  // Validate @mapletechie.com constraint
  const fromAddressError =
    newsletterFromAddress.trim() !== "" &&
    !newsletterFromAddress.trim().toLowerCase().endsWith(MAPLETECHIE_DOMAIN)
      ? `Must be a ${MAPLETECHIE_DOMAIN} address`
      : null;

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const notifyError =
    notificationEmail.trim() !== "" && !emailRe.test(notificationEmail.trim())
      ? "Must be a valid email address"
      : null;
  const replyToError =
    newsletterReplyTo.trim() !== "" && !emailRe.test(newsletterReplyTo.trim())
      ? "Must be a valid email address"
      : null;

  const hasEmailErrors = !!(fromAddressError || notifyError || replyToError);

  const handleSave = () => {
    if (hasEmailErrors) return;
    updateMutation.mutate(
      {
        data: {
          maintenanceMode,
          maintenanceMessage: message.trim() || null,
          maintenanceEta: eta.trim() || null,
          notificationEmail: notificationEmail.trim() || null,
          newsletterFromName: newsletterFromName.trim() || null,
          newsletterFromAddress: newsletterFromAddress.trim() || null,
          newsletterReplyTo: newsletterReplyTo.trim() || null,
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
            Control site-wide behaviour and outgoing email addresses.
          </p>
        </div>

        {isLoading ? (
          <Skeleton className="h-64 w-full bg-zinc-900 rounded-lg" />
        ) : (
          <>
            {/* ── Maintenance ─────────────────────────────────────────── */}
            {envForced && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="text-amber-300 font-medium">
                    Maintenance is forced ON by the{" "}
                    <code>MAINTENANCE_MODE</code> environment variable.
                  </p>
                  <p className="text-amber-200/70 mt-1">
                    This break-glass override always wins. The toggle below
                    won't take the site back online until the env var is removed
                    and the server restarts.
                  </p>
                </div>
              </div>
            )}

            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-5 space-y-5">
              <div className="flex items-center gap-3 mb-1">
                <Power className="w-4 h-4 text-zinc-400" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Maintenance
                </h2>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div
                    className={`flex items-center justify-center w-10 h-10 rounded-lg shrink-0 ${
                      effective
                        ? "bg-orange-500/15 text-orange-400"
                        : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    <Power className="w-5 h-5" />
                  </div>
                  <div>
                    <Label
                      htmlFor="maintenance-toggle"
                      className="text-base font-medium text-white"
                    >
                      Maintenance mode
                    </Label>
                    <p className="text-sm text-zinc-400 mt-0.5">
                      {effective ? (
                        <span className="text-orange-400">
                          The public site is currently offline.
                        </span>
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
                <Label
                  htmlFor="maintenance-message"
                  className="text-sm text-zinc-300"
                >
                  Message{" "}
                  <span className="text-zinc-500">(optional)</span>
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
                  Shown to visitors on the maintenance page. Leave blank for the
                  default copy.
                </p>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="maintenance-eta"
                  className="text-sm text-zinc-300"
                >
                  Expected back{" "}
                  <span className="text-zinc-500">(optional)</span>
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
                  {data?.updatedBy
                    ? `Last changed by ${data.updatedBy}`
                    : "Not changed yet"}
                </p>
              </div>
            </div>

            {maintenanceMode && !envForced && (
              <div className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                <AlertTriangle className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
                <p className="text-sm text-zinc-400">
                  With maintenance mode on, visitors see the maintenance page
                  and public API requests return 503. You and other signed-in
                  editors can still browse the site normally.
                </p>
              </div>
            )}

            {/* ── Email ───────────────────────────────────────────────── */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-5 space-y-5">
              <div className="flex items-center gap-3 mb-1">
                <Mail className="w-4 h-4 text-zinc-400" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Email
                </h2>
              </div>

              <p className="text-xs text-zinc-500 -mt-2">
                Configure where outgoing emails come from and where contact form
                notifications land.
              </p>

              {/* Notification email */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="notification-email"
                  className="text-sm text-zinc-300"
                >
                  Contact form notifications
                </Label>
                <Input
                  id="notification-email"
                  type="email"
                  value={notificationEmail}
                  onChange={(e) => setNotificationEmail(e.target.value)}
                  placeholder="matthew@mapletechie.com"
                  className={`bg-black border-zinc-800 text-white ${notifyError ? "border-red-500/60" : ""}`}
                  maxLength={254}
                />
                {notifyError ? (
                  <p className="text-xs text-red-400">{notifyError}</p>
                ) : (
                  <p className="text-xs text-zinc-500">
                    Where you receive an email when someone submits the contact
                    form. Leave blank to use{" "}
                    <code className="text-zinc-400">
                      matthew@mapletechie.com
                    </code>
                    .
                  </p>
                )}
              </div>

              <div className="border-t border-zinc-800/60 pt-4 space-y-5">
                <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">
                  Newsletter sender
                </p>

                {/* Newsletter from name */}
                <div className="space-y-1.5">
                  <Label
                    htmlFor="newsletter-from-name"
                    className="text-sm text-zinc-300"
                  >
                    From name
                  </Label>
                  <Input
                    id="newsletter-from-name"
                    value={newsletterFromName}
                    onChange={(e) => setNewsletterFromName(e.target.value)}
                    placeholder="Mapletechie"
                    className="bg-black border-zinc-800 text-white"
                    maxLength={100}
                  />
                  <p className="text-xs text-zinc-500">
                    Display name shown in subscribers' inboxes (e.g.{" "}
                    <em>Mapletechie</em>).
                  </p>
                </div>

                {/* Newsletter from address */}
                <div className="space-y-1.5">
                  <Label
                    htmlFor="newsletter-from-address"
                    className="text-sm text-zinc-300"
                  >
                    From address{" "}
                    <span className="text-zinc-500">(must end in @mapletechie.com)</span>
                  </Label>
                  <Input
                    id="newsletter-from-address"
                    type="email"
                    value={newsletterFromAddress}
                    onChange={(e) => setNewsletterFromAddress(e.target.value)}
                    placeholder="newsletter@mapletechie.com"
                    className={`bg-black border-zinc-800 text-white ${fromAddressError ? "border-red-500/60" : ""}`}
                    maxLength={254}
                  />
                  {fromAddressError ? (
                    <p className="text-xs text-red-400">{fromAddressError}</p>
                  ) : (
                    <p className="text-xs text-zinc-500">
                      The verified sending domain is{" "}
                      <code className="text-zinc-400">mapletechie.com</code> —
                      other domains will be rejected by Resend.
                    </p>
                  )}
                </div>

                {/* Newsletter reply-to */}
                <div className="space-y-1.5">
                  <Label
                    htmlFor="newsletter-reply-to"
                    className="text-sm text-zinc-300"
                  >
                    Reply-to address
                  </Label>
                  <Input
                    id="newsletter-reply-to"
                    type="email"
                    value={newsletterReplyTo}
                    onChange={(e) => setNewsletterReplyTo(e.target.value)}
                    placeholder="matthew@mapletechie.com"
                    className={`bg-black border-zinc-800 text-white ${replyToError ? "border-red-500/60" : ""}`}
                    maxLength={254}
                  />
                  {replyToError ? (
                    <p className="text-xs text-red-400">{replyToError}</p>
                  ) : (
                    <p className="text-xs text-zinc-500">
                      Where subscribers land when they hit reply — routes newsletter
                      replies back to your iCloud+ inbox.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* ── Search Indexing ─────────────────────────────────────── */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-5 space-y-4">
              <div className="flex items-center gap-3 mb-1">
                <Search className="w-4 h-4 text-zinc-400" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Search Indexing
                </h2>
              </div>
              <p className="text-sm text-zinc-400">
                Tell Bing to re-crawl your articles immediately via IndexNow instead of
                waiting for the next scheduled crawl. Use this to clear "Blocked" or
                stale URLs in Bing Webmaster Tools.
              </p>
              <div className="flex items-center justify-between gap-4 pt-1">
                <div className="space-y-0.5 min-w-0">
                  <p className="text-sm text-white font-medium">Submit all articles to Bing</p>
                  <p className="text-xs text-zinc-500">
                    Submits every published article and category URL.
                  </p>
                </div>
                <Button
                  onClick={handleBingBackfill}
                  disabled={bingSubmitting}
                  variant="outline"
                  className="border-zinc-700 text-zinc-300 hover:text-white shrink-0"
                >
                  {bingSubmitting ? "Submitting…" : "Submit to Bing"}
                </Button>
              </div>
            </div>

            {/* ── Env override note ────────────────────────────────────── */}
            <div className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
              <Globe className="w-5 h-5 text-zinc-500 shrink-0 mt-0.5" />
              <p className="text-sm text-zinc-500">
                Need to force maintenance even if the database is unreachable?
                Set the{" "}
                <code className="text-zinc-400">MAINTENANCE_MODE</code>{" "}
                environment variable to{" "}
                <code className="text-zinc-400">true</code> and restart the
                server.
              </p>
            </div>

            {/* ── Save ────────────────────────────────────────────────── */}
            <div className="flex justify-end pt-2">
              <Button
                onClick={handleSave}
                disabled={updateMutation.isPending || hasEmailErrors}
                className="bg-orange-500 hover:bg-orange-600 text-white"
              >
                {updateMutation.isPending ? "Saving…" : "Save settings"}
              </Button>
            </div>
          </>
        )}
      </main>
    </AdminShell>
  );
}
