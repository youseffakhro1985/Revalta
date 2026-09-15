import { RoundsPage } from "./ronder-page";

export default async function RonderRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ create?: string }>;
}) {
  const params = await searchParams;
  return <RoundsPage initialCreate={params.create === "1"} />;
}
