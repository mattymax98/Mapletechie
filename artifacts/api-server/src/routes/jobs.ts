import { Router } from "express";
import { db, jobsTable, applicationsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { adminAuth, requireRole } from "../middlewares/adminAuth";

const router = Router();

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-");
}

function sanitizeJob(body: any) {
  const slug = (body.slug && String(body.slug).trim()) || slugify(String(body.title || ""));
  return {
    slug: slug.slice(0, 200),
    title: String(body.title || "").trim().slice(0, 200),
    department: String(body.department || "").trim().slice(0, 100),
    location: String(body.location || "").trim().slice(0, 100),
    employmentType: String(body.employmentType || "Full-time").trim().slice(0, 50),
    compensation: body.compensation ? String(body.compensation).trim().slice(0, 200) : null,
    summary: String(body.summary || "").trim().slice(0, 500),
    description: String(body.description || "").trim().slice(0, 10000),
    responsibilities: String(body.responsibilities || "").trim().slice(0, 10000),
    requirements: String(body.requirements || "").trim().slice(0, 10000),
    niceToHaves: body.niceToHaves ? String(body.niceToHaves).trim().slice(0, 5000) : null,
    applyEmail: body.applyEmail ? String(body.applyEmail).trim().slice(0, 200) : null,
    isActive: body.isActive !== false,
    updatedAt: new Date(),
  };
}

router.get("/jobs", async (_req, res): Promise<void> => {
  const jobs = await db
    .select()
    .from(jobsTable)
    .where(eq(jobsTable.isActive, true))
    .orderBy(desc(jobsTable.createdAt));
  res.json(jobs);
});

router.get("/jobs/:slug", async (req, res): Promise<void> => {
  const [job] = await db
    .select()
    .from(jobsTable)
    .where(and(eq(jobsTable.slug, req.params.slug), eq(jobsTable.isActive, true)));
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(job);
});

router.post("/jobs/:slug/apply", async (req, res): Promise<void> => {
  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.slug, req.params.slug));
  if (!job || !job.isActive) {
    res.status(404).json({ success: false, message: "Job posting not found" });
    return;
  }
  const body = req.body || {};
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim();
  const coverLetter = String(body.coverLetter || "").trim();
  if (!name || !email || !coverLetter) {
    res.status(400).json({ success: false, message: "Name, email, and cover letter are required" });
    return;
  }
  await db.insert(applicationsTable).values({
    jobId: job.id,
    name: name.slice(0, 200),
    email: email.slice(0, 200),
    phone: body.phone ? String(body.phone).trim().slice(0, 50) : null,
    resumeUrl: body.resumeUrl ? String(body.resumeUrl).trim().slice(0, 1000) : null,
    portfolioUrl: body.portfolioUrl ? String(body.portfolioUrl).trim().slice(0, 1000) : null,
    coverLetter: coverLetter.slice(0, 10000),
  });
  res.json({ success: true, message: "Application received. We'll be in touch." });
});

// Admin
router.get("/admin/jobs", adminAuth, requireRole("admin"), async (_req, res): Promise<void> => {
  const jobs = await db.select().from(jobsTable).orderBy(desc(jobsTable.createdAt));
  res.json(jobs);
});

router.post("/admin/jobs", adminAuth, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const data = sanitizeJob(req.body);
    if (!data.title || !data.summary || !data.description) {
      res.status(400).json({ error: "Title, summary, and description are required" });
      return;
    }
    const [created] = await db.insert(jobsTable).values(data as any).returning();
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to create job" });
  }
});

router.put("/admin/jobs/:id", adminAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const data = sanitizeJob(req.body);
  const [updated] = await db.update(jobsTable).set(data as any).where(eq(jobsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.delete("/admin/jobs/:id", adminAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(jobsTable).where(eq(jobsTable.id, id));
  res.status(204).end();
});

router.get("/admin/applications", adminAuth, requireRole("admin"), async (_req, res): Promise<void> => {
  const apps = await db.select().from(applicationsTable).orderBy(desc(applicationsTable.createdAt));
  res.json(apps);
});

router.delete("/admin/applications/:id", adminAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(applicationsTable).where(eq(applicationsTable.id, id));
  res.status(204).end();
});

export default router;
