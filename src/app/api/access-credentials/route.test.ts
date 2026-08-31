import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  auditFindManyMock,
  auditFindFirstMock,
  propertyFindManyMock,
  propertyFindFirstMock,
  accessCredentialFindManyMock,
  accessCredentialFindFirstMock,
  accessCredentialCreateMock,
  accessCredentialUpdateManyMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  auditFindManyMock: vi.fn(),
  auditFindFirstMock: vi.fn(),
  propertyFindManyMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
  accessCredentialFindManyMock: vi.fn(),
  accessCredentialFindFirstMock: vi.fn(),
  accessCredentialCreateMock: vi.fn(),
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
      create: accessCredentialCreateMock,
      updateMany: accessCredentialUpdateManyMock,
    },
    auditLog: { findMany: auditFindManyMock, findFirst: auditFindFirstMock },
    property: { findMany: propertyFindManyMock, findFirst: propertyFindFirstMock },
  },
}));

import { GET, PATCH, POST } from "./route";

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

  it("filters audit mirrors for modern access credentials without relying on matching timestamps", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "manager-1", company_id: "company-1", role: "manager" });
    accessCredentialFindManyMock.mockResolvedValue([{
      id: "cred-1",
      property_id: "property-1",
      identifier: "NYCKEL-1",
      credential_type: "key",
      holder: "Anna Andersson",
      unit: "1201",
      access_area: "Entré",
      status: "issued",
      issued_at: new Date("2026-08-31T08:00:00.000Z"),
      return_due: null,
      note: "Modern sanningskälla",
      created_at: new Date("2026-08-31T08:00:00.000Z"),
      property: { name: "Fastighet 1" },
      created_by: { name: "Manager", email: "manager@example.com" },
    }]);
    auditFindManyMock.mockResolvedValue([{
      id: "audit-1",
      entity_id: "cred-1",
      metadata: {
        storage: "AccessCredential",
        identifier: "NYCKEL-1",
        credential_type: "key",
        holder: "Anna Andersson",
      },
      created_at: new Date("2026-08-31T08:00:03.000Z"),
    }]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.credentials).toHaveLength(1);
    expect(body.credentials[0]).toEqual(expect.objectContaining({
      id: "cred-1",
      property_id: "property-1",
      identifier: "NYCKEL-1",
      source: "table",
    }));
  });

  it("creates credentials without duplicating raw passage secrets into audit metadata", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "manager-1",
      company_id: "company-1",
      role: "manager",
      name: "Manager",
      email: "manager@example.com",
    });
    propertyFindFirstMock.mockResolvedValue({ id: "property-1", name: "Fastighet 1" });
    accessCredentialCreateMock.mockResolvedValue({
      id: "cred-2",
      created_at: new Date("2026-08-31T09:00:00.000Z"),
    });

    const response = await POST(new Request("http://localhost/api/access-credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        propertyId: "property-1",
        identifier: "PORTKOD-7391",
        credentialType: "code",
        holder: "Anna Andersson",
        unit: "1201",
        accessArea: "Entré och garage",
        status: "issued",
        note: "Tillfällig kod till entreprenör",
      }),
    }));

    expect(response.status).toBe(201);
    expect(accessCredentialCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        company_id: "company-1",
        property_id: "property-1",
        identifier: "PORTKOD-7391",
        holder: "Anna Andersson",
        access_area: "Entré och garage",
        note: "Tillfällig kod till entreprenör",
      }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledTimes(1);
    const auditPayload = writeAuditLogMock.mock.calls[0][1];
    expect(auditPayload.metadata).toEqual({
      property_id: "property-1",
      credential_type: "code",
      status: "issued",
      storage: "AccessCredential",
    });
    expect(JSON.stringify(auditPayload.metadata)).not.toContain("PORTKOD-7391");
    expect(JSON.stringify(auditPayload.metadata)).not.toContain("Anna Andersson");
    expect(JSON.stringify(auditPayload.metadata)).not.toContain("entreprenör");
  });

  it("updates modern credential fields and writes field audit without raw credential data", async () => {
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
        metadata: {
          previousStatus: "in_stock",
          status: "in_stock",
          credential_type: "key",
          changed_fields: ["identifier", "holder", "unit", "accessArea", "note"],
          storage: "AccessCredential",
        },
      }),
    );
    const auditPayload = writeAuditLogMock.mock.calls[0][1];
    expect(JSON.stringify(auditPayload.metadata)).not.toContain("NYCKEL-2");
    expect(JSON.stringify(auditPayload.metadata)).not.toContain("Anna Andersson");
    expect(JSON.stringify(auditPayload.metadata)).not.toContain("Utlämnad till styrelsen");
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
