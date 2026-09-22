import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  imdFindManyMock,
  imdFindFirstMock,
  imdUpdateManyMock,
  debitUpdateManyMock,
  transactionMock,
  auditFindManyMock,
  auditFindFirstMock,
  writeAuditLogMock,
  propertyFindManyMock,
  propertyFindFirstMock,
  leaseFindManyMock,
  leaseFindFirstMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  imdFindManyMock: vi.fn(),
  imdFindFirstMock: vi.fn(),
  imdUpdateManyMock: vi.fn(),
  debitUpdateManyMock: vi.fn(),
  transactionMock: vi.fn(),
  auditFindManyMock: vi.fn(),
  auditFindFirstMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  propertyFindManyMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
  leaseFindManyMock: vi.fn(),
  leaseFindFirstMock: vi.fn(),
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
    imdReading: {
      findMany: imdFindManyMock,
      findFirst: imdFindFirstMock,
      updateMany: imdUpdateManyMock,
    },
    imdDebitLine: { updateMany: debitUpdateManyMock },
    auditLog: { findMany: auditFindManyMock, findFirst: auditFindFirstMock },
    property: { findMany: propertyFindManyMock, findFirst: propertyFindFirstMock },
    lease: { findMany: leaseFindManyMock, findFirst: leaseFindFirstMock },
    $transaction: transactionMock,
  },
}));

import { GET, PATCH, POST } from "./route";

