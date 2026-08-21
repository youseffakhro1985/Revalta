import { describe, expect, it } from "vitest";
import {
  activeDashboardSectionId,
  isDashboardNavItemActive,
  staffAdministrationNavigation,
  staffPrimaryNavigation,
  visibleDashboardItems,
  visibleDashboardSections,
} from "@/components/dashboard/dashboard-navigation";

function sectionLabels(role: string) {
  return visibleDashboardSections(role).map((section) => section.label);
}

function itemLabels(role: string, sectionId: string) {
  return visibleDashboardSections(role).find((section) => section.id === sectionId)?.items.map((item) => item.label) ?? [];
}

describe("dashboard navigation v2", () => {
  it("håller de två primära destinationerna stabila", () => {
    expect(staffPrimaryNavigation.map((item) => item.label)).toEqual(["Översikt", "Fastigheter"]);
  });

  it("ger owner de fem beslutade modulområdena i rätt ordning", () => {
    expect(sectionLabels("owner")).toEqual([
      "Drift",
      "Boende & uthyrning",
      "Ekonomi & analys",
      "Dokument & projekt",
      "Organisation",
    ]);
  });

  it("håller globala Drift-menyn på modulnivå och lämnar arbetsorderns underflöden i modulen", () => {
    expect(itemLabels("owner", "drift")).toEqual([
      "Ärenden",
      "Arbetsordrar",
      "Kalender",
      "Ronder",
      "Besiktningar",
      "Underhåll",
      "Skador & försäkring",
    ]);
  });

  it("håller organisationen operativ och flyttar systemadministration till Inställningar", () => {
    expect(itemLabels("owner", "organisation")).toEqual(["Team", "Leverantörer"]);
    expect(visibleDashboardItems(staffAdministrationNavigation, "owner").map((item) => item.label)).toEqual([
      "Inställningar",
      "Behörigheter",
      "Integrationer",
    ]);
    expect(visibleDashboardItems(staffAdministrationNavigation, "manager").map((item) => item.label)).toEqual([
      "Inställningar",
    ]);
  });

  it("bevarar rollstyrningen för technician och kalendern som generell planeringsyta", () => {
    expect(itemLabels("technician", "drift")).toEqual([
      "Ärenden",
      "Arbetsordrar",
      "Kalender",
      "Ronder",
      "Besiktningar",
    ]);
    expect(sectionLabels("technician")).toEqual(["Drift"]);
  });

  it("bevarar leasing- och finansläsning för viewer utan adminverktyg", () => {
    expect(sectionLabels("viewer")).toEqual([
      "Drift",
      "Boende & uthyrning",
      "Ekonomi & analys",
      "Dokument & projekt",
      "Organisation",
    ]);
    expect(itemLabels("viewer", "organisation")).toEqual(["Team"]);
    expect(itemLabels("viewer", "dokument-projekt")).toEqual(["Dokument"]);
  });

  it("markerar arbetsorderns rot för hela modulflödet men inte redigeringslåsets administration", () => {
    expect(isDashboardNavItemActive("/dashboard/arbetsorder/AO-2026-0142", "/dashboard/arbetsorder")).toBe(true);
    expect(isDashboardNavItemActive("/dashboard/arbetsorder/operationsoversikt", "/dashboard/arbetsorder")).toBe(true);
    expect(isDashboardNavItemActive("/dashboard/arbetsorder/planering", "/dashboard/arbetsorder")).toBe(true);
    expect(isDashboardNavItemActive("/dashboard/arbetsorder/aterkommande", "/dashboard/arbetsorder")).toBe(true);
    expect(isDashboardNavItemActive("/dashboard/arbetsorder/redigeringslas", "/dashboard/arbetsorder")).toBe(false);
  });

  it("öppnar rätt modulområde för en aktiv underroute", () => {
    const sections = visibleDashboardSections("owner");
    expect(activeDashboardSectionId("/dashboard/arbetsorder/operationsoversikt", sections)).toBe("drift");
    expect(activeDashboardSectionId("/dashboard/arbetsorder/planering", sections)).toBe("drift");
    expect(activeDashboardSectionId("/dashboard/kalender", sections)).toBe("drift");
    expect(activeDashboardSectionId("/dashboard/hyresavisering", sections)).toBe("boende-uthyrning");
    expect(activeDashboardSectionId("/dashboard/energi", sections)).toBe("ekonomi-analys");
    expect(activeDashboardSectionId("/dashboard/dokument", sections)).toBe("dokument-projekt");
    expect(activeDashboardSectionId("/dashboard/integrationer", sections)).toBeNull();
  });
});
