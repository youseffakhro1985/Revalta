import { PublicPortalClient } from "@/components/portal/public-portal-client";
import { loadPortalTrackedTicket, type PortalSearchParams } from "@/lib/portal-page-track";

export default async function CompanyPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string }>;
  searchParams: Promise<PortalSearchParams>;
}) {
  const { companySlug } = await params;
  const query = await searchParams;
  const tracked = await loadPortalTrackedTicket(query);
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
    />
  );
}
