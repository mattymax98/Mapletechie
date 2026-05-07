import pg from "pg";

const { Pool } = pg;

const DEV_URL = process.env.DATABASE_URL;
const PROD_URL = process.env.PROD_DATABASE_URL;

if (!DEV_URL) {
  console.error("Missing DATABASE_URL (dev source).");
  process.exit(1);
}
if (!PROD_URL) {
  console.error("Missing PROD_DATABASE_URL (prod target).");
  process.exit(1);
}
if (DEV_URL === PROD_URL) {
  console.error("DATABASE_URL and PROD_DATABASE_URL are identical. Refusing to run.");
  process.exit(1);
}

const CURATED_SLUGS = [
  "news",
  "reviews",
  "ai",
  "gadgets",
  "software",
  "gaming",
  "business",
  "canada-tech",
] as const;

const FALLBACK_CATEGORY_MAP: Record<string, string> = {
  "ai-machine-learning": "ai",
  "electric-vehicles": "news",
  "cybersecurity": "news",
  "science-space": "news",
};
const DEFAULT_FALLBACK_SLUG = "news";

type DevPostRow = {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  cover_image: string | null;
  category_slug: string;
  tags: string[];
  author: string;
  author_avatar: string | null;
  status: string;
  scheduled_for: Date | null;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string[];
  og_image: string | null;
  read_time: number;
  view_count: number;
  is_featured: boolean;
  series_id: number | null;
  series_position: number | null;
  published_at: Date;
  created_at: Date;
};

async function main() {
  const dev = new Pool({ connectionString: DEV_URL });
  const prod = new Pool({ connectionString: PROD_URL });

  try {
    const { rows: prodCats } = await prod.query<{ id: number; slug: string }>(
      `SELECT id, slug FROM categories WHERE slug = ANY($1::text[])`,
      [CURATED_SLUGS as unknown as string[]],
    );
    const prodSlugToId = new Map(prodCats.map((r) => [r.slug, r.id]));
    console.log(
      `prod curated categories loaded: ${prodCats.length}/${CURATED_SLUGS.length} -> ${prodCats
        .map((c) => c.slug)
        .join(", ")}`,
    );
    const missingCurated = CURATED_SLUGS.filter((s) => !prodSlugToId.has(s));
    if (missingCurated.length) {
      throw new Error(
        `Prod is missing curated categories: ${missingCurated.join(", ")}. Boot the API server against prod once so seedCuratedCategories runs first.`,
      );
    }

    const fallbackId = prodSlugToId.get(DEFAULT_FALLBACK_SLUG);
    if (!fallbackId) {
      throw new Error(
        `Default fallback category '${DEFAULT_FALLBACK_SLUG}' not found in prod. Run the API server once against prod so seedCuratedCategories runs first.`,
      );
    }

    const { rows: devPosts } = await dev.query<DevPostRow>(`
      SELECT p.title, p.slug, p.excerpt, p.content, p.cover_image,
             c.slug AS category_slug,
             p.tags, p.author, p.author_avatar,
             p.status, p.scheduled_for,
             p.seo_title, p.seo_description, p.seo_keywords, p.og_image,
             p.read_time, p.view_count, p.is_featured, p.series_id, p.series_position,
             p.published_at, p.created_at
        FROM posts p
        JOIN categories c ON c.id = p.category_id
        ORDER BY p.id
    `);
    console.log(`dev posts read: ${devPosts.length}`);

    const remappings: Array<{ slug: string; from: string; to: string }> = [];
    let inserted = 0;
    let skipped = 0;

    for (const row of devPosts) {
      let targetSlug = row.category_slug;
      if (!prodSlugToId.has(targetSlug)) {
        const mapped = FALLBACK_CATEGORY_MAP[targetSlug] ?? DEFAULT_FALLBACK_SLUG;
        if (!prodSlugToId.has(mapped)) {
          console.warn(`skipping '${row.slug}': mapped category '${mapped}' not in prod`);
          continue;
        }
        remappings.push({ slug: row.slug, from: targetSlug, to: mapped });
        if (!FALLBACK_CATEGORY_MAP[row.category_slug]) {
          console.warn(
            `unmapped dev category '${row.category_slug}' for post '${row.slug}' -> defaulted to '${DEFAULT_FALLBACK_SLUG}'`,
          );
        }
        targetSlug = mapped;
      }
      const categoryId = prodSlugToId.get(targetSlug)!;

      const result = await prod.query(
        `INSERT INTO posts (
            title, slug, excerpt, content, cover_image, category_id,
            tags, author, author_avatar, author_id,
            status, scheduled_for,
            seo_title, seo_description, seo_keywords, og_image,
            read_time, view_count, is_featured, series_id, series_position,
            published_at, created_at
         ) VALUES (
            $1,$2,$3,$4,$5,$6,
            $7,$8,$9,1,
            $10,$11,
            $12,$13,$14,$15,
            $16,$17,$18,$19,$20,
            $21,$22
         )
         ON CONFLICT (slug) DO NOTHING
         RETURNING id`,
        [
          row.title,
          row.slug,
          row.excerpt,
          row.content,
          row.cover_image,
          categoryId,
          row.tags,
          row.author,
          row.author_avatar,
          row.status,
          row.scheduled_for,
          row.seo_title,
          row.seo_description,
          row.seo_keywords,
          row.og_image,
          row.read_time,
          row.view_count,
          row.is_featured,
          row.series_id,
          row.series_position,
          row.published_at,
          row.created_at,
        ],
      );
      if (result.rowCount && result.rowCount > 0) {
        inserted++;
        console.log(`inserted: ${row.slug} (category=${targetSlug})`);
      } else {
        skipped++;
        console.log(`skipped (already exists): ${row.slug}`);
      }
    }

    console.log("\n--- Summary ---");
    console.log(`Read:     ${devPosts.length}`);
    console.log(`Inserted: ${inserted}`);
    console.log(`Skipped:  ${skipped}`);
    if (remappings.length) {
      console.log(`Category remappings (${remappings.length}):`);
      for (const r of remappings) {
        console.log(`  ${r.slug}: ${r.from} -> ${r.to}`);
      }
    } else {
      console.log("No category remappings applied.");
    }
  } finally {
    await dev.end();
    await prod.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
