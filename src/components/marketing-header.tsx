"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";

const navigation = [
  { href: "/#plattform", label: "Plattform" },
  { href: "/#funktioner", label: "Funktioner" },
  { href: "/portal", label: "Boendeportal" },
  { href: "/demo", label: "Boka demo" },
];

export function MarketingHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-sand-200/80 bg-[#FAFAF8]/95 backdrop-blur-sm">
      <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
        <Link
          href="/"
          aria-label="Revalta – startsida"
          className="group flex items-center gap-3 rounded-md text-ink-950 outline-none focus-visible:ring-2 focus-visible:ring-petroleum-600/25 focus-visible:ring-offset-4"
        >
          <span className="font-display text-[22px] font-semibold tracking-[-0.04em]">
            Revalta
          </span>
          <span className="hidden h-5 w-px bg-sand-300 sm:block" />
          <span className="hidden text-[10px] font-semibold uppercase leading-[1.15] tracking-[0.14em] text-ink-500 sm:block">
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
              className="rounded-md text-[13px] font-medium text-ink-600 outline-none transition-colors duration-200 ease-in-out hover:text-petroleum-700 focus-visible:ring-2 focus-visible:ring-petroleum-600/25 focus-visible:ring-offset-4"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/login"
            className="hidden rounded-lg px-3 py-2 text-[13px] font-medium text-ink-600 outline-none transition-colors duration-200 ease-in-out hover:bg-white hover:text-ink-950 focus-visible:ring-2 focus-visible:ring-petroleum-600/25 focus-visible:ring-offset-2 sm:inline-flex"
          >
            Logga in
          </Link>
          <Link
            href="/register"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-petroleum-800/15 bg-petroleum-700 px-4 text-[13px] font-semibold text-white shadow-premium-sm transition-[background-color,box-shadow] duration-200 ease-in-out hover:bg-petroleum-800 hover:shadow-premium-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-600/30 focus-visible:ring-offset-2"
          >
            Skapa konto
            <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.8} />
          </Link>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobil-huvudmeny"
            aria-label={mobileMenuOpen ? "Stäng meny" : "Öppna meny"}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-sand-300 bg-white text-ink-700 outline-none transition-colors duration-200 ease-in-out hover:bg-sand-50 focus-visible:ring-2 focus-visible:ring-petroleum-600/25 focus-visible:ring-offset-2 lg:hidden"
          >
            {mobileMenuOpen ? (
              <X aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
            ) : (
              <Menu aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
            )}
          </button>
        </div>
      </div>

      {mobileMenuOpen ? (
        <nav
          id="mobil-huvudmeny"
          aria-label="Mobilmeny"
          className="border-t border-sand-200/80 bg-[#FAFAF8] px-5 py-4 sm:px-8 lg:hidden"
        >
          <div className="flex flex-col gap-1">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-3 py-2.5 text-[14px] font-medium text-ink-700 outline-none transition-colors duration-200 ease-in-out hover:bg-white hover:text-petroleum-800 focus-visible:ring-2 focus-visible:ring-petroleum-600/25"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/login"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-lg px-3 py-2.5 text-[14px] font-medium text-ink-700 outline-none transition-colors duration-200 ease-in-out hover:bg-white hover:text-petroleum-800 focus-visible:ring-2 focus-visible:ring-petroleum-600/25"
            >
              Logga in
            </Link>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
