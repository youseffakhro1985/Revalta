"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BellRing,
  Building2,
  CreditCard,
  FileClock,
  Inbox,
  LayoutList,
  LockKeyhole,
  Plug,
  Repeat2,
  ShieldCheck,
  Siren,
  SlidersHorizontal,
  UserRoundCog,
  UsersRound,
  Wrench,
} from "lucide-react";

const icons = {
  activity: Activity,
  bell: BellRing,
  building: Building2,
  billing: CreditCard,
  audit: FileClock,
  inbox: Inbox,
  layout: LayoutList,
  lock: LockKeyhole,
  plug: Plug,
  repeat: Repeat2,
  shield: ShieldCheck,
  siren: Siren,
  sliders: SlidersHorizontal,
  userSettings: UserRoundCog,
  users: UsersRound,
  wrench: Wrench,
} as const;

export type ModuleNavigationIcon = keyof typeof icons;

export type ModuleNavigationItem = {
  href: string;
  label: string;
  icon?: ModuleNavigationIcon;
  exact?: boolean;
};

export type ModuleNavigationSection = {
  label?: string;
  items: ModuleNavigationItem[];
};

export function isModuleNavigationItemActive(pathname: string, item: ModuleNavigationItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function ModuleNavigation({
  ariaLabel,
  sections,
}: {
  ariaLabel: string;
  sections: ModuleNavigationSection[];
}) {
  const pathname = usePathname();
  const visibleSections = sections.filter((section) => section.items.length > 0);
  if (visibleSections.length === 0) return null;

  return (
    <nav aria-label={ariaLabel} className="rounded-2xl border border-sand-200 bg-white p-2 shadow-premium-sm">
      {visibleSections.map((section, sectionIndex) => (
        <div key={section.label || `section-${sectionIndex}`} className={sectionIndex > 0 ? "mt-2 border-t border-sand-200/80 px-1 pt-2" : ""}>
          {section.label ? (
            <p className="px-3 pb-1 pt-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-500">{section.label}</p>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {section.items.map((item) => {
              const Icon = item.icon ? icons[item.icon] : null;
              const active = isModuleNavigationItemActive(pathname, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold outline-none transition-[background-color,border-color,color,box-shadow] focus-visible:ring-2 focus-visible:ring-petroleum-300 focus-visible:ring-offset-1 ${
                    active
                      ? "border-sand-200 bg-sand-50 text-petroleum-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]"
                      : "border-transparent text-ink-600 hover:border-sand-200/70 hover:bg-sand-50/70 hover:text-petroleum-800"
                  }`}
                >
                  {Icon ? <Icon className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" /> : null}
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
