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
  leaseFindManyMock,
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
  leaseFindManyMock: vi.fn(),
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
    property: { findMany: propertyFindManyMock },
    lease: { findMany: leaseFindManyMock },
    $transaction: transactionMock,
  },
}));

import { GET, PATCH } from "./route";

describe("imd-readings route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    propertyFindManyMock.mockResolvedValue([]);
    leaseFindManyMock.mockResolvedValue([]);
    auditFindManyMock.mockResolvedValue([]);
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
      where: { company_id: "company-1", voided_at: null },
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
});
