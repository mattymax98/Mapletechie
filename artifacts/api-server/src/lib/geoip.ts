const COUNTRY_CACHE = new Map<string, { code: string; name: string }>();
const PENDING = new Map<string, Promise<{ code: string; name: string }>>();
const MAX_CACHE = 5000;

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States", CA: "Canada", GB: "United Kingdom", AU: "Australia",
  DE: "Germany", FR: "France", IT: "Italy", ES: "Spain", NL: "Netherlands",
  IE: "Ireland", SE: "Sweden", NO: "Norway", DK: "Denmark", FI: "Finland",
  BE: "Belgium", CH: "Switzerland", AT: "Austria", PL: "Poland", PT: "Portugal",
  BR: "Brazil", MX: "Mexico", AR: "Argentina", CL: "Chile", CO: "Colombia",
  IN: "India", PK: "Pakistan", BD: "Bangladesh", LK: "Sri Lanka",
  JP: "Japan", KR: "South Korea", CN: "China", HK: "Hong Kong", TW: "Taiwan",
  SG: "Singapore", MY: "Malaysia", TH: "Thailand", PH: "Philippines", VN: "Vietnam", ID: "Indonesia",
  AE: "UAE", SA: "Saudi Arabia", IL: "Israel", TR: "Turkey", EG: "Egypt",
  ZA: "South Africa", NG: "Nigeria", KE: "Kenya", GH: "Ghana", MA: "Morocco",
  RU: "Russia", UA: "Ukraine", RO: "Romania", CZ: "Czechia", HU: "Hungary", GR: "Greece",
  NZ: "New Zealand",
};

function nameFor(code: string): string {
  return COUNTRY_NAMES[code] || code;
}

function isPrivateIp(ip: string): boolean {
  if (!ip) return true;
  if (ip === "::1" || ip === "127.0.0.1") return true;
  if (ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
  if (ip.startsWith("172.")) {
    const second = parseInt(ip.split(".")[1] || "0", 10);
    if (second >= 16 && second <= 31) return true;
  }
  if (ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd")) return true;
  return false;
}

export function extractIp(req: { headers: Record<string, unknown>; ip?: string }): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    return xff.split(",")[0]!.trim();
  }
  const real = req.headers["x-real-ip"];
  if (typeof real === "string" && real.length > 0) return real.trim();
  return req.ip || "";
}

export async function lookupCountry(
  ip: string,
  headerCountry?: string,
): Promise<{ code: string; name: string }> {
  if (headerCountry && headerCountry.length === 2 && headerCountry !== "XX") {
    const code = headerCountry.toUpperCase();
    return { code, name: nameFor(code) };
  }
  if (!ip || isPrivateIp(ip)) return { code: "XX", name: "Local" };

  const cached = COUNTRY_CACHE.get(ip);
  if (cached) return cached;

  const pending = PENDING.get(ip);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 1500);
      // ipwho.is — free, no key, HTTPS, no rate limit issues for low volume
      const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country_code,country`, {
        signal: ctrl.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error("ipwho error");
      const data = (await res.json()) as { success?: boolean; country_code?: string; country?: string };
      if (data.success && data.country_code) {
        const result = { code: data.country_code, name: data.country || nameFor(data.country_code) };
        if (COUNTRY_CACHE.size >= MAX_CACHE) {
          const firstKey = COUNTRY_CACHE.keys().next().value;
          if (firstKey) COUNTRY_CACHE.delete(firstKey);
        }
        COUNTRY_CACHE.set(ip, result);
        return result;
      }
    } catch {
      // Swallow — fall through to Unknown (NOT cached — retry next time)
    }
    return { code: "ZZ", name: "Unknown" };
  })();

  PENDING.set(ip, promise);
  try {
    return await promise;
  } finally {
    PENDING.delete(ip);
  }
}
