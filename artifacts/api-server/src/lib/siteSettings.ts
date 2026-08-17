import { db, siteSettingsTable, type SiteSettings } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const SINGLETON_ID = 1;

/**
 * The DB row is read on almost every public request (to decide whether to
 * show the maintenance gate), so we cache it in-process for a few seconds
 * rather than hitting Postgres each time. Any write through updateSiteSettings
 * busts the cache immediately so the toggle feels instant for the admin.
 */
const CACHE_TTL_MS = 5_000;
let cache: { value: SiteSettings; at: number } | null = null;

/** Truthy values for the MAINTENANCE_MODE break-glass env override. */
function envForcedMaintenance(): boolean {
  const raw = (process.env["MAINTENANCE_MODE"] ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on" || raw === "yes";
}

/** Ensure the singleton settings row exists. Called once at boot. */
export async function seedSiteSettings(): Promise<void> {
  await db
    .insert(siteSettingsTable)
    .values({ id: SINGLETON_ID, maintenanceMode: false })
    .onConflictDoNothing({ target: siteSettingsTable.id });
  logger.info("Site settings singleton ensured");
}

/** Read the singleton row, creating it if it somehow went missing. */
export async function getSiteSettings(): Promise<SiteSettings> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.value;
  }
  let [row] = await db
    .select()
    .from(siteSettingsTable)
    .where(eq(siteSettingsTable.id, SINGLETON_ID));
  if (!row) {
    [row] = await db
      .insert(siteSettingsTable)
      .values({ id: SINGLETON_ID, maintenanceMode: false })
      .returning();
  }
  cache = { value: row!, at: Date.now() };
  return row!;
}

/**
 * Whether maintenance is currently active based on the scheduled window.
 * Returns true if now() is within [startsAt, endsAt].
 * If only startsAt is set: active from startsAt onwards.
 * If only endsAt is set: active until endsAt.
 */
function isWithinScheduledWindow(
  startsAt: Date | null,
  endsAt: Date | null,
): boolean {
  if (!startsAt && !endsAt) return false;
  const now = Date.now();
  const afterStart = startsAt ? now >= startsAt.getTime() : true;
  const beforeEnd = endsAt ? now <= endsAt.getTime() : true;
  return afterStart && beforeEnd;
}

export type MaintenanceSeverity = "full" | "banner";

export interface MaintenanceState {
  /** Whether the public site should be gated right now. */
  active: boolean;
  message: string | null;
  eta: string | null;
  /** True when forced on by the MAINTENANCE_MODE env var (cannot be turned off in the UI). */
  envForced: boolean;
  /** Scheduled start time (ISO string), if set. */
  startsAt: string | null;
  /** Scheduled end time (ISO string), if set. */
  endsAt: string | null;
  /** 'full' for full-page lockout, 'banner' for dismissible top banner. */
  severity: MaintenanceSeverity;
}

/**
 * The effective maintenance state, combining the env override (which always
 * wins) with the DB row. The env override only ever turns maintenance ON.
 *
 * Scheduling logic: when startsAt/endsAt are set, the effective state is
 * active when now() falls within the window. The manual toggle (maintenanceMode)
 * acts as override when no schedule is set (neither startsAt nor endsAt).
 */
