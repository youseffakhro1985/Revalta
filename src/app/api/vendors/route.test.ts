import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  vendorFindManyMock,
  vendorFindFirstMock,
  vendorUpdateManyMock,
  auditFindManyMock,
  auditFindFirstMock,
  propertyFindFirstMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  vendorFindManyMock: vi.fn(),
  vendorFindFirstMock: vi.fn(),
  vendorUpdateManyMock: vi.fn(),
  auditFindManyMock: vi.fn(),
  auditFindFirstMock: vi.fn(),
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
    vendorContract: {
      findMany: vendorFindManyMock,
      findFirst: vendorFindFirstMock,
      updateMany: vendorUpdateManyMock,
      create: vi.fn(),
    },
    auditLog: { findMany: auditFindManyMock, findFirst: auditFindFirstMock },
    property: { findFirst: propertyFindFirstMock },
  },
}));

import { GET, PATCH } from "./route";

describe("vendors route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vendorFindManyMock.mockResolvedValue([]);
    auditFindManyMock.mockResolvedValue([]);
    vendorUpdateManyMock.mockResolvedValue({ count: 1 });
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("denies technicians from reading vendor contracts", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await GET();
    expect(response.status).toBe(403);
    expect(vendorFindManyMock).not.toHaveBeenCalled();
  });

  it("updates modern vendor with OR property null / deleted_at null filter", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    vendorFindFirstMock.mockResolvedValue({
      id: "vendor-1",
      name: "Städ AB",
      status: "active",
      org_number: "556677-8899",
      category: "Städning",
      contact_name: "Erik",
      email: "erik@stad.se",
      phone: "0701234567",
      contract_title: "Städavtal",
      contract_value: 50000,
      start_date: new Date("2026-01-01T00:00:00.000Z"),
      end_date: null,
      notice_months: 3,
    });

    const response = await PATCH(new Request("http://localhost/api/vendors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vendorId: "vendor-1",
        contactName: "Erik Svensson",
        email: "erik@ny.se",
        phone: "0709998877",
        contractValue: 55000,
      }),
    }));

    expect(response.status).toBe(200);
    expect(vendorFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "vendor-1",
        company_id: "company-1",
        OR: [{ property_id: null }, { property: { deleted_at: null } }],
      },
    }));
    expect(vendorUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "vendor-1", company_id: "company-1" },
      data: expect.objectContaining({
        contact_name: "Erik Svensson",
        email: "erik@ny.se",
        phone: "0709998877",
        contract_value: 55000,
      }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "vendor_contract.updated",
    }));
  });

  it("returns 404 when vendor belongs to a soft-deleted property", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    vendorFindFirstMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "vendor-1" });

    const response = await PATCH(new Request("http://localhost/api/vendors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendorId: "vendor-1", status: "ended" }),
    }));

    expect(response.status).toBe(404);
    expect(vendorUpdateManyMock).not.toHaveBeenCalled();
  });

  it("fail-closes legacy vendor updates with Swedish 409", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    vendorFindFirstMock.mockResolvedValue(null);
    auditFindFirstMock.mockResolvedValue({ id: "legacy-1", metadata: { name: "Legacy AB" } });

    const response = await PATCH(new Request("http://localhost/api/vendors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendorId: "legacy-1", status: "ended" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/backfill/i);
    expect(vendorUpdateManyMock).not.toHaveBeenCalled();
  });
});
