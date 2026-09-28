import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  auditPostIdExpression,
  auditRevisionIdExpression,
  withoutCoveringLaterApproval,
  withoutTerminalDecision,
} from "./postRevisions";

// Real PostgreSQL executes these expressions against in-query fixtures; mocked
// route tests cannot catch JSON operator precedence or correlated subquery bugs.
describe("revision history and queue SQL on PostgreSQL", () => {
  it("casts extracted IDs, retains legacy post IDs and ignores malformed IDs", async () => {
    const result = await db.execute(sql`
      SELECT ${auditRevisionIdExpression()} AS revision_id,
             ${auditPostIdExpression()} AS post_id
      FROM (VALUES
        ('{"revisionId":6,"postId":80}'::jsonb, '81'::text),
        ('{"revisionId":"2"}'::jsonb, '81'::text),
        ('{}'::jsonb, '5'::text),
        ('{"revisionId":"invalid","postId":"invalid"}'::jsonb, 'invalid'::text)
      ) AS "audit_logs"("details", "entity_id")
    `);
    expect(result.rows).toEqual([
      { revision_id: 6, post_id: 80 },
      { revision_id: 2, post_id: 81 },
      { revision_id: null, post_id: 5 },
      { revision_id: null, post_id: null },
    ]);
  });

  it("excludes an older pending proposal fully covered by a newer approved revision", async () => {
    const fixture = sql`
      WITH "post_revisions"("id", "post_id", "created_at", "changes", "status") AS (
        VALUES
          (2, 81, '2026-09-26T21:02:29Z'::timestamptz,
            '{"title":"old","content":"old","excerpt":"old","seoTitle":"old","seoDescription":"old"}'::jsonb, 'pending'),
          (3, 81, '2026-09-26T21:02:30Z'::timestamptz,
            '{"title":"alt","coverImage":"cover"}'::jsonb, 'pending'),
          (4, 81, '2026-09-26T21:02:51Z'::timestamptz,
            '{"title":"new","content":"new","excerpt":"new","seoTitle":"new","seoDescription":"new"}'::jsonb, 'approved')
      ), "audit_logs"("id", "action", "details") AS (
        VALUES
          (1, 'post.revision.approved', '{"revisionId":4,"postId":81}'::jsonb)
      )
    `;
    const rows = await db.execute(sql`${fixture}
      SELECT "post_revisions"."id" FROM "post_revisions"
      WHERE "post_revisions"."status" = 'pending'
        AND ${withoutCoveringLaterApproval()}
      ORDER BY "post_revisions"."id"
    `);
    expect(rows.rows.map((row) => row.id)).toEqual([3]);
  });

  it("excludes approved, rejected and superseded audit decisions from both rows and count", async () => {
    const fixture = sql`
      WITH "post_revisions"("id", "status") AS (
        VALUES (1, 'pending'), (2, 'pending'), (3, 'pending'), (4, 'pending')
      ), "audit_logs"("id", "action", "details") AS (
        VALUES
          (1, 'post.revision.approved', '{"revisionId":2}'::jsonb),
          (2, 'post.revision.rejected', '{"revisionId":"3"}'::jsonb),
          (3, 'post.revision.superseded', '{"revisionId":4}'::jsonb)
      )
    `;
    const rows = await db.execute(sql`${fixture}
      SELECT "post_revisions"."id" FROM "post_revisions"
      WHERE "post_revisions"."status" = 'pending' AND ${withoutTerminalDecision()}
      ORDER BY "post_revisions"."id"
    `);
    const total = await db.execute(sql`${fixture}
      SELECT count(*)::integer AS total FROM "post_revisions"
      WHERE "post_revisions"."status" = 'pending' AND ${withoutTerminalDecision()}
    `);
    expect(rows.rows.map((row) => row.id)).toEqual([1]);
    expect(total.rows[0]?.total).toBe(1);
  });
});