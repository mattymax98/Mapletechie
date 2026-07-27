import { Router } from "express";
import sharp from "sharp";
import { db, mediaTable, categoriesTable } from "@workspace/db";
import { asc } from "drizzle-orm";
import { adminAuth, requireRole } from "../middlewares/adminAuth";
import { aiGenerateLimiter, aiImageLimiter } from "../middlewares/rateLimit";
import { ObjectStorageService } from "../lib/objectStorage";
import { logger } from "../lib/logger";

const router = Router();
const objectStorageService = new ObjectStorageService();

/** Default cover per category slug; anything unmapped falls back to gadgets. */
export const CATEGORY_TO_COVER: Record<string, string> = {
  ai: "/covers/ai-trends.webp",
  gadgets: "/covers/gadgets.webp",
  software: "/covers/software.webp",
  reviews: "/covers/laptops.webp",
};
const DEFAULT_COVER = "/covers/gadgets.webp";

/**
 * The category options are read from the database at request time so the
 * prompt can never drift from the real site categories (an earlier hardcoded
 * list kept offering categories that no longer existed, producing drafts —
 * and links — pointing at 404 category pages).
 */
export function buildSystemPrompt(
  categories: { slug: string; name: string }[],
): string {
  const categoryLines = categories
    .map((c) => `- ${c.slug} (${c.name})`)
    .join("\n");
  return `You are an expert tech journalist writing for Mapletechie, a tech blog inspired by The Verge and TechCrunch. Your writing is clear, engaging, well-researched, and avoids hype. You write for readers who want substance over fluff.

Available categories (you MUST pick exactly one):
${categoryLines}

When given a topic, write a complete blog post and return ONLY a valid JSON object with this exact shape (no markdown fences, no commentary):
{
  "title": "Catchy SEO-friendly title, max 70 chars",
  "slug": "url-friendly-slug-with-hyphens",
  "excerpt": "1-2 sentence hook, max 160 chars, used as meta description",
  "content": "Full article body in markdown. 800-1400 words. Use ## for section headings. Include intro, 3-5 sections with subheadings, conclusion. No title heading (the title is separate).",
  "category": "one of the slugs above",
  "readTime": 5,
  "tags": ["tag1", "tag2", "tag3"]
}

Rules:
- Return ONLY the JSON. No prose before or after. No markdown code fences.
- The slug must be lowercase, hyphenated, no special characters.
- readTime is an integer (minutes), estimate from word count (~200 wpm).
- tags are 3-6 short lowercase keywords.
- Content uses markdown headings (##), bold (**), and bullet lists where helpful.
- Be specific and factual. If you don't know recent details, write evergreen content rather than fabricating dates or quotes.`;
}

