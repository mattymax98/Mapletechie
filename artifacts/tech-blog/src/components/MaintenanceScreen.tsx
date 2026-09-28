import { Helmet } from "react-helmet-async";
import { Wrench, Coffee } from "lucide-react";

/**
 * Full-screen maintenance page shown to the public while the site is in
 * maintenance mode. On-brand: dark background, orange accent, Fraunces display
 * + Inter body. Tone is light but mature — we're down on purpose, not on fire.
 */
export function MaintenanceScreen({
  message,
  eta,
}: {
  message?: string | null;
  eta?: string | null;
}) {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6 selection:bg-primary selection:text-primary-foreground">
      <Helmet>
        <title>We'll be right back — Mapletechie</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="w-full max-w-lg text-center animate-fade-in-up">
        <div className="flex items-baseline justify-center gap-2 leading-none mb-10">
          <span className="text-2xl font-bold tracking-tight">
            <span className="text-orange-500">MAPLE</span>TECHIE
          </span>
        </div>

        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-orange-500/10 border border-orange-500/30 mb-8 animate-wrench-wiggle">
          <Wrench className="w-9 h-9 text-orange-500" />
        </div>

        <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight mb-4">
          We're tinkering under the hood.
        </h1>

        <p className="text-zinc-400 text-base sm:text-lg leading-relaxed mb-2">
          {message?.trim()
            ? message
            : "Mapletechie is down for a bit of scheduled maintenance. The servers are getting a tune-up and we'll be back before your coffee gets cold."}
        </p>

        {eta?.trim() && (
          <p className="text-sm text-zinc-500 mt-4">
            Expected back: <span className="text-orange-400 font-medium">{eta}</span>
          </p>
        )}

        <div className="flex items-center justify-center gap-2 text-xs text-zinc-600 mt-12">
          <Coffee className="w-3.5 h-3.5" />
          <span>This page refreshes itself — no need to hit reload.</span>
        </div>
      </div>
    </div>
  );
}
