import { PublicPortalClient } from "@/components/portal/public-portal-client";
import { loadPortalTrackedTicket, type PortalSearchParams } from "@/lib/portal-page-track";
import { loadPublicPortalCatalogSafe } from "@/lib/public-portal-properties";

export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<PortalSearchParams>;
}) {
  const params = await searchParams;
  const [tracked, catalog] = await Promise.all([
    loadPortalTrackedTicket(params),
    loadPublicPortalCatalogSafe(null),
  ]);
  return (
    <PublicPortalClient
      initialCreated={params.created === "1"}
      initialReference={params.ref?.trim() || ""}
      initialReason={params.reason}
      initialToken={tracked.trackingToken || params.token?.trim() || ""}
      initialTrackEmail={params.email?.trim() || ""}
      initialTrackedTicket={tracked.ticket}
      initialTrackError={tracked.error}
      initialCommented={params.commented === "1"}
      initialAttached={params.attached === "1"}
      initialFeedback={params.feedback === "1"}
      initialCatalog={{
        properties: catalog.properties,
        companyName: catalog.companyName,
        error: catalog.error || undefined,
      }}
    />
  );
}
