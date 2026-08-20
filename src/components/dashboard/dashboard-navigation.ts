import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarCheck2,
  CalendarDays,
  CircleGauge,
  ClipboardCheck,
  ClipboardList,
  ClipboardSignature,
  DoorOpen,
  FileArchive,
  FolderKanban,
  Gauge,
  Hammer,
  HandCoins,
  KeyRound,
  LayoutList,
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
} from "lucide-react";
import {
  canManageAccessCredentials,
  canManageCompany,
  canManageIntegrations,
  canManageTeam,
  canViewFinanceData,
  canViewLeasingData,
  canViewOperations,
} from "@/lib/permissions";

export type DashboardNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  visible?: (role: string) => boolean;
};

export type DashboardNavSection = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: DashboardNavItem[];
};

export const residentNavigation: DashboardNavItem[] = [
  { href: "/dashboard/boendeportal", label: "Mina ärenden", icon: MessageSquareText },
  { href: "/dashboard/boendeportal/dokument", label: "Mina dokument", icon: FileArchive },
  { href: "/dashboard/boendeportal/avier", label: "Mina avier", icon: HandCoins },
  { href: "/dashboard/boendeportal/bokningar", label: "Mina bokningar", icon: CalendarCheck2 },
  { href: "/dashboard/boendeportal/konto", label: "Mitt konto", icon: UserRound },
];

export const staffPrimaryNavigation: DashboardNavItem[] = [
  { href: "/dashboard", label: "Översikt", icon: CircleGauge },
  { href: "/dashboard/fastigheter", label: "Fastigheter", icon: Building2 },
];

export const staffNavigationSections: DashboardNavSection[] = [
  {
    id: "drift",
    label: "Drift",
    icon: Wrench,
    items: [
      { href: "/dashboard/felanmalan", label: "Ärenden", icon: ClipboardList },
      { href: "/dashboard/arbetsorder", label: "Arbetsordrar", icon: Wrench },
      { href: "/dashboard/arbetsorder/operationsoversikt", label: "Arbetsorderöversikt", icon: LayoutList, visible: canViewOperations },
      { href: "/dashboard/arbetsorder/planering", label: "Planering", icon: UsersRound, visible: canViewOperations },
      { href: "/dashboard/kalender", label: "Kalender", icon: CalendarDays },
      { href: "/dashboard/arbetsorder/aterkommande", label: "Återkommande", icon: Repeat2, visible: canViewOperations },
      { href: "/dashboard/ronder", label: "Ronder", icon: ClipboardCheck },
      { href: "/dashboard/besiktningar", label: "Besiktningar", icon: ClipboardSignature },
      { href: "/dashboard/underhall", label: "Underhåll", icon: Hammer, visible: canViewOperations },
      { href: "/dashboard/skador", label: "Skador & försäkring", icon: ShieldAlert, visible: canViewFinanceData },
    ],
  },
  {
    id: "boende-uthyrning",
    label: "Boende & uthyrning",
    icon: DoorOpen,
    items: [
      { href: "/dashboard/boendeportal", label: "Boendeportal", icon: MessageSquareText, visible: canViewLeasingData },
      { href: "/dashboard/uthyrning", label: "Uthyrning", icon: DoorOpen, visible: canViewLeasingData },
      { href: "/dashboard/hyresavisering", label: "Hyresavisering", icon: HandCoins, visible: canViewLeasingData },
      { href: "/dashboard/bokningar", label: "Bokningar", icon: CalendarCheck2, visible: canViewLeasingData },
      { href: "/dashboard/nycklar", label: "Nycklar & passage", icon: KeyRound, visible: canManageAccessCredentials },
    ],
  },
  {
    id: "ekonomi-analys",
    label: "Ekonomi & analys",
    icon: BarChart3,
    items: [
      { href: "/dashboard/ekonomi", label: "Ekonomi", icon: WalletCards, visible: canViewFinanceData },
      { href: "/dashboard/budget", label: "Budget & prognos", icon: WalletCards, visible: canViewFinanceData },
      { href: "/dashboard/offerter", label: "Offerter", icon: ReceiptText, visible: canViewFinanceData },
      { href: "/dashboard/energi", label: "Energi", icon: Gauge, visible: canViewFinanceData },
      { href: "/dashboard/imd", label: "Mätare & IMD", icon: Gauge, visible: canViewFinanceData },
      { href: "/dashboard/rapporter", label: "Rapporter", icon: BarChart3, visible: canViewOperations },
    ],
  },
  {
    id: "dokument-projekt",
    label: "Dokument & projekt",
    icon: FolderKanban,
    items: [
      {
        href: "/dashboard/dokument",
        label: "Dokument",
        icon: FileArchive,
        visible: (role) => canViewOperations(role) || canViewLeasingData(role),
      },
      { href: "/dashboard/projekt", label: "Projekt", icon: FolderKanban, visible: canViewOperations },
    ],
  },
  {
    id: "organisation",
    label: "Organisation",
    icon: Users,
    items: [
      { href: "/dashboard/team", label: "Team", icon: Users, visible: (role) => canManageTeam(role) || canViewLeasingData(role) },
      { href: "/dashboard/leverantorer", label: "Leverantörer", icon: BriefcaseBusiness, visible: canViewOperations },
      { href: "/dashboard/behorigheter", label: "Behörigheter", icon: ShieldCheck, visible: canManageCompany },
      { href: "/dashboard/integrationer", label: "Integrationer", icon: Plug, visible: canManageIntegrations },
    ],
  },
];

export const staffSettingsNavigation: DashboardNavItem = {
  href: "/dashboard/installningar",
  label: "Inställningar",
  icon: Settings,
};

export function isDashboardNavItemActive(pathname: string, href: string) {
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

export function visibleDashboardItems(items: DashboardNavItem[], role: string) {
  return items.filter((item) => !item.visible || item.visible(role));
}

export function visibleDashboardSections(role: string) {
  return staffNavigationSections
    .map((section) => ({ ...section, items: visibleDashboardItems(section.items, role) }))
    .filter((section) => section.items.length > 0);
}

export function activeDashboardSectionId(pathname: string, sections: DashboardNavSection[]) {
  return sections.find((section) => section.items.some((item) => isDashboardNavItemActive(pathname, item.href)))?.id ?? null;
}
