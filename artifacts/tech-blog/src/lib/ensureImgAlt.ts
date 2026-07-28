/**
 * Guarantee every <img> in a block of editor-authored HTML carries an alt
 * attribute. Older articles saved images without one, and crawlers (Bing's
 * Site Scan in particular) flag them as accessibility/SEO problems.
 *
 * Images that already have an alt — even an explicit empty alt="" — are left
 * untouched. Images without one get a safe empty alt="" (treated as
 * decorative by screen readers), which clears the warning without inventing
 * wrong descriptions. Editors can still add real alt text in the editor.
 *
 * Implementation notes: this is a small tokenizer rather than a single
 * regex, so it correctly handles quoted attribute values that contain `>`
 * and does NOT mistake attribute names like `data-alt` for a real `alt`.
 *
 * Used by BOTH the crawler prerender server and the client article renderer
 * so bots and browsers see the same markup.
 */

/** Find the index just past the closing `>` of a tag starting at `start`
 *  (which points at `<`), respecting quoted attribute values. Returns -1 if
 *  the tag never closes. */
function findTagEnd(html: string, start: number): number {
  let quote: string | null = null;
  for (let i = start + 1; i < html.length; i++) {
    const ch = html[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ">") {
      return i + 1;
    }
  }
  return -1;
}

/** Read the `alt` attribute value from a tag (e.g. `<img src="a" alt="b">`),
 *  matching whole attribute names only, so `data-alt` or a quoted value
 *  containing `alt=` never counts. Returns `null` when there is no alt
 *  attribute at all; returns "" for a valueless or explicitly empty alt. */
function getAltAttribute(tag: string): string | null {
  // Walk attributes: skip past "<img", then repeatedly read name[=value].
  let i = 4; // length of "<img"
  const len = tag.length;
  while (i < len) {
    // Skip whitespace and stray slashes (self-closing).
    while (i < len && /[\s/]/.test(tag[i])) i++;
    if (i >= len || tag[i] === ">") return null;
    // Read the attribute name.
    const nameStart = i;
    while (i < len && !/[\s=/>]/.test(tag[i])) i++;
    const name = tag.slice(nameStart, i).toLowerCase();
    // Skip whitespace before a possible "=".
    while (i < len && /\s/.test(tag[i])) i++;
    let value = "";
    if (tag[i] === "=") {
      i++;
      while (i < len && /\s/.test(tag[i])) i++;
      const q = tag[i];
      if (q === '"' || q === "'") {
        i++;
        const valueStart = i;
        while (i < len && tag[i] !== q) i++;
        value = tag.slice(valueStart, i);
        i++; // past the closing quote
      } else {
        const valueStart = i;
        while (i < len && !/[\s>]/.test(tag[i])) i++;
        value = tag.slice(valueStart, i);
      }
    }
    if (name === "alt") return value;
  }
  return null;
}

function hasAltAttribute(tag: string): boolean {
  return getAltAttribute(tag) !== null;
}

/**
 * Count the `<img>` tags in editor-authored HTML whose alt text is missing or
 * effectively empty (absent attribute, alt="", or whitespace/entity-only).
 * Used by the admin area to flag posts whose images still need real
 * descriptions after the automatic empty-alt backfill.
 */
export function countImagesMissingAltText(html: string): number {
  let count = 0;
  const re = /<img\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const end = findTagEnd(html, m.index);
    if (end === -1) break; // malformed tail — ignore the rest
    const alt = getAltAttribute(html.slice(m.index, end));
    // Treat &nbsp; and plain whitespace as empty — neither describes the image.
    if (alt === null || alt.replace(/&nbsp;/gi, " ").trim() === "") count++;
    re.lastIndex = end;
  }
  return count;
}

export function ensureImgAlt(html: string): string {
  let out = "";
  let pos = 0;
  const re = /<img\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const end = findTagEnd(html, m.index);
    if (end === -1) break; // malformed tail — leave the rest as-is
    const tag = html.slice(m.index, end);
    out += html.slice(pos, m.index);
    out += hasAltAttribute(tag) ? tag : tag.replace(/^<img\b/i, '<img alt=""');
    pos = end;
    re.lastIndex = end;
  }
  return out + html.slice(pos);
}
