import { describe, it, expect } from "vitest";
import { externalImageSrcs } from "./maintenance";

describe("externalImageSrcs", () => {
  it("finds external img srcs and ignores local/own-domain ones", () => {
    const html = `
      <img src="/api/storage/objects/uploads/abc">
      <img alt="x" src="https://example.com/pic.jpg?a=1&amp;b=2">
      <img src="https://mapletechie.com/covers/ai.webp">
      <img src="/covers/local.webp">
      <img src="https://cdn.example.org/two.png">`;
    const out = externalImageSrcs(html);
    expect(out).toEqual(new Set([
      "https://example.com/pic.jpg?a=1&b=2",
      "https://cdn.example.org/two.png",
    ]));
  });

  it("returns empty set when no imgs", () => {
    expect(externalImageSrcs("<p>hello</p>").size).toBe(0);
  });
});
