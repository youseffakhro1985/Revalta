import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createLoggerMock,
  getCurrentUserMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  notDeletedFilterMock,
  propertyCreateMock,
  propertyFindManyMock,
  transactionMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  createLoggerMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  notDeletedFilterMock: vi.fn(),
  propertyCreateMock: vi.fn(),
  propertyFindManyMock: vi.fn(),
  transactionMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/schema-readiness", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/schema-readiness")>()),
  notDeletedFilter: notDeletedFilterMock,
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));
vi.mock("@/lib/db", () => ({
  default: {
    property: { findMany: propertyFindManyMock },
    $transaction: transactionMock,
  },
}));

import { GET, POST } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";
const owner = { id: "owner-1", company_id: "company-1", role: "owner" };

function getRequest() {
  return new Request("https://www.revalta.se/api/properties", {
    headers: { "x-request-id": requestId },
  });
}

function postRequest(body: unknown) {
  return new Request("https://www.revalta.se/api/properties", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-request-id": requestId,
    },
    body: JSON.stringify(body),
  });
}

describe("properties root route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    notDeletedFilterMock.mockResolvedValue({ deleted_at: null });
    propertyFindManyMock.mockResolvedValue([]);
    writeAuditLogMock.mockResolvedValue(undefined);
    transactionMock.mockImplementation(async (callback) => callback({
      property: { create: propertyCreateMock },
    }));
  });

  it("lists tenant-scoped properties with correlation, private caching and the existing safety cap", async () => {
    getCurrentUserMock.mockResolvedValue(owner);

    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(propertyFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { deleted_at: null, company_id: "company-1" },
      take: 2000,
    }));
    expect(body.properties).toEqual([]);
    expect(body.permissions.canCreate).toBe(true);
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "property list completed",
      expect.objectContaining({
        event: "properties.list.completed",
        userId: "owner-1",
        companyId: "company-1",
        returned: 0,
        canCreate: true,
      }),
    );
  });

  it("returns a stable correlated 401 before property data is queried", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const response = await GET(getRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Obehörig",
      errorCode: "UNAUTHORIZED",
      requestId,
    });
    expect(propertyFindManyMock).not.toHaveBeenCalled();
  });

  it("blocks roles without property-create permission before parsing property data", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });

    const response = await POST(postRequest({
      name: "Kvarnhuset",
      address: "Storgatan 1",
      city: "Stockholm",
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Du saknar behörighet att skapa fastigheter",
      errorCode: "FORBIDDEN",
      requestId,
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns correlated validation errors without logging submitted property fields", async () => {
    getCurrentUserMock.mockResolvedValue(owner);

    const response = await POST(postRequest({
      name: "Hemligt fastighetsnamn",
      address: "",
      city: "Stockholm",
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.errorCode).toBe("VALIDATION_FAILED");
    expect(body.requestId).toBe(requestId);
    expect(transactionMock).not.toHaveBeenCalled();
    const logged = JSON.stringify(loggerWarnMock.mock.calls);
    expect(logged).not.toContain("Hemligt fastighetsnamn");
    expect(logged).not.toContain("Stockholm");
  });

  it("creates a property and audit record in the existing transaction with correlated private success", async () => {
    getCurrentUserMock.mockResolvedValue(owner);
    propertyCreateMock.mockResolvedValue({
      id: "property-1",
      name: "Kvarnhuset",
      address: "Storgatan 1",
      postal_code: "111 22",
      city: "Stockholm",
      property_identifier: null,
      property_type: "residential",
      status: "active",
      created_at: new Date("2026-08-18T08:00:00Z"),
      updated_at: new Date("2026-08-18T08:00:00Z"),
      _count: { tickets: 0, buildings: 0, units: 0 },
    });

    const response = await POST(postRequest({
      name: "Kvarnhuset",
      address: "Storgatan 1",
      postalCode: "111 22",
      city: "Stockholm",
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body.success).toBe(true);
    expect(body.property.id).toBe("property-1");
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(propertyCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        company_id: "company-1",
        user_id: "owner-1",
        name: "Kvarnhuset",
      }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({ action: "property.created", entityId: "property-1" }),
      expect.anything(),
    );
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "property create completed",
      expect.objectContaining({
        event: "properties.create.completed",
        userId: "owner-1",
        companyId: "company-1",
        propertyId: "property-1",
      }),
    );
    const logged = JSON.stringify(loggerInfoMock.mock.calls);
    expect(logged).not.toContain("Kvarnhuset");
    expect(logged).not.toContain("Storgatan 1");
  });

  it("returns a safe correlated 500 without leaking internal dependency details", async () => {
    getCurrentUserMock.mockRejectedValue(new Error("postgres://user:secret@db.internal/revalta"));

    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Internt serverfel",
      errorCode: "INTERNAL_ERROR",
      requestId,
    });
    expect(JSON.stringify(body)).not.toContain("postgres://");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "property list failed",
      expect.any(Error),
      expect.objectContaining({ event: "properties.list.failed" }),
    );
  });
});
