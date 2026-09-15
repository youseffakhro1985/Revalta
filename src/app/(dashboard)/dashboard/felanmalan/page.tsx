import { FelanmalanPage } from "./felanmalan-page";

export default async function FelanmalanRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ create?: string }>;
}) {
  const params = await searchParams;
  return <FelanmalanPage initialCreate={params.create === "1"} />;
}
