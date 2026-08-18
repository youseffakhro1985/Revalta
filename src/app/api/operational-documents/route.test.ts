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
  storeAttachment: vi.fn(),
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
