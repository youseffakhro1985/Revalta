import { describe, expect, it } from "vitest";
import {
  activeDashboardSectionId,
  isDashboardNavItemActive,
  staffPrimaryNavigation,
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

  it("ger owner de fem beslutad modulområdena i rätt ordning", () => {
    expect(sectionLabels("owner")).toEqual([
      "Drift",
      "Boende & uthyrning",
      "Ekonomi & analys",
      "Dokument & projekt",
      "Organisation",
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

  it("markerar arbetsorderns rot men inte dess separata underområden", () => {
    expect(isDashboardNavItemActive("/dashboard/arbetsorder/AO-2026-0142", "/dashboard/arbetsorder")).toBe(true);
    expect(isDashboardNavItemActive("/dashboard/arbetsorder/operationsoversikt", "/dashboard/arbetsorder")).toBe(false);
    expect(isDashboardNavItemActive("/dashboard/arbetsorder/planering", "/dashboard/arbetsorder")).toBe(false);
    expect(isDashboardNavItemActive("/dashboard/arbetsorder/aterkommande", "/dashboard/arbetsorder")).toBe(false);
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
    expect(activeDashboardSectionId("/dashboard/integrationer", sections)).toBe("organisation");
  });
});
