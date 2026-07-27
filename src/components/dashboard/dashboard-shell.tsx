"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  BellRing,
  BriefcaseBusiness,
  Building2,
  CalendarCheck2,
  CalendarDays,
  CircleGauge,
  ClipboardCheck,
  ClipboardList,
  ClipboardSignature,
  CreditCard,
  DoorOpen,
  FileArchive,
  FileClock,
  FileText,
  FolderKanban,
  Gauge,
  Hammer,
  HandCoins,
  KeyRound,
  LayoutList,
  LockKeyhole,
  Menu,
  MessageSquareText,
  Plug,
  ReceiptText,
  Repeat2,
  Settings,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  Users,
  UsersRound,
  WalletCards,
  Wrench,
  X,
} from "lucide-react";
import { LogoutButton } from "@/components/logout-button";
import { GlobalSearch } from "@/components/dashboard/global-search";
import { NotificationMenu } from "@/components/dashboard/notification-menu";
import { WorkOrderLockIndicator } from "@/components/dashboard/work-order-lock-indicator";
import {
  canManageAccessCredentials,
  canManageBilling,
  canManageCompany,
  canManageIntegrations,
  canManageTeam,
  canViewAudit,
  canViewFinanceData,
  canViewLeasingData,
  canViewOperations,
  isResident,
} from "@/lib/permissions";
import { isStaffOnlyDashboardPath, residentHomePath } from "@/lib/resident-access";

