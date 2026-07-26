import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  roundFindFirstMock,
  roundUpdateManyMock,
  auditFindFirstMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  roundFindFirstMock: vi.fn(),
  roundUpdateManyMock: vi.fn(),
  auditFindFirstMock: vi.fn(),
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
    inspectionRound: {
      findFirst: roundFindFirstMock,
      updateMany: roundUpdateManyMock,
    },
    auditLog: { findFirst: auditFindFirstMock },
  },
}));

import { PATCH } from "./route";

const params = Promise.resolve({ id: "round-1" });

describe("rounds/[id] route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    roundUpdateManyMock.mockResolvedValue({ count: 1 });
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("updates modern round fields on active properties", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    roundFindFirstMock.mockResolvedValue({
      id: "round-1",
      title: "Brandrond",
      checklist: [{ id: "item-1", label: "Utrymningsväg", completed: false, hasDeviation: false, note: "", workOrderId: null }],
      status: "in_progress",
      interval: "monthly",
      next_due: new Date("2026-08-01T00:00:00.000Z"),
    });

    const response = await PATCH(new Request("http://localhost/api/rounds/round-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Brandrond uppdaterad",
        interval: "quarterly",
        nextDue: "2026-09-15T00:00:00.000Z",
      }),
    }), { params });

    expect(response.status).toBe(200);
    expect(roundFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "round-1", company_id: "company-1", property: { deleted_at: null } },
    }));
    expect(roundUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "round-1", company_id: "company-1" },
      data: expect.objectContaining({
        title: "Brandrond uppdaterad",
        interval: "quarterly",
        next_due: new Date("2026-09-15T00:00:00.000Z"),
      }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "round.fields_updated",
    }));
  });

  it("returns 404 when round belongs to a soft-deleted property", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    roundFindFirstMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "round-1" });

    const response = await PATCH(new Request("http://localhost/api/rounds/round-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Brandrond" }),
    }), { params });

    expect(response.status).toBe(404);
    expect(roundUpdateManyMock).not.toHaveBeenCalled();
  });

  it("fail-closes legacy round updates with Swedish 409", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    roundFindFirstMock.mockResolvedValue(null);
    auditFindFirstMock.mockResolvedValue({ id: "legacy-1", metadata: {} });

    const response = await PATCH(new Request("http://localhost/api/rounds/legacy-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Legacy rond" }),
    }), { params: Promise.resolve({ id: "legacy-1" }) });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/backfill/i);
    expect(roundUpdateManyMock).not.toHaveBeenCalled();
  });
});
