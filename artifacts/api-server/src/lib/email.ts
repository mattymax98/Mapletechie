import { logger } from "./logger";

const RESEND_API = "https://api.resend.com/emails";

export const NEWSLETTER_FROM =
  process.env["NEWSLETTER_FROM"] || "Mapletechies <newsletter@mapletechie.com>";
export const SITE_URL =
  process.env["SITE_URL"] || "https://mapletechie.com";

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) {
    logger.warn(
      { to: input.to, subject: input.subject },
      "RESEND_API_KEY not configured — email not sent (logged only).",
    );
    return;
  }
  const body: Record<string, unknown> = {
    from: input.from || NEWSLETTER_FROM,
    to: Array.isArray(input.to) ? input.to : [input.to],
    subject: input.subject,
    html: input.html,
  };
  if (input.text) body["text"] = input.text;
  if (input.replyTo) body["reply_to"] = input.replyTo;
  if (input.headers) body["headers"] = input.headers;

  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend ${res.status}: ${text}`);
  }
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
