import { InsuranceClaimsPage } from "./skador-page";

export default async function SkadorRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ create?: string }>;
}) {
  const params = await searchParams;
  return <InsuranceClaimsPage initialCreate={params.create === "1"} />;
}
