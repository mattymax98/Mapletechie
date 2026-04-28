import { Router } from "express";
import { adminAuth } from "../middlewares/adminAuth";
import { aiGenerateLimiter } from "../middlewares/rateLimit";

const router = Router();

const CATEGORY_TO_COVER: Record<string, string> = {
  "ai-machine-learning": "/covers/ai-trends.png",
  "cybersecurity": "/covers/cybersecurity.png",
  "electric-vehicles": "/covers/ev-future.png",
  "gadgets": "/covers/gadgets.png",
  "software": "/covers/software.png",
  "science-space": "/covers/quantum.png",
};

const SYSTEM_PROMPT = `You are an expert tech journalist writing for Mapletechies, a tech blog inspired by The Verge and TechCrunch. Your writing is clear, engaging, well-researched, and avoids hype. You write for readers who want substance over fluff.

Available categories (you MUST pick exactly one):
- ai-machine-learning (AI & Machine Learning)
- cybersecurity (Cybersecurity)
- electric-vehicles (Electric Vehicles)
- gadgets (Gadgets)
- software (Software)
- science-space (Science & Space)

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

router.post("/admin/generate-post", aiGenerateLimiter, adminAuth, async (req, res): Promise<void> => {
  const { topic } = req.body ?? {};
  if (typeof topic !== "string" || topic.trim().length < 3) {
    res.status(400).json({ error: "Topic is required (min 3 characters)" });
    return;
  }

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
        system: SYSTEM_PROMPT,
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

    const category = typeof parsed.category === "string" ? parsed.category : "gadgets";
    const coverImage = CATEGORY_TO_COVER[category] ?? "/covers/gadgets.png";

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

export default router;
