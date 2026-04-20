import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";
import { Mail, ArrowRight } from "lucide-react";

const BELIEFS = [
  { n: "01", t: "Reviews from use, not from press kits.", d: "Every product we cover gets actual time in our hands. If we haven't used it, we don't review it." },
  { n: "02", t: "An opinion is the point.", d: "If a product is overpriced, we say so. If a launch is forgettable, we won't pretend otherwise to keep access." },
  { n: "03", t: "Plain language, every time.", d: "Tech writing has a jargon problem. We translate, we explain, and we never assume you'll Google a buzzword to follow along." },
  { n: "04", t: "Independence, on principle.", d: "No paid placements dressed up as articles. Affiliate links are disclosed. Editorial decisions are not for sale." },
];

export default function About() {
  return (
    <div className="w-full">
      <SEO
        title="About Mapletechies"
        description="Mapletechies is an independent tech publication founded by Matthew Mbaka — covering AI, EVs, cybersecurity, and gadgets without the press-release filter."
        url="/about"
      />

      {/* HERO */}
      <section className="relative border-b border-border bg-background">
        <div className="container mx-auto px-4 md:px-6 py-12 md:py-20">
          <div className="flex items-center gap-3 mb-5">
            <span className="inline-block w-8 h-px bg-primary" />
            <span className="text-[11px] uppercase tracking-[0.25em] font-bold text-primary">About the publication</span>
          </div>
          <h1 className="font-serif font-black tracking-tight leading-[0.95] text-5xl sm:text-6xl md:text-7xl max-w-4xl">
            We started this because the internet didn't need <span className="italic text-primary">another</span> tech blog.
          </h1>
          <p className="mt-6 max-w-3xl text-lg md:text-xl text-muted-foreground leading-relaxed">
            It needed one that <span className="text-foreground font-medium">actually had a point of view</span>.
          </p>
        </div>
      </section>

      {/* THE STORY */}
      <section className="container mx-auto px-4 md:px-6 py-14 md:py-20 max-w-4xl">
        <p className="text-xs uppercase tracking-[0.25em] font-bold text-primary mb-3">The story</p>
        <h2 className="font-serif text-3xl md:text-4xl font-black tracking-tight leading-[1.1] mb-8">
          Most tech coverage is the same article, written a hundred times.
        </h2>
        <div className="space-y-6 text-lg leading-relaxed text-muted-foreground">
          <p>
            A company holds a launch event. Outlets receive a press kit, a briefing, and an embargo. Within hours, a hundred articles appear — all hitting the same talking points, all praising the same features, all using the same adjectives the marketing team handed them. It's not journalism. It's coordinated repetition.
          </p>
          <p className="text-foreground">
            <span className="font-serif italic text-2xl text-primary">Mapletechies</span> exists to do something different.
          </p>
          <p>
            We cover the technology shaping our daily lives — AI, electric vehicles, cybersecurity, gadgets, and the software underneath it all — but we cover it like readers, not like a wire service. We test things ourselves. We say when something is overpriced. We point out when an "innovation" is mostly marketing. And when something is genuinely good, we explain <span className="text-foreground italic">why</span>, not just <span className="text-foreground italic">that</span>.
          </p>
          <p>
            We're new. The archive is small. But the standard is high, and we're not in any rush to grow it by lowering it.
          </p>
        </div>
      </section>

      {/* WHAT WE BELIEVE */}
      <section className="border-y border-border bg-card/30">
        <div className="container mx-auto px-4 md:px-6 py-16 md:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-4">
              <p className="text-xs uppercase tracking-[0.25em] font-bold text-primary mb-3">What we believe</p>
              <h2 className="font-serif text-4xl md:text-5xl font-black leading-[1.05] tracking-tight">
                Four rules. <span className="italic text-primary">No exceptions.</span>
              </h2>
            </div>
            <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-10">
              {BELIEFS.map((b) => (
                <div key={b.n} className="flex gap-4">
                  <span className="font-serif text-3xl font-black text-primary leading-none w-12 shrink-0">{b.n}</span>
                  <div>
                    <h3 className="font-bold text-lg mb-1">{b.t}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">{b.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* THE EDITOR */}
      <section className="container mx-auto px-4 md:px-6 py-16 md:py-20 max-w-5xl">
        <p className="text-xs uppercase tracking-[0.25em] font-bold text-primary mb-3">The editor</p>
        <h2 className="font-serif text-4xl md:text-5xl font-black leading-[1.05] tracking-tight mb-12">
          Run by <span className="italic text-primary">one person</span>, with help.
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-14">
          <div className="md:col-span-1">
            <img
              src={`${import.meta.env.BASE_URL}author-matthew.png`}
              alt="Matthew Mbaka"
              className="w-full aspect-square object-cover border border-border"
            />
            <div className="mt-5">
              <h3 className="font-serif text-2xl font-black leading-tight">Matthew Mbaka</h3>
              <p className="text-sm uppercase tracking-wider text-muted-foreground font-bold mt-1">Founding editor</p>
              <a href="mailto:hello@mapletechies.com" className="mt-3 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
                <Mail className="w-4 h-4" /> hello@mapletechies.com
              </a>
            </div>
          </div>

          <div className="md:col-span-2 space-y-5 text-lg leading-relaxed text-muted-foreground">
            <p>
              I'm Matthew. I built Mapletechies because I'd spent years reading tech coverage that felt increasingly hollow — review scores you couldn't trace back to actual testing, "exclusives" that were just press releases with the embargo lifted, and writing that read like it was generated by committee. I wanted to read something sharper. So I started writing it.
            </p>
            <p>
              I cover the things I actually use and care about: AI tools and the hype around them, the EV transition, security failures that should never have happened, and the gadgets worth your money (which is most of them — you just have to know which ones).
            </p>
            <p className="text-foreground">
              If you read something here you disagree with, write back. The site is small enough that I'll see it.
            </p>

            <div className="border-t border-border pt-8 mt-10 flex flex-wrap gap-3">
              <Button asChild className="rounded-none uppercase font-bold tracking-wider">
                <Link href="/contact">Get in touch <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
              <Button asChild variant="outline" className="rounded-none uppercase font-bold tracking-wider border-2">
                <Link href="/blog">Read the latest</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
