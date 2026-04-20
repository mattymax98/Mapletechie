import { Link } from "wouter";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SiX, SiGithub, SiDiscord, SiYoutube } from "react-icons/si";
import { useSubmitContact } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

export function Footer() {
  const [email, setEmail] = useState("");
  const { toast } = useToast();
  const submit = useSubmitContact();

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast({ title: "Enter a valid email", variant: "destructive" });
      return;
    }
    submit.mutate(
      {
        data: {
          name: "Newsletter Signup",
          email: trimmed,
          subject: "Newsletter Signup",
          message: `New newsletter signup: ${trimmed}`,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "You're in.", description: "Thanks for subscribing — we'll be in touch." });
          setEmail("");
        },
        onError: () => {
          toast({ title: "Something went wrong", description: "Please try again in a moment.", variant: "destructive" });
        },
      }
    );
  };

  return (
    <footer className="border-t border-border bg-card mt-20">
      <div className="container mx-auto px-4 md:px-6 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          <div className="md:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <span className="flex items-center gap-2"><img src={`${import.meta.env.BASE_URL}logo-icon.png`} alt="Mapletechies logo" className="h-9 w-9 object-contain" /><span className="text-2xl font-bold uppercase tracking-tighter text-primary">MAPLE<span className="text-foreground">TECHIES</span></span></span>
            </Link>
            <p className="text-muted-foreground text-sm mb-6 max-w-xs">
              The premier destination for tech news, gadget reviews, and deep dives into the future of software and hardware.
            </p>
            <div className="flex items-center gap-4">
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors"><SiX className="h-5 w-5" /></a>
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors"><SiYoutube className="h-5 w-5" /></a>
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors"><SiGithub className="h-5 w-5" /></a>
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors"><SiDiscord className="h-5 w-5" /></a>
            </div>
          </div>
          
          <div>
            <h4 className="font-bold uppercase tracking-wider mb-4 text-sm">Sections</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link href="/blog" className="hover:text-primary transition-colors">Latest News</Link></li>
              <li><Link href="/category/reviews" className="hover:text-primary transition-colors">Article Reviews</Link></li>
              <li><Link href="/category/software" className="hover:text-primary transition-colors">Software</Link></li>
              <li><Link href="/shop" className="hover:text-primary transition-colors">Gear</Link></li>
              <li><Link href="/reviews" className="hover:text-primary transition-colors">Reader Reviews</Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-bold uppercase tracking-wider mb-4 text-sm">Company</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link href="/about" className="hover:text-primary transition-colors">About Us</Link></li>
              <li><Link href="/contact" className="hover:text-primary transition-colors">Contact</Link></li>
              <li><Link href="/advertise" className="hover:text-primary transition-colors">Advertise</Link></li>
              <li><Link href="/careers" className="hover:text-primary transition-colors">Careers</Link></li>
            </ul>
          </div>
          
          <div id="newsletter" className="scroll-mt-24">
            <h4 className="font-bold uppercase tracking-wider mb-4 text-sm">Newsletter</h4>
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
          <p>&copy; {new Date().getFullYear()} Mapletechies Media. All rights reserved.</p>
          <div className="flex gap-4 mt-4 md:mt-0">
            <a href="#" className="hover:text-foreground transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-foreground transition-colors">Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