export async function getMaintenanceState(): Promise<MaintenanceState> {
  const envForced = envForcedMaintenance();

  // The env override is a break-glass switch that must win even when the DB is
  // unreachable (e.g. during the very migration/incident you flipped it for).
  // So when it's set we never let a DB read failure flip us back to "live": we
  // try to enrich the message/eta from the row, but fall back to env-only.
  if (envForced) {
    try {
      const row = await getSiteSettings();
      const startsAt = row.maintenanceStartsAt ?? null;
      const endsAt = row.maintenanceEndsAt ?? null;
      return {
        active: true,
        message: row.maintenanceMessage ?? null,
        eta: row.maintenanceEta ?? null,
        envForced: true,
        startsAt: startsAt ? startsAt.toISOString() : null,
        endsAt: endsAt ? endsAt.toISOString() : null,
        severity: (row.maintenanceSeverity as MaintenanceSeverity) ?? "full",
      };
    } catch {
      return {
        active: true,
        message: null,
        eta: null,
        envForced: true,
        startsAt: null,
        endsAt: null,
        severity: "full",
      };
    }
  }

  const row = await getSiteSettings();
  const startsAt = row.maintenanceStartsAt ?? null;
  const endsAt = row.maintenanceEndsAt ?? null;
  const hasSchedule = !!(startsAt || endsAt);

  // If a schedule is configured, use the window to determine active state.
  // Otherwise fall back to the manual toggle.
  const active = hasSchedule
    ? isWithinScheduledWindow(startsAt, endsAt)
    : row.maintenanceMode;

  return {
    active,
    message: row.maintenanceMessage ?? null,
    eta: row.maintenanceEta ?? null,
    envForced: false,
    startsAt: startsAt ? startsAt.toISOString() : null,
    endsAt: endsAt ? endsAt.toISOString() : null,
    severity: (row.maintenanceSeverity as MaintenanceSeverity) ?? "full",
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function nullableEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase().slice(0, 254);
  return EMAIL_RE.test(t) ? t : null;
}

function nullableStr(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t || null;
}

function nullableDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export interface UpdateSiteSettingsInput {
  maintenanceMode?: boolean;
  maintenanceMessage?: string | null;
  maintenanceEta?: string | null;
  maintenanceStartsAt?: string | null;
  maintenanceEndsAt?: string | null;
  maintenanceSeverity?: string | null;
  updatedBy?: string | null;
  notificationEmail?: string | null;
  newsletterFromName?: string | null;
  newsletterFromAddress?: string | null;
  newsletterReplyTo?: string | null;
}

export async function updateSiteSettings(
  input: UpdateSiteSettingsInput,
): Promise<SiteSettings> {
  const patch: Partial<SiteSettings> = { updatedAt: new Date() };
  if (typeof input.maintenanceMode === "boolean") patch.maintenanceMode = input.maintenanceMode;
  if (input.maintenanceMessage !== undefined) {
    patch.maintenanceMessage =
      typeof input.maintenanceMessage === "string"
        ? input.maintenanceMessage.trim().slice(0, 2000) || null
        : null;
  }
  if (input.maintenanceEta !== undefined) {
    patch.maintenanceEta =
      typeof input.maintenanceEta === "string"
        ? input.maintenanceEta.trim().slice(0, 200) || null
        : null;
  }
  if (input.maintenanceStartsAt !== undefined) {
    patch.maintenanceStartsAt = nullableDate(input.maintenanceStartsAt);
  }
  if (input.maintenanceEndsAt !== undefined) {
    patch.maintenanceEndsAt = nullableDate(input.maintenanceEndsAt);
  }
  if (input.maintenanceSeverity !== undefined) {
    const sev = input.maintenanceSeverity;
    patch.maintenanceSeverity = sev === "banner" ? "banner" : "full";
  }
  if (input.updatedBy !== undefined) patch.updatedBy = input.updatedBy ?? null;
  if (input.notificationEmail !== undefined)
    patch.notificationEmail = nullableEmail(input.notificationEmail);
  if (input.newsletterFromName !== undefined)
    patch.newsletterFromName = nullableStr(input.newsletterFromName, 100);
  if (input.newsletterFromAddress !== undefined)
    patch.newsletterFromAddress = nullableEmail(input.newsletterFromAddress);
  if (input.newsletterReplyTo !== undefined)
    patch.newsletterReplyTo = nullableEmail(input.newsletterReplyTo);

  const [row] = await db
    .update(siteSettingsTable)
    .set(patch)
    .where(eq(siteSettingsTable.id, SINGLETON_ID))
    .returning();
  cache = null;
  return row!;
}
