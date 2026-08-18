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
  writeAuditLogMock: vi.fn(),
}));

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
      updateMany: managedUpdateManyMock,
    },
    auditLog: { findFirst: auditFindFirstMock },
  },
}));

import { PATCH } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";
const params = Promise.resolve({ id: "doc-1" });

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
    managedUpdateManyMock.mockResolvedValue({ count: 1 });
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("updates modern ManagedDocument lifecycle on active (or unscoped) properties with correlation", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    managedFindFirstMock.mockResolvedValue({
      id: "doc-1",
      name: "Ordningsregler",
      visibility: "internal",
      lifecycle_state: "active",
    });

    const response = await PATCH(patchRequest({ transition: "archive" }), { params });
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
    expect(managedUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "doc-1", company_id: "company-1" },
      data: { lifecycle_state: "archived" },
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "document.archived",
    }));
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

  it("returns correlated 404 for orphaned documents on soft-deleted properties", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
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
    expect(managedUpdateManyMock).not.toHaveBeenCalled();
    expect(auditFindFirstMock).not.toHaveBeenCalled();
  });

  it("fail-closes legacy AuditLog documents with Swedish correlated 409", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
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
    expect(managedUpdateManyMock).not.toHaveBeenCalled();
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
