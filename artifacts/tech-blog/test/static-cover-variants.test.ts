import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STATIC_COVER_VARIANTS, responsiveCoverProps, COVER_SIZES } from "../src/lib/responsiveImage";

// STATIC_COVER_VARIANTS gates the static-cover srcset: every base name in the
// set advertises `-400` / `-800` / `-1200` / `-1600` / master URLs to browsers. If any
// of those files is deleted, renamed, or a new base name is added without
// committing all variants, browsers silently get broken images in production.
// This suite fails CI the moment the set and the files under public/ drift.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "..", "public");
const VARIANT_SUFFIXES = [400, 800, 1200, 1600] as const;

/** Locate the master webp for a base name under public/covers or public/images. */
function masterPath(base: string): string | null {
  for (const dir of ["covers", "images"]) {
    const p = path.join(publicDir, dir, `${base}.webp`);
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Read the pixel width of a WebP file from its container header.
 * Supports the three WebP bitstream flavors (VP8 lossy, VP8L lossless, VP8X extended).
 */
function webpWidth(file: string): number {
  const buf = readFileSync(file);
  expect(buf.subarray(0, 4).toString("ascii")).toBe("RIFF");
  expect(buf.subarray(8, 12).toString("ascii")).toBe("WEBP");
  const chunk = buf.subarray(12, 16).toString("ascii");
  if (chunk === "VP8X") {
    // 24-bit canvas width minus one at offset 24.
    return 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
  }
  if (chunk === "VP8L") {
    // 14-bit width minus one starting at offset 21 (after 0x2F signature).
    const b0 = buf[21], b1 = buf[22];
    return 1 + ((b0 | (b1 << 8)) & 0x3fff);
  }
  if (chunk === "VP8 ") {
    // Lossy: 16-bit width (14 significant bits) at offset 26.
    return (buf[26] | (buf[27] << 8)) & 0x3fff;
  }
  throw new Error(`Unrecognized WebP chunk "${chunk}" in ${file}`);
}

describe("static cover variant files", () => {
  for (const base of STATIC_COVER_VARIANTS) {
    describe(base, () => {
      it("has a committed master webp", () => {
        expect(masterPath(base), `${base}.webp missing under public/covers and public/images`).toBeTruthy();
      });

      it("has every advertised width variant with a sufficient pixel width", () => {
        const master = masterPath(base);
        if (!master) return; // covered by the test above
        for (const w of VARIANT_SUFFIXES) {
          const variant = master.replace(/\.webp$/, `-${w}.webp`);
          expect(existsSync(variant), `missing ${path.relative(publicDir, variant)}`).toBe(true);
          const width = webpWidth(variant);
          expect(width, `${path.relative(publicDir, variant)} is ${width}px wide, expected ${w}`).toBe(w);
        }
        // The master is advertised as the 2400w candidate.
        const masterWidth = webpWidth(master);
        expect(masterWidth, `${path.relative(publicDir, master)} master should be 2400px wide`).toBe(2400);
      });
    });
  }

  it("responsiveCoverProps only advertises variant URLs for gated base names", () => {
    // Gated cover gets the four-candidate srcset…
    const gated = responsiveCoverProps("/covers/ai-trends.webp", COVER_SIZES.grid3);
    expect(gated.srcSet).toContain("/covers/ai-trends-400.webp 400w");
    expect(gated.srcSet).toContain("/covers/ai-trends.webp 2400w");
    // …an unknown cover must NOT advertise variant URLs that would 404.
    const ungated = responsiveCoverProps("/covers/not-a-real-cover.webp", COVER_SIZES.grid3);
    expect(ungated.srcSet).toBeUndefined();
  });
});
