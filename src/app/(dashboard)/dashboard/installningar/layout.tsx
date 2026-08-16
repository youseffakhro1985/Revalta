import type { ReactNode } from "react";
import { ModuleNavigation, type ModuleNavigationSection } from "@/components/dashboard/module-navigation";
import { getCurrentUser } from "@/lib/current-user";
import { canManageBilling, canViewAudit, canViewOperations } from "@/lib/permissions";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const role = user?.role ?? "";
  const showOperationsAdmin = canViewOperations(role);
  const showAudit = canViewAudit(role);
  const showBilling = canManageBilling(role);

  const sections: ModuleNavigationSection[] = [
    {
      items: [
        { href: "/dashboard/installningar", label: "Konto och organisation", icon: "building", exact: true },
        { href: "/dashboard/installningar/aviseringar", label: "Serviceaviseringar", icon: "bell" },
        { href: "/dashboard/installningar/mina-aviseringar", label: "Mina aviseringar", icon: "userSettings" },
        { href: "/dashboard/installningar/eskaleringar", label: "Eskaleringar", icon: "siren", exact: true },
        { href: "/dashboard/installningar/eskaleringar/regler", label: "Eskaleringsregler", icon: "sliders" },
        ...(showOperationsAdmin
          ? [{ href: "/dashboard/aviseringscenter", label: "Aviseringscenter", icon: "inbox" as const }]
          : []),
      ],
    },
    {
      label: "Administration",
      items: [
        ...(showOperationsAdmin
          ? [{ href: "/dashboard/notiser", label: "Notisinställningar", icon: "bell" as const }]
          : []),
        ...(showAudit
          ? [{ href: "/dashboard/audit", label: "Händelselogg", icon: "audit" as const }]
          : []),
        ...(showOperationsAdmin
          ? [
              { href: "/dashboard/drift", label: "Driftstatus", icon: "activity" as const },
              { href: "/dashboard/arbetsorder/redigeringslas", label: "Redigeringslås", icon: "lock" as const },
            ]
          : []),
        ...(showBilling
          ? [{ href: "/dashboard/billing", label: "Abonnemang", icon: "billing" as const }]
          : []),
      ],
    },
  ];

  return (
    <div className="space-y-5">
      <ModuleNavigation ariaLabel="Inställningsområden" sections={sections} />
      {children}
    </div>
  );
}
