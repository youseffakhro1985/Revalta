import { PublicPortalClient } from "@/components/portal/public-portal-client";
import { loadPortalTrackedTicket, type PortalSearchParams } from "@/lib/portal-page-track";

export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<PortalSearchParams>;
}) {
  const params = await searchParams;
  const tracked = await loadPortalTrackedTicket(params);
  return (
    <PublicPortalClient
      initialCreated={params.created === "1"}
      initialReference={params.ref?.trim() || ""}
      initialReason={params.reason}
      initialToken={tracked.trackingToken || params.token?.trim() || ""}
      initialTrackEmail={params.email?.trim() || ""}
      initialTrackedTicket={tracked.ticket}
      initialTrackError={tracked.error}
    />
  );
}
