import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  budgetFindManyMock,
  budgetFindFirstMock,
  budgetUpdateManyMock,
  budgetDeleteManyMock,
  auditFindManyMock,
  auditFindFirstMock,
  propertyFindManyMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  budgetFindManyMock: vi.fn(),
  budgetFindFirstMock: vi.fn(),
  budgetUpdateManyMock: vi.fn(),
  budgetDeleteManyMock: vi.fn(),
  auditFindManyMock: vi.fn(),
  auditFindFirstMock: vi.fn(),
  propertyFindManyMock: vi.fn(),
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
    budgetEntry: {
      findMany: budgetFindManyMock,
      findFirst: budgetFindFirstMock,
      updateMany: budgetUpdateManyMock,
      deleteMany: budgetDeleteManyMock,
      create: vi.fn(),
    },
    auditLog: { findMany: auditFindManyMock, findFirst: auditFindFirstMock },
    property: { findMany: propertyFindManyMock, findFirst: vi.fn() },
  },
}));

import { DELETE, PATCH } from "./route";

describe("budget route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    budgetFindManyMock.mockResolvedValue([]);
    auditFindManyMock.mockResolvedValue([]);
    propertyFindManyMock.mockResolvedValue([]);
    budgetUpdateManyMock.mockResolvedValue({ count: 1 });
    budgetDeleteManyMock.mockResolvedValue({ count: 1 });
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("updates modern budget fields and scopes active properties", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    budgetFindFirstMock.mockResolvedValue({
      id: "entry-1",
      property_id: "property-1",
      year: 2026,
      category: "energy",
      account: "6210",
      budget: 10000,
      forecast: 9500,
      actual: 8000,
      note: null,
    });

    const response = await PATCH(new Request("http://localhost/api/budget", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entryId: "entry-1",
        year: 2026,
        category: "operations",
        account: "5010",
        budget: 12000,
        forecast: 11000,
        actual: 9000,
        note: "Uppdaterad prognos",
      }),
    }));

    expect(response.status).toBe(200);
    expect(budgetFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "entry-1", company_id: "company-1", property: { deleted_at: null } },
    }));
    expect(budgetUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "entry-1", company_id: "company-1" },
      data: expect.objectContaining({
        year: 2026,
        category: "operations",
        account: "5010",
        budget: 12000,
        forecast: 11000,
        actual: 9000,
        note: "Uppdaterad prognos",
      }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "budget.entry.updated",
    }));
  });

  it("returns 404 when budget entry belongs to a soft-deleted property", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    budgetFindFirstMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "entry-1" });

    const response = await PATCH(new Request("http://localhost/api/budget", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId: "entry-1", budget: 1 }),
    }));

    expect(response.status).toBe(404);
    expect(budgetUpdateManyMock).not.toHaveBeenCalled();
  });

  it("hard-deletes modern budget entries and rejects legacy rows", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    budgetFindFirstMock.mockResolvedValue({
      id: "entry-1",
      account: "6210",
      year: 2026,
      category: "energy",
      property_id: "property-1",
    });

    const ok = await DELETE(new Request("http://localhost/api/budget", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId: "entry-1" }),
    }));
    expect(ok.status).toBe(200);
    expect(budgetDeleteManyMock).toHaveBeenCalledWith({
      where: { id: "entry-1", company_id: "company-1" },
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "budget.entry.deleted",
    }));

    budgetFindFirstMock.mockResolvedValue(null);
    auditFindFirstMock.mockResolvedValue({ id: "legacy-1" });
    const legacy = await DELETE(new Request("http://localhost/api/budget", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId: "legacy-1" }),
    }));
    expect(legacy.status).toBe(409);
    expect((await legacy.json()).error).toMatch(/backfill/i);
  });
});
