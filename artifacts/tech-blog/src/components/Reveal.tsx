import { ReactNode, useEffect, useRef, useState } from "react";

/**
 * Lightweight scroll-reveal wrapper: fades/slides children in the first time
 * they enter the viewport. CSS-transition + IntersectionObserver replacement
 * for framer-motion's `whileInView`, so the animation library stays off the
 * first-load JS path. Renders visible immediately when IntersectionObserver
 * is unavailable (old browsers, prerender).
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  /** Transition delay in milliseconds (for staggered grids). */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal-on-scroll ${revealed ? "is-revealed" : ""} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
