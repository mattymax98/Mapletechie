const TOKEN_KEY = "mapletechie_admin_token";

/**
 * Authenticated fetch helper for admin pages. Drops the bearer token from
 * `localStorage[TOKEN_KEY]` into the Authorization header, defaults to JSON,
 * and routes through `/api/...`. Use this everywhere admin pages talk to
 * the API by hand instead of via a generated react-query hook.
 *
 * Returns the raw `Response` — the caller decides how to parse it. Throws
 * a JS Error on network failure (same as fetch).
 */
export async function adminFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type") && init.body && typeof init.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const url = input.startsWith("/api/") || input.startsWith("http") ? input : `/api${input.startsWith("/") ? "" : "/"}${input}`;
  return fetch(url, { ...init, headers });
}

/** Convenience wrapper that JSON-parses or throws with the server's message. */
export async function adminJson<T = unknown>(input: string, init: RequestInit = {}): Promise<T> {
  const res = await adminFetch(input, init);
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json().catch(() => ({})) : null;
  if (!res.ok) {
    const msg = (body && (body.message || body.error)) || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return body as T;
}
