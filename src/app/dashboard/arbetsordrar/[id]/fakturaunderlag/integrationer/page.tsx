import { redirect } from "next/navigation";

export default async function LegacyWorkOrderInvoiceIntegrationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/dashboard/arbetsorder/${id}`);
}
