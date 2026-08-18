import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  buildingFindFirstMock,
  createLoggerMock,
  getCurrentUserMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  propertyFindFirstMock,
  transactionMock,
  unitCreateMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  buildingFindFirstMock: vi.fn(),
  createLoggerMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
  transactionMock: vi.fn(),
  unitCreateMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));
vi.mock("@/lib/db", () => ({
  default: {
    property: { findFirst: propertyFindFirstMock },
    building: { findFirst: buildingFindFirstMock },
    $transaction: transactionMock,
  },
}));

import { POST } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";
const owner = { id: "owner-1", company_id: "company-1", role: "owner" };

function request(body: unknown, propertyId = "property-1") {
  return new Request(`https://www.revalta.se/api/properties/${propertyId}/units`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-request-id": requestId },
    body: JSON.stringify(body),
  });
}

describe("properties/[id]/units POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    writeAuditLogMock.mockResolvedValue(undefined);
    transactionMock.mockImplementation(async (callback) => callback({ unit: { create: unitCreateMock } }));
  });

  it("creates a unit atomically after property and building verification with correlated private success", async () => {
    getCurrentUserMock.mockResolvedValue(owner);
    propertyFindFirstMock.mockResolvedValue({ id: "property-1" });
    buildingFindFirstMock.mockResolvedValue({ id: "building-1" });
    unitCreateMock.mockResolvedValue({
      id: "unit-1",
      property_id: "property-1",
      building_id: "building-1",
      designation: "1201",
      unit_type: "apartment",
      floor: "2",
      area: 72,
      rooms: 3,
      building: { name: "Hus A" },
    });

    const response = await POST(request({
      designation: "1201",
      unitType: "apartment",
      floor: "2",
      area: 72,
      rooms: 3,
      buildingId: "building-1",
    }), { params: Promise.resolve({ id: "property-1" }) });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body.success).toBe(true);
    expect(buildingFindFirstMock).toHaveBeenCalledWith({
      where: { id: "building-1", property_id: "property-1" },
      select: { id: true },
    });
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(unitCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        property_id: "property-1",
        building_id: "building-1",
        designation: "1201",
      }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({ action: "unit.created", entityId: "unit-1" }),
      expect.anything(),
    );
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "unit create completed",
      expect.objectContaining({
        event: "property_units.create.completed",
        userId: "owner-1",
        companyId: "company-1",
        propertyId: "property-1",
        unitId: "unit-1",
        buildingId: "building-1",
      }),
    );
    const logged = JSON.stringify(loggerInfoMock.mock.calls);
    expect(logged).not.toContain("1201");
    expect(logged).not.toContain("Hus A");
  });

  it("returns stable auth errors before property access", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const unauthorized = await POST(request({ designation: "1201" }), { params: Promise.resolve({ id: "property-1" }) });
    expect(unauthorized.status).toBe(401);
    await expect(unauthorized.json()).resolves.toEqual({ error: "Obehörig", errorCode: "UNAUTHORIZED", requestId });
    expect(propertyFindFirstMock).not.toHaveBeenCalled();

    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const forbidden = await POST(request({ designation: "1201" }), { params: Promise.resolve({ id: "property-1" }) });
    expect(forbidden.status).toBe(403);
    expect((await forbidden.json()).errorCode).toBe("FORBIDDEN");
    expect(propertyFindFirstMock).not.toHaveBeenCalled();
  });

  it("returns correlated 404 for another tenant without logging submitted property or unit fields", async () => {
    getCurrentUserMock.mockResolvedValue(owner);
    propertyFindFirstMock.mockResolvedValue(null);

    const response = await POST(request({ designation: "Hemlig enhet" }, "external-secret-property"), {
      params: Promise.resolve({ id: "external-secret-property" }),
    });

    expect(response.status).toBe(404);
    expect((await response.json()).errorCode).toBe("NOT_FOUND");
    expect(buildingFindFirstMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
    const logged = JSON.stringify(loggerWarnMock.mock.calls);
    expect(logged).not.toContain("external-secret-property");
    expect(logged).not.toContain("Hemlig enhet");
  });

  it("rejects a building outside the verified property without logging the unverified building id", async () => {
    getCurrentUserMock.mockResolvedValue(owner);
    propertyFindFirstMock.mockResolvedValue({ id: "property-1" });
    buildingFindFirstMock.mockResolvedValue(null);

    const response = await POST(request({ designation: "1201", buildingId: "external-secret-building" }), {
      params: Promise.resolve({ id: "property-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: "Byggnaden tillhör inte fastigheten",
      errorCode: "VALIDATION_FAILED",
      requestId,
    });
    expect(transactionMock).not.toHaveBeenCalled();
    const logged = JSON.stringify(loggerWarnMock.mock.calls);
    expect(logged).not.toContain("external-secret-building");
    expect(logged).not.toContain("1201");
  });

  it("keeps area/room validation and does not log submitted designation", async () => {
    getCurrentUserMock.mockResolvedValue(owner);
    propertyFindFirstMock.mockResolvedValue({ id: "property-1" });

    const response = await POST(request({ designation: "Hemlig beteckning", area: -1 }), {
      params: Promise.resolve({ id: "property-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.errorCode).toBe("VALIDATION_FAILED");
    expect(transactionMock).not.toHaveBeenCalled();
    expect(JSON.stringify(loggerWarnMock.mock.calls)).not.toContain("Hemlig beteckning");
  });

  it("returns a safe correlated 500 and does not falsely report an audit failure as success", async () => {
    getCurrentUserMock.mockResolvedValue(owner);
    propertyFindFirstMock.mockResolvedValue({ id: "property-1" });
    unitCreateMock.mockResolvedValue({ id: "unit-1", designation: "1201", building: null });
    writeAuditLogMock.mockRejectedValue(new Error("postgres://secret@db.internal/revalta"));

    const response = await POST(request({ designation: "1201" }), {
      params: Promise.resolve({ id: "property-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Internt serverfel", errorCode: "INTERNAL_ERROR", requestId });
    expect(JSON.stringify(body)).not.toContain("postgres://");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "unit create failed",
      expect.any(Error),
      expect.objectContaining({ event: "property_units.create.failed" }),
    );
  });
});
