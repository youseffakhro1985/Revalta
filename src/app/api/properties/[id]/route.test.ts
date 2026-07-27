import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  requireCompanyUserMock,
  canCreatePropertiesMock,
  propertyFindFirstMock,
  propertyUpdateManyMock,
  leaseCountMock,
  ticketCountMock,
  workOrderCountMock,
  writeAuditLogMock,
  loggerInfoMock,
  loggerWarnMock,
  loggerErrorMock,
  createLoggerMock,
  isMissingSchemaColumnErrorMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  requireCompanyUserMock: vi.fn(),
  canCreatePropertiesMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
  propertyUpdateManyMock: vi.fn(),
  leaseCountMock: vi.fn(),
  ticketCountMock: vi.fn(),
  workOrderCountMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  createLoggerMock: vi.fn(),
  isMissingSchemaColumnErrorMock: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
  requireCompanyUser: requireCompanyUserMock,
  canCreateProperties: canCreatePropertiesMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    property: { findFirst: propertyFindFirstMock, updateMany: propertyUpdateManyMock },
    lease: { count: leaseCountMock },
    ticket: { count: ticketCountMock },
    workOrder: { count: workOrderCountMock },
  },
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));
vi.mock("@/lib/schema-readiness", () => ({
  isMissingSchemaColumnError: isMissingSchemaColumnErrorMock,
  schemaMismatchUserMessage: () => "Databasen uppdateras. Försök igen om en stund.",
}));
vi.mock("@/lib/leasing", () => ({ OCCUPYING_LEASE_STATUSES: ["active", "notice"] }));

import { DELETE, PATCH } from "./route";

const requestId = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const user = { id: "user-1", company_id: "company-1", role: "owner" };
const property = {
  id: "property-1",
  company_id: "company-1",
  name: "Testfastighet",
  property_identifier: "GÖTEBORG 1:1",
  status: "active",
};
const context = { params: Promise.resolve({ id: property.id }) };

function patchRequest(body: unknown) {
  return new Request(`https://www.revalta.se/api/properties/${property.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-request-id": requestId },
    body: JSON.stringify(body),
  });
}

function deleteRequest() {
  return new Request(`https://www.revalta.se/api/properties/${property.id}`, {
    method: "DELETE",
    headers: { "x-request-id": requestId },
  });
}

function expectPrivateNoStore(response: Response) {
  expect(response.headers.get("cache-control")).toContain("private");
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("cdn-cache-control")).toBe("no-store");
  expect(response.headers.get("vercel-cdn-cache-control")).toBe("no-store");
  expect(response.headers.get("x-request-id")).toBe(requestId);
}

describe("property detail tenant isolation and observability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue(user);
    requireCompanyUserMock.mockImplementation((value) => value);
    canCreatePropertiesMock.mockReturnValue(true);
    createLoggerMock.mockReturnValue({
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    propertyFindFirstMock.mockResolvedValue(property);
    propertyUpdateManyMock.mockResolvedValue({ count: 1 });
    leaseCountMock.mockResolvedValue(0);
    ticketCountMock.mockResolvedValue(0);
    workOrderCountMock.mockResolvedValue(0);
    isMissingSchemaColumnErrorMock.mockReturnValue(false);
  });

  it("fails closed before database access without a company user", async () => {
    requireCompanyUserMock.mockReturnValue(null);

    const response = await PATCH(patchRequest({}), context);
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({ error: "Obehörig", errorCode: "UNAUTHORIZED", requestId });
    expect(propertyFindFirstMock).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("always scopes property lookup and update to the verified company", async () => {
    const response = await PATCH(patchRequest({
      name: "  Ny fastighet  ",
      address: "  Testgatan 1  ",
      city: "  Göteborg  ",
      constructionYear: 1998,
      totalArea: 1250,
      boa: 900,
      loa: 350,
    }), context);

    expect(response.status).toBe(200);
    expect(propertyFindFirstMock).toHaveBeenNthCalledWith(1, {
      where: { id: property.id, company_id: user.company_id, deleted_at: null },
      select: { id: true },
    });
    expect(propertyUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: property.id, company_id: user.company_id, deleted_at: null },
      data: expect.objectContaining({ name: "Ny fastighet", address: "Testgatan 1", city: "Göteborg" }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(user, expect.objectContaining({
      entityId: property.id,
      action: "property.updated",
    }));
    expectPrivateNoStore(response);
  });

  it("rejects negative areas without mutating data", async () => {
    const response = await PATCH(patchRequest({
      name: "Fastighet",
      address: "Adress 1",
      city: "Göteborg",
      totalArea: -1,
    }), context);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.errorCode).toBe("VALIDATION_FAILED");
    expect(propertyUpdateManyMock).not.toHaveBeenCalled();
  });

  it("returns not found for a property outside the tenant scope", async () => {
    propertyFindFirstMock.mockResolvedValueOnce(null);

    const response = await PATCH(patchRequest({ name: "A", address: "B", city: "C" }), context);
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.errorCode).toBe("NOT_FOUND");
    expect(propertyUpdateManyMock).not.toHaveBeenCalled();
  });

  it("blocks soft delete when active leases exist", async () => {
    leaseCountMock.mockResolvedValue(1);

    const response = await DELETE(deleteRequest(), context);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.errorCode).toBe("CONFLICT");
    expect(propertyUpdateManyMock).not.toHaveBeenCalled();
    expect(loggerInfoMock).toHaveBeenCalledWith("property delete blocked", expect.objectContaining({
      eventCode: "properties.delete.conflict",
      companyId: user.company_id,
      propertyId: property.id,
      hasOpenLeases: true,
    }));
  });

  it("soft deletes within tenant scope and writes an audit event", async () => {
    const response = await DELETE(deleteRequest(), context);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ success: true, requestId });
    expect(propertyUpdateManyMock).toHaveBeenCalledWith({
      where: { id: property.id, company_id: user.company_id, deleted_at: null },
      data: { deleted_at: expect.any(Date) },
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith(user, {
      entityType: "property",
      entityId: property.id,
      action: "property.deleted",
      metadata: { previousStatus: property.status, softDelete: true },
    });
    expectPrivateNoStore(response);
  });

  it("returns a correlated 503 for schema readiness failures", async () => {
    const schemaError = new Error("missing column");
    propertyFindFirstMock.mockRejectedValue(schemaError);
    isMissingSchemaColumnErrorMock.mockReturnValue(true);

    const response = await DELETE(deleteRequest(), context);
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.errorCode).toBe("SERVICE_UNAVAILABLE");
    expect(payload.requestId).toBe(requestId);
    expectPrivateNoStore(response);
  });

  it("does not expose internal errors in the client response", async () => {
    const secretError = new Error("DATABASE_URL=postgres://secret");
    propertyFindFirstMock.mockRejectedValue(secretError);

    const response = await PATCH(patchRequest({}), context);
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({ error: "Internt serverfel", errorCode: "INTERNAL_ERROR", requestId });
    expect(JSON.stringify(payload)).not.toContain("postgres://secret");
    expect(loggerErrorMock).toHaveBeenCalledWith("property update failed", secretError, expect.objectContaining({
      eventCode: "properties.update.failed",
    }));
  });
});
