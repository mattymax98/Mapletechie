import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";
import { Mail, MapPin } from "lucide-react";

export default function About() {
  return (
    <div className="container mx-auto px-4 md:px-6 py-12 md:py-20 max-w-4xl">
      <SEO
        title="About Matthew Mbaka"
        description="Meet Matthew Mbaka, founder and editor of Mapletechie — covering AI, EVs, cybersecurity, and gadgets that matter."
        url="/about"
      />

      <header className="border-b border-border pb-10 mb-12">
        <p className="text-xs uppercase tracking-widest text-primary mb-4 font-bold">
          About the editor
        </p>
        <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tight leading-none">
          Matthew Mbaka
        </h1>
        <p className="text-xl text-muted-foreground mt-6 max-w-2xl">
          Founder & Editor — Mapletechie
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
        <div className="md:col-span-1">
          <img
            src={`${import.meta.env.BASE_URL}author-matthew.png`}
            alt="Matthew Mbaka"
            className="w-full aspect-square object-cover border-2 border-border"
          />
          <div className="mt-6 space-y-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="w-4 h-4" />
              <a href="mailto:matthew@mapletechie.com" className="hover:text-primary">
                matthew@mapletechie.com
              </a>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="w-4 h-4" />
              <span>Worldwide</span>
            </div>
          </div>
        </div>

        <div className="md:col-span-2 space-y-6 text-lg leading-relaxed text-muted-foreground">
          <p>
            <span className="text-foreground font-bold">Matthew Mbaka</span> is the founder
            and editor of Mapletechie. He started this publication to cut through the noise
            of modern tech coverage — fewer hot takes, more honest reviews and clear
            explanations of what the latest tools, gadgets, and breakthroughs actually mean
            for everyday people.
          </p>
          <p>
            His writing covers artificial intelligence, electric vehicles, cybersecurity,
            consumer gadgets, and the software that powers our daily lives. He believes the
            best tech journalism respects readers' time and intelligence — so every piece
            on this site is written to be useful, not viral.
          </p>
          <p>
            When he's not testing the latest device or breaking down a new AI model,
            Matthew is exploring ways to make tech more accessible to those just getting
            started.
          </p>

          <div className="border-t border-border pt-6 mt-8">
            <h2 className="text-2xl font-black uppercase tracking-tight mb-4 text-foreground">
              Get in touch
            </h2>
            <p className="mb-4">
              Story tips, partnership inquiries, or just want to say hello? I read every
              message.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild className="rounded-none uppercase font-bold tracking-wider">
                <Link href="/contact">Contact me</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-none uppercase font-bold tracking-wider">
                <Link href="/blog">Read the blog</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
