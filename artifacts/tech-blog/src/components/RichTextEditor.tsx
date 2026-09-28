import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { probeImageDimensions, probeFileDimensions } from "@/lib/imageDimensions";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import { useEffect, useRef, useState } from "react";
import { uploadImage } from "@/lib/uploadImage";
import { SocialEmbed } from "@/components/SocialEmbedExtension";
import { parseSocialUrl } from "@/lib/socialEmbedProviders";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code2,
  Link as LinkIcon,
  Image as ImageIcon,
  ImagePlus,
  Captions,
  Share2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo2,
  Redo2,
  Eraser,
} from "lucide-react";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

function ToolbarButton({
  active,
  disabled,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-2 rounded transition-colors ${
        active
          ? "bg-orange-500 text-white"
          : "text-zinc-300 hover:bg-zinc-700 hover:text-white"
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

/**
 * Image node that also carries width/height attributes. The editor stamps
 * natural pixel dimensions on insert so article pages can reserve the right
 * space before each image loads (no layout shift while scrolling). Existing
 * images without dimensions keep working — the attributes just stay absent.
 */
const SizedImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: { default: null },
      height: { default: null },
      // Always emit an alt attribute (empty when the editor skipped the
      // prompt) so saved content never ships an <img> without alt — search
      // engines flag those as accessibility problems.
      alt: { default: "" },
    };
  },
});

type ImageAttrs = {
  src: string;
  alt?: string;
  title?: string;
  width?: number;
  height?: number;
};

/**
 * Insert an image node, including width/height when known. `pos` is the
 * document position captured when the user triggered the insert — async
 * probing/uploading resolves later, and inserting at the captured position
 * keeps the image where the user asked for it even if they kept typing.
 * No-ops safely if the editor was torn down while the async work ran.
 */
function insertSizedImage(editor: Editor, attrs: ImageAttrs, pos?: number) {
  if (editor.isDestroyed) return;
  const chain = editor.chain().focus();
  if (pos != null) {
    const clamped = Math.min(pos, editor.state.doc.content.size);
    chain.insertContentAt(clamped, { type: "image", attrs }).run();
  } else {
    chain.insertContent({ type: "image", attrs }).run();
  }
}

function Divider() {
  return <span className="w-px bg-zinc-700 mx-1 self-stretch" />;
}

function Toolbar({ editor }: { editor: Editor }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const promptForLink = () => {
    const previous = editor.getAttributes("link").href;
    const url = window.prompt("Enter URL (leave blank to remove link)", previous ?? "");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    const safe = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    editor.chain().focus().extendMarkRange("link").setLink({ href: safe }).run();
  };

  const promptForImageUrl = () => {
    const url = window.prompt("Paste a direct image URL (must end in .jpg, .png, .webp, .gif, or .avif)");
    if (!url) return;
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      alert("Image URL must start with http:// or https://");
      return;
    }
    const looksLikeImage = /\.(jpe?g|png|webp|gif|avif|svg)(\?.*)?$/i.test(trimmed);
    if (!looksLikeImage) {
      const proceed = window.confirm(
        "That doesn't look like a direct image link — it looks like a page URL (e.g. a tweet, article, or video).\n\nIf you wanted to insert a link to that page, cancel and use the Link button (chain icon) instead.\n\nInsert it as an image anyway?",
      );
      if (!proceed) return;
    }
    const alt = window.prompt("Image description / alt text") || "";
    const caption = window.prompt("Image caption (optional)") || "";
    const pos = editor.state.selection.from;
    void probeImageDimensions(trimmed).then((dims) => {
      insertSizedImage(editor, { src: trimmed, alt, title: caption, ...(dims ?? {}) }, pos);
    });
  };

  // Edit the alt text of the currently selected image without re-inserting
  // it. Enabled only when an image node is selected.
  const promptForAltText = () => {
    const current = editor.getAttributes("image").alt ?? "";
    const alt = window.prompt(
      "Image description / alt text (what a screen-reader user should hear)",
      current,
    );
    if (alt === null) return;
    editor.chain().focus().updateAttributes("image", { alt: alt.trim() }).run();
  };

  const promptForEmbed = () => {
    const url = window.prompt(
      "Paste a link to a post on X (Twitter), YouTube, Instagram, or TikTok",
    );
    if (!url) return;
    const ok = editor.chain().focus().setSocialEmbed(url.trim()).run();
    if (!ok) {
      alert(
        "That link isn't supported for embeds. Supported: X/Twitter posts, YouTube videos, Instagram posts/reels, TikTok videos.",
      );
    }
  };

  const onPickImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    const pos = editor.state.selection.from;
    try {
      const [{ url }, dims] = await Promise.all([uploadImage(file), probeFileDimensions(file)]);
      const alt = window.prompt("Image description / alt text", file.name) || file.name;
      const caption = window.prompt("Image caption (optional)") || "";
      insertSizedImage(editor, { src: url, alt, title: caption, ...(dims ?? {}) }, pos);
    } catch (err: any) {
      alert(err?.message ?? "Image upload failed.");
    } finally {
      setUploadingImage(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 p-2 border-b border-zinc-700 bg-zinc-800/60 sticky top-0 z-10">
      <ToolbarButton title="Bold (Ctrl+B)" onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")}>
        <Bold className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton title="Italic (Ctrl+I)" onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")}>
        <Italic className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton title="Underline (Ctrl+U)" onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")}>
        <UnderlineIcon className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton title="Strikethrough" onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")}>
        <Strikethrough className="w-4 h-4" />
      </ToolbarButton>

      <Divider />

      <ToolbarButton title="Section heading (large)" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })}>
        <Heading2 className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton title="Sub-heading" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })}>
        <Heading3 className="w-4 h-4" />
      </ToolbarButton>

      <Divider />

      <ToolbarButton title="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")}>
        <List className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton title="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")}>
        <ListOrdered className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton title="Quote" onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")}>
        <Quote className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton title="Code block" onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive("codeBlock")}>
        <Code2 className="w-4 h-4" />
      </ToolbarButton>

      <Divider />

      <ToolbarButton title="Align left" onClick={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })}>
        <AlignLeft className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton title="Align center" onClick={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })}>
        <AlignCenter className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton title="Align right" onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })}>
        <AlignRight className="w-4 h-4" />
      </ToolbarButton>

      <Divider />

      <ToolbarButton title="Insert / edit link" onClick={promptForLink} active={editor.isActive("link")}>
        <LinkIcon className="w-4 h-4" />
      </ToolbarButton>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={onPickImageFile}
        className="hidden"
      />
      <ToolbarButton
        title={uploadingImage ? "Uploading image..." : "Upload image from device"}
        onClick={() => fileRef.current?.click()}
        disabled={uploadingImage}
      >
        <ImageIcon className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton title="Insert image by direct URL (must be a .jpg/.png/.webp file, not a tweet or article link)" onClick={promptForImageUrl}>
        <ImagePlus className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        title={
          editor.isActive("image")
            ? "Edit alt text of the selected image"
            : "Edit alt text (select an image first)"
        }
        onClick={promptForAltText}
        disabled={!editor.isActive("image")}
      >
        <Captions className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton title="Embed a social post (X/Twitter, YouTube, Instagram, TikTok) — or just paste the link" onClick={promptForEmbed}>
        <Share2 className="w-4 h-4" />
      </ToolbarButton>

      <Divider />

      <ToolbarButton title="Clear formatting" onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}>
        <Eraser className="w-4 h-4" />
      </ToolbarButton>

      <Divider />

      <ToolbarButton title="Undo (Ctrl+Z)" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
        <Undo2 className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton title="Redo (Ctrl+Shift+Z)" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
        <Redo2 className="w-4 h-4" />
      </ToolbarButton>
    </div>
  );
}

export function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const [dropping, setDropping] = useState(false);

  const insertImageFile = async (file: File, ed: Editor) => {
    if (!file.type.startsWith("image/")) return;
    setDropping(true);
    const pos = ed.state.selection.from;
    try {
      const [{ url }, dims] = await Promise.all([uploadImage(file), probeFileDimensions(file)]);
      insertSizedImage(ed, { src: url, alt: file.name, ...(dims ?? {}) }, pos);
    } catch (err: any) {
      alert(err?.message ?? "Image upload failed.");
    } finally {
      setDropping(false);
    }
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      SizedImage.configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: {
          class: "max-w-full h-auto",
        },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({
        placeholder: placeholder ?? "Write your article here...",
      }),
      SocialEmbed,
    ],
    content: value || "",
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "tiptap prose prose-invert prose-zinc max-w-none focus:outline-none min-h-[400px] px-4 py-3 text-zinc-100 prose-headings:text-white prose-a:text-orange-400 prose-strong:text-white prose-blockquote:border-orange-500 prose-blockquote:text-zinc-300 prose-code:text-orange-300",
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const files = Array.from((event as DragEvent).dataTransfer?.files ?? []);
        const images = files.filter((f) => f.type.startsWith("image/"));
        if (images.length === 0) return false;
        event.preventDefault();
        const ed = (view as any).editor as Editor | undefined;
        const target = ed ?? (editor as Editor);
        images.forEach((f) => insertImageFile(f, target));
        return true;
      },
      handlePaste: (_view, event) => {
        // Pasting a bare social URL becomes an embed block.
        const text = event.clipboardData?.getData("text/plain")?.trim() ?? "";
        if (text && !/\s/.test(text) && parseSocialUrl(text) && editor) {
          event.preventDefault();
          editor.chain().focus().setSocialEmbed(text).run();
          return true;
        }
        const items = Array.from(event.clipboardData?.items ?? []);
        const imageItems = items.filter((i) => i.kind === "file" && i.type.startsWith("image/"));
        if (imageItems.length === 0) return false;
        event.preventDefault();
        imageItems.forEach((i) => {
          const f = i.getAsFile();
          if (f && editor) insertImageFile(f, editor);
        });
        return true;
      },
    },
  });

  // Sync external value changes (e.g. when an existing post loads)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value && value !== current) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor) {
    return (
      <div className="border border-zinc-700 rounded bg-zinc-900 min-h-[400px] flex items-center justify-center text-zinc-500">
        Loading editor...
      </div>
    );
  }

  return (
    <div className="border border-zinc-700 rounded bg-zinc-900 overflow-hidden focus-within:border-orange-500 transition-colors relative">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
      {dropping && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-orange-300 text-sm font-medium pointer-events-none">
          Uploading image…
        </div>
      )}
    </div>
  );
}
