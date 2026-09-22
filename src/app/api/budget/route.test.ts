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
  propertyFindFirstMock,
  budgetCreateMock,
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
  propertyFindFirstMock: vi.fn(),
  budgetCreateMock: vi.fn(),
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
      create: budgetCreateMock,
    },
    auditLog: { findMany: auditFindManyMock, findFirst: auditFindFirstMock },
    property: { findMany: propertyFindManyMock, findFirst: propertyFindFirstMock },
  },
}));

import { DELETE, GET, PATCH, POST } from "./route";

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

  it("denies technicians from reading budget data", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await GET();
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet att visa budgetdata");
    expect(budgetFindManyMock).not.toHaveBeenCalled();
    expect(propertyFindManyMock).not.toHaveBeenCalled();
  });

  it("rejects residents before listing budget rows", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await GET();
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(budgetFindManyMock).not.toHaveBeenCalled();
    expect(propertyFindManyMock).not.toHaveBeenCalled();
    expect(auditFindManyMock).not.toHaveBeenCalled();
  });

  it("denies technicians from mutating budget data", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await PATCH(new Request("http://localhost/api/budget", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId: "entry-1", budget: 1 }),
    }));
    expect(response.status).toBe(403);
    expect(budgetFindFirstMock).not.toHaveBeenCalled();
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

  it("POST denies residents before creating a budget row", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await POST(new Request("http://localhost/api/budget", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId: "property-1", account: "6210", year: 2026 }),
    }));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
  });

  it("PATCH denies residents before looking up a budget row", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await PATCH(new Request("http://localhost/api/budget", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId: "entry-1", budget: 1 }),
    }));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(budgetFindFirstMock).not.toHaveBeenCalled();
  });

  it("DELETE denies residents before looking up a budget row", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await DELETE(new Request("http://localhost/api/budget", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId: "entry-1" }),
    }));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(budgetFindFirstMock).not.toHaveBeenCalled();
  });

  it("PATCH denies technicians with the finance-manage copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await PATCH(new Request("http://localhost/api/budget", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId: "entry-1", budget: 1 }),
    }));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet");
    expect(budgetFindFirstMock).not.toHaveBeenCalled();
  });

  it("returns tenant-safe 404 when Tenant A posts a budget row against Tenant B propertyId", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });
    propertyFindFirstMock.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/budget", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId: "property-tenant-b", account: "6210", year: 2026 }),
    }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Fastigheten hittades inte");
    expect(propertyFindFirstMock).toHaveBeenCalledWith({
      where: { id: "property-tenant-b", deleted_at: null, company_id: "company-1" },
      select: { id: true, name: true },
    });
    expect(budgetCreateMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("returns tenant-safe 404 when Tenant A deletes a Tenant B budget entry id", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });
    budgetFindFirstMock.mockResolvedValue(null);
    auditFindFirstMock.mockResolvedValue(null);

    const response = await DELETE(new Request("http://localhost/api/budget", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId: "entry-tenant-b" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Budgetraden hittades inte");
    expect(budgetFindFirstMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { id: "entry-tenant-b", company_id: "company-1", property: { deleted_at: null } },
    }));
    expect(budgetDeleteManyMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });
});
