export const BOUNCE_RATE_DEFINITION =
  "Single-page sessions divided by sessions with a valid session ID.";

export function formatBounceRate(
  bounceRate: number | null | undefined,
  sessionCount: number | null | undefined,
): string {
  if (bounceRate == null || !sessionCount) return "Not enough data";
  return `${Math.round(bounceRate)}%`;
}