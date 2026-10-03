import express, { Router, type Request, type Response, type NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { db, auditLogsTable, categoriesTable, postsTable, topicsTable } from "@workspace/db";
import { and, asc, desc, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { writeAuditLogForUser } from "../lib/audit";
import { persistImageBuffer } from "../lib/persistExternalImage";
import { logger } from "../lib/logger";
import {
  backfillAutomationPostImages,
  createAutomationDraft,
  getMapletechiePost,
  issuePostPreviewToken,
  previewSiteUrl,
} from "./automation";
import {
  DAILY_EDITORIAL_AUTOMATION_CONTRACT,
  DAILY_EDITORIAL_AUTOMATION_INSTRUCTIONS,
  DAILY_EDITORIAL_AUTOMATION_SCHEDULE,
} from "../lib/editorialAutomationContract";
import { parseArchiveSearchParams, searchArchivePosts } from "../lib/archiveSearch";
import { proposePostRevision } from "./postRevisions";

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
  content: z.string().min(1).describe(
    'Sanitized TipTap-compatible HTML body. Social embeds MUST be canonical top-level divs: <div class="social-embed" data-social-embed="" data-provider="youtube|twitter|reddit" data-url="SAFE_POST_URL"><a href="SAFE_POST_URL">Source</a></div>. Public Reddit /r/<sub>/comments/<post-id>/[title/[comment-id]/] links become controlled source cards, not verified reporting. X/Twitter statuses and YouTube videos remain supported. Never submit scripts, arbitrary iframes or other provider HTML. Check the stored and returned embed_report (requested, preserved, removed, warnings, items) before considering draft QA complete; removed/duplicate/hostile entries did not embed. Every img needs a supported URL and meaningful alt text.',
  ),
  excerpt: z.string().optional().describe("Short summary shown in lists"),
  cover_image: z.string().optional().describe("Cover image URL (external URLs are re-hosted)"),
  cover_image_alt: z
    .string()
    .optional()
    .describe("Required when cover_image is provided: meaningful accessibility description of the cover"),
  og_image: z.string().optional().describe("Social share image URL"),
  tags: z.array(z.string().trim().min(1).max(80)).max(5).optional().describe("2–5 durable reader-facing tags. Reuse exact established tags from list_mapletechie_tags when relevant; do not use tags as free-form SEO keywords."),
  read_time: z.number().optional().describe("Estimated read time in minutes"),
  category_id: z
    .union([z.number(), z.string()])
    .optional()
    .describe("Single category id (or exact name/slug). Prefer `categories` to assign more than one."),
  categories: z
    .array(z.union([z.number(), z.string()]))
    .optional()
    .describe(
      "All categories for the post (ids, names, or slugs). The first entry is the primary category unless primary_category says otherwise. Provide this OR category_id.",
    ),
  primary_category: z
    .union([z.number(), z.string()])
    .optional()
    .describe("Which of `categories` is the primary one (drives breadcrumbs/SEO). Defaults to the first entry."),
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
  author_avatar: z.unknown().optional().describe("FORBIDDEN — server-controlled"),
  published_at: z.unknown().optional().describe("FORBIDDEN — server-controlled"),
  scheduled_for: z.unknown().optional().describe("FORBIDDEN — server-controlled"),
  is_featured: z.unknown().optional().describe("FORBIDDEN — server-controlled"),
  series_id: z.number().optional().describe("Optional: id of an existing series to place the draft in"),
  series_position: z.number().optional().describe("Optional: position within the series (requires series_id)"),
  cluster_id: z.number().int().positive().optional().describe("Optional existing topic-cluster ID"),
  cluster_role: z.enum(["pillar", "supporting"]).optional().describe("Optional role of this draft in its topic cluster; requires cluster_id"),
} as const;

function buildMcpServer(req: Request): McpServer {
  const server = new McpServer({ name: "mapletechie-drafts", version: "1.0.0" });

  server.registerTool(
    "search_mapletechie_archive",
    {
      title: "Search the Mapletechie article archive",
      description:
        "Read-only search across all existing posts, including drafts, scheduled posts, and published posts. Supports full-text q plus title, slug, body, tag, category, cluster, author, status, and independent inclusive UTC created-date (dateFrom/dateTo) and publication-date (publishedFrom/publishedTo) filters. Results use the editor archive-search contract: {items, page, limit, total}.",
      inputSchema: z.object({
        q: z.string().trim().max(200).optional().describe("Search title, slug, excerpt, body, author, tag, category, or cluster"),
        title: z.string().trim().max(200).optional(),
        slug: z.string().trim().max(200).optional(),
        body: z.string().trim().max(200).optional(),
        tag: z.string().trim().max(200).optional(),
        category: z.string().trim().max(200).optional(),
        cluster: z.string().trim().max(200).optional(),
        status: z.enum(["draft", "scheduled", "published"]).optional(),
        dateFrom: z.string().trim().max(200).optional().describe("Inclusive UTC creation date, YYYY-MM-DD"),
        dateTo: z.string().trim().max(200).optional().describe("Inclusive UTC creation date, YYYY-MM-DD"),
        publishedFrom: z.string().trim().max(200).optional().describe("Inclusive UTC original publication date, YYYY-MM-DD; independent of creation date"),
        publishedTo: z.string().trim().max(200).optional().describe("Inclusive UTC original publication date, YYYY-MM-DD; independent of creation date"),
        author: z.string().trim().max(200).optional(),
        page: z.number().int().min(1).max(100000).default(1),
        limit: z.number().int().min(1).max(100).default(20),
      }).strict(),
    },
    async (args) => {
      const parsed = parseArchiveSearchParams(args);
      if (!parsed.success) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: parsed.error }) }],
          isError: true,
        };
      }
      const results = await searchArchivePosts(parsed.data, { all: true });
      return {
        content: [{
          type: "text",
          text: JSON.stringify(results, null, 2),
        }],
      };
    },
  );

  server.registerTool(
    "list_mapletechie_topic_clusters",
    {
      title: "List Mapletechie topic clusters",
      description: "Read-only list of all configured topic clusters. Use a returned id with get_mapletechie_topic_cluster for its full details and assigned posts.",
      inputSchema: {},
    },
    async () => {
      const clusters = await db.select({ ...getTableColumns(topicsTable) })
        .from(topicsTable)
        .orderBy(asc(topicsTable.name));
      return {
        content: [{ type: "text", text: JSON.stringify(clusters, null, 2) }],
      };
    },
  );

  server.registerTool(
    "get_mapletechie_topic_cluster",
    {
      title: "Get a Mapletechie topic cluster",
      description: "Read-only details for one topic cluster, including its currently assigned posts and each post's cluster role.",
      inputSchema: z.object({ cluster_id: z.number().int().positive() }).strict(),
    },
    async (args) => {
      const { cluster_id } = args as { cluster_id: number };
      const [cluster] = await db
        .select({ ...getTableColumns(topicsTable) })
        .from(topicsTable)
        .where(eq(topicsTable.id, cluster_id));
      if (!cluster) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "Topic cluster not found" }) }],
          isError: true,
        };
      }
      const posts = await db
        .select({
          id: postsTable.id,
          title: postsTable.title,
          slug: postsTable.slug,
          excerpt: postsTable.excerpt,
          status: postsTable.status,
          cluster_role: postsTable.clusterRole,
          created_at: postsTable.createdAt,
          published_at: postsTable.publishedAt,
        })
        .from(postsTable)
        .where(eq(postsTable.clusterId, cluster_id))
        .orderBy(desc(postsTable.createdAt));
      return {
        content: [{ type: "text", text: JSON.stringify({ ...cluster, posts }, null, 2) }],
      };
    },
  );

  server.registerTool(
    "create_mapletechie_topic_cluster",
    {
      title: "Create a private Mapletechie topic cluster",
      description:
        "Create a private topic cluster for organizing existing coverage. MCP-created clusters are always private; public visibility can only be enabled by an authorized human in the admin interface. Inspect the full archive and existing clusters before proposing a meaningful, non-duplicative cluster.",
      inputSchema: z.object({
        name: z.string().trim().min(1).max(160),
        slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a stable lowercase hyphenated slug"),
        introduction: z.string().trim().max(3000).default(""),
      }).strict(),
    },
    async (args) => {
      const input = args as { name: string; slug: string; introduction: string };
      try {
        const cluster = await db.transaction(async (tx) => {
          const [created] = await tx.insert(topicsTable)
            .values({
              name: input.name.trim(),
              slug: input.slug,
              introduction: input.introduction.trim(),
              isPublic: false,
            })
            .returning();
          if (!created) throw new Error("Topic cluster creation returned no row");
          const occurredAt = new Date().toISOString();
          await tx.insert(auditLogsTable).values(mcpAuditLogValues(req, {
            action: "mcp.topic_cluster.created",
            entityType: "topic_cluster",
            entityId: created.id,
            summary: `MCP created private topic cluster "${created.name}"`,
            details: {
              source: "mcp",
              occurredAt,
              before: null,
              after: { id: created.id, name: created.name, slug: created.slug, introduction: created.introduction, isPublic: false },
            },
          }));
          return created;
        });
        if (!cluster) throw new Error("Topic cluster creation returned no row");
        return { content: [{ type: "text", text: JSON.stringify(cluster, null, 2) }] };
      } catch (error) {
        if (isUniqueConstraintViolation(error)) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: "A topic cluster with this slug already exists." }) }],
            isError: true,
          };
        }
        throw error;
      }
    },
  );

  server.registerTool(
    "manage_mapletechie_post_cluster",
    {
      title: "Manage an existing post's private topic-cluster membership",
      description:
        "Assign, move, remove, or change the pillar/supporting role of an existing draft, scheduled, or published post, but only while both its current cluster and destination cluster are private. To remove membership, pass cluster_id=null and omit cluster_role. Public-cluster membership changes require an authorized human in the admin interface. This changes cluster metadata only; it does not edit article content or publication identity.",
      inputSchema: z.object({
        post_id: z.number().int().positive(),
        cluster_id: z.number().int().positive().nullable(),
        cluster_role: z.enum(["pillar", "supporting"]).nullable().optional(),
      }).strict(),
    },
    async (args) => {
      const input = args as {
        post_id: number;
        cluster_id: number | null;
        cluster_role?: "pillar" | "supporting" | null;
      };
      if (input.cluster_id === null ? input.cluster_role != null
        : input.cluster_role !== "pillar" && input.cluster_role !== "supporting") {
        return {
          content: [{ type: "text", text: JSON.stringify({
            error: "cluster_role is required for a cluster and must be omitted when removing membership",
          }) }],
          isError: true,
        };
      }
      try {
        const change = await db.transaction(async (tx) => {
          const [post] = await tx.select({
            id: postsTable.id,
            title: postsTable.title,
            slug: postsTable.slug,
            status: postsTable.status,
            clusterId: postsTable.clusterId,
            clusterRole: postsTable.clusterRole,
          }).from(postsTable).where(eq(postsTable.id, input.post_id)).for("update");
          if (!post) return { error: "Post not found." as const };

          const clusterIds = [...new Set([
            ...(post.clusterId == null ? [] : [post.clusterId]),
            ...(input.cluster_id == null ? [] : [input.cluster_id]),
          ])].sort((a, b) => a - b);
          const clusters = clusterIds.length
            ? await tx.select({
                id: topicsTable.id,
                name: topicsTable.name,
                slug: topicsTable.slug,
                isPublic: topicsTable.isPublic,
              }).from(topicsTable)
                .where(inArray(topicsTable.id, clusterIds))
                .orderBy(asc(topicsTable.id))
                .for("update")
            : [];
          if (clusters.length !== clusterIds.length) return { error: "Destination topic cluster not found." as const };

          const sourceCluster = post.clusterId == null
            ? null
            : clusters.find((cluster) => cluster.id === post.clusterId) ?? null;
          const destinationCluster = input.cluster_id == null
            ? null
            : clusters.find((cluster) => cluster.id === input.cluster_id) ?? null;
          const nextRole = input.cluster_id == null ? null : input.cluster_role!;
          if (post.clusterId === input.cluster_id && post.clusterRole === nextRole) {
            return { post, unchanged: true as const };
          }
          if (sourceCluster?.isPublic) {
            return { error: "Posts assigned to a public topic cluster can only be changed by an authorized human in the admin interface." as const };
          }
          if (destinationCluster?.isPublic) {
            return { error: "MCP can only assign posts to private topic clusters; public-cluster membership requires an authorized human." as const };
          }

          if (input.cluster_id != null && nextRole === "pillar") {
            const [existingPillar] = await tx.select({ id: postsTable.id })
              .from(postsTable)
              .where(and(
                eq(postsTable.clusterId, input.cluster_id),
                eq(postsTable.clusterRole, "pillar"),
              ));
            if (existingPillar && existingPillar.id !== post.id) {
              return { error: `Topic cluster ${input.cluster_id} already has a pillar post.` as const };
            }
          }

          const [updated] = await tx.update(postsTable)
            .set({ clusterId: input.cluster_id, clusterRole: nextRole })
            .where(eq(postsTable.id, input.post_id))
            .returning({
              id: postsTable.id,
              title: postsTable.title,
              slug: postsTable.slug,
              status: postsTable.status,
              clusterId: postsTable.clusterId,
              clusterRole: postsTable.clusterRole,
            });
          if (!updated) return { error: "Post could not be updated." as const };
          const before = { clusterId: post.clusterId, clusterRole: post.clusterRole };
          const after = { clusterId: updated.clusterId, clusterRole: updated.clusterRole };
          const occurredAt = new Date().toISOString();
          await tx.insert(auditLogsTable).values(mcpAuditLogValues(req, {
            action: "mcp.topic_cluster.membership.updated",
            entityType: "post",
            entityId: updated.id,
            summary: `MCP updated topic-cluster membership for post ${updated.id}`,
            details: {
              source: "mcp",
              occurredAt,
              post: { id: updated.id, title: updated.title, slug: updated.slug },
              before,
              after,
            },
          }));
          return {
            post: updated,
            before,
            after,
          };
        });

        if ("error" in change) {
          return { content: [{ type: "text", text: JSON.stringify({ error: change.error }) }], isError: true };
        }
        return { content: [{ type: "text", text: JSON.stringify(change.post, null, 2) }] };
      } catch (error) {
        if (isUniqueConstraintViolation(error)) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: "That topic cluster already has a pillar post." }) }],
            isError: true,
          };
        }
        throw error;
      }
    },
  );

  server.registerTool(
    "get_mapletechie_editorial_contract",
    {
      title: "Get Mapletechie editorial automation contract",
      description:
        "Read-only source of truth for the daily Mapletechie editorial run: schedule, review-only authority, discovery workflow, five-draft minimum success floor, editorial mix, Canadian relevance, research, SEO, image rights, QA, failure handling, and completion reporting.",
      inputSchema: {},
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(DAILY_EDITORIAL_AUTOMATION_CONTRACT, null, 2),
        },
      ],
    }),
  );

  server.registerTool(
    "list_mapletechie_tags",
    {
      title: "List Mapletechie tag taxonomy",
      description:
        "Read-only tag-taxonomy helper for the Daily Desk. Returns established tag spellings with normalized form and published/pipeline/total article counts so the automation can reuse durable tags instead of creating thin near-duplicates. Use q to narrow by entity or concept. This is navigation taxonomy, not SEO keyword research.",
      inputSchema: z.object({
        q: z.string().trim().max(100).optional().describe("Optional case-insensitive substring filter for an entity or concept"),
        min_published: z.number().int().min(0).max(100000).default(0).describe("Minimum number of published articles using the tag"),
        limit: z.number().int().min(1).max(500).default(200).describe("Maximum tags to return"),
      }).strict(),
    },
    async (args) => {
      const { q, min_published, limit } = args as {
        q?: string;
        min_published: number;
        limit: number;
      };
      const result = await db.execute(sql`
        WITH expanded AS (
          SELECT
            ${postsTable.id} AS post_id,
            ${postsTable.status} AS post_status,
            tag,
            lower(tag) AS normalized_tag
          FROM ${postsTable}, unnest(${postsTable.tags}) AS tag
          WHERE btrim(tag) <> ''
        ),
        variant_counts AS (
          SELECT
            normalized_tag,
            tag,
            COUNT(DISTINCT post_id) FILTER (WHERE post_status = 'published')::int AS published_count,
            COUNT(DISTINCT post_id)::int AS total_count
          FROM expanded
          GROUP BY normalized_tag, tag
        ),
        ranked_variants AS (
          SELECT
            normalized_tag,
            tag,
            ROW_NUMBER() OVER (
              PARTITION BY normalized_tag
              ORDER BY published_count DESC, total_count DESC, length(tag), tag
            ) AS variant_rank
          FROM variant_counts
        ),
        totals AS (
          SELECT
            normalized_tag,
            COUNT(DISTINCT post_id) FILTER (WHERE post_status = 'published')::int AS published_count,
            COUNT(DISTINCT post_id) FILTER (WHERE post_status IN ('draft', 'scheduled'))::int AS pipeline_count,
            COUNT(DISTINCT post_id)::int AS total_count
          FROM expanded
          GROUP BY normalized_tag
        )
        SELECT
          ranked_variants.tag,
          totals.normalized_tag,
          totals.published_count,
          totals.pipeline_count,
          totals.total_count
        FROM totals
        JOIN ranked_variants USING (normalized_tag)
        WHERE ranked_variants.variant_rank = 1
        ORDER BY totals.published_count DESC, totals.total_count DESC, totals.normalized_tag
      `);
      const needle = q?.toLowerCase();
      const rows = ((result as any).rows ?? result) as Array<{
        tag: string;
        normalized_tag: string;
        published_count: number | string;
        pipeline_count: number | string;
        total_count: number | string;
      }>;
      const filtered = rows
        .filter((row) => Number(row.published_count) >= min_published)
        .filter((row) => !needle || row.normalized_tag.includes(needle))
        .slice(0, limit)
        .map((row) => ({
          tag: row.tag,
          normalized_tag: row.normalized_tag,
          published_count: Number(row.published_count),
          pipeline_count: Number(row.pipeline_count),
          total_count: Number(row.total_count),
          sitemap_eligible_now: Number(row.published_count) >= 3,
        }));
      return { content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }] };
    },
  );

  server.registerTool(
    "list_mapletechie_categories",
    {
      title: "List Mapletechie categories",
      description:
        "Read-only category helper for the canonical daily editorial workflow. Returns the blog's live category list (id, name, slug) for use with create_mapletechie_draft. Also inspect list_mapletechie_tags before drafting.",
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
    "list_mapletechie_posts",
    {
      title: "List Mapletechie posts",
      description:
        "Read-only second step of the canonical daily editorial workflow. Returns recent Mapletechie posts for search-intent, duplicate, cannibalization, visual-duplication, and tag-taxonomy checks. Optionally filter by status (draft, scheduled, or published). Returns id, title, slug, status, tags, cover_image, and cover_image_alt, newest first.",
      inputSchema: z
        .object({
          status: z
            .enum(["draft", "scheduled", "published"])
            .optional()
            .describe("Only return posts with this status"),
          limit: z
            .number()
            .int()
            .min(1)
            .max(100)
            .default(20)
            .describe("Maximum number of posts to return (1–100; default 20)"),
        })
        .strict(),
    },
    async (args) => {
      const { status, limit } = args as {
        status?: "draft" | "scheduled" | "published";
        limit: number;
      };
      const posts = await db
        .select({
          id: postsTable.id,
          title: postsTable.title,
          slug: postsTable.slug,
          status: postsTable.status,
          tags: postsTable.tags,
          cover_image: postsTable.coverImage,
          cover_image_alt: postsTable.coverImageAlt,
        })
        .from(postsTable)
        .where(status ? eq(postsTable.status, status) : undefined)
        .orderBy(desc(postsTable.createdAt))
        .limit(limit);
      return { content: [{ type: "text", text: JSON.stringify(posts, null, 2) }] };
    },
  );

  server.registerTool(
    "get_mapletechie_post",
    {
      title: "Get a complete Mapletechie post",
      description: "Return the canonical current state of exactly one post. The payload includes id, title, slug, excerpt, final stored HTML, status, all categories with is_primary, tags, cover image and alt text, OG image, SEO title/description/keywords, read time, authorship, review fields, and created/updated timestamps. Use exactly one of post_id or slug.",
      inputSchema: z.object({
        post_id: z.number().int().positive().optional(),
        slug: z.string().min(1).optional(),
      }).strict().refine((v) => (v.post_id != null) !== (v.slug != null), "Provide exactly one of post_id or slug"),
    },
    async (args: { post_id?: number; slug?: string }) => {
      const input = args as { post_id?: number; slug?: string };
      const post = await getMapletechiePost({ postId: input.post_id, slug: input.slug });
      return post
        ? { content: [{ type: "text", text: JSON.stringify(post, null, 2) }] }
        : { content: [{ type: "text", text: JSON.stringify({ error: "Post not found" }) }], isError: true };
    },
  );

  server.registerTool(
    "propose_mapletechie_revision",
    {
       title: "Propose a published or scheduled correction",
       description: "Review-only: stage text, SEO, or image corrections for a published or scheduled post. Never modifies the post, URL, publication date, scheduling, or author. Use get_mapletechie_post first; upload images to Mapletechie storage before proposing their URLs. A human editor must explicitly approve in the admin editor. Only substantive published title, excerpt, or body revisions establish editorial freshness; for these include a short, plain-text reader-facing update_note for public Update history, not an internal diff. Scheduled and metadata-only corrections do not need a public summary.",
      inputSchema: z.object({
        post_id: z.number().int().positive(),
        changes: z.object({
          title: z.string().min(1).optional(),
          excerpt: z.string().min(1).optional(),
          content: z.string().min(1).optional(),
          seoTitle: z.string().optional(),
          seoDescription: z.string().optional(),
           coverImage: z.string().trim().min(1).optional().describe("Mapletechie-owned upload or /covers/ image URL"),
           coverImageAlt: z.string().trim().min(1).optional().describe("Meaningful cover alt text; required if the replacement cover has no existing alt"),
           ogImage: z.string().trim().min(1).optional().describe("Mapletechie-owned social image URL"),
        }).strict(),
        update_note: z.string().max(1000).optional().describe("For a substantive change to an already-published title, excerpt, or body, required short plain-text reader-facing summary of the meaningful change if approved. Do not include links, markup, internal IDs, workflow notes, or reviewer details. Not required for scheduled, image-only, or SEO-only corrections."),
      }).strict(),
    },
    async (args) => {
      const input = args as { post_id: number; changes: Record<string, unknown>; update_note?: string };
      const result = await proposePostRevision(req, input.post_id, {
        changes: input.changes, updateNote: input.update_note,
      }, "connector");
      return {
        content: [{ type: "text", text: JSON.stringify(result.body, null, 2) }],
        isError: result.status >= 400,
      };
    },
  );

  server.registerTool(
    "preview_mapletechie_post",
    {
      title: "Preview a Mapletechie post",
      description: "Create a signed, post-scoped, short-lived HTTPS preview URL and return its expiry, post identity, and viewport dimensions. The token is never logged or audited.",
      inputSchema: z.object({
        post_id: z.number().int().positive(),
        width: z.number().int().min(320).max(3000).default(1440),
        height: z.number().int().min(240).max(3000).default(900),
      }).strict(),
    },
    async (args) => {
      const { post_id, width, height } = args as { post_id: number; width: number; height: number };
      const post = await getMapletechiePost({ postId: post_id });
      if (!post) return { content: [{ type: "text", text: JSON.stringify({ error: "Post not found" }) }], isError: true };
      const issued = issuePostPreviewToken(post_id, width, height);
      if (!issued) return { content: [{ type: "text", text: JSON.stringify({ error: "Preview service is not configured" }) }], isError: true };
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            url: previewSiteUrl(`/preview/posts/${post_id}#token=${encodeURIComponent(issued.token)}`),
            expires_at: issued.expiresAt.toISOString(),
            post: { id: post.id, slug: post.slug, title: post.title },
            viewport: { width, height },
            recommended_viewports: {
              desktop: { width: 1440, height: 900 },
              mobile: { width: 390, height: 844 },
            },
          }, null, 2),
        }],
      };
    },
  );

  server.registerTool(
    "upload_mapletechie_image",
    {
      title: "Upload Mapletechie image",
       description:
         "Upload an image (base64-encoded, optionally a data: URI) to the blog's own storage. Returns a local URL to use in a draft or a review-only published/scheduled correction proposal (coverImage, ogImage, or inline <img src> in full content HTML). Max ~6MB of image data per upload.",
      inputSchema: {
        image_base64: z
          .string()
          .min(1)
          .describe("Base64-encoded image data (PNG, JPEG, WebP or GIF). A full data: URI is also accepted."),
        filename: z
          .string()
          .optional()
          .describe("Optional descriptive filename for the media library, e.g. 'ai-chips-cover.png'"),
        alt_text: z
          .string()
          .trim()
          .min(1)
          .describe("Meaningful image description for accessibility; also use this exact text in the draft's cover_image_alt or inline img alt attribute"),
      },
    },
    async (args) => {
      const { image_base64, filename, alt_text } = args as {
        image_base64: string;
        filename?: string;
        alt_text: string;
      };
      try {
        // Accept both raw base64 and data: URIs.
        const b64 = image_base64.replace(/^data:[^;]+;base64,/, "").replace(/\s+/g, "");
        if (!/^[A-Za-z0-9+/=_-]+$/.test(b64)) throw new Error("Invalid base64 data");
        const buffer = Buffer.from(b64, "base64");
        const name = (filename || "chatgpt-upload.png").slice(0, 150);
        const url = await persistImageBuffer(buffer, name, {
          uploaderId: null,
          uploaderName: "Mapletechie AI",
          alt: alt_text.trim(),
        });
        void writeAuditLogForUser(req, null, {
          action: "mcp.image.uploaded",
          summary: `MCP connector uploaded image "${name}" -> ${url}`,
        });
        return { content: [{ type: "text", text: JSON.stringify({ url }, null, 2) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        return {
          content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "backfill_mapletechie_images",
    {
      title: "Backfill images on a Mapletechie post",
      description:
        "Update image-related fields on an existing draft only. Published and scheduled posts are never modified, including if status changes while a request is in flight. Target exactly one draft by post_id or slug. Send cover_image to replace the cover, og_image to replace the social-share image, cover_image_alt to set cover alt text, and/or the complete updated TipTap-compatible content HTML to add or repair inline images. External replacements are copied to Mapletechie storage when possible. Every img in supplied content must have meaningful alt text.",
      inputSchema: z.object({
        post_id: z.number().int().positive().optional().describe("Existing post ID; provide this OR slug"),
        slug: z.string().min(1).optional().describe("Existing post slug; provide this OR post_id"),
        cover_image: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe("Replacement cover image URL or supported local image path; external URLs are re-hosted when possible"),
        content: z
          .string()
          .min(1)
          .optional()
          .describe("Complete replacement HTML body with inline images placed where they should appear"),
        cover_image_alt: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe("Meaningful alt text for the post's existing cover image"),
        og_image: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe("Replacement social-share image URL or supported local image path; external URLs are re-hosted when possible"),
      }).strict(),
    },
    async (args) => {
      const body: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
        if (value !== undefined) body[key] = value;
      }
      const result = await backfillAutomationPostImages(req, body);
      return {
        content: [{ type: "text", text: JSON.stringify(result.body, null, 2) }],
        isError: result.status >= 400,
      };
    },
  );

  server.registerTool(
    "create_mapletechie_draft",
    {
      title: "Create Mapletechie draft",
      description:
        `Submit one completed item from the canonical daily editorial workflow as a blog post DRAFT for human review. The run is daily at ${DAILY_EDITORIAL_AUTOMATION_SCHEDULE.executionWindow}; a normal successful run requires at least five strong, non-cannibalizing items; if quality gates prevent five, submit only the passing drafts and report the run short of the minimum, with a flexible maximum and Canadian relevance where supported by evidence. The server forces draft status and the 'Mapletechie AI' byline; it can never publish. Do not send status, author, author_id, author_avatar, published_at, scheduled_for, or is_featured. For every cover or inline image, use a rights-safe source and meaningful alt text; upload images first when possible. A draft can belong to MULTIPLE categories: pass categories (first entry = primary unless primary_category is set), or legacy single category_id. Before choosing tags, inspect list_mapletechie_tags and reuse established durable tags where accurate; tags are navigation taxonomy, not free-form SEO keywords, and automation drafts accept at most five. Optionally provide cluster_id and cluster_role together to assign it to an existing PRIVATE topic cluster (role: pillar or supporting); public cluster membership is human-only. Returns the complete canonical stored post. Next inspect it with get_mapletechie_post, then call preview_mapletechie_post and capture both recommended desktop and mobile views after data-preview-ready is true.`,
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

function isUniqueConstraintViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

function mcpAuditLogValues(
  req: Request,
  input: {
    action: string;
    entityType: string;
    entityId: number;
    summary: string;
    details: Record<string, unknown>;
  },
) {
  const forwardedFor = req.headers["x-forwarded-for"];
  const ip = typeof forwardedFor === "string" && forwardedFor.length > 0
    ? forwardedFor.split(",")[0]!.trim()
    : Array.isArray(forwardedFor) && forwardedFor.length > 0
      ? forwardedFor[0]!.split(",")[0]!.trim()
      : req.ip ?? req.socket?.remoteAddress ?? null;
  return {
    userId: null,
    username: null,
    action: input.action,
    entityType: input.entityType,
    entityId: String(input.entityId),
    summary: input.summary,
    details: input.details,
    ip,
    userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
  };
}

// Body parser mounted AFTER mcpAuth: only key-holders can make the server
// parse a large (base64 image) payload. The global app-level JSON parser
// deliberately skips /api/mcp. 10mb covers a ~6MB image after base64 bloat.
const mcpJson = express.json({ limit: "10mb" });

// Stateless Streamable-HTTP: a fresh server + transport per POST request.
router.post("/mcp", mcpAuth, mcpJson, async (req, res): Promise<void> => {
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
