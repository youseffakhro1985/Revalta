import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createLoggerMock,
  sqlSoftDeleteGuardMock,
  queryRawMock,
  settingsFindManyMock,
  preferencesFindManyMock,
  userFindManyMock,
  transactionMock,
  digestUpsertMock,
  loggerInfoMock,
  loggerWarnMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  createLoggerMock: vi.fn(),
  sqlSoftDeleteGuardMock: vi.fn(),
  queryRawMock: vi.fn(),
  settingsFindManyMock: vi.fn(),
  preferencesFindManyMock: vi.fn(),
  userFindManyMock: vi.fn(),
  transactionMock: vi.fn(),
  digestUpsertMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock("@prisma/client", () => ({
  Prisma: {
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
  },
}));
vi.mock("@/lib/soft-delete-compat", () => ({ sqlSoftDeleteGuard: sqlSoftDeleteGuardMock }));
vi.mock("@/lib/component-service-email", () => ({ deliverServiceEmail: vi.fn() }));
vi.mock("@/lib/db", () => ({
  default: {
    $queryRaw: queryRawMock,
    $transaction: transactionMock,
    serviceNotificationSettings: { findMany: settingsFindManyMock },
    userServiceNotificationPreference: { findMany: preferencesFindManyMock },
    user: { findMany: userFindManyMock },
    componentServiceDigestRun: { upsert: digestUpsertMock },
  },
}));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { GET } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";

function cronRequest() {
  return new Request("https://www.revalta.se/api/cron/component-service-reminders", {
    headers: {
      authorization: "Bearer test-cron-secret",
      "x-request-id": requestId,
    },
  });
}

describe("component service reminder cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    sqlSoftDeleteGuardMock.mockResolvedValue({ sql: "soft-delete-guard" });
    queryRawMock.mockResolvedValue([]);
    settingsFindManyMock.mockResolvedValue([]);
    preferencesFindManyMock.mockResolvedValue([]);
    userFindManyMock.mockResolvedValue([]);
    digestUpsertMock.mockResolvedValue({});
  });

  it("returns a correlated private 401 without logging CRON_SECRET", async () => {
    const response = await GET(new Request(
      "https://www.revalta.se/api/cron/component-service-reminders",
      { headers: { "x-request-id": requestId } },
    ));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "Obehörig", errorCode: "UNAUTHORIZED", requestId });
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(queryRawMock).not.toHaveBeenCalled();
    expect(JSON.stringify(loggerWarnMock.mock.calls)).not.toContain("test-cron-secret");
  });

  it("returns a correlated private success and logs only aggregate counters for an empty run", async () => {
    const response = await GET(cronRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body).toEqual({
      companies: 0,
      sent: 0,
      partial: 0,
      skipped: 0,
      failed: 0,
      components: 0,
    });
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "component service reminder cron completed",
      expect.objectContaining({
        event: "cron.completed",
        job: "component_service_reminders",
        companies: 0,
        components: 0,
        sent: 0,
        partial: 0,
        skipped: 0,
        failed: 0,
      }),
    );
    const logs = JSON.stringify([loggerInfoMock.mock.calls, loggerWarnMock.mock.calls]);
    expect(logs).not.toContain("@");
    expect(logs).not.toContain("test-cron-secret");
  });

  it("returns a safe correlated 500 when the cron setup fails", async () => {
    sqlSoftDeleteGuardMock.mockRejectedValue(new Error("DATABASE_URL=postgres://secret@db.internal"));

    const response = await GET(cronRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Cron-körningen misslyckades",
      errorCode: "INTERNAL_ERROR",
      requestId,
    });
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(JSON.stringify(body)).not.toContain("postgres://secret");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "component service reminder cron failed",
      expect.any(Error),
      expect.objectContaining({ event: "cron.failed", job: "component_service_reminders" }),
    );
  });
});
