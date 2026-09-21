"use client";

import { useEffect } from "react";

export function HashScroll({ ids }: { ids: string[] }) {
  useEffect(() => {
    const hash = window.location.hash;
    if (!ids.some((id) => hash === `#${id}`)) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (hash === "#anvandare") {
      window.setTimeout(() => document.getElementById("hantera-roller")?.focus(), 0);
    }
  }, [ids]);
  return null;
}
