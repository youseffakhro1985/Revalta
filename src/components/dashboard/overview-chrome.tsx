import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ArrowRight, CalendarDays } from "lucide-react";
import {
  overviewFirstName,
  overviewGreeting,
  overviewLongDate,
  overviewRoleLabel,
} from "@/components/dashboard/overview-greeting";

type OverviewAction = {
  href: string;
  label: string;
  primary?: boolean;
};

export function OverviewHero({
  now = new Date(),
  eyebrow,
  title,
  description,
  userName,
  userEmail,
  role,
  companyName,
  statusLabel,
  statusTone = "good",
  actions = [],
}: {
  now?: Date;
  eyebrow: string;
  title: string;
  description: string;
  userName?: string | null;
  userEmail: string;
  role: string;
  companyName?: string | null;
  statusLabel: string;
  statusTone?: "good" | "attention" | "neutral";
  actions?: OverviewAction[];
}) {
  const firstName = overviewFirstName(userName, userEmail);
  const statusDot = statusTone === "attention" ? "bg-amber-300" : statusTone === "good" ? "bg-emerald-300" : "bg-white/50";

  return (
    <section className="overview-hero relative overflow-hidden rounded-[28px] border border-petroleum-950/40 text-white shadow-[0_28px_80px_-36px_rgba(16,31,28,0.55)]">
      <div className="overview-hero-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative flex flex-col gap-8 px-5 py-6 sm:px-8 sm:py-8 lg:flex-row lg:items-end lg:justify-between lg:px-10 lg:py-9">
        <div className="min-w-0 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/55">{eyebrow}</p>
            {companyName ? (
              <span className="rounded-full border border-white/12 bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-white/75">
                {companyName}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-white/80">
              <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} aria-hidden="true" />
              {statusLabel}
            </span>
          </div>
          <p className="mt-4 text-sm font-medium text-[#e4d7b0]">{overviewGreeting(now)}, {firstName}</p>
          <h1 className="mt-1.5 font-display text-[34px] font-semibold leading-[1.05] tracking-[-0.045em] text-white sm:text-[42px]">
            {title}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/68 sm:text-[15px]">{description}</p>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-white/55">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5 text-[#e4d7b0]" strokeWidth={1.7} aria-hidden="true" />
              {overviewLongDate(now)}
            </span>
            <span>{overviewRoleLabel(role)}</span>
          </div>
        </div>
        {actions.length ? (
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {actions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className={action.primary
                  ? "inline-flex h-11 items-center rounded-xl bg-[#e8d7a8] px-5 text-sm font-semibold text-petroleum-950 shadow-[0_8px_24px_rgba(232,215,168,0.18)] transition hover:bg-[#f3e6c0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e8d7a8]/70"
                  : "inline-flex h-11 items-center rounded-xl border border-white/15 bg-white/[0.06] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"}
              >
                {action.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function OverviewQuickNav({
  items,
}: {
  items: Array<{ href: string; label: string; description: string; icon: LucideIcon }>;
}) {
  return (
    <nav aria-label="Snabbvägar" className="grid gap-2 rounded-[24px] border border-sand-200/90 bg-[#FFFEFB] p-2 shadow-premium-sm sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="group flex items-center gap-3 rounded-[18px] px-3.5 py-3.5 transition hover:bg-sand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-200"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-sand-100 bg-[#F4F1E8] text-petroleum-800 transition group-hover:border-petroleum-100 group-hover:bg-petroleum-50">
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.65} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink-900">{item.label}</span>
              <span className="mt-0.5 block truncate text-xs text-ink-500">{item.description}</span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-petroleum-700" aria-hidden="true" />
          </Link>
        );
      })}
    </nav>
  );
}

export function OverviewMetricLink({
  href,
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint: string;
  tone?: "default" | "warning";
}) {
  return (
    <Link
      href={href}
      className="group relative flex min-h-[168px] flex-col overflow-hidden rounded-[24px] border border-sand-200/90 bg-[#FFFEFB] p-5 shadow-premium-sm transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-sand-300 hover:shadow-premium-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-200"
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-petroleum-700 via-[#d6c08a] to-petroleum-400 opacity-80" aria-hidden="true" />
      <div className="flex items-start justify-between gap-4">
        <span className={`flex h-10 w-10 items-center justify-center rounded-2xl border ${tone === "warning" ? "border-amber-100 bg-amber-50 text-amber-700" : "border-sand-100 bg-[#F4F1E8] text-petroleum-800"}`}>
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.65} aria-hidden="true" />
        </span>
        <ArrowRight className="h-4 w-4 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-petroleum-700" aria-hidden="true" />
      </div>
      <p className="mt-5 text-[13px] font-medium text-ink-500">{label}</p>
      <p className="mt-1 font-display text-[30px] font-semibold tracking-[-0.045em] text-ink-950 tabular-nums">{value}</p>
      <p className={`mt-1.5 text-xs leading-5 ${tone === "warning" ? "font-semibold text-amber-800" : "text-ink-500"}`}>{hint}</p>
    </Link>
  );
}

export function OverviewPanel({
  title,
  description,
  action,
  children,
  bodyClassName = "p-5 sm:p-6",
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <section className="overflow-hidden rounded-[24px] border border-sand-200/90 bg-[#FFFEFB] shadow-premium-sm">
      <div className="flex min-h-[72px] items-center justify-between gap-4 border-b border-sand-100 px-5 py-5 sm:px-6">
        <div className="min-w-0">
          <h2 className="font-display text-[18px] font-semibold tracking-[-0.03em] text-ink-900">{title}</h2>
          {description ? <p className="mt-1 text-xs leading-5 text-ink-500 sm:text-[13px]">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function OverviewPulse({
  attentionCount,
  summary,
  actions,
}: {
  attentionCount: number;
  summary: string;
  actions?: Array<{ href: string; label: string }>;
}) {
  const attention = attentionCount > 0;
  return (
    <section
      className={`flex flex-col gap-4 rounded-[24px] border px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 ${attention ? "border-amber-200/90 bg-gradient-to-r from-amber-50/90 to-[#FFFEFB]" : "border-emerald-100 bg-gradient-to-r from-emerald-50/80 to-[#FFFEFB]"}`}
      aria-label="Driftstatus"
    >
      <div className="flex items-start gap-3.5">
        <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${attention ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
          <span className={`h-2.5 w-2.5 rounded-full ${attention ? "bg-amber-500" : "bg-emerald-500"}`} aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-semibold text-ink-900">
            {attention ? `${attentionCount} signaler behöver uppmärksamhet` : "Driften ser stabil ut"}
          </p>
          <p className="mt-1 text-xs leading-5 text-ink-500 sm:text-[13px]">{summary}</p>
        </div>
      </div>
      {attention && actions?.length ? (
        <div className="flex flex-wrap gap-3 pl-[54px] sm:pl-0">
          {actions.map((action) => (
            <Link key={action.href} href={action.href} className="text-sm font-semibold text-petroleum-800 hover:text-petroleum-950">
              {action.label}
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function OverviewEmpty({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-sand-200 bg-[#F4F1E8] text-petroleum-800">
        <Icon className="h-5 w-5" strokeWidth={1.6} aria-hidden="true" />
      </div>
      <p className="mt-4 text-sm font-semibold text-ink-800">{title}</p>
      <p className="mt-1 max-w-sm text-sm leading-6 text-ink-500">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function OverviewMiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-sand-100 bg-[#F8F6F0] px-3.5 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink-800">{value}</p>
    </div>
  );
}
