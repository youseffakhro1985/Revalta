import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deliverDemoRequest: vi.fn(),
  checkRateLimit: vi.fn(),
  getClientIp: vi.fn(),
  integrationEventCreate: vi.fn(),
  integrationEventUpdate: vi.fn(),
}));

vi.mock("@/lib/demo-request-email", () => ({
  deliverDemoRequest: mocks.deliverDemoRequest,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  getClientIp: mocks.getClientIp,
}));

vi.mock("@/lib/db", () => ({
  default: {
    integrationEvent: {
      create: mocks.integrationEventCreate,
      update: mocks.integrationEventUpdate,
    },
  },
}));

import { POST } from "./route";

const allowed = {
  allowed: true,
  remaining: 2,
  resetAt: new Date(Date.now() + 3_600_000),
  source: "database" as const,
};

function makeRequest(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new Request("https://www.revalta.se/api/demo-request", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://www.revalta.se",
      "sec-fetch-site": "same-origin",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const validBody = {
  name: "Anna Andersson",
  email: "ANNA@example.se",
  company: "Exempel Fastigheter AB",
  phone: "0701234567",
  role: "Förvaltare",
  portfolio: "12 fastigheter",
  message: "Vi vill se arbetsorder och planering.",
  website: "",
};

describe("POST /api/demo-request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getClientIp.mockReturnValue("203.0.113.10");
    mocks.checkRateLimit.mockResolvedValue(allowed);
    mocks.integrationEventCreate.mockResolvedValue({ id: "lead_123" });
    mocks.integrationEventUpdate.mockResolvedValue({ id: "lead_123" });
    mocks.deliverDemoRequest.mockResolvedValue({ ok: true, providerId: "email_123" });
  });

  it("persists before delivering a normalized valid demo request", async () => {
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.checkRateLimit).toHaveBeenCalledTimes(2);
    expect(mocks.integrationEventCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        company_id: null,
        type: "demo_request",
        status: "received",
        recipient: "anna@example.se",
        payload: expect.objectContaining({
          name: "Anna Andersson",
          email: "anna@example.se",
          company: "Exempel Fastigheter AB",
          source: "public_demo_form",
          delivery: { status: "pending" },
        }),
      }),
    }));
    expect(mocks.deliverDemoRequest).toHaveBeenCalledWith(
      {
        name: "Anna Andersson",
        email: "anna@example.se",
        company: "Exempel Fastigheter AB",
        phone: "0701234567",
        role: "Förvaltare",
        portfolio: "12 fastigheter",
        message: "Vi vill se arbetsorder och planering.",
      },
      { idempotencyKey: "demo-request/lead_123" },
    );
    expect(mocks.integrationEventUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "lead_123" },
      data: expect.objectContaining({
        status: "sent",
        payload: expect.objectContaining({
          delivery: { status: "sent", providerId: "email_123" },
        }),
      }),
    }));
    expect(mocks.integrationEventCreate.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deliverDemoRequest.mock.invocationCallOrder[0],
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });

  it("rejects cross-site mutations before persistence or delivery", async () => {
    const response = await POST(makeRequest(validBody, { origin: "https://evil.example", "sec-fetch-site": "cross-site" }));
    expect(response.status).toBe(403);
    expect(mocks.integrationEventCreate).not.toHaveBeenCalled();
    expect(mocks.deliverDemoRequest).not.toHaveBeenCalled();
  });

  it("rejects invalid contact data before rate limiting, persistence or delivery", async () => {
    const response = await POST(makeRequest({ ...validBody, email: "inte-en-email" }));
    expect(response.status).toBe(400);
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.integrationEventCreate).not.toHaveBeenCalled();
    expect(mocks.deliverDemoRequest).not.toHaveBeenCalled();
  });

  it("absorbs honeypot submissions without persistence or delivery", async () => {
    const response = await POST(makeRequest({ ...validBody, website: "https://bot.example" }));
    expect(response.status).toBe(200);
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.integrationEventCreate).not.toHaveBeenCalled();
    expect(mocks.deliverDemoRequest).not.toHaveBeenCalled();
  });

  it("rate limits repeated requests before persistence and exposes retry-after", async () => {
    mocks.checkRateLimit.mockResolvedValueOnce({ ...allowed, allowed: false, remaining: 0 });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(mocks.integrationEventCreate).not.toHaveBeenCalled();
    expect(mocks.deliverDemoRequest).not.toHaveBeenCalled();
  });

  it("accepts a durably captured lead when email delivery is deferred", async () => {
    mocks.deliverDemoRequest.mockResolvedValue({ ok: false, reason: "not_configured" });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true, deliveryPending: true });
    expect(mocks.integrationEventCreate).toHaveBeenCalledTimes(1);
    expect(mocks.integrationEventUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "lead_123" },
      data: expect.objectContaining({
        status: "failed",
        payload: expect.objectContaining({
          delivery: { status: "failed", reason: "not_configured" },
        }),
      }),
    }));
  });

  it("fails before delivery when durable lead persistence is unavailable", async () => {
    mocks.integrationEventCreate.mockRejectedValue(new Error("database unavailable"));
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(500);
    expect((await response.json()).errorCode).toBe("INTERNAL_ERROR");
    expect(mocks.deliverDemoRequest).not.toHaveBeenCalled();
  });

  it("does not report a false client failure if the post-delivery status update fails", async () => {
    mocks.integrationEventUpdate.mockRejectedValue(new Error("status write failed"));
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.integrationEventCreate).toHaveBeenCalledTimes(1);
    expect(mocks.deliverDemoRequest).toHaveBeenCalledTimes(1);
  });
});
