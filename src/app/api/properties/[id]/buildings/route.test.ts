import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  requireCompanyUserMock,
  canCreatePropertiesMock,
  propertyFindFirstMock,
  buildingCreateMock,
  writeAuditLogMock,
  loggerInfoMock,
  loggerWarnMock,
  loggerErrorMock,
  createLoggerMock,
  isMissingSchemaColumnErrorMock,
  schemaMismatchUserMessageMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  requireCompanyUserMock: vi.fn(),
  canCreatePropertiesMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
  buildingCreateMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  createLoggerMock: vi.fn(),
  isMissingSchemaColumnErrorMock: vi.fn(),
  schemaMismatchUserMessageMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: {
    property: { findFirst: propertyFindFirstMock },
    building: { create: buildingCreateMock },
  },
}));
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
  requireCompanyUser: requireCompanyUserMock,
  canCreateProperties: canCreatePropertiesMock,
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));
vi.mock("@/lib/schema-readiness", () => ({
  isMissingSchemaColumnError: isMissingSchemaColumnErrorMock,
  schemaMismatchUserMessage: schemaMismatchUserMessageMock,
}));

import { POST } from "./route";

const requestId = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const user = { id: "user-1", role: "owner", company_id: "company-1" };

function request(body: unknown) {
  return new Request("https://www.revalta.se/api/properties/property-1/buildings", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": requestId },
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ id: "property-1" }) };

describe("building creation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({ info: loggerInfoMock, warn: loggerWarnMock, error: loggerErrorMock });
    getCurrentUserMock.mockResolvedValue(user);
    requireCompanyUserMock.mockReturnValue(user);
    canCreatePropertiesMock.mockReturnValue(true);
    propertyFindFirstMock.mockResolvedValue({ id: "property-1" });
    buildingCreateMock.mockResolvedValue({ id: "building-1", property_id: "property-1", name: "Hus A" });
    isMissingSchemaColumnErrorMock.mockReturnValue(false);
    schemaMismatchUserMessageMock.mockReturnValue("Databasen uppdateras");
  });

  it("fails closed when company scope is missing", async () => {
    requireCompanyUserMock.mockReturnValue(null);
    const response = await POST(request({ name: "Hus A" }), context);
    expect(response.status).toBe(403);
    expect(propertyFindFirstMock).not.toHaveBeenCalled();
    expect(buildingCreateMock).not.toHaveBeenCalled();
  });

  it("scopes the parent property to the verified company", async () => {
    const response = await POST(request({ name: " Hus A ", constructionYear: "1998", floors: "4" }), context);
    expect(response.status).toBe(201);
    expect(propertyFindFirstMock).toHaveBeenCalledWith({
      where: { id: "property-1", company_id: "company-1", deleted_at: null },
      select: { id: true },
    });
    expect(buildingCreateMock).toHaveBeenCalledWith({
      data: {
        property_id: "property-1",
        name: "Hus A",
        address: null,
        construction_year: 1998,
        floors: 4,
      },
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith(user, expect.objectContaining({
      entityId: "building-1",
      action: "building.created",
      metadata: { propertyId: "property-1" },
    }));
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("does not reveal a cross-tenant parent property", async () => {
    propertyFindFirstMock.mockResolvedValue(null);
    const response = await POST(request({ name: "Hus A" }), context);
    expect(response.status).toBe(404);
    expect(buildingCreateMock).not.toHaveBeenCalled();
  });

  it("rejects invalid floors", async () => {
    const response = await POST(request({ name: "Hus A", floors: 201 }), context);
    expect(response.status).toBe(400);
    expect(buildingCreateMock).not.toHaveBeenCalled();
  });

  it("returns a safe service unavailable response for schema mismatch", async () => {
    propertyFindFirstMock.mockRejectedValue(new Error("column missing"));
    isMissingSchemaColumnErrorMock.mockReturnValue(true);
    const response = await POST(request({ name: "Hus A" }), context);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual(expect.objectContaining({
      errorCode: "SERVICE_UNAVAILABLE",
      requestId,
    }));
  });

  it("returns a correlated internal error without exposing details", async () => {
    propertyFindFirstMock.mockRejectedValue(new Error("postgres://secret"));
    const response = await POST(request({ name: "Hus A" }), context);
    const payload = await response.json();
    expect(response.status).toBe(500);
    expect(payload).toEqual({ error: "Internt serverfel", errorCode: "INTERNAL_ERROR", requestId });
    expect(JSON.stringify(payload)).not.toContain("postgres://secret");
    expect(loggerErrorMock).toHaveBeenCalled();
  });
});
