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
  runEngineMock,
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
  runEngineMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/current-user", () => ({
  canAssignWorkOrders: canAssignWorkOrdersMock,
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("@/lib/db", () => ({
  default: { cronJobRun: { create: cronRunCreateMock, update: cronRunUpdateMock } },
}));
vi.mock("@/lib/preventive-maintenance-engine", () => ({ runPreventiveMaintenanceEngine: runEngineMock }));
vi.mock("@/lib/request-security", () => ({ isCronRequestAuthorized: isCronRequestAuthorizedMock }));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { GET, POST } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440001";
const result = { examined: 3, created: 2, skipped: 1, failed: 0, workOrderIds: ["wo-1", "wo-2"], errors: [] };

function request(method: "GET" | "POST" = "GET") {
  return new Request("https://www.revalta.se/api/cron/preventive-maintenance", {
    method,
    headers: { "x-request-id": requestId },
  });
}

describe("preventive maintenance cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({ debug: vi.fn(), info: loggerInfoMock, warn: loggerWarnMock, error: loggerErrorMock });
    isCronRequestAuthorizedMock.mockReturnValue(true);
    canAssignWorkOrdersMock.mockReturnValue(true);
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    cronRunCreateMock.mockResolvedValue({ id: "run-1" });
    cronRunUpdateMock.mockResolvedValue({ id: "run-1" });
    runEngineMock.mockResolvedValue(result);
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("rejects an invalid cron secret with a correlated no-store response", async () => {
    isCronRequestAuthorizedMock.mockReturnValue(false);

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Obehörig", errorCode: "UNAUTHORIZED", requestId });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(cronRunCreateMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "preventive maintenance cron rejected",
      expect.objectContaining({ event: "cron.preventive_maintenance.unauthorized" }),
    );
  });

  it("records and correlates a successful scheduled run", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(runEngineMock).toHaveBeenCalledWith({ companyId: undefined });
    expect(cronRunUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "run-1" },
      data: expect.objectContaining({ status: "sent" }),
    }));
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "preventive maintenance cron completed",
      expect.objectContaining({ event: "cron.preventive_maintenance.completed", created: 2, failed: 0 }),
    );
  });

  it("persists only a safe failure marker and returns a correlated 500", async () => {
    runEngineMock.mockRejectedValue(new Error("postgres://user:secret@internal/revalta"));

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Internt serverfel", errorCode: "INTERNAL_ERROR", requestId });
    expect(JSON.stringify(body)).not.toContain("postgres://");
    expect(cronRunUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "failed", payload: expect.objectContaining({ error: "Körningen misslyckades" }) }),
    }));
    expect(JSON.stringify(cronRunUpdateMock.mock.calls)).not.toContain("postgres://");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "preventive maintenance cron failed",
      expect.any(Error),
      expect.objectContaining({ event: "cron.preventive_maintenance.failed" }),
    );
  });

  it("fails closed before a forbidden manual run", async () => {
    canAssignWorkOrdersMock.mockReturnValue(false);

    const response = await POST(request("POST"));

    expect(response.status).toBe(403);
    expect((await response.json()).errorCode).toBe("FORBIDDEN");
    expect(cronRunCreateMock).not.toHaveBeenCalled();
  });

  it("scopes a manual run to the verified company and preserves its audit trail", async () => {
    const response = await POST(request("POST"));

    expect(response.status).toBe(200);
    expect(runEngineMock).toHaveBeenCalledWith({ companyId: "company-1" });
    expect(cronRunCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ company_id: "company-1", recipient: "company:company-1" }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1", company_id: "company-1" }),
      expect.objectContaining({ action: "preventive_maintenance.manual_run", entityId: "company-1" }),
    );
  });
});
