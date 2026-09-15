import { redirect } from "next/navigation";
import { legacyWorkOrderEconomyRedirect } from "@/lib/dashboard-route-compat";

export default async function LegacyWorkOrderInvoiceIntegrationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(legacyWorkOrderEconomyRedirect(id));
}
