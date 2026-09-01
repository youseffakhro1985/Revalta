import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getCurrentUserMock,
  queryRawMock,
  getSchemaReadinessMock,
  isModernStorageOnlyMock,
  hasStorageConfigMock,
  getStorageTokenMock,
  isStripeBillingReadyMock,
  loggerWarnMock,
  loggerErrorMock,
  createLoggerMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  queryRawMock: vi.fn(),
  getSchemaReadinessMock: vi.fn(),
  isModernStorageOnlyMock: vi.fn(),
  hasStorageConfigMock: vi.fn(),
  getStorageTokenMock: vi.fn(),
  isStripeBillingReadyMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  createLoggerMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: { $queryRaw: queryRawMock },
}));

vi.mock("@/lib/schema-readiness", () => ({
  getSchemaReadiness: getSchemaReadinessMock,
}));

vi.mock("@/lib/dual-list", () => ({
  isModernStorageOnly: isModernStorageOnlyMock,
}));

vi.mock("@/lib/storage", () => ({
  hasStorageConfig: hasStorageConfigMock,
  getStorageToken: getStorageTokenMock,
}));

vi.mock("@/lib/stripe", () => ({
  isStripeBillingReady: isStripeBillingReadyMock,
}));

vi.mock("@/lib/structured-logger", () => ({
  createLogger: createLoggerMock,
}));

import { GET } from "./route";

function healthRequest(headers?: HeadersInit) {
  return new NextRequest("https://www.revalta.se/api/health", { headers });
}

function stubCriticalEnv() {
  vi.stubEnv("DATABASE_URL", "postgres://example");
  vi.stubEnv("DIRECT_URL", "postgres://example");
  vi.stubEnv("JWT_SECRET", "x".repeat(40));
  vi.stubEnv("EMAIL_FROM", "noreply@example.se");
  vi.stubEnv("EMAIL_PROVIDER_API_KEY", "key");
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "blob");
  vi.stubEnv("CRON_SECRET", "cron");
}

describe("health route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    queryRawMock.mockResolvedValue([{ "?column?": 1 }]);
    isModernStorageOnlyMock.mockReturnValue(true);
    hasStorageConfigMock.mockReturnValue(true);
    getStorageTokenMock.mockReturnValue("blob-token");
    isStripeBillingReadyMock.mockReturnValue(false);
    getSchemaReadinessMock.mockResolvedValue({ ready: true, missing: [], checkedAt: new Date().toISOString() });
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: vi.fn(),
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
  });

  it("public GET returns lightweight ok payload for uptime monitors", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const response = await GET(healthRequest());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "ok",
      ok: true,
      database: "ok",
      modernStorageOnly: true,
    });
    expect(body.env).toBeUndefined();
  });

  it("publishes immutable release provenance with cache-safe headers", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "1234567890abcdef1234567890abcdef12345678");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_DEPLOYMENT_ID", "dpl_revalta_test");

    const response = await GET(healthRequest());
    const body = await response.json();

    expect(body.release).toEqual({
      commitSha: "1234567890abcdef1234567890abcdef12345678",
      shortCommitSha: "1234567",
      branch: "main",
      environment: "production",
      deploymentId: "dpl_revalta_test",
    });
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(response.headers.get("cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("vercel-cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("x-revalta-release")).toBe("1234567");
    expect(response.headers.get("x-revalta-environment")).toBe("production");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("ops GET includes critical and commercial readiness flags", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", role: "owner", company_id: "company-1" });
    stubCriticalEnv();
    vi.stubEnv("DEMO_REQUEST_TO", "demo@example.se");
    isStripeBillingReadyMock.mockReturnValue(true);

    const response = await GET(healthRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.schema.ready).toBe(true);
    expect(body.env).toMatchObject({
      databaseUrl: true,
      directUrl: true,
      jwtSecret: true,
      emailFrom: true,
      emailProvider: true,
      demoRequestRecipient: true,
      stripeBilling: true,
      blobReadWriteToken: true,
      cronSecret: true,
      modernStorageOnly: true,
    });
    expect(body.readiness).toMatchObject({
      criticalReady: true,
      commercialReady: true,
      stripeBillingReady: true,
      demoLeadDeliveryReady: true,
    });
  });

  it("returns degraded when critical runtime configuration is missing even if schema is ready", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", role: "owner", company_id: "company-1" });
    stubCriticalEnv();
    vi.stubEnv("CRON_SECRET", "");

    const response = await GET(healthRequest());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({ status: "degraded", ok: false });
    expect(body.schema.ready).toBe(true);
    expect(body.readiness.criticalReady).toBe(false);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "health operational readiness degraded",
      expect.objectContaining({ missingOperationalConfig: ["CRON_SECRET"] }),
    );
  });

  it("keeps optional commercial readiness separate from core runtime health", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", role: "owner", company_id: "company-1" });
    stubCriticalEnv();
    isStripeBillingReadyMock.mockReturnValue(false);

    const response = await GET(healthRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.readiness).toMatchObject({
      criticalReady: true,
      commercialReady: false,
      stripeBillingReady: false,
      demoLeadDeliveryReady: false,
    });
  });

  it("logs degraded schema readiness with correlation context", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", role: "owner", company_id: "company-1" });
    getSchemaReadinessMock.mockResolvedValue({
      ready: false,
      missing: ["AuditLog.module"],
      checkedAt: new Date().toISOString(),
    });
    const request = healthRequest({
      "x-request-id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    });

    const response = await GET(request);

    expect(response.status).toBe(503);
    expect(createLoggerMock).toHaveBeenCalledWith(expect.objectContaining({
      route: "/api/health",
      requestId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    }));
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "health schema readiness degraded",
      expect.objectContaining({ missingSchemaItems: ["AuditLog.module"] }),
    );
  });

  it("logs database failures structurally without exposing env to public callers", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    queryRawMock.mockRejectedValue(new Error("database unavailable"));
    const request = healthRequest({
      "x-request-id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    });

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({ status: "error", ok: false, database: "error" });
    expect(body.env).toBeUndefined();
    expect(queryRawMock).toHaveBeenCalledTimes(2);
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "health check failed",
      expect.any(Error),
      expect.objectContaining({ audience: "public" }),
    );
  });

  it("recovers from a transient database ping failure via a single retry", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    queryRawMock
      .mockRejectedValueOnce(new Error("Can't reach database server"))
      .mockResolvedValueOnce([{ "?column?": 1 }]);

    const response = await GET(healthRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: "ok", ok: true, database: "ok" });
    expect(queryRawMock).toHaveBeenCalledTimes(2);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "health check database ping succeeded after retry",
      expect.objectContaining({ audience: "public" }),
    );
    expect(loggerErrorMock).not.toHaveBeenCalled();
  });
});
