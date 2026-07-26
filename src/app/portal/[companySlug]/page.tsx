import { PublicPortalClient } from "@/components/portal/public-portal-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Boendeportal",
  description: "Felanmälan och ärendeuppföljning för boende hos en organisation som använder Revalta.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default async function CompanyPortalPage({
  params,
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;
  return <PublicPortalClient companySlug={companySlug} />;
}
