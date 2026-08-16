import Link from "next/link";
import { ChevronRight } from "lucide-react";

export type DashboardBreadcrumbItem = {
  label: string;
  href?: string;
};

export function DashboardBreadcrumbs({
  items,
  className = "",
}: {
  items: DashboardBreadcrumbItem[];
  className?: string;
}) {
  const visibleItems = items.filter((item) => item.label.trim().length > 0);
  if (visibleItems.length === 0) return null;

  return (
    <nav aria-label="Brödsmulor" className={className}>
      <ol className="flex min-w-0 flex-wrap items-center gap-1.5 text-[12px] font-medium text-ink-500 sm:gap-2">
        {visibleItems.map((item, index) => {
          const isCurrent = index === visibleItems.length - 1;
          return (
            <li key={`${item.href || "current"}-${item.label}`} className="flex min-w-0 items-center gap-1.5 sm:gap-2">
              {index > 0 ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-300" strokeWidth={1.7} aria-hidden="true" /> : null}
              {item.href && !isCurrent ? (
                <Link
                  href={item.href}
                  className="max-w-[220px] truncate rounded-sm outline-none transition-colors hover:text-petroleum-800 focus-visible:ring-2 focus-visible:ring-petroleum-200 focus-visible:ring-offset-2"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={`max-w-[280px] truncate ${isCurrent ? "font-semibold text-ink-700" : "text-ink-500"}`}
                  aria-current={isCurrent ? "page" : undefined}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
