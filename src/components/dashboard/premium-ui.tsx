import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export const premiumFieldClass = "h-11 w-full rounded-xl border border-sand-200/90 bg-white px-3 text-sm text-ink-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_1px_2px_rgba(17,34,31,0.025)] outline-none transition-[border-color,box-shadow,background-color] duration-200 ease-in-out placeholder:text-ink-300 focus:border-petroleum-500 focus:ring-2 focus:ring-petroleum-100 disabled:cursor-not-allowed disabled:bg-sand-50 disabled:text-ink-500";
export const premiumTextareaClass = "min-h-24 w-full rounded-xl border border-sand-200/90 bg-white px-3 py-3 text-sm leading-6 text-ink-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_1px_2px_rgba(17,34,31,0.025)] outline-none transition-[border-color,box-shadow,background-color] duration-200 ease-in-out placeholder:text-ink-300 focus:border-petroleum-500 focus:ring-2 focus:ring-petroleum-100 disabled:cursor-not-allowed disabled:bg-sand-50";
export const premiumPrimaryButtonClass = "inline-flex h-11 items-center justify-center rounded-xl border border-petroleum-800/15 bg-petroleum-700 px-5 text-sm font-semibold text-white shadow-premium-sm transition-[background-color,border-color,box-shadow,opacity] duration-200 ease-in-out hover:bg-petroleum-800 hover:shadow-premium-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-200 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";
export const premiumSecondaryButtonClass = "inline-flex h-11 items-center justify-center rounded-xl border border-sand-200/90 bg-white px-4 text-sm font-semibold text-ink-700 shadow-[0_1px_2px_rgba(17,34,31,0.025)] transition-[background-color,border-color,color,box-shadow,opacity] duration-200 ease-in-out hover:border-sand-300 hover:bg-sand-50/80 hover:shadow-premium-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-100 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-ink-500">{eyebrow}</p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em] text-ink-900 sm:text-[34px]">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-500">{description}</p>
    </div>
    {action ? <div className="shrink-0">{action}</div> : null}
  </header>;
}

export function MetricCard({ icon: Icon, label, value, hint }: { icon?: LucideIcon; label: string; value: ReactNode; hint?: string }) {
  return <div className="rounded-2xl border border-sand-200/90 bg-white p-5 shadow-premium-sm transition-[border-color,box-shadow] duration-200 ease-in-out hover:border-sand-300/80 hover:shadow-premium-md">
    {Icon ? <Icon className="h-5 w-5 text-petroleum-700" strokeWidth={1.6} aria-hidden="true" /> : null}
    <p className={Icon ? "mt-5 text-xs font-medium text-ink-500" : "text-xs font-medium text-ink-500"}>{label}</p>
    <p className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-ink-900">{value}</p>
    {hint ? <p className="mt-2 text-xs leading-5 text-ink-500">{hint}</p> : null}
  </div>;
}

export function Panel({ title, description, children, className = "", bodyClassName = "p-6" }: { title?: string; description?: string; children: ReactNode; className?: string; bodyClassName?: string }) {
  return <section className={`overflow-hidden rounded-2xl border border-sand-200/90 bg-white shadow-premium-sm ${className}`}>
    {title ? <div className="border-b border-sand-200 px-6 py-5"><h2 className="font-display text-xl font-semibold tracking-[-0.02em] text-ink-900">{title}</h2>{description ? <p className="mt-1 text-sm leading-6 text-ink-500">{description}</p> : null}</div> : null}
    <div className={bodyClassName}>{children}</div>
  </section>;
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return <div className="flex min-h-48 flex-col items-center justify-center px-6 py-12 text-center">
    <div className="h-10 w-10 rounded-full border border-sand-200 bg-sand-50" />
    <p className="mt-4 text-sm font-semibold text-ink-700">{title}</p>
    {description ? <p className="mt-1 max-w-md text-sm leading-6 text-ink-500">{description}</p> : null}
  </div>;
}

export function InlineAlert({ children, tone = "error" }: { children: ReactNode; tone?: "error" | "success" | "info" | "warning" }) {
  const styles = tone === "error"
    ? "border-red-200 bg-red-50 text-red-800"
    : tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-sand-200 bg-sand-50 text-ink-600";
  return <p className={`rounded-xl border px-3.5 py-3 text-sm leading-5 ${styles}`}>{children}</p>;
}
