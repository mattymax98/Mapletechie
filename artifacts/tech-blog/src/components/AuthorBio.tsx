import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Mail, Twitter, Linkedin, Instagram, Github, Globe } from "lucide-react";
import { useGetAuthor, getGetAuthorQueryKey } from "@workspace/api-client-react";

interface AuthorBioProps {
  variant?: "card" | "inline";
  authorId?: number | null;
  fallbackName?: string;
  fallbackAvatar?: string | null;
}

export function AuthorBio({ variant = "card", authorId, fallbackName, fallbackAvatar }: AuthorBioProps) {
  const [bioOpen, setBioOpen] = useState(false);

  const { data: author } = useGetAuthor(authorId ?? 0, {
    query: { enabled: !!authorId, queryKey: getGetAuthorQueryKey(authorId ?? 0) },
  });

  const displayName = author?.displayName || fallbackName || "Mapletechie";
  const avatarUrl = author?.avatarUrl || fallbackAvatar || `${import.meta.env.BASE_URL}author-matthew.webp`;
  const jobTitle = author?.jobTitle?.trim() || "Editor, Mapletechie";
  const bio = author?.bio?.trim() || "Editor at Mapletechie — covering AI, electric vehicles, cybersecurity, and consumer gadgets.";

  if (variant === "inline") {
    return (
      <div className="flex items-center gap-3">
        <img
          src={avatarUrl}
          alt={displayName}
          className="w-10 h-10 rounded-full object-cover border border-border"
        />
        <div>
          <p className="text-sm font-bold uppercase tracking-wider">{displayName}</p>
          <p className="text-xs text-muted-foreground">{jobTitle}</p>
        </div>
      </div>
    );
  }

  const normalizeUrl = (raw?: string | null): string | null => {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  };

  const socials: Array<{ url: string | null; Icon: any; label: string }> = [
    { url: normalizeUrl(author?.twitterUrl), Icon: Twitter, label: "Twitter / X" },
    { url: normalizeUrl(author?.linkedinUrl), Icon: Linkedin, label: "LinkedIn" },
    { url: normalizeUrl(author?.instagramUrl), Icon: Instagram, label: "Instagram" },
    { url: normalizeUrl(author?.githubUrl), Icon: Github, label: "GitHub" },
    { url: normalizeUrl(author?.websiteUrl), Icon: Globe, label: "Website" },
  ];
  const activeSocials = socials.filter((s) => s.url) as Array<{ url: string; Icon: any; label: string }>;

  return (
    <aside className="border-t border-border pt-10 mt-12">
      <div className="flex items-center gap-5">
        <img
          src={avatarUrl}
          alt={displayName}
          className="w-16 h-16 md:w-20 md:h-20 rounded-full object-cover border-2 border-primary shrink-0"
        />
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Written by</p>
          <button
            type="button"
            onClick={() => setBioOpen(true)}
            className="text-xl md:text-2xl font-black uppercase tracking-tight hover:text-primary transition-colors text-left"
            data-testid="button-author-name"
          >
            {displayName}
          </button>
          <p className="text-sm text-muted-foreground">{jobTitle}</p>
        </div>
      </div>

      <Dialog open={bioOpen} onOpenChange={setBioOpen}>
        <DialogContent className="rounded-none max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-4 mb-2">
              <img
                src={avatarUrl}
                alt={displayName}
                className="w-16 h-16 rounded-full object-cover border-2 border-primary shrink-0"
              />
              <div className="text-left">
                <DialogTitle className="text-xl font-black uppercase tracking-tight">
                  {displayName}
                </DialogTitle>
                <DialogDescription className="text-sm">{jobTitle}</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{bio}</p>
          <div className="flex flex-wrap gap-2 items-center pt-2">
            <Button asChild variant="outline" size="sm" className="rounded-none uppercase tracking-wider text-xs gap-2">
              <a href="mailto:matthew@mapletechie.com">
                <Mail className="w-3 h-3" /> Contact
              </a>
            </Button>
            {activeSocials.map(({ url, Icon, label }) => (
              <Button key={label} asChild variant="outline" size="icon" className="rounded-none w-8 h-8" title={label}>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <Icon className="w-3.5 h-3.5" />
                </a>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
