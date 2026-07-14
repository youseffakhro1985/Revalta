import { OperationalDocumentsPanel } from "@/components/dashboard/operational-documents-panel";
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
    </div>
  );
}
