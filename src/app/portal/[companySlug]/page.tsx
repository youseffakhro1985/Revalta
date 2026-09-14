import { PublicPortalClient } from "@/components/portal/public-portal-client";

type PortalSearchParams = {
  created?: string;
  ref?: string;
  reason?: string;
  token?: string;
};

export default async function CompanyPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string }>;
  searchParams: Promise<PortalSearchParams>;
}) {
  const { companySlug } = await params;
  const query = await searchParams;
  return (
    <PublicPortalClient
      companySlug={companySlug}
      initialCreated={query.created === "1"}
      initialReference={query.ref?.trim() || ""}
      initialReason={query.reason}
      initialToken={query.token?.trim() || ""}
    />
  );
}
