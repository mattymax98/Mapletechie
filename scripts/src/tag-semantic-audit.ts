import pg from "pg";
import { requireRailwayUrl } from "./railwayMigrationGuard";
import { highConfidenceSemanticReason, normalizeSemanticTag } from "./tagSemanticAuditRules";

const { Client } = pg;

type Row = { id: number; slug: string; title: string; tags: string[] };

async function main() {
  const client = new Client({ connectionString: requireRailwayUrl(process.env) });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const posts = (await client.query<Row>("SELECT id, slug, title, tags FROM posts WHERE status = 'published' ORDER BY id")).rows;
    const categories = (await client.query<{ name: string }>("SELECT name FROM categories ORDER BY name")).rows.map((r) => r.name);
    await client.query("COMMIT");

    const tagPosts = new Map<string, Set<number>>();
    const examples = new Map<string, Array<{ id: number; slug: string; title: string }>>();
    for (const post of posts) {
      for (const tag of post.tags ?? []) {
        if (!tagPosts.has(tag)) tagPosts.set(tag, new Set());
        tagPosts.get(tag)!.add(post.id);
        const list = examples.get(tag) ?? [];
        if (list.length < 3) list.push({ id: post.id, slug: post.slug, title: post.title });
        examples.set(tag, list);
      }
    }

    const tags = [...tagPosts].map(([tag, ids]) => ({ tag, count: ids.size, ids }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "en-CA"));

    const candidates: any[] = [];
    for (let i = 0; i < tags.length; i++) {
      for (let j = i + 1; j < tags.length; j++) {
        const reason = highConfidenceSemanticReason(tags[i].tag, tags[j].tag);
        if (!reason) continue;
        let cooccurrence = 0;
        for (const id of tags[i].ids) if (tags[j].ids.has(id)) cooccurrence++;
        candidates.push({
          a: tags[i].tag, aCount: tags[i].count,
          b: tags[j].tag, bCount: tags[j].count,
          combinedCount: new Set([...tags[i].ids, ...tags[j].ids]).size,
          cooccurrence, reason,
          examplesA: examples.get(tags[i].tag) ?? [],
          examplesB: examples.get(tags[j].tag) ?? [],
        });
      }
    }

    const categoryKeys = new Set(categories.map(normalizeSemanticTag));
    const categoryDuplicates = tags.filter((x) => categoryKeys.has(normalizeSemanticTag(x.tag)))
      .map((x) => ({ tag: x.tag, count: x.count, examples: examples.get(x.tag) ?? [] }));
    const formatKeys = new Set(["analysis", "guide", "guides", "news", "review", "reviews", "explainer"]);
    const formatTags = tags.filter((x) => formatKeys.has(normalizeSemanticTag(x.tag)))
      .map((x) => ({ tag: x.tag, count: x.count, examples: examples.get(x.tag) ?? [] }));

    const singletons = tags.filter((x) => x.count === 1);
    const doubletons = tags.filter((x) => x.count === 2);
    const report = {
      mode: "PASS_2_READ_ONLY_AUDIT",
      generatedAt: new Date().toISOString(),
      summary: {
        publishedPosts: posts.length,
        distinctTags: tags.length,
        singletonTags: singletons.length,
        doubletonTags: doubletons.length,
        tagsWithThreeOrMorePosts: tags.filter((x) => x.count >= 3).length,
        categoryDuplicateTags: categoryDuplicates.length,
        editorialFormatTags: formatTags.length,
        highConfidenceSemanticPairs: candidates.length,
      },
      categories,
      categoryDuplicateTags: categoryDuplicates,
      editorialFormatTags: formatTags,
      highConfidenceSemanticPairs: candidates.sort((a,b) => b.combinedCount - a.combinedCount),
      topTags: tags.slice(0, 60).map(({ tag, count }) => ({ tag, count })),
      lowFrequencyExamples: [...singletons, ...doubletons].slice(0, 120)
        .map(({ tag, count }) => ({ tag, count, examples: examples.get(tag) ?? [] })),
    };
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await client.end();
  }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
