import { Link } from "wouter";
import { Fragment } from "react";
import { cn } from "@/lib/utils";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

/**
 * Shared visible breadcrumb trail (Home / Blog / …).
 * Crumbs with an href render as links; the last crumb (or any crumb
 * without an href) renders as plain foreground text.
 */
export function Breadcrumbs({
  items,
  className,
}: {
  items: BreadcrumbItem[];
  className?: string;
}) {
  return (
    <nav
      className={cn(
        "flex items-center gap-2 text-xs uppercase tracking-widest font-bold text-muted-foreground mb-6",
        className,
      )}
      aria-label="Breadcrumb"
    >
      {items.map((item, i) => (
        <Fragment key={`${item.label}-${i}`}>
          {i > 0 && <span>/</span>}
          {item.href ? (
            <Link href={item.href} className="hover:text-primary">
              {item.label}
            </Link>
          ) : (
            <span className="text-foreground">{item.label}</span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
