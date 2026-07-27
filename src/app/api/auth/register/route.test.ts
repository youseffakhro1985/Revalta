import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  userFindUniqueMock,
  companyCreateMock,
  tokenCreateMock,
  checkRateLimitMock,
  getClientIpMock,
  hashPasswordMock,
  createResetTokenMock,
  hashResetTokenMock,
  writeAuditLogMock,
  queueTicketNotificationMock,
  loggerInfoMock,
  loggerWarnMock,
  loggerErrorMock,
  createLoggerMock,
} = vi.hoisted(() => ({
  userFindUniqueMock: vi.fn(),
  companyCreateMock: vi.fn(),
  tokenCreateMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  getClientIpMock: vi.fn(),
  hashPasswordMock: vi.fn(),
  createResetTokenMock: vi.fn(),
  hashResetTokenMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  queueTicketNotificationMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  createLoggerMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: {
    user: { findUnique: userFindUniqueMock },
    company: { create: companyCreateMock },
    emailVerificationToken: { create: tokenCreateMock },
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
  getClientIp: getClientIpMock,
}));

vi.mock("@/lib/auth", () => ({
  hashPassword: hashPasswordMock,
  createResetToken: createResetTokenMock,
  hashResetToken: hashResetTokenMock,
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/integrations", () => ({ queueTicketNotification: queueTicketNotificationMock }));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { POST } from "./route";

const requestId = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const email = "owner@example.se";
const password = "StarktLösenord123!";
const ip = "192.0.2.10";

function request(body: Record<string, unknown>, headers: HeadersInit = {}) {
  return new Request("https://www.revalta.se/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": requestId, ...headers },
    body: JSON.stringify(body),
  });
}

function serializedLogCalls() {
  return JSON.stringify([
    ...loggerInfoMock.mock.calls,
    ...loggerWarnMock.mock.calls,
    ...loggerErrorMock.mock.calls,
  ]);
}

describe("registration route observability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    getClientIpMock.mockReturnValue(ip);
    checkRateLimitMock.mockResolvedValue({
      allowed: true,
      remaining: 4,
      resetAt: new Date(Date.now() + 60_000),
    });
    userFindUniqueMock.mockResolvedValue(null);
    hashPasswordMock.mockResolvedValue("hashed-password");
    createResetTokenMock.mockReturnValue("verification-token");
    hashResetTokenMock.mockReturnValue("hashed-verification-token");
    tokenCreateMock.mockResolvedValue({});
    writeAuditLogMock.mockResolvedValue(undefined);
    queueTicketNotificationMock.mockResolvedValue(undefined);
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
  });

  it("returns a correlated validation error without logging submitted identity data", async () => {
    const response = await POST(request({ email: "invalid", password, name: "Hemligt Namn" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      errorCode: "VALIDATION_FAILED",
      requestId,
    });
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0, must-revalidate");
    expect(serializedLogCalls()).not.toContain("invalid");
    expect(serializedLogCalls()).not.toContain(password);
    expect(serializedLogCalls()).not.toContain("Hemligt Namn");
    expect(serializedLogCalls()).not.toContain(ip);
  });

  it("returns a standardized rate-limit response with safe Retry-After", async () => {
    checkRateLimitMock.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 45_000),
    });

    const response = await POST(request({ email, password }));
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body).toMatchObject({ errorCode: "RATE_LIMITED", requestId });
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(response.headers.get("cdn-cache-control")).toBe("no-store");
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "registration rate limited",
      expect.objectContaining({ eventCode: "auth.register.rate_limited" }),
    );
    expect(serializedLogCalls()).not.toContain(ip);
  });

  it("returns a safe correlated internal error without exposing the database failure", async () => {
    userFindUniqueMock.mockRejectedValue(new Error("database credentials leaked@example.se"));

    const response = await POST(request({ email, password }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Internt serverfel",
      errorCode: "INTERNAL_ERROR",
      requestId,
    });
    expect(JSON.stringify(body)).not.toContain("database credentials");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "registration failed",
      expect.any(Error),
      expect.objectContaining({ eventCode: "auth.register.failed" }),
    );
  });

  it("creates the account and returns a cache-safe correlated success response", async () => {
    companyCreateMock.mockResolvedValue({
      id: "company-1",
      users: [{ id: "user-1", email, company_id: "company-1" }],
    });
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("EMAIL_PROVIDER_API_KEY", "configured");

    const response = await POST(request({
      email,
      password,
      name: "Ägare",
      companyName: "Fastighetsbolaget",
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({ success: true, requestId });
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("vercel-cdn-cache-control")).toBe("no-store");
    expect(tokenCreateMock).toHaveBeenCalledOnce();
    expect(writeAuditLogMock).toHaveBeenCalledOnce();
    expect(queueTicketNotificationMock).toHaveBeenCalledOnce();
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "registration succeeded",
      expect.objectContaining({
        eventCode: "auth.register.succeeded",
        companyId: "company-1",
        userId: "user-1",
      }),
    );
    expect(serializedLogCalls()).not.toContain(email);
    expect(serializedLogCalls()).not.toContain(password);
    expect(serializedLogCalls()).not.toContain("verification-token");
  });
});
