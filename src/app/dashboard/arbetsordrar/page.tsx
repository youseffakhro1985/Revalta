import { redirect } from "next/navigation";
import { legacyDashboardRedirects } from "@/lib/dashboard-route-compat";

export default function LegacyWorkOrdersIndexPage() {
  redirect(legacyDashboardRedirects.workOrders);
}
