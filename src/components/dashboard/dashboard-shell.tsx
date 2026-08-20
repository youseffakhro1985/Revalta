"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Menu, Plus, X } from "lucide-react";
import { LogoutButton } from "@/components/logout-button";
import { GlobalSearch } from "@/components/dashboard/global-search";
import {
  activeDashboardSectionId,
  isDashboardNavItemActive,
  residentNavigation,
  staffPrimaryNavigation,
  staffSettingsNavigation,
  visibleDashboardItems,
  visibleDashboardSections,
  type DashboardNavItem,
} from "@/components/dashboard/dashboard-navigation";
import { NotificationMenu } from "@/components/dashboard/notification-menu";
import { WorkOrderLockIndicator } from "@/components/dashboard/work-order-lock-indicator";
import { isResident } from "@/lib/permissions";
import { isStaffOnlyDashboardPath, residentHomePath } from "@/lib/resident-access";

const settingsAreaPaths = [
  "/dashboard/installningar",
  "/dashboard/notiser",
  "/dashboard/aviseringscenter",
  "/dashboard/audit",
  "/dashboard/drift",
  "/dashboard/arbetsorder/redigeringslas",
  "/dashboard/billing",
] as const;

function isSettingsAreaActive(pathname: string) {
  return settingsAreaPaths.some((href) => pathname === href || pathname.startsWith(`${href}/`));
}

function NavigationLink({
  item,
  pathname,
  onNavigate,
  compact = false,
  activeOverride,
}: {
  item: DashboardNavItem;
  pathname: string;
  onNavigate?: () => void;
  compact?: boolean;
  activeOverride?: boolean;
}) {
  const Icon = item.icon;
  const active = activeOverride ?? isDashboardNavItemActive(pathname, item.href);

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`group flex items-center gap-3 rounded-xl border font-medium outline-none transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-white/55 focus-visible:ring-offset-2 focus-visible:ring-offset-petroleum-900 ${compact ? "min-h-9 px-3 text-[12px]" : "min-h-11 px-3.5 text-[13px]"} ${active ? "border-white/10 bg-white/[0.12] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_8px_24px_rgba(4,22,18,0.12)]" : "border-transparent text-white/68 hover:border-white/[0.08] hover:bg-white/[0.07] hover:text-white"}`}
    >
      <Icon className={`${compact ? "h-4 w-4" : "h-[18px] w-[18px]"} shrink-0 ${active ? "text-white" : "text-white/62 transition-colors group-hover:text-white"}`} strokeWidth={1.7} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {active ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sand-200 shadow-[0_0_0_3px_rgba(255,255,255,0.06)]" aria-hidden="true" /> : null}
    </Link>
  );
}

