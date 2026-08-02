import { Link } from "wouter";
import { useState } from "react";
import { Rss } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSubscribeNewsletter } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

export function Footer() {
  const [email, setEmail] = useState("");
  const { toast } = useToast();
  const submit = useSubscribeNewsletter();

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast({ title: "Enter a valid email", variant: "destructive" });
      return;
    }
    submit.mutate(
      { data: { email: trimmed, source: "footer" } },
      {
        onSuccess: (res) => {
          toast({
            title: "Almost there",
            description: res?.message || "Check your inbox to confirm your subscription.",
          });
          setEmail("");
        },
        onError: () => {
          toast({
            title: "Something went wrong",
            description: "Please try again in a moment.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <footer className="border-t border-border bg-card mt-20">
      <div className="container mx-auto px-4 md:px-6 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          <div className="md:col-span-1">
            <Link href="/" className="flex items-center mb-4" aria-label="Mapletechie — home">
              <img src="/mapletechie-wordmark.svg" alt="" className="h-9 w-auto dark:hidden" />
              <img src="/mapletechie-wordmark-inverse.svg" alt="" className="h-9 w-auto hidden dark:block" />
            </Link>
            <p className="text-muted-foreground text-sm mb-6 max-w-xs">
              Independent tech journalism — sharp opinion, real reviews, and the context the spec sheets leave out.
            </p>
          </div>

          <div>
            <h2 className="font-bold uppercase tracking-wider mb-4 text-sm">Sections</h2>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link href="/blog" className="hover:text-primary transition-colors">Latest News</Link></li>
              <li><Link href="/category/ai" className="hover:text-primary transition-colors">AI</Link></li>
              <li><Link href="/category/gadgets" className="hover:text-primary transition-colors">Gadgets</Link></li>
              <li><Link href="/category/reviews" className="hover:text-primary transition-colors">Reviews</Link></li>
              <li><Link href="/category/gaming" className="hover:text-primary transition-colors">Gaming</Link></li>
            </ul>
          </div>
          
          <div>
            <h2 className="font-bold uppercase tracking-wider mb-4 text-sm">Company</h2>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link href="/about" className="hover:text-primary transition-colors">About Us</Link></li>
              <li><Link href="/team" className="hover:text-primary transition-colors">Our Team</Link></li>
              <li><Link href="/contact" className="hover:text-primary transition-colors">Contact</Link></li>
              <li><Link href="/advertise" className="hover:text-primary transition-colors">Partner with us</Link></li>
              <li><Link href="/careers" className="hover:text-primary transition-colors">Careers</Link></li>
            </ul>
          </div>
          
          <div id="newsletter" className="scroll-mt-24">
            <h2 className="font-bold uppercase tracking-wider mb-4 text-sm">Newsletter</h2>
            <p className="text-muted-foreground text-sm mb-4">Get the latest tech news delivered to your inbox daily. No spam, just signal.</p>
            <form className="flex gap-2" onSubmit={handleSubscribe}>
              <Input
                type="email"
                placeholder="Your email"
                className="rounded-none bg-background"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="input-newsletter-email"
              />
              <Button
                type="submit"
                className="rounded-none font-bold uppercase tracking-wider"
                disabled={submit.isPending}
                data-testid="button-newsletter-join"
              >
                {submit.isPending ? "…" : "Join"}
              </Button>
            </form>
          </div>
        </div>
        
        <div className="mt-12 pt-8 border-t border-border flex flex-col md:flex-row items-center justify-between text-xs text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} Mapletechie Media. All rights reserved.</p>
          <div className="flex gap-4 mt-4 md:mt-0 items-center">
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
            <a
              href="/api/feed.xml"
              className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
              data-testid="link-rss-feed"
            >
              <Rss className="w-3.5 h-3.5" aria-hidden="true" />
              RSS
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
