import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { Youtube, Twitter, Instagram, Music2, Cloud, AtSign, MessageCircle, Trash2 } from "lucide-react";
import {
  parseSocialUrl,
  PROVIDER_LABELS,
  type SocialProvider,
} from "@/lib/socialEmbedProviders";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    socialEmbed: {
      /** Insert a social embed block for a supported URL. Returns false for unsupported URLs. */
      setSocialEmbed: (url: string) => ReturnType;
    };
  }
}

const PROVIDER_ICONS: Record<SocialProvider, typeof Youtube> = {
  youtube: Youtube,
  twitter: Twitter,
  instagram: Instagram,
  tiktok: Music2,
  bluesky: Cloud,
  mastodon: AtSign,
  reddit: MessageCircle,
};

function EmbedPlaceholder({ node, deleteNode, selected }: NodeViewProps) {
  const provider = node.attrs["data-provider"] as SocialProvider;
  const url = node.attrs["data-url"] as string;
  const Icon = PROVIDER_ICONS[provider] ?? Twitter;
  const label = PROVIDER_LABELS[provider] ?? "Social";

  return (
    <NodeViewWrapper>
      <div
        data-testid="embed-placeholder"
        className={`my-4 flex items-center gap-3 rounded border px-4 py-3 bg-zinc-800/70 ${
          selected ? "border-orange-500" : "border-zinc-600"
        }`}
        contentEditable={false}
      >
        <Icon className="w-5 h-5 text-orange-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-100">{label} embed</p>
          <p className="text-xs text-zinc-400 truncate">{url}</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Readers will see the real {label} post here.
          </p>
        </div>
        <button
          type="button"
          title="Remove embed"
          onClick={deleteNode}
          className="p-1.5 rounded text-zinc-400 hover:text-red-400 hover:bg-zinc-700"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </NodeViewWrapper>
  );
}

/**
 * Atom block node persisted as:
 *   <div data-social-embed data-provider="youtube" data-url="https://...">
 *     <a href="https://...">https://...</a>
 *   </div>
 * The inner anchor is the no-JS / crawler / RSS fallback. The public article
 * page hydrates these divs into real embeds (see SocialEmbeds.tsx).
 */
export const SocialEmbed = Node.create({
  name: "socialEmbed",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      "data-provider": { default: null },
      "data-url": { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-social-embed]",
        getAttrs: (el) => {
          const url = (el as HTMLElement).getAttribute("data-url") || "";
          const parsed = parseSocialUrl(url);
          if (!parsed) return false;
          return { "data-provider": parsed.provider, "data-url": parsed.url };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const url = HTMLAttributes["data-url"] || "";
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-social-embed": "",
        class: "social-embed",
      }),
      ["a", { href: url, target: "_blank", rel: "noopener noreferrer" }, url],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EmbedPlaceholder);
  },

  addCommands() {
    return {
      setSocialEmbed:
        (url: string) =>
        ({ chain }) => {
          const parsed = parseSocialUrl(url);
          if (!parsed) return false;
          return chain()
            .insertContent({
              type: this.name,
              attrs: {
                "data-provider": parsed.provider,
                "data-url": parsed.url,
              },
            })
            .run();
        },
    };
  },
});
