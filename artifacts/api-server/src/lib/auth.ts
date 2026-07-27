import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { db, usersTable, sessionsTable, postsTable, type User } from "@workspace/db";
import { eq, and, gt, isNull } from "drizzle-orm";

const SESSION_DAYS = 30;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

export async function createSession(userId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessionsTable).values({ token, userId, expiresAt });
  return token;
}

export async function getUserBySession(token: string): Promise<User | null> {
  const now = new Date();
  const [row] = await db
    .select({ user: usersTable })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
    .where(and(eq(sessionsTable.token, token), gt(sessionsTable.expiresAt, now)));
  if (!row) return null;
  if (!row.user.isActive) return null;
  return row.user;
}

export async function deleteSession(token: string): Promise<void> {
  await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
}

/**
 * Self-healing invariant: every user with an email must have exactly
 * `username@mapletechie.com` (outgoing mail is rejected otherwise, since the
 * From: header must pass domain verification). Runs at startup so stale rows
 * (e.g. a legacy personal address) are corrected in dev AND in production
 * after a publish. Users with no email (like the draft bot) are left alone.
 */
async function syncDerivedEmails(): Promise<void> {
  const users = await db.select().from(usersTable);
  for (const u of users) {
    if (!u.email) continue;
    const derived = `${u.username}@mapletechie.com`;
    if (u.email !== derived) {
      await db.update(usersTable).set({ email: derived }).where(eq(usersTable.id, u.id));
      console.log(`[auth] Corrected email for ${u.username}: now ${derived}`);
    }
  }
}

export async function bootstrapAdmin(): Promise<void> {
  const existing = await db.select().from(usersTable).limit(1);
  if (existing.length > 0) {
    await syncDerivedEmails();
    return;
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    console.warn("[auth] No ADMIN_PASSWORD env set — skipping admin bootstrap");
    return;
  }

  const passwordHash = await hashPassword(adminPassword);
  const [admin] = await db.insert(usersTable).values({
    username: "matthew",
    passwordHash,
    displayName: "Matthew Mbaka",
    email: "matthew@mapletechie.com",
    bio: "Founder and editor of Mapletechie. He covers AI, electric vehicles, cybersecurity, and consumer gadgets — translating complex tech into clear, actionable insight for readers who want to stay ahead.",
    avatarUrl: "/author-matthew.webp",
    role: "admin",
    canPublishDirectly: true,
    canManageCategories: true,
    isActive: true,
  }).returning();
  console.log("[auth] Bootstrapped admin user: matthew");

  // Backfill existing posts to belong to the admin
  if (admin) {
    await db
      .update(postsTable)
      .set({ authorId: admin.id })
      .where(isNull(postsTable.authorId));
  }
}

export function sanitizeUser(user: User) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...rest } = user;
  return rest;
}
