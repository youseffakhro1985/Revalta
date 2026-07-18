"use client";

import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { useEffect, useState } from "react";

type LockSummary = { locks?: unknown[] };

export function WorkOrderLockIndicator() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch("/api/work-orders/edit-locks", { cache: "no-store" });
        if (!response.ok) {
          if (active) setCount(0);
          return;
        }
        const data = await response.json() as LockSummary;
        if (active) setCount(Array.isArray(data.locks) ? data.locks.length : 0);
      } catch {
        if (active) setCount(0);
      }
    }

    void load();
    const interval = window.setInterval(load, 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  if (count === 0) return null;

  return (
    <Link
      href="/dashboard/arbetsorder/redigeringslas"
      className="hidden h-10 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-900 transition hover:border-amber-300 hover:bg-amber-100 md:inline-flex"
      aria-label={`${count} aktiva redigeringslås för arbetsordrar`}
    >
      <LockKeyhole className="h-4 w-4" aria-hidden="true" />
      <span>{count} aktiva lås</span>
    </Link>
  );
}
