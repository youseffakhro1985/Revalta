import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  auditFindManyMock,
  propertyFindManyMock,
  accessCredentialFindManyMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  auditFindManyMock: vi.fn(),
  propertyFindManyMock: vi.fn(),
  accessCredentialFindManyMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/db", () => ({
  default: {
    accessCredential: { findMany: accessCredentialFindManyMock, create: vi.fn() },
    auditLog: { findMany: auditFindManyMock },
    property: { findMany: propertyFindManyMock, findFirst: vi.fn() },
  },
}));

import { GET } from "./route";

describe("access credentials route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accessCredentialFindManyMock.mockResolvedValue([]);
    auditFindManyMock.mockResolvedValue([]);
    propertyFindManyMock.mockResolvedValue([]);
  });

  it("denies technicians from reading access credentials", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await GET();

    expect(response.status).toBe(403);
    expect(accessCredentialFindManyMock).not.toHaveBeenCalled();
    expect(auditFindManyMock).not.toHaveBeenCalled();
  });

  it("allows managers and scopes table + legacy audit rows by company", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "manager-1", company_id: "company-1", role: "manager" });
    const response = await GET();

    expect(response.status).toBe(200);
    expect(accessCredentialFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { company_id: "company-1", property: { deleted_at: null } },
    }));
    expect(auditFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { company_id: "company-1", action: "access.credential.created" },
    }));
  });
});
