import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  queryRawMock,
  getSchemaReadinessMock,
  isModernStorageOnlyMock,
  hasStorageConfigMock,
  getStorageTokenMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  queryRawMock: vi.fn(),
  getSchemaReadinessMock: vi.fn(),
  isModernStorageOnlyMock: vi.fn(),
  hasStorageConfigMock: vi.fn(),
  getStorageTokenMock: vi.fn(),
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

import { GET } from "./route";

describe("health route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    queryRawMock.mockResolvedValue([{ "?column?": 1 }]);
    isModernStorageOnlyMock.mockReturnValue(true);
    hasStorageConfigMock.mockReturnValue(true);
    getStorageTokenMock.mockReturnValue("blob-token");
    getSchemaReadinessMock.mockResolvedValue({ ready: true, missing: [], checkedAt: new Date().toISOString() });
  });

  it("public GET returns lightweight ok payload for uptime monitors", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const response = await GET();
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

  it("ops GET includes schema and critical env flags", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", role: "owner", company_id: "company-1" });
    vi.stubEnv("DATABASE_URL", "postgres://example");
    vi.stubEnv("DIRECT_URL", "postgres://example");
    vi.stubEnv("JWT_SECRET", "x".repeat(40));
    vi.stubEnv("EMAIL_FROM", "noreply@example.se");
    vi.stubEnv("EMAIL_PROVIDER_API_KEY", "key");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "blob");
    vi.stubEnv("CRON_SECRET", "cron");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.schema.ready).toBe(true);
    expect(body.env).toMatchObject({
      databaseUrl: true,
      directUrl: true,
      jwtSecret: true,
      emailFrom: true,
      emailProvider: true,
      blobReadWriteToken: true,
      cronSecret: true,
      modernStorageOnly: true,
    });
    expect(body.readiness.criticalReady).toBe(true);
  });
});
