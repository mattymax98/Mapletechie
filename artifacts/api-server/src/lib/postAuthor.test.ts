import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { canonicalPostAuthor } from "./postAuthor";

describe("canonical post author SQL", () => {
  it("uses the linked account by ID regardless of activity, with saved text as a fallback", () => {
    const { sql, params } = new PgDialect().sqlToQuery(canonicalPostAuthor);
    expect(sql).toMatch(/coalesce\s*\(/i);
    expect(sql).toContain('"users"."display_name"');
    expect(sql).toContain('"users"."id" = "posts"."author_id"');
    expect(sql).toContain('"posts"."author"');
    expect(sql).not.toContain("is_active");
    expect(params).toEqual([]);
  });
});