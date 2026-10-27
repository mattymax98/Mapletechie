import { db, usersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

export const BOT_USERNAME = "mapletechie-ai";
export const BOT_DISPLAY_NAME = "Mapletechie Editorial";

/** Rename only the legacy display name, preserving identity and manual edits. */
export async function syncAutomationAuthorIdentity(): Promise<void> {
  await db.update(usersTable)
    .set({ displayName: BOT_DISPLAY_NAME })
    .where(and(
      eq(usersTable.username, BOT_USERNAME),
      eq(usersTable.displayName, "Mapletechie AI"),
    ));
}
