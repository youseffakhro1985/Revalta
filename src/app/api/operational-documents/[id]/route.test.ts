import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  canManageTicketsMock,
  createLoggerMock,
  getCurrentUserMock,
  isOperationalDocumentAccessibleMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  operationalDocumentFindFirstMock,
  operationalDocumentUpdateManyMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  canManageTicketsMock: vi.fn(),
  createLoggerMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  isOperationalDocumentAccessibleMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  operationalDocumentFindFirstMock: vi.fn(),
  operationalDocumentUpdateManyMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
  canManageTickets: canManageTicketsMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    operationalDocument: {
      findFirst: operationalDocumentFindFirstMock,
      updateMany: operationalDocumentUpdateManyMock,
    },
  },
}));

vi.mock("@/lib/operational-document-access", () => ({
  isOperationalDocumentAccessible: isOperationalDocumentAccessibleMock,
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { DELETE } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";
const params = Promise.resolve({ id: "doc-1" });

function request() {
  return new Request("https://www.revalta.se/api/operational-documents/doc-1", {
    method: "DELETE",
    headers: { "x-request-id": requestId },
  });
}

describe("operational-documents/[id] DELETE", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    canManageTicketsMock.mockReturnValue(true);
    isOperationalDocumentAccessibleMock.mockResolvedValue(true);
    operationalDocumentUpdateManyMock.mockResolvedValue({ count: 1 });
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("returns a correlated stable 401 before touching document data", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const response = await DELETE(request(), { params });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "Obehörig", errorCode: "UNAUTHORIZED", requestId });
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(operationalDocumentFindFirstMock).not.toHaveBeenCalled();
  });

  it("returns a stable correlated 403 when the role cannot manage operational documents", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "resident-1", company_id: "company-1", role: "resident" });
    canManageTicketsMock.mockReturnValue(false);

    const response = await DELETE(request(), { params });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Du saknar behörighet",
      errorCode: "FORBIDDEN",
      requestId,
    });
    expect(operationalDocumentFindFirstMock).not.toHaveBeenCalled();
  });

  it("soft-deletes a verified tenant document and correlates success", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "manager-1", company_id: "company-1", role: "manager" });
    operationalDocumentFindFirstMock.mockResolvedValue({
      id: "doc-1",
      file_name: "protokoll.pdf",
      category: "inspection",
      work_order_id: "work-order-1",
      project_id: null,
      property_id: null,
      technical_asset_id: null,
    });

    const response = await DELETE(request(), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(operationalDocumentFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "doc-1", company_id: "company-1", deleted_at: null },
    }));
    expect(isOperationalDocumentAccessibleMock).toHaveBeenCalled();
    expect(operationalDocumentUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "doc-1", company_id: "company-1", deleted_at: null },
      data: { deleted_at: expect.any(Date) },
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      entityType: "work_order",
      entityId: "work-order-1",
      action: "document.deleted",
    }));
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "operational document delete completed",
      expect.objectContaining({
        event: "operational_documents.delete.completed",
        userId: "manager-1",
        companyId: "company-1",
        documentId: "doc-1",
        entityType: "work_order",
      }),
    );
    expect(JSON.stringify(loggerInfoMock.mock.calls)).not.toContain("protokoll.pdf");
  });

  it("does not log an unverified URL document id when the tenant lookup misses", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "manager-1", company_id: "company-1", role: "manager" });
    operationalDocumentFindFirstMock.mockResolvedValue(null);

    const response = await DELETE(
      new Request("https://www.revalta.se/api/operational-documents/external-secret-id", {
        method: "DELETE",
        headers: { "x-request-id": requestId },
      }),
      { params: Promise.resolve({ id: "external-secret-id" }) },
    );

    expect(response.status).toBe(404);
    expect(JSON.stringify(loggerWarnMock.mock.calls)).not.toContain("external-secret-id");
    expect(operationalDocumentUpdateManyMock).not.toHaveBeenCalled();
  });

  it("returns a safe correlated 500 without leaking dependency details", async () => {
    getCurrentUserMock.mockRejectedValue(new Error("postgres://user:secret@db.internal/revalta"));

    const response = await DELETE(request(), { params });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Internt serverfel", errorCode: "INTERNAL_ERROR", requestId });
    expect(JSON.stringify(body)).not.toContain("postgres://");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "operational document delete failed",
      expect.any(Error),
      expect.objectContaining({ event: "operational_documents.delete.failed" }),
    );
  });
});
