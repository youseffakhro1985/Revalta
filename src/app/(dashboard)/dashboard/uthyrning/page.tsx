import { LeasingPage } from "./uthyrning-page";

export default async function UthyrningRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ create?: string }>;
}) {
  const params = await searchParams;
  return <LeasingPage initialCreate={params.create === "1"} />;
}
