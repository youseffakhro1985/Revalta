import { QuotesPage } from "./offerter-page";

export default async function OfferterRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ create?: string }>;
}) {
  const params = await searchParams;
  return <QuotesPage initialCreate={params.create === "1"} />;
}
