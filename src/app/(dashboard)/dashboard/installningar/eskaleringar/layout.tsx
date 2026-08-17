import Link from "next/link";
import type { ReactNode } from "react";

export default function EscalationSettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-4">
      <nav aria-label="Serviceeskaleringar" className="mx-auto flex max-w-7xl flex-wrap gap-2 rounded-2xl border border-sand-200/80 bg-white p-2 shadow-premium-sm">
        <Link href="/dashboard/installningar/eskaleringar" className="rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-700 transition hover:bg-sand-50 hover:text-petroleum-800">Driftöversikt</Link>
        <Link href="/dashboard/installningar/eskaleringar/regler" className="rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-700 transition hover:bg-sand-50 hover:text-petroleum-800">Regler och mottagare</Link>
      </nav>
      {children}
    </div>
  );
}
