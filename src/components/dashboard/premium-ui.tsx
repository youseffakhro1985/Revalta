import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { categoryFunctions, categorySpec, type CategorySpecItem } from "@/lib/dashboard/category-spec";

export const premiumFieldClass = "h-11 w-full rounded-xl border border-sand-200/90 bg-white px-3 text-sm text-ink-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_1px_2px_rgba(17,34,31,0.025)] outline-none transition-[border-color,box-shadow,background-color] duration-200 ease-in-out placeholder:text-ink-300 focus:border-petroleum-500 focus:ring-2 focus:ring-petroleum-100 disabled:cursor-not-allowed disabled:bg-sand-50 disabled:text-ink-500";
export const premiumTextareaClass = "min-h-24 w-full resize-y rounded-xl border border-sand-200/90 bg-white px-3 py-3 text-sm leading-6 text-ink-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_1px_2px_rgba(17,34,31,0.025)] outline-none transition-[border-color,box-shadow,background-color] duration-200 ease-in-out placeholder:text-ink-300 focus:border-petroleum-500 focus:ring-2 focus:ring-petroleum-100 disabled:cursor-not-allowed disabled:bg-sand-50";
export const premiumPrimaryButtonClass = "inline-flex h-11 items-center justify-center rounded-xl border border-petroleum-800/15 bg-petroleum-700 px-5 text-sm font-semibold text-white shadow-premium-sm transition-[background-color,border-color,box-shadow,opacity,transform] duration-200 ease-in-out hover:bg-petroleum-800 hover:shadow-premium-md active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-200 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:translate-y-0";
export const premiumSecondaryButtonClass = "inline-flex h-11 items-center justify-center rounded-xl border border-sand-200/90 bg-white px-4 text-sm font-semibold text-ink-700 shadow-[0_1px_2px_rgba(17,34,31,0.025)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-in-out hover:border-sand-300 hover:bg-sand-50/80 hover:shadow-premium-sm active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-100 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0";
export const premiumCompactButtonClass = "inline-flex h-9 items-center justify-center rounded-lg border border-sand-200/90 bg-white px-3 text-xs font-semibold text-ink-700 shadow-[0_1px_2px_rgba(17,34,31,0.02)] transition-[background-color,border-color,color,box-shadow,opacity] duration-200 hover:border-sand-300 hover:bg-sand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-100 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
export const premiumDangerButtonClass = "inline-flex h-9 items-center justify-center rounded-lg border border-danger-200 bg-white px-3 text-xs font-semibold text-danger-700 transition-[background-color,border-color,color,opacity] duration-200 hover:border-danger-300 hover:bg-danger-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-100 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
export const premiumHeroSelectClass = "h-11 rounded-xl border border-white/16 bg-white/[0.08] px-3 text-sm font-semibold text-white outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/20";

type StatusTone = "ok" | "warn" | "off";

function StatusChip({ label, tone }: { label: string; tone: StatusTone }) {
  const dot = tone === "warn" ? "bg-amber-300" : tone === "ok" ? "bg-emerald-300" : "bg-white/50";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-white/82">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {label}
    </span>
  );
}