describe("imd-readings route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    propertyFindManyMock.mockResolvedValue([]);
    leaseFindManyMock.mockResolvedValue([]);
    auditFindManyMock.mockResolvedValue([]);
    imdUpdateManyMock.mockResolvedValue({ count: 1 });
    debitUpdateManyMock.mockResolvedValue({ count: 1 });
    writeAuditLogMock.mockResolvedValue(undefined);
    transactionMock.mockImplementation(async (callback) => callback({
      imdReading: { updateMany: imdUpdateManyMock },
      imdDebitLine: { updateMany: debitUpdateManyMock },
    }));
  });

  it("returns modern IMD readings with debit status and scopes by company", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    imdFindManyMock.mockResolvedValue([
      {
        id: "reading-1",
        property_id: "property-1",
        property_name: "Storgatan 1",
        unit: "1101",
        meter_id: "EL-1",
        meter_type: "electricity",
        period: "2026-07",
        previous_reading: 10,
        current_reading: 20,
        consumption: 10,
        unit_price: 2,
        charge: 20,
        note: null,
        created_at: new Date("2026-07-20T10:00:00Z"),
        debit_line: {
          id: "debit-1",
          status: "open",
          rent_notice_id: null,
          lease_id: null,
          charge: 20,
        },
      },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(imdFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { company_id: "company-1", voided_at: null, property: { deleted_at: null } },
    }));
    expect(body.readings).toHaveLength(1);
    expect(body.readings[0].debit.status).toBe("open");
    expect(body.readings[0].charge).toBe(20);
  });

  it("voids modern unattached IMD readings and rejects linked or legacy rows", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    imdFindFirstMock.mockResolvedValueOnce({
      id: "reading-1",
      property_id: "property-1",
      meter_id: "EL-1",
      period: "2026-07",
      debit_line: { id: "debit-1", rent_notice_id: null, status: "open" },
    });
    transactionMock.mockImplementation(async (callback: (tx: {
      imdReading: { updateMany: typeof imdUpdateManyMock };
      imdDebitLine: { updateMany: typeof debitUpdateManyMock };
    }) => Promise<unknown>) => callback({
      imdReading: { updateMany: imdUpdateManyMock },
      imdDebitLine: { updateMany: debitUpdateManyMock },
    }));
    imdUpdateManyMock.mockResolvedValue({ count: 1 });
    debitUpdateManyMock.mockResolvedValue({ count: 1 });

    const ok = await PATCH(new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readingId: "reading-1", action: "void" }),
    }));
    expect(ok.status).toBe(200);
    expect(imdUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "reading-1", company_id: "company-1", voided_at: null },
      data: { voided_at: expect.any(Date) },
    }));

    imdFindFirstMock.mockResolvedValueOnce({
      id: "reading-2",
      property_id: "property-1",
      meter_id: "EL-2",
      period: "2026-07",
      debit_line: { id: "debit-2", rent_notice_id: "notice-1", status: "linked" },
    });
    const linked = await PATCH(new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readingId: "reading-2", action: "void" }),
    }));
    expect(linked.status).toBe(409);
    expect((await linked.json()).error).toMatch(/hyresavi/i);

    imdFindFirstMock.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    auditFindFirstMock.mockResolvedValue({ id: "legacy-1", metadata: { storage: "AuditLog" } });
    const legacy = await PATCH(new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readingId: "legacy-1", action: "void" }),
    }));
    expect(legacy.status).toBe(409);
    expect((await legacy.json()).error).toMatch(/backfill/i);
  });
  it.each([{ action: "void" }, { currentReading: 30 }])("rejects a concurrent debit attachment for %j", async (change) => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    imdFindFirstMock.mockResolvedValue({
      id: "reading-1", property_id: "property-1", unit: "1101", meter_id: "EL-1", period: "2026-09",
      previous_reading: 10, current_reading: 20, unit_price: 2,
      debit_line: { id: "debit-1", rent_notice_id: null, status: "open", updated_at: new Date("2026-09-07T12:00:00Z") },
    });
    debitUpdateManyMock.mockResolvedValue({ count: 0 });
    const response = await PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ readingId: "reading-1", ...change }) }));
    expect(response.status).toBe(409);
    expect(writeAuditLogMock).not.toHaveBeenCalled();
    expect(debitUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      company_id: "company-1", rent_notice_id: null, status: "open", updated_at: new Date("2026-09-07T12:00:00Z"),
    }) }));
  });

  it("keeps the mutation and audit in the same transaction", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    imdFindFirstMock.mockResolvedValue({ id: "reading-1", property_id: "property-1", debit_line: { id: "debit-1", status: "open", rent_notice_id: null } });
    writeAuditLogMock.mockRejectedValue(new Error("audit failed"));
    const response = await PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ readingId: "reading-1", action: "void" }) }));
    expect(response.status).toBe(500);
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "imd.reading.voided" }), expect.objectContaining({ imdReading: expect.anything() }));
  });

  it("denies technicians from reading IMD readings", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await GET();
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet att visa IMD-mätvärden");
    expect(imdFindManyMock).not.toHaveBeenCalled();
    expect(leaseFindManyMock).not.toHaveBeenCalled();
  });

  it("rejects residents before listing IMD readings or lease holders", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await GET();
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(imdFindManyMock).not.toHaveBeenCalled();
    expect(leaseFindManyMock).not.toHaveBeenCalled();
    expect(propertyFindManyMock).not.toHaveBeenCalled();
  });

  it("POST denies residents before creating an IMD reading", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await POST(new Request("http://localhost/api/imd-readings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId: "property-1", unit: "1101", meterId: "m-1", period: "2026-07" }),
    }));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
  });

  it("PATCH denies residents before looking up an IMD reading", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await PATCH(new Request("http://localhost/api/imd-readings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readingId: "reading-1", action: "void" }),
    }));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(imdFindFirstMock).not.toHaveBeenCalled();
  });

  it("PATCH denies technicians with the finance-manage copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await PATCH(new Request("http://localhost/api/imd-readings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readingId: "reading-1", action: "void" }),
    }));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet");
    expect(imdFindFirstMock).not.toHaveBeenCalled();
  });

  it("returns tenant-safe 404 when Tenant A posts an IMD reading against Tenant B propertyId", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });
    propertyFindFirstMock.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/imd-readings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        propertyId: "property-tenant-b",
        unit: "1101",
        meterId: "EL-1",
        type: "electricity",
        period: "2026-07",
        previousReading: 10,
        currentReading: 20,
        unitPrice: 1.5,
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Fastigheten hittades inte");
    expect(propertyFindFirstMock).toHaveBeenCalledWith({
      where: { id: "property-tenant-b", deleted_at: null, company_id: "company-1" },
      select: { id: true, name: true },
    });
    expect(leaseFindFirstMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns tenant-safe 404 when Tenant A posts an IMD reading against Tenant B leaseId", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });
    propertyFindFirstMock.mockResolvedValue({ id: "property-1", name: "Storgatan 1" });
    leaseFindFirstMock.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/imd-readings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        propertyId: "property-1",
        leaseId: "lease-tenant-b",
        unit: "1101",
        meterId: "EL-1",
        type: "electricity",
        period: "2026-07",
        previousReading: 10,
        currentReading: 20,
        unitPrice: 1.5,
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Hyresavtalet hittades inte för fastigheten");
    expect(leaseFindFirstMock).toHaveBeenCalledWith({
      where: {
        id: "lease-tenant-b",
        company_id: "company-1",
        property_id: "property-1",
        deleted_at: null,
      },
      select: { id: true, unit: { select: { designation: true } } },
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
