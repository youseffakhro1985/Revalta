import { canAssignWorkOrders, canCreateProperties, canManageAccessCredentials, canManageLeases, canManageTickets, canManageWorkOrderFinance, canViewOperations } from "@/lib/permissions";

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
  const recurringSchedules = current === `${workOrdersRoot}/aterkommande` || current.startsWith(`${workOrdersRoot}/aterkommande/`);
  if (canAssignWorkOrders(role) && (current === "/dashboard" || (inWorkOrders && !creatingWorkOrder && !editLockAdmin && !recurringSchedules))) {
    return { href: `${workOrdersRoot}/ny`, label: "Ny arbetsorder" };
  }
  if (canAssignWorkOrders(role) && current === `${workOrdersRoot}/aterkommande`) {
    return { href: `${workOrdersRoot}/aterkommande#nytt-schema`, label: "Nytt schema" };
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

  if (canManageWorkOrderFinance(role) && (current === "/dashboard/projekt" || current.startsWith("/dashboard/projekt/"))) {
    return { href: "/dashboard/projekt?create=1", label: "Nytt projekt" };
  }

  if (canManageWorkOrderFinance(role) && (current === "/dashboard/offerter" || current.startsWith("/dashboard/offerter/"))) {
    return { href: "/dashboard/offerter?create=1", label: "Ny offert" };
  }

  if (canManageWorkOrderFinance(role) && (current === "/dashboard/imd" || current.startsWith("/dashboard/imd/"))) {
    return { href: "/dashboard/imd?create=1", label: "Ny avläsning" };
  }

  if (canManageWorkOrderFinance(role) && (current === "/dashboard/dokument" || current.startsWith("/dashboard/dokument/"))) {
    return { href: "/dashboard/dokument?create=1", label: "Nytt dokument" };
  }

  if (canManageWorkOrderFinance(role) && (current === "/dashboard/energi" || current.startsWith("/dashboard/energi/"))) {
    return { href: "/dashboard/energi#ny-avlasning", label: "Ny avläsning" };
  }

  if (canManageWorkOrderFinance(role) && (current === "/dashboard/budget" || current.startsWith("/dashboard/budget/"))) {
    return { href: "/dashboard/budget#ny-budgetrad", label: "Ny budgetrad" };
  }

  if (canManageWorkOrderFinance(role) && current === "/dashboard/ekonomi") {
    return { href: "/dashboard/ekonomi/ny-utbetalning", label: "Ny utbetalning" };
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
  if (canManageLeases(role) && (current === "/dashboard/uthyrning" || current.startsWith("/dashboard/uthyrning/"))) {
    const handover = current === "/dashboard/uthyrning/overlamning" || current.startsWith("/dashboard/uthyrning/overlamning/");
    if (!handover) {
      return { href: "/dashboard/uthyrning?create=1", label: "Nytt avtal" };
    }
  }
  if (canManageLeases(role) && (current === "/dashboard/bokningar" || current.startsWith("/dashboard/bokningar/"))) {
    return { href: "/dashboard/bokningar#ny-bokning", label: "Ny bokning" };
  }
  if (canManageLeases(role) && (current === "/dashboard/hyresavisering" || current.startsWith("/dashboard/hyresavisering/"))) {
    return { href: "/dashboard/hyresavisering#ny-hyresavi", label: "Ny hyresavi" };
  }
  if (canManageAccessCredentials(role) && (current === "/dashboard/nycklar" || current.startsWith("/dashboard/nycklar/"))) {
    return { href: "/dashboard/nycklar#ny-nyckel", label: "Ny nyckel" };
  }

  if (current === "/dashboard/installningar") {
    return { href: "/dashboard/installningar#losenord", label: "Byt lösenord" };
  }
  if (current === "/dashboard/installningar/aviseringar") {
    return { href: "/dashboard/installningar/aviseringar#aviseringsinstallningar", label: "Aviseringsval" };
  }
  if (current === "/dashboard/installningar/mina-aviseringar") {
    return { href: "/dashboard/installningar/mina-aviseringar#mina-val", label: "Mina val" };
  }
  if (current === "/dashboard/installningar/eskaleringar") {
    return { href: "/dashboard/installningar/eskaleringar/regler", label: "Hantera regler" };
  }
  if (current === "/dashboard/installningar/eskaleringar/regler") {
    return { href: "/dashboard/installningar/eskaleringar/regler#eskaleringsregler", label: "Spara regler" };
  }

  return null;
}
