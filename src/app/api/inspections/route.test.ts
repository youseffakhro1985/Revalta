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

import { GET } from "./route";

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
});
