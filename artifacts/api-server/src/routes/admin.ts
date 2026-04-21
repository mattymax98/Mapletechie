import { Router } from "express";
import { db, usersTable, type User } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  hashPassword,
  verifyPassword,
  createSession,
  deleteSession,
  sanitizeUser,
} from "../lib/auth";
import { adminAuth, requirePermission } from "../middlewares/adminAuth";
import { writeAuditLog, writeAuditLogForUser } from "../lib/audit";

const router = Router();

// ---- Auth ----

router.post("/admin/login", async (req, res): Promise<void> => {
  const { username, password } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string") {
    res.status(400).json({ success: false, message: "Username and password required" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, username.trim().toLowerCase()));

  if (!user || !user.isActive) {
    await writeAuditLogForUser(req, null, {
      action: "auth.login.fail",
      summary: `Failed login attempt for "${username.trim().toLowerCase()}" (no such user or inactive)`,
    });
    res.status(401).json({ success: false, message: "Invalid credentials" });
    return;
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    await writeAuditLogForUser(req, { id: user.id, username: user.username }, {
      action: "auth.login.fail",
      summary: `Wrong password for ${user.username}`,
    });
    res.status(401).json({ success: false, message: "Invalid credentials" });
    return;
  }

  const token = await createSession(user.id);
  await writeAuditLogForUser(req, { id: user.id, username: user.username }, {
    action: "auth.login",
    summary: `${user.displayName} signed in`,
  });
  res.json({ success: true, token, user: sanitizeUser(user) });
});

// Legacy: keep /admin/verify for back-compat — accepts password only against env ADMIN_PASSWORD
router.post("/admin/verify", async (req, res): Promise<void> => {
  const adminPassword = process.env.ADMIN_PASSWORD;
  const { password } = req.body ?? {};
  if (!adminPassword || password !== adminPassword) {
    res.status(401).json({ success: false, message: "Incorrect password" });
    return;
  }
  res.json({ success: true, message: "Authenticated" });
});

router.post("/admin/logout", adminAuth, async (req, res): Promise<void> => {
  const token = req.headers.authorization?.slice(7);
  if (token) await deleteSession(token);
  await writeAuditLog(req, { action: "auth.logout", summary: `${req.user?.displayName ?? "User"} signed out` });
  res.json({ success: true });
});

router.get("/admin/me", adminAuth, async (req, res): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json(sanitizeUser(req.user));
});

router.put("/admin/me", adminAuth, async (req, res): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const allowed = [
    "displayName",
    "email",
    "bio",
    "avatarUrl",
    "twitterUrl",
    "linkedinUrl",
    "instagramUrl",
    "githubUrl",
    "websiteUrl",
  ] as const;

  const update: Partial<User> = {};
  for (const k of allowed) {
    if (k in req.body) (update as Record<string, unknown>)[k] = req.body[k];
  }

  if (typeof req.body.password === "string" && req.body.password.length >= 6) {
    update.passwordHash = await hashPassword(req.body.password);
  }

  const [updated] = await db
    .update(usersTable)
    .set(update)
    .where(eq(usersTable.id, req.user.id))
    .returning();

  res.json(sanitizeUser(updated));
});

// ---- User management (admin only) ----

router.get("/admin/users", adminAuth, requirePermission("editors"), async (req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(usersTable.id);
  // Non-admins (e.g. editors with canManageEditors) cannot see the founding admin's account.
  const filtered = req.user?.role === "admin" ? users : users.filter((u) => u.role !== "admin");
  res.json(filtered.map(sanitizeUser));
});

router.post("/admin/users", adminAuth, requirePermission("editors"), async (req, res): Promise<void> => {
  const callerIsAdmin = req.user?.role === "admin";
  const {
    username,
    password,
    displayName,
    email,
    bio,
    avatarUrl,
    twitterUrl,
    linkedinUrl,
    instagramUrl,
    githubUrl,
    websiteUrl,
    role,
    canPublishDirectly,
    canManageShop,
    canManageJobs,
    canViewInbox,
    canManageEditors,
  } = req.body ?? {};

  if (typeof username !== "string" || username.trim().length < 2) {
    res.status(400).json({ error: "Username required (min 2 chars)" });
    return;
  }
  if (typeof password !== "string" || password.length < 6) {
    res.status(400).json({ error: "Password required (min 6 chars)" });
    return;
  }
  if (typeof displayName !== "string" || displayName.trim().length < 1) {
    res.status(400).json({ error: "Display name required" });
    return;
  }

  const cleanUsername = username.trim().toLowerCase();
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.username, cleanUsername));
  if (existing) {
    res.status(409).json({ error: "Username already taken" });
    return;
  }

  const passwordHash = await hashPassword(password);

  const [user] = await db
    .insert(usersTable)
    .values({
      username: cleanUsername,
      passwordHash,
      displayName: displayName.trim(),
      email: email ?? null,
      bio: bio ?? null,
      avatarUrl: avatarUrl ?? null,
      twitterUrl: twitterUrl ?? null,
      linkedinUrl: linkedinUrl ?? null,
      instagramUrl: instagramUrl ?? null,
      githubUrl: githubUrl ?? null,
      websiteUrl: websiteUrl ?? null,
      role: callerIsAdmin && role === "admin" ? "admin" : "editor",
      canPublishDirectly: callerIsAdmin ? !!canPublishDirectly : false,
      canManageShop: callerIsAdmin ? !!canManageShop : false,
      canManageJobs: callerIsAdmin ? !!canManageJobs : false,
      canViewInbox: callerIsAdmin ? !!canViewInbox : false,
      canManageEditors: callerIsAdmin ? !!canManageEditors : false,
      isActive: true,
    })
    .returning();

  res.status(201).json(sanitizeUser(user));
});

router.put("/admin/users/:id", adminAuth, requirePermission("editors"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const callerIsAdmin = req.user?.role === "admin";
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (!callerIsAdmin && target.role === "admin") {
    res.status(403).json({ error: "Only the founding admin can modify the admin account." });
    return;
  }

  const baseAllowed = [
    "displayName",
    "email",
    "bio",
    "avatarUrl",
    "twitterUrl",
    "linkedinUrl",
    "instagramUrl",
    "githubUrl",
    "websiteUrl",
    "isActive",
  ] as const;
  const adminOnly = [
    "role",
    "canPublishDirectly",
    "canManageShop",
    "canManageJobs",
    "canViewInbox",
    "canManageEditors",
  ] as const;

  const update: Partial<User> = {};
  for (const k of baseAllowed) {
    if (k in req.body) (update as Record<string, unknown>)[k] = req.body[k];
  }
  if (callerIsAdmin) {
    for (const k of adminOnly) {
      if (k in req.body) (update as Record<string, unknown>)[k] = req.body[k];
    }
  }

  if (typeof req.body.password === "string" && req.body.password.length >= 6) {
    update.passwordHash = await hashPassword(req.body.password);
  }

  const [updated] = await db
    .update(usersTable)
    .set(update)
    .where(eq(usersTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(sanitizeUser(updated));
});

router.delete("/admin/users/:id", adminAuth, requirePermission("editors"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  if (req.user?.id === id) {
    res.status(400).json({ error: "Cannot delete your own account" });
    return;
  }
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!target) {
    res.status(204).send();
    return;
  }
  if (target.role === "admin" && req.user?.role !== "admin") {
    res.status(403).json({ error: "Only the founding admin can remove the admin account." });
    return;
  }
  await db.delete(usersTable).where(eq(usersTable.id, id));
  res.status(204).send();
});

// Public list of editors (used to populate the Author dropdown when writing posts)
router.get("/editors", async (_req, res): Promise<void> => {
  const users = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.isActive, true))
    .orderBy(usersTable.id);
  res.json(
    users.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      bio: u.bio,
      avatarUrl: u.avatarUrl,
      twitterUrl: u.twitterUrl,
      linkedinUrl: u.linkedinUrl,
      instagramUrl: u.instagramUrl,
      githubUrl: u.githubUrl,
      websiteUrl: u.websiteUrl,
    }))
  );
});

// Public: founding/featured editor (first active admin)
router.get("/editors/featured", async (_req, res): Promise<void> => {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.isActive, true), eq(usersTable.role, "admin")))
    .orderBy(usersTable.id)
    .limit(1);
  if (!user) {
    res.status(404).json({ error: "No editor found" });
    return;
  }
  res.json({
    id: user.id,
    displayName: user.displayName,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    twitterUrl: user.twitterUrl,
    linkedinUrl: user.linkedinUrl,
    instagramUrl: user.instagramUrl,
    githubUrl: user.githubUrl,
    websiteUrl: user.websiteUrl,
  });
});

// Public author endpoint (used by blog post page to show real author bio)
router.get("/authors/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user || !user.isActive) {
    res.status(404).json({ error: "Author not found" });
    return;
  }
  // Return only public-safe fields
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
  });
});

export default router;
