import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Silence the pino logger during tests.
vi.mock("./logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock the DNS resolver so the SSRF guard sees a public address by default.
// Individual tests override this when they need a private/failed lookup.
const lookupMock = vi.fn(async (..._args: unknown[]) => [{ address: "93.184.216.34", family: 4 }]);
vi.mock("node:dns/promises", () => ({
  lookup: (...args: unknown[]) => lookupMock(...args),
}));

// Mock object storage so no real network/sidecar calls happen. Tests that need
// a different behaviour reassign these implementations.
const getObjectEntityUploadURL = vi.fn(
  async () => "https://storage.googleapis.com/bucket/.private/uploads/abc-123",
);
const normalizeObjectEntityPath = vi.fn(() => "/objects/abc-123");
vi.mock("./objectStorage", () => ({
  ObjectStorageService: class {
    getObjectEntityUploadURL = getObjectEntityUploadURL;
    normalizeObjectEntityPath = normalizeObjectEntityPath;
  },
}));

// A small but valid PNG so the real `sharp` pipeline can actually decode it.
const sharp = (await import("sharp")).default;
const PNG_BYTES = await sharp({
  create: { width: 4, height: 4, channels: 3, background: { r: 255, g: 0, b: 0 } },
})
  .png()
  .toBuffer();

function imageGetResponse(): Response {
  return {
    ok: true,
    status: 200,
    headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? "image/png" : null) },
    arrayBuffer: async () =>
      PNG_BYTES.buffer.slice(PNG_BYTES.byteOffset, PNG_BYTES.byteOffset + PNG_BYTES.byteLength),
  } as unknown as Response;
}

// Import after mocks are registered.
const { isExternalImageUrl, persistExternalImage, persistExternalImagesInHtml } = await import("./persistExternalImage");

describe("isExternalImageUrl", () => {
  it("returns true for external http(s) URLs", () => {
    expect(isExternalImageUrl("https://images.unsplash.com/photo-123.jpg")).toBe(true);
    expect(isExternalImageUrl("http://example.com/a.png")).toBe(true);
    expect(isExternalImageUrl("  https://cdn.somehost.net/x.webp  ")).toBe(true);
  });

  it("returns false for our own domain", () => {
    expect(isExternalImageUrl("https://mapletechie.com/covers/a.webp")).toBe(false);
    expect(isExternalImageUrl("https://cdn.mapletechie.com/a.webp")).toBe(false);
  });

  it("returns false for local / relative / storage paths", () => {
    expect(isExternalImageUrl("/covers/a.webp")).toBe(false);
    expect(isExternalImageUrl("/api/storage/objects/abc-123")).toBe(false);
    expect(isExternalImageUrl("covers/a.webp")).toBe(false);
    expect(isExternalImageUrl("./a.webp")).toBe(false);
  });

  it("returns false for non-string and empty inputs", () => {
    expect(isExternalImageUrl(null)).toBe(false);
    expect(isExternalImageUrl(undefined)).toBe(false);
    expect(isExternalImageUrl(123)).toBe(false);
    expect(isExternalImageUrl("")).toBe(false);
    expect(isExternalImageUrl("not a url")).toBe(false);
  });

  it("returns false for non-http schemes", () => {
    expect(isExternalImageUrl("ftp://example.com/a.png")).toBe(false);
    expect(isExternalImageUrl("data:image/png;base64,iVBOR")).toBe(false);
    expect(isExternalImageUrl("javascript:alert(1)")).toBe(false);
  });
});

describe("persistExternalImage — fallback (never throws, returns original URL)", () => {
  beforeEach(() => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    getObjectEntityUploadURL.mockResolvedValue(
      "https://storage.googleapis.com/bucket/.private/uploads/abc-123",
    );
    normalizeObjectEntityPath.mockReturnValue("/objects/abc-123");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("returns the original URL for an invalid URL string", async () => {
    const url = "http://";
    await expect(persistExternalImage(url)).resolves.toBe(url);
  });

  it("returns the original URL when the host is blocked by the SSRF guard (localhost)", async () => {
    const url = "http://localhost/secret.png";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(persistExternalImage(url)).resolves.toBe(url);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns the original URL when DNS resolves to a private address", async () => {
    lookupMock.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);
    const url = "http://internal.example.com/a.png";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(persistExternalImage(url)).resolves.toBe(url);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns the original URL when the fetch rejects (network error)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));
    const url = "https://example.com/a.png";
    await expect(persistExternalImage(url)).resolves.toBe(url);
  });

  it("returns the original URL on a non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 502, headers: { get: () => null } }) as unknown as Response),
    );
    const url = "https://example.com/a.png";
    await expect(persistExternalImage(url)).resolves.toBe(url);
  });

  it("returns the original URL when the response is not an image", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? "text/html" : null) },
        arrayBuffer: async () => new ArrayBuffer(0),
      }) as unknown as Response),
    );
    const url = "https://example.com/not-an-image";
    await expect(persistExternalImage(url)).resolves.toBe(url);
  });

  it("returns the original URL when the storage upload PUT fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: unknown, init?: { method?: string }) => {
        if (init?.method === "PUT") {
          return { ok: false, status: 500, headers: { get: () => null } } as unknown as Response;
        }
        return imageGetResponse();
      }),
    );
    const url = "https://example.com/a.png";
    await expect(persistExternalImage(url)).resolves.toBe(url);
  });

  it("returns the original URL when getting the upload URL throws", async () => {
    getObjectEntityUploadURL.mockRejectedValue(new Error("PRIVATE_OBJECT_DIR not set"));
    vi.stubGlobal("fetch", vi.fn(async () => imageGetResponse()));
    const url = "https://example.com/a.png";
    await expect(persistExternalImage(url)).resolves.toBe(url);
  });
});

