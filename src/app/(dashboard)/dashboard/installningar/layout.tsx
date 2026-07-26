import Link from "next/link";
import type { ReactNode } from "react";
import { BellRing, Building2, Inbox, Siren, SlidersHorizontal, UserRoundCog } from "lucide-react";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-5">
      <nav aria-label="Inställningsområden" className="flex flex-wrap gap-2 rounded-2xl border border-sand-200 bg-white p-2 shadow-premium-sm">
        <Link href="/dashboard/installningar" className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-700 transition hover:bg-sand-50 hover:text-petroleum-800">
          <Building2 className="h-4 w-4" /> Konto och organisation
        </Link>
        <Link href="/dashboard/installningar/aviseringar" className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-700 transition hover:bg-sand-50 hover:text-petroleum-800">
          <BellRing className="h-4 w-4" /> Serviceaviseringar
        </Link>
        <Link href="/dashboard/installningar/mina-aviseringar" className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-700 transition hover:bg-sand-50 hover:text-petroleum-800">
          <UserRoundCog className="h-4 w-4" /> Mina aviseringar
        </Link>
        <Link href="/dashboard/installningar/eskaleringar" className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-700 transition hover:bg-sand-50 hover:text-petroleum-800">
          <Siren className="h-4 w-4" /> Eskaleringar
        </Link>
        <Link href="/dashboard/installningar/eskaleringar/regler" className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-700 transition hover:bg-sand-50 hover:text-petroleum-800">
          <SlidersHorizontal className="h-4 w-4" /> Eskaleringsregler
        </Link>
        <Link href="/dashboard/aviseringscenter" className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-700 transition hover:bg-sand-50 hover:text-petroleum-800">
          <Inbox className="h-4 w-4" /> Aviseringscenter
        </Link>
      </nav>
      {children}
    </div>
  );
}
