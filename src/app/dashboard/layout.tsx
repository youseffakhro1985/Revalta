import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export default function LegacyDashboardRouteLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
