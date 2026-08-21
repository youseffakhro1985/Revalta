import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export const premiumFieldClass = "h-11 w-full rounded-xl border border-sand-200/90 bg-white px-3 text-sm text-ink-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_1px_2px_rgba(17,34,31,0.025)] outline-none transition-[border-color,box-shadow,background-color] duration-200 ease-in-out placeholder:text-ink-300 focus:border-petroleum-500 focus:ring-2 focus:ring-petroleum-100 disabled:cursor-not-allowed disabled:bg-sand-50 disabled:text-ink-500";
export const premiumTextareaClass = "min-h-24 w-full resize-y rounded-xl border border-sand-200/90 bg-white px-3 py-3 text-sm leading-6 text-ink-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_1px_2px_rgba(17,34,31,0.025)] outline-none transition-[border-color,box-shadow,background-color] duration-200 ease-in-out placeholder:text-ink-300 focus:border-petroleum-500 focus:ring-2 focus:ring-petroleum-100 disabled:cursor-not-allowed disabled:bg-sand-50";
export const premiumPrimaryButtonClass = "inline-flex h-11 items-center justify-center rounded-xl border border-petroleum-800/15 bg-petroleum-700 px-5 text-sm font-semibold text-white shadow-premium-sm transition-[background-color,border-color,box-shadow,opacity,transform] duration-200 ease-in-out hover:bg-petroleum-800 hover:shadow-premium-md active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-200 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:translate-y-0";
export const premiumSecondaryButtonClass = "inline-flex h-11 items-center justify-center rounded-xl border border-sand-200/90 bg-white px-4 text-sm font-semibold text-ink-700 shadow-[0_1px_2px_rgba(17,34,31,0.025)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-in-out hover:border-sand-300 hover:bg-sand-50/80 hover:shadow-premium-sm active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-100 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0";
export const premiumCompactButtonClass = "inline-flex h-9 items-center justify-center rounded-lg border border-sand-200/90 bg-white px-3 text-xs font-semibold text-ink-700 shadow-[0_1px_2px_rgba(17,34,31,0.02)] transition-[background-color,border-color,color,box-shadow,opacity] duration-200 hover:border-sand-300 hover:bg-sand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-100 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
export const premiumDangerButtonClass = "inline-flex h-9 items-center justify-center rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 transition-[background-color,border-color,color,opacity] duration-200 hover:border-red-300 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-100 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-ink-500">{eyebrow}</p>
      <h1 className="mt-2 font-display text-[29px] font-semibold leading-[1.08] tracking-[-0.04em] text-ink-900 sm:text-[34px]">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-500">{description}</p>
    </div>
    {action ? <div className="w-full shrink-0 sm:w-auto">{action}</div> : null}
  </header>;
}

export function MetricCard({ icon: Icon, label, value, hint, className = "" }: { icon?: LucideIcon; label: string; value: ReactNode; hint?: string; className?: string }) {
  return <div className={`rounded-2xl border border-sand-200/90 bg-white p-5 shadow-premium-sm transition-[border-color,box-shadow,transform] duration-200 ease-in-out hover:-translate-y-px hover:border-sand-300/80 hover:shadow-premium-md ${className}`}>
    {Icon ? <Icon className="h-5 w-5 text-petroleum-700" strokeWidth={1.6} aria-hidden="true" /> : null}
    <p className={Icon ? "mt-5 text-xs font-medium text-ink-500" : "text-xs font-medium text-ink-500"}>{label}</p>
    <p className="mt-1 break-words text-2xl font-semibold tracking-[-0.03em] text-ink-900 tabular-nums">{value}</p>
    {hint ? <p className="mt-2 text-xs leading-5 text-ink-500">{hint}</p> : null}
  </div>;
}

export function Panel({ title, description, action, icon: Icon, children, className = "", bodyClassName = "p-6" }: { title?: string; description?: string; action?: ReactNode; icon?: LucideIcon; children: ReactNode; className?: string; bodyClassName?: string }) {
  return <section className={`overflow-hidden rounded-2xl border border-sand-200/90 bg-white shadow-premium-sm ${className}`}>
    {title ? <div className="flex flex-col gap-4 border-b border-sand-200 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6"><div className="min-w-0"><div className="flex items-center gap-2.5">{Icon ? <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-petroleum-50 text-petroleum-700"><Icon className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" /></span> : null}<h2 className="font-display text-xl font-semibold tracking-[-0.02em] text-ink-900">{title}</h2></div>{description ? <p className={`mt-1 max-w-3xl text-sm leading-6 text-ink-500 ${Icon ? "sm:ml-[42px]" : ""}`}>{description}</p> : null}</div>{action ? <div className="shrink-0">{action}</div> : null}</div> : null}
    <div className={bodyClassName}>{children}</div>
  </section>;
}

export function EmptyState({ title, description, icon: Icon }: { title: string; description?: string; icon?: LucideIcon }) {
  return <div className="flex min-h-48 flex-col items-center justify-center px-6 py-12 text-center">
    <div className="flex h-11 w-11 items-center justify-center rounded-full border border-sand-200 bg-sand-50 text-petroleum-700">{Icon ? <Icon className="h-5 w-5" strokeWidth={1.6} aria-hidden="true" /> : <span className="h-2 w-2 rounded-full bg-petroleum-300" aria-hidden="true" />}</div>
    <p className="mt-4 text-sm font-semibold text-ink-700">{title}</p>
    {description ? <p className="mt-1 max-w-md text-sm leading-6 text-ink-500">{description}</p> : null}
  </div>;
}

export function LoadingState({ label = "Hämtar data…", rows = 3 }: { label?: string; rows?: number }) {
  return <div className="space-y-3 p-5 sm:p-6" aria-live="polite" aria-busy="true">
    <span className="sr-only">{label}</span>
    {Array.from({ length: rows }, (_, index) => <div key={index} className="h-16 animate-pulse rounded-xl border border-sand-100 bg-sand-50/90" />)}
  </div>;
}

export function StatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "info" | "success" | "warning" | "danger" }) {
  const styles = tone === "success"
    ? "border-emerald-100 bg-emerald-50 text-emerald-800"
    : tone === "warning"
      ? "border-amber-100 bg-amber-50 text-amber-900"
      : tone === "danger"
        ? "border-red-100 bg-red-50 text-red-800"
        : tone === "info"
          ? "border-petroleum-100 bg-petroleum-50 text-petroleum-800"
          : "border-sand-200 bg-sand-50 text-ink-600";
  return <span className={`inline-flex min-h-7 items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] ${styles}`}>{children}</span>;
}

export function InlineAlert({ children, tone = "error" }: { children: ReactNode; tone?: "error" | "success" | "info" | "warning" }) {
  const styles = tone === "error"
    ? "border-red-200 bg-red-50 text-red-800"
    : tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-sand-200 bg-sand-50 text-ink-600";
  return <div role={tone === "error" ? "alert" : "status"} className={`rounded-xl border px-3.5 py-3 text-sm leading-5 ${styles}`}>{children}</div>;
}
