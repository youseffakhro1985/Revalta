import { PublicPortalClient } from "@/components/portal/public-portal-client";

type PortalSearchParams = {
  created?: string;
  ref?: string;
  reason?: string;
  token?: string;
};

export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<PortalSearchParams>;
}) {
  const params = await searchParams;
  return (
    <PublicPortalClient
      initialCreated={params.created === "1"}
      initialReference={params.ref?.trim() || ""}
      initialReason={params.reason}
      initialToken={params.token?.trim() || ""}
    />
  );
}
