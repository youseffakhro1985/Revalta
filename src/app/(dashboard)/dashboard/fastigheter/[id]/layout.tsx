import Link from "next/link";
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

export default async function PropertyCardLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="space-y-8">
      {children}
      <section aria-labelledby="property-operations-heading" className="space-y-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-petroleum-600">Digital fastighetspärm</p>
          <h2 id="property-operations-heading" className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-ink-950">Drift, teknik och avtal</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-500">Samlad överblick över tekniska installationer, service, garantier, besiktningar, avtal, arbetsordrar och projekt.</p>
        </div>
        <PropertyCardOperations propertyId={id} />
        <PropertyCardManager propertyId={id} />
        <PropertyLifecycleTimeline propertyId={id} />
        <OperationalDocumentsPanel
          entityType="property"
          entityId={id}
          title="Fastighetsdokument"
          description="Samla ritningar, driftinstruktioner, garantier, besiktningsprotokoll, avtal och andra underlag i fastighetens digitala pärm."
        />
      </section>
      <ComponentRegistryOverview propertyId={id} />
      <ComponentRegistryManager propertyId={id} />
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
        <Link href="/dashboard/underhall/portfolio" className="mt-4 inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-petroleum-800 px-5 text-sm font-semibold text-white transition hover:bg-petroleum-900 sm:mt-0">
          Visa portföljbudget <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
      <MaintenanceActionManager propertyId={id} />
    </div>
  );
}
