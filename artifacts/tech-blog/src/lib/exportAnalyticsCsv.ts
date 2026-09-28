/**
 * Client-side CSV export for the admin analytics dashboard.
 * Assembles a multi-section CSV and triggers a browser download named
 * `mapletechie-analytics-<range>-<YYYY-MM-DD>.csv`.
 */

export interface AnalyticsCsvData {
  daily: { day: string; views: number }[];
  topPosts: { title: string; slug: string; views: number }[];
  topSources: { label: string; value: number }[];
  topCountries: { code: string; label: string; value: number }[];
  searchQueries: { query: string; count: number }[];
}

/**
 * Escape a CSV cell. Besides RFC-4180 quoting, values starting with `=`,
 * `+`, `-`, `@`, tab, or CR are prefixed with an apostrophe so spreadsheet
 * apps (Excel, Google Sheets) never evaluate them as formulas — search
 * queries are reader-controlled and titles are editor-controlled.
 */
function esc(v: string | number | null | undefined): string {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildAnalyticsCsv(data: AnalyticsCsvData, range: string): string {
  const lines: string[] = [];
  lines.push(`MapleTechie analytics export,${esc(`range: ${range}`)}`);
  lines.push("");

  lines.push("Daily summary");
  lines.push("Date,Views");
  for (const d of data.daily) lines.push(`${esc(d.day)},${d.views}`);
  lines.push("");

  lines.push("Top posts");
  lines.push("Title,Slug,Views");
  for (const p of data.topPosts) lines.push(`${esc(p.title)},${esc(p.slug)},${p.views}`);
  lines.push("");

  lines.push("Top traffic sources");
  lines.push("Source,Views");
  for (const s of data.topSources) lines.push(`${esc(s.label)},${s.value}`);
  lines.push("");

  lines.push("Top countries");
  lines.push("Code,Country,Views");
  for (const c of data.topCountries) lines.push(`${esc(c.code)},${esc(c.label)},${c.value}`);
  lines.push("");

  lines.push("Search queries");
  lines.push("Query,Count");
  for (const q of data.searchQueries) lines.push(`${esc(q.query)},${q.count}`);

  return lines.join("\r\n");
}

export function exportAnalyticsCsv(data: AnalyticsCsvData, range: string): void {
  const csv = buildAnalyticsCsv(data, range);
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mapletechie-analytics-${range}-${date}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
