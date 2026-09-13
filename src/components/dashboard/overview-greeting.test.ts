import { describe, expect, it } from "vitest";
import { overviewFirstName, overviewGreeting, overviewLongDate, overviewRoleLabel } from "./overview-greeting";

describe("overview greeting helpers", () => {
  it("uses morning, afternoon and evening windows in Swedish", () => {
    expect(overviewGreeting(new Date("2026-09-13T07:00:00"))).toBe("God morgon");
    expect(overviewGreeting(new Date("2026-09-13T13:00:00"))).toBe("God eftermiddag");
    expect(overviewGreeting(new Date("2026-09-13T20:00:00"))).toBe("God kväll");
    expect(overviewGreeting(new Date("2026-09-13T02:00:00"))).toBe("God natt");
  });

  it("prefers the given name and falls back to a readable email local-part", () => {
    expect(overviewFirstName("Yousef Fakhro", "owner@example.se")).toBe("Yousef");
    expect(overviewFirstName("  ", "forvaltare@revalta.se")).toBe("Forvaltare");
  });

  it("maps staff roles to Swedish labels and formats the long date", () => {
    expect(overviewRoleLabel("owner")).toBe("Ägare");
    expect(overviewRoleLabel("manager")).toBe("Förvaltare");
    expect(overviewLongDate(new Date("2026-09-13T12:00:00Z"))).toMatch(/september/i);
  });
});
