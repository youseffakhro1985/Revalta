import { ComponentActivityForms } from "@/components/properties/component-activity-forms";
import { ComponentAuditReport } from "@/components/properties/component-audit-report";
import { ComponentDetailView } from "@/components/properties/component-detail-view";
import { ComponentEntryCorrections } from "@/components/properties/component-entry-corrections";
import { ComponentMaintenanceSettings } from "@/components/properties/component-maintenance-settings";
import { ComponentWorkOrderPanel } from "@/components/properties/component-work-order-panel";

export default async function ComponentDetailPage({ params }: { params: Promise<{ id: string; componentId: string }> }) {
  const { id, componentId } = await params;
  return (
    <div className="space-y-6">
      <ComponentDetailView propertyId={id} componentId={componentId} />
      <ComponentMaintenanceSettings propertyId={id} componentId={componentId} />
      <ComponentWorkOrderPanel propertyId={id} componentId={componentId} />
      <ComponentActivityForms propertyId={id} componentId={componentId} />
      <ComponentEntryCorrections propertyId={id} componentId={componentId} />
      <ComponentAuditReport propertyId={id} componentId={componentId} />
    </div>
  );
}
