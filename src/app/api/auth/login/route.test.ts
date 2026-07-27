import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  checkRateLimitMock,
  getClientIpMock,
  findUniqueMock,
  auditFindFirstMock,
  comparePasswordMock,
  signTokenMock,
  loggerInfoMock,
  loggerWarnMock,
  loggerErrorMock,
  createLoggerMock,
  cookieSetMock,
} = vi.hoisted(() => ({
  checkRateLimitMock: vi.fn(),
  getClientIpMock: vi.fn(),
  findUniqueMock: vi.fn(),
  auditFindFirstMock: vi.fn(),
  comparePasswordMock: vi.fn(),
  signTokenMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  createLoggerMock: vi.fn(),
  cookieSetMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ set: cookieSetMock })),
}));

vi.mock("@/lib/db", () => ({
  default: {
    user: { findUnique: findUniqueMock },
    auditLog: { findFirst: auditFindFirstMock },
  },
}));

vi.mock("@/lib/auth", () => ({
  comparePassword: comparePasswordMock,
  signToken: signTokenMock,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
  getClientIp: getClientIpMock,
}));

vi.mock("@/lib/structured-logger", () => ({
  createLogger: createLoggerMock,
}));

import { POST } from "./route";

const REQUEST_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

function loginRequest(body: unknown, requestId = REQUEST_ID) {
  return new Request("https://www.revalta.se/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": requestId,
    },
    body: JSON.stringify(body),
  });
}

function allowedLimit() {
  return {
    allowed: true,
    remaining: 5,
    resetAt: new Date(Date.now() + 60_000),
  };
}

describe("login route observability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getClientIpMock.mockReturnValue("127.0.0.1");
    checkRateLimitMock.mockResolvedValue(allowedLimit());
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
  });

  it("returns a correlated standardized response for invalid credentials", async () => {
    const response = await POST(loginRequest({ email: "invalid", password: "secret-value" }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      error: "Ogiltiga uppgifter",
      errorCode: "UNAUTHORIZED",
      requestId: REQUEST_ID,
    });
    expect(response.headers.get("x-request-id")).toBe(REQUEST_ID);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0, must-revalidate");
    expect(response.headers.get("cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("vercel-cdn-cache-control")).toBe("no-store");
    expect(createLoggerMock).toHaveBeenCalledWith(expect.objectContaining({
      route: "/api/auth/login",
      method: "POST",
      requestId: REQUEST_ID,
    }));
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "auth.login.rejected",
      expect.objectContaining({ eventCode: "auth.login.invalid_credentials" }),
    );
    expect(JSON.stringify(loggerInfoMock.mock.calls)).not.toContain("secret-value");
    expect(JSON.stringify(loggerInfoMock.mock.calls)).not.toContain("invalid");
  });

  it("returns rate-limit metadata without exposing account or IP values", async () => {
    const resetAt = new Date(Date.now() + 120_000);
    checkRateLimitMock.mockResolvedValue({ allowed: false, remaining: 0, resetAt });

    const response = await POST(loginRequest({ email: "person@example.se", password: "secret-value" }));
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.errorCode).toBe("RATE_LIMITED");
    expect(body.requestId).toBe(REQUEST_ID);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "auth.login.rate_limited",
      expect.objectContaining({ eventCode: "auth.login.rate_limited" }),
    );
    const logged = JSON.stringify(loggerWarnMock.mock.calls);
    expect(logged).not.toContain("person@example.se");
    expect(logged).not.toContain("127.0.0.1");
    expect(logged).not.toContain("secret-value");
  });

  it("logs dependency failures and returns a safe internal error", async () => {
    checkRateLimitMock.mockRejectedValue(new Error("database url postgres://secret"));

    const response = await POST(loginRequest({ email: "person@example.se", password: "secret-value" }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Internt serverfel",
      errorCode: "INTERNAL_ERROR",
      requestId: REQUEST_ID,
    });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "auth.login.failed",
      expect.any(Error),
      expect.objectContaining({ eventCode: "auth.login.failed" }),
    );
    expect(JSON.stringify(body)).not.toContain("postgres://secret");
    expect(JSON.stringify(body)).not.toContain("person@example.se");
    expect(JSON.stringify(body)).not.toContain("secret-value");
  });
});
