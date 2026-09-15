import { DocumentsPage } from "./dokument-page";

export default async function DokumentRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ create?: string }>;
}) {
  const params = await searchParams;
  return <DocumentsPage initialCreate={params.create === "1"} />;
}
