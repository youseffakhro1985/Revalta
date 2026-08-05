import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  auditLogFindFirstMock,
  checkRateLimitMock,
  comparePasswordMock,
  cookieSetMock,
  cookiesMock,
  createLoggerMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  signTokenMock,
  userFindUniqueMock,
} = vi.hoisted(() => ({
  auditLogFindFirstMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  comparePasswordMock: vi.fn(),
  cookieSetMock: vi.fn(),
  cookiesMock: vi.fn(),
  createLoggerMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  signTokenMock: vi.fn(),
  userFindUniqueMock: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: cookiesMock }));
vi.mock("@/lib/db", () => ({
  default: {
    user: { findUnique: userFindUniqueMock },
    auditLog: { findFirst: auditLogFindFirstMock },
  },
}));
vi.mock("@/lib/auth", () => ({
  comparePassword: comparePasswordMock,
  signToken: signTokenMock,
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
  getClientIp: vi.fn(() => "203.0.113.10"),
}));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { POST } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";

function loginRequest(body: unknown) {
  return new Request("https://www.revalta.se/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-request-id": requestId },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimitMock.mockResolvedValue({
      allowed: true,
      remaining: 5,
      resetAt: new Date(Date.now() + 60_000),
    });
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    cookiesMock.mockResolvedValue({ set: cookieSetMock });
    auditLogFindFirstMock.mockResolvedValue(null);
    signTokenMock.mockResolvedValue("signed-session-token");
  });

  it("returns the same correlated unauthorized contract for invalid input", async () => {
    const response = await POST(loginRequest({ email: "invalid", password: "" }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      error: "Ogiltiga uppgifter",
      errorCode: "UNAUTHORIZED",
      requestId,
    });
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(userFindUniqueMock).not.toHaveBeenCalled();
  });

  it("rate limits without logging account identifiers or credentials", async () => {
    checkRateLimitMock.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 60_000),
    });

    const response = await POST(loginRequest({ email: "owner@example.se", password: "secret-value" }));
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.errorCode).toBe("RATE_LIMITED");
    expect(response.headers.get("retry-after")).toBeTruthy();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "auth login rate limited",
      expect.objectContaining({ event: "auth.login.rate_limited" }),
    );
    expect(JSON.stringify(loggerWarnMock.mock.calls)).not.toContain("owner@example.se");
    expect(JSON.stringify(loggerWarnMock.mock.calls)).not.toContain("secret-value");
  });

  it("creates the hardened session cookie and logs only verified internal identity", async () => {
    userFindUniqueMock.mockResolvedValue({
      id: "user-1",
      email: "owner@example.se",
      password: "password-hash",
      name: "Yousef",
      role: "owner",
      status: "active",
      company: { status: "active" },
    });
    comparePasswordMock.mockResolvedValue(true);

    const response = await POST(loginRequest({ email: "OWNER@example.se", password: "secret-value" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, user: { id: "user-1", role: "owner" } });
    expect(signTokenMock).toHaveBeenCalledWith(expect.objectContaining({ sub: "user-1" }));
    expect(cookieSetMock).toHaveBeenCalledTimes(2);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "auth login succeeded",
      expect.objectContaining({ event: "auth.login.succeeded", userId: "user-1" }),
    );
    expect(JSON.stringify(loggerInfoMock.mock.calls)).not.toContain("secret-value");
  });

  it("returns a stable internal error without exposing failure details", async () => {
    userFindUniqueMock.mockRejectedValue(new Error("database connection contains sensitive detail"));

    const response = await POST(loginRequest({ email: "owner@example.se", password: "secret-value" }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Internt serverfel",
      errorCode: "INTERNAL_ERROR",
      requestId,
    });
    expect(JSON.stringify(body)).not.toContain("database connection");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "auth login failed",
      expect.any(Error),
      expect.objectContaining({ event: "auth.login.failed" }),
    );
  });
});
