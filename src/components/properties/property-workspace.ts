import {
  canManageTickets,
  canViewFinanceData,
  canViewLeasingData,
  canViewOperations,
} from "@/lib/permissions";

export const PROPERTY_WORKSPACE_SECTIONS = [
  "oversikt",
  "enheter",
  "drift",
  "teknik",
  "underhall",
  "hyresgaster",
  "dokument",
  "energi",
  "ekonomi",
] as const;

export type PropertyWorkspaceSectionId = (typeof PROPERTY_WORKSPACE_SECTIONS)[number];

export type PropertyWorkspaceSection = {
  id: PropertyWorkspaceSectionId;
  label: string;
};

export type PropertyWorkspaceCapabilities = {
  canOperate: boolean;
  canViewMaintenance: boolean;
  canViewLeasing: boolean;
  canViewDocuments: boolean;
  canViewFinance: boolean;
};

export function propertyWorkspaceCapabilities(role: string): PropertyWorkspaceCapabilities {
  const canOperate = canManageTickets(role) || canViewOperations(role);
  const canViewLeasing = canViewLeasingData(role);
  return {
    canOperate,
    canViewMaintenance: canViewOperations(role),
    canViewLeasing,
    canViewDocuments: canOperate || canViewLeasing,
    canViewFinance: canViewFinanceData(role),
  };
}

export function propertyWorkspaceSectionsForRole(role: string): PropertyWorkspaceSection[] {
  const capabilities = propertyWorkspaceCapabilities(role);
  return [
    { id: "oversikt", label: "Översikt" },
    { id: "enheter", label: "Enheter" },
    ...(capabilities.canOperate
      ? [
          { id: "drift", label: "Drift" } as const,
          { id: "teknik", label: "Teknik" } as const,
        ]
      : []),
    ...(capabilities.canViewMaintenance ? [{ id: "underhall", label: "Underhåll" } as const] : []),
    ...(capabilities.canViewLeasing ? [{ id: "hyresgaster", label: "Hyresgäster" } as const] : []),
    ...(capabilities.canViewDocuments ? [{ id: "dokument", label: "Dokument" } as const] : []),
    ...(capabilities.canViewFinance
      ? [
          { id: "energi", label: "Energi" } as const,
          { id: "ekonomi", label: "Ekonomi" } as const,
        ]
      : []),
  ];
}
