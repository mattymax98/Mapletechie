import { Link } from "wouter";
import { Twitter, Linkedin, Instagram, Github, Globe } from "lucide-react";
import { useListEditors } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { SEO } from "@/components/SEO";

const SOCIALS = [
  { key: "twitterUrl", Icon: Twitter, title: "Twitter / X" },
  { key: "linkedinUrl", Icon: Linkedin, title: "LinkedIn" },
  { key: "instagramUrl", Icon: Instagram, title: "Instagram" },
  { key: "githubUrl", Icon: Github, title: "GitHub" },
  { key: "websiteUrl", Icon: Globe, title: "Website" },
] as const;

export default function OurTeamPage() {
  const { data: allEditors, isLoading } = useListEditors();
  // Editors can be hidden from the masthead (Admin → Users → "Show on Our
  // Team page") without affecting their author pages or bylines.
  const editors = allEditors?.filter((m) => m.showOnTeam !== false);

  return (
    <div className="w-full">
      <SEO
        title="Our Team — Mapletechie"
        description="Meet the editors, reviewers, and writers behind Mapletechie's independent tech journalism."
        url="/team"
      />

      <div className="bg-card border-b border-border py-16 md:py-20">
        <div className="container mx-auto px-4 md:px-6 max-w-5xl">
          <p className="text-primary uppercase tracking-widest text-sm font-bold mb-2">
            The Masthead
          </p>
          <h1 className="font-black text-4xl md:text-6xl tracking-tight mb-4">
            Our Team
          </h1>
          <p className="text-lg text-muted-foreground font-serif leading-relaxed max-w-2xl">
            The editors, reviewers, and writers behind Mapletechie — sharp opinion,
            real reviews, and the context the spec sheets leave out.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 md:px-6 max-w-6xl py-16">
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="border border-border p-6 flex flex-col items-center text-center">
                <Skeleton className="w-24 h-24 rounded-full mb-4" />
                <Skeleton className="w-32 h-5 mb-2" />
                <Skeleton className="w-full h-4" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && editors && editors.length === 0 && (
          <div className="border border-dashed border-border p-10 text-center">
            <p className="text-lg font-bold mb-1">No team members yet.</p>
            <p className="text-muted-foreground text-sm">Check back soon.</p>
          </div>
        )}

        {!isLoading && editors && editors.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {editors.map((m) => {
              const socials = SOCIALS.filter(
                (s) => !!m[s.key] && String(m[s.key]).trim() !== "",
              );
              const href = m.username ? `/author/${m.username}` : null;
              const avatar = (
                <div className="w-24 h-24 bg-muted rounded-full overflow-hidden border border-border mb-4 shrink-0">
                  {m.avatarUrl ? (
                    <img
                      src={m.avatarUrl}
                      alt={m.displayName}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-3xl font-black bg-primary/10 text-primary">
                      {m.displayName.charAt(0)}
                    </div>
                  )}
                </div>
              );
              return (
                <div
                  key={m.id}
                  className="group h-full border border-border hover:border-primary transition-colors p-6 flex flex-col items-center text-center bg-background"
                >
                  {href ? (
                    <Link href={href} className="hover:opacity-90 transition-opacity" aria-label={`${m.displayName}'s profile`}>
                      {avatar}
                    </Link>
                  ) : (
                    avatar
                  )}
                  {m.role === "admin" && (
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-primary text-primary-foreground mb-2">
                      Founding Editor
                    </span>
                  )}
                  <h2 className="text-xl font-black tracking-tight">
                    {href ? (
                      <Link href={href} className="hover:text-primary transition-colors">
                        {m.displayName}
                      </Link>
                    ) : (
                      m.displayName
                    )}
                  </h2>
                  {typeof m.postCount === "number" && (
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
                      {m.postCount} {m.postCount === 1 ? "story" : "stories"}
                    </p>
                  )}
                  {m.bio && (
                    <p className="text-sm text-muted-foreground font-serif leading-relaxed line-clamp-4 mb-4">
                      {m.bio}
                    </p>
                  )}
                  {socials.length > 0 && (
                    <div className="flex gap-2 mt-auto pt-2">
                      {socials.map((s) => (
                        <a
                          key={s.key}
                          href={String(m[s.key])}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`${m.displayName} on ${s.title}`}
                          className="text-muted-foreground hover:text-primary transition-colors"
                        >
                          <s.Icon className="h-4 w-4" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
