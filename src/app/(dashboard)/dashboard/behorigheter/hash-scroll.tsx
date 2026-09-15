"use client";

import { useEffect } from "react";

export function HashScroll({ ids }: { ids: string[] }) {
  useEffect(() => {
    const hash = window.location.hash;
    if (!ids.some((id) => hash === `#${id}`)) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [ids]);
  return null;
}
