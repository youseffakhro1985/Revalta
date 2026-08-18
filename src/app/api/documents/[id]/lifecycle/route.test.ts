import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createLoggerMock,
  getCurrentUserMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  managedFindFirstMock,
  managedUpdateManyMock,
  auditFindFirstMock,
  transactionMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  createLoggerMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  managedFindFirstMock: vi.fn(),
  managedUpdateManyMock: vi.fn(),
  auditFindFirstMock: vi.fn(),
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

vi.mock("@/lib/audit", () => ({
  writeAuditLog: writeAuditLogMock,
}));

vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

vi.mock("@/lib/db", () => ({
  default: {
    managedDocument: {
      findFirst: managedFindFirstMock,
      updateMany: vi.fn(),
    },
    auditLog: { findFirst: auditFindFirstMock },
    $transaction: transactionMock,
  },
}));

import { PATCH } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";
const params = Promise.resolve({ id: "doc-1" });
const owner = { id: "user-1", company_id: "company-1", role: "owner" };

function patchRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/documents/doc-1/lifecycle", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-request-id": requestId,
    },
    body: JSON.stringify(body),
  });
}

describe("documents/[id]/lifecycle route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    getCurrentUserMock.mockResolvedValue(owner);
    managedUpdateManyMock.mockResolvedValue({ count: 1 });
    writeAuditLogMock.mockResolvedValue(undefined);
    transactionMock.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  });

  it("updates modern lifecycle and audit atomically with minimized metadata", async () => {
    managedFindFirstMock.mockResolvedValue({
      id: "doc-1",
      visibility: "internal",
      lifecycle_state: "active",
    });

    const response = await PATCH(patchRequest({
      transition: "archive",
      reason: "Känslig fritext om hyresgäst 19700101-1234",
    }), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body).toEqual({ success: true, state: "archived" });
    expect(managedFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "doc-1",
        company_id: "company-1",
        OR: [{ property_id: null }, { property: { deleted_at: null } }],
      },
    }));
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(managedUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "doc-1", company_id: "company-1" },
      data: { lifecycle_state: "archived" },
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({
        entityType: "document",
        entityId: "doc-1",
        action: "document.archived",
        metadata: {
          schemaVersion: 6,
          storage: "ManagedDocument",
          previousState: "active",
          nextState: "archived",
          previousVisibility: "internal",
          reasonProvided: true,
        },
      }),
      tx,
    );
    const audit = JSON.stringify(writeAuditLogMock.mock.calls[0][1].metadata);
    expect(audit).not.toContain("Känslig fritext");
    expect(audit).not.toContain("19700101-1234");
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "document lifecycle completed",
      expect.objectContaining({
        event: "documents.lifecycle.completed",
        userId: "user-1",
        companyId: "company-1",
        documentId: "doc-1",
        transition: "archive",
      }),
    );
  });

  it("fails closed when lifecycle audit persistence fails", async () => {
    managedFindFirstMock.mockResolvedValue({
      id: "doc-1",
      visibility: "internal",
      lifecycle_state: "active",
    });
    writeAuditLogMock.mockRejectedValue(new Error("audit database secret"));

    const response = await PATCH(patchRequest({ transition: "archive", reason: "Hemlig anledning" }), { params });
    const body = await response.json();

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(managedUpdateManyMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Internt serverfel",
      errorCode: "INTERNAL_ERROR",
      requestId,
    });
    expect(JSON.stringify(body)).not.toContain("audit database secret");
    expect(JSON.stringify(body)).not.toContain("Hemlig anledning");
  });

  it("does not audit when the scoped lifecycle update matches no document", async () => {
    managedFindFirstMock.mockResolvedValue({
      id: "doc-1",
      visibility: "internal",
      lifecycle_state: "active",
    });
    managedUpdateManyMock.mockResolvedValue({ count: 0 });

    const response = await PATCH(patchRequest({ transition: "archive" }), { params });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.errorCode).toBe("NOT_FOUND");
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("returns correlated 404 for orphaned documents on soft-deleted properties", async () => {
    managedFindFirstMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "doc-1" });

    const response = await PATCH(patchRequest({ transition: "archive" }), { params });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      error: "Dokumentet hittades inte",
      errorCode: "NOT_FOUND",
      requestId,
    });
    expect(transactionMock).not.toHaveBeenCalled();
    expect(auditFindFirstMock).not.toHaveBeenCalled();
  });

  it("fail-closes legacy AuditLog documents with Swedish correlated 409", async () => {
    managedFindFirstMock.mockResolvedValue(null);
    auditFindFirstMock.mockResolvedValue({ id: "legacy-1" });

    const response = await PATCH(patchRequest({ transition: "archive" }), {
      params: Promise.resolve({ id: "legacy-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/backfill/i);
    expect(body.errorCode).toBe("CONFLICT");
    expect(body.requestId).toBe(requestId);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns a stable correlated 403 for technicians", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });

    const response = await PATCH(patchRequest({ transition: "archive" }), { params });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: "Du saknar behörighet att ändra dokument",
      errorCode: "FORBIDDEN",
      requestId,
    });
    expect(managedFindFirstMock).not.toHaveBeenCalled();
  });

  it("returns a safe correlated 500 without leaking internal errors", async () => {
    getCurrentUserMock.mockRejectedValue(new Error("database-secret-connection-string"));

    const response = await PATCH(patchRequest({ transition: "archive" }), { params });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Internt serverfel",
      errorCode: "INTERNAL_ERROR",
      requestId,
    });
    expect(JSON.stringify(body)).not.toContain("database-secret");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "document lifecycle failed",
      expect.any(Error),
      expect.objectContaining({ event: "documents.lifecycle.failed" }),
    );
  });
});
