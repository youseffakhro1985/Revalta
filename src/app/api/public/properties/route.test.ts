import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  propertyFindManyMock,
  resolvePublicPortalCompanyMock,
  extractPortalCompanySlugMock,
  toPortalSlugMock,
  checkRateLimitMock,
  isMissingSchemaColumnErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  loggerErrorMock,
  createLoggerMock,
} = vi.hoisted(() => ({
  propertyFindManyMock: vi.fn(),
  resolvePublicPortalCompanyMock: vi.fn(),
  extractPortalCompanySlugMock: vi.fn(),
  toPortalSlugMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  isMissingSchemaColumnErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  createLoggerMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: { property: { findMany: propertyFindManyMock } },
}));

vi.mock("@/lib/public-portal", () => ({
  resolvePublicPortalCompany: resolvePublicPortalCompanyMock,
  extractPortalCompanySlug: extractPortalCompanySlugMock,
  toPortalSlug: toPortalSlugMock,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

vi.mock("@/lib/schema-readiness", () => ({
  isMissingSchemaColumnError: isMissingSchemaColumnErrorMock,
  schemaMismatchUserMessage: vi.fn(() => "Databasen är inte redo"),
}));

vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { GET } from "./route";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";

function request() {
  return new Request("https://www.revalta.se/api/public/properties?companySlug=demo", {
    headers: { "x-request-id": REQUEST_ID },
  });
}

const portal = {
  company: { id: "company-1", name: "Demo Fastigheter", users: [] },
  owner: { id: "owner-1", email: "owner@example.se" },
};

beforeEach(() => {
  vi.clearAllMocks();
  createLoggerMock.mockReturnValue({
    info: loggerInfoMock,
    warn: loggerWarnMock,
    error: loggerErrorMock,
  });
  checkRateLimitMock.mockResolvedValue({
    allowed: true,
    remaining: 119,
    resetAt: new Date(Date.now() + 60_000),
    source: "database",
  });
  extractPortalCompanySlugMock.mockReturnValue("demo");
  resolvePublicPortalCompanyMock.mockResolvedValue(portal);
  toPortalSlugMock.mockReturnValue("demo-fastigheter");
  propertyFindManyMock.mockResolvedValue([
    {
      id: "property-1",
      name: "Fastighet Ett",
      address: "Gatan 1",
      postal_code: "41101",
      city: "Göteborg",
    },
  ]);
  isMissingSchemaColumnErrorMock.mockReturnValue(false);
});

describe("GET /api/public/properties", () => {
  it("rate limits before portal and database access", async () => {
    checkRateLimitMock.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 30_000),
      source: "database",
    });

    const response = await GET(request());

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBeTruthy();
    expect(resolvePublicPortalCompanyMock).not.toHaveBeenCalled();
    expect(propertyFindManyMock).not.toHaveBeenCalled();
  });

  it("lists only active non-deleted properties for the resolved company", async () => {
    const response = await GET(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(propertyFindManyMock).toHaveBeenCalledWith({
      where: {
        company_id: "company-1",
        status: "active",
        deleted_at: null,
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 1001,
      select: {
        id: true,
        name: true,
        address: true,
        postal_code: true,
        city: true,
      },
    });
    expect(payload.company).toEqual({ name: "Demo Fastigheter", slug: "demo-fastigheter" });
    expect(payload.company.id).toBeUndefined();
  });

  it("adds private no-store and request correlation headers", async () => {
    const response = await GET(request());

    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("vercel-cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(response.headers.get("x-request-id")).toBe(REQUEST_ID);
  });

  it("returns a neutral service error when the portal cannot be resolved", async () => {
    resolvePublicPortalCompanyMock.mockResolvedValue(null);

    const response = await GET(request());
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.errorCode).toBe("SERVICE_UNAVAILABLE");
    expect(propertyFindManyMock).not.toHaveBeenCalled();
  });

  it("fails closed when the public directory exceeds its safe bound", async () => {
    propertyFindManyMock.mockResolvedValue(Array.from({ length: 1001 }, (_, index) => ({
      id: `property-${index}`,
      name: `Fastighet ${index}`,
      address: null,
      postal_code: null,
      city: null,
    })));

    const response = await GET(request());
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.errorCode).toBe("SERVICE_UNAVAILABLE");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "public property directory exceeds safe limit",
      undefined,
      expect.objectContaining({
        eventCode: "public_properties.list.limit_exceeded",
        companyId: "company-1",
      }),
    );
  });

  it("maps missing schema columns to a safe 503 response", async () => {
    const schemaError = new Error("missing column");
    propertyFindManyMock.mockRejectedValue(schemaError);
    isMissingSchemaColumnErrorMock.mockReturnValue(true);

    const response = await GET(request());
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.errorCode).toBe("SERVICE_UNAVAILABLE");
    expect(payload.error).toBe("Databasen är inte redo");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "public property directory schema unavailable",
      schemaError,
      expect.objectContaining({ eventCode: "public_properties.list.schema_unavailable" }),
    );
  });
});