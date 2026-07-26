import { Router, type Request, type Response, type NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { db, categoriesTable } from "@workspace/db";
import { asc } from "drizzle-orm";
import { writeAuditLogForUser } from "../lib/audit";
import { logger } from "../lib/logger";
import { createAutomationDraft } from "./automation";

/**
 * MCP connector for ChatGPT — exposes the automation draft pipeline as a
 * Model Context Protocol server at /api/mcp (Streamable HTTP, stateless).
 *
 * Security model:
 *  - Its own secret (MCP_CONNECTOR_TOKEN), independent of AUTOMATION_DRAFT_TOKEN,
 *    which never leaves this server.
 *  - ChatGPT's connector UI only supports OAuth or "no authentication" — it
 *    cannot send a custom Authorization header. So the connector key is
 *    accepted EITHER as `Authorization: Bearer <key>` (for standard MCP
 *    clients) OR as a `?key=<key>` query parameter (for ChatGPT, which embeds
 *    it in the connector URL). Both are compared in constant time.
 *  - Fail closed (503) when the secret is not configured; auth failures are
 *    audited just like the raw endpoint.
 *  - All tool calls delegate to the same core logic as /api/automation/*, so
 *    every invariant holds: drafts only, bot authorship, forbidden fields
 *    rejected, idempotency, full audit trail.
 */

const router = Router();

/** Constant-time check of the MCP connector key (header or query param). */
export function mcpAuth(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.MCP_CONNECTOR_TOKEN;
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  if (!secret || secret.length < 20) {
    logger.error("mcp: MCP_CONNECTOR_TOKEN missing or too short — connector disabled");
    void writeAuditLogForUser(req, null, {
      action: "mcp.auth.failed",
      summary: "MCP connector request rejected: MCP_CONNECTOR_TOKEN not configured",
    });
    res.status(503).json({ error: "MCP connector is not configured" });
    return;
  }
  const header = req.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const queryKey = typeof req.query.key === "string" ? req.query.key : "";
  const token = bearer || queryKey;
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  const ok = a.length === b.length && timingSafeEqual(a, b);
  if (!ok) {
    void writeAuditLogForUser(req, null, {
      action: "mcp.auth.failed",
      summary: "MCP connector request rejected: invalid or missing connector key",
    });
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

const DRAFT_INPUT_SHAPE = {
  title: z.string().min(1).describe("Post title"),
  slug: z.string().min(1).describe("URL slug: lowercase letters, digits and hyphens only"),
  content: z.string().min(1).describe("Sanitized HTML body (TipTap-compatible)"),
  excerpt: z.string().optional().describe("Short summary shown in lists"),
  cover_image: z.string().optional().describe("Cover image URL (external URLs are re-hosted)"),
  og_image: z.string().optional().describe("Social share image URL"),
  tags: z.array(z.string()).optional(),
  read_time: z.number().optional().describe("Estimated read time in minutes"),
  category_id: z.union([z.number(), z.string()]).describe("Category id (or exact category name/slug)"),
  seo_title: z.string().optional(),
  seo_description: z.string().optional(),
  seo_keywords: z.array(z.string()).optional(),
  rating: z.number().min(0).max(5).optional().describe("Review rating (reviews only)"),
  pros: z.array(z.string()).optional(),
  cons: z.array(z.string()).optional(),
  verdict: z.string().optional(),
  idempotency_key: z
    .string()
    .optional()
    .describe("Unique key per story; repeating a key returns the original draft instead of a duplicate"),
  // Server-controlled fields, declared so they reach the core validator and
  // fail LOUDLY (422) instead of being silently stripped by schema parsing.
  status: z.unknown().optional().describe("FORBIDDEN — the server always creates drafts"),
  author: z.unknown().optional().describe("FORBIDDEN — server-controlled"),
  author_id: z.unknown().optional().describe("FORBIDDEN — server-controlled"),
  published_at: z.unknown().optional().describe("FORBIDDEN — server-controlled"),
  scheduled_for: z.unknown().optional().describe("FORBIDDEN — server-controlled"),
  is_featured: z.unknown().optional().describe("FORBIDDEN — server-controlled"),
  series_id: z.number().optional().describe("Optional: id of an existing series to place the draft in"),
  series_position: z.number().optional().describe("Optional: position within the series (requires series_id)"),
} as const;

function buildMcpServer(req: Request): McpServer {
  const server = new McpServer({ name: "mapletechie-drafts", version: "1.0.0" });

  server.registerTool(
    "list_mapletechie_categories",
    {
      title: "List Mapletechie categories",
      description:
        "Read-only connectivity test. Returns the blog's live category list (id, name, slug) for use with create_mapletechie_draft.",
      inputSchema: {},
    },
    async () => {
      const categories = await db
        .select({ id: categoriesTable.id, name: categoriesTable.name, slug: categoriesTable.slug })
        .from(categoriesTable)
        .orderBy(asc(categoriesTable.name));
      return { content: [{ type: "text", text: JSON.stringify(categories, null, 2) }] };
    },
  );

  server.registerTool(
    "create_mapletechie_draft",
    {
      title: "Create Mapletechie draft",
      description:
        "Submit a blog post DRAFT for human review. The server forces draft status and the 'Mapletechie AI' byline; it can never publish. Do not send status, author or publish dates. Returns id, status, slug and edit_url.",
      inputSchema: DRAFT_INPUT_SHAPE,
    },
    async (args) => {
      const { idempotency_key, ...rest } = args as Record<string, unknown> & { idempotency_key?: string };
      const idempotencyKey =
        typeof idempotency_key === "string" && idempotency_key.trim()
          ? idempotency_key.trim().slice(0, 200)
          : null;
      // Drop undefined optionals so the core's unknown/forbidden-field checks
      // see exactly what the client actually provided.
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) body[k] = v;
      const result = await createAutomationDraft(req, body, idempotencyKey);
      const ok = result.status < 400;
      return {
        content: [{ type: "text", text: JSON.stringify(result.body, null, 2) }],
        isError: !ok,
      };
    },
  );

  return server;
}

// Stateless Streamable-HTTP: a fresh server + transport per POST request.
router.post("/mcp", mcpAuth, async (req, res): Promise<void> => {
  const server = buildMcpServer(req);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    logger.error({ err }, "mcp: request handling failed");
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

// Stateless mode: no SSE stream, no sessions to delete.
const methodNotAllowed = (_req: Request, res: Response): void => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed" },
    id: null,
  });
};
router.get("/mcp", mcpAuth, methodNotAllowed);
router.delete("/mcp", mcpAuth, methodNotAllowed);

export default router;
