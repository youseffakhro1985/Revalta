export const DASHBOARD_MODES = ["portfolio", "manager", "technician", "viewer", "resident"] as const;

export type DashboardMode = (typeof DASHBOARD_MODES)[number];

export function dashboardModeForRole(role: string): DashboardMode {
  if (role === "owner" || role === "admin") return "portfolio";
  if (role === "manager") return "manager";
  if (role === "technician") return "technician";
  if (role === "resident") return "resident";
  return "viewer";
}
