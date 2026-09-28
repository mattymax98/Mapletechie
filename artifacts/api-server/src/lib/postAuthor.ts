import { postsTable, usersTable } from "@workspace/db";
import { sql } from "drizzle-orm";

/** Linked identity wins, including inactive users. Missing links retain the saved credit. */
export const canonicalPostAuthor = sql<string>`coalesce(
  (select ${usersTable.displayName} from ${usersTable} where ${usersTable.id} = ${postsTable.authorId}),
  ${postsTable.author}
)`;