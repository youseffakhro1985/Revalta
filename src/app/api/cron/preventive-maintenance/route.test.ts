import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createLoggerMock,
  getCurrentUserMock,
  isCronRequestAuthorizedMock,
  runPreventiveMaintenanceEngineMock,
  cronCreateMock,
  cronUpdateMock,
  writeAuditLogMock,
  loggerInfoMock,
  loggerWarnMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  createLoggerMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  isCronRequestAuthorizedMock: vi.fn(),
  runPreventiveMaintenanceEngineMock: vi.fn(),
  cronCreateMock: vi.fn(),
  cronUpdateMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
  canAssignWorkOrders: (role: string) => ["owner", "admin", "manager", "property_manager"].includes(role),
}));
vi.mock("@/lib/request-security", () => ({ isCronRequestAuthorized: isCronRequestAuthorizedMock }));
vi.mock("@/lib/preventive-maintenance-engine", () => ({ runPreventiveMaintenanceEngine: runPreventiveMaintenanceEngineMock }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/db", () => ({
  default: { cronJobRun: { create: cronCreateMock, update: cronUpdateMock } },
}));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { GET, POST } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";
const cronRequest = () => new Request("https://www.revalta.se/api/cron/preventive-maintenance", {
  headers: { authorization: "Bearer cron-secret-value", "x-request-id": requestId },
});
const manualRequest = () => new Request("https://www.revalta.se/api/cron/preventive-maintenance", {
  method: "POST",
  headers: { "x-request-id": requestId },
});

const successfulResult = {
  examined: 5,
  created: 3,
  skipped: 2,
  failed: 0,
  workOrderIds: ["wo-1", "wo-2", "wo-3"],
  errors: [],
};

describe("preventive maintenance cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    isCronRequestAuthorizedMock.mockReturnValue(true);
    cronCreateMock.mockResolvedValue({ id: "run-1" });
    cronUpdateMock.mockResolvedValue({ id: "run-1" });
    runPreventiveMaintenanceEngineMock.mockResolvedValue(successfulResult);
    writeAuditLogMock.mockResolvedValue(undefined);
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
  });

  it("returns a correlated private 401 without exposing the cron secret", async () => {
    isCronRequestAuthorizedMock.mockReturnValue(false);

    const response = await GET(cronRequest());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "Obehörig", errorCode: "UNAUTHORIZED", requestId });
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(runPreventiveMaintenanceEngineMock).not.toHaveBeenCalled();
    expect(JSON.stringify(loggerWarnMock.mock.calls)).not.toContain("cron-secret-value");
  });

  it("correlates success and logs only safe counters", async () => {
    const response = await GET(cronRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "preventive maintenance cron completed",
      expect.objectContaining({ event: "cron.completed", examined: 5, created: 3, skipped: 2, failed: 0 }),
    );
  });

  it("does not persist free engine error text in a partial CronJobRun payload", async () => {
    runPreventiveMaintenanceEngineMock.mockResolvedValue({
      examined: 2,
      created: 1,
      skipped: 0,
      failed: 1,
      workOrderIds: ["wo-1"],
      errors: [{ componentId: "component-1", message: "postgres://secret@db.internal" }],
    });

    const response = await GET(cronRequest());

    expect(response.status).toBe(200);
    expect(JSON.stringify(cronUpdateMock.mock.calls)).not.toContain("postgres://secret@db.internal");
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "preventive maintenance cron partially failed",
      expect.objectContaining({ event: "cron.partial_failure", failed: 1, created: 1 }),
    );
  });

  it("stores a safe run error and returns a correlated safe 500 on total failure", async () => {
    runPreventiveMaintenanceEngineMock.mockRejectedValue(new Error("DATABASE_URL=postgres://secret"));

    const response = await GET(cronRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Cron-körningen misslyckades", errorCode: "INTERNAL_ERROR", requestId });
    expect(JSON.stringify(body)).not.toContain("DATABASE_URL");
    expect(cronUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "failed",
        payload: expect.objectContaining({ error: "Körningen misslyckades" }),
      }),
    }));
    expect(JSON.stringify(cronUpdateMock.mock.calls)).not.toContain("postgres://secret");
  });

  it("keeps a completed manual run successful if audit telemetry fails", async () => {
    writeAuditLogMock.mockRejectedValue(new Error("audit-secret"));

    const response = await POST(manualRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.created).toBe(3);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1" }),
      expect.objectContaining({
        action: "preventive_maintenance.manual_run",
        metadata: {
          schemaVersion: 2,
          examined: 5,
          created: 3,
          skipped: 2,
          failed: 0,
          storage: "CronJobRun",
        },
      }),
    );
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "manual preventive maintenance audit failed",
      expect.objectContaining({ event: "cron.manual_audit_failed", companyId: "company-1" }),
    );
    expect(JSON.stringify(loggerWarnMock.mock.calls)).not.toContain("audit-secret");
  });

  it("returns a stable correlated 403 before a manual run for disallowed roles", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });

    const response = await POST(manualRequest());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: "Du saknar behörighet", errorCode: "FORBIDDEN", requestId });
    expect(runPreventiveMaintenanceEngineMock).not.toHaveBeenCalled();
  });
});
