import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  claimFindManyMock,
  claimFindFirstMock,
  claimUpdateManyMock,
  auditFindManyMock,
  auditFindFirstMock,
  propertyFindManyMock,
  propertyFindFirstMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  claimFindManyMock: vi.fn(),
  claimFindFirstMock: vi.fn(),
  claimUpdateManyMock: vi.fn(),
  auditFindManyMock: vi.fn(),
  auditFindFirstMock: vi.fn(),
  propertyFindManyMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: writeAuditLogMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    insuranceClaim: {
      findMany: claimFindManyMock,
      findFirst: claimFindFirstMock,
      updateMany: claimUpdateManyMock,
      create: vi.fn(),
    },
    auditLog: { findMany: auditFindManyMock, findFirst: auditFindFirstMock },
    property: { findMany: propertyFindManyMock, findFirst: propertyFindFirstMock },
  },
}));

import { PATCH } from "./route";

describe("insurance-claims route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    claimFindManyMock.mockResolvedValue([]);
    auditFindManyMock.mockResolvedValue([]);
    propertyFindManyMock.mockResolvedValue([]);
    claimUpdateManyMock.mockResolvedValue({ count: 1 });
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("updates modern claim fields and scopes active properties", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    claimFindFirstMock.mockResolvedValue({
      id: "claim-1",
      title: "Vattenskada",
      status: "reported",
      estimated_cost: 10000,
      deductible: 1500,
      compensation: 0,
      claim_number: "SK-1",
      insurer: "If",
      location: "Källare",
      note: null,
    });

    const response = await PATCH(new Request("http://localhost/api/insurance-claims", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        claimId: "claim-1",
        status: "investigating",
        title: "Vattenskada uppdaterad",
        estimatedCost: 12000,
        deductible: 1500,
        compensation: 2000,
        note: "Uppdaterad",
      }),
    }));

    expect(response.status).toBe(200);
    expect(claimFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "claim-1", company_id: "company-1", property: { deleted_at: null } },
    }));
    expect(claimUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "claim-1", company_id: "company-1" },
      data: expect.objectContaining({
        status: "investigating",
        title: "Vattenskada uppdaterad",
        estimated_cost: 12000,
        compensation: 2000,
        note: "Uppdaterad",
      }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "insurance_claim.updated",
    }));
  });

  it("returns 404 when claim belongs to a soft-deleted property", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    claimFindFirstMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "claim-1" });

    const response = await PATCH(new Request("http://localhost/api/insurance-claims", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claimId: "claim-1", status: "investigating" }),
    }));

    expect(response.status).toBe(404);
    expect(claimUpdateManyMock).not.toHaveBeenCalled();
  });

  it("fail-closes legacy claim updates with Swedish 409", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    claimFindFirstMock.mockResolvedValue(null);
    auditFindFirstMock.mockResolvedValue({ id: "legacy-1" });

    const response = await PATCH(new Request("http://localhost/api/insurance-claims", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claimId: "legacy-1", status: "investigating" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/backfill/i);
    expect(claimUpdateManyMock).not.toHaveBeenCalled();
  });
});
