import { PublicPortalClient } from "@/components/portal/public-portal-client";
import { loadPortalTrackedTicket, type PortalSearchParams } from "@/lib/portal-page-track";
import { loadPublicPortalCatalogSafe } from "@/lib/public-portal-properties";

export default async function CompanyPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string }>;
  searchParams: Promise<PortalSearchParams>;
}) {
  const { companySlug } = await params;
  const query = await searchParams;
  const [tracked, catalog] = await Promise.all([
    loadPortalTrackedTicket(query),
    loadPublicPortalCatalogSafe(companySlug),
  ]);
  return (
    <PublicPortalClient
      companySlug={companySlug}
      initialCreated={query.created === "1"}
      initialReference={query.ref?.trim() || ""}
      initialReason={query.reason}
      initialToken={tracked.trackingToken || query.token?.trim() || ""}
      initialTrackEmail={query.email?.trim() || ""}
      initialTrackedTicket={tracked.ticket}
      initialTrackError={tracked.error}
      initialCommented={query.commented === "1"}
      initialAttached={query.attached === "1"}
      initialCatalog={{
        properties: catalog.properties,
        companyName: catalog.companyName,
        error: catalog.error || undefined,
      }}
    />
  );
}
