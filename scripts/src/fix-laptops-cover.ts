import pg from "pg";

const { Pool } = pg;

const TARGET_URL = process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL;

if (!TARGET_URL) {
  console.error(
    "Missing TARGET_DATABASE_URL (or DATABASE_URL). Set TARGET_DATABASE_URL=<prod-url> to run against production.",
  );
  process.exit(1);
}

const SLUG = "best-laptops-2025-definitive-rankings";
const NEW_COVER = "/covers/laptops.png";
const BROKEN_COVER = "/covers/gear-review.png";

async function main() {
  const pool = new Pool({ connectionString: TARGET_URL });
  try {
    const before = await pool.query<{ id: number; slug: string; cover_image: string | null }>(
      `SELECT id, slug, cover_image FROM posts WHERE slug = $1`,
      [SLUG],
    );

    if (before.rows.length === 0) {
      console.log(`No post with slug=${SLUG} found. Nothing to do.`);
      return;
    }

    const row = before.rows[0];
    console.log(`Found post id=${row.id} slug=${row.slug} cover_image=${row.cover_image}`);

    if (row.cover_image === NEW_COVER) {
      console.log(`Already pointing at ${NEW_COVER}. No update needed.`);
      return;
    }

    if (row.cover_image !== BROKEN_COVER && row.cover_image !== null) {
      console.log(
        `cover_image is ${row.cover_image}, not the known broken value ${BROKEN_COVER}. Skipping to avoid clobbering a manual fix. Re-run after clearing the row if you really want to overwrite.`,
      );
      return;
    }

    const result = await pool.query(
      `UPDATE posts SET cover_image = $1 WHERE slug = $2 RETURNING id, slug, cover_image`,
      [NEW_COVER, SLUG],
    );
    console.log(`Updated ${result.rowCount} row(s):`, result.rows[0]);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
