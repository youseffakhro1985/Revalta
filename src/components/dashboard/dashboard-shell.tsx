"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  FileArchive,
  FileClock,
  Gauge,
  Hammer,
  MessageSquareText,
  Plug,
  ReceiptText,
  Settings,
  ShieldCheck,
  Users,
  Wrench,
} from "lucide-react";
import { LogoutButton } from "@/components/logout-button";
import { GlobalSearch } from "@/components/dashboard/global-search";

const navigation = [
  {
    label: "Arbetsyta",
    items: [
      { href: "/dashboard", label: "Översikt", icon: CircleGauge },
      { href: "/dashboard/fastigheter", label: "Fastigheter", icon: Building2 },
      { href: "/dashboard/felanmalan", label: "Ärenden", icon: ClipboardList },
      { href: "/dashboard/arbetsorder", label: "Arbetsordrar", icon: Wrench },
      { href: "/dashboard/kalender", label: "Kalender", icon: CalendarDays },
      { href: "/dashboard/bokningar", label: "Bokningar", icon: CalendarCheck2 },
      { href: "/dashboard/ronder", label: "Ronder", icon: ClipboardCheck },
      { href: "/dashboard/besiktningar", label: "Besiktningar", icon: ClipboardSignature },
      { href: "/dashboard/underhall", label: "Underhåll", icon: Hammer },
      { href: "/dashboard/energi", label: "Energi", icon: Gauge },
      { href: "/dashboard/dokument", label: "Dokument", icon: FileArchive },
      { href: "/dashboard/offerter", label: "Offerter", icon: ReceiptText },
    ],
  },
  {
    label: "Organisation",
    items: [
      { href: "/dashboard/boendeportal", label: "Boendeportal", icon: MessageSquareText },
      { href: "/dashboard/leverantorer", label: "Leverantörer", icon: BriefcaseBusiness },
      { href: "/dashboard/team", label: "Team", icon: Users },
      { href: "/dashboard/behorigheter", label: "Behörigheter", icon: ShieldCheck },
      { href: "/dashboard/integrationer", label: "Integrationer", icon: Plug },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/dashboard/rapporter", label: "Rapporter", icon: BarChart3 },
      { href: "/dashboard/notiser", label: "Notiser", icon: BellRing },
      { href: "/dashboard/audit", label: "Händelselogg", icon: FileClock },
      { href: "/dashboard/drift", label: "Driftstatus", icon: Activity },
      { href: "/dashboard/billing", label: "Abonnemang", icon: CreditCard },
      { href: "/dashboard/installningar", label: "Inställningar", icon: Settings },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="dashboard-surface min-h-screen bg-[#F7F7F3] text-ink-900">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] border-r border-sand-200 bg-[#F1F1EC] lg:flex lg:flex-col">
        <div className="flex h-[72px] items-center border-b border-sand-200 px-6">
          <Link href="/dashboard" className="flex items-center gap-3" aria-label="Revalta dashboard">
            <span className="font-display text-[21px] font-semibold tracking-[-0.04em] text-petroleum-800">Revalta</span>
            <span className="h-5 w-px bg-sand-300" />
            <span className="text-[8px] font-semibold uppercase leading-[1.2] tracking-[0.13em] text-ink-400">Förvaltning<br />Sverige</span>
          </Link>
        </div>
        <nav aria-label="Dashboardmeny" className="flex-1 overflow-y-auto px-3 py-5">
          {navigation.map((group, groupIndex) => (
            <div key={group.label} className={groupIndex > 0 ? "mt-7" : ""}>
              <p className="mb-2 px-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-400">{group.label}</p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(pathname, item.href);
                  return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors ${active ? "border border-sand-200 bg-white text-petroleum-800 shadow-[0_1px_2px_rgba(17,34,31,0.04)]" : "border border-transparent text-ink-500 hover:bg-white/60 hover:text-ink-900"}`}><Icon className="h-[17px] w-[17px]" strokeWidth={1.65} aria-hidden="true" />{item.label}{active ? <span className="ml-auto h-1.5 w-1.5 rounded-full bg-petroleum-600" /> : null}</Link>;
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-sand-200 p-3">
          <div className="mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-petroleum-100 text-[10px] font-semibold text-petroleum-800">RV</div><div className="min-w-0"><p className="truncate text-[12px] font-semibold text-ink-800">Organisation</p><p className="truncate text-[10px] text-ink-400">Aktiv användare</p></div></div>
          <LogoutButton className="w-full justify-start" />
        </div>
      </aside>
      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-30 border-b border-sand-200 bg-[#FAFAF8]/95 backdrop-blur-sm">
          <div className="flex h-[64px] items-center justify-between gap-4 px-5 sm:px-8 lg:h-[72px] lg:px-10 xl:px-12">
            <Link href="/dashboard" className="font-display text-[20px] font-semibold tracking-[-0.04em] text-petroleum-800 lg:hidden">Revalta</Link>
            <div className="hidden min-w-[180px] lg:block"><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-400">Fastighetsförvaltning</p><p className="mt-1 text-[12px] font-medium text-ink-600">Samlad arbetsyta</p></div>
            <div className="ml-auto flex items-center gap-3"><GlobalSearch /><div className="lg:hidden"><LogoutButton /></div></div>
          </div>
          <nav aria-label="Mobil dashboardmeny" className="flex gap-1 overflow-x-auto border-t border-sand-200 px-4 py-2 lg:hidden">{navigation.flatMap((group) => group.items).map((item) => { const active = isActive(pathname, item.href); return <Link key={item.href} href={item.href} className={`shrink-0 rounded-lg px-3 py-2 text-[12px] font-medium ${active ? "bg-petroleum-700 text-white" : "text-ink-500"}`}>{item.label}</Link>; })}</nav>
        </header>
        <main className="mx-auto w-full max-w-[1440px] px-5 py-8 sm:px-8 sm:py-10 lg:px-10 xl:px-12">{children}</main>
      </div>
    </div>
  );
}
