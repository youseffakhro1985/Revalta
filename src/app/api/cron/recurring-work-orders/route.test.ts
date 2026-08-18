import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  canAssignWorkOrdersMock,
  createLoggerMock,
  createRecurringRunMock,
  getCurrentUserMock,
  isCronRequestAuthorizedMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  runRecurringWorkOrderEngineMock,
  updateRecurringRunMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  canAssignWorkOrdersMock: vi.fn(),
  createLoggerMock: vi.fn(),
  createRecurringRunMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  isCronRequestAuthorizedMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  runRecurringWorkOrderEngineMock: vi.fn(),
  updateRecurringRunMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/current-user", () => ({
  canAssignWorkOrders: canAssignWorkOrdersMock,
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("@/lib/request-security", () => ({ isCronRequestAuthorized: isCronRequestAuthorizedMock }));
vi.mock("@/lib/recurring-work-order-engine", () => ({
  createRecurringRun: createRecurringRunMock,
  runRecurringWorkOrderEngine: runRecurringWorkOrderEngineMock,
  updateRecurringRun: updateRecurringRunMock,
}));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { GET, POST } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";
const result = { companies: 1, generated: 2, skipped: 1, failed: 0 };

function request(method: "GET" | "POST" = "GET", authorization?: string) {
  return new Request("https://www.revalta.se/api/cron/recurring-work-orders", {
    method,
    headers: {
      "x-request-id": requestId,
      ...(authorization ? { authorization } : {}),
    },
  });
}

describe("recurring work-order cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    isCronRequestAuthorizedMock.mockReturnValue(true);
    canAssignWorkOrdersMock.mockReturnValue(true);
    getCurrentUserMock.mockResolvedValue({
      id: "user-1",
      company_id: "company-1",
      role: "owner",
    });
    createRecurringRunMock.mockResolvedValue({ id: "run-1" });
    runRecurringWorkOrderEngineMock.mockResolvedValue(result);
    updateRecurringRunMock.mockResolvedValue({ id: "run-1" });
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("returns a correlated safe 401 for an invalid cron secret without executing work", async () => {
    isCronRequestAuthorizedMock.mockReturnValue(false);
    const suppliedAuthorization = "Bearer super-secret-cron-value";

    const response = await GET(request("GET", suppliedAuthorization));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      error: "Obehörig",
      errorCode: "UNAUTHORIZED",
      requestId,
    });
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(createRecurringRunMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "recurring work-order cron rejected",
      expect.objectContaining({ event: "cron.recurring_work_orders.unauthorized" }),
    );
    expect(JSON.stringify(loggerWarnMock.mock.calls)).not.toContain(suppliedAuthorization);
  });

  it("runs the scheduled engine and returns a correlated private success response", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(runRecurringWorkOrderEngineMock).toHaveBeenCalledWith({ companyId: undefined });
    expect(updateRecurringRunMock).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({ status: "sent" }),
    );
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "recurring work-order cron completed",
      expect.objectContaining({
        event: "cron.recurring_work_orders.completed",
        generated: 2,
        skipped: 1,
        failed: 0,
      }),
    );
  });

  it("stores only a safe run failure message and returns correlated 500", async () => {
    runRecurringWorkOrderEngineMock.mockRejectedValue(
      new Error("postgres://user:super-secret@db.internal/revalta"),
    );

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Internt serverfel",
      errorCode: "INTERNAL_ERROR",
      requestId,
    });
    expect(JSON.stringify(body)).not.toContain("postgres://");
    expect(updateRecurringRunMock).toHaveBeenCalledWith("run-1", {
      status: "failed",
      payload: expect.objectContaining({
        companyId: null,
        error: "Körningen misslyckades",
      }),
    });
    expect(JSON.stringify(updateRecurringRunMock.mock.calls)).not.toContain("super-secret");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "recurring work-order cron failed",
      expect.any(Error),
      expect.objectContaining({ event: "cron.recurring_work_orders.failed" }),
    );
  });

  it("returns a correlated 401 for an unauthenticated manual run", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const response = await POST(request("POST"));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.errorCode).toBe("UNAUTHORIZED");
    expect(body.requestId).toBe(requestId);
    expect(createRecurringRunMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "manual recurring work-order run rejected",
      expect.objectContaining({ event: "cron.recurring_work_orders.manual_unauthorized" }),
    );
  });

  it("fails closed when the authenticated user has no company", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: null, role: "owner" });

    const response = await POST(request("POST"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.errorCode).toBe("VALIDATION_FAILED");
    expect(createRecurringRunMock).not.toHaveBeenCalled();
  });

  it("returns a correlated 403 before execution when the role cannot assign work orders", async () => {
    canAssignWorkOrdersMock.mockReturnValue(false);

    const response = await POST(request("POST"));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.errorCode).toBe("FORBIDDEN");
    expect(body.requestId).toBe(requestId);
    expect(createRecurringRunMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "manual recurring work-order run forbidden",
      expect.objectContaining({
        event: "cron.recurring_work_orders.manual_forbidden",
        userId: "user-1",
        companyId: "company-1",
      }),
    );
  });

  it("runs only for the verified company and preserves the existing audit trail", async () => {
    const response = await POST(request("POST"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(runRecurringWorkOrderEngineMock).toHaveBeenCalledWith({ companyId: "company-1" });
    expect(createRecurringRunMock).toHaveBeenCalledWith(expect.objectContaining({
      companyId: "company-1",
      recipient: "company:company-1",
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1", company_id: "company-1" }),
      {
        entityType: "recurring_work_order",
        entityId: "company-1",
        action: "recurring_work_orders.manual_run",
        metadata: result,
      },
    );
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "manual recurring work-order run completed",
      expect.objectContaining({
        event: "cron.recurring_work_orders.manual_completed",
        companyId: "company-1",
        userId: "user-1",
      }),
    );
  });

  it("returns a safe 500 when the manual engine fails and does not write a success audit", async () => {
    runRecurringWorkOrderEngineMock.mockRejectedValue(new Error("internal provider detail"));

    const response = await POST(request("POST"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.errorCode).toBe("INTERNAL_ERROR");
    expect(body.requestId).toBe(requestId);
    expect(writeAuditLogMock).not.toHaveBeenCalled();
    expect(updateRecurringRunMock).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({
        status: "failed",
        payload: expect.objectContaining({ error: "Körningen misslyckades" }),
      }),
    );
  });
});
