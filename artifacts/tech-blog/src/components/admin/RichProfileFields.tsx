import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X } from "lucide-react";

/**
 * Editable structured-profile fields (Person schema markup) shared by the
 * "My Profile" page and the Manage Editors dialog. Everything is optional;
 * filled-in fields power the author page's schema markup and public links.
 */

export interface RichProfileFormValue {
  alternateName: string;
  jobTitle: string;
  locationCity: string;
  locationRegion: string;
  locationCountry: string;
  education: string; // one institution per line
  knowsAbout: string; // comma separated
  organizations: { name: string; url: string }[];
  memberships: { name: string; parentOrganization: string }[];
  profileLinks: { label: string; url: string }[];
}

export const emptyRichProfile: RichProfileFormValue = {
  alternateName: "",
  jobTitle: "",
  locationCity: "",
  locationRegion: "",
  locationCountry: "",
  education: "",
  knowsAbout: "",
  organizations: [],
  memberships: [],
  profileLinks: [],
};

/** Builds form state from an API user object. */
export function richProfileFromUser(u: {
  alternateName?: string | null;
  jobTitle?: string | null;
  locationCity?: string | null;
  locationRegion?: string | null;
  locationCountry?: string | null;
  education?: string[] | null;
  knowsAbout?: string[] | null;
  organizations?: { name: string; url?: string }[] | null;
  memberships?: { name: string; parentOrganization?: string }[] | null;
  profileLinks?: { label: string; url: string }[] | null;
}): RichProfileFormValue {
  return {
    alternateName: u.alternateName ?? "",
    jobTitle: u.jobTitle ?? "",
    locationCity: u.locationCity ?? "",
    locationRegion: u.locationRegion ?? "",
    locationCountry: u.locationCountry ?? "",
    education: (u.education ?? []).join("\n"),
    knowsAbout: (u.knowsAbout ?? []).join(", "),
    organizations: (u.organizations ?? []).map((o) => ({ name: o.name, url: o.url ?? "" })),
    memberships: (u.memberships ?? []).map((m) => ({
      name: m.name,
      parentOrganization: m.parentOrganization ?? "",
    })),
    profileLinks: (u.profileLinks ?? []).map((l) => ({ label: l.label, url: l.url })),
  };
}

/** Converts form state into the API payload shape. */
export function richProfileToPayload(v: RichProfileFormValue) {
  return {
    alternateName: v.alternateName.trim() || null,
    jobTitle: v.jobTitle.trim() || null,
    locationCity: v.locationCity.trim() || null,
    locationRegion: v.locationRegion.trim() || null,
    locationCountry: v.locationCountry.trim() || null,
    education: v.education
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    knowsAbout: v.knowsAbout
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    organizations: v.organizations
      .map((o) => ({ name: o.name.trim(), url: o.url.trim() || undefined }))
      .filter((o) => o.name),
    memberships: v.memberships
      .map((m) => ({
        name: m.name.trim(),
        parentOrganization: m.parentOrganization.trim() || undefined,
      }))
      .filter((m) => m.name),
    profileLinks: v.profileLinks
      .map((l) => ({ label: l.label.trim(), url: l.url.trim() }))
      .filter((l) => l.label || l.url),
  };
}

const inputCls = "bg-zinc-900 border-zinc-700";

export function RichProfileFieldsEditor({
  value,
  onChange,
}: {
  value: RichProfileFormValue;
  onChange: (v: RichProfileFormValue) => void;
}) {
  const set = (patch: Partial<RichProfileFormValue>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-4">
      <div>
        <p className="text-red-400 text-xs uppercase tracking-wider font-bold">
          Public profile details
        </p>
        <p className="text-xs text-zinc-500 mt-1">
          Optional. Anything you fill in appears on your public author page and as structured
          data that helps search engines and AI assistants describe you accurately.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Full / legal name</Label>
          <Input
            value={value.alternateName}
            onChange={(e) => set({ alternateName: e.target.value })}
            placeholder="e.g. Matthew Mbaka Ogbu"
            className={inputCls}
            data-testid="input-alternate-name"
          />
        </div>
        <div className="space-y-2">
          <Label>Job title</Label>
          <Input
            value={value.jobTitle}
            onChange={(e) => set({ jobTitle: e.target.value })}
            placeholder="e.g. Senior Editor, Mapletechie"
            className={inputCls}
            data-testid="input-job-title"
          />
        </div>
        <div className="space-y-2">
          <Label>City</Label>
          <Input
            value={value.locationCity}
            onChange={(e) => set({ locationCity: e.target.value })}
            placeholder="Thunder Bay"
            className={inputCls}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Province / State</Label>
            <Input
              value={value.locationRegion}
              onChange={(e) => set({ locationRegion: e.target.value })}
              placeholder="ON"
              className={inputCls}
            />
          </div>
          <div className="space-y-2">
            <Label>Country</Label>
            <Input
              value={value.locationCountry}
              onChange={(e) => set({ locationCountry: e.target.value })}
              placeholder="CA"
              className={inputCls}
            />
          </div>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Education</Label>
          <Textarea
            value={value.education}
            onChange={(e) => set({ education: e.target.value })}
            rows={2}
            placeholder={"One school per line, e.g.\nLakehead University"}
            className={`${inputCls} resize-none`}
            data-testid="input-education"
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Areas of expertise</Label>
          <Input
            value={value.knowsAbout}
            onChange={(e) => set({ knowsAbout: e.target.value })}
            placeholder="Comma separated, e.g. Cybersecurity, EVs, AI"
            className={inputCls}
          />
        </div>
      </div>

      <ListSection
        title="Organizations you work for"
        addLabel="Add organization"
        rows={value.organizations}
        onRows={(organizations) => set({ organizations })}
        makeRow={() => ({ name: "", url: "" })}
        renderRow={(row, update) => (
          <>
            <Input
              value={row.name}
              onChange={(e) => update({ ...row, name: e.target.value })}
              placeholder="Organization name"
              className={inputCls}
            />
            <Input
              value={row.url}
              onChange={(e) => update({ ...row, url: e.target.value })}
              placeholder="https:// (optional)"
              className={inputCls}
            />
          </>
        )}
      />

      <ListSection
        title="Memberships"
        addLabel="Add membership"
        rows={value.memberships}
        onRows={(memberships) => set({ memberships })}
        makeRow={() => ({ name: "", parentOrganization: "" })}
        renderRow={(row, update) => (
          <>
            <Input
              value={row.name}
              onChange={(e) => update({ ...row, name: e.target.value })}
              placeholder="e.g. Canadian Youth Road Safety Council"
              className={inputCls}
            />
            <Input
              value={row.parentOrganization}
              onChange={(e) => update({ ...row, parentOrganization: e.target.value })}
              placeholder="Parent organization (optional)"
              className={inputCls}
            />
          </>
        )}
      />

      <ListSection
        title="Reference links (shown publicly)"
        addLabel="Add link"
        rows={value.profileLinks}
        onRows={(profileLinks) => set({ profileLinks })}
        makeRow={() => ({ label: "", url: "" })}
        renderRow={(row, update) => (
          <>
            <Input
              value={row.label}
              onChange={(e) => update({ ...row, label: e.target.value })}
              placeholder="Label, e.g. TownZest"
              className={inputCls}
            />
            <Input
              value={row.url}
              onChange={(e) => update({ ...row, url: e.target.value })}
              placeholder="https://..."
              className={inputCls}
            />
          </>
        )}
      />
    </div>
  );
}

function ListSection<T>({
  title,
  addLabel,
  rows,
  onRows,
  makeRow,
  renderRow,
}: {
  title: string;
  addLabel: string;
  rows: T[];
  onRows: (rows: T[]) => void;
  makeRow: () => T;
  renderRow: (row: T, update: (row: T) => void) => React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{title}</Label>
      {rows.map((row, i) => (
        <div key={i} className="flex gap-2 items-center">
          <div className="grid grid-cols-2 gap-2 flex-1">
            {renderRow(row, (next) => onRows(rows.map((r, j) => (j === i ? next : r))))}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onRows(rows.filter((_, j) => j !== i))}
            className="text-zinc-500 hover:text-red-400 shrink-0"
            aria-label={`Remove ${title.toLowerCase()} row`}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onRows([...rows, makeRow()])}
        className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 gap-1"
      >
        <Plus className="w-3 h-3" /> {addLabel}
      </Button>
    </div>
  );
}