type NavItem = {
  href: string;
  label: string;
  icon: typeof CircleGauge;
  visible?: (role: string) => boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const residentNavigation: NavGroup[] = [
  {
    label: "Min portal",
    items: [
      { href: "/dashboard/boendeportal", label: "Mina ärenden", icon: MessageSquareText },
      { href: "/dashboard/boendeportal/dokument", label: "Mina dokument", icon: FileText },
      { href: "/dashboard/boendeportal/avier", label: "Mina avier", icon: HandCoins },
      { href: "/dashboard/boendeportal/bokningar", label: "Mina bokningar", icon: CalendarCheck2 },
      { href: "/dashboard/boendeportal/konto", label: "Mitt konto", icon: UserRound },
    ],
  },
];

const navigation: NavGroup[] = [
  {
    label: "Arbetsyta",
    items: [
      { href: "/dashboard", label: "Översikt", icon: CircleGauge },
      { href: "/dashboard/fastigheter", label: "Fastigheter", icon: Building2 },
      { href: "/dashboard/felanmalan", label: "Ärenden", icon: ClipboardList },
      { href: "/dashboard/arbetsorder", label: "Arbetsordrar", icon: Wrench },
      { href: "/dashboard/arbetsorder/planering", label: "Teknikerplanering", icon: UsersRound },
      { href: "/dashboard/arbetsorder/operationsoversikt", label: "Arbetsorderöversikt", icon: LayoutList, visible: canViewOperations },
      { href: "/dashboard/arbetsorder/aterkommande", label: "Återkommande", icon: Repeat2, visible: canViewOperations },
      { href: "/dashboard/projekt", label: "Projekt", icon: FolderKanban },
      { href: "/dashboard/skador", label: "Skador & försäkring", icon: ShieldAlert, visible: canViewFinanceData },
      { href: "/dashboard/kalender", label: "Kalender", icon: CalendarDays },
      { href: "/dashboard/bokningar", label: "Bokningar", icon: CalendarCheck2 },
      { href: "/dashboard/ronder", label: "Ronder", icon: ClipboardCheck },
      { href: "/dashboard/besiktningar", label: "Besiktningar", icon: ClipboardSignature },
      { href: "/dashboard/nycklar", label: "Nycklar & passage", icon: KeyRound, visible: canManageAccessCredentials },
      { href: "/dashboard/uthyrning", label: "Uthyrning", icon: DoorOpen, visible: canViewLeasingData },
      { href: "/dashboard/hyresavisering", label: "Hyresavisering", icon: HandCoins, visible: canViewLeasingData },
      { href: "/dashboard/underhall", label: "Underhåll", icon: Hammer },
      { href: "/dashboard/energi", label: "Energi", icon: Gauge, visible: canViewFinanceData },
      { href: "/dashboard/imd", label: "Mätare & IMD", icon: Gauge, visible: canViewFinanceData },
      { href: "/dashboard/dokument", label: "Dokument", icon: FileArchive },
      { href: "/dashboard/offerter", label: "Offerter", icon: ReceiptText, visible: canViewFinanceData },
    ],
  },
  {
    label: "Organisation",
    items: [
      { href: "/dashboard/boendeportal", label: "Boendeportal", icon: MessageSquareText },
      { href: "/dashboard/aviseringscenter", label: "Aviseringscenter", icon: BellRing },
      { href: "/dashboard/leverantorer", label: "Leverantörer", icon: BriefcaseBusiness, visible: canViewOperations },
      { href: "/dashboard/team", label: "Team", icon: Users, visible: (role) => canManageTeam(role) || canViewLeasingData(role) },
      { href: "/dashboard/behorigheter", label: "Behörigheter", icon: ShieldCheck, visible: canManageCompany },
      { href: "/dashboard/integrationer", label: "Integrationer", icon: Plug, visible: canManageIntegrations },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/dashboard/budget", label: "Budget & prognos", icon: WalletCards, visible: canViewFinanceData },
      { href: "/dashboard/rapporter", label: "Rapporter", icon: BarChart3, visible: canViewOperations },
      { href: "/dashboard/notiser", label: "Notiser", icon: BellRing },
      { href: "/dashboard/audit", label: "Händelselogg", icon: FileClock, visible: canViewAudit },
      { href: "/dashboard/drift", label: "Driftstatus", icon: Activity, visible: canViewOperations },
      { href: "/dashboard/arbetsorder/redigeringslas", label: "Redigeringslås", icon: LockKeyhole, visible: canViewOperations },
      { href: "/dashboard/billing", label: "Abonnemang", icon: CreditCard, visible: canManageBilling },
      { href: "/dashboard/installningar", label: "Inställningar", icon: Settings },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  if (href === "/dashboard/arbetsorder") {
    return pathname === href || (
      pathname.startsWith(`${href}/`)
      && !pathname.startsWith("/dashboard/arbetsorder/planering")
      && !pathname.startsWith("/dashboard/arbetsorder/operationsoversikt")
      && !pathname.startsWith("/dashboard/arbetsorder/aterkommande")
      && !pathname.startsWith("/dashboard/arbetsorder/redigeringslas")
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
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
  const groups = useMemo(() => {
    const source = isResident(role) ? residentNavigation : navigation;
    return source
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => !item.visible || item.visible(role)),
      }))
      .filter((group) => group.items.length > 0);
  }, [role]);

  return <>
    {groups.map((group, groupIndex) => (
      <div key={group.label} className={groupIndex > 0 ? "mt-7" : ""}>
        <p className="mb-2 px-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-400">{group.label}</p>
        <div className="space-y-1">
          {group.items.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-petroleum-300 ${active ? "border border-sand-200 bg-white text-petroleum-800 shadow-[0_1px_2px_rgba(17,34,31,0.04)]" : "border border-transparent text-ink-500 hover:bg-white/60 hover:text-ink-900"}`}><Icon className="h-[17px] w-[17px]" strokeWidth={1.65} aria-hidden="true" />{item.label}{active ? <span className="ml-auto h-1.5 w-1.5 rounded-full bg-petroleum-600" aria-hidden="true" /> : null}</Link>;
          })}
        </div>
      </div>
    ))}
  </>;
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

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] border-r border-sand-200 bg-[#F1F1EC] lg:flex lg:flex-col">
        <div className="flex h-[72px] items-center border-b border-sand-200 px-6">
          <Link href={homeHref} className="flex items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-petroleum-300" aria-label="Revalta dashboard">
            <span className="font-display text-[21px] font-semibold tracking-[-0.04em] text-petroleum-800">Revalta</span><span className="h-5 w-px bg-sand-300" aria-hidden="true" /><span className="text-[8px] font-semibold uppercase leading-[1.2] tracking-[0.13em] text-ink-400">Förvaltning<br />Sverige</span>
          </Link>
        </div>
        <nav aria-label="Dashboardmeny" className="flex-1 overflow-y-auto px-3 py-5"><NavigationContent pathname={pathname} role={role} /></nav>
        <div className="border-t border-sand-200 p-3">
          <div className="mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-petroleum-100 text-[10px] font-semibold text-petroleum-800">{initials(userName, userEmail)}</div>
            <div className="min-w-0">
              <p className="truncate text-[12px] font-semibold text-ink-800">{displayName}</p>
              <p className="truncate text-[10px] text-ink-400">{roleLabel}</p>
            </div>
          </div>
          <LogoutButton className="w-full justify-start" />
        </div>
      </aside>

      {mobileOpen ? <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Dashboardmeny"><button className="absolute inset-0 bg-ink-950/30 backdrop-blur-[1px]" aria-label="Stäng meny" onClick={() => setMobileOpen(false)} /><aside className="relative flex h-full w-[min(88vw,340px)] flex-col border-r border-sand-200 bg-[#F7F7F3] shadow-2xl"><div className="flex h-16 items-center justify-between border-b border-sand-200 px-5"><Link href={homeHref} className="font-display text-xl font-semibold tracking-[-0.04em] text-petroleum-800">Revalta</Link><button type="button" onClick={() => setMobileOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-xl border border-sand-200 bg-white text-ink-700 outline-none focus-visible:ring-2 focus-visible:ring-petroleum-300" aria-label="Stäng meny"><X className="h-5 w-5" /></button></div><nav aria-label="Mobil dashboardmeny" className="flex-1 overflow-y-auto px-3 py-5"><NavigationContent pathname={pathname} role={role} onNavigate={() => setMobileOpen(false)} /></nav><div className="border-t border-sand-200 p-4"><LogoutButton className="w-full justify-start" /></div></aside></div> : null}

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-30 border-b border-sand-200 bg-[#FAFAF8]/95 backdrop-blur-sm">
          <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-8 lg:h-[72px] lg:px-10 xl:px-12">
            <div className="flex items-center gap-3 lg:hidden"><button type="button" onClick={() => setMobileOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-xl border border-sand-200 bg-white text-ink-700 outline-none focus-visible:ring-2 focus-visible:ring-petroleum-300" aria-label="Öppna meny" aria-expanded={mobileOpen}><Menu className="h-5 w-5" /></button><Link href={homeHref} className="font-display text-[20px] font-semibold tracking-[-0.04em] text-petroleum-800">Revalta</Link></div>
            <div className="hidden min-w-[180px] lg:block"><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-400">{resident ? "Boendeportal" : "Fastighetsförvaltning"}</p><p className="mt-1 text-[12px] font-medium text-ink-600">{resident ? "Självservice" : "Samlad arbetsyta"}</p></div>
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
