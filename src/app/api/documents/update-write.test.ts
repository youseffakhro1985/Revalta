import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  auditFindFirstMock,
  createLoggerMock,
  getCurrentUserMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  managedFindFirstMock,
  managedUpdateManyMock,
  transactionMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  auditFindFirstMock: vi.fn(),
  createLoggerMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  managedFindFirstMock: vi.fn(),
  managedUpdateManyMock: vi.fn(),
  transactionMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

const tx = {
  managedDocument: { updateMany: managedUpdateManyMock },
  auditLog: { create: vi.fn() },
};

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/db", () => ({
  default: {
    managedDocument: { findFirst: managedFindFirstMock, findMany: vi.fn(), updateMany: vi.fn() },
    auditLog: { findFirst: auditFindFirstMock, findMany: vi.fn() },
    property: { findMany: vi.fn() },
    lease: { findMany: vi.fn() },
    $transaction: transactionMock,
  },
}));
vi.mock("@/lib/storage", () => ({
  hasStorageConfig: vi.fn(),
  storeAttachment: vi.fn(),
  StorageConfigurationError: class StorageConfigurationError extends Error {},
}));
vi.mock("@/lib/runtime-env", () => ({ isProductionRuntime: vi.fn() }));
vi.mock("@/lib/document-file-security", () => ({ validateDocumentFile: vi.fn() }));

import { PATCH } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";
const owner = { id: "owner-1", company_id: "company-1", role: "owner" };
const existing = {
  id: "document-1",
  name: "Hemligt gammalt namn",
  category: "lease",
  visibility: "internal",
  valid_until: null,
  lifecycle_state: "active",
};

function patchRequest(body: Record<string, unknown>) {
  return new Request("https://www.revalta.se/api/documents", {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-request-id": requestId },
    body: JSON.stringify(body),
  });
}

describe("document metadata update write security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    getCurrentUserMock.mockResolvedValue(owner);
    managedFindFirstMock.mockResolvedValue(existing);
    auditFindFirstMock.mockResolvedValue(null);
    managedUpdateManyMock.mockResolvedValue({ count: 1 });
    writeAuditLogMock.mockResolvedValue(undefined);
    transactionMock.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  });

  it("updates metadata and writes minimized audit data in one transaction", async () => {
    const response = await PATCH(patchRequest({
      documentId: "document-1",
      name: "Hemligt nytt namn",
      category: "contract",
      validUntil: "2027-12-31",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, id: "document-1" });
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(managedUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "document-1", company_id: "company-1" },
      data: expect.objectContaining({
        name: "Hemligt nytt namn",
        category: "contract",
        valid_until: expect.any(Date),
      }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({
        entityType: "document",
        entityId: "document-1",
        action: "document.updated",
        metadata: {
          schemaVersion: 6,
          storage: "ManagedDocument",
          changedName: true,
          changedCategory: true,
          changedVisibility: false,
          changedValidUntil: true,
          visibility: "internal",
        },
      }),
      tx,
    );

    const audit = JSON.stringify(writeAuditLogMock.mock.calls[0][1].metadata);
    expect(audit).not.toContain("Hemligt gammalt namn");
    expect(audit).not.toContain("Hemligt nytt namn");
    expect(audit).not.toContain("2027-12-31");
    expect(audit).not.toContain("contract");
    expect(managedUpdateManyMock.mock.invocationCallOrder[0]).toBeLessThan(writeAuditLogMock.mock.invocationCallOrder[0]);
  });

  it("fails closed when audit persistence fails instead of returning a false success", async () => {
    writeAuditLogMock.mockRejectedValue(new Error("audit database unavailable"));

    const response = await PATCH(patchRequest({ documentId: "document-1", name: "Nytt namn" }));
    const body = await response.json();

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(managedUpdateManyMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Internt serverfel", errorCode: "INTERNAL_ERROR", requestId });
    expect(JSON.stringify(body)).not.toContain("audit database unavailable");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "document update failed",
      expect.any(Error),
      expect.objectContaining({ event: "documents.update.failed" }),
    );
  });

  it("does not write audit data when the scoped update matches no document", async () => {
    managedUpdateManyMock.mockResolvedValue({ count: 0 });

    const response = await PATCH(patchRequest({ documentId: "document-1", category: "other" }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: "Dokumentet hittades inte", errorCode: "NOT_FOUND", requestId });
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("keeps archived documents immutable before any write transaction", async () => {
    managedFindFirstMock.mockResolvedValue({ ...existing, lifecycle_state: "archived" });

    const response = await PATCH(patchRequest({ documentId: "document-1", name: "Nytt namn" }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.errorCode).toBe("CONFLICT");
    expect(transactionMock).not.toHaveBeenCalled();
    expect(managedUpdateManyMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });
});
