import { RentNoticesPage } from "./rent-notices-page";

export default async function HyresaviseringPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const params = await searchParams;
  return <RentNoticesPage initialFocusedId={(params.id || "").trim()} />;
}
