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
    expect(dashboardPrimaryCreateAction("/dashboard/arbetsorder/aterkommande", "admin")).toEqual({
      href: "/dashboard/arbetsorder/aterkommande#nytt-schema",
      label: "Nytt schema",
    });
    expect(dashboardPrimaryCreateAction("/dashboard/arbetsorder/aterkommande/incidenter", "admin")).toBeNull();
    expect(dashboardPrimaryCreateAction("/dashboard/arbetsorder/aterkommande", "technician")).toBeNull();
  });

  it("visar ny fastighet endast i fastighetsområdet", () => {
    expect(dashboardPrimaryCreateAction("/dashboard/fastigheter", "manager")).toEqual({
      href: "/dashboard/fastigheter/ny",
      label: "Ny fastighet",
    });
    expect(dashboardPrimaryCreateAction("/dashboard/fastigheter/fastighet-1", "manager")?.label).toBe("Ny fastighet");
    expect(dashboardPrimaryCreateAction("/dashboard/fastigheter/ny", "manager")).toBeNull();
  });

  it("visar nytt ärende i ärendemodulen för roller som hanterar felanmälan", () => {
    expect(dashboardPrimaryCreateAction("/dashboard/felanmalan", "owner")).toEqual({
      href: "/dashboard/felanmalan?create=1",
      label: "Nytt ärende",
    });
    expect(dashboardPrimaryCreateAction("/dashboard/felanmalan/ticket-1", "technician")?.label).toBe("Nytt ärende");
    expect(dashboardPrimaryCreateAction("/dashboard/felanmalan", "viewer")).toBeNull();
  });

  it("visar nytt skadeärende i skademodulen för roller som hanterar försäkring", () => {
    expect(dashboardPrimaryCreateAction("/dashboard/skador", "owner")).toEqual({
      href: "/dashboard/skador?create=1",
      label: "Nytt skadeärende",
    });
    expect(dashboardPrimaryCreateAction("/dashboard/skador", "manager")?.label).toBe("Nytt skadeärende");
    expect(dashboardPrimaryCreateAction("/dashboard/skador", "viewer")).toBeNull();
    expect(dashboardPrimaryCreateAction("/dashboard/skador", "technician")).toBeNull();
    expect(dashboardPrimaryCreateAction("/dashboard/projekt", "owner")).toEqual({
      href: "/dashboard/projekt?create=1",
      label: "Nytt projekt",
    });
    expect(dashboardPrimaryCreateAction("/dashboard/projekt", "technician")).toBeNull();
    expect(dashboardPrimaryCreateAction("/dashboard/offerter", "owner")).toEqual({
      href: "/dashboard/offerter?create=1",
      label: "Ny offert",
    });
    expect(dashboardPrimaryCreateAction("/dashboard/offerter", "technician")).toBeNull();
    expect(dashboardPrimaryCreateAction("/dashboard/imd", "owner")).toEqual({
      href: "/dashboard/imd?create=1",
      label: "Ny avläsning",
    });
    expect(dashboardPrimaryCreateAction("/dashboard/imd", "technician")).toBeNull();
    expect(dashboardPrimaryCreateAction("/dashboard/dokument", "owner")).toEqual({
      href: "/dashboard/dokument?create=1",
      label: "Nytt dokument",
    });
    expect(dashboardPrimaryCreateAction("/dashboard/dokument", "technician")).toBeNull();
    expect(dashboardPrimaryCreateAction("/dashboard/energi", "owner")).toEqual({
      href: "/dashboard/energi#ny-avlasning",
      label: "Ny avläsning",
    });
    expect(dashboardPrimaryCreateAction("/dashboard/energi", "technician")).toBeNull();
    expect(dashboardPrimaryCreateAction("/dashboard/budget", "owner")).toEqual({
      href: "/dashboard/budget#ny-budgetrad",
      label: "Ny budgetrad",
    });
    expect(dashboardPrimaryCreateAction("/dashboard/budget", "technician")).toBeNull();
    expect(dashboardPrimaryCreateAction("/dashboard/ekonomi", "owner")).toEqual({
      href: "/dashboard/ekonomi/ny-utbetalning",
      label: "Ny utbetalning",
    });
    expect(dashboardPrimaryCreateAction("/dashboard/ekonomi/ny-utbetalning", "owner")).toBeNull();
    expect(dashboardPrimaryCreateAction("/dashboard/ekonomi", "technician")).toBeNull();
    expect(dashboardPrimaryCreateAction("/dashboard/rapporter", "owner")).toEqual({
      href: "/dashboard/rapporter#rapportfilter",
      label: "Filtrera rapport",
    });
    expect(dashboardPrimaryCreateAction("/dashboard/rapporter", "technician")).toBeNull();
  });

  it("visar modulspecifika skapa-knappar på drift- och boendesidor", () => {
    expect(dashboardPrimaryCreateAction("/dashboard/ronder", "owner")).toEqual({
      href: "/dashboard/ronder?create=1",
      label: "Ny rond",
    });
    expect(dashboardPrimaryCreateAction("/dashboard/besiktningar", "manager")?.label).toBe("Ny kontroll");
    expect(dashboardPrimaryCreateAction("/dashboard/underhall", "admin")?.href).toBe("/dashboard/underhall#ny-underhallsatgard");
    expect(dashboardPrimaryCreateAction("/dashboard/kalender", "owner")?.label).toBe("Ny aktivitet");
    expect(dashboardPrimaryCreateAction("/dashboard/leverantorer", "manager")?.label).toBe("Ny leverantör");
    expect(dashboardPrimaryCreateAction("/dashboard/bokningar", "owner")).toEqual({
      href: "/dashboard/bokningar#ny-bokning",
      label: "Ny bokning",
    });
    expect(dashboardPrimaryCreateAction("/dashboard/uthyrning", "owner")).toEqual({
      href: "/dashboard/uthyrning?create=1",
      label: "Nytt avtal",
    });
    expect(dashboardPrimaryCreateAction("/dashboard/uthyrning/overlamning", "owner")).toBeNull();
    expect(dashboardPrimaryCreateAction("/dashboard/hyresavisering", "owner")).toEqual({
      href: "/dashboard/hyresavisering#ny-hyresavi",
      label: "Ny hyresavi",
    });
    expect(dashboardPrimaryCreateAction("/dashboard/hyresavisering", "technician")).toBeNull();
    expect(dashboardPrimaryCreateAction("/dashboard/nycklar", "owner")).toEqual({
      href: "/dashboard/nycklar#ny-nyckel",
      label: "Ny nyckel",
    });
    expect(dashboardPrimaryCreateAction("/dashboard/nycklar", "technician")).toBeNull();
    expect(dashboardPrimaryCreateAction("/dashboard/team", "owner")).toEqual({
      href: "/dashboard/team#bjud-in",
      label: "Bjud in",
    });
    expect(dashboardPrimaryCreateAction("/dashboard/team", "admin")?.label).toBe("Bjud in");
    expect(dashboardPrimaryCreateAction("/dashboard/team", "manager")).toBeNull();
    expect(dashboardPrimaryCreateAction("/dashboard/team", "technician")).toBeNull();
    expect(dashboardPrimaryCreateAction("/dashboard/behorigheter", "owner")).toEqual({
      href: "/dashboard/team#bjud-in",
      label: "Hantera roller",
    });
    expect(dashboardPrimaryCreateAction("/dashboard/behorigheter", "admin")?.label).toBe("Hantera roller");
    expect(dashboardPrimaryCreateAction("/dashboard/behorigheter", "manager")).toBeNull();
    expect(dashboardPrimaryCreateAction("/dashboard/ronder", "technician")).toBeNull();
    expect(dashboardPrimaryCreateAction("/dashboard/bokningar", "technician")).toBeNull();
  });

  it("visar byt lösenord på inställningsöversikten och aviseringsval på serviceaviseringar", () => {
    expect(dashboardPrimaryCreateAction("/dashboard/installningar", "owner")).toEqual({
      href: "/dashboard/installningar#losenord",
      label: "Byt lösenord",
    });
    expect(dashboardPrimaryCreateAction("/dashboard/installningar", "technician")).toEqual({
      href: "/dashboard/installningar#losenord",
      label: "Byt lösenord",
    });
    expect(dashboardPrimaryCreateAction("/dashboard/installningar/aviseringar", "owner")).toEqual({
      href: "/dashboard/installningar/aviseringar#aviseringsinstallningar",
      label: "Aviseringsval",
    });
    expect(dashboardPrimaryCreateAction("/dashboard/installningar/aviseringar", "technician")?.label).toBe("Aviseringsval");
    expect(dashboardPrimaryCreateAction("/dashboard/installningar/mina-aviseringar", "owner")).toEqual({
      href: "/dashboard/installningar/mina-aviseringar#mina-val",
      label: "Mina val",
    });
    expect(dashboardPrimaryCreateAction("/dashboard/installningar/eskaleringar", "admin")).toEqual({
      href: "/dashboard/installningar/eskaleringar/regler",
      label: "Hantera regler",
    });
    expect(dashboardPrimaryCreateAction("/dashboard/installningar/eskaleringar/regler", "admin")).toEqual({
      href: "/dashboard/installningar/eskaleringar/regler#eskaleringsregler",
      label: "Spara regler",
    });
    expect(dashboardPrimaryCreateAction("/dashboard/installningar/eskaleringar/regler", "technician")).toEqual({
      href: "/dashboard/installningar/eskaleringar/regler#eskaleringsregler",
      label: "Spara regler",
    });
  });

  it("visar inte en irrelevant global skapa-knapp i andra moduler", () => {
    expect(dashboardPrimaryCreateAction("/dashboard/integrationer", "owner")).toBeNull();
  });

  it("respekterar rollbehörigheter", () => {
    expect(dashboardPrimaryCreateAction("/dashboard", "technician")).toBeNull();
    expect(dashboardPrimaryCreateAction("/dashboard/fastigheter", "viewer")).toBeNull();
    expect(dashboardPrimaryCreateAction("/dashboard/arbetsorder", "resident")).toBeNull();
  });
});
