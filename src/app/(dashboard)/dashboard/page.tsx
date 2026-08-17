import { redirect } from "next/navigation";
import { PortfolioDashboard } from "@/components/dashboard/portfolio-dashboard";
import { ManagerDashboard } from "@/components/dashboard/manager-dashboard";
import { TechnicianDashboard } from "@/components/dashboard/technician-dashboard";
import { ViewerDashboard } from "@/components/dashboard/viewer-dashboard";
import { FirstRunOnboarding } from "@/components/dashboard/first-run-onboarding";
import { dashboardModeForRole } from "@/components/dashboard/dashboard-role";
import { canManageCompany, getCurrentUser } from "@/lib/current-user";
import { residentHomePath } from "@/lib/resident-access";
import { getCachedSchemaReadiness, schemaCompatibilityBannerMessage } from "@/lib/schema-readiness";

export default async function Dashboard() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const mode = dashboardModeForRole(user.role);
  if (mode === "resident") redirect(residentHomePath());

  const schema = await getCachedSchemaReadiness();

  return (
    <div className="animate-fade-in-soft space-y-6 sm:space-y-7">
      {!schema.ready ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900 shadow-sm" role="status">
          <p className="font-semibold">Kompatibilitetsläge</p>
          <p className="mt-1 text-sm leading-6">{schemaCompatibilityBannerMessage()}</p>
          {schema.missing.length > 0 ? (
            <p className="mt-2 text-xs text-amber-800/80">
              Saknas: {schema.missing.map((item) => `${item.table}.${item.column}`).join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}

      {!user.email_verified_at ? (
        <div className="rounded-2xl border border-warning-200 bg-warning-50 p-5 text-warning-700 shadow-sm" role="status">
          <p className="font-semibold">E-postadressen är inte verifierad ännu.</p>
          <p className="mt-1 text-sm">Verifiera adressen för säkrare kontoåterställning och framtida systemnotiser.</p>
        </div>
      ) : null}

      {schema.ready && canManageCompany(user.role) ? <FirstRunOnboarding /> : null}

      {schema.ready ? (
        mode === "portfolio" ? <PortfolioDashboard user={user} />
          : mode === "manager" ? <ManagerDashboard user={user} />
            : mode === "technician" ? <TechnicianDashboard user={user} />
              : <ViewerDashboard user={user} />
      ) : (
        <section className="rounded-2xl border border-sand-200 bg-white p-7 shadow-premium-sm sm:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">Dashboard</p>
          <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.035em] text-ink-950">Dashboarden väntar på databasrelease</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-600">Den rollbaserade arbetsytan aktiveras automatiskt när den dokumenterade produktionsmigreringen är klar. Inga osäkra fallback-frågor körs mot ett ofullständigt schema.</p>
        </section>
      )}
    </div>
  );
}
