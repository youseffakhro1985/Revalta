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
  propertyFindFirstMock,
  energyCreateMock,
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
  propertyFindFirstMock: vi.fn(),
  energyCreateMock: vi.fn(),
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
      create: energyCreateMock,
    },
    auditLog: { findMany: auditFindManyMock, findFirst: auditFindFirstMock },
    property: { findMany: propertyFindManyMock, findFirst: propertyFindFirstMock },
  },
}));

import { DELETE, GET, PATCH, POST } from "./route";

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

  it("denies technicians from reading energy data", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await GET();
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet att visa energidata");
    expect(energyFindManyMock).not.toHaveBeenCalled();
    expect(propertyFindManyMock).not.toHaveBeenCalled();
  });

  it("rejects residents before listing energy readings", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await GET();
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(energyFindManyMock).not.toHaveBeenCalled();
    expect(propertyFindManyMock).not.toHaveBeenCalled();
    expect(auditFindManyMock).not.toHaveBeenCalled();
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

  it("POST denies residents before creating an energy reading", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await POST(new Request("http://localhost/api/energy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId: "property-1", type: "electricity", period: "2026-07", unit: "kWh", value: 10 }),
    }));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
  });

  it("PATCH denies residents before looking up an energy reading", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await PATCH(new Request("http://localhost/api/energy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readingId: "reading-1", value: 10 }),
    }));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(energyFindFirstMock).not.toHaveBeenCalled();
  });

  it("DELETE denies residents before looking up an energy reading", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await DELETE(new Request("http://localhost/api/energy", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readingId: "reading-1" }),
    }));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(energyFindFirstMock).not.toHaveBeenCalled();
  });

  it("PATCH denies technicians with the finance-manage copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await PATCH(new Request("http://localhost/api/energy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readingId: "reading-1", value: 10 }),
    }));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet");
    expect(energyFindFirstMock).not.toHaveBeenCalled();
  });

  it("returns tenant-safe 404 when Tenant A posts an energy reading against Tenant B propertyId", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });
    propertyFindFirstMock.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/energy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        propertyId: "property-tenant-b",
        type: "electricity",
        period: "2026-07",
        unit: "kWh",
        value: 10,
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Fastigheten hittades inte");
    expect(propertyFindFirstMock).toHaveBeenCalledWith({
      where: { id: "property-tenant-b", deleted_at: null, company_id: "company-1" },
      select: { id: true, name: true, total_area: true },
    });
    expect(energyCreateMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("returns tenant-safe 404 when Tenant A deletes a Tenant B energy reading id", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });
    energyFindFirstMock.mockResolvedValue(null);
    auditFindFirstMock.mockResolvedValue(null);

    const response = await DELETE(new Request("http://localhost/api/energy", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readingId: "reading-tenant-b" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Avläsningen hittades inte");
    expect(energyFindFirstMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { id: "reading-tenant-b", company_id: "company-1", property: { deleted_at: null } },
    }));
    expect(energyDeleteManyMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });
});
