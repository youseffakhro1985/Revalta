import { describe, expect, it } from "vitest";
import {
  calculateResolutionDueAt,
  calculateResponseDueAt,
  formatSlaResolutionLabel,
  getSlaPolicy,
} from "./sla-policy";
import { calculateDueDate, getSlaLabel } from "./sla";

describe("sla-policy", () => {
  const from = new Date("2026-07-26T08:00:00.000Z");

  it("använder kanoniska svar- och lösningstider", () => {
    expect(getSlaPolicy("urgent")).toEqual({ responseHours: 1, resolutionHours: 4 });
    expect(getSlaPolicy("high")).toEqual({ responseHours: 4, resolutionHours: 24 });
    expect(getSlaPolicy("normal")).toEqual({ responseHours: 24, resolutionHours: 72 });
    expect(getSlaPolicy("low")).toEqual({ responseHours: 48, resolutionHours: 168 });
  });

  it("beräknar due dates från samma policy som ticket-SLA", () => {
    expect(calculateResolutionDueAt("urgent", from).toISOString()).toBe("2026-07-26T12:00:00.000Z");
    expect(calculateResponseDueAt("urgent", from).toISOString()).toBe("2026-07-26T09:00:00.000Z");
    expect(calculateDueDate("normal", from).toISOString()).toBe(calculateResolutionDueAt("normal", from).toISOString());
    expect(getSlaLabel("low")).toBe(formatSlaResolutionLabel("low"));
  });
});
