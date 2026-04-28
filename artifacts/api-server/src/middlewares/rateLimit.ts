import rateLimit from "express-rate-limit";

/**
 * Rate limiters for public-write endpoints. Uses the per-IP key from
 * express-rate-limit's defaults. Each limiter is an Express middleware
 * that rejects with HTTP 429 when the limit is exceeded.
 *
 * Numbers are deliberately generous for human use but tight enough to
 * defeat trivial scripted abuse (form spam, comment spam, newsletter
 * sign-up bombing, AI generation abuse).
 */

const json429 = (label: string) => ({
  error: "Too many requests",
  message: `Please slow down — too many ${label} attempts from your network. Try again in a minute.`,
});

/** Newsletter sign-ups: 5 / 10 minutes per IP. */
export const newsletterLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: json429("newsletter sign-up"),
});

/** Contact form: 5 / 10 minutes per IP. */
export const contactLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: json429("contact"),
});

/** Comment posting: 10 / hour per IP. */
export const commentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: json429("comment"),
});

/** Reader review submissions: 10 / hour per IP. */
export const reviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: json429("review"),
});

/** Advertising inquiries: 5 / hour per IP. */
export const adInquiryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: json429("inquiry"),
});

/** Login attempts: 10 / 15 minutes per IP. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: json429("login"),
});

/** AI generation: 30 / hour per IP (admin-only routes get extra protection). */
export const aiGenerateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: json429("AI generation"),
});
