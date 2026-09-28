import { describe, expect, it } from "vitest";
import { isMissingLocalCoverImage, validateCoverImage } from "./coverImageValidation";

describe("isMissingLocalCoverImage", () => {
  it("allows remote http(s) URLs", () => {
    expect(isMissingLocalCoverImage("https://images.unsplash.com/photo-1?w=900")).toBe(false);
    expect(isMissingLocalCoverImage("http://cdn.example.com/x.jpg")).toBe(false);
  });

  it("allows blank / non-string values", () => {
    expect(isMissingLocalCoverImage("")).toBe(false);
    expect(isMissingLocalCoverImage("   ")).toBe(false);
    expect(isMissingLocalCoverImage(undefined)).toBe(false);
    expect(isMissingLocalCoverImage(null)).toBe(false);
  });

  it("allows object-storage-served /api/ paths (uploads + persisted images)", () => {
    expect(
      isMissingLocalCoverImage("/api/storage/objects/uploads/7ededc54-c33c-40e2-b6cd-3095ecddd3cd"),
    ).toBe(false);
    expect(isMissingLocalCoverImage("/api/storage/objects/abc-123")).toBe(false);
  });

  it("flags local public/ paths that do not exist", () => {
    expect(isMissingLocalCoverImage("/covers/this-file-does-not-exist.webp")).toBe(true);
  });

  it("flags path traversal attempts", () => {
    expect(isMissingLocalCoverImage("/../../etc/passwd")).toBe(true);
  });
});

describe("validateCoverImage", () => {
  it("returns null for /api/storage paths", () => {
    expect(validateCoverImage("/api/storage/objects/uploads/some-id")).toBeNull();
  });

  it("returns an error message for missing local files", () => {
    expect(validateCoverImage("/covers/nope.webp")).toMatch(/Cover image not found/);
  });
});
