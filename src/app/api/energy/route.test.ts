import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  energyFindManyMock,
  energyFindFirstMock,
  energyUpdateManyMock,
  energyDeleteManyMock,
  auditFindManyMock,
  auditFindFirstMock,
  propertyFindManyMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  energyFindManyMock: vi.fn(),
  energyFindFirstMock: vi.fn(),
  energyUpdateManyMock: vi.fn(),
  energyDeleteManyMock: vi.fn(),
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
    energyReading: {
      findMany: energyFindManyMock,
      findFirst: energyFindFirstMock,
      updateMany: energyUpdateManyMock,
      deleteMany: energyDeleteManyMock,
      create: vi.fn(),
    },
    auditLog: { findMany: auditFindManyMock, findFirst: auditFindFirstMock },
    property: { findMany: propertyFindManyMock, findFirst: vi.fn() },
  },
}));

import { DELETE, PATCH } from "./route";

describe("energy route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    energyFindManyMock.mockResolvedValue([]);
    auditFindManyMock.mockResolvedValue([]);
    propertyFindManyMock.mockResolvedValue([]);
    energyUpdateManyMock.mockResolvedValue({ count: 1 });
    energyDeleteManyMock.mockResolvedValue({ count: 1 });
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("updates modern energy fields and scopes active properties", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    energyFindFirstMock.mockResolvedValue({
      id: "reading-1",
      property_id: "property-1",
      type: "electricity",
      period: "2026-07",
      unit: "kWh",
      value: 100,
      cost: 200,
      note: null,
      property: { total_area: 100 },
    });

    const response = await PATCH(new Request("http://localhost/api/energy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        readingId: "reading-1",
        value: 120,
        cost: 240,
        period: "2026-08",
        note: "Korrigerad",
      }),
    }));

    expect(response.status).toBe(200);
    expect(energyFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "reading-1", company_id: "company-1", property: { deleted_at: null } },
    }));
    expect(energyUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "reading-1", company_id: "company-1" },
      data: expect.objectContaining({
        period: "2026-08",
        value: 120,
        cost: 240,
        note: "Korrigerad",
        value_per_sqm: 1.2,
        cost_per_sqm: 2.4,
      }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "energy.reading.updated",
    }));
  });

  it("returns 404 when reading belongs to a soft-deleted property", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    energyFindFirstMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "reading-1" });

    const response = await PATCH(new Request("http://localhost/api/energy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readingId: "reading-1", value: 10 }),
    }));

    expect(response.status).toBe(404);
    expect(energyUpdateManyMock).not.toHaveBeenCalled();
  });

  it("fail-closes legacy energy PATCH/DELETE with Swedish 409", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    energyFindFirstMock.mockResolvedValue(null);
    auditFindFirstMock.mockResolvedValue({ id: "legacy-1" });

    const patch = await PATCH(new Request("http://localhost/api/energy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readingId: "legacy-1", value: 10 }),
    }));
    expect(patch.status).toBe(409);
    expect((await patch.json()).error).toMatch(/backfill/i);

    energyFindFirstMock.mockResolvedValue(null);
    auditFindFirstMock.mockResolvedValue({ id: "legacy-1" });
    const del = await DELETE(new Request("http://localhost/api/energy", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readingId: "legacy-1" }),
    }));
    expect(del.status).toBe(409);
    expect((await del.json()).error).toMatch(/backfill/i);
  });

  it("hard-deletes modern energy readings and writes delete audit", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    energyFindFirstMock.mockResolvedValue({
      id: "reading-1",
      type: "heating",
      period: "2026-07",
      property_id: "property-1",
    });

    const response = await DELETE(new Request("http://localhost/api/energy", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readingId: "reading-1" }),
    }));

    expect(response.status).toBe(200);
    expect(energyFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "reading-1", company_id: "company-1", property: { deleted_at: null } },
    }));
    expect(energyDeleteManyMock).toHaveBeenCalledWith({
      where: { id: "reading-1", company_id: "company-1" },
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "energy.reading.deleted",
    }));
  });
});
