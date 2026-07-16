import { describe, expect, it } from "vitest";
import { componentCostTypeForWorkOrder, componentEventTypeForWorkOrder } from "./component-work-order-sync";

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
