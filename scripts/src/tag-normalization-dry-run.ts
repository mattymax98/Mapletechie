import pg from "pg";
import { requireRailwayUrl } from "./railwayMigrationGuard";
import { canonicalizeTagList, chooseCanonicalTagVariant, normalizeTagText, tagNormalizationKey, tagUrlSegment } from "./tagNormalizationRules";

const { Client } = pg;
type PostRow = { id: number; slug: string; title: string; tags: string[] };
const add = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

async function main() {
  const client = new Client({ connectionString: requireRailwayUrl(process.env) });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const { rows } = await client.query<PostRow>("SELECT id, slug, title, tags FROM posts WHERE status = 'published' ORDER BY id");
    await client.query("COMMIT");

    const groups = new Map<string, Map<string, Set<number>>>();
    const beforeSitemap = new Map<string, number>();
    for (const post of rows) {
      const seenBefore = new Set<string>();
      for (const raw of post.tags ?? []) {
        if (typeof raw !== "string" || !raw.trim()) continue;
        const key = tagNormalizationKey(raw);
        if (!groups.has(key)) groups.set(key, new Map());
        const variants = groups.get(key)!;
        if (!variants.has(raw)) variants.set(raw, new Set());
        variants.get(raw)!.add(post.id);
        seenBefore.add(raw.trim().toLocaleLowerCase("en-CA"));
      }
      for (const key of seenBefore) add(beforeSitemap, key);
    }

    const canonicalByKey = new Map<string, string>();
    const aliasGroups: any[] = [];
    for (const [key, variants] of groups) {
      const list = [...variants].map(([tag, ids]) => ({ tag, publishedCount: ids.size }));
      const canonical = chooseCanonicalTagVariant(list);
      canonicalByKey.set(key, canonical);
      if (list.length > 1 || list.some((v) => normalizeTagText(v.tag) !== v.tag)) {
        aliasGroups.push({ key, canonical, variants: list.sort((a,b) => b.publishedCount-a.publishedCount || a.tag.localeCompare(b.tag)) });
      }
    }

    const afterCounts = new Map<string, number>();
    const affected: any[] = [];
    let duplicatesRemoved = 0;
    for (const post of rows) {
      const before = post.tags ?? [];
      const after = canonicalizeTagList(before, canonicalByKey);
      if (before.length !== after.length || before.some((tag, i) => tag !== after[i])) {
        affected.push({ id: post.id, slug: post.slug, before, after });
        duplicatesRemoved += Math.max(0, before.length - after.length);
      }
      for (const key of new Set(after.map(tagNormalizationKey))) add(afterCounts, key);
    }

    const beforeEligible = new Set([...beforeSitemap].filter(([,n]) => n >= 3).map(([k]) => k));
    const afterEligible = new Set([...afterCounts].filter(([,n]) => n >= 3).map(([k]) => k));
    const newlyEligible = [...afterEligible].filter((k) => !beforeEligible.has(k)).map((k) => ({ tag: canonicalByKey.get(k) ?? k, count: afterCounts.get(k) }));
    const redirects = aliasGroups.flatMap((g) => g.variants.map((v: any) => ({ from: `/tag/${encodeURIComponent(v.tag)}`, to: `/tag/${tagUrlSegment(g.canonical)}` }))).filter((x:any) => x.from !== x.to);

    console.log(JSON.stringify({
      mode: "DRY_RUN_READ_ONLY",
      generatedAt: new Date().toISOString(),
      summary: { publishedPosts: rows.length, storedTagSpellings: new Set(rows.flatMap((p) => p.tags ?? [])).size, canonicalTagKeys: afterCounts.size, aliasGroups: aliasGroups.length, affectedPosts: affected.length, duplicatesRemoved, sitemapEligibleBefore: beforeEligible.size, sitemapEligibleAfter: afterEligible.size, newlyEligible: newlyEligible.length, redirects: redirects.length },
      newlyEligible, aliasGroups, redirects, affectedPosts: affected
    }, null, 2));
  } finally { await client.end(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
