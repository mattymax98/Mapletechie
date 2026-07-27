import { describe, it, expect } from "vitest";
import { ensureImgAlt } from "../src/lib/ensureImgAlt";

describe("ensureImgAlt", () => {
  it("injects an empty alt on an img without one", () => {
    expect(ensureImgAlt('<p>Hi</p><img src="/a.jpg">')).toBe(
      '<p>Hi</p><img alt="" src="/a.jpg">',
    );
  });

  it("handles self-closing imgs and extra attributes", () => {
    expect(
      ensureImgAlt('<img src="/a.jpg" width="800" height="600" class="max-w-full h-auto" />'),
    ).toBe('<img alt="" src="/a.jpg" width="800" height="600" class="max-w-full h-auto" />');
  });

  it("leaves imgs that already have alt text untouched", () => {
    const html = '<img src="/a.jpg" alt="A red canoe on a lake">';
    expect(ensureImgAlt(html)).toBe(html);
  });

  it("leaves explicit empty alt attributes untouched", () => {
    const html = '<img alt="" src="/a.jpg">';
    expect(ensureImgAlt(html)).toBe(html);
  });

  it("fixes only the imgs that need it in mixed content", () => {
    const html =
      '<img src="/one.jpg" alt="One"><p>text</p><img src="/two.jpg"><img src="/three.jpg" alt="">';
    expect(ensureImgAlt(html)).toBe(
      '<img src="/one.jpg" alt="One"><p>text</p><img alt="" src="/two.jpg"><img src="/three.jpg" alt="">',
    );
  });

  it("does not mistake data-alt (or similar names) for a real alt", () => {
    expect(ensureImgAlt('<img src="/a.jpg" data-alt="nope">')).toBe(
      '<img alt="" src="/a.jpg" data-alt="nope">',
    );
    expect(ensureImgAlt('<img src="/a.jpg" xalt="nope" altx="nope">')).toBe(
      '<img alt="" src="/a.jpg" xalt="nope" altx="nope">',
    );
  });

  it("respects a quoted attribute value containing '>' before a real alt", () => {
    const html = '<img src="/a.jpg" title="a > b" alt="Chart">';
    expect(ensureImgAlt(html)).toBe(html);
  });

  it("injects alt when a quoted value merely contains the text alt=", () => {
    expect(ensureImgAlt('<img src="/a.jpg?x=alt%3Dfoo" title="use alt= here">')).toBe(
      '<img alt="" src="/a.jpg?x=alt%3Dfoo" title="use alt= here">',
    );
  });

  it("handles unquoted and valueless attributes", () => {
    expect(ensureImgAlt("<img src=/a.jpg hidden>")).toBe('<img alt="" src=/a.jpg hidden>');
    const withAlt = "<img src=/a.jpg alt=lake hidden>";
    expect(ensureImgAlt(withAlt)).toBe(withAlt);
  });

  it("does not touch other tags or text mentioning img", () => {
    const html = "<p>use an &lt;img&gt; tag</p><em>img</em>";
    expect(ensureImgAlt(html)).toBe(html);
  });
});
