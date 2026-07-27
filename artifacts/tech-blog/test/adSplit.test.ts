// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { splitHtmlForInArticleAds } from "../src/components/AdSlot";

const p = (n: number) => `<p>Paragraph ${n} with some words in it.</p>`;
const paragraphs = (n: number) => Array.from({ length: n }, (_, i) => p(i + 1)).join("");

/** Round-trip equivalence: joining the chunks reparses to the same DOM. */
function normalized(html: string): string {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  return tpl.innerHTML;
}

describe("splitHtmlForInArticleAds", () => {
  it("returns short articles whole (no ad breaks)", () => {
    const html = paragraphs(6);
    expect(splitHtmlForInArticleAds(html)).toEqual([html]);
  });

  it("splits a long article into at most maxBreaks+1 chunks at paragraph boundaries", () => {
    const html = paragraphs(20);
    const chunks = splitHtmlForInArticleAds(html);
    expect(chunks.length).toBe(3); // 2 breaks max
    for (const c of chunks) expect(c).toMatch(/^<p>/);
    expect(chunks.join("")).toBe(normalized(html));
  });

  it("never splits inside or right after unsafe blocks — only after top-level <p>", () => {
    // Paragraphs 1-5, then a code block + figure + blockquote, then more paragraphs.
    const html =
      paragraphs(5) +
      `<pre><code>const x = 1;\nconst y = 2;</code></pre>` +
      `<figure><img src="/a.png"><figcaption>A caption</figcaption></figure>` +
      `<blockquote><p>Quoted paragraph should not count as a boundary escape.</p></blockquote>` +
      Array.from({ length: 8 }, (_, i) => p(i + 6)).join("");
    const chunks = splitHtmlForInArticleAds(html, { everyN: 6, maxBreaks: 2, minParagraphs: 9 });
    expect(chunks.length).toBeGreaterThan(1);
    // Unsafe blocks stay intact inside a single chunk.
    const joined = chunks.join("");
    expect(joined).toBe(normalized(html));
    expect(chunks.some((c) => c.includes("<pre><code>const x = 1;"))).toBe(true);
    // Every chunk boundary is after a </p>.
    for (const c of chunks.slice(0, -1)) expect(c).toMatch(/<\/p>$/);
  });

  it("preserves entity-escaped text and HTML comments exactly", () => {
    const html =
      p(1) +
      `<p>Fish &amp; Chips &lt;tasty&gt;</p>` +
      `<!-- editorial note -->` +
      `some loose &amp; escaped text` +
      paragraphs(10);
    const chunks = splitHtmlForInArticleAds(html, { everyN: 4, maxBreaks: 2, minParagraphs: 9 });
    const joined = chunks.join("");
    expect(joined).toBe(normalized(html));
    expect(joined).toContain("Fish &amp; Chips &lt;tasty&gt;");
    expect(joined).toContain("<!-- editorial note -->");
    expect(joined).toContain("loose &amp; escaped");
  });

  it("never places a break within the final two paragraphs", () => {
    const html = paragraphs(12);
    const chunks = splitHtmlForInArticleAds(html, { everyN: 6, maxBreaks: 2, minParagraphs: 9 });
    const last = chunks[chunks.length - 1];
    // Last chunk keeps at least the final two paragraphs together.
    expect(last).toContain("Paragraph 11");
    expect(last).toContain("Paragraph 12");
  });
});
