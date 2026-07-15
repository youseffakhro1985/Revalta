import { ComponentDetailView } from "@/components/properties/component-detail-view";

export default async function ComponentDetailPage({ params }: { params: Promise<{ id: string; componentId: string }> }) {
  const { id, componentId } = await params;
  return <ComponentDetailView propertyId={id} componentId={componentId} />;
}
