import { describe, expect, it } from "vitest";
import {
  calculateWorkOrderSla,
  canTransitionWorkOrder,
  normalizeWorkOrderSource,
  normalizeWorkOrderType,
} from "@/lib/work-order-enterprise-core";

describe("Work Orders 2.0", () => {
  it("beräknar SLA för akut arbetsorder", () => {
    const createdAt = new Date("2026-07-16T10:00:00.000Z");
    const sla = calculateWorkOrderSla(createdAt, "urgent");
    expect(sla.responseDueAt.toISOString()).toBe("2026-07-16T11:00:00.000Z");
    expect(sla.resolutionDueAt.toISOString()).toBe("2026-07-16T14:00:00.000Z");
  });

  it("beräknar SLA för normal arbetsorder", () => {
    const createdAt = new Date("2026-07-16T10:00:00.000Z");
    const sla = calculateWorkOrderSla(createdAt, "normal");
    expect(sla.responseDueAt.toISOString()).toBe("2026-07-17T10:00:00.000Z");
    expect(sla.resolutionDueAt.toISOString()).toBe("2026-07-19T10:00:00.000Z");
  });

  it("tillåter normala statusövergångar", () => {
    expect(canTransitionWorkOrder("planned", "in_progress")).toBe(true);
    expect(canTransitionWorkOrder("in_progress", "waiting_material")).toBe(true);
    expect(canTransitionWorkOrder("completed", "invoiced")).toBe(true);
  });

  it("stoppar otillåtna statusövergångar", () => {
    expect(canTransitionWorkOrder("new", "invoiced")).toBe(false);
    expect(canTransitionWorkOrder("planned", "completed")).toBe(false);
    expect(canTransitionWorkOrder("cancelled", "invoiced")).toBe(false);
  });

  it("normaliserar arbetstyp och ursprung säkert", () => {
    expect(normalizeWorkOrderType("preventive")).toBe("preventive");
    expect(normalizeWorkOrderType("okänd")).toBe("corrective");
    expect(normalizeWorkOrderSource("resident")).toBe("resident");
    expect(normalizeWorkOrderSource("okänd")).toBe("internal");
  });
});
