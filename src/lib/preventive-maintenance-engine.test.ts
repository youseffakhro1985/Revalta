import { describe, expect, it } from "vitest";
import { maintenanceCycleKey, maintenancePriority } from "@/lib/preventive-maintenance-engine";

describe("preventive maintenance helpers", () => {
  it("skapar stabil cykelnyckel per komponent och servicedatum", () => {
    expect(maintenanceCycleKey("asset-1", new Date("2026-08-15T12:30:00.000Z"))).toBe("component-service:asset-1:2026-08-15");
  });

  it("översätter kritisk komponent till akut prioritet", () => {
    expect(maintenancePriority("critical")).toBe("urgent");
  });

  it("översätter hög och låg kritikalitet korrekt", () => {
    expect(maintenancePriority("high")).toBe("high");
    expect(maintenancePriority("low")).toBe("low");
  });

  it("använder normal prioritet för okänt eller saknat värde", () => {
    expect(maintenancePriority(null)).toBe("normal");
    expect(maintenancePriority("unknown")).toBe("normal");
  });
});
