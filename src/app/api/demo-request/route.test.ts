import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deliverDemoRequest: vi.fn(),
  checkRateLimit: vi.fn(),
  getClientIp: vi.fn(),
}));

vi.mock("@/lib/demo-request-email", () => ({
  deliverDemoRequest: mocks.deliverDemoRequest,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  getClientIp: mocks.getClientIp,
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
    mocks.deliverDemoRequest.mockResolvedValue({ ok: true, providerId: "email_123" });
  });

  it("normalizes and delivers a valid demo request", async () => {
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.checkRateLimit).toHaveBeenCalledTimes(2);
    expect(mocks.deliverDemoRequest).toHaveBeenCalledWith({
      name: "Anna Andersson",
      email: "anna@example.se",
      company: "Exempel Fastigheter AB",
      phone: "0701234567",
      role: "Förvaltare",
      portfolio: "12 fastigheter",
      message: "Vi vill se arbetsorder och planering.",
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });

  it("rejects cross-site mutations", async () => {
    const response = await POST(makeRequest(validBody, { origin: "https://evil.example", "sec-fetch-site": "cross-site" }));
    expect(response.status).toBe(403);
    expect(mocks.deliverDemoRequest).not.toHaveBeenCalled();
  });

  it("rejects invalid contact data before rate limiting or delivery", async () => {
    const response = await POST(makeRequest({ ...validBody, email: "inte-en-email" }));
    expect(response.status).toBe(400);
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.deliverDemoRequest).not.toHaveBeenCalled();
  });

  it("absorbs honeypot submissions without delivery", async () => {
    const response = await POST(makeRequest({ ...validBody, website: "https://bot.example" }));
    expect(response.status).toBe(200);
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.deliverDemoRequest).not.toHaveBeenCalled();
  });

  it("rate limits repeated requests and exposes retry-after", async () => {
    mocks.checkRateLimit.mockResolvedValueOnce({ ...allowed, allowed: false, remaining: 0 });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(mocks.deliverDemoRequest).not.toHaveBeenCalled();
  });

  it("fails closed when delivery is not configured", async () => {
    mocks.deliverDemoRequest.mockResolvedValue({ ok: false, reason: "not_configured" });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(503);
    expect((await response.json()).errorCode).toBe("SERVICE_UNAVAILABLE");
  });
});
