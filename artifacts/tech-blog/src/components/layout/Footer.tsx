import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SiX, SiGithub, SiDiscord, SiYoutube } from "react-icons/si";

export function Footer() {
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
              <li><Link href="/category/reviews" className="hover:text-primary transition-colors">Reviews</Link></li>
              <li><Link href="/category/software" className="hover:text-primary transition-colors">Software</Link></li>
              <li><Link href="/shop" className="hover:text-primary transition-colors">Gear</Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-bold uppercase tracking-wider mb-4 text-sm">Company</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link href="/contact" className="hover:text-primary transition-colors">About Us</Link></li>
              <li><Link href="/contact" className="hover:text-primary transition-colors">Contact</Link></li>
              <li><a href="#" className="hover:text-primary transition-colors">Advertise</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">Careers</a></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-bold uppercase tracking-wider mb-4 text-sm">Newsletter</h4>
            <p className="text-muted-foreground text-sm mb-4">Get the latest tech news delivered to your inbox daily. No spam, just signal.</p>
            <form className="flex gap-2" onSubmit={(e) => e.preventDefault()}>
              <Input type="email" placeholder="Your email" className="rounded-none bg-background" />
              <Button type="submit" className="rounded-none font-bold uppercase tracking-wider">Join</Button>
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
