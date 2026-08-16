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
  resetAt: new Date("2026-08-17T01:00:00.000Z"),
  source: "database" as const,
};

function request(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new Request("https://www.revalta.se/api/demo-request", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://www.revalta.se", ...headers },
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
    mocks.deliverDemoRequest.mockResolvedValue({ ok: true });
  });

  it("validerar, normaliserar och levererar en demoförfrågan", async () => {
    const response = await POST(request(validBody));
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body.ok).toBe(true);
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
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("nekar cross-site mutationer", async () => {
    const response = await POST(request(validBody, { origin: "https://evil.example", "sec-fetch-site": "cross-site" }));
    expect(response.status).toBe(403);
    expect(mocks.deliverDemoRequest).not.toHaveBeenCalled();
  });

  it("nekar ogiltig kontaktdata innan leverans", async () => {
    const response = await POST(request({ ...validBody, email: "inte-en-email" }));
    expect(response.status).toBe(400);
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.deliverDemoRequest).not.toHaveBeenCalled();
  });

  it("absorberar honeypot-träffar utan leverans", async () => {
    const response = await POST(request({ ...validBody, website: "https://bot.example" }));
    expect(response.status).toBe(202);
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.deliverDemoRequest).not.toHaveBeenCalled();
  });

  it("rate-limit:ar upprepade förfrågningar", async () => {
    mocks.checkRateLimit
      .mockResolvedValueOnce({ ...allowed, allowed: false, remaining: 0 })
      .mockResolvedValueOnce(allowed);

    const response = await POST(request(validBody));
    expect(response.status).toBe(429);
    expect(mocks.deliverDemoRequest).not.toHaveBeenCalled();
  });

  it("failar tydligt när mottagarkanalen inte är konfigurerad", async () => {
    mocks.deliverDemoRequest.mockResolvedValue({ ok: false, reason: "not_configured" });

    const response = await POST(request(validBody));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("tillfälligt");
  });
});
