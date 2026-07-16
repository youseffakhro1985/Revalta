import { ComponentActivityForms } from "@/components/properties/component-activity-forms";
import { ComponentDetailView } from "@/components/properties/component-detail-view";
import { ComponentEntryCorrections } from "@/components/properties/component-entry-corrections";

export default async function ComponentDetailPage({ params }: { params: Promise<{ id: string; componentId: string }> }) {
  const { id, componentId } = await params;
  return (
    <div className="space-y-6">
      <ComponentDetailView propertyId={id} componentId={componentId} />
      <ComponentActivityForms propertyId={id} componentId={componentId} />
      <ComponentEntryCorrections propertyId={id} componentId={componentId} />
    </div>
  );
}
