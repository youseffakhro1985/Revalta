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
const component = {
  id: "asset-1",
  name: "Värmepump",
  criticality: "high",
  condition_grade: 4,
  next_service_at: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
  replacement_value: 450000,
  total_cost_ex_vat: 90000,
};

function request(propertyId = "property-1") {
  return new Request(`https://www.revalta.se/api/properties/${propertyId}/components/overview`, {
    headers: { "x-request-id": requestId },
  });
}

describe("property component overview GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    propertyFindFirstMock.mockResolvedValue({ id: "property-1", name: "Kvarnhuset" });
    queryRawMock.mockResolvedValue([component]);
  });

  it("returns full financial overview for finance-authorized roles with correlation", async () => {
    getCurrentUserMock.mockResolvedValue(owner);

    const response = await GET(request(), { params: Promise.resolve({ id: "property-1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("cdn-cache-control")).toBe("no-store");
    expect(body.components[0].replacement_value).toBe(450000);
    expect(body.components[0].total_cost_ex_vat).toBe(90000);
    expect(body.summary.totalCostExVat).toBe(90000);
    expect(body.summary.dueSoon).toBe(1);
    expect(body.summary.highRisk).toBe(1);
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "component overview completed",
      expect.objectContaining({
        event: "components.overview.completed",
        userId: "owner-1",
        companyId: "company-1",
        propertyId: "property-1",
        componentCount: 1,
        includeFinance: true,
      }),
    );
    const logged = JSON.stringify(loggerInfoMock.mock.calls);
    expect(logged).not.toContain("Värmepump");
    expect(logged).not.toContain("450000");
    expect(logged).not.toContain("90000");
  });

  it("masks component replacement value and cost totals for technicians", async () => {
    getCurrentUserMock.mockResolvedValue(technician);

    const response = await GET(request(), { params: Promise.resolve({ id: "property-1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.components[0].replacement_value).toBeNull();
    expect(body.components[0].total_cost_ex_vat).toBeNull();
    expect(body.summary.totalCostExVat).toBeNull();
    expect(body.summary.dueSoon).toBe(1);
    expect(body.summary.highRisk).toBe(1);
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "component overview completed",
      expect.objectContaining({ includeFinance: false }),
    );
  });

  it("returns correlated 404 for another tenant without raw-query access or id leakage", async () => {
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

  it("returns a stable correlated 401 before property or component queries", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const response = await GET(request(), { params: Promise.resolve({ id: "property-1" }) });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Obehörig", errorCode: "UNAUTHORIZED", requestId });
    expect(propertyFindFirstMock).not.toHaveBeenCalled();
    expect(queryRawMock).not.toHaveBeenCalled();
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
      "component overview failed",
      expect.any(Error),
      expect.objectContaining({ event: "components.overview.failed" }),
    );
  });
});