function NavigationContent({
  pathname,
  role,
  onNavigate,
}: {
  pathname: string;
  role: string;
  onNavigate?: () => void;
}) {
  const resident = isResident(role);
  const residentItems = useMemo(() => visibleDashboardItems(residentNavigation, role), [role]);
  const primaryItems = useMemo(() => visibleDashboardItems(staffPrimaryNavigation, role), [role]);
  const sections = useMemo(() => visibleDashboardSections(role), [role]);
  const detectedSectionId = useMemo(() => {
    if (pathname.startsWith("/dashboard/arbetsorder/operationsoversikt") || pathname.startsWith("/dashboard/kalender")) return "drift";
    return activeDashboardSectionId(pathname, sections);
  }, [pathname, sections]);
  const [expandedSectionId, setExpandedSectionId] = useState<string | null>(detectedSectionId);

  useEffect(() => {
    setExpandedSectionId(detectedSectionId);
  }, [detectedSectionId, pathname]);

  if (resident) {
    return (
      <div>
        <p className="mb-2 px-3 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/38">Min portal</p>
        <div className="space-y-1">
          {residentItems.map((item) => <NavigationLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />)}
        </div>
      </div>
    );
  }

  return (
    <>
      <div>
        <p className="mb-2 px-3 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/38">Arbetsyta</p>
        <div className="space-y-1">
          {primaryItems.map((item) => <NavigationLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />)}
        </div>
      </div>

      <div className="mt-5 space-y-1" aria-label="Modulområden">
        {sections.map((section) => {
          const Icon = section.icon;
          const expanded = expandedSectionId === section.id;
          const sectionActive = detectedSectionId === section.id;
          const regionId = `dashboard-nav-${section.id}`;

          return (
            <div key={section.id}>
              <button
                type="button"
                onClick={() => setExpandedSectionId((current) => current === section.id ? null : section.id)}
                aria-expanded={expanded}
                aria-controls={regionId}
                className={`group flex min-h-11 w-full items-center gap-3 rounded-xl border px-3.5 text-left text-[13px] font-medium outline-none transition-[background-color,border-color,color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-white/55 focus-visible:ring-offset-2 focus-visible:ring-offset-petroleum-900 ${sectionActive ? "border-white/10 bg-white/[0.12] text-white" : "border-transparent text-white/68 hover:border-white/[0.08] hover:bg-white/[0.07] hover:text-white"}`}
              >
                <Icon className={`h-[18px] w-[18px] shrink-0 ${sectionActive ? "text-white" : "text-white/62 group-hover:text-white"}`} strokeWidth={1.7} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{section.label}</span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-white/42 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} strokeWidth={1.7} aria-hidden="true" />
              </button>

              {expanded ? (
                <div id={regionId} className="ml-[21px] mt-1 space-y-0.5 border-l border-white/10 pl-2">
                  {section.items.map((item) => <NavigationLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} compact />)}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-5 border-t border-white/10 pt-4">
        <p className="mb-2 px-3 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/38">Administration</p>
        <NavigationLink item={staffSettingsNavigation} pathname={pathname} onNavigate={onNavigate} activeOverride={isSettingsAreaActive(pathname)} />
      </div>
    </>
  );
}

function initials(name: string | null | undefined, email: string) {
  const source = (name || email || "RV").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0] || ""}${parts[1]![0] || ""}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function roleLabelFor(role: string) {
  if (role === "owner") return "Ägare";
  if (role === "admin") return "Administratör";
  if (role === "manager") return "Förvaltare";
  if (role === "technician") return "Tekniker";
  if (role === "viewer") return "Läsbehörighet";
  if (role === "resident") return "Boende";
  return role;
}

export function DashboardShell({
  children,
  role,
  userName,
  userEmail,
}: {
  children: React.ReactNode;
  role: string;
  userName?: string | null;
  userEmail: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const resident = isResident(role);
  const homeHref = resident ? residentHomePath() : "/dashboard";
  const displayName = userName?.trim() || userEmail;
  const roleLabel = roleLabelFor(role);
  const canCreateWorkOrder = !resident && (role === "owner" || role === "admin" || role === "manager");

  useEffect(() => { setMobileOpen(false); }, [pathname]);
  useEffect(() => {
    if (!resident) return;
    if (isStaffOnlyDashboardPath(pathname)) router.replace(residentHomePath());
  }, [pathname, resident, router]);
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileOpen(false); };
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", close);
    };
  }, [mobileOpen]);

  return (
    <div className="dashboard-surface min-h-screen bg-[#F8F7F2] text-ink-900">
      <a href="#dashboard-content" className="sr-only z-[70] rounded-lg bg-white px-4 py-3 text-sm font-semibold text-petroleum-800 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Hoppa till innehåll</a>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[264px] overflow-hidden border-r border-petroleum-900/35 bg-petroleum-900 text-white lg:flex lg:flex-col">
        <div className="relative flex h-[88px] items-center border-b border-white/10 px-7">
          <Link href={homeHref} className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-white/60" aria-label="Revalta dashboard">
            <span className="font-display text-[26px] font-semibold tracking-[-0.045em] text-white">REVALTA</span>
            <span className="mt-1 block text-[8px] font-semibold uppercase tracking-[0.22em] text-white/42">Fastighetsförvaltning</span>
          </Link>
        </div>
        <nav aria-label="Dashboardmeny" className="relative flex-1 overflow-y-auto px-3.5 py-6"><NavigationContent pathname={pathname} role={role} /></nav>
        <div className="relative border-t border-white/10 p-4">
          <div className="mb-2 flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.045] px-3 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/90 text-[10px] font-bold text-petroleum-950">{initials(userName, userEmail)}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold text-white">{displayName}</p>
              <p className="mt-0.5 truncate text-[10px] text-white/48">{roleLabel}</p>
            </div>
          </div>
          <LogoutButton className="w-full justify-start !border-white/10 !bg-transparent !text-white/66 hover:!bg-white/[0.07] hover:!text-white" />
        </div>
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Dashboardmeny">
          <button className="absolute inset-0 bg-ink-950/40 backdrop-blur-[2px]" aria-label="Stäng meny" onClick={() => setMobileOpen(false)} />
          <aside className="relative flex h-full w-[min(88vw,340px)] flex-col overflow-hidden border-r border-petroleum-900/40 bg-petroleum-900 text-white shadow-2xl">
            <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
              <Link href={homeHref} className="font-display text-xl font-semibold tracking-[-0.04em] text-white">REVALTA</Link>
              <button type="button" onClick={() => setMobileOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-white outline-none focus-visible:ring-2 focus-visible:ring-white/60" aria-label="Stäng meny"><X className="h-5 w-5" /></button>
            </div>
            <nav aria-label="Mobil dashboardmeny" className="flex-1 overflow-y-auto px-3 py-5"><NavigationContent pathname={pathname} role={role} onNavigate={() => setMobileOpen(false)} /></nav>
            <div className="border-t border-white/10 p-4"><LogoutButton className="w-full justify-start !border-white/10 !bg-transparent !text-white/70" /></div>
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-30 border-b border-sand-200/90 bg-[#FCFBF8]/95 backdrop-blur-xl">
          <div className="mx-auto flex h-16 w-full max-w-[1500px] items-center gap-3 px-4 sm:px-7 lg:h-[88px] lg:px-8 xl:px-10">
            <div className="flex items-center gap-3 lg:hidden">
              <button type="button" onClick={() => setMobileOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-xl border border-sand-200 bg-white text-ink-700 outline-none shadow-premium-sm focus-visible:ring-2 focus-visible:ring-petroleum-300" aria-label="Öppna meny" aria-expanded={mobileOpen}><Menu className="h-5 w-5" /></button>
              <Link href={homeHref} className="font-display text-[20px] font-semibold tracking-[-0.04em] text-petroleum-950">REVALTA</Link>
            </div>
            <div className="hidden flex-1 lg:block">{resident ? null : <GlobalSearch />}</div>
            <div className="ml-auto flex items-center gap-2 sm:gap-2.5">
              {resident ? null : <WorkOrderLockIndicator />}
              {resident ? null : <NotificationMenu />}
              {canCreateWorkOrder ? (
                <Link href="/dashboard/arbetsorder/ny" className="hidden h-11 items-center gap-2 rounded-xl border border-petroleum-900/15 bg-petroleum-950 px-4 text-[12px] font-semibold text-white shadow-premium-sm transition hover:bg-petroleum-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-300 focus-visible:ring-offset-2 sm:inline-flex">
                  <Plus className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                  Ny arbetsorder
                </Link>
              ) : null}
              <div className="hidden sm:block lg:hidden"><LogoutButton /></div>
            </div>
          </div>
        </header>
        <main id="dashboard-content" tabIndex={-1} className="mx-auto w-full max-w-[1500px] px-4 py-6 outline-none sm:px-7 sm:py-8 lg:px-8 lg:py-9 xl:px-10">{children}</main>
      </div>
    </div>
  );
}