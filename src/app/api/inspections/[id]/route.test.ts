import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  inspectionFindFirstMock,
  inspectionUpdateManyMock,
  auditFindFirstMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  inspectionFindFirstMock: vi.fn(),
  inspectionUpdateManyMock: vi.fn(),
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
    complianceInspection: {
      findFirst: inspectionFindFirstMock,
      updateMany: inspectionUpdateManyMock,
    },
    auditLog: { findFirst: auditFindFirstMock },
  },
}));

import { PATCH } from "./route";

const params = Promise.resolve({ id: "inspection-1" });

describe("inspections/[id] route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inspectionUpdateManyMock.mockResolvedValue({ count: 1 });
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("updates modern inspection fields on active properties", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    inspectionFindFirstMock.mockResolvedValue({
      id: "inspection-1",
      title: "OVK",
      status: "planned",
      type: "ovk",
      due_date: new Date("2026-08-01T00:00:00.000Z"),
      responsible: "Anna",
      supplier: "Besikt AB",
      interval_months: 24,
      note: null,
    });

    const response = await PATCH(new Request("http://localhost/api/inspections/inspection-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "OVK uppdaterad",
        type: "ovk",
        status: "booked",
        dueDate: "2026-09-15",
        responsible: "Erik",
        supplier: "Kontroll AB",
        intervalMonths: 36,
        note: "Uppdaterad",
      }),
    }), { params });

    expect(response.status).toBe(200);
    expect(inspectionFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "inspection-1", company_id: "company-1", property: { deleted_at: null } },
    }));
    expect(inspectionUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "inspection-1", company_id: "company-1" },
      data: expect.objectContaining({
        title: "OVK uppdaterad",
        type: "ovk",
        status: "booked",
        due_date: new Date("2026-09-15T00:00:00"),
        responsible: "Erik",
        supplier: "Kontroll AB",
        interval_months: 36,
        note: "Uppdaterad",
      }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "inspection.updated",
    }));
  });

  it("returns 404 when inspection belongs to a soft-deleted property", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    inspectionFindFirstMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "inspection-1" });

    const response = await PATCH(new Request("http://localhost/api/inspections/inspection-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "booked" }),
    }), { params });

    expect(response.status).toBe(404);
    expect(inspectionUpdateManyMock).not.toHaveBeenCalled();
  });

  it("fail-closes legacy inspection updates with Swedish 409", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    inspectionFindFirstMock.mockResolvedValue(null);
    auditFindFirstMock.mockResolvedValue({ id: "legacy-1", metadata: {} });

    const response = await PATCH(new Request("http://localhost/api/inspections/legacy-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "booked" }),
    }), { params: Promise.resolve({ id: "legacy-1" }) });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/backfill/i);
    expect(inspectionUpdateManyMock).not.toHaveBeenCalled();
  });
});
