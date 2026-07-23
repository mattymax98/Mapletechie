import { useEffect, useRef } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";

/**
 * Inline message banner that automatically scrolls itself into view whenever
 * its message appears or changes, so errors are never missed because the
 * user is scrolled further down the page.
 *
 * Renders nothing when `message` is empty.
 */
export default function ErrorBanner({
  message,
  kind = "error",
  className = "",
}: {
  message?: string | null;
  kind?: "error" | "success";
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (message) {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [message]);

  if (!message) return null;

  const styles =
    kind === "success"
      ? "text-green-400 bg-green-900/20 border-green-900"
      : "text-red-400 bg-red-900/20 border-red-900";
  const Icon = kind === "success" ? CheckCircle2 : AlertCircle;

  return (
    <div
      ref={ref}
      role="alert"
      className={`flex items-center gap-2 text-sm border rounded p-3 ${styles} ${className}`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="min-w-0 break-words">{message}</span>
    </div>
  );
}
