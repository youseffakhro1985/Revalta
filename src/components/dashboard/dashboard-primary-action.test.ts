import { describe, expect, it } from "vitest";
import { dashboardPrimaryCreateAction } from "@/components/dashboard/dashboard-primary-action";

describe("dashboardPrimaryCreateAction", () => {
  it("visar ny arbetsorder på översikten för roller som fördelar arbete", () => {
    expect(dashboardPrimaryCreateAction("/dashboard", "owner")).toEqual({
      href: "/dashboard/arbetsorder/ny",
      label: "Ny arbetsorder",
    });
    expect(dashboardPrimaryCreateAction("/dashboard", "manager")).toEqual({
      href: "/dashboard/arbetsorder/ny",
      label: "Ny arbetsorder",
    });
  });

  it("behåller arbetsorderåtgärden inne i arbetsordermodulen men inte i admin- eller skapa-vyn", () => {
    expect(dashboardPrimaryCreateAction("/dashboard/arbetsorder/planering", "admin")?.label).toBe("Ny arbetsorder");
    expect(dashboardPrimaryCreateAction("/dashboard/arbetsorder/AO-2026-0142", "admin")?.label).toBe("Ny arbetsorder");
    expect(dashboardPrimaryCreateAction("/dashboard/arbetsorder/ny", "admin")).toBeNull();
    expect(dashboardPrimaryCreateAction("/dashboard/arbetsorder/redigeringslas", "admin")).toBeNull();
  });

  it("visar ny fastighet endast i fastighetsområdet", () => {
    expect(dashboardPrimaryCreateAction("/dashboard/fastigheter", "manager")).toEqual({
      href: "/dashboard/fastigheter/ny",
      label: "Ny fastighet",
    });
    expect(dashboardPrimaryCreateAction("/dashboard/fastigheter/fastighet-1", "manager")?.label).toBe("Ny fastighet");
    expect(dashboardPrimaryCreateAction("/dashboard/fastigheter/ny", "manager")).toBeNull();
  });

  it("visar inte en irrelevant global skapa-knapp i andra moduler", () => {
    expect(dashboardPrimaryCreateAction("/dashboard/ekonomi", "owner")).toBeNull();
    expect(dashboardPrimaryCreateAction("/dashboard/dokument", "owner")).toBeNull();
    expect(dashboardPrimaryCreateAction("/dashboard/installningar", "owner")).toBeNull();
  });

  it("respekterar rollbehörigheter", () => {
    expect(dashboardPrimaryCreateAction("/dashboard", "technician")).toBeNull();
    expect(dashboardPrimaryCreateAction("/dashboard/fastigheter", "viewer")).toBeNull();
    expect(dashboardPrimaryCreateAction("/dashboard/arbetsorder", "resident")).toBeNull();
  });
});
