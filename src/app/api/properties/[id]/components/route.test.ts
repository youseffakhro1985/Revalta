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
vi.mock("@/lib/db", () => ({
  default: {
    property: { findFirst: propertyFindFirstMock },
    $queryRaw: queryRawMock,
  },
}));

import { GET } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";
const owner = { id: "owner-1", company_id: "company-1", role: "owner" };
const technician = { id: "tech-1", company_id: "company-1", role: "technician" };
const asset = {
  id: "asset-1",
  name: "Ventilationsaggregat",
  condition_grade: 4,
  expected_replacement_year: new Date().getFullYear() + 2,
  replacement_value: 250000,
  lifetime_cost: 50000,
};

function request(propertyId = "property-1") {
  return new Request(`https://www.revalta.se/api/properties/${propertyId}/components`, {
    headers: { "x-request-id": requestId },
  });
}

describe("property components GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    propertyFindFirstMock.mockResolvedValue({ id: "property-1", name: "Kvarnhuset" });
    queryRawMock.mockResolvedValue([asset]);
  });

  it("returns full financial component data for finance-authorized roles with correlation", async () => {
    getCurrentUserMock.mockResolvedValue(owner);

    const response = await GET(request(), { params: Promise.resolve({ id: "property-1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body.assets[0].replacement_value).toBe(250000);
    expect(body.assets[0].lifetime_cost).toBe(50000);
    expect(body.metrics.replacementValue).toBe(250000);
    expect(body.metrics.lifetimeCost).toBe(50000);
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "component list completed",
      expect.objectContaining({
        event: "components.list.completed",
        userId: "owner-1",
        companyId: "company-1",
        propertyId: "property-1",
        componentCount: 1,
        includeFinance: true,
      }),
    );
    expect(JSON.stringify(loggerInfoMock.mock.calls)).not.toContain("Ventilationsaggregat");
    expect(JSON.stringify(loggerInfoMock.mock.calls)).not.toContain("250000");
  });

  it("masks replacement values and costs for technicians", async () => {
    getCurrentUserMock.mockResolvedValue(technician);

    const response = await GET(request(), { params: Promise.resolve({ id: "property-1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.assets[0].replacement_value).toBeNull();
    expect(body.assets[0].lifetime_cost).toBeNull();
    expect(body.metrics.replacementValue).toBeNull();
    expect(body.metrics.lifetimeCost).toBeNull();
    expect(body.metrics.poorCondition).toBe(1);
    expect(body.metrics.replacementDue5Years).toBe(1);
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "component list completed",
      expect.objectContaining({ includeFinance: false }),
    );
  });

  it("returns stable correlated auth errors before component queries", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const unauthorized = await GET(request(), { params: Promise.resolve({ id: "property-1" }) });
    expect(unauthorized.status).toBe(401);
    await expect(unauthorized.json()).resolves.toEqual({ error: "Obehörig", errorCode: "UNAUTHORIZED", requestId });
    expect(propertyFindFirstMock).not.toHaveBeenCalled();
    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it("returns correlated 404 for another tenant without logging the submitted property id", async () => {
    getCurrentUserMock.mockResolvedValue(owner);
    propertyFindFirstMock.mockResolvedValue(null);

    const response = await GET(request("external-secret-property"), {
      params: Promise.resolve({ id: "external-secret-property" }),
    });

    expect(response.status).toBe(404);
    expect((await response.json()).errorCode).toBe("NOT_FOUND");
    expect(queryRawMock).not.toHaveBeenCalled();
    expect(JSON.stringify(loggerWarnMock.mock.calls)).not.toContain("external-secret-property");
  });

  it("returns a safe correlated 500 for raw-query failures", async () => {
    getCurrentUserMock.mockResolvedValue(owner);
    queryRawMock.mockRejectedValue(new Error("postgres://user:secret@db.internal/revalta"));

    const response = await GET(request(), { params: Promise.resolve({ id: "property-1" }) });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Internt serverfel", errorCode: "INTERNAL_ERROR", requestId });
    expect(JSON.stringify(body)).not.toContain("postgres://");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "component list failed",
      expect.any(Error),
      expect.objectContaining({ event: "components.list.failed" }),
    );
  });
});
