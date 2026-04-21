import { Link, useLocation } from "wouter";
import { useListCategories } from "@workspace/api-client-react";
import { Moon, Sun, Menu, X, Search, Monitor, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "next-themes";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function Navbar() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [themeReady, setThemeReady] = useState(false);
  useEffect(() => { setThemeReady(true); }, []);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [location] = useLocation();
  
  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location]);

  const { data: categories } = useListCategories();
  const [, navigate] = useLocation();

  const scrollToNewsletter = () => {
    const el = document.getElementById("newsletter");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => {
        const input = el.querySelector<HTMLInputElement>("input[type=email]");
        input?.focus();
      }, 600);
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md">
      <div className="container mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <img
              src={`${import.meta.env.BASE_URL}logo-icon.png`}
              alt="Mapletechies logo"
              className="h-8 w-8 object-contain"
            />
            <span className="text-xl font-bold uppercase tracking-tighter text-primary">MAPLE<span className="text-foreground">TECHIES</span></span>
          </Link>
          
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            <Link href="/" className={`hover:text-primary transition-colors ${location === '/' ? 'text-primary' : 'text-foreground'}`}>Home</Link>
            <Link href="/blog" className={`hover:text-primary transition-colors ${location.startsWith('/blog') ? 'text-primary' : 'text-foreground'}`}>Latest</Link>
            {categories?.slice(0, 3).map(cat => (
              <Link key={cat.id} href={`/category/${cat.slug}`} className={`hover:text-primary transition-colors ${location === `/category/${cat.slug}` ? 'text-primary' : 'text-foreground'}`}>
                {cat.name}
              </Link>
            ))}
            <Link href="/shop" className={`hover:text-primary transition-colors ${location === '/shop' ? 'text-primary' : 'text-foreground'}`}>Gear</Link>
            <Link href="/about" className={`hover:text-primary transition-colors ${location === '/about' ? 'text-primary' : 'text-foreground'}`}>About</Link>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:flex"
            onClick={() => navigate("/search")}
            aria-label="Search"
            data-testid="button-search"
          >
            <Search className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Toggle theme" data-testid="button-theme">
                {themeReady && resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[140px]">
              {([
                { id: 'light', label: 'Light', Icon: Sun },
                { id: 'dark', label: 'Dark', Icon: Moon },
                { id: 'system', label: 'System', Icon: Monitor },
              ] as const).map(({ id, label, Icon }) => (
                <DropdownMenuItem
                  key={id}
                  onClick={() => setTheme(id)}
                  className="gap-2 cursor-pointer"
                  data-testid={`theme-${id}`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="flex-1">{label}</span>
                  {themeReady && theme === id && <Check className="h-3.5 w-3.5 opacity-70" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="default"
            className="hidden md:flex font-bold rounded-none uppercase tracking-wider text-xs px-6"
            onClick={scrollToNewsletter}
            data-testid="button-subscribe"
          >
            Subscribe
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="md:hidden"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="md:hidden overflow-hidden border-b border-border bg-background"
          >
            <nav className="flex flex-col p-4 gap-4 text-sm font-bold uppercase tracking-wider">
              <Link href="/" className="py-2 border-b border-border/50">Home</Link>
              <Link href="/blog" className="py-2 border-b border-border/50">Latest Posts</Link>
              <Link href="/shop" className="py-2 border-b border-border/50">Gear & Shop</Link>
              <Link href="/about" className="py-2 border-b border-border/50">About</Link>
              <Link href="/contact" className="py-2 border-b border-border/50">Contact Us</Link>
              <Button className="w-full mt-4 rounded-none" onClick={scrollToNewsletter}>Subscribe Now</Button>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
