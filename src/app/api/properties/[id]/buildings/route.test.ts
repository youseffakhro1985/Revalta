import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  buildingCreateMock,
  createLoggerMock,
  getCurrentUserMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  propertyFindFirstMock,
  transactionMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  buildingCreateMock: vi.fn(),
  createLoggerMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
  transactionMock: vi.fn(),
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
    $transaction: transactionMock,
  },
}));

import { POST } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";
const owner = { id: "owner-1", company_id: "company-1", role: "owner" };

function request(body: unknown, propertyId = "property-1") {
  return new Request(`https://www.revalta.se/api/properties/${propertyId}/buildings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-request-id": requestId },
    body: JSON.stringify(body),
  });
}

describe("properties/[id]/buildings POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    writeAuditLogMock.mockResolvedValue(undefined);
    transactionMock.mockImplementation(async (callback) => callback({ building: { create: buildingCreateMock } }));
  });

  it("creates a building atomically with correlated private success", async () => {
    getCurrentUserMock.mockResolvedValue(owner);
    propertyFindFirstMock.mockResolvedValue({ id: "property-1" });
    buildingCreateMock.mockResolvedValue({
      id: "building-1",
      property_id: "property-1",
      name: "Hus A",
      address: "Gårdsgatan 1",
      construction_year: 1998,
      floors: 6,
    });

    const response = await POST(request({ name: "Hus A", address: "Gårdsgatan 1", constructionYear: 1998, floors: 6 }), {
      params: Promise.resolve({ id: "property-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body.success).toBe(true);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(buildingCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ property_id: "property-1", name: "Hus A" }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({ action: "building.created", entityId: "building-1" }),
      expect.anything(),
    );
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "building create completed",
      expect.objectContaining({
        event: "property_buildings.create.completed",
        userId: "owner-1",
        companyId: "company-1",
        propertyId: "property-1",
        buildingId: "building-1",
      }),
    );
    const logged = JSON.stringify(loggerInfoMock.mock.calls);
    expect(logged).not.toContain("Hus A");
    expect(logged).not.toContain("Gårdsgatan 1");
  });

  it("returns stable auth errors before property access", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const unauthorized = await POST(request({ name: "Hus A" }), { params: Promise.resolve({ id: "property-1" }) });
    expect(unauthorized.status).toBe(401);
    await expect(unauthorized.json()).resolves.toEqual({ error: "Obehörig", errorCode: "UNAUTHORIZED", requestId });
    expect(propertyFindFirstMock).not.toHaveBeenCalled();

    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const forbidden = await POST(request({ name: "Hus A" }), { params: Promise.resolve({ id: "property-1" }) });
    expect(forbidden.status).toBe(403);
    expect((await forbidden.json()).errorCode).toBe("FORBIDDEN");
    expect(propertyFindFirstMock).not.toHaveBeenCalled();
  });

  it("returns correlated 404 for another tenant without logging the submitted property id", async () => {
    getCurrentUserMock.mockResolvedValue(owner);
    propertyFindFirstMock.mockResolvedValue(null);

    const response = await POST(request({ name: "Hemligt hus" }, "external-secret-property"), {
      params: Promise.resolve({ id: "external-secret-property" }),
    });

    expect(response.status).toBe(404);
    expect((await response.json()).errorCode).toBe("NOT_FOUND");
    expect(transactionMock).not.toHaveBeenCalled();
    const logged = JSON.stringify(loggerWarnMock.mock.calls);
    expect(logged).not.toContain("external-secret-property");
    expect(logged).not.toContain("Hemligt hus");
  });

  it("returns validation errors after access without logging submitted building fields", async () => {
    getCurrentUserMock.mockResolvedValue(owner);
    propertyFindFirstMock.mockResolvedValue({ id: "property-1" });

    const response = await POST(request({ name: "X", address: "Hemlig adress", constructionYear: 1500 }), {
      params: Promise.resolve({ id: "property-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.errorCode).toBe("VALIDATION_FAILED");
    expect(body.requestId).toBe(requestId);
    expect(transactionMock).not.toHaveBeenCalled();
    const logged = JSON.stringify(loggerWarnMock.mock.calls);
    expect(logged).not.toContain("Hemlig adress");
    expect(logged).not.toContain('"X"');
  });

  it("returns a safe correlated 500 and does not falsely report an audit failure as success", async () => {
    getCurrentUserMock.mockResolvedValue(owner);
    propertyFindFirstMock.mockResolvedValue({ id: "property-1" });
    buildingCreateMock.mockResolvedValue({ id: "building-1", name: "Hus A" });
    writeAuditLogMock.mockRejectedValue(new Error("postgres://secret@db.internal/revalta"));

    const response = await POST(request({ name: "Hus A" }), { params: Promise.resolve({ id: "property-1" }) });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Internt serverfel", errorCode: "INTERNAL_ERROR", requestId });
    expect(JSON.stringify(body)).not.toContain("postgres://");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "building create failed",
      expect.any(Error),
      expect.objectContaining({ event: "property_buildings.create.failed" }),
    );
  });
});
