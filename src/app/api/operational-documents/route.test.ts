import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createLoggerMock,
  getCurrentUserMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  operationalDocumentFindManyMock,
  propertyFindFirstMock,
  projectFindFirstMock,
  queryRawMock,
  sqlSoftDeleteGuardMock,
  storeAttachmentMock,
} = vi.hoisted(() => ({
  createLoggerMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  operationalDocumentFindManyMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
  projectFindFirstMock: vi.fn(),
  queryRawMock: vi.fn(),
  sqlSoftDeleteGuardMock: vi.fn(),
  storeAttachmentMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    operationalDocument: { findMany: operationalDocumentFindManyMock },
    property: { findFirst: propertyFindFirstMock },
    project: { findFirst: projectFindFirstMock },
    $queryRaw: queryRawMock,
  },
}));

vi.mock("@/lib/soft-delete-compat", () => ({
  sqlSoftDeleteGuard: sqlSoftDeleteGuardMock,
}));

vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/storage", () => ({
  StorageConfigurationError: class StorageConfigurationError extends Error {},
  storeAttachment: storeAttachmentMock,
}));
vi.mock("@/lib/assigned-work-access", () => ({ findAccessibleWorkOrder: vi.fn() }));

import { GET, POST } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";

function request(path = "?entityType=property&entityId=property-1", method = "GET") {
  return new Request(`https://www.revalta.se/api/operational-documents${path}`, {
    method,
    headers: { "x-request-id": requestId },
  });
}

describe("operational-documents root route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    sqlSoftDeleteGuardMock.mockResolvedValue(Prisma.empty);
    operationalDocumentFindManyMock.mockResolvedValue([]);
    queryRawMock.mockResolvedValue([]);
  });

  it("returns a correlated stable 401 for GET before touching tenant data", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      error: "Obehörig",
      errorCode: "UNAUTHORIZED",
      requestId,
    });
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(propertyFindFirstMock).not.toHaveBeenCalled();
    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it("rejects residents before listing operational documents", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: "En aktiv organisation och personalbehörighet krävs",
      errorCode: "FORBIDDEN",
      requestId,
    });
    expect(propertyFindFirstMock).not.toHaveBeenCalled();
    expect(queryRawMock).not.toHaveBeenCalled();
    expect(operationalDocumentFindManyMock).not.toHaveBeenCalled();
  });

  it("rejects callers without organisation before listing operational documents", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: null, role: "owner" });

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(propertyFindFirstMock).not.toHaveBeenCalled();
    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it("returns a correlated stable 401 for POST before parsing form data", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const response = await POST(request("", "POST"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Obehörig",
      errorCode: "UNAUTHORIZED",
      requestId,
    });
    expect(response.headers.get("x-request-id")).toBe(requestId);
  });

  it("rejects an invalid entity link without querying entity data", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "manager-1", company_id: "company-1", role: "manager" });

    const response = await GET(request("?entityType=unknown&entityId=external-value"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.errorCode).toBe("VALIDATION_FAILED");
    expect(body.requestId).toBe(requestId);
    expect(propertyFindFirstMock).not.toHaveBeenCalled();
    expect(queryRawMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "operational document request rejected",
      expect.objectContaining({
        event: "operational_documents.list.validation_failed",
        reason: "invalid_entity_link",
        userId: "manager-1",
        companyId: "company-1",
      }),
    );
    expect(JSON.stringify(loggerWarnMock.mock.calls)).not.toContain("external-value");
  });

  it("returns a tenant-scoped property document list with private correlated success", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "manager-1", company_id: "company-1", role: "manager" });
    propertyFindFirstMock.mockResolvedValue({ id: "property-1" });
    queryRawMock.mockResolvedValue([{
      id: "doc-1",
      file_name: "protokoll.pdf",
      storage_url: "https://private.blob.vercel-storage.com/internal-object",
      content_type: "application/pdf",
      size_bytes: 1234,
      category: "inspection",
      visibility: "internal",
      version: 1,
      created_at: new Date("2026-08-18T08:00:00Z"),
      uploaded_by: { id: "manager-1", name: "Manager", email: "manager@example.se" },
    }]);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(propertyFindFirstMock).toHaveBeenCalledWith({
      where: { id: "property-1", company_id: "company-1", deleted_at: null },
      select: { id: true },
    });
    expect(body.documents).toHaveLength(1);
    expect(body.documents[0].storage_url).toBe("/api/operational-documents/doc-1/download");
    expect(JSON.stringify(body)).not.toContain("private.blob.vercel-storage.com");
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "operational document list completed",
      expect.objectContaining({
        event: "operational_documents.list.completed",
        userId: "manager-1",
        companyId: "company-1",
        entityType: "property",
        entityId: "property-1",
        returned: 1,
      }),
    );
  });

  it("returns a safe correlated 500 without leaking internal dependency details", async () => {
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
      "operational document list failed",
      expect.any(Error),
      expect.objectContaining({ event: "operational_documents.list.failed" }),
    );
  });
});

describe("operational-documents POST staff-scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
  });

  it("rejects residents before parsing the upload", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
    });

    const response = await POST(request("", "POST"));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: "En aktiv organisation och personalbehörighet krävs",
      errorCode: "FORBIDDEN",
      requestId,
    });
    expect(propertyFindFirstMock).not.toHaveBeenCalled();
    expect(projectFindFirstMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "operational document request rejected",
      expect.objectContaining({ event: "operational_documents.create.staff_required" }),
    );
  });

  it("denies viewers with the manage copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "viewer-1", company_id: "company-1", role: "viewer" });

    const response = await POST(request("", "POST"));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: "Du saknar behörighet",
      errorCode: "FORBIDDEN",
      requestId,
    });
  });

  it("returns tenant-safe 404 when Tenant A lists operational documents for Tenant B propertyId", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "manager-1", company_id: "company-1", role: "manager" });
    propertyFindFirstMock.mockResolvedValue(null);

    const response = await GET(request("?entityType=property&entityId=property-tenant-b"));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Objektet hittades inte");
    expect(propertyFindFirstMock).toHaveBeenCalledWith({
      where: { id: "property-tenant-b", company_id: "company-1", deleted_at: null },
      select: { id: true },
    });
    expect(queryRawMock).not.toHaveBeenCalled();
    expect(operationalDocumentFindManyMock).not.toHaveBeenCalled();
  });

  it("returns tenant-safe 404 when Tenant A uploads against Tenant B propertyId", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "manager-1", company_id: "company-1", role: "manager" });
    propertyFindFirstMock.mockResolvedValue(null);

    const form = new FormData();
    form.append(
      "file",
      new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])], "protokoll.pdf", {
        type: "application/pdf",
      }),
    );
    form.append("entityType", "property");
    form.append("entityId", "property-tenant-b");

    const response = await POST(new Request("https://www.revalta.se/api/operational-documents", {
      method: "POST",
      headers: { "x-request-id": requestId },
      body: form,
    }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Objektet hittades inte");
    expect(storeAttachmentMock).not.toHaveBeenCalled();
    expect(queryRawMock).not.toHaveBeenCalled();
  });
});
