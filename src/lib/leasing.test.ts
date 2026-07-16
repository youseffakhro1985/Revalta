import { describe, expect, it } from "vitest";
import { generateLeaseNumber, isOccupyingLeaseStatus, parseLeaseInput } from "@/lib/leasing";

const validInput = {
  unitId: "unit-1",
  holderName: "Anna Andersson",
  holderType: "individual",
  status: "active",
  startDate: "2026-08-01",
  monthlyRent: "12500",
  deposit: "25000",
  annualIndexPercent: "2.5",
  paymentTermsDays: "30",
  holderEmail: "ANNA@example.se",
};

describe("leasing core", () => {
  it("normaliserar ett komplett avtal", () => {
    const result = parseLeaseInput(validInput);
    expect(result.error).toBeUndefined();
    expect(result.data?.holderEmail).toBe("anna@example.se");
    expect(result.data?.monthlyRent).toBe(12500);
    expect(result.data?.startDate?.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("stoppar slutdatum före startdatum", () => {
    const result = parseLeaseInput({ ...validInput, endDate: "2026-07-31" });
    expect(result.error).toBe("Slutdatum kan inte vara före startdatum");
  });

  it("stoppar kalenderdatum som inte finns", () => {
    const result = parseLeaseInput({ ...validInput, startDate: "2026-02-31" });
    expect(result.error).toContain("datum");
  });

  it("kräver startdatum för aktiva avtal", () => {
    const result = parseLeaseInput({ ...validInput, startDate: "" });
    expect(result.error).toContain("startdatum");
  });

  it("validerar ekonomi, e-post och betalningsvillkor", () => {
    expect(parseLeaseInput({ ...validInput, monthlyRent: -1 }).error).toContain("hyra");
    expect(parseLeaseInput({ ...validInput, holderEmail: "fel" }).error).toContain("e-postadress");
    expect(parseLeaseInput({ ...validInput, paymentTermsDays: 121 }).error).toContain("0–120");
  });

  it("klassificerar endast pågående statusar som beläggande", () => {
    expect(isOccupyingLeaseStatus("reserved")).toBe(true);
    expect(isOccupyingLeaseStatus("active")).toBe(true);
    expect(isOccupyingLeaseStatus("notice")).toBe(true);
    expect(isOccupyingLeaseStatus("ended")).toBe(false);
  });

  it("skapar ett läsbart och stabilt avtalsnummerformat", () => {
    expect(generateLeaseNumber(new Date("2026-01-02T00:00:00Z"), "12345678-abcd-efgh-ijkl-1234567890ab")).toBe("AVT-2026-12345678");
  });
});
