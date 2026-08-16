"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";
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
      className={`flex items-center gap-3 rounded-lg border font-medium outline-none transition-[background-color,border-color,color,box-shadow] duration-200 ease-in-out focus-visible:ring-2 focus-visible:ring-petroleum-300 focus-visible:ring-offset-1 focus-visible:ring-offset-[#F1F1EC] ${compact ? "min-h-10 px-3 text-[12px]" : "min-h-11 px-3 text-[13px]"} ${active ? "border-sand-200/90 bg-white text-petroleum-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_1px_2px_rgba(17,34,31,0.04)]" : "border-transparent text-ink-500 hover:border-sand-200/60 hover:bg-white/65 hover:text-ink-900"}`}
    >
      <Icon className={compact ? "h-4 w-4" : "h-[17px] w-[17px]"} strokeWidth={1.65} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {active ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-petroleum-600" aria-hidden="true" /> : null}
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
    if (pathname.startsWith("/dashboard/arbetsorder/operationsoversikt") || pathname.startsWith("/dashboard/kalender")) {
      return "drift";
    }
    return activeDashboardSectionId(pathname, sections);
  }, [pathname, sections]);
  const [expandedSectionId, setExpandedSectionId] = useState<string | null>(detectedSectionId);

  useEffect(() => {
    setExpandedSectionId(detectedSectionId);
  }, [detectedSectionId, pathname]);

  if (resident) {
    return (
      <div>
        <p className="mb-2 px-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-500">Min portal</p>
        <div className="space-y-1">
          {residentItems.map((item) => <NavigationLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />)}
        </div>
      </div>
    );
  }

  return (
    <>
      <div>
        <p className="mb-2 px-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-500">Arbetsyta</p>
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
                className={`flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 text-left text-[13px] font-medium outline-none transition-[background-color,border-color,color,box-shadow] duration-200 ease-in-out focus-visible:ring-2 focus-visible:ring-petroleum-300 focus-visible:ring-offset-1 focus-visible:ring-offset-[#F1F1EC] ${sectionActive ? "border-sand-200/90 bg-white text-petroleum-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_1px_2px_rgba(17,34,31,0.04)]" : "border-transparent text-ink-500 hover:border-sand-200/60 hover:bg-white/65 hover:text-ink-900"}`}
              >
                <Icon className="h-[17px] w-[17px] shrink-0" strokeWidth={1.65} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{section.label}</span>
                {sectionActive ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-petroleum-600" aria-hidden="true" /> : null}
                <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} strokeWidth={1.65} aria-hidden="true" />
              </button>

              {expanded ? (
                <div id={regionId} className="ml-[18px] mt-1 space-y-0.5 border-l border-sand-200/90 pl-2">
                  {section.items.map((item) => <NavigationLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} compact />)}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-5 border-t border-sand-200/80 pt-4">
        <p className="mb-2 px-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-500">Administration</p>
        <NavigationLink
          item={staffSettingsNavigation}
          pathname={pathname}
          onNavigate={onNavigate}
          activeOverride={isSettingsAreaActive(pathname)}
        />
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

  useEffect(() => { setMobileOpen(false); }, [pathname]);
  useEffect(() => {
    if (!resident) return;
    if (isStaffOnlyDashboardPath(pathname)) {
      router.replace(residentHomePath());
    }
  }, [pathname, resident, router]);
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileOpen(false); };
    window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", close); };
  }, [mobileOpen]);

  return (
    <div className="dashboard-surface min-h-screen bg-[#F7F7F3] text-ink-900">
      <a href="#dashboard-content" className="sr-only z-[70] rounded-lg bg-white px-4 py-3 text-sm font-semibold text-petroleum-800 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Hoppa till innehåll</a>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] border-r border-sand-200/90 bg-[#F1F1EC] lg:flex lg:flex-col">
        <div className="flex h-[72px] items-center border-b border-sand-200 px-6">
          <Link href={homeHref} className="flex items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-petroleum-300" aria-label="Revalta dashboard">
            <span className="font-display text-[21px] font-semibold tracking-[-0.04em] text-petroleum-800">Revalta</span><span className="h-5 w-px bg-sand-300" aria-hidden="true" /><span className="text-[8px] font-semibold uppercase leading-[1.2] tracking-[0.13em] text-ink-500">Förvaltning<br />Sverige</span>
          </Link>
        </div>
        <nav aria-label="Dashboardmeny" className="flex-1 overflow-y-auto px-3 py-5"><NavigationContent pathname={pathname} role={role} /></nav>
        <div className="border-t border-sand-200 p-3">
          <div className="mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-petroleum-100 text-[10px] font-semibold text-petroleum-800">{initials(userName, userEmail)}</div>
            <div className="min-w-0">
              <p className="truncate text-[12px] font-semibold text-ink-800">{displayName}</p>
              <p className="truncate text-[10px] text-ink-500">{roleLabel}</p>
            </div>
          </div>
          <LogoutButton className="w-full justify-start" />
        </div>
      </aside>

      {mobileOpen ? <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Dashboardmeny"><button className="absolute inset-0 bg-ink-950/30 backdrop-blur-[1px]" aria-label="Stäng meny" onClick={() => setMobileOpen(false)} /><aside className="relative flex h-full w-[min(88vw,340px)] flex-col border-r border-sand-200 bg-[#F7F7F3] shadow-2xl"><div className="flex h-16 items-center justify-between border-b border-sand-200 px-5"><Link href={homeHref} className="font-display text-xl font-semibold tracking-[-0.04em] text-petroleum-800">Revalta</Link><button type="button" onClick={() => setMobileOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-xl border border-sand-200 bg-white text-ink-700 outline-none focus-visible:ring-2 focus-visible:ring-petroleum-300" aria-label="Stäng meny"><X className="h-5 w-5" /></button></div><nav aria-label="Mobil dashboardmeny" className="flex-1 overflow-y-auto px-3 py-5"><NavigationContent pathname={pathname} role={role} onNavigate={() => setMobileOpen(false)} /></nav><div className="border-t border-sand-200 p-4"><LogoutButton className="w-full justify-start" /></div></aside></div> : null}

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-30 border-b border-sand-200/90 bg-[#FAFAF8]/95 shadow-[0_1px_0_rgba(255,255,255,0.72)] backdrop-blur-md">
          <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-8 lg:h-[72px] lg:px-10 xl:px-12">
            <div className="flex items-center gap-3 lg:hidden"><button type="button" onClick={() => setMobileOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-xl border border-sand-200 bg-white text-ink-700 outline-none focus-visible:ring-2 focus-visible:ring-petroleum-300" aria-label="Öppna meny" aria-expanded={mobileOpen}><Menu className="h-5 w-5" /></button><Link href={homeHref} className="font-display text-[20px] font-semibold tracking-[-0.04em] text-petroleum-800">Revalta</Link></div>
            <div className="hidden min-w-[180px] lg:block"><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-500">{resident ? "Boendeportal" : "Fastighetsförvaltning"}</p><p className="mt-1 text-[12px] font-medium text-ink-600">{resident ? "Självservice" : "Samlad arbetsyta"}</p></div>
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              {resident ? null : <WorkOrderLockIndicator />}
              {resident ? null : <GlobalSearch />}
              {resident ? null : <NotificationMenu />}
              <div className="hidden sm:block lg:hidden"><LogoutButton /></div>
            </div>
          </div>
        </header>
        <main id="dashboard-content" tabIndex={-1} className="mx-auto w-full max-w-[1440px] px-4 py-6 outline-none sm:px-8 sm:py-10 lg:px-10 xl:px-12">{children}</main>
      </div>
    </div>
  );
}
