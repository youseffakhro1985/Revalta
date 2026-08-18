import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createLoggerMock,
  getCurrentUserMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  propertyFindFirstMock,
  queryRawMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  createLoggerMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
  queryRawMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/db", () => ({
  default: {
    property: { findFirst: propertyFindFirstMock },
    building: { findFirst: vi.fn() },
    $queryRaw: queryRawMock,
    $executeRaw: vi.fn(),
  },
}));

import { GET } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";
const owner = { id: "owner-1", company_id: "company-1", role: "owner" };
const technician = { id: "tech-1", company_id: "company-1", role: "technician" };

const property = {
  id: "property-1",
  name: "Kvarnhuset",
  buildings: [],
  units: [],
  work_orders: [{ id: "wo-1", title: "Service", status: "open", priority: "normal", scheduled_end: null, actual_cost: 12000, updated_at: new Date("2026-08-18T10:00:00.000Z") }],
  projects: [{ id: "project-1", name: "Takbyte", status: "active", risk: "low", budget: 500000, forecast: 510000, actual: 125000, end_date: null, updated_at: new Date("2026-08-18T10:00:00.000Z") }],
  _count: { tickets: 1, buildings: 0, units: 0, work_orders: 1, projects: 1 },
};

const entrances = [{ id: "entrance-1", name: "A" }];
const assets = [{ id: "asset-1", name: "Ventilation", criticality: "high", status: "active", next_service_at: null, replacement_value: 275000 }];
const warranties = [{ id: "warranty-1", title: "Garanti", expires_at: null }];
const inspections = [{ id: "inspection-1", title: "OVK", next_due_at: null, scheduled_at: null, status: "planned" }];
const agreements = [{ id: "agreement-1", supplier: "Service AB", ends_at: null, cost_amount: 36000 }];

function request(propertyId = "property-1") {
  return new Request(`https://www.revalta.se/api/properties/${propertyId}/card`, {
    headers: { "x-request-id": requestId },
  });
}

function params(propertyId = "property-1") {
  return { params: Promise.resolve({ id: propertyId }) };
}

function seedCardQueries() {
  queryRawMock
    .mockResolvedValueOnce(entrances)
    .mockResolvedValueOnce(assets)
    .mockResolvedValueOnce(warranties)
    .mockResolvedValueOnce(inspections)
    .mockResolvedValueOnce(agreements);
}

describe("property card read security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    getCurrentUserMock.mockResolvedValue(owner);
    propertyFindFirstMock.mockResolvedValue(property);
    queryRawMock.mockReset();
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("masks every card finance surface for technicians while preserving operational data", async () => {
    getCurrentUserMock.mockResolvedValue(technician);
    seedCardQueries();

    const response = await GET(request(), params());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body.property.work_orders[0].actual_cost).toBeNull();
    expect(body.property.projects[0].budget).toBeNull();
    expect(body.property.projects[0].forecast).toBeNull();
    expect(body.property.projects[0].actual).toBeNull();
    expect(body.assets[0].replacement_value).toBeNull();
    expect(body.agreements[0].cost_amount).toBeNull();
    expect(body.assets[0].name).toBe("Ventilation");
    expect(body.metrics.technicalAssets).toBe(1);
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "property card read completed",
      expect.objectContaining({ event: "property.card.read.completed", propertyId: "property-1", includeFinance: false }),
    );
  });

  it("preserves all finance values for owner roles", async () => {
    seedCardQueries();

    const response = await GET(request(), params());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.property.work_orders[0].actual_cost).toBe(12000);
    expect(body.property.projects[0].budget).toBe(500000);
    expect(body.property.projects[0].forecast).toBe(510000);
    expect(body.property.projects[0].actual).toBe(125000);
    expect(body.assets[0].replacement_value).toBe(275000);
    expect(body.agreements[0].cost_amount).toBe(36000);
  });

  it("returns a correlated 401 without touching property data", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const response = await GET(request(), params());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "Obehörig", errorCode: "UNAUTHORIZED", requestId });
    expect(propertyFindFirstMock).not.toHaveBeenCalled();
    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it("does not log an unverified cross-tenant property id", async () => {
    propertyFindFirstMock.mockResolvedValueOnce(null);

    const response = await GET(request("external-secret-property"), params("external-secret-property"));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.errorCode).toBe("NOT_FOUND");
    expect(queryRawMock).not.toHaveBeenCalled();
    expect(JSON.stringify(loggerWarnMock.mock.calls)).not.toContain("external-secret-property");
  });

  it("returns a safe correlated 500 when a card query fails", async () => {
    queryRawMock.mockRejectedValueOnce(new Error("postgres://user:secret@db.internal/revalta"));

    const response = await GET(request(), params());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Internt serverfel", errorCode: "INTERNAL_ERROR", requestId });
    expect(JSON.stringify(body)).not.toContain("postgres://");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "property card read failed",
      expect.any(Error),
      expect.objectContaining({ event: "property.card.read.failed" }),
    );
  });
});
