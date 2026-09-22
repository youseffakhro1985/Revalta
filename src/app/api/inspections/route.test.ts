import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  inspectionFindManyMock,
  inspectionCreateMock,
  propertyFindManyMock,
  propertyFindFirstMock,
  auditFindManyMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  inspectionFindManyMock: vi.fn(),
  inspectionCreateMock: vi.fn(),
  propertyFindManyMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
  auditFindManyMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));

vi.mock("@/lib/db", () => ({
  default: {
    complianceInspection: { findMany: inspectionFindManyMock, create: inspectionCreateMock },
    property: { findMany: propertyFindManyMock, findFirst: propertyFindFirstMock },
    auditLog: { findMany: auditFindManyMock },
  },
}));

import { GET, POST } from "./route";

describe("inspections staff scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inspectionFindManyMock.mockResolvedValue([]);
    propertyFindManyMock.mockResolvedValue([]);
    auditFindManyMock.mockResolvedValue([]);
  });

  it("rejects residents before listing inspections or properties", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
    });

    const response = await GET();
    expect(response.status).toBe(403);
    expect(inspectionFindManyMock).not.toHaveBeenCalled();
    expect(propertyFindManyMock).not.toHaveBeenCalled();
  });

  it("lets technicians list company inspections", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "tech-1",
      company_id: "company-1",
      role: "technician",
    });

    const response = await GET();
    expect(response.status).toBe(200);
    expect(inspectionFindManyMock).toHaveBeenCalled();
    expect(propertyFindManyMock).toHaveBeenCalled();
  });

  it("POST rejects residents before creating an inspection", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
    });

    const response = await POST(new Request("http://localhost/api/inspections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "OVK", propertyId: "property-1" }),
    }));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(inspectionFindManyMock).not.toHaveBeenCalled();
    expect(propertyFindManyMock).not.toHaveBeenCalled();
  });

  it("POST denies viewers with the manage copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "viewer-1", company_id: "company-1", role: "viewer" });

    const response = await POST(new Request("http://localhost/api/inspections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "OVK", propertyId: "property-1" }),
    }));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet");
  });

  it("returns tenant-safe 404 when Tenant A posts an inspection against Tenant B propertyId", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });
    propertyFindFirstMock.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/inspections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "OVK Tenant B",
        propertyId: "property-tenant-b",
        type: "ovk",
        dueDate: "2026-10-01",
        status: "planned",
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Fastigheten hittades inte");
    expect(propertyFindFirstMock).toHaveBeenCalledWith({
      where: { id: "property-tenant-b", deleted_at: null, company_id: "company-1" },
      select: { id: true, name: true },
    });
    expect(inspectionCreateMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });
});
