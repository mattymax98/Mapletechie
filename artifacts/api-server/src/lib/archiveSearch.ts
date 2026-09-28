import { and, asc, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { db, postsTable, categoriesTable, postCategoriesTable, topicClustersTable } from "@workspace/db";
import { canonicalPostAuthor } from "./postAuthor";
import { getSiteUrl } from "./siteUrl";

export const ARCHIVE_POST_STATUSES = ["draft", "scheduled", "published"] as const;
export type ArchivePostStatus = (typeof ARCHIVE_POST_STATUSES)[number];

/**
 * dateFrom/dateTo are inclusive UTC calendar days over posts.createdAt,
 * regardless of status. publishedFrom/publishedTo independently filter
 * posts.publishedAt; rows with no publication timestamp do not match.
 */
export type ArchiveSearchParams = {
  q?: string;
  title?: string;
  slug?: string;
  body?: string;
  tag?: string;
  category?: string;
  cluster?: string;
  author?: string;
  status?: ArchivePostStatus;
  dateFrom?: string;
  dateTo?: string;
  publishedFrom?: string;
  publishedTo?: string;
  page: number;
  limit: number;
};

export type ArchiveCategory = {
  id: number;
  name: string;
  slug: string;
  isPrimary: boolean;
};

export type ArchiveSearchItem = {
  id: number;
  title: string;
  slug: string;
  status: string;
  excerpt: string;
  tags: string[];
  categoryId: number;
  author: string;
  authorId: number | null;
  clusterId: number | null;
  clusterRole: string | null;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
  scheduledFor: Date | null;
  categories: ArchiveCategory[];
  canonical_url?: string;
};

export type ArchiveSearchResponse = {
  items: ArchiveSearchItem[];
  page: number;
  limit: number;
  total: number;
};

export type ArchiveSearchParamsResult =
  | { success: true; data: ArchiveSearchParams }
  | { success: false; error: string };

/** Parse and validate request query data before it reaches the DB helper. */
export function parseArchiveSearchParams(input: unknown): ArchiveSearchParamsResult {
  if (!input || typeof input !== "object") {
    return { success: false, error: "Invalid archive search parameters." };
  }
  const query = input as Record<string, unknown>;
  const filterNames = ["q", "title", "slug", "body", "tag", "category", "cluster", "author", "status", "dateFrom", "dateTo", "publishedFrom", "publishedTo"] as const;
  const params: Record<string, string> = {};
  for (const key of filterNames) {
    const value = query[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || value.trim().length > 200) {
      return { success: false, error: `Invalid ${key} filter.` };
    }
    params[key] = value.trim();
  }

  const parsePositiveInteger = (value: unknown, fallback: number): number | null => {
    if (value === undefined) return fallback;
    if (typeof value !== "string" && typeof value !== "number") return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  };
  const page = parsePositiveInteger(query.page, 1);
  const limit = parsePositiveInteger(query.limit, 20);
  if (page === null || page > 100_000 || limit === null || limit > 100) {
    return { success: false, error: "page must be 1–100000 and limit must be 1–100." };
  }

  if (params.status && !ARCHIVE_POST_STATUSES.includes(params.status as ArchivePostStatus)) {
    return { success: false, error: "status must be draft, scheduled, or published." };
  }
  const parseDay = (value: string | undefined): Date | null | false => {
    if (!value) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : false;
  };
  const dateFrom = parseDay(params.dateFrom);
  const dateTo = parseDay(params.dateTo);
  if (dateFrom === false || dateTo === false || (dateFrom && dateTo && dateFrom > dateTo)) {
    return { success: false, error: "dateFrom and dateTo must be valid dates in YYYY-MM-DD format." };
  }
  const publishedFrom = parseDay(params.publishedFrom);
  const publishedTo = parseDay(params.publishedTo);
  if (publishedFrom === false || publishedTo === false || (publishedFrom && publishedTo && publishedFrom > publishedTo)) {
    return { success: false, error: "publishedFrom and publishedTo must be valid dates in YYYY-MM-DD format." };
  }
  return {
    success: true,
    data: {
      ...params,
      status: params.status as ArchivePostStatus | undefined,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      publishedFrom: params.publishedFrom,
      publishedTo: params.publishedTo,
      page,
      limit,
    },
  };
}

const escapeLike = (value: string) => `%${value.replace(/[%_]/g, (character) => `\\${character}`)}%`;

function categoryMatch(pattern: string): SQL {
  return sql`(
    exists (
      select 1 from ${postCategoriesTable} pc
      inner join ${categoriesTable} c on c.id = pc.category_id
      where pc.post_id = ${postsTable.id}
        and (c.name ilike ${pattern} or c.slug ilike ${pattern})
    )
    or exists (
      select 1 from ${categoriesTable} c
      where c.id = ${postsTable.categoryId}
        and (c.name ilike ${pattern} or c.slug ilike ${pattern})
    )
  )`;
}

function clusterMatch(value: string): SQL {
  const pattern = escapeLike(value);
  const clusterId = /^\d+$/.test(value) ? Number(value) : null;
  return sql`exists (
    select 1 from ${topicClustersTable} tc
    where tc.id = ${postsTable.clusterId}
      and (tc.name ilike ${pattern} or tc.slug ilike ${pattern}
        ${clusterId === null ? sql`` : sql`or tc.id = ${clusterId}`})
  )`;
}

/** The session route supplies an ownership scope; the separately authenticated connector may request all posts. */
export type ArchiveSearchScope = { all: true } | { authorId: number };

export async function searchArchivePosts(params: ArchiveSearchParams, scope: ArchiveSearchScope): Promise<ArchiveSearchResponse> {
  const conditions: SQL[] = [];
  if ("authorId" in scope) conditions.push(eq(postsTable.authorId, scope.authorId));
  if (params.status) conditions.push(eq(postsTable.status, params.status));
  // Draft rows receive a default published_at at creation in the current
  // schema, but that timestamp is not evidence they were ever published.
  if (params.publishedFrom || params.publishedTo) conditions.push(sql`${postsTable.status} <> 'draft'`);
  if (params.dateFrom) conditions.push(gte(postsTable.createdAt, new Date(`${params.dateFrom}T00:00:00.000Z`)));
  if (params.dateTo) {
    const exclusiveEnd = new Date(`${params.dateTo}T00:00:00.000Z`);
    exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
    conditions.push(lt(postsTable.createdAt, exclusiveEnd));
  }
  if (params.publishedFrom) conditions.push(gte(postsTable.publishedAt, new Date(`${params.publishedFrom}T00:00:00.000Z`)));
  if (params.publishedTo) {
    const exclusiveEnd = new Date(`${params.publishedTo}T00:00:00.000Z`);
    exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
    conditions.push(lt(postsTable.publishedAt, exclusiveEnd));
  }
  if (params.q) {
    const pattern = escapeLike(params.q);
    conditions.push(or(
      ilike(postsTable.title, pattern),
      ilike(postsTable.slug, pattern),
      ilike(postsTable.excerpt, pattern),
      ilike(postsTable.content, pattern),
      ilike(canonicalPostAuthor, pattern),
      sql`exists (select 1 from unnest(${postsTable.tags}) as tag where tag ilike ${pattern})`,
      categoryMatch(pattern),
      clusterMatch(params.q),
    )!);
  }
  for (const [filter, column] of [
    [params.title, postsTable.title],
    [params.slug, postsTable.slug],
    [params.body, postsTable.content],
    [params.author, canonicalPostAuthor],
  ] as const) {
    if (filter) conditions.push(ilike(column, escapeLike(filter)));
  }
  if (params.tag) {
    const pattern = escapeLike(params.tag);
    conditions.push(sql`exists (select 1 from unnest(${postsTable.tags}) as tag where tag ilike ${pattern})`);
  }
  if (params.category) conditions.push(categoryMatch(escapeLike(params.category)));
  if (params.cluster) conditions.push(clusterMatch(params.cluster));

  const where = and(...conditions);
  const [countRow] = await db.select({ total: sql<number>`count(*)::int` })
    .from(postsTable)
    .where(where);
  const rows = await db.select({
    id: postsTable.id,
    title: postsTable.title,
    slug: postsTable.slug,
    status: postsTable.status,
    excerpt: postsTable.excerpt,
    tags: postsTable.tags,
    categoryId: postsTable.categoryId,
    author: canonicalPostAuthor,
    authorId: postsTable.authorId,
    clusterId: postsTable.clusterId,
    clusterRole: postsTable.clusterRole,
    createdAt: postsTable.createdAt,
    updatedAt: postsTable.updatedAt,
    publishedAt: postsTable.publishedAt,
    scheduledFor: postsTable.scheduledFor,
    primaryCategoryName: categoriesTable.name,
    primaryCategorySlug: categoriesTable.slug,
  }).from(postsTable)
    .leftJoin(categoriesTable, eq(postsTable.categoryId, categoriesTable.id))
    .where(where)
    .orderBy(desc(postsTable.createdAt), desc(postsTable.id))
    .limit(params.limit)
    .offset((params.page - 1) * params.limit);

  const categoryRows = rows.length ? await db.select({
    postId: postCategoriesTable.postId,
    isPrimary: postCategoriesTable.isPrimary,
    id: categoriesTable.id,
    name: categoriesTable.name,
    slug: categoriesTable.slug,
  }).from(postCategoriesTable)
    .innerJoin(categoriesTable, eq(postCategoriesTable.categoryId, categoriesTable.id))
    .where(inArray(postCategoriesTable.postId, rows.map((row) => row.id)))
    .orderBy(desc(postCategoriesTable.isPrimary), asc(categoriesTable.name)) : [];
  const categoryMap = new Map<number, ArchiveCategory[]>();
  for (const row of categoryRows) {
    const categories = categoryMap.get(row.postId) ?? [];
    categories.push({ id: row.id, name: row.name, slug: row.slug, isPrimary: row.isPrimary });
    categoryMap.set(row.postId, categories);
  }

  const siteUrl = getSiteUrl();
  const items = rows.map((row) => {
    const memberships = categoryMap.get(row.id);
    const categories = memberships?.length ? memberships : row.categoryId != null && row.primaryCategoryName && row.primaryCategorySlug
      ? [{ id: row.categoryId, name: row.primaryCategoryName, slug: row.primaryCategorySlug, isPrimary: true }]
      : [];
    const { primaryCategoryName: _primaryCategoryName, primaryCategorySlug: _primaryCategorySlug, ...item } = row;
    return {
      ...item,
      categories,
      ...(row.status === "published" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug)
        ? { canonical_url: `${siteUrl}/blog/${row.slug}` }
        : {}),
    };
  });
  return { items, page: params.page, limit: params.limit, total: Number(countRow?.total ?? 0) };
}