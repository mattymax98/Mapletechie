import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Mail, Twitter, Linkedin, Instagram, Github, Globe } from "lucide-react";
import { useGetAuthor, getGetAuthorQueryKey } from "@workspace/api-client-react";

interface AuthorBioProps {
  variant?: "card" | "inline";
  authorId?: number | null;
  fallbackName?: string;
  fallbackAvatar?: string | null;
}

export function AuthorBio({ variant = "card", authorId, fallbackName, fallbackAvatar }: AuthorBioProps) {
  const { data: author } = useGetAuthor(authorId ?? 0, {
    query: { enabled: !!authorId, queryKey: getGetAuthorQueryKey(authorId ?? 0) },
  });

  const displayName = author?.displayName ?? fallbackName ?? "Mapletechie";
  const avatarUrl = author?.avatarUrl ?? fallbackAvatar ?? `${import.meta.env.BASE_URL}author-matthew.png`;
  const bio = author?.bio ?? "Editor at Mapletechie — covering AI, electric vehicles, cybersecurity, and consumer gadgets.";

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
          <p className="text-xs text-muted-foreground">Editor, Mapletechie</p>
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
      <div className="flex flex-col md:flex-row gap-6 items-start">
        <img
          src={avatarUrl}
          alt={displayName}
          className="w-24 h-24 md:w-32 md:h-32 rounded-full object-cover border-2 border-primary shrink-0"
        />
        <div className="flex-1">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Written by</p>
          <h3 className="text-2xl font-black uppercase tracking-tight mb-3">{displayName}</h3>
          <p className="text-muted-foreground leading-relaxed mb-4">{bio}</p>
          <div className="flex flex-wrap gap-2 items-center">
            <Button asChild variant="outline" size="sm" className="rounded-none uppercase tracking-wider text-xs">
              <Link href="/about">About Mapletechie</Link>
            </Button>
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
        </div>
      </div>
    </aside>
  );
}
