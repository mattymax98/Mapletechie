import { Router } from "express";
import { db, jobsTable, applicationsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { adminAuth, requirePermission } from "../middlewares/adminAuth";
import { sendEmail, escapeHtml, CAREERS_FROM, CAREERS_REPLY_TO, SITE_URL } from "../lib/email";
import { writeAuditLog } from "../lib/audit";

const router = Router();

function applicationReplyHtml(args: {
  candidateName: string;
  jobTitle: string;
  message: string;
  senderName: string;
}): string {
  const safeMsg = escapeHtml(args.message).replace(/\n/g, "<br />");
  return `<!doctype html>
<html><head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111;">
  <div style="max-width:600px;margin:0 auto;background:#fff;">
    <div style="height:6px;background:#f97316;"></div>
    <div style="padding:32px 32px 8px 32px;">
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#111;letter-spacing:-0.01em;">
        Maple<span style="color:#f97316;font-style:italic;">techie</span>
      </div>
      <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#888;margin-top:4px;">
        Careers · re: ${escapeHtml(args.jobTitle)}
      </div>
    </div>
    <div style="padding:8px 32px 32px 32px;font-size:15px;line-height:1.6;color:#222;">
      <p style="margin:16px 0 0 0;">Hi ${escapeHtml(args.candidateName.split(" ")[0] || args.candidateName)},</p>
      <div style="margin:16px 0;">${safeMsg}</div>
      <p style="margin:24px 0 4px 0;">Best,</p>
      <p style="margin:0;font-weight:600;">${escapeHtml(args.senderName)}</p>
      <p style="margin:0;color:#666;font-size:13px;">Mapletechie</p>
    </div>
    <div style="border-top:1px solid #eee;padding:16px 32px;font-size:12px;color:#888;">
      You're receiving this because you applied to a role at Mapletechie.<br />
      Reply directly to this email to reach us. <a href="${SITE_URL}/careers" style="color:#f97316;text-decoration:none;">mapletechie.com/careers</a>
    </div>
  </div>
</body></html>`;
}

function applicationReplyText(args: {
  candidateName: string;
  jobTitle: string;
  message: string;
  senderName: string;
}): string {
  return `Hi ${args.candidateName.split(" ")[0] || args.candidateName},

${args.message}

Best,
${args.senderName}
Mapletechie — re: ${args.jobTitle}
${SITE_URL}/careers
`;
}

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
router.get("/admin/jobs", adminAuth, requirePermission("jobs"), async (_req, res): Promise<void> => {
  const jobs = await db.select().from(jobsTable).orderBy(desc(jobsTable.createdAt));
  res.json(jobs);
});

router.post("/admin/jobs", adminAuth, requirePermission("jobs"), async (req, res): Promise<void> => {
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

router.put("/admin/jobs/:id", adminAuth, requirePermission("jobs"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const data = sanitizeJob(req.body);
  const [updated] = await db.update(jobsTable).set(data as any).where(eq(jobsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.delete("/admin/jobs/:id", adminAuth, requirePermission("jobs"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(jobsTable).where(eq(jobsTable.id, id));
  res.status(204).end();
});

router.get("/admin/applications", adminAuth, requirePermission("jobs"), async (_req, res): Promise<void> => {
  const apps = await db.select().from(applicationsTable).orderBy(desc(applicationsTable.createdAt));
  res.json(apps);
});

router.delete("/admin/applications/:id", adminAuth, requirePermission("jobs"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(applicationsTable).where(eq(applicationsTable.id, id));
  res.status(204).end();
});

router.post("/admin/applications/:id/reply", adminAuth, requirePermission("jobs"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const subject = String(req.body?.subject || "").trim();
  const message = String(req.body?.message || "").trim();
  if (!subject || !message) {
    res.status(400).json({ error: "Subject and message are required" });
    return;
  }
  if (subject.length > 200) {
    res.status(400).json({ error: "Subject must be 200 characters or fewer" });
    return;
  }
  if (message.length > 10000) {
    res.status(400).json({ error: "Message must be 10,000 characters or fewer" });
    return;
  }

  const [app] = await db.select().from(applicationsTable).where(eq(applicationsTable.id, id));
  if (!app) { res.status(404).json({ error: "Application not found" }); return; }

  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, app.jobId));
  const jobTitle = job?.title || "your application";

  const senderName = req.user?.displayName || req.user?.username || "The Mapletechie Team";

  // Careers replies always send from and reply to the shared careers@ mailbox so
  // every editor replying to a candidate stays in one shared thread/inbox. The
  // sender's name appears in the sign-off only.
  const fromAddress = CAREERS_FROM;
  const replyTo = CAREERS_REPLY_TO;

  if (!process.env["RESEND_API_KEY"]) {
    res.status(503).json({
      error: "Email service not configured",
      message: "RESEND_API_KEY is missing on the server. Add it in Secrets, then try again.",
    });
    return;
  }

  try {
    await sendEmail({
      from: fromAddress,
      replyTo,
      to: app.email,
      subject,
      html: applicationReplyHtml({ candidateName: app.name, jobTitle, message, senderName }),
      text: applicationReplyText({ candidateName: app.name, jobTitle, message, senderName }),
    });
  } catch (err: any) {
    req.log.error({ err: err?.message || String(err), applicationId: id }, "Failed to send application reply");
    res.status(502).json({
      error: "Email send failed",
      message: err?.message || "Resend rejected the message",
    });
    return;
  }

  await db.update(applicationsTable).set({ status: "replied" }).where(eq(applicationsTable.id, id));

  // Privacy: keep a short trimmed preview only — the audit log is a paper trail
  // for *who replied to whom and when*, not a full mailbox archive.
  const PREVIEW_LEN = 160;
  const messagePreview =
    message.length > PREVIEW_LEN ? `${message.slice(0, PREVIEW_LEN)}…` : message;

  await writeAuditLog(req, {
    action: "application.reply.sent",
    entityType: "application",
    entityId: id,
    summary: `Replied to ${app.name} <${app.email}> re: ${jobTitle}`,
    details: {
      subject,
      messagePreview,
      messageLength: message.length,
      to: app.email,
      from: fromAddress,
      replyTo,
      jobId: app.jobId,
    },
  });

  res.json({ success: true, message: "Reply sent." });
});

export default router;
