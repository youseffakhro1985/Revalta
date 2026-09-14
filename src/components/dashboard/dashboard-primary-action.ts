import { canAssignWorkOrders, canCreateProperties, canManageLeases, canManageTickets, canManageWorkOrderFinance, canViewOperations } from "@/lib/permissions";

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

  const ticketsRoot = "/dashboard/felanmalan";
  const inTickets = current === ticketsRoot || current.startsWith(`${ticketsRoot}/`);
  if (canManageTickets(role) && inTickets) {
    return { href: `${ticketsRoot}?create=1`, label: "Nytt ärende" };
  }

  const claimsRoot = "/dashboard/skador";
  const inClaims = current === claimsRoot || current.startsWith(`${claimsRoot}/`);
  if (canManageWorkOrderFinance(role) && inClaims) {
    return { href: `${claimsRoot}?create=1`, label: "Nytt skadeärende" };
  }

  if (canViewOperations(role) && (current === "/dashboard/ronder" || current.startsWith("/dashboard/ronder/"))) {
    return { href: "/dashboard/ronder?create=1", label: "Ny rond" };
  }
  if (canViewOperations(role) && (current === "/dashboard/besiktningar" || current.startsWith("/dashboard/besiktningar/"))) {
    return { href: "/dashboard/besiktningar#ny-kontroll", label: "Ny kontroll" };
  }
  if (canViewOperations(role) && (current === "/dashboard/underhall" || current.startsWith("/dashboard/underhall/"))) {
    return { href: "/dashboard/underhall#ny-underhallsatgard", label: "Ny åtgärd" };
  }
  if (canViewOperations(role) && (current === "/dashboard/kalender" || current.startsWith("/dashboard/kalender/"))) {
    return { href: "/dashboard/kalender#ny-aktivitet", label: "Ny aktivitet" };
  }
  if (canViewOperations(role) && (current === "/dashboard/leverantorer" || current.startsWith("/dashboard/leverantorer/"))) {
    return { href: "/dashboard/leverantorer#ny-leverantor", label: "Ny leverantör" };
  }
  if (canManageLeases(role) && (current === "/dashboard/bokningar" || current.startsWith("/dashboard/bokningar/"))) {
    return { href: "/dashboard/bokningar#ny-bokning", label: "Ny bokning" };
  }

  return null;
}
