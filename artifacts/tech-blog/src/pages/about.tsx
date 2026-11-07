import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";
import { Mail, ArrowRight } from "lucide-react";
import { useGetFeaturedEditor } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";

const BELIEFS = [
  { n: "01", t: "Credit the source", d: "Link the original document or reporting behind an important claim." },
  { n: "02", t: "Distinguish news from opinion", d: "Make clear when a writer is reporting a finding and when they are offering an interpretation." },
  { n: "03", t: "Explain the terms", d: "Readers should be able to follow a story without already knowing the industry or its shorthand." },
  { n: "04", t: "Keep editorial decisions independent", d: "Disclose affiliate links and keep advertising separate from coverage." },
];

export default function About() {
  const { data: editor, isLoading: loadingEditor } = useGetFeaturedEditor();
  return (
    <div className="w-full">
      <SEO
        title="About Mapletechie"
        description="Founded by Matthew Mbaka, Mapletechie is an independent Canadian publication covering world news, business and technology."
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
            About Mapletechie
          </h1>
          <p className="mt-6 max-w-3xl text-lg md:text-xl text-muted-foreground leading-relaxed">
            An independent Canadian publication covering world news, business and technology.
          </p>
        </div>
      </section>

      {/* THE STORY */}
      <section className="container mx-auto px-4 md:px-6 py-14 md:py-20 max-w-4xl">
        <p className="text-xs uppercase tracking-[0.25em] font-bold text-primary mb-3">The story</p>
        <h2 className="font-serif text-3xl md:text-4xl font-black tracking-tight leading-[1.1] mb-8">
          How our coverage grew
        </h2>
        <div className="space-y-6 text-lg leading-relaxed text-muted-foreground">
          <p>Mapletechie began with technology: the products people buy, the tools they use and the decisions that shape those industries. That coverage continues in Canada Tech, Guides and Reviews.</p>
          <p>Our <Link href="/category/news" className="underline">World News</Link> section gives us room to cover elections, trade, public policy and other developments in their own right. We pay particular attention to North America, and we cover stories elsewhere when they warrant a closer look.</p>
        </div>
      </section>

      {/* WHAT WE BELIEVE */}
      <section className="border-y border-border bg-card/30">
        <div className="container mx-auto px-4 md:px-6 py-16 md:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-4">
              <p className="text-xs uppercase tracking-[0.25em] font-bold text-primary mb-3">What we believe</p>
              <h2 className="font-serif text-4xl md:text-5xl font-black leading-[1.05] tracking-tight">
                Our editorial standards
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
          Meet the founding editor
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-14">
          <div className="md:col-span-1">
            {loadingEditor ? (
              <Skeleton className="w-full aspect-square rounded-none" />
            ) : editor?.avatarUrl ? (
              <img
                src={editor.avatarUrl}
                alt={editor.displayName}
                className="w-full aspect-square object-cover border border-border"
              />
            ) : (
              <img
                src={`${import.meta.env.BASE_URL}author-matthew.webp`}
                alt={editor?.displayName || "Founding editor"}
                className="w-full aspect-square object-cover border border-border"
              />
            )}
            <div className="mt-5">
              <h3 className="font-serif text-2xl font-black leading-tight">{editor?.displayName || "Matthew Mbaka"}</h3>
              <p className="text-sm uppercase tracking-wider text-muted-foreground font-bold mt-1">Founding editor</p>
              <a href="mailto:hello@mapletechie.com" className="mt-3 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
                <Mail className="w-4 h-4" /> hello@mapletechie.com
              </a>
            </div>
          </div>

          <div className="md:col-span-2 space-y-5 text-lg leading-relaxed text-muted-foreground">
            {editor?.bio ? (
              <p className="whitespace-pre-line">{editor.bio}</p>
            ) : (
              <>
                <p>
                  I'm Matthew, Mapletechie's founding editor. I started the site in Canada and wanted its coverage to reach beyond our borders.
                </p>
                <p>
                  If there’s a story we’ve overlooked, send a tip and tell us what you think we should look into.
                </p>
              </>
            )}
            <p className="text-foreground">
              You can also contact the editorial desk with a correction or a question about a story.
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
