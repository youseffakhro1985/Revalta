import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  requireCompanyUserMock,
  canCreatePropertiesMock,
  propertyFindFirstMock,
  buildingFindFirstMock,
  unitCreateMock,
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
  buildingFindFirstMock: vi.fn(),
  unitCreateMock: vi.fn(),
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
    building: { findFirst: buildingFindFirstMock },
    unit: { create: unitCreateMock },
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
const context = { params: Promise.resolve({ id: "property-1" }) };

function request(body: unknown) {
  return new Request("https://www.revalta.se/api/properties/property-1/units", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": requestId },
    body: JSON.stringify(body),
  });
}

describe("unit creation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({ info: loggerInfoMock, warn: loggerWarnMock, error: loggerErrorMock });
    getCurrentUserMock.mockResolvedValue(user);
    requireCompanyUserMock.mockReturnValue(user);
    canCreatePropertiesMock.mockReturnValue(true);
    propertyFindFirstMock.mockResolvedValue({ id: "property-1" });
    buildingFindFirstMock.mockResolvedValue({ id: "building-1" });
    unitCreateMock.mockResolvedValue({ id: "unit-1", property_id: "property-1", designation: "Lgh 1001", building: { name: "Hus A" } });
    isMissingSchemaColumnErrorMock.mockReturnValue(false);
    schemaMismatchUserMessageMock.mockReturnValue("Databasen uppdateras");
  });

  it("fails closed without verified company scope", async () => {
    requireCompanyUserMock.mockReturnValue(null);
    const response = await POST(request({ designation: "Lgh 1001" }), context);
    expect(response.status).toBe(403);
    expect(propertyFindFirstMock).not.toHaveBeenCalled();
    expect(unitCreateMock).not.toHaveBeenCalled();
  });

  it("scopes both property and selected building to the company", async () => {
    const response = await POST(request({
      designation: " Lgh 1001 ",
      unitType: "apartment",
      buildingId: " building-1 ",
      area: "72.5",
      rooms: "3",
      floor: "2",
    }), context);

    expect(response.status).toBe(201);
    expect(propertyFindFirstMock).toHaveBeenCalledWith({
      where: { id: "property-1", company_id: "company-1", deleted_at: null },
      select: { id: true },
    });
    expect(buildingFindFirstMock).toHaveBeenCalledWith({
      where: {
        id: "building-1",
        property_id: "property-1",
        property: { company_id: "company-1", deleted_at: null },
      },
      select: { id: true },
    });
    expect(unitCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        property_id: "property-1",
        building_id: "building-1",
        designation: "Lgh 1001",
        area: 72.5,
        rooms: 3,
      }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(user, expect.objectContaining({
      action: "unit.created",
      entityId: "unit-1",
      metadata: { propertyId: "property-1", buildingId: "building-1", unitType: "apartment" },
    }));
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("rejects a building outside the scoped parent property", async () => {
    buildingFindFirstMock.mockResolvedValue(null);
    const response = await POST(request({ designation: "Lgh 1001", buildingId: "building-x" }), context);
    expect(response.status).toBe(400);
    expect(unitCreateMock).not.toHaveBeenCalled();
    expect(await response.json()).toEqual(expect.objectContaining({ errorCode: "VALIDATION_FAILED", requestId }));
  });

  it("does not reveal a cross-tenant property", async () => {
    propertyFindFirstMock.mockResolvedValue(null);
    const response = await POST(request({ designation: "Lgh 1001" }), context);
    expect(response.status).toBe(404);
    expect(buildingFindFirstMock).not.toHaveBeenCalled();
    expect(unitCreateMock).not.toHaveBeenCalled();
  });

  it("rejects invalid numeric values", async () => {
    const response = await POST(request({ designation: "Lgh 1001", area: -1 }), context);
    expect(response.status).toBe(400);
    expect(unitCreateMock).not.toHaveBeenCalled();
  });

  it("returns service unavailable for schema mismatch", async () => {
    propertyFindFirstMock.mockRejectedValue(new Error("missing column"));
    isMissingSchemaColumnErrorMock.mockReturnValue(true);
    const response = await POST(request({ designation: "Lgh 1001" }), context);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual(expect.objectContaining({ errorCode: "SERVICE_UNAVAILABLE", requestId }));
  });

  it("returns a safe correlated internal error", async () => {
    propertyFindFirstMock.mockRejectedValue(new Error("database secret"));
    const response = await POST(request({ designation: "Lgh 1001" }), context);
    const payload = await response.json();
    expect(response.status).toBe(500);
    expect(payload).toEqual({ error: "Internt serverfel", errorCode: "INTERNAL_ERROR", requestId });
    expect(JSON.stringify(payload)).not.toContain("database secret");
    expect(loggerErrorMock).toHaveBeenCalled();
  });
});
