import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { OperationalDocumentsPanel } from "@/components/dashboard/operational-documents-panel";
import { ComponentRegistryManager } from "@/components/properties/component-registry-manager";
import { ComponentRegistryOverview } from "@/components/properties/component-registry-overview";
import { MaintenanceActionManager } from "@/components/properties/maintenance-action-manager";
import { MaintenanceBudgetTimeline } from "@/components/properties/maintenance-budget-timeline";
import { MaintenancePlanExportCard } from "@/components/properties/maintenance-plan-export-card";
import { MaintenancePlanGovernance } from "@/components/properties/maintenance-plan-governance";
import { MaintenancePlanPanel } from "@/components/properties/maintenance-plan-panel";
import { PropertyCardManager } from "@/components/properties/property-card-manager";
import { PropertyCardOperations } from "@/components/properties/property-card-operations";
import { PropertyLifecycleTimeline } from "@/components/properties/property-lifecycle-timeline";
import { propertyWorkspaceCapabilities } from "@/components/properties/property-workspace";
import { getCurrentUser } from "@/lib/current-user";
import { isResident } from "@/lib/permissions";
import { residentHomePath } from "@/lib/resident-access";

export default async function PropertyCardLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (isResident(user.role)) redirect(residentHomePath());

  const { id } = await params;
  const capabilities = propertyWorkspaceCapabilities(user.role);

  return (
    <div className="space-y-10">
      {children}

      {capabilities.canOperate ? (
        <section id="drift" aria-labelledby="property-operations-heading" className="scroll-mt-36 space-y-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-petroleum-600">Drift</p>
            <h2 id="property-operations-heading" className="mt-1 text-2xl font-semibold tracking-[-0.025em] text-ink-950">Drift och livscykel</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-500">Arbetsordrar, service, besiktningar, avtal och andra driftrelaterade händelser samlade på fastigheten.</p>
          </div>
          <PropertyCardOperations propertyId={id} />
          {capabilities.canManagePropertyRecords ? <PropertyCardManager propertyId={id} /> : null}
          <PropertyLifecycleTimeline propertyId={id} />
        </section>
      ) : null}

      {capabilities.canOperate ? (
        <section id="teknik" aria-labelledby="property-technical-heading" className="scroll-mt-36 space-y-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-petroleum-600">Teknik</p>
            <h2 id="property-technical-heading" className="mt-1 text-2xl font-semibold tracking-[-0.025em] text-ink-950">Tekniska installationer och komponenter</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-500">Komponentregister, tekniskt skick, livslängd och servicehistorik från fastighetens befintliga tekniska register.</p>
          </div>
          <ComponentRegistryOverview propertyId={id} />
          {capabilities.canManagePropertyRecords ? <ComponentRegistryManager propertyId={id} /> : null}
        </section>
      ) : null}

      {capabilities.canViewMaintenance ? (
        <section id="underhall" aria-labelledby="property-maintenance-heading" className="scroll-mt-36 space-y-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-petroleum-600">Underhåll</p>
            <h2 id="property-maintenance-heading" className="mt-1 text-2xl font-semibold tracking-[-0.025em] text-ink-950">Planerat underhåll och investeringsbehov</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-500">Underhållsplan, budgettidslinje, governance och åtgärder återanvänder befintliga underhållsdata för fastigheten.</p>
          </div>
          <MaintenancePlanPanel propertyId={id} />
          <MaintenancePlanExportCard propertyId={id} />
          <MaintenancePlanGovernance propertyId={id} />
          <MaintenanceBudgetTimeline propertyId={id} />
          <div className="rounded-2xl border border-sand-200 bg-white p-5 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">Hela beståndet</p>
              <h3 className="mt-2 text-lg font-semibold text-ink-950">Jämför fastigheten med portföljen</h3>
              <p className="mt-1 text-sm leading-6 text-ink-500">Öppna organisationsvyn för samlad budget, finansieringsbehov, underhållsskuld och riskjämförelse.</p>
            </div>
            <Link href="/dashboard/underhall/portfolio" className="mt-4 inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-petroleum-800 px-5 text-sm font-semibold text-white transition hover:bg-petroleum-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petroleum-300 sm:mt-0">
              Visa portföljbudget <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <MaintenanceActionManager propertyId={id} />
        </section>
      ) : null}

      {capabilities.canViewDocuments ? (
        <section id="dokument" aria-labelledby="property-documents-heading" className="scroll-mt-36 space-y-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-petroleum-600">Dokument</p>
            <h2 id="property-documents-heading" className="mt-1 text-2xl font-semibold tracking-[-0.025em] text-ink-950">Fastighetsdokument</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-500">Ritningar, driftinstruktioner, garantier, besiktningsprotokoll, avtal och andra underlag i samma digitala fastighetspärm.</p>
          </div>
          <OperationalDocumentsPanel
            entityType="property"
            entityId={id}
            title="Dokumentarkiv"
            description="Ladda upp och hitta underlag som hör till den här fastigheten."
          />
        </section>
      ) : null}
    </div>
  );
}
