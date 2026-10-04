import pg from "pg";
import { requireRailwayUrl } from "./railwayMigrationGuard";
import { normalizeSemanticTag } from "./tagSemanticAuditRules";

const { Client } = pg;

type Row = {
  id: number;
  slug: string;
  title: string;
  tags: string[];
  seo_keywords: string[];
  category_name: string | null;
};

async function main() {
  const client = new Client({ connectionString: requireRailwayUrl(process.env) });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const posts = (await client.query<Row>(`
      SELECT p.id, p.slug, p.title, p.tags, p.seo_keywords, c.name AS category_name
      FROM posts p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.status = 'published'
      ORDER BY p.id
    `)).rows;
    const categories = (await client.query<{ id:number; name:string; slug:string }>(
      "SELECT id, name, slug FROM categories ORDER BY name"
    )).rows;
    await client.query("COMMIT");

    const map = new Map<string, {
      tag: string;
      postIds: Set<number>;
      categories: Map<string, number>;
      examples: Array<{id:number; slug:string; title:string; category:string|null}>;
      keywordExact: number;
      keywordNormalized: number;
    }>();

    for (const post of posts) {
      const keywordExact = new Set((post.seo_keywords ?? []).map((x) => x.trim()));
      const keywordNormalized = new Set((post.seo_keywords ?? []).map(normalizeSemanticTag));
      for (const tag of post.tags ?? []) {
        let info = map.get(tag);
        if (!info) {
          info = { tag, postIds:new Set(), categories:new Map(), examples:[], keywordExact:0, keywordNormalized:0 };
          map.set(tag, info);
        }
        if (!info.postIds.has(post.id)) {
          info.postIds.add(post.id);
          const cat = post.category_name ?? "(none)";
          info.categories.set(cat, (info.categories.get(cat) ?? 0) + 1);
          if (info.examples.length < 5) {
            info.examples.push({ id:post.id, slug:post.slug, title:post.title, category:post.category_name });
          }
          if (keywordExact.has(tag)) info.keywordExact += 1;
          if (keywordNormalized.has(normalizeSemanticTag(tag))) info.keywordNormalized += 1;
        }
      }
    }

    const tags = [...map.values()].map((x) => ({
      tag:x.tag,
      count:x.postIds.size,
      categories:[...x.categories.entries()].sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count})),
      examples:x.examples,
      keywordExact:x.keywordExact,
      keywordNormalized:x.keywordNormalized,
    })).sort((a,b)=>b.count-a.count || a.tag.localeCompare(b.tag,"en-CA"));

    console.log(JSON.stringify({
      mode:"PASS_2B_INVENTORY_READ_ONLY",
      generatedAt:new Date().toISOString(),
      categories,
      summary:{
        publishedPosts:posts.length,
        distinctTags:tags.length,
        singletonTags:tags.filter((x)=>x.count===1).length,
        doubletonTags:tags.filter((x)=>x.count===2).length,
        tags3Plus:tags.filter((x)=>x.count>=3).length,
      },
      tags
    },null,2));
  } finally {
    await client.end();
  }
}
main().catch((error)=>{ console.error(error instanceof Error ? error.message : String(error)); process.exitCode=1; });
