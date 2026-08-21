import { canAssignWorkOrders, canCreateProperties } from "@/lib/permissions";

export type DashboardPrimaryCreateAction = {
  href: string;
  label: string;
};

function normalizedPath(pathname: string) {
  const clean = pathname.split(/[?#]/, 1)[0] || "/dashboard";
  return clean.length > 1 ? clean.replace(/\/+$/, "") : clean;
}

export function dashboardPrimaryCreateAction(pathname: string, role: string): DashboardPrimaryCreateAction | null {
  const current = normalizedPath(pathname);
  const propertiesRoot = "/dashboard/fastigheter";
  const workOrdersRoot = "/dashboard/arbetsorder";

  const inProperties = current === propertiesRoot || current.startsWith(`${propertiesRoot}/`);
  const creatingProperty = current === `${propertiesRoot}/ny` || current.startsWith(`${propertiesRoot}/ny/`);
  if (canCreateProperties(role) && inProperties && !creatingProperty) {
    return { href: `${propertiesRoot}/ny`, label: "Ny fastighet" };
  }

  const inWorkOrders = current === workOrdersRoot || current.startsWith(`${workOrdersRoot}/`);
  const creatingWorkOrder = current === `${workOrdersRoot}/ny` || current.startsWith(`${workOrdersRoot}/ny/`);
  const editLockAdmin = current === `${workOrdersRoot}/redigeringslas` || current.startsWith(`${workOrdersRoot}/redigeringslas/`);
  if (canAssignWorkOrders(role) && (current === "/dashboard" || (inWorkOrders && !creatingWorkOrder && !editLockAdmin))) {
    return { href: `${workOrdersRoot}/ny`, label: "Ny arbetsorder" };
  }

  return null;
}