describe("persistExternalImage — success", () => {
  beforeEach(() => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    getObjectEntityUploadURL.mockResolvedValue(
      "https://storage.googleapis.com/bucket/.private/uploads/abc-123",
    );
    normalizeObjectEntityPath.mockReturnValue("/objects/abc-123");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("downloads, re-encodes, uploads, and returns a local storage serving path", async () => {
    const fetchSpy = vi.fn(async (_input: unknown, init?: { method?: string }) => {
      if (init?.method === "PUT") {
        return { ok: true, status: 200, headers: { get: () => null } } as unknown as Response;
      }
      return imageGetResponse();
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await persistExternalImage("https://example.com/a.png");
    expect(result).toBe("/api/storage/objects/abc-123");
    // GET to download + PUT to upload.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const putCall = fetchSpy.mock.calls.find(([, init]) => (init as { method?: string })?.method === "PUT");
    expect(putCall).toBeTruthy();
    expect((putCall?.[1] as { headers?: Record<string, string> })?.headers?.["Content-Type"]).toBe(
      "image/webp",
    );
  });
});

describe("persistExternalImagesInHtml", () => {
  beforeEach(() => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    getObjectEntityUploadURL.mockResolvedValue(
      "https://storage.googleapis.com/bucket/.private/uploads/abc-123",
    );
    normalizeObjectEntityPath.mockReturnValue("/objects/abc-123");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  function successfulFetch() {
    return vi.fn(async (_input: unknown, init?: { method?: string }) => {
      if (init?.method === "PUT") {
        return { ok: true, status: 200, headers: { get: () => null } } as unknown as Response;
      }
      return imageGetResponse();
    });
  }

  it("rewrites external img srcs to local storage paths", async () => {
    vi.stubGlobal("fetch", successfulFetch());
    const html = `<p>hi</p><img src="https://example.com/a.png" alt="a">`;
    const out = await persistExternalImagesInHtml(html);
    expect(out).toContain(`src="/api/storage/objects/abc-123"`);
    expect(out).not.toContain("example.com");
    expect(out).toContain("<p>hi</p>");
  });

  it("leaves local, storage, and own-domain srcs untouched and skips fetching them", async () => {
    const fetchSpy = successfulFetch();
    vi.stubGlobal("fetch", fetchSpy);
    const html =
      `<img src="/covers/a.webp"><img src="/api/storage/objects/xyz">` +
      `<img src="https://mapletechie.com/covers/b.webp">`;
    const out = await persistExternalImagesInHtml(html);
    expect(out).toBe(html);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fetches duplicate external URLs only once", async () => {
    const fetchSpy = successfulFetch();
    vi.stubGlobal("fetch", fetchSpy);
    const html = `<img src="https://example.com/a.png"><img src="https://example.com/a.png">`;
    const out = await persistExternalImagesInHtml(html);
    // one GET + one PUT, not two of each
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(out.match(/\/api\/storage\/objects\/abc-123/g)).toHaveLength(2);
  });

  it("keeps the original URL when persistence fails (non-fatal)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));
    const html = `<img src="https://example.com/a.png"><img src="/covers/local.webp">`;
    const out = await persistExternalImagesInHtml(html);
    expect(out).toBe(html);
  });

  it("handles entity-encoded ampersands in src attributes", async () => {
    vi.stubGlobal("fetch", successfulFetch());
    const html = `<img src="https://example.com/a.png?w=100&amp;h=50">`;
    const out = await persistExternalImagesInHtml(html);
    expect(out).toContain(`src="/api/storage/objects/abc-123"`);
  });

  it("returns HTML unchanged when there are no images", async () => {
    const html = "<p>no images here</p>";
    await expect(persistExternalImagesInHtml(html)).resolves.toBe(html);
  });
});
