import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createLoggerMock,
  getCurrentUserMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  propertyFindFirstMock,
  queryRawMock,
} = vi.hoisted(() => ({
  createLoggerMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
  queryRawMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/db", () => ({
  default: {
    property: { findFirst: propertyFindFirstMock },
    $queryRaw: queryRawMock,
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));

import { GET } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";
const owner = { id: "owner-1", company_id: "company-1", role: "owner" };
const technician = { id: "tech-1", company_id: "company-1", role: "technician" };
const property = { id: "property-1", name: "Kvarnhuset", buildings: [{ id: "building-1", name: "Hus A" }] };
const plan = {
  id: "plan-1",
  name: "Underhållsplan 2026",
  version: 1,
  status: "active",
  base_year: 2026,
  horizon_years: 10,
  annual_index_rate: 3,
  summary: "Planerad teknisk förvaltning",
  assumptions: "Normal drift",
  approved_at: null,
  created_at: "2026-08-18T00:00:00.000Z",
};
const action = {
  id: "action-1",
  maintenance_plan_id: "plan-1",
  category: "roof",
  title: "Takbyte",
  description: null,
  scope: null,
  planned_year: 2028,
  recurrence_years: null,
  technical_lifetime_years: 30,
  estimated_cost: 450000,
  annual_index_rate: 4,
  priority: "high",
  risk: "medium",
  status: "planned",
  contractor: null,
  building_name: "Hus A",
  technical_asset_name: null,
};
const assets = [{ id: "asset-1", name: "Ventilation" }];

function request(propertyId = "property-1") {
  return new Request(`https://www.revalta.se/api/properties/${propertyId}/maintenance-plan`, {
    headers: { "x-request-id": requestId },
  });
}

function params(propertyId = "property-1") {
  return { params: Promise.resolve({ id: propertyId }) };
}

function seedPlanQueries() {
  queryRawMock
    .mockResolvedValueOnce([plan])
    .mockResolvedValueOnce([action])
    .mockResolvedValueOnce(assets);
}

describe("maintenance plan read security", () => {
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
  });

  it("masks maintenance finance assumptions and costs for technicians while preserving operations", async () => {
    getCurrentUserMock.mockResolvedValue(technician);
    seedPlanQueries();

    const response = await GET(request(), params());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body.plans[0].annual_index_rate).toBeNull();
    expect(body.activePlan.annual_index_rate).toBeNull();
    expect(body.actions[0].estimated_cost).toBeNull();
    expect(body.actions[0].annual_index_rate).toBeNull();
    expect(body.forecast).toBeNull();
    expect(body.actions[0].title).toBe("Takbyte");
    expect(body.actions[0].priority).toBe("high");
    expect(body.assets).toEqual(assets);
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "maintenance plan read completed",
      expect.objectContaining({ event: "maintenance_plan.read.completed", propertyId: "property-1", includeFinance: false }),
    );
  });

  it("preserves plan finance data and forecast for owner roles", async () => {
    seedPlanQueries();

    const response = await GET(request(), params());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.plans[0].annual_index_rate).toBe(3);
    expect(body.activePlan.annual_index_rate).toBe(3);
    expect(body.actions[0].estimated_cost).toBe(450000);
    expect(body.actions[0].annual_index_rate).toBe(4);
    expect(body.forecast).not.toBeNull();
    expect(body.forecast.totals[5]).toBeGreaterThan(450000);
  });

  it("returns a correlated 401 before property access", async () => {
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

  it("returns a safe correlated 500 for maintenance query failures", async () => {
    queryRawMock.mockRejectedValueOnce(new Error("postgres://user:secret@db.internal/revalta"));

    const response = await GET(request(), params());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Internt serverfel", errorCode: "INTERNAL_ERROR", requestId });
    expect(JSON.stringify(body)).not.toContain("postgres://");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "maintenance plan read failed",
      expect.any(Error),
      expect.objectContaining({ event: "maintenance_plan.read.failed" }),
    );
  });
});
