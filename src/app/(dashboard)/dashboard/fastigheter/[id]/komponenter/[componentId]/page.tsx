import { ComponentActivityForms } from "@/components/properties/component-activity-forms";
import { ComponentDetailView } from "@/components/properties/component-detail-view";

export default async function ComponentDetailPage({ params }: { params: Promise<{ id: string; componentId: string }> }) {
  const { id, componentId } = await params;
  return (
    <div className="space-y-6">
      <ComponentDetailView propertyId={id} componentId={componentId} />
      <ComponentActivityForms propertyId={id} componentId={componentId} />
    </div>
  );
}
