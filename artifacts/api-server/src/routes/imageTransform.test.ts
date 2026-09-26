import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "node:http";
import sharp from "sharp";
import { isSupportedMaster } from "../lib/imageLimits";

const mockGetObjectEntityFile = vi.fn();
const mockDownloadObject = vi.fn();
vi.mock("../lib/objectStorage", () => ({
  ObjectStorageService: class {
    getObjectEntityFile = mockGetObjectEntityFile;
    downloadObject = mockDownloadObject;
  },
  ObjectNotFoundError: class extends Error {},
}));

const { default: imageRouter, exactAspectCrop } = await import("./imageTransform");
const paths = [
  "/storage/img-ratio/16-9/objects/uploads/unsafe",
  "/storage/img-social/objects/uploads/unsafe",
];

async function request(path: string) {
  const app = express();
  app.use((req, _res, next) => {
    req.log = { error: vi.fn(), warn: vi.fn() } as unknown as typeof req.log;
    next();
  });
  app.use(imageRouter);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}${path}`);
    return { status: response.status, headers: response.headers, body: Buffer.from(await response.arrayBuffer()) };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function stored(bytes: Buffer, headers?: Record<string, string>) {
  mockDownloadObject.mockImplementation(async () => new Response(bytes, { headers }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetObjectEntityFile.mockResolvedValue({ name: "uploads/unsafe" });
});

describe("exactAspectCrop", () => {
  it("returns centered exact-ratio windows without enlarging", () => {
    expect(exactAspectCrop(2400, 1600, [16, 9])).toEqual({
      left: 0,
      top: 125,
      width: 2400,
      height: 1350,
    });
    expect(exactAspectCrop(1600, 2400, [4, 3])).toEqual({
      left: 0,
      top: 600,
      width: 1600,
      height: 1200,
    });
    expect(exactAspectCrop(800, 1200, [1, 1])).toEqual({
      left: 0,
      top: 200,
      width: 800,
      height: 800,
    });
  });

  it("rejects sources that cannot provide even one exact-ratio pixel unit", () => {
    expect(exactAspectCrop(15, 100, [16, 9])).toBeNull();
  });

  it("caps generated derivatives at 2400px without upscaling", () => {
    expect(exactAspectCrop(6000, 4000, [16, 9])).toEqual({
      left: 1800,
      top: 1325,
      width: 2400,
      height: 1350,
    });
  });
});

describe("retained master safety limit", () => {
  it("rejects compressed images with dangerous decoded dimensions at ingestion and transform", () => {
    expect(isSupportedMaster(6000, 6000)).toBe(false);
    expect(isSupportedMaster(10000, 100)).toBe(false);
    expect(isSupportedMaster(4000, 4000)).toBe(true);
    expect(isSupportedMaster(undefined, 2000)).toBe(false);
  });
});

describe("public image transforms over HTTP", () => {
  it.each(paths)("reports missing stored masters without transforming at %s", async (path) => {
    mockDownloadObject.mockResolvedValue(new Response(null, { status: 404 }));
    const result = await request(path);
    expect(result.status).toBe(404);
    expect(result.headers.get("x-image-variant")).toBeNull();
  });

  it.each(paths)("rejects advertised oversized masters before reading at %s", async (path) => {
    let pulls = 0;
    mockDownloadObject.mockResolvedValue(new Response(new ReadableStream({
      pull(controller) {
        pulls++;
        controller.enqueue(new Uint8Array(1));
      },
    }), { headers: { "Content-Length": String(25 * 1024 * 1024 + 1) } }));
    const result = await request(path);
    expect(result.status).toBe(413);
    expect(result.headers.get("x-image-variant")).toBeNull();
    // ReadableStream may prefetch one chunk, but the body must not be drained.
    expect(pulls).toBeLessThanOrEqual(1);
  });

  it.each(paths)("rejects active SVG stored as a raster master at %s", async (path) => {
    stored(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><script>alert(1)</script></svg>'),
      { "Content-Type": "image/png" });
    const result = await request(path);
    expect(result.status).toBe(422);
    expect(result.headers.get("x-image-variant")).toBeNull();
    expect(result.headers.get("content-type")).toMatch(/application\/json/);
    expect(mockGetObjectEntityFile).toHaveBeenCalledWith("/objects/uploads/unsafe");
  });

  it.each(paths)("rejects legacy compressed decoded-dimension bombs at %s", async (path) => {
    const bomb = await sharp({
      create: { width: 6000, height: 6000, channels: 3, background: "#ffffff" },
    }).png().toBuffer();
    stored(bomb);
    const result = await request(path);
    expect(result.status).toBe(422);
    expect(result.headers.get("x-image-variant")).toBeNull();
  });

  it.each(paths)("stops reading legacy oversize objects before transformation at %s", async (path) => {
    let canceled = false;
    let pulled = 0;
    mockDownloadObject.mockImplementation(async () => new Response(new ReadableStream({
      pull(controller) {
        pulled++;
        controller.enqueue(new Uint8Array(1024 * 1024));
      },
      cancel() { canceled = true; },
    })));
    const result = await request(path);
    expect(result.status).toBe(413);
    expect(result.headers.get("x-image-variant")).toBeNull();
    expect(canceled).toBe(true);
    expect(pulled).toBeLessThan(30);
  });

  it("preserves exact 16:9 dimensions on safe original bytes", async () => {
    const image = await sharp({
      create: { width: 320, height: 240, channels: 3, background: "#f26522" },
    }).png().toBuffer();
    stored(image);
    const result = await request(paths[0]);
    expect(result.status).toBe(200);
    expect(result.headers.get("x-image-variant")).toBe("16-9");
    expect(result.headers.get("content-type")).toMatch(/image\/webp/);
    const metadata = await sharp(result.body).metadata();
    expect([metadata.width, metadata.height]).toEqual([320, 180]);
  });

  it("produces a 1200x630 JPEG social card from a safe original", async () => {
    const image = await sharp({
      create: { width: 320, height: 240, channels: 3, background: "#f26522" },
    }).png().toBuffer();
    stored(image);
    const result = await request(paths[1]);
    expect(result.status).toBe(200);
    expect(result.headers.get("x-image-variant")).toBe("social-1200x630");
    expect(result.headers.get("content-type")).toMatch(/image\/jpeg/);
    const metadata = await sharp(result.body).metadata();
    expect([metadata.width, metadata.height]).toEqual([1200, 630]);
  });
});