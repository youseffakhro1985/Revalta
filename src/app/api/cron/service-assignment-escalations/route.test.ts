import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createLoggerMock,
  isCronRequestAuthorizedMock,
  runServiceEscalationsMock,
  loggerInfoMock,
  loggerWarnMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  createLoggerMock: vi.fn(),
  isCronRequestAuthorizedMock: vi.fn(),
  runServiceEscalationsMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock("@/lib/request-security", () => ({ isCronRequestAuthorized: isCronRequestAuthorizedMock }));
vi.mock("@/lib/service-escalation-engine", () => ({ runServiceEscalations: runServiceEscalationsMock }));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { GET } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";
function request(authorization = "Bearer cron-secret-value") {
  return new Request("https://www.revalta.se/api/cron/service-assignment-escalations", {
    headers: { authorization, "x-request-id": requestId },
  });
}

describe("service assignment escalation cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    isCronRequestAuthorizedMock.mockReturnValue(true);
    runServiceEscalationsMock.mockResolvedValue({
      candidates: 4,
      sent: 3,
      skipped: 1,
      failed: 0,
      disabledCompanies: 2,
    });
  });

  it("returns a correlated private 401 without logging the cron secret", async () => {
    isCronRequestAuthorizedMock.mockReturnValue(false);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "Obehörig", errorCode: "UNAUTHORIZED", requestId });
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(runServiceEscalationsMock).not.toHaveBeenCalled();
    expect(JSON.stringify(loggerWarnMock.mock.calls)).not.toContain("cron-secret-value");
  });

  it("logs safe counters and returns a correlated private success", async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body).toEqual({ candidates: 4, sent: 3, skipped: 1, failed: 0, disabledCompanies: 2 });
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "service assignment cron completed",
      expect.objectContaining({
        event: "cron.completed",
        job: "service_assignment_escalations",
        candidates: 4,
        sent: 3,
        skipped: 1,
        failed: 0,
      }),
    );
  });

  it("uses warn for partial failures", async () => {
    runServiceEscalationsMock.mockResolvedValue({
      candidates: 5,
      sent: 2,
      skipped: 1,
      failed: 2,
      disabledCompanies: 0,
    });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "service assignment cron partially failed",
      expect.objectContaining({ event: "cron.partial_failure", failed: 2, sent: 2 }),
    );
  });

  it("returns a safe correlated 500 and never exposes dependency details", async () => {
    runServiceEscalationsMock.mockRejectedValue(new Error("EMAIL_PROVIDER_API_KEY=super-secret"));

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Cron-körningen misslyckades", errorCode: "INTERNAL_ERROR", requestId });
    expect(JSON.stringify(body)).not.toContain("super-secret");
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "service assignment cron failed",
      expect.any(Error),
      expect.objectContaining({ event: "cron.failed", job: "service_assignment_escalations" }),
    );
  });
});
