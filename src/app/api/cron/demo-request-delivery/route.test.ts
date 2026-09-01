import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deliverDemoRequest: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
  createLogger: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@/lib/demo-request-email", () => ({
  deliverDemoRequest: mocks.deliverDemoRequest,
}));

vi.mock("@/lib/db", () => ({
  default: {
    integrationEvent: {
      findMany: mocks.findMany,
      updateMany: mocks.updateMany,
    },
  },
}));

vi.mock("@/lib/structured-logger", () => ({
  createLogger: mocks.createLogger,
}));

import { GET } from "./route";

const basePayload = {
  name: "Anna Andersson",
  email: "anna@example.se",
  company: "Exempel Fastigheter AB",
  phone: "0701234567",
  role: "Förvaltare",
  portfolio: "12 fastigheter",
  message: "Visa arbetsorder.",
  source: "public_demo_form",
  requestId: "request-1",
  delivery: { status: "failed", reason: "not_configured" },
};

function candidate(payload: Record<string, unknown> = basePayload) {
  return { id: "lead-1", payload };
}

function cronRequest(secret = "test-cron-secret") {
  return new Request("https://www.revalta.se/api/cron/demo-request-delivery", {
    headers: { authorization: `Bearer ${secret}` },
  });
}

describe("demo request delivery cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    mocks.createLogger.mockReturnValue({
      debug: vi.fn(),
      info: mocks.loggerInfo,
      warn: mocks.loggerWarn,
      error: mocks.loggerError,
    });
    mocks.findMany.mockResolvedValue([candidate()]);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.deliverDemoRequest.mockResolvedValue({ ok: true, providerId: "email-1" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("rejects requests without the cron secret before reading leads", async () => {
    const response = await GET(cronRequest("wrong-secret"));
    expect(response.status).toBe(401);
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.deliverDemoRequest).not.toHaveBeenCalled();
  });

  it("atomically claims a safe failed lead and marks it sent after delivery", async () => {
    const response = await GET(cronRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      candidates: 1,
      sent: 1,
      retryableFailed: 0,
      reconciliationRequired: 0,
      exhausted: 0,
      invalid: 0,
      skipped: 0,
    });
    expect(mocks.updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { id: "lead-1", company_id: null, type: "demo_request", status: "failed" },
      data: expect.objectContaining({ status: "processing" }),
    }));
    expect(mocks.deliverDemoRequest).toHaveBeenCalledWith(
      expect.objectContaining({ email: "anna@example.se", company: "Exempel Fastigheter AB" }),
      { idempotencyKey: "demo-request/lead-1" },
    );
    expect(mocks.updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { id: "lead-1", company_id: null, type: "demo_request", status: "processing" },
      data: expect.objectContaining({
        status: "sent",
        payload: expect.objectContaining({ delivery: { status: "sent", providerId: "email-1" } }),
      }),
    }));
  });

  it("skips delivery when another cron invocation wins the atomic claim", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });

    const response = await GET(cronRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.skipped).toBe(1);
    expect(body.sent).toBe(0);
    expect(mocks.deliverDemoRequest).not.toHaveBeenCalled();
  });

  it("returns explicit provider rejections to failed for a later safe retry", async () => {
    mocks.deliverDemoRequest.mockResolvedValue({ ok: false, reason: "provider_rejected" });

    const response = await GET(cronRequest());
    const body = await response.json();

    expect(body.retryableFailed).toBe(1);
    expect(body.reconciliationRequired).toBe(0);
    expect(mocks.updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { id: "lead-1", company_id: null, type: "demo_request", status: "processing" },
      data: expect.objectContaining({
        status: "failed",
        payload: expect.objectContaining({ delivery: { status: "failed", reason: "provider_rejected" } }),
      }),
    }));
  });

  it("never auto-retries a previously ambiguous timeout", async () => {
    mocks.findMany.mockResolvedValue([candidate({
      ...basePayload,
      delivery: { status: "failed", reason: "timeout" },
    })]);

    const response = await GET(cronRequest());
    const body = await response.json();

    expect(body.reconciliationRequired).toBe(1);
    expect(mocks.deliverDemoRequest).not.toHaveBeenCalled();
    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "lead-1", company_id: null, type: "demo_request", status: "failed" },
      data: expect.objectContaining({ status: "reconciliation_required" }),
    }));
  });

  it("moves a newly ambiguous network result to reconciliation instead of retrying it", async () => {
    mocks.deliverDemoRequest.mockResolvedValue({ ok: false, reason: "network_error" });

    const response = await GET(cronRequest());
    const body = await response.json();

    expect(body.reconciliationRequired).toBe(1);
    expect(body.retryableFailed).toBe(0);
    expect(mocks.updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: expect.objectContaining({
        status: "reconciliation_required",
        payload: expect.objectContaining({
          delivery: { status: "reconciliation_required", reason: "network_error" },
        }),
      }),
    }));
  });

  it("fails closed after provider success if the local sent receipt cannot be persisted", async () => {
    mocks.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const response = await GET(cronRequest());
    const body = await response.json();

    expect(body.sent).toBe(0);
    expect(body.reconciliationRequired).toBe(1);
    expect(mocks.deliverDemoRequest).toHaveBeenCalledTimes(1);
    expect(mocks.updateMany).toHaveBeenCalledTimes(2);
    expect(mocks.loggerError).toHaveBeenCalledWith(
      "demo lead retry requires reconciliation after provider success",
      undefined,
      expect.objectContaining({ leadId: "lead-1", attempt: 1 }),
    );
  });

  it("stops retrying after the bounded retry budget", async () => {
    mocks.findMany.mockResolvedValue([candidate({
      ...basePayload,
      retry: { attempts: 14, lastAttemptAt: "2026-08-31T09:00:00.000Z", previousReason: "not_configured" },
    })]);

    const response = await GET(cronRequest());
    const body = await response.json();

    expect(body.exhausted).toBe(1);
    expect(mocks.deliverDemoRequest).not.toHaveBeenCalled();
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "retry_exhausted" }),
    }));
  });

  it("quarantines malformed stored payloads instead of throwing or sending", async () => {
    mocks.findMany.mockResolvedValue([candidate({
      ...basePayload,
      email: "not-an-email",
    })]);

    const response = await GET(cronRequest());
    const body = await response.json();

    expect(body.invalid).toBe(1);
    expect(mocks.deliverDemoRequest).not.toHaveBeenCalled();
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "invalid" }),
    }));
  });

  it("returns a safe correlated 500 when loading the retry queue fails", async () => {
    mocks.findMany.mockRejectedValue(new Error("postgres://user:secret@internal/revalta"));

    const response = await GET(cronRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.errorCode).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(body)).not.toContain("postgres://");
    expect(mocks.deliverDemoRequest).not.toHaveBeenCalled();
  });
});
