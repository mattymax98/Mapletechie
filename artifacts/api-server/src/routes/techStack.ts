import path from "node:path";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Router } from "express";
import { adminAuth, requireRole } from "../middlewares/adminAuth";

const router = Router();

// ── version resolution ─────────────────────────────────────────────────────
// __dirname is set by the esbuild banner: path.dirname(fileURLToPath(import.meta.url))
// At runtime the bundle lives at artifacts/api-server/dist/index.mjs, so:
//   __dirname  → .../artifacts/api-server/dist/
//   ../        → .../artifacts/api-server/
//   ../../     → .../artifacts/
//   ../../../  → workspace root

// createRequire resolves packages via Node's module resolution starting from
// the dist directory, walking up through api-server/ → artifacts/ → root.
// pnpm hoists all workspace packages to the root node_modules, so React,
// Vite, etc. are all reachable from here even though they're declared only
// in tech-blog's package.json.
declare const __dirname: string;
const _require = createRequire(path.join(__dirname, "index.mjs"));

function installedVer(name: string): string {
  try {
    const p = _require(`${name}/package.json`) as { version?: string };
    return p.version ?? "?";
  } catch {
    return "?";
  }
}

// Parse the pnpm catalog from pnpm-workspace.yaml for packages that show
// "catalog:" in a package.json (e.g. react, vite, tailwindcss).
function readCatalog(): Record<string, string> {
  try {
    const raw = readFileSync(
      path.join(__dirname, "../../../pnpm-workspace.yaml"),
      "utf-8",
    );
    const catalog: Record<string, string> = {};
    let inCatalog = false;
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (trimmed === "catalog:") {
        inCatalog = true;
        continue;
      }
      if (inCatalog) {
        if (/^\s{2,}/.test(line)) {
          const m = line.match(/^\s+['"]?([^'":\s]+)['"]?\s*:\s*(.+)$/);
          if (m) catalog[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, "");
        } else {
          inCatalog = false;
        }
      }
    }
    return catalog;
  } catch {
    return {};
  }
}

const catalog = readCatalog();

/**
 * Return the best available version string for a package:
 * 1. Actual installed version via require (most accurate).
 * 2. Catalog version for packages declared as "catalog:" in package.json.
 * Falls back to "?" if neither is available.
 */
function ver(name: string): string {
  const installed = installedVer(name);
  if (installed !== "?") return installed;
  const catalogVer = catalog[name];
  if (catalogVer) {
    // Strip leading range operators for display (^5.2.1 → 5.2.1)
    return catalogVer.replace(/^[\^~>=]+/, "").split(" ")[0] ?? catalogVer;
  }
  return "?";
}

// ── tech stack definition ──────────────────────────────────────────────────

export interface TechItem {
  name: string;
  version: string;
  description: string;
}

export interface TechCategory {
  id: string;
  name: string;
  items: TechItem[];
}

export interface ScriptEntry {
  label: string;
  command: string;
}

export interface TechStackResponse {
  categories: TechCategory[];
  scripts: ScriptEntry[];
}

// Built once at startup — versions don't change while the server is running.
const techStackResponse: TechStackResponse = {
  categories: [
    {
      id: "frontend",
      name: "Frontend",
      items: [
        { name: "React",           version: ver("react"),                   description: "UI component library" },
        { name: "TypeScript",      version: ver("typescript"),              description: "Typed JavaScript" },
        { name: "Vite",            version: ver("vite"),                    description: "Build tool & dev server" },
        { name: "Tailwind CSS",    version: ver("tailwindcss"),             description: "Utility-first CSS framework" },
        { name: "shadcn/ui",       version: ver("@radix-ui/react-dialog"),  description: "Accessible component system (Radix UI)" },
        { name: "TipTap",          version: ver("@tiptap/core"),            description: "Rich text editor" },
        { name: "TanStack Query",  version: ver("@tanstack/react-query"),   description: "Server state management" },
        { name: "Framer Motion",   version: ver("framer-motion"),           description: "Animation library" },
        { name: "Wouter",          version: ver("wouter"),                  description: "Client-side routing" },
        { name: "Lucide React",    version: ver("lucide-react"),            description: "Icon library" },
        { name: "react-helmet-async", version: ver("react-helmet-async"),  description: "Document head management" },
      ],
    },
    {
      id: "backend",
      name: "Backend",
      items: [
        { name: "Node.js",          version: process.version.replace(/^v/, ""), description: "JavaScript runtime" },
        { name: "Express",          version: ver("express"),               description: "HTTP server framework (v5)" },
        { name: "PostgreSQL",       version: "17",                         description: "Relational database" },
        { name: "Drizzle ORM",      version: ver("drizzle-orm"),           description: "TypeScript-first ORM" },
        { name: "Sharp",            version: ver("sharp"),                  description: "High-performance image processing" },
        { name: "Zod",              version: ver("zod"),                    description: "Schema validation" },
        { name: "bcrypt",           version: ver("bcryptjs"),               description: "Password hashing" },
        { name: "Pino",             version: ver("pino"),                   description: "Structured logging" },
        { name: "sanitize-html",    version: ver("sanitize-html"),          description: "HTML sanitization" },
        { name: "express-rate-limit", version: ver("express-rate-limit"),  description: "API rate limiting" },
      ],
    },
    {
      id: "infrastructure",
      name: "Infrastructure",
      items: [
        { name: "Replit",         version: "Autoscale", description: "Hosting & deployment platform" },
        { name: "Cloudflare",     version: "CDN",       description: "CDN, DNS, and DDoS protection" },
        { name: "Object Storage", version: "R2",        description: "Uploaded images & media" },
        { name: "Resend",         version: "API",       description: "Transactional email delivery" },
        { name: "IndexNow",       version: "1.0",       description: "Instant search engine submission" },
        { name: "pnpm",           version: ver("pnpm"), description: "Fast, disk-efficient package manager" },
      ],
    },
    {
      id: "build",
      name: "Build & Quality",
      items: [
        { name: "esbuild",    version: ver("esbuild"),    description: "API server bundler" },
        { name: "Vitest",     version: ver("vitest"),     description: "Unit test runner" },
        { name: "TypeScript", version: ver("typescript"), description: "Static type checker" },
      ],
    },
  ],
  scripts: [
    { label: "Frontend dev server",  command: "pnpm --filter @workspace/tech-blog run dev" },
    { label: "API server dev",       command: "pnpm --filter @workspace/api-server run dev" },
    { label: "Build frontend",       command: "pnpm --filter @workspace/tech-blog run build" },
    { label: "Build API",            command: "pnpm --filter @workspace/api-server run build" },
    { label: "Run all tests",        command: "pnpm -r run test" },
    { label: "Type-check all",       command: "pnpm -r run typecheck" },
    { label: "Start frontend (prod)", command: "pnpm --filter @workspace/tech-blog run start" },
    { label: "Start API (prod)",      command: "pnpm --filter @workspace/api-server run start" },
  ],
};

// ── route ──────────────────────────────────────────────────────────────────

router.get(
  "/admin/tech-stack",
  adminAuth,
  requireRole("admin"),
  (_req, res) => {
    res.json(techStackResponse);
  },
);

export default router;
