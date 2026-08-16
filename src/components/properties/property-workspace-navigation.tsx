"use client";

import { useEffect, useState } from "react";

export type PropertyWorkspaceNavItem = {
  id: string;
  label: string;
};

export function PropertyWorkspaceNavigation({ items }: { items: PropertyWorkspaceNavItem[] }) {
  const [activeId, setActiveId] = useState(items[0]?.id || "oversikt");

  useEffect(() => {
    const sections = items
      .map((item) => document.getElementById(item.id))
      .filter((section): section is HTMLElement => Boolean(section));
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActiveId(visible.target.id);
      },
      { rootMargin: "-18% 0px -68% 0px", threshold: [0, 0.05, 0.2, 0.5] },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav aria-label="Fastighetens arbetsområden" className="sticky top-[72px] z-20 -mx-1 overflow-x-auto rounded-2xl border border-sand-200 bg-[#FAFAF8]/95 p-1.5 shadow-premium-sm backdrop-blur-md">
      <div className="flex min-w-max gap-1">
        {items.map((item) => {
          const active = activeId === item.id;
          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              aria-current={active ? "location" : undefined}
              onClick={() => setActiveId(item.id)}
              className={`inline-flex h-10 items-center rounded-xl border px-3.5 text-sm font-semibold outline-none transition-[background-color,border-color,color,box-shadow] focus-visible:ring-2 focus-visible:ring-petroleum-300 focus-visible:ring-offset-1 ${
                active
                  ? "border-sand-200 bg-white text-petroleum-800 shadow-[0_1px_3px_rgba(17,34,31,0.06)]"
                  : "border-transparent text-ink-500 hover:border-sand-200/70 hover:bg-white/70 hover:text-ink-800"
              }`}
            >
              {item.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
