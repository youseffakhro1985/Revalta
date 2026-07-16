import { describe, expect, it } from "vitest";
import {
  addServiceInterval,
  componentCostTypeForWorkOrder,
  componentEventTypeForWorkOrder,
  parseMaintenanceCycleDate,
} from "./component-work-order-sync";

describe("component work order lifecycle classification", () => {
  it("classifies preventive work as service", () => {
    expect(componentEventTypeForWorkOrder("preventive")).toBe("service");
    expect(componentCostTypeForWorkOrder("preventive")).toBe("service");
  });

  it("classifies inspections consistently", () => {
    expect(componentEventTypeForWorkOrder("inspection")).toBe("inspection");
    expect(componentCostTypeForWorkOrder("inspection")).toBe("inspection");
  });

  it("classifies warranty work as warranty event and repair cost", () => {
    expect(componentEventTypeForWorkOrder("warranty")).toBe("warranty");
    expect(componentCostTypeForWorkOrder("warranty")).toBe("repair");
  });

  it("uses safe defaults for unknown work types", () => {
    expect(componentEventTypeForWorkOrder("unknown")).toBe("repair");
    expect(componentCostTypeForWorkOrder("unknown")).toBe("other");
  });
});

describe("preventive maintenance cycle advancement", () => {
  it("parses a valid maintenance cycle key", () => {
    expect(parseMaintenanceCycleDate("component-service:asset-1:2026-07-31")?.toISOString()).toBe("2026-07-31T00:00:00.000Z");
  });

  it("rejects malformed maintenance cycle keys", () => {
    expect(parseMaintenanceCycleDate("component-service:asset-1:not-a-date")).toBeNull();
    expect(parseMaintenanceCycleDate(null)).toBeNull();
  });

  it("advances a normal annual service cycle", () => {
    expect(addServiceInterval(new Date("2026-07-16T00:00:00.000Z"), 12).toISOString()).toBe("2027-07-16T00:00:00.000Z");
  });

  it("keeps month-end dates valid", () => {
    expect(addServiceInterval(new Date("2026-01-31T00:00:00.000Z"), 1).toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });

  it("clamps unsafe service intervals", () => {
    expect(addServiceInterval(new Date("2026-01-15T00:00:00.000Z"), 0).toISOString()).toBe("2026-02-15T00:00:00.000Z");
  });
});
