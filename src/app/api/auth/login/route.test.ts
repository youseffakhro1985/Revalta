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

function activeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "owner@example.se",
    password: "password-hash",
    name: "Yousef",
    role: "owner",
    status: "active",
    email_verified_at: new Date("2026-09-01T12:00:00.000Z"),
    email_verification_tokens: [{ id: "verification-1" }],
    company: { status: "active" },
    ...overrides,
  };
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
    userFindUniqueMock.mockResolvedValue(activeUser());
    comparePasswordMock.mockResolvedValue(true);

    const response = await POST(loginRequest({ email: "OWNER@example.se", password: "secret-value" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, user: { id: "user-1", role: "owner" } });
    expect(userFindUniqueMock).toHaveBeenCalledWith({
      where: { email: "owner@example.se" },
      include: {
        company: { select: { status: true } },
        email_verification_tokens: { select: { id: true }, take: 1 },
      },
    });
    expect(signTokenMock).toHaveBeenCalledWith(expect.objectContaining({ sub: "user-1" }));
    expect(cookieSetMock).toHaveBeenCalledTimes(2);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "auth login succeeded",
      expect.objectContaining({ event: "auth.login.succeeded", userId: "user-1" }),
    );
    expect(JSON.stringify(loggerInfoMock.mock.calls)).not.toContain("secret-value");
  });

  it("blocks an enrolled but unverified account after valid credentials without creating a session", async () => {
    userFindUniqueMock.mockResolvedValue(activeUser({ email_verified_at: null }));
    comparePasswordMock.mockResolvedValue(true);

    const response = await POST(loginRequest({ email: "owner@example.se", password: "secret-value" }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: "Verifiera din e-postadress innan du loggar in.",
      errorCode: "EMAIL_VERIFICATION_REQUIRED",
      requestId,
    });
    expect(signTokenMock).not.toHaveBeenCalled();
    expect(cookieSetMock).not.toHaveBeenCalled();
    expect(auditLogFindFirstMock).not.toHaveBeenCalled();
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "auth login requires email verification",
      expect.objectContaining({ event: "auth.login.email_verification_required", userId: "user-1" }),
    );
  });

  it("keeps pre-verification legacy accounts usable when they have no verification-token history", async () => {
    userFindUniqueMock.mockResolvedValue(activeUser({
      email_verified_at: null,
      email_verification_tokens: [],
    }));
    comparePasswordMock.mockResolvedValue(true);

    const response = await POST(loginRequest({ email: "owner@example.se", password: "secret-value" }));

    expect(response.status).toBe(200);
    expect(signTokenMock).toHaveBeenCalledTimes(1);
    expect(cookieSetMock).toHaveBeenCalledTimes(2);
  });

  it("allows a verified account even when verification-token history remains for auditability", async () => {
    userFindUniqueMock.mockResolvedValue(activeUser());
    comparePasswordMock.mockResolvedValue(true);

    const response = await POST(loginRequest({ email: "owner@example.se", password: "secret-value" }));

    expect(response.status).toBe(200);
    expect(signTokenMock).toHaveBeenCalledTimes(1);
  });

  it("does not reveal verification state when the password is wrong", async () => {
    userFindUniqueMock.mockResolvedValue(activeUser({ email_verified_at: null }));
    comparePasswordMock.mockResolvedValue(false);

    const response = await POST(loginRequest({ email: "owner@example.se", password: "wrong-password" }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.errorCode).toBe("UNAUTHORIZED");
    expect(body.error).toBe("Ogiltiga uppgifter");
  });

  it("performs a password comparison for missing accounts to reduce timing enumeration", async () => {
    userFindUniqueMock.mockResolvedValue(null);
    comparePasswordMock.mockResolvedValue(false);

    const response = await POST(loginRequest({ email: "missing@example.se", password: "secret-value" }));

    expect(response.status).toBe(401);
    expect(comparePasswordMock).toHaveBeenCalledTimes(1);
    expect(comparePasswordMock).toHaveBeenCalledWith(
      "secret-value",
      expect.stringMatching(/^\$2a\$10\$/),
    );
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
