import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  checkRateLimitMock,
  companyCreateMock,
  createLoggerMock,
  emailVerificationTokenCreateMock,
  hashPasswordMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  queueEmailVerificationMock,
  userFindUniqueMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  checkRateLimitMock: vi.fn(),
  companyCreateMock: vi.fn(),
  createLoggerMock: vi.fn(),
  emailVerificationTokenCreateMock: vi.fn(),
  hashPasswordMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  queueEmailVerificationMock: vi.fn(),
  userFindUniqueMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: {
    company: { create: companyCreateMock },
    emailVerificationToken: { create: emailVerificationTokenCreateMock },
    user: { findUnique: userFindUniqueMock },
  },
}));
vi.mock("@/lib/auth", () => ({
  createResetToken: vi.fn(() => "a".repeat(64)),
  hashPassword: hashPasswordMock,
  hashResetToken: vi.fn(() => "verification-token-hash"),
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
  getClientIp: vi.fn(() => "203.0.113.10"),
}));
vi.mock("@/lib/integrations", () => ({ queueEmailVerification: queueEmailVerificationMock }));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { POST } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";

function registrationRequest(body: unknown) {
  return new Request("https://attacker.invalid/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-request-id": requestId },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.revalta.se");
    vi.stubEnv("EMAIL_PROVIDER_API_KEY", "configured-provider-key");
    checkRateLimitMock.mockResolvedValue({
      allowed: true,
      remaining: 4,
      resetAt: new Date(Date.now() + 60_000),
    });
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    userFindUniqueMock.mockResolvedValue(null);
    hashPasswordMock.mockResolvedValue("password-hash");
    companyCreateMock.mockResolvedValue({
      id: "company-1",
      users: [{ id: "user-1", email: "owner@example.se", company_id: "company-1" }],
    });
    emailVerificationTokenCreateMock.mockResolvedValue({ id: "verification-1" });
    writeAuditLogMock.mockResolvedValue(undefined);
    queueEmailVerificationMock.mockResolvedValue({ id: "integration-event-1" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects malformed registration data before creating records", async () => {
    const response = await POST(registrationRequest({ email: "invalid", password: "short" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: "En giltig e-postadress krävs",
      errorCode: "VALIDATION_FAILED",
      requestId,
    });
    expect(companyCreateMock).not.toHaveBeenCalled();
  });

  it("returns a correlated rate-limit response without processing the account", async () => {
    checkRateLimitMock.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 60_000),
    });

    const response = await POST(registrationRequest({
      companyName: "Exempel AB",
      email: "owner@example.se",
      password: "securepass1",
    }));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBeTruthy();
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(userFindUniqueMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "auth registration rate limited",
      expect.objectContaining({ event: "auth.registration.rate_limited" }),
    );
  });

  it("uses the conflict contract for an existing account", async () => {
    userFindUniqueMock.mockResolvedValue({ id: "existing-user" });

    const response = await POST(registrationRequest({
      companyName: "Exempel AB",
      email: "owner@example.se",
      password: "securepass1",
    }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.errorCode).toBe("CONFLICT");
    expect(companyCreateMock).not.toHaveBeenCalled();
  });

  it("creates the owner, audit trail and canonical one-time verification delivery", async () => {
    const response = await POST(registrationRequest({
      name: "  Test Owner  ",
      companyName: "  Exempel AB  ",
      email: "OWNER@EXAMPLE.SE",
      password: "securepass1",
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({ success: true });
    expect(companyCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        name: "Exempel AB",
        users: { create: expect.objectContaining({ email: "owner@example.se", name: "Test Owner", role: "owner" }) },
      }),
    }));
    expect(emailVerificationTokenCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ user_id: "user-1", token_hash: "verification-token-hash" }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1", company_id: "company-1" }),
      expect.objectContaining({ action: "company.created", entityId: "company-1" }),
    );
    expect(queueEmailVerificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1" }),
      {
        recipient: "owner@example.se",
        verificationUrl: `https://www.revalta.se/verify-email?token=${"a".repeat(64)}`,
      },
    );
    expect(JSON.stringify(body)).not.toContain("token");
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "auth registration succeeded",
      expect.objectContaining({ event: "auth.registration.succeeded", companyId: "company-1", userId: "user-1" }),
    );
  });

  it("returns a safe correlated error when persistence fails", async () => {
    companyCreateMock.mockRejectedValue(new Error("database connection contains sensitive detail"));

    const response = await POST(registrationRequest({
      companyName: "Exempel AB",
      email: "owner@example.se",
      password: "securepass1",
    }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Internt serverfel",
      errorCode: "INTERNAL_ERROR",
      requestId,
    });
    expect(JSON.stringify(body)).not.toContain("database connection");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "auth registration failed",
      expect.any(Error),
      expect.objectContaining({ event: "auth.registration.failed" }),
    );
  });
});
