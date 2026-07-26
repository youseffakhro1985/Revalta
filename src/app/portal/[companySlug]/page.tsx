import { PublicPortalClient } from "@/components/portal/public-portal-client";

export default async function CompanyPortalPage({
  params,
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;
  return <PublicPortalClient companySlug={companySlug} />;
}
