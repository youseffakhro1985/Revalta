import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  noticeFindManyMock,
  noticeFindFirstMock,
  noticeUpdateManyMock,
  auditFindManyMock,
  auditFindFirstMock,
  leaseFindManyMock,
  leaseFindFirstMock,
  propertyFindManyMock,
  propertyFindFirstMock,
  writeAuditLogMock,
  transactionMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  noticeFindManyMock: vi.fn(),
  noticeFindFirstMock: vi.fn(),
  noticeUpdateManyMock: vi.fn(),
  auditFindManyMock: vi.fn(),
  auditFindFirstMock: vi.fn(),
  leaseFindManyMock: vi.fn(),
  leaseFindFirstMock: vi.fn(),
  propertyFindManyMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  transactionMock: vi.fn(),
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
    $transaction: transactionMock,
    rentNotice: {
      findMany: noticeFindManyMock,
      findFirst: noticeFindFirstMock,
      updateMany: noticeUpdateManyMock,
      create: vi.fn(),
    },
    lease: { findMany: leaseFindManyMock, findFirst: leaseFindFirstMock },
    auditLog: { findMany: auditFindManyMock, findFirst: auditFindFirstMock },
    property: { findMany: propertyFindManyMock, findFirst: propertyFindFirstMock },
  },
}));

import { GET, PATCH, POST } from "./route";

describe("rent-notices route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionMock.mockImplementation(async (callback) => callback({ rentNotice: { updateMany: noticeUpdateManyMock } }));
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
      updated_at: new Date("2026-09-07T12:00:00Z"),
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
      where: { id: "notice-1", company_id: "company-1", status: "draft", updated_at: new Date("2026-09-07T12:00:00Z"), property: { deleted_at: null } },
      data: expect.objectContaining({
        base_rent: 11000,
        index_percent: 2,
        period: "2026-08",
        note: "Uppdaterad avi",
      }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "rent_notice.updated",
    }), expect.objectContaining({ rentNotice: expect.anything() }));
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
  it("rejects an edit made stale by an IMD increment without writing an audit", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    noticeFindFirstMock.mockResolvedValue({ id: "notice-1", status: "draft", period: "2026-09", due_date: new Date("2026-09-30"), updated_at: new Date("2026-09-07"), base_rent: 1000, additions: 0, deductions: 0, index_percent: 0 });
    noticeUpdateManyMock.mockResolvedValue({ count: 0 });
    const response = await PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ noticeId: "notice-1", additions: 10 }) }));
    expect(response.status).toBe(409);
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("fails the transaction when its audit fails", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    noticeFindFirstMock.mockResolvedValue({ id: "notice-1", status: "draft", period: "2026-09", due_date: new Date("2026-09-30"), updated_at: new Date("2026-09-07"), base_rent: 1000, additions: 0, deductions: 0, index_percent: 0 });
    writeAuditLogMock.mockRejectedValue(new Error("audit failed"));
    const response = await PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ noticeId: "notice-1", status: "sent" }) }));
    expect(response.status).toBe(500);
  });

  it("returns tenant-safe 404 when Tenant A creates a rent notice against Tenant B leaseId", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    leaseFindFirstMock.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/rent-notices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leaseId: "lease-tenant-b",
        period: "2026-09",
        dueDate: "2026-09-30",
        status: "draft",
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Kontraktet hittades inte");
    expect(leaseFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "lease-tenant-b", company_id: "company-1", deleted_at: null },
    }));
    expect(propertyFindFirstMock).not.toHaveBeenCalled();
  });

  it("denies technicians from reading rent notices", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await GET();
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet att visa hyresaviseringar");
    expect(noticeFindManyMock).not.toHaveBeenCalled();
    expect(leaseFindManyMock).not.toHaveBeenCalled();
  });

  it("rejects residents before listing rent notices or lease holders", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await GET();
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(noticeFindManyMock).not.toHaveBeenCalled();
    expect(leaseFindManyMock).not.toHaveBeenCalled();
    expect(propertyFindManyMock).not.toHaveBeenCalled();
  });

  it("POST denies residents before creating a rent notice", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await POST(new Request("http://localhost/api/rent-notices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId: "property-1", period: "2026-09", dueDate: "2026-09-30" }),
    }));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(propertyFindFirstMock).not.toHaveBeenCalled();
  });

  it("PATCH denies residents before looking up a rent notice", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await PATCH(new Request("http://localhost/api/rent-notices", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noticeId: "notice-1", status: "sent" }),
    }));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(noticeFindFirstMock).not.toHaveBeenCalled();
  });

  it("PATCH denies technicians with the lease-manage copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await PATCH(new Request("http://localhost/api/rent-notices", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noticeId: "notice-1", status: "sent" }),
    }));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet");
    expect(noticeFindFirstMock).not.toHaveBeenCalled();
  });
});
