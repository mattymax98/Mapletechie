import { describe, expect, it, vi } from "vitest";

const { rows, update } = vi.hoisted(() => {
  const rows = [
    { id: 7, username: "mapletechie-ai", displayName: "Mapletechie AI", canPublishDirectly: false },
    { id: 8, username: "another-editor", displayName: "Mapletechie AI", canPublishDirectly: true },
  ];
  const update = vi.fn(() => ({
    set: (values: object) => ({
      where: async (matches: (row: typeof rows[number]) => boolean) => {
        for (const row of rows.filter(matches)) Object.assign(row, values);
      },
    }),
  }));
  return { rows, update };
});

vi.mock("@workspace/db", () => ({ db: { update }, usersTable: { username: "username", displayName: "displayName" } }));
vi.mock("drizzle-orm", () => ({
  eq: (column: string, value: string) => (row: Record<string, unknown>) => row[column] === value,
  and: (...predicates: Array<(row: Record<string, unknown>) => boolean>) =>
    (row: Record<string, unknown>) => predicates.every((predicate) => predicate(row)),
}));

const { syncAutomationAuthorIdentity, BOT_DISPLAY_NAME, BOT_USERNAME } = await import("./automationAuthorIdentity");

describe("automation display-name migration", () => {
  it("renames only the bot while retaining its account ID, username and permissions", async () => {
    await syncAutomationAuthorIdentity();
    expect(rows[0]).toEqual({ id: 7, username: BOT_USERNAME, displayName: BOT_DISPLAY_NAME, canPublishDirectly: false });
    expect(rows[1].displayName).toBe("Mapletechie AI");
    await syncAutomationAuthorIdentity();
    expect(rows[0].displayName).toBe(BOT_DISPLAY_NAME);
  });

  it("preserves a name chosen manually in admin", async () => {
    rows[0].displayName = "Custom Editorial Desk";
    await syncAutomationAuthorIdentity();
    expect(rows[0].displayName).toBe("Custom Editorial Desk");
  });
});
