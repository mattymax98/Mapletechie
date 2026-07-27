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
  authorId?: number | null;
  fallbackName?: string;
  fallbackAvatar?: string | null;
}

/**
 * Compact Verge-style byline: small round photo + name + short role, meant to
 * sit right under the article cover image. Clicking the name opens the
 * author's bio dialog (photo, bio text, socials if they have any).
 */
export function AuthorBio({ authorId, fallbackName, fallbackAvatar }: AuthorBioProps) {
  const [bioOpen, setBioOpen] = useState(false);

  const { data: author } = useGetAuthor(authorId ?? 0, {
    query: { enabled: !!authorId, queryKey: getGetAuthorQueryKey(authorId ?? 0) },
  });

  const displayName = author?.displayName || fallbackName || "Mapletechie";
  const avatarUrl = author?.avatarUrl || fallbackAvatar || `${import.meta.env.BASE_URL}author-matthew.webp`;
  const jobTitle = author?.jobTitle?.trim() || "Editor, Mapletechie";
  const bio = author?.bio?.trim() || "Editor at Mapletechie — covering AI, electric vehicles, cybersecurity, and consumer gadgets.";

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
    <div className="flex items-center gap-3" data-testid="compact-byline">
      <img
        src={avatarUrl}
        alt={displayName}
        className="w-9 h-9 rounded-full object-cover border border-border shrink-0"
      />
      <div className="leading-tight">
        <button
          type="button"
          onClick={() => setBioOpen(true)}
          className="text-sm font-bold uppercase tracking-wider hover:text-primary transition-colors text-left"
          data-testid="button-author-name"
        >
          {displayName}
        </button>
        <p className="text-xs text-muted-foreground">{jobTitle}</p>
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
    </div>
  );
}
