import { canCreateProperties, canManageTeam, canManageTickets } from "@/lib/permissions";

export type CommandCenterQuickAction = {
  id: string;
  label: string;
  description: string;
  href: string;
  kind: "ticket" | "work_order" | "property" | "team";
};

export function commandCenterQuickActions(role: string): CommandCenterQuickAction[] {
  return [
    ...(canManageTickets(role)
      ? [
          {
            id: "new-work-order",
            label: "Ny arbetsorder",
            description: "Planera ett nytt uppdrag",
            href: "/dashboard/arbetsorder/ny",
            kind: "work_order" as const,
          },
          {
            id: "new-ticket",
            label: "Registrera ärende",
            description: "Öppna ärenden och registrera nytt",
            href: "/dashboard/felanmalan",
            kind: "ticket" as const,
          },
        ]
      : []),
    ...(canCreateProperties(role)
      ? [{
          id: "new-property",
          label: "Lägg till fastighet",
          description: "Registrera en ny fastighet",
          href: "/dashboard/fastigheter/ny",
          kind: "property" as const,
        }]
      : []),
    ...(canManageTeam(role)
      ? [{
          id: "invite-team",
          label: "Bjud in team",
          description: "Hantera organisationens användare",
          href: "/dashboard/team",
          kind: "team" as const,
        }]
      : []),
  ];
}
