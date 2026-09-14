import { describe, expect, it } from "vitest";
import { vendorsForProperty } from "@/lib/work-order-vendor";

describe("work-order vendor assignment", () => {
  const companyWide = {
    id: "vendor-1",
    name: "Städ AB",
    category: "Städ",
    property_id: null,
    status: "active",
  };
  const propertyBound = {
    id: "vendor-2",
    name: "VVS Syd",
    category: "VVS",
    property_id: "property-1",
    status: "active",
  };
  const otherProperty = {
    id: "vendor-3",
    name: "El Norr",
    category: "El",
    property_id: "property-2",
    status: "active",
  };

  it("keeps company-wide vendors and the selected property's contracts", () => {
    expect(vendorsForProperty([companyWide, propertyBound, otherProperty], "property-1")).toEqual([
      companyWide,
      propertyBound,
    ]);
  });

  it("hides property-bound vendors until a property is chosen", () => {
    expect(vendorsForProperty([companyWide, propertyBound], null)).toEqual([companyWide]);
  });
});
