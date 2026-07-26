import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  imdFindManyMock,
  auditFindManyMock,
  propertyFindManyMock,
  leaseFindManyMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  imdFindManyMock: vi.fn(),
  auditFindManyMock: vi.fn(),
  propertyFindManyMock: vi.fn(),
  leaseFindManyMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    imdReading: { findMany: imdFindManyMock },
    auditLog: { findMany: auditFindManyMock },
    property: { findMany: propertyFindManyMock },
    lease: { findMany: leaseFindManyMock },
  },
}));

import { GET } from "./route";

describe("imd-readings route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    propertyFindManyMock.mockResolvedValue([]);
    leaseFindManyMock.mockResolvedValue([]);
    auditFindManyMock.mockResolvedValue([]);
  });

  it("returns modern IMD readings with debit status and scopes by company", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    imdFindManyMock.mockResolvedValue([
      {
        id: "reading-1",
        property_id: "property-1",
        property_name: "Storgatan 1",
        unit: "1101",
        meter_id: "EL-1",
        meter_type: "electricity",
        period: "2026-07",
        previous_reading: 10,
        current_reading: 20,
        consumption: 10,
        unit_price: 2,
        charge: 20,
        note: null,
        created_at: new Date("2026-07-20T10:00:00Z"),
        debit_line: {
          id: "debit-1",
          status: "open",
          rent_notice_id: null,
          lease_id: null,
          charge: 20,
        },
      },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(imdFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { company_id: "company-1" },
    }));
    expect(body.readings).toHaveLength(1);
    expect(body.readings[0].debit.status).toBe("open");
    expect(body.readings[0].charge).toBe(20);
  });
});
