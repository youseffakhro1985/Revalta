import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserMock, auditFindManyMock, propertyFindManyMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  auditFindManyMock: vi.fn(),
  propertyFindManyMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/db", () => ({
  default: {
    auditLog: { findMany: auditFindManyMock },
    property: { findMany: propertyFindManyMock, findFirst: vi.fn() },
  },
}));

import { GET } from "./route";

describe("access credentials route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditFindManyMock.mockResolvedValue([]);
    propertyFindManyMock.mockResolvedValue([]);
  });

  it("denies technicians from reading access credentials", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await GET();

    expect(response.status).toBe(403);
    expect(auditFindManyMock).not.toHaveBeenCalled();
  });

  it("allows managers and scopes audit logs by company", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "manager-1", company_id: "company-1", role: "manager" });
    const response = await GET();

    expect(response.status).toBe(200);
    expect(auditFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { company_id: "company-1", action: "access.credential.created" },
    }));
  });
});
