import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  propertyFindFirstMock,
  queryRawMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
  queryRawMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    property: { findFirst: propertyFindFirstMock },
    $queryRaw: queryRawMock,
  },
}));

import { GET } from "./route";

const params = { params: Promise.resolve({ id: "property-1" }) };

describe("maintenance-plan export GET staff-scope", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects residents before loading the plan or contractor rows", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });

    const response = await GET(
      new Request("https://www.revalta.se/api/properties/property-1/maintenance-plan/export"),
      params,
    );

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(propertyFindFirstMock).not.toHaveBeenCalled();
    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it("returns tenant-safe 404 when Tenant A exports a Tenant B propertyId", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "owner-1",
      company_id: "company-1",
      role: "owner",
    });
    propertyFindFirstMock.mockResolvedValue(null);

    const response = await GET(
      new Request("https://www.revalta.se/api/properties/property-tenant-b/maintenance-plan/export"),
      { params: Promise.resolve({ id: "property-tenant-b" }) },
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("Fastigheten hittades inte");
    expect(propertyFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "property-tenant-b", company_id: "company-1" }),
    }));
    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it("quotes formula-like cells so CSV cannot execute Tenant B titles or contractors", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "owner-1",
      company_id: "company-1",
      role: "owner",
    });
    propertyFindFirstMock.mockResolvedValue({ id: "property-1", name: "Storgatan 1" });
    queryRawMock
      .mockResolvedValueOnce([{
        id: "plan-1",
        name: "Underhåll",
        version: 1,
        base_year: 2026,
        horizon_years: 1,
        annual_index_rate: 0,
      }])
      .mockResolvedValueOnce([{
        category: "tak",
        title: "=CMD(TenantB)",
        planned_year: 2026,
        recurrence_years: null,
        estimated_cost: 1000,
        annual_index_rate: null,
        priority: "high",
        risk: "medium",
        status: "planned",
        contractor: "+Hyra",
        building_name: null,
        technical_asset_name: null,
      }]);

    const response = await GET(
      new Request("https://www.revalta.se/api/properties/property-1/maintenance-plan/export"),
      params,
    );
    const csv = await response.text();

    expect(response.status).toBe(200);
    expect(csv).toContain("\"'=CMD(TenantB)\"");
    expect(csv).toContain("\"'+Hyra\"");
    expect(csv).not.toContain("\"=CMD(TenantB)\"");
    expect(queryRawMock).toHaveBeenCalled();
  });
});
