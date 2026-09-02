import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  noticeFindManyMock,
  noticeFindFirstMock,
  noticeCreateMock,
  noticeUpdateManyMock,
  auditFindManyMock,
  auditFindFirstMock,
  leaseFindManyMock,
  leaseFindFirstMock,
  propertyFindManyMock,
  propertyFindFirstMock,
  transactionMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  noticeFindManyMock: vi.fn(),
  noticeFindFirstMock: vi.fn(),
  noticeCreateMock: vi.fn(),
  noticeUpdateManyMock: vi.fn(),
  auditFindManyMock: vi.fn(),
  auditFindFirstMock: vi.fn(),
  leaseFindManyMock: vi.fn(),
  leaseFindFirstMock: vi.fn(),
  propertyFindManyMock: vi.fn(),
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
  rentNotice: {
    create: noticeCreateMock,
    updateMany: noticeUpdateManyMock,
  },
};

vi.mock("@/lib/db", () => ({
  default: {
    rentNotice: {
      findMany: noticeFindManyMock,
      findFirst: noticeFindFirstMock,
    },
    lease: { findMany: leaseFindManyMock, findFirst: leaseFindFirstMock },
    auditLog: { findMany: auditFindManyMock, findFirst: auditFindFirstMock },
    property: { findMany: propertyFindManyMock, findFirst: propertyFindFirstMock },
    $transaction: transactionMock,
  },
}));

import { PATCH, POST } from "./route";

const owner = { id: "user-1", company_id: "company-1", role: "owner" };

function patchRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/rent-notices", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function postRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/rent-notices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("rent-notices route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    noticeFindManyMock.mockResolvedValue([]);
    leaseFindManyMock.mockResolvedValue([]);
    auditFindManyMock.mockResolvedValue([]);
    propertyFindManyMock.mockResolvedValue([]);
    noticeCreateMock.mockResolvedValue({ id: "notice-new" });
    noticeUpdateManyMock.mockResolvedValue({ count: 1 });
    propertyFindFirstMock.mockResolvedValue({ id: "property-1", name: "Kvarnhuset" });
    leaseFindFirstMock.mockResolvedValue(null);
    writeAuditLogMock.mockResolvedValue(undefined);
    transactionMock.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  });

  it("creates the rent notice and mandatory audit in one transaction", async () => {
    getCurrentUserMock.mockResolvedValue(owner);

    const response = await POST(postRequest({
      propertyId: "property-1",
      tenantName: "Anna Andersson",
      unit: "1201",
      period: "2026-08",
      dueDate: "2026-08-31",
      baseRent: 11000,
      additions: 500,
      deductions: 0,
      indexPercent: 2,
      status: "draft",
    }));

    expect(response.status).toBe(201);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(noticeCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        company_id: "company-1",
        property_id: "property-1",
        created_by_id: "user-1",
        base_rent: 11000,
      }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({ action: "rent_notice.created", entityId: "notice-new" }),
      tx,
    );
  });

  it("does not report create success when mandatory audit persistence fails", async () => {
    getCurrentUserMock.mockResolvedValue(owner);
    writeAuditLogMock.mockRejectedValue(new Error("audit unavailable"));

    const response = await POST(postRequest({
      propertyId: "property-1",
      tenantName: "Anna Andersson",
      unit: "1201",
      period: "2026-08",
      dueDate: "2026-08-31",
      baseRent: 11000,
      status: "draft",
    }));

    expect(response.status).toBe(500);
    expect(noticeCreateMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({ action: "rent_notice.created" }),
      tx,
    );
  });

  it("updates modern rent notice fields and audit in one transaction while scoping active properties", async () => {
    getCurrentUserMock.mockResolvedValue(owner);
    noticeFindFirstMock.mockResolvedValue({
      id: "notice-1",
      tenant_name: "Anna Andersson",
      period: "2026-07",
      status: "draft",
      due_date: new Date("2026-07-31T00:00:00.000Z"),
      base_rent: 10000,
      index_percent: 0,
      additions: 500,
      deductions: 0,
      note: null,
      total: 10500,
    });

    const response = await PATCH(patchRequest({
      noticeId: "notice-1",
      baseRent: 11000,
      additions: 500,
      deductions: 0,
      indexPercent: 2,
      period: "2026-08",
      dueDate: "2026-08-31",
      note: "Uppdaterad avi",
    }));

    expect(response.status).toBe(200);
    expect(noticeFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "notice-1", company_id: "company-1", property: { deleted_at: null } },
    }));
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(noticeUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "notice-1", company_id: "company-1" },
      data: expect.objectContaining({
        base_rent: 11000,
        index_percent: 2,
        period: "2026-08",
        note: "Uppdaterad avi",
      }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({ action: "rent_notice.updated", entityId: "notice-1" }),
      tx,
    );
  });

  it("does not report update success when mandatory audit persistence fails", async () => {
    getCurrentUserMock.mockResolvedValue(owner);
    noticeFindFirstMock.mockResolvedValue({
      id: "notice-1",
      tenant_name: "Anna Andersson",
      period: "2026-07",
      status: "draft",
      due_date: new Date("2026-07-31T00:00:00.000Z"),
      base_rent: 10000,
      index_percent: 0,
      additions: 0,
      deductions: 0,
      note: null,
      total: 10000,
    });
    writeAuditLogMock.mockRejectedValue(new Error("audit unavailable"));

    const response = await PATCH(patchRequest({ noticeId: "notice-1", baseRent: 11000 }));

    expect(response.status).toBe(500);
    expect(noticeUpdateManyMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({ action: "rent_notice.updated" }),
      tx,
    );
  });

  it("returns 404 when notice belongs to a soft-deleted property", async () => {
    getCurrentUserMock.mockResolvedValue(owner);
    noticeFindFirstMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "notice-1" });

    const response = await PATCH(patchRequest({ noticeId: "notice-1", status: "sent" }));

    expect(response.status).toBe(404);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(noticeUpdateManyMock).not.toHaveBeenCalled();
  });

  it("returns 404 without audit if the scoped update loses a race", async () => {
    getCurrentUserMock.mockResolvedValue(owner);
    noticeFindFirstMock.mockResolvedValue({
      id: "notice-1",
      tenant_name: "Anna Andersson",
      period: "2026-07",
      status: "draft",
      due_date: new Date("2026-07-31T00:00:00.000Z"),
      base_rent: 10000,
      index_percent: 0,
      additions: 0,
      deductions: 0,
      note: null,
      total: 10000,
    });
    noticeUpdateManyMock.mockResolvedValue({ count: 0 });

    const response = await PATCH(patchRequest({ noticeId: "notice-1", status: "sent" }));

    expect(response.status).toBe(404);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("fail-closes legacy rent notice updates with Swedish 409", async () => {
    getCurrentUserMock.mockResolvedValue(owner);
    noticeFindFirstMock.mockResolvedValue(null);
    auditFindFirstMock.mockResolvedValue({ id: "legacy-1" });

    const response = await PATCH(patchRequest({ noticeId: "legacy-1", status: "sent" }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/backfill/i);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(noticeUpdateManyMock).not.toHaveBeenCalled();
  });
});
