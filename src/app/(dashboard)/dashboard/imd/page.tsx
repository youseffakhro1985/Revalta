import { ImdPage } from "./imd-page";

export default async function ImdRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ create?: string }>;
}) {
  const params = await searchParams;
  return <ImdPage initialCreate={params.create === "1"} />;
}
