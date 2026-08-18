import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createLoggerMock,
  getCurrentUserMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  propertyFindFirstMock,
  propertyUpdateManyMock,
  transactionMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  createLoggerMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
  propertyUpdateManyMock: vi.fn(),
  transactionMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));
vi.mock("@/lib/db", () => {
  const dbMock = {
    property: { findFirst: propertyFindFirstMock, updateMany: propertyUpdateManyMock },
    $transaction: transactionMock,
  };
  transactionMock.mockImplementation((callback: (tx: typeof dbMock) => unknown) => callback(dbMock));
  return { default: dbMock };
});

import { POST } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";
const params = Promise.resolve({ id: "property-1" });
const owner = { id: "user-1", company_id: "company-1", role: "owner" };

function request(id = "property-1") {
  return new Request(`http://localhost/api/properties/${id}/restore`, {
    method: "POST",
    headers: { "x-request-id": requestId },
  });
}

describe("properties/[id]/restore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    writeAuditLogMock.mockResolvedValue(undefined);
    propertyUpdateManyMock.mockResolvedValue({ count: 1 });
    transactionMock.mockImplementation((callback) => callback({
      property: { findFirst: propertyFindFirstMock, updateMany: propertyUpdateManyMock },
    }));
  });

  it("restores a tenant-scoped soft-deleted property atomically with correlation", async () => {
    getCurrentUserMock.mockResolvedValue(owner);
    propertyFindFirstMock.mockResolvedValue({ id: "property-1", name: "Brf Sol", status: "active" });

    const response = await POST(request(), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body).toEqual({ success: true, id: "property-1" });
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(propertyUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "property-1", company_id: "company-1", deleted_at: { not: null } },
      data: { deleted_at: null },
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({ action: "property.restored", entityId: "property-1" }),
      expect.anything(),
    );
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "property restore completed",
      expect.objectContaining({
        event: "properties.restore.completed",
        userId: "user-1",
        companyId: "company-1",
        propertyId: "property-1",
      }),
    );
    expect(JSON.stringify(loggerInfoMock.mock.calls)).not.toContain("Brf Sol");
  });

  it("returns stable correlated auth errors before property access", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const unauthorized = await POST(request(), { params });
    expect(unauthorized.status).toBe(401);
    await expect(unauthorized.json()).resolves.toEqual({ error: "Obehörig", errorCode: "UNAUTHORIZED", requestId });
    expect(propertyFindFirstMock).not.toHaveBeenCalled();

    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const forbidden = await POST(request(), { params });
    expect(forbidden.status).toBe(403);
    expect((await forbidden.json()).errorCode).toBe("FORBIDDEN");
    expect(propertyFindFirstMock).not.toHaveBeenCalled();
  });

  it("returns correlated 404 without logging an unverified property id", async () => {
    getCurrentUserMock.mockResolvedValue(owner);
    propertyFindFirstMock.mockResolvedValue(null);

    const response = await POST(request("external-secret-property"), {
      params: Promise.resolve({ id: "external-secret-property" }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.errorCode).toBe("NOT_FOUND");
    expect(body.requestId).toBe(requestId);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(JSON.stringify(loggerWarnMock.mock.calls)).not.toContain("external-secret-property");
  });

  it("does not report success when the audit write fails inside the transaction", async () => {
    getCurrentUserMock.mockResolvedValue(owner);
    propertyFindFirstMock.mockResolvedValue({ id: "property-1", name: "Brf Sol", status: "active" });
    writeAuditLogMock.mockRejectedValue(new Error("audit db unavailable"));

    const response = await POST(request(), { params });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.errorCode).toBe("INTERNAL_ERROR");
    expect(body.requestId).toBe(requestId);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "property restore failed",
      expect.any(Error),
      expect.objectContaining({ event: "properties.restore.failed" }),
    );
  });
});
