import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createLoggerMock,
  isCronRequestAuthorizedMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  queryRawMock,
  settingsFindManyMock,
  userPreferencesFindManyMock,
} = vi.hoisted(() => ({
  createLoggerMock: vi.fn(),
  isCronRequestAuthorizedMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  queryRawMock: vi.fn(),
  settingsFindManyMock: vi.fn(),
  userPreferencesFindManyMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: {
    $queryRaw: queryRawMock,
    serviceNotificationSettings: { findMany: settingsFindManyMock },
    userServiceNotificationPreference: { findMany: userPreferencesFindManyMock },
  },
}));
vi.mock("@/lib/request-security", () => ({ isCronRequestAuthorized: isCronRequestAuthorizedMock }));
vi.mock("@/lib/soft-delete-compat", () => ({ sqlSoftDeleteGuard: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { GET } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440005";

function request() {
  return new Request("https://www.revalta.se/api/cron/component-service-reminders", {
    headers: { "x-request-id": requestId },
  });
}

describe("component service reminder cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({ debug: vi.fn(), info: loggerInfoMock, warn: loggerWarnMock, error: loggerErrorMock });
    isCronRequestAuthorizedMock.mockReturnValue(true);
    queryRawMock.mockResolvedValue([]);
    settingsFindManyMock.mockResolvedValue([]);
    userPreferencesFindManyMock.mockResolvedValue([]);
  });

  it("rejects an invalid cron secret before querying tenant data", async () => {
    isCronRequestAuthorizedMock.mockReturnValue(false);

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Obehörig", errorCode: "UNAUTHORIZED", requestId });
    expect(queryRawMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "component service reminder cron rejected",
      expect.objectContaining({ event: "cron.component_service_reminders.unauthorized" }),
    );
  });

  it("returns a correlated summary when there are no due components", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ companies: 0, sent: 0, partial: 0, skipped: 0, failed: 0, components: 0 });
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "component service reminder cron completed",
      expect.objectContaining({ event: "cron.component_service_reminders.completed", companies: 0, components: 0 }),
    );
  });

  it("returns a safe correlated 500 for a top-level database failure", async () => {
    queryRawMock.mockRejectedValue(new Error("postgres://user:secret@internal/revalta"));

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Internt serverfel", errorCode: "INTERNAL_ERROR", requestId });
    expect(JSON.stringify(body)).not.toContain("postgres://");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "component service reminder cron failed",
      expect.any(Error),
      expect.objectContaining({ event: "cron.component_service_reminders.failed" }),
    );
  });
});
