import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getCurrentUser } from "@/lib/current-user";

export default async function LegacyDashboardRouteLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <DashboardShell role={user.role} userName={user.name} userEmail={user.email}>
      {children}
    </DashboardShell>
  );
}