export function PageHeader({
  catalog,
  eyebrow,
  title,
  description,
  action,
  spec,
  functions,
  records,
  status = "Live",
  statusTone = "ok",
  titleId,
}: {
  catalog?: string;
  eyebrow: string;
  title: ReactNode;
  description: string;
  action?: ReactNode;
  spec?: CategorySpecItem[];
  functions?: string[];
  records?: string;
  status?: string;
  statusTone?: StatusTone;
  titleId?: string;
}) {
  const resolvedSpec = spec ?? (catalog ? categorySpec(catalog, records ? { records } : undefined) : undefined);
  const resolvedFunctions = functions ?? (catalog ? categoryFunctions(catalog) : undefined);

  return (
    <header className="category-hero overview-hero relative overflow-hidden rounded-[28px] border border-petroleum-950/40 text-white shadow-[0_28px_80px_-36px_rgba(16,31,28,0.55)]">
      <div className="overview-hero-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative z-[1] space-y-5 px-5 py-6 sm:px-7 sm:py-7 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#d4af37]">{eyebrow}</p>
              <StatusChip label={status} tone={statusTone} />
            </div>
            <h1 id={titleId} className="mt-2.5 font-display text-[1.75rem] font-semibold leading-[1.08] tracking-[-0.04em] text-white sm:text-[2.05rem]">
              {title}
            </h1>
            <p className="mt-2.5 max-w-2xl text-[15px] leading-6 text-white/72">{description}</p>
            {resolvedFunctions?.length ? (
              <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Funktioner">
                {resolvedFunctions.map((item) => (
                  <li
                    key={item}
                    className="rounded-full border border-[#e8d7a8]/28 bg-[#e8d7a8]/10 px-2.5 py-1 text-[11px] font-semibold tracking-[0.01em] text-[#e8d7a8]"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {action ? <div className="category-hero-actions flex w-full shrink-0 flex-wrap items-center gap-2 lg:w-auto lg:justify-end">{action}</div> : null}
        </div>
        {resolvedSpec?.length ? (
          <dl className="grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-2 lg:grid-cols-4">
            {resolvedSpec.map((item) => (
              <div key={`${item.label}-${item.value}`} className="min-w-0">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">{item.label}</dt>
                <dd className="mt-1 break-words font-mono text-[12px] font-medium leading-5 text-white/88">{item.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </header>
  );
}

export function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  className = "",
}: {
  icon?: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={`group relative overflow-hidden rounded-[24px] border border-sand-200/90 bg-[#FFFEFB] p-5 shadow-premium-sm transition-[border-color,box-shadow,transform] duration-200 ease-in-out hover:-translate-y-px hover:border-sand-300/80 hover:shadow-premium-md ${className}`}>
      <span className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-petroleum-700 via-[#d6c08a] to-petroleum-400 opacity-80" aria-hidden="true" />
      {Icon ? (
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-sand-100 bg-[#F4F1E8] text-petroleum-800">
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.65} aria-hidden="true" />
        </span>
      ) : null}
      <p className={Icon ? "mt-4 text-[13px] font-medium text-ink-500" : "text-[13px] font-medium text-ink-500"}>{label}</p>
      <p className="mt-1 break-words font-display text-[28px] font-semibold tracking-[-0.04em] text-ink-950 tabular-nums">{value}</p>
      {hint ? <p className="mt-1.5 text-[13px] leading-5 text-ink-500">{hint}</p> : null}
    </div>
  );
}

export function Panel({
  title,
  description,
  action,
  icon: Icon,
  children,
  className = "",
  bodyClassName = "p-5 sm:p-6",
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`overflow-hidden rounded-[24px] border border-sand-200/90 bg-[#FFFEFB] shadow-premium-sm ${className}`}>
      {title ? (
        <div className="flex min-h-[72px] flex-col gap-4 border-b border-sand-100 bg-[#F7F5EF] px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              {Icon ? (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-sand-100 bg-white text-petroleum-800">
                  <Icon className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
                </span>
              ) : null}
              <h2 className="font-display text-[18px] font-semibold tracking-[-0.03em] text-ink-900">{title}</h2>
            </div>
            {description ? <p className={`mt-1 max-w-3xl text-[13px] leading-6 text-ink-500 ${Icon ? "sm:ml-[46px]" : ""}`}>{description}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function EmptyState({ title, description, icon: Icon }: { title: string; description?: string; icon?: LucideIcon }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-sand-200 bg-[#F4F1E8] text-petroleum-800">
        {Icon ? <Icon className="h-5 w-5" strokeWidth={1.6} aria-hidden="true" /> : <span className="h-2 w-2 rounded-full bg-petroleum-400" aria-hidden="true" />}
      </div>
      <p className="mt-4 text-sm font-semibold text-ink-800">{title}</p>
      {description ? <p className="mt-1 max-w-md text-sm leading-6 text-ink-500">{description}</p> : null}
    </div>
  );
}

export function LoadingState({ label = "Hämtar data…", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="space-y-3 p-5 sm:p-6" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-16 animate-pulse rounded-xl border border-sand-100 bg-sand-50/90" />
      ))}
    </div>
  );
}

export function StatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "info" | "success" | "warning" | "danger" }) {
  const styles = tone === "success"
    ? "border-success-100 bg-success-50 text-success-800"
    : tone === "warning"
      ? "border-warning-100 bg-warning-50 text-warning-900"
      : tone === "danger"
        ? "border-danger-100 bg-danger-50 text-danger-800"
        : tone === "info"
          ? "border-petroleum-100 bg-petroleum-50 text-petroleum-800"
          : "border-sand-200 bg-sand-50 text-ink-600";
  return <span className={`inline-flex min-h-7 items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] ${styles}`}>{children}</span>;
}

export function InlineAlert({ children, tone = "error" }: { children: ReactNode; tone?: "error" | "success" | "info" | "warning" }) {
  const styles = tone === "error"
    ? "border-danger-200 bg-danger-50 text-danger-800"
    : tone === "success"
      ? "border-success-200 bg-success-50 text-success-800"
      : tone === "warning"
        ? "border-warning-200 bg-warning-50 text-warning-900"
        : "border-sand-200 bg-sand-50 text-ink-600";
  return <div role={tone === "error" ? "alert" : "status"} className={`rounded-xl border px-3.5 py-3 text-sm leading-5 ${styles}`}>{children}</div>;
}