router.post("/admin/generate-post", adminAuth, requireRole("admin"), aiGenerateLimiter, async (req, res): Promise<void> => {
  const { topic } = req.body ?? {};
  if (typeof topic !== "string" || topic.trim().length < 3) {
    res.status(400).json({ error: "Topic is required (min 3 characters)" });
    return;
  }

  const dbCategories = await db
    .select({ slug: categoriesTable.slug, name: categoriesTable.name })
    .from(categoriesTable)
    .orderBy(asc(categoriesTable.name));
  if (dbCategories.length === 0) {
    res.status(500).json({ error: "No categories exist yet — create one before generating drafts" });
    return;
  }
  const validSlugs = new Set(dbCategories.map((c) => c.slug));

  const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  if (!baseUrl || !apiKey) {
    res.status(500).json({ error: "AI service is not configured" });
    return;
  }

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        system: buildSystemPrompt(dbCategories),
        messages: [
          {
            role: "user",
            content: `Write a blog post about: ${topic.trim()}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", response.status, errText);
      res.status(502).json({ error: `AI service error (${response.status})` });
      return;
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const textBlock = data.content?.find((b) => b.type === "text");
    const raw = textBlock?.text?.trim() ?? "";

    let parsed: any;
    try {
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error("Failed to parse AI response:", raw.slice(0, 500));
      res.status(502).json({ error: "AI returned invalid format. Try again." });
      return;
    }

    // Never emit a category that doesn't exist — fall back to the first real one.
    const category =
      typeof parsed.category === "string" && validSlugs.has(parsed.category)
        ? parsed.category
        : dbCategories[0].slug;
    const coverImage = CATEGORY_TO_COVER[category] ?? DEFAULT_COVER;

    res.json({
      title: String(parsed.title ?? "").slice(0, 200),
      slug: String(parsed.slug ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 200),
      excerpt: String(parsed.excerpt ?? "").slice(0, 300),
      content: String(parsed.content ?? ""),
      category,
      coverImage,
      author: "Matthew Mbaka",
      readTime: Number.isFinite(parsed.readTime) ? Math.max(1, Math.min(30, Math.round(parsed.readTime))) : 5,
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 6).map((t: any) => String(t)) : [],
    });
  } catch (e) {
    console.error("Generate post error:", e);
    res.status(500).json({ error: "Failed to generate post" });
  }
});

// AI cover-image generation — available to every signed-in editor/admin so
// the whole team can produce high-quality covers. The image is generated
// with gpt-image-1, converted to webp, stored in object storage, and
// registered in the Media library like any other upload.
router.post("/admin/generate-cover-image", adminAuth, aiImageLimiter, async (req, res): Promise<void> => {
  const { prompt } = req.body ?? {};
  if (typeof prompt !== "string" || prompt.trim().length < 3) {
    res.status(400).json({ error: "Describe the image you want (min 3 characters)" });
    return;
  }
  if (prompt.length > 2000) {
    res.status(400).json({ error: "Prompt is too long (max 2000 characters)" });
    return;
  }

  if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || !process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    res.status(500).json({ error: "AI image service is not configured" });
    return;
  }

  try {
    // Lazy import: the SDK client throws at module load if its env vars are
    // missing — importing here keeps a misconfiguration from crashing the
    // whole API at startup and scopes the failure to this endpoint.
    const { generateImageBuffer } = await import("@workspace/integrations-openai-ai-server/image");
    const styled =
      `Editorial blog cover image, wide 3:2 format, for a premium tech publication. ` +
      `${prompt.trim()}. Clean modern composition, strong focal point, no text, no words, no watermarks, no logos.`;
    // Landscape master; the on-demand resizer serves smaller variants.
    const png = await generateImageBuffer(styled, "1536x1024");

    const webp = await sharp(png)
      .webp({ quality: 90, smartSubsample: true })
      .toBuffer();

    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const putResp = await fetch(uploadURL, {
      method: "PUT",
      headers: { "Content-Type": "image/webp" },
      body: webp,
    });
    if (!putResp.ok) {
      logger.warn({ status: putResp.status }, "generate-cover-image: storage upload failed");
      res.status(502).json({ error: "Image was generated but could not be stored. Try again." });
      return;
    }

    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    const servingPath = `/api/storage${objectPath}`;

    // Best-effort Media-library registration so the image can be reused.
    try {
      await db.insert(mediaTable).values({
        url: servingPath,
        filename: `ai-cover-${Date.now()}.webp`,
        mimeType: "image/webp",
        size: webp.byteLength,
        source: `ai:gpt-image-1 — ${prompt.trim().slice(0, 500)}`,
        uploaderId: req.user?.id ?? null,
        uploaderName: req.user?.displayName ?? null,
      }).onConflictDoNothing({ target: mediaTable.url });
    } catch (err) {
      logger.warn({ err }, "generate-cover-image: media-library registration failed");
    }

    logger.info({ user: req.user?.id, bytes: webp.byteLength }, "generate-cover-image: stored AI cover");
    res.json({ url: servingPath });
  } catch (e) {
    logger.error({ err: e }, "generate-cover-image: failed");
    res.status(502).json({ error: "Image generation failed. Try again in a moment." });
  }
});

export default router;
