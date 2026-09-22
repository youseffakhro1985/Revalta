import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserMock, propertyFindManyMock, userFindManyMock, vendorFindManyMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  propertyFindManyMock: vi.fn(),
  userFindManyMock: vi.fn(),
  vendorFindManyMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("@/lib/schema-readiness", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/schema-readiness")>()),
  notDeletedFilter: vi.fn(async () => ({ deleted_at: null })),
  hasWorkOrderVendorContractColumn: vi.fn(async () => true),
}));
vi.mock("@/lib/db", () => ({
  default: {
    property: { findMany: propertyFindManyMock },
    user: { findMany: userFindManyMock },
    vendorContract: { findMany: vendorFindManyMock },
  },
}));

import { GET } from "./route";

describe("GET /api/work-orders/options", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    propertyFindManyMock.mockResolvedValue([]);
    userFindManyMock.mockResolvedValue([{ id: "tech-2", email: "tech@example.se" }]);
    vendorFindManyMock.mockResolvedValue([{ id: "vendor-1", name: "Städ AB", category: "Städ", property_id: null, status: "active" }]);
  });

  it("rejects residents before listing properties, users or vendors", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });

    const response = await GET();

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(propertyFindManyMock).not.toHaveBeenCalled();
    expect(userFindManyMock).not.toHaveBeenCalled();
    expect(vendorFindManyMock).not.toHaveBeenCalled();
  });

  it("does not disclose the company user directory to technicians", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(propertyFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ company_id: "company-1", status: "active" }),
    }));
    expect(userFindManyMock).not.toHaveBeenCalled();
    expect(vendorFindManyMock).not.toHaveBeenCalled();
    expect(body.users).toEqual([]);
    expect(body.vendors).toEqual([]);
    expect(body.permissions.canAssign).toBe(false);
  });

  it("returns assignable users to managers", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "manager-1", company_id: "company-1", role: "manager" });

    const response = await GET();
    const body = await response.json();

    expect(propertyFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ company_id: "company-1" }),
    }));
    expect(userFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { company_id: "company-1", status: "active" },
    }));
    expect(vendorFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ company_id: "company-1", status: "active" }),
    }));
    expect(body.users).toHaveLength(1);
    expect(body.vendors).toHaveLength(1);
    expect(body.permissions.canAssign).toBe(true);
    expect(body.permissions.vendorAssignmentAvailable).toBe(true);
  });
});
