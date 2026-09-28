import { ReactNode } from "react";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { useLocation } from "wouter";

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen flex flex-col w-full selection:bg-primary selection:text-primary-foreground">
      <Navbar />
      {/* Keyed on location so the CSS entrance animation replays on route
          change — same fade/slide the old framer-motion <motion.main> did,
          without shipping the animation library on first load. */}
      <main key={location} className="flex-1 w-full animate-page-enter">
        {children}
      </main>
      <Footer />
    </div>
  );
}
