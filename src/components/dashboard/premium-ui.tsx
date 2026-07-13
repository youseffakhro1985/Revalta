import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export const premiumFieldClass = "h-11 w-full rounded-xl border border-sand-200 bg-white px-3 text-sm text-ink-800 outline-none transition placeholder:text-ink-300 focus:border-petroleum-500 focus:ring-2 focus:ring-petroleum-100 disabled:cursor-not-allowed disabled:bg-sand-50 disabled:text-ink-400";
export const premiumTextareaClass = "min-h-24 w-full rounded-xl border border-sand-200 bg-white px-3 py-3 text-sm text-ink-800 outline-none transition placeholder:text-ink-300 focus:border-petroleum-500 focus:ring-2 focus:ring-petroleum-100 disabled:cursor-not-allowed disabled:bg-sand-50";
export const premiumPrimaryButtonClass = "inline-flex h-11 items-center justify-center rounded-xl bg-petroleum-700 px-5 text-sm font-semibold text-white transition hover:bg-petroleum-800 focus:outline-none focus:ring-2 focus:ring-petroleum-200 disabled:cursor-not-allowed disabled:opacity-60";

export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-ink-400">{eyebrow}</p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em] text-ink-900 sm:text-[34px]">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-500">{description}</p>
    </div>
    {action ? <div className="shrink-0">{action}</div> : null}
  </header>;
}

export function MetricCard({ icon: Icon, label, value, hint }: { icon?: LucideIcon; label: string; value: ReactNode; hint?: string }) {
  return <div className="rounded-2xl border border-sand-200 bg-white p-5 shadow-[0_1px_2px_rgba(17,34,31,0.04)]">
    {Icon ? <Icon className="h-5 w-5 text-petroleum-700" strokeWidth={1.6} aria-hidden="true" /> : null}
    <p className={Icon ? "mt-5 text-xs font-medium text-ink-500" : "text-xs font-medium text-ink-500"}>{label}</p>
    <p className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-ink-900">{value}</p>
    {hint ? <p className="mt-2 text-xs leading-5 text-ink-400">{hint}</p> : null}
  </div>;
}

export function Panel({ title, description, children, className = "", bodyClassName = "p-6" }: { title?: string; description?: string; children: ReactNode; className?: string; bodyClassName?: string }) {
  return <section className={`overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-[0_1px_2px_rgba(17,34,31,0.04)] ${className}`}>
    {title ? <div className="border-b border-sand-200 px-6 py-5"><h2 className="font-display text-xl font-semibold tracking-[-0.02em] text-ink-900">{title}</h2>{description ? <p className="mt-1 text-sm leading-6 text-ink-500">{description}</p> : null}</div> : null}
    <div className={bodyClassName}>{children}</div>
  </section>;
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return <div className="flex min-h-48 flex-col items-center justify-center px-6 py-12 text-center">
    <div className="h-10 w-10 rounded-full border border-sand-200 bg-sand-50" />
    <p className="mt-4 text-sm font-semibold text-ink-700">{title}</p>
    {description ? <p className="mt-1 max-w-md text-sm leading-6 text-ink-400">{description}</p> : null}
  </div>;
}

export function InlineAlert({ children, tone = "error" }: { children: ReactNode; tone?: "error" | "success" | "info" }) {
  const styles = tone === "error" ? "border-red-200 bg-red-50 text-red-800" : tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-sand-200 bg-sand-50 text-ink-600";
  return <p className={`rounded-xl border px-3 py-2.5 text-sm ${styles}`}>{children}</p>;
}
