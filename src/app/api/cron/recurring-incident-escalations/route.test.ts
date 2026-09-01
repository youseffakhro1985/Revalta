import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  canAssignWorkOrdersMock,
  createLoggerMock,
  cronRunCreateMock,
  cronRunUpdateMock,
  getCurrentUserMock,
  isCronRequestAuthorizedMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  runEscalationMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  canAssignWorkOrdersMock: vi.fn(),
  createLoggerMock: vi.fn(),
  cronRunCreateMock: vi.fn(),
  cronRunUpdateMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  isCronRequestAuthorizedMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  runEscalationMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/current-user", () => ({ canAssignWorkOrders: canAssignWorkOrdersMock, getCurrentUser: getCurrentUserMock }));
vi.mock("@/lib/db", () => ({ default: { cronJobRun: { create: cronRunCreateMock, update: cronRunUpdateMock } } }));
vi.mock("@/lib/recurring-incident-escalation", () => ({ runRecurringIncidentEscalation: runEscalationMock }));
vi.mock("@/lib/request-security", () => ({ isCronRequestAuthorized: isCronRequestAuthorizedMock }));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { GET, POST } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440002";
const result = { companies: 2, scanned: 4, escalated: 1, skipped: 3, failed: 0, errors: [] };

function request(method: "GET" | "POST" = "GET") {
  return new Request("https://www.revalta.se/api/cron/recurring-incident-escalations", {
    method,
    headers: { "x-request-id": requestId },
  });
}

describe("recurring incident escalation cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({ debug: vi.fn(), info: loggerInfoMock, warn: loggerWarnMock, error: loggerErrorMock });
    isCronRequestAuthorizedMock.mockReturnValue(true);
    canAssignWorkOrdersMock.mockReturnValue(true);
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    cronRunCreateMock.mockResolvedValue({ id: "run-1" });
    cronRunUpdateMock.mockResolvedValue({ id: "run-1" });
    runEscalationMock.mockResolvedValue(result);
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("rejects an invalid cron secret without executing", async () => {
    isCronRequestAuthorizedMock.mockReturnValue(false);

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Obehörig", errorCode: "UNAUTHORIZED", requestId });
    expect(cronRunCreateMock).not.toHaveBeenCalled();
  });

  it("records a correlated scheduled run", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(runEscalationMock).toHaveBeenCalledWith({ companyId: undefined });
    expect(cronRunUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "run-1" },
      data: expect.objectContaining({ status: "sent" }),
    }));
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "recurring incident escalation cron completed",
      expect.objectContaining({ event: "cron.recurring_incident_escalations.completed", escalated: 1 }),
    );
  });

  it("does not persist an internal exception in run history", async () => {
    runEscalationMock.mockRejectedValue(new Error("provider token secret-value"));

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.errorCode).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(body)).not.toContain("secret-value");
    expect(cronRunUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "failed", payload: expect.objectContaining({ error: "Körningen misslyckades" }) }),
    }));
    expect(JSON.stringify(cronRunUpdateMock.mock.calls)).not.toContain("secret-value");
  });

  it("requires an authorized role for a manual run", async () => {
    canAssignWorkOrdersMock.mockReturnValue(false);

    const response = await POST(request("POST"));

    expect(response.status).toBe(403);
    expect(cronRunCreateMock).not.toHaveBeenCalled();
  });

  it("scopes and audits a manual run", async () => {
    const response = await POST(request("POST"));

    expect(response.status).toBe(200);
    expect(runEscalationMock).toHaveBeenCalledWith({ companyId: "company-1" });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1" }),
      expect.objectContaining({ action: "recurring_incident_escalation.manual_run", entityId: "company-1" }),
    );
  });
});
