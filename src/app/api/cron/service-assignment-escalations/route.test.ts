import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createLoggerMock,
  cronRunCreateMock,
  cronRunUpdateMock,
  isCronRequestAuthorizedMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  runEscalationsMock,
} = vi.hoisted(() => ({
  createLoggerMock: vi.fn(),
  cronRunCreateMock: vi.fn(),
  cronRunUpdateMock: vi.fn(),
  isCronRequestAuthorizedMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  runEscalationsMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ default: { cronJobRun: { create: cronRunCreateMock, update: cronRunUpdateMock } } }));
vi.mock("@/lib/request-security", () => ({ isCronRequestAuthorized: isCronRequestAuthorizedMock }));
vi.mock("@/lib/service-escalation-engine", () => ({ runServiceEscalations: runEscalationsMock }));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { GET } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440003";
const result = { candidates: 3, sent: 2, skipped: 1, failed: 0, disabledCompanies: 0 };

function request() {
  return new Request("https://www.revalta.se/api/cron/service-assignment-escalations", {
    headers: { "x-request-id": requestId },
  });
}

describe("service assignment escalation cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({ debug: vi.fn(), info: loggerInfoMock, warn: loggerWarnMock, error: loggerErrorMock });
    isCronRequestAuthorizedMock.mockReturnValue(true);
    cronRunCreateMock.mockResolvedValue({ id: "run-1" });
    cronRunUpdateMock.mockResolvedValue({ id: "run-1" });
    runEscalationsMock.mockResolvedValue(result);
  });

  it("rejects an invalid cron secret with a correlated no-store response", async () => {
    isCronRequestAuthorizedMock.mockReturnValue(false);

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Obehörig", errorCode: "UNAUTHORIZED", requestId });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(cronRunCreateMock).not.toHaveBeenCalled();
  });

  it("creates durable run history and returns a correlated success", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(cronRunCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ job_type: "service_assignment_escalation_run", status: "processing" }),
    }));
    expect(cronRunUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "run-1" },
      data: expect.objectContaining({ status: "sent" }),
    }));
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "service assignment escalation cron completed",
      expect.objectContaining({ event: "cron.service_assignment_escalations.completed", sent: 2 }),
    );
  });

  it("stores a safe failure marker and never returns internal details", async () => {
    runEscalationsMock.mockRejectedValue(new Error("resend-key-secret-value"));

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Internt serverfel", errorCode: "INTERNAL_ERROR", requestId });
    expect(JSON.stringify(body)).not.toContain("secret-value");
    expect(cronRunUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "failed", payload: expect.objectContaining({ error: "Körningen misslyckades" }) }),
    }));
    expect(JSON.stringify(cronRunUpdateMock.mock.calls)).not.toContain("secret-value");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "service assignment escalation cron failed",
      expect.any(Error),
      expect.objectContaining({ event: "cron.service_assignment_escalations.failed" }),
    );
  });
});
