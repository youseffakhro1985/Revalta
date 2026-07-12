import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

const navigation = [
  { href: "/#plattform", label: "Plattform" },
  { href: "/#funktioner", label: "Funktioner" },
  { href: "/portal", label: "Boendeportal" },
];

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-sand-200/80 bg-[#FAFAF8]/95 backdrop-blur-sm">
      <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
        <Link
          href="/"
          aria-label="Revalta – startsida"
          className="group flex items-center gap-3 text-ink-950"
        >
          <span className="font-display text-[22px] font-semibold tracking-[-0.04em]">
            Revalta
          </span>
          <span className="hidden h-5 w-px bg-sand-300 sm:block" />
          <span className="hidden text-[10px] font-semibold uppercase leading-[1.15] tracking-[0.14em] text-ink-400 sm:block">
            Svenskt
            <br />
            fastighetssystem
          </span>
        </Link>

        <nav aria-label="Huvudmeny" className="hidden items-center gap-7 lg:flex">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-[13px] font-medium text-ink-600 transition-colors hover:text-petroleum-700"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/login"
            className="hidden rounded-lg px-3 py-2 text-[13px] font-medium text-ink-600 transition-colors hover:bg-white hover:text-ink-950 sm:inline-flex"
          >
            Logga in
          </Link>
          <Link
            href="/register"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-petroleum-700 px-4 text-[13px] font-semibold text-white shadow-premium-sm transition-colors hover:bg-petroleum-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-600/30 focus-visible:ring-offset-2"
          >
            Boka visning
            <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.8} />
          </Link>
        </div>
      </div>
    </header>
  );
}
