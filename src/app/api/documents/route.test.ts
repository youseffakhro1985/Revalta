import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createLoggerMock,
  getCurrentUserMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  managedFindManyMock,
  auditFindManyMock,
  propertyFindManyMock,
  leaseFindManyMock,
  lifecycleMapMock,
} = vi.hoisted(() => ({
  createLoggerMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  managedFindManyMock: vi.fn(),
  auditFindManyMock: vi.fn(),
  propertyFindManyMock: vi.fn(),
  leaseFindManyMock: vi.fn(),
  lifecycleMapMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("@/lib/document-lifecycle", () => ({ getDocumentLifecycleMap: lifecycleMapMock }));
vi.mock("@/lib/document-file-security", () => ({ validateDocumentFile: vi.fn() }));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));
vi.mock("@/lib/db", () => ({
  default: {
    managedDocument: { findMany: managedFindManyMock },
    auditLog: { findMany: auditFindManyMock },
    property: { findMany: propertyFindManyMock },
    lease: { findMany: leaseFindManyMock },
  },
}));

import { GET, PATCH, POST } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";

function request(method = "GET") {
  return new Request("https://www.revalta.se/api/documents", {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-request-id": requestId,
    },
    ...(method === "PATCH" ? { body: JSON.stringify({}) } : {}),
  });
}

describe("documents route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    managedFindManyMock.mockResolvedValue([]);
    auditFindManyMock.mockResolvedValue([
      {
        id: "doc-1",
        entity_id: null,
        metadata: {
          name: "Hyresavtal",
          dataUrl: "data:application/pdf;base64,SECRET",
          fileName: "avtal.pdf",
          sizeBytes: 123,
        },
        created_at: new Date("2026-07-01T10:00:00Z"),
        actor: { name: "Anna", email: "anna@example.se" },
      },
    ]);
    propertyFindManyMock.mockResolvedValue([]);
    leaseFindManyMock.mockResolvedValue([]);
    lifecycleMapMock.mockResolvedValue(new Map());
  });

  it("scopes document audit logs by company and prefers ManagedDocument rows", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    managedFindManyMock.mockResolvedValue([
      {
        id: "modern-1",
        name: "Ordningsregler",
        category: "rules",
        visibility: "internal",
        lifecycle_state: "active",
        updated_at: new Date("2026-07-02T10:00:00Z"),
        valid_until: null,
        file_name: "regler.pdf",
        content_type: "application/pdf",
        size_bytes: 200,
        property_id: null,
        unit_id: null,
        lease_id: null,
        created_by: { name: "Bo", email: "bo@example.se" },
        created_at: new Date("2026-07-02T10:00:00Z"),
      },
    ]);
    auditFindManyMock.mockResolvedValue([
      {
        id: "audit-modern",
        entity_id: "modern-1",
        metadata: { name: "Ordningsregler", storage: "ManagedDocument" },
        created_at: new Date("2026-07-02T10:00:00Z"),
        actor: { name: "Bo", email: "bo@example.se" },
      },
      {
        id: "doc-1",
        entity_id: null,
        metadata: {
          name: "Hyresavtal",
          dataUrl: "data:application/pdf;base64,SECRET",
          fileName: "avtal.pdf",
          sizeBytes: 123,
        },
        created_at: new Date("2026-07-01T10:00:00Z"),
        actor: { name: "Anna", email: "anna@example.se" },
      },
    ]);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(managedFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        company_id: "company-1",
        OR: [{ property_id: null }, { property: { deleted_at: null } }],
      },
    }));
    expect(auditFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { company_id: "company-1", entity_type: "document", action: "document.created" },
    }));
    expect(body.documents).toHaveLength(2);
    expect(body.documents[0].id).toBe("modern-1");
    expect(body.documents[0].downloadUrl).toBe("/api/documents/modern-1/download");
    expect(body.documents[0].dataUrl).toBeUndefined();
    expect(body.documents[1].id).toBe("doc-1");
    expect(body.documents[1].dataUrl).toBeUndefined();
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "document list completed",
      expect.objectContaining({
        event: "documents.list.completed",
        userId: "user-1",
        companyId: "company-1",
        returned: 2,
      }),
    );
  });

  it("scopes document audit logs by actor for solo users and never returns dataUrl", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: null, role: "owner" });
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(managedFindManyMock).not.toHaveBeenCalled();
    expect(auditFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { actor_user_id: "user-1", entity_type: "document", action: "document.created" },
    }));
    expect(body.documents[0].dataUrl).toBeUndefined();
    expect(body.documents[0].downloadUrl).toBe("/api/documents/doc-1/download");
  });

  it("omits company lease dump for technicians", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(leaseFindManyMock).not.toHaveBeenCalled();
    expect(body.leases).toEqual([]);
  });

  it("returns correlated stable 401s for GET, POST and PATCH before touching document data", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const getResponse = await GET(request());
    const postResponse = await POST(request("POST"));
    const patchResponse = await PATCH(request("PATCH"));

    for (const response of [getResponse, postResponse, patchResponse]) {
      expect(response.status).toBe(401);
      expect(response.headers.get("x-request-id")).toBe(requestId);
      expect(response.headers.get("cache-control")).toContain("no-store");
      await expect(response.json()).resolves.toEqual({
        error: "Obehörig",
        errorCode: "UNAUTHORIZED",
        requestId,
      });
    }
    expect(managedFindManyMock).not.toHaveBeenCalled();
    expect(auditFindManyMock).not.toHaveBeenCalled();
  });

  it("blocks technicians from editing documents before reading document data", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });

    const response = await PATCH(request("PATCH"));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: "Du saknar behörighet att ändra dokument",
      errorCode: "FORBIDDEN",
      requestId,
    });
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(managedFindManyMock).not.toHaveBeenCalled();
    expect(auditFindManyMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "document request rejected",
      expect.objectContaining({
        event: "documents.update.forbidden",
        userId: "tech-1",
        companyId: "company-1",
      }),
    );
  });

  it("returns a safe correlated 500 when authentication fails unexpectedly", async () => {
    getCurrentUserMock.mockRejectedValue(new Error("postgres://user:secret@db.internal/revalta"));

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Internt serverfel",
      errorCode: "INTERNAL_ERROR",
      requestId,
    });
    expect(JSON.stringify(body)).not.toContain("postgres://");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "document list failed",
      expect.any(Error),
      expect.objectContaining({ event: "documents.list.failed" }),
    );
  });
});
