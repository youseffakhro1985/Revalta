import { redirect } from "next/navigation";
import { legacyWorkOrderDetailRedirect } from "@/lib/dashboard-route-compat";

export default async function LegacyWorkOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(legacyWorkOrderDetailRedirect(id));
}
