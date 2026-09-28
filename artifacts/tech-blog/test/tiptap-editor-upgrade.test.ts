// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";

let editor: Editor | undefined;
afterEach(() => {
  editor?.destroy();
  editor = undefined;
});

describe("article editor extension compatibility", () => {
  it("opens existing HTML, edits it, and preserves links, images, alignment and underline", () => {
    editor = new Editor({
      extensions: [
        StarterKit.configure({ heading: { levels: [2, 3] }, link: false }),
        Underline,
        Link.configure({
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
        }),
        Image.configure({ inline: false, allowBase64: false }),
        TextAlign.configure({ types: ["heading", "paragraph"] }),
        Placeholder.configure({ placeholder: "Write your article here..." }),
      ],
      content:
        '<h2>Story</h2><p style="text-align: center"><a href="https://example.com">Source</a> <u>underlined</u></p><img src="https://example.com/image.png" alt="Article image">',
    });

    expect(editor.getHTML()).toContain('href="https://example.com"');
    expect(editor.getHTML()).toContain('src="https://example.com/image.png"');
    expect(editor.getHTML()).toContain('text-align: center');
    expect(editor.getHTML()).toContain("<u>underlined</u>");
    editor.commands.insertContent("<p>Updated article</p>");
    expect(editor.getHTML()).toContain("Updated article");
    expect(editor.getHTML()).toContain("<h2>Story</h2>");
  });
});