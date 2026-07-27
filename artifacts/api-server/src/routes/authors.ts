import { Router } from "express";
import { db, usersTable, postsTable, usernameRenamesTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";

const router = Router();

/**
 * GET /authors/by-username/:username
 *
 * Public author profile lookup by username (used for /author/:username archive pages).
 */
router.get("/authors/by-username/:username", async (req, res): Promise<void> => {
  const username = String(req.params.username);
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, username));
  if (!user || !user.isActive) {
    // No live user owns this username — check the rename history so old
    // shared/indexed /author/<username> links 301 to the current page.
    const [rename] = await db
      .select({ username: usersTable.username })
      .from(usernameRenamesTable)
      .innerJoin(usersTable, eq(usersTable.id, usernameRenamesTable.userId))
      .where(and(eq(usernameRenamesTable.oldUsername, username), eq(usersTable.isActive, true)));
    if (rename && rename.username !== username) {
      res.redirect(301, `/api/authors/by-username/${encodeURIComponent(rename.username)}`);
      return;
    }
    res.status(404).json({ error: "Author not found" });
    return;
  }
  res.json({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    twitterUrl: user.twitterUrl,
    linkedinUrl: user.linkedinUrl,
    instagramUrl: user.instagramUrl,
    githubUrl: user.githubUrl,
    websiteUrl: user.websiteUrl,
    alternateName: user.alternateName,
    jobTitle: user.jobTitle,
    locationCity: user.locationCity,
    locationRegion: user.locationRegion,
    locationCountry: user.locationCountry,
    education: user.education,
    knowsAbout: user.knowsAbout,
    organizations: user.organizations,
    memberships: user.memberships,
    profileLinks: user.profileLinks,
  });
});

/**
 * GET /authors/:id/posts
 *
 * Published posts by a given author id.
 */
router.get("/authors/:id/posts", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const posts = await db
    .select()
    .from(postsTable)
    .where(and(eq(postsTable.authorId, id), eq(postsTable.status, "published")))
    .orderBy(desc(postsTable.publishedAt));
  res.json(posts);
});

export default router;
