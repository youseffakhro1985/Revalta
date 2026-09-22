import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  inspectionFindManyMock,
  propertyFindManyMock,
  auditFindManyMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  inspectionFindManyMock: vi.fn(),
  propertyFindManyMock: vi.fn(),
  auditFindManyMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    complianceInspection: { findMany: inspectionFindManyMock },
    property: { findMany: propertyFindManyMock },
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
});
