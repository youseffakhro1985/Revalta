import { BillingPage } from "./billing-page";

export default async function BillingRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const params = await searchParams;
  return <BillingPage checkout={params.checkout || ""} />;
}
