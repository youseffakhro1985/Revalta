import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  auditFindManyMock,
  auditFindFirstMock,
  propertyFindManyMock,
  accessCredentialFindManyMock,
  accessCredentialFindFirstMock,
  accessCredentialUpdateManyMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  auditFindManyMock: vi.fn(),
  auditFindFirstMock: vi.fn(),
  propertyFindManyMock: vi.fn(),
  accessCredentialFindManyMock: vi.fn(),
  accessCredentialFindFirstMock: vi.fn(),
  accessCredentialUpdateManyMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/db", () => ({
  default: {
    accessCredential: {
      findMany: accessCredentialFindManyMock,
      findFirst: accessCredentialFindFirstMock,
      create: vi.fn(),
      updateMany: accessCredentialUpdateManyMock,
    },
    auditLog: { findMany: auditFindManyMock, findFirst: auditFindFirstMock },
    property: { findMany: propertyFindManyMock, findFirst: vi.fn() },
  },
}));

import { GET, PATCH } from "./route";

describe("access credentials route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accessCredentialFindManyMock.mockResolvedValue([]);
    auditFindManyMock.mockResolvedValue([]);
    propertyFindManyMock.mockResolvedValue([]);
    accessCredentialUpdateManyMock.mockResolvedValue({ count: 1 });
    writeAuditLogMock.mockResolvedValue(undefined);
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

  it("updates modern credential fields and writes field audit", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "manager-1", company_id: "company-1", role: "manager" });
    accessCredentialFindFirstMock.mockResolvedValueOnce({
      id: "cred-1",
      status: "in_stock",
      holder: null,
      identifier: "NYCKEL-1",
      credential_type: "key",
      unit: null,
      access_area: null,
      issued_at: null,
      return_due: null,
      note: null,
    });

    const response = await PATCH(
      new Request("http://localhost/api/access-credentials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credentialId: "cred-1",
          identifier: "NYCKEL-2",
          holder: "Anna Andersson",
          unit: "1201",
          accessArea: "Entré",
          note: "Utlämnad till styrelsen",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(accessCredentialUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "cred-1", company_id: "company-1" },
      data: expect.objectContaining({
        identifier: "NYCKEL-2",
        holder: "Anna Andersson",
        unit: "1201",
        access_area: "Entré",
        note: "Utlämnad till styrelsen",
      }),
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "access.credential.updated",
        entityId: "cred-1",
      }),
    );
  });

  it("rejects issued status without holder", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "manager-1", company_id: "company-1", role: "manager" });
    accessCredentialFindFirstMock.mockResolvedValueOnce({
      id: "cred-1",
      status: "in_stock",
      holder: null,
      identifier: "NYCKEL-1",
      credential_type: "key",
      unit: null,
      access_area: null,
      issued_at: null,
      return_due: null,
      note: null,
    });

    const response = await PATCH(
      new Request("http://localhost/api/access-credentials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId: "cred-1", status: "issued", holder: "" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(accessCredentialUpdateManyMock).not.toHaveBeenCalled();
  });

  it("returns 409 for legacy audit-only credentials", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "manager-1", company_id: "company-1", role: "manager" });
    accessCredentialFindFirstMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    auditFindFirstMock.mockResolvedValue({ id: "legacy-1" });

    const response = await PATCH(
      new Request("http://localhost/api/access-credentials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId: "legacy-1", status: "blocked" }),
      }),
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toMatch(/backfill/i);
  });
});
