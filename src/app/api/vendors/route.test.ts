import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  vendorFindManyMock,
  vendorFindFirstMock,
  vendorCreateMock,
  vendorUpdateManyMock,
  auditFindManyMock,
  auditFindFirstMock,
  propertyFindFirstMock,
  transactionMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  vendorFindManyMock: vi.fn(),
  vendorFindFirstMock: vi.fn(),
  vendorCreateMock: vi.fn(),
  vendorUpdateManyMock: vi.fn(),
  auditFindManyMock: vi.fn(),
  auditFindFirstMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
  transactionMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: writeAuditLogMock,
}));

const tx = {
  vendorContract: {
    create: vendorCreateMock,
    updateMany: vendorUpdateManyMock,
  },
};

vi.mock("@/lib/db", () => ({
  default: {
    vendorContract: {
      findMany: vendorFindManyMock,
      findFirst: vendorFindFirstMock,
      updateMany: vendorUpdateManyMock,
      create: vendorCreateMock,
    },
    auditLog: { findMany: auditFindManyMock, findFirst: auditFindFirstMock },
    property: { findFirst: propertyFindFirstMock },
    $transaction: transactionMock,
  },
}));

import { GET, PATCH, POST } from "./route";

const vendor = {
  id: "vendor-1",
  name: "Städ AB",
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
  property_id: null,
  status: "active",
};

describe("vendors route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vendorFindManyMock.mockResolvedValue([]);
    auditFindManyMock.mockResolvedValue([]);
    vendorCreateMock.mockResolvedValue(vendor);
    vendorUpdateManyMock.mockResolvedValue({ count: 1 });
    propertyFindFirstMock.mockResolvedValue({ id: "property-1" });
    writeAuditLogMock.mockResolvedValue(undefined);
    transactionMock.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  });

  it("denies technicians from reading vendor contracts", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await GET();
    expect(response.status).toBe(403);
    expect(vendorFindManyMock).not.toHaveBeenCalled();
  });

  it("creates vendor contract and mandatory audit in the same transaction", async () => {
    const user = { id: "owner-1", company_id: "company-1", role: "owner" };
    getCurrentUserMock.mockResolvedValue(user);

    const response = await POST(new Request("http://localhost/api/vendors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Städ AB",
        orgNumber: "556677-8899",
        category: "Städning",
        contactName: "Erik",
        email: "erik@stad.se",
        phone: "0701234567",
        contractTitle: "Städavtal",
        contractValue: 50000,
        startDate: "2026-01-01",
        noticeMonths: 3,
      }),
    }));

    expect(response.status).toBe(201);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(vendorCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        company_id: "company-1",
        name: "Städ AB",
        contract_value: 50000,
        created_by_id: "owner-1",
      }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        entityType: "vendor_contract",
        entityId: "vendor-1",
        action: "vendor_contract.created",
        metadata: expect.objectContaining({ name: "Städ AB", storage: "VendorContract" }),
      }),
      tx,
    );
  });

  it("returns 500 when mandatory create audit fails inside the transaction", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });
    writeAuditLogMock.mockRejectedValue(new Error("audit unavailable"));

    const response = await POST(new Request("http://localhost/api/vendors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Städ AB", contractValue: 50000, noticeMonths: 3 }),
    }));

    expect(response.status).toBe(500);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(vendorCreateMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx);
  });

  it("denies technicians from mutating vendor contracts", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await PATCH(new Request("http://localhost/api/vendors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendorId: "vendor-1", contactName: "X" }),
    }));
    expect(response.status).toBe(403);
    expect(vendorFindFirstMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("updates modern vendor with OR property null / deleted_at null filter and audit in the same transaction", async () => {
    const user = { id: "user-1", company_id: "company-1", role: "owner" };
    getCurrentUserMock.mockResolvedValue(user);
    vendorFindFirstMock.mockResolvedValue(vendor);

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
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(vendorUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "vendor-1", company_id: "company-1" },
      data: expect.objectContaining({
        contact_name: "Erik Svensson",
        email: "erik@ny.se",
        phone: "0709998877",
        contract_value: 55000,
      }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ action: "vendor_contract.updated" }),
      tx,
    );
  });

  it("returns 500 when mandatory update audit fails inside the transaction", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    vendorFindFirstMock.mockResolvedValue(vendor);
    writeAuditLogMock.mockRejectedValue(new Error("audit unavailable"));

    const response = await PATCH(new Request("http://localhost/api/vendors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendorId: "vendor-1", contactName: "Ny kontakt" }),
    }));

    expect(response.status).toBe(500);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(vendorUpdateManyMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx);
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
    expect(transactionMock).not.toHaveBeenCalled();
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
    expect(transactionMock).not.toHaveBeenCalled();
    expect(vendorUpdateManyMock).not.toHaveBeenCalled();
  });
});
