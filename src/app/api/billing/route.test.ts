import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  createLoggerMock,
  getCurrentUserMock,
  propertyCountMock,
  userCountMock,
  ticketCountMock,
  companyFindUniqueMock,
  companyUpdateMock,
  transactionMock,
  writeAuditLogMock,
  recordPaymentEventMock,
  loggerInfoMock,
  loggerWarnMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  createLoggerMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  propertyCountMock: vi.fn(),
  userCountMock: vi.fn(),
  ticketCountMock: vi.fn(),
  companyFindUniqueMock: vi.fn(),
  companyUpdateMock: vi.fn(),
  transactionMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  recordPaymentEventMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

vi.mock("@/lib/db", () => ({
  default: {
    property: { count: propertyCountMock },
    user: { count: userCountMock },
    ticket: { count: ticketCountMock },
    company: { findUnique: companyFindUniqueMock },
    $transaction: transactionMock,
  },
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/integrations", () => ({ recordPaymentEvent: recordPaymentEventMock }));

const requestId = "550e8400-e29b-41d4-a716-446655440000";

function getRequest(headers: Record<string, string> = { "x-request-id": requestId }) {
  return new Request("https://www.revalta.se/api/billing", { method: "GET", headers });
}

function patchRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://www.revalta.se/api/billing", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-request-id": requestId,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

import { GET, PATCH } from "./route";

describe("billing route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    propertyCountMock.mockResolvedValue(0);
    userCountMock.mockResolvedValue(0);
    ticketCountMock.mockResolvedValue(0);
    companyFindUniqueMock.mockResolvedValue({
      stripe_customer_id: "cus_123",
      stripe_subscription_id: "sub_123",
      subscription_status: "active",
    });
    companyUpdateMock.mockResolvedValue({ id: "company-1", name: "Testfastigheter AB", plan: "enterprise" });
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) => {
      const tx = { company: { update: companyUpdateMock } };
      return callback(tx);
    });
    writeAuditLogMock.mockResolvedValue(undefined);
    recordPaymentEventMock.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("denies technicians from reading billing with a stable correlated private error", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });

    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: "Du saknar behörighet att visa abonnemang",
      errorCode: "FORBIDDEN",
      requestId,
    });
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(companyFindUniqueMock).not.toHaveBeenCalled();
  });

  it("denies managers from reading billing administration", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "manager-1", company_id: "company-1", role: "manager" });

    const response = await GET(getRequest());

    expect(response.status).toBe(403);
    expect(companyFindUniqueMock).not.toHaveBeenCalled();
  });

  it("allows owners to read a private correlated billing summary", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "owner-1",
      company_id: "company-1",
      role: "owner",
      company: { plan: "professional" },
    });

    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(companyFindUniqueMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "company-1" } }));
    expect(body.canDirectChangePlan).toBe(true);
    expect(body.currentPlan).toBe("professional");
  });

  it("reports canDirectChangePlan as false in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });

    const response = await GET(getRequest());
    const body = await response.json();

    expect(body.canDirectChangePlan).toBe(false);
  });

  it("returns a safe correlated 500 without leaking dependency details", async () => {
    getCurrentUserMock.mockRejectedValue(new Error("postgres://billing-user:secret@database.internal/revalta"));

    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Internt serverfel",
      errorCode: "INTERNAL_ERROR",
      requestId,
    });
    expect(JSON.stringify(body)).not.toContain("database.internal");
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(response.headers.get("x-request-id")).toBe(requestId);
  });

  describe("PATCH", () => {
    it("returns a correlated 401 and replaces a malformed request id", async () => {
      getCurrentUserMock.mockResolvedValue(null);

      const response = await PATCH(patchRequest({ plan: "enterprise" }, { "x-request-id": "not a valid id" }));
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.errorCode).toBe("UNAUTHORIZED");
      expect(body.requestId).not.toBe("not a valid id");
      expect(response.headers.get("x-request-id")).toBe(body.requestId);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it("returns 403 for a role that cannot manage billing", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "manager-1", company_id: "company-1", role: "manager" });

      const response = await PATCH(patchRequest({ plan: "enterprise" }));
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.errorCode).toBe("FORBIDDEN");
      expect(body.requestId).toBe(requestId);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it("blocks direct plan changes in production — must go through Stripe Checkout", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("VERCEL_ENV", "production");
      getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });

      const response = await PATCH(patchRequest({ plan: "enterprise" }));
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.error).toContain("Stripe Checkout");
      expect(body.errorCode).toBe("FORBIDDEN");
      expect(body.requestId).toBe(requestId);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it("returns 400 for a plan not in the allowed set outside production", async () => {
      vi.stubEnv("NODE_ENV", "test");
      getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });

      const response = await PATCH(patchRequest({ plan: "unlimited" }));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body).toEqual({ error: "Ogiltig plan", errorCode: "VALIDATION_FAILED", requestId });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it("updates the plan and audit atomically outside production", async () => {
      vi.stubEnv("NODE_ENV", "test");
      getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });

      const response = await PATCH(patchRequest({ plan: "enterprise" }));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(response.headers.get("x-request-id")).toBe(requestId);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(body).toEqual({
        success: true,
        company: { id: "company-1", name: "Testfastigheter AB", plan: "enterprise" },
      });
      expect(transactionMock).toHaveBeenCalledTimes(1);
      expect(companyUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "company-1" }, data: { plan: "enterprise" } }),
      );
      expect(writeAuditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: "owner-1" }),
        expect.objectContaining({
          action: "billing.plan_changed",
          metadata: { schemaVersion: 2, plan: "enterprise" },
        }),
        expect.objectContaining({ company: { update: companyUpdateMock } }),
      );
      expect(recordPaymentEventMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: "owner-1" }),
        { companyId: "company-1", plan: "enterprise", mode: "plan_change" },
      );
    });

    it("fail-closes when audit fails inside the plan transaction", async () => {
      vi.stubEnv("NODE_ENV", "test");
      getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });
      writeAuditLogMock.mockRejectedValue(new Error("audit-db-secret"));

      const response = await PATCH(patchRequest({ plan: "enterprise" }));
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body).toEqual({ error: "Internt serverfel", errorCode: "INTERNAL_ERROR", requestId });
      expect(JSON.stringify(body)).not.toContain("audit-db-secret");
      expect(transactionMock).toHaveBeenCalledTimes(1);
      expect(recordPaymentEventMock).not.toHaveBeenCalled();
    });

    it("does not turn telemetry failure into a false failed mutation", async () => {
      vi.stubEnv("NODE_ENV", "test");
      getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });
      recordPaymentEventMock.mockRejectedValue(new Error("integration-event-db-failure"));

      const response = await PATCH(patchRequest({ plan: "enterprise" }));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(loggerWarnMock).toHaveBeenCalledWith(
        "billing payment event recording failed",
        expect.objectContaining({
          event: "billing.plan_change.telemetry_failed",
          userId: "owner-1",
          companyId: "company-1",
          plan: "enterprise",
        }),
      );
    });
  });
});
