import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";

interface AuthorBioProps {
  variant?: "card" | "inline";
}

export function AuthorBio({ variant = "card" }: AuthorBioProps) {
  if (variant === "inline") {
    return (
      <div className="flex items-center gap-3">
        <img
          src={`${import.meta.env.BASE_URL}author-matthew.png`}
          alt="Matthew Mbaka"
          className="w-10 h-10 rounded-full object-cover border border-border"
        />
        <div>
          <p className="text-sm font-bold uppercase tracking-wider">Matthew Mbaka</p>
          <p className="text-xs text-muted-foreground">Editor & Founder, Mapletechie</p>
        </div>
      </div>
    );
  }

  return (
    <aside className="border-t border-border pt-10 mt-12">
      <div className="flex flex-col md:flex-row gap-6 items-start">
        <img
          src={`${import.meta.env.BASE_URL}author-matthew.png`}
          alt="Matthew Mbaka"
          className="w-24 h-24 md:w-32 md:h-32 rounded-full object-cover border-2 border-primary shrink-0"
        />
        <div className="flex-1">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
            Written by
          </p>
          <h3 className="text-2xl font-black uppercase tracking-tight mb-3">
            Matthew Mbaka
          </h3>
          <p className="text-muted-foreground leading-relaxed mb-4">
            Matthew is the founder and editor of Mapletechie. He covers AI, electric vehicles,
            cybersecurity, and consumer gadgets — translating complex tech into clear,
            actionable insight for readers who want to stay ahead.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="rounded-none uppercase tracking-wider text-xs">
              <Link href="/about">More about Matthew</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="rounded-none uppercase tracking-wider text-xs gap-2">
              <a href="mailto:matthew@mapletechie.com">
                <Mail className="w-3 h-3" />
                Contact
              </a>
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}
