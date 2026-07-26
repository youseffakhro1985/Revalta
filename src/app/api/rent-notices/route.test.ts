import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  noticeFindManyMock,
  noticeFindFirstMock,
  noticeUpdateManyMock,
  auditFindManyMock,
  auditFindFirstMock,
  leaseFindManyMock,
  propertyFindManyMock,
  propertyFindFirstMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  noticeFindManyMock: vi.fn(),
  noticeFindFirstMock: vi.fn(),
  noticeUpdateManyMock: vi.fn(),
  auditFindManyMock: vi.fn(),
  auditFindFirstMock: vi.fn(),
  leaseFindManyMock: vi.fn(),
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
    rentNotice: {
      findMany: noticeFindManyMock,
      findFirst: noticeFindFirstMock,
      updateMany: noticeUpdateManyMock,
      create: vi.fn(),
    },
    lease: { findMany: leaseFindManyMock, findFirst: vi.fn() },
    auditLog: { findMany: auditFindManyMock, findFirst: auditFindFirstMock },
    property: { findMany: propertyFindManyMock, findFirst: propertyFindFirstMock },
  },
}));

import { PATCH } from "./route";

describe("rent-notices route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    noticeFindManyMock.mockResolvedValue([]);
    leaseFindManyMock.mockResolvedValue([]);
    auditFindManyMock.mockResolvedValue([]);
    propertyFindManyMock.mockResolvedValue([]);
    noticeUpdateManyMock.mockResolvedValue({ count: 1 });
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("updates modern rent notice fields and scopes active properties", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
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

    const response = await PATCH(new Request("http://localhost/api/rent-notices", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        noticeId: "notice-1",
        baseRent: 11000,
        additions: 500,
        deductions: 0,
        indexPercent: 2,
        period: "2026-08",
        dueDate: "2026-08-31",
        note: "Uppdaterad avi",
      }),
    }));

    expect(response.status).toBe(200);
    expect(noticeFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "notice-1", company_id: "company-1", property: { deleted_at: null } },
    }));
    expect(noticeUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "notice-1", company_id: "company-1" },
      data: expect.objectContaining({
        base_rent: 11000,
        index_percent: 2,
        period: "2026-08",
        note: "Uppdaterad avi",
      }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "rent_notice.updated",
    }));
  });

  it("returns 404 when notice belongs to a soft-deleted property", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    noticeFindFirstMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "notice-1" });

    const response = await PATCH(new Request("http://localhost/api/rent-notices", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noticeId: "notice-1", status: "sent" }),
    }));

    expect(response.status).toBe(404);
    expect(noticeUpdateManyMock).not.toHaveBeenCalled();
  });

  it("fail-closes legacy rent notice updates with Swedish 409", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    noticeFindFirstMock.mockResolvedValue(null);
    auditFindFirstMock.mockResolvedValue({ id: "legacy-1" });

    const response = await PATCH(new Request("http://localhost/api/rent-notices", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noticeId: "legacy-1", status: "sent" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/backfill/i);
    expect(noticeUpdateManyMock).not.toHaveBeenCalled();
  });
});
