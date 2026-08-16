import Link from "next/link";
import type { ReactNode } from "react";
import {
  Activity,
  BellRing,
  Building2,
  CreditCard,
  FileClock,
  Inbox,
  LockKeyhole,
  Siren,
  SlidersHorizontal,
  UserRoundCog,
} from "lucide-react";
import { getCurrentUser } from "@/lib/current-user";
import { canManageBilling, canViewAudit, canViewOperations } from "@/lib/permissions";

const linkClass = "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-700 outline-none transition hover:bg-sand-50 hover:text-petroleum-800 focus-visible:ring-2 focus-visible:ring-petroleum-300";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const role = user?.role ?? "";
  const showOperationsAdmin = canViewOperations(role);
  const showAudit = canViewAudit(role);
  const showBilling = canManageBilling(role);
  const showAdminTools = showOperationsAdmin || showAudit || showBilling;

  return (
    <div className="space-y-5">
      <nav aria-label="Inställningsområden" className="rounded-2xl border border-sand-200 bg-white p-2 shadow-premium-sm">
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/installningar" className={linkClass}>
            <Building2 className="h-4 w-4" /> Konto och organisation
          </Link>
          <Link href="/dashboard/installningar/aviseringar" className={linkClass}>
            <BellRing className="h-4 w-4" /> Serviceaviseringar
          </Link>
          <Link href="/dashboard/installningar/mina-aviseringar" className={linkClass}>
            <UserRoundCog className="h-4 w-4" /> Mina aviseringar
          </Link>
          <Link href="/dashboard/installningar/eskaleringar" className={linkClass}>
            <Siren className="h-4 w-4" /> Eskaleringar
          </Link>
          <Link href="/dashboard/installningar/eskaleringar/regler" className={linkClass}>
            <SlidersHorizontal className="h-4 w-4" /> Eskaleringsregler
          </Link>
          {showOperationsAdmin ? (
            <Link href="/dashboard/aviseringscenter" className={linkClass}>
              <Inbox className="h-4 w-4" /> Aviseringscenter
            </Link>
          ) : null}
        </div>

        {showAdminTools ? (
          <div className="mt-2 border-t border-sand-200/80 px-1 pt-2">
            <p className="px-3 pb-1 pt-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-500">Administration</p>
            <div className="flex flex-wrap gap-2">
              {showOperationsAdmin ? (
                <Link href="/dashboard/notiser" className={linkClass}>
                  <BellRing className="h-4 w-4" /> Notisinställningar
                </Link>
              ) : null}
              {showAudit ? (
                <Link href="/dashboard/audit" className={linkClass}>
                  <FileClock className="h-4 w-4" /> Händelselogg
                </Link>
              ) : null}
              {showOperationsAdmin ? (
                <Link href="/dashboard/drift" className={linkClass}>
                  <Activity className="h-4 w-4" /> Driftstatus
                </Link>
              ) : null}
              {showOperationsAdmin ? (
                <Link href="/dashboard/arbetsorder/redigeringslas" className={linkClass}>
                  <LockKeyhole className="h-4 w-4" /> Redigeringslås
                </Link>
              ) : null}
              {showBilling ? (
                <Link href="/dashboard/billing" className={linkClass}>
                  <CreditCard className="h-4 w-4" /> Abonnemang
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </nav>
      {children}
    </div>
  );
}
