import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  afterMock,
  checkRateLimitMock,
  companyCreateMock,
  createLoggerMock,
  emailVerificationTokenCreateMock,
  hashPasswordMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  queueEmailVerificationMock,
  scheduledAfterCallbacks,
  userFindUniqueMock,
  writeAuditLogMock,
  transactionMock,
} = vi.hoisted(() => ({
  afterMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  companyCreateMock: vi.fn(),
  createLoggerMock: vi.fn(),
  emailVerificationTokenCreateMock: vi.fn(),
  hashPasswordMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  queueEmailVerificationMock: vi.fn(),
  scheduledAfterCallbacks: [] as Array<() => void | Promise<void>>,
  userFindUniqueMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: afterMock };
});
vi.mock("@/lib/db", () => ({
  default: {
    company: { create: companyCreateMock },
    emailVerificationToken: { create: emailVerificationTokenCreateMock },
    user: { findUnique: userFindUniqueMock },
    $transaction: transactionMock,
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

async function runScheduledAfterCallbacks() {
  for (const callback of scheduledAfterCallbacks.splice(0)) {
    await callback();
  }
}

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scheduledAfterCallbacks.length = 0;
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.revalta.se");
    vi.stubEnv("EMAIL_PROVIDER_API_KEY", "configured-provider-key");
    afterMock.mockImplementation((callback: () => void | Promise<void>) => {
      scheduledAfterCallbacks.push(callback);
    });
    checkRateLimitMock.mockResolvedValue({
      allowed: true,
      remaining: 4,
      resetAt: new Date(Date.now() + 60_000),
      source: "database",
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
    transactionMock.mockImplementation(async (callback) => callback({
      company: { create: companyCreateMock },
      emailVerificationToken: { create: emailVerificationTokenCreateMock },
      auditLog: { create: vi.fn() },
    }));
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
    expect(afterMock).not.toHaveBeenCalled();
  });

  it("returns a correlated rate-limit response without processing the account", async () => {
    checkRateLimitMock.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 60_000),
      source: "database",
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
    expect(afterMock).not.toHaveBeenCalled();
  });

  it("commits owner/token/audit before returning 201 and schedules canonical verification delivery", async () => {
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
      expect.anything(),
    );
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(transactionMock.mock.calls[0]?.[1]).toEqual({ maxWait: 1_500, timeout: 5_000 });
    expect(afterMock).toHaveBeenCalledTimes(1);
    expect(queueEmailVerificationMock).not.toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toContain("token");
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "auth registration succeeded",
      expect.objectContaining({
        event: "auth.registration.succeeded",
        companyId: "company-1",
        userId: "user-1",
        verificationDelivery: "scheduled",
      }),
    );

    await runScheduledAfterCallbacks();
    expect(queueEmailVerificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1" }),
      {
        recipient: "owner@example.se",
        verificationUrl: `https://www.revalta.se/verify-email?token=${"a".repeat(64)}`,
      },
    );
  });

  it("returns 201 without waiting for a slow verification provider", async () => {
    let resolveDelivery!: (value: { id: string }) => void;
    const slowDelivery = new Promise<{ id: string }>((resolve) => {
      resolveDelivery = resolve;
    });
    queueEmailVerificationMock.mockReturnValue(slowDelivery);

    const response = await POST(registrationRequest({
      name: "Test Owner",
      companyName: "Exempel AB",
      email: "owner@example.se",
      password: "securepass1",
    }));

    expect(response.status).toBe(201);
    expect(afterMock).toHaveBeenCalledTimes(1);
    expect(queueEmailVerificationMock).not.toHaveBeenCalled();

    const afterPromise = scheduledAfterCallbacks.shift()?.();
    expect(queueEmailVerificationMock).toHaveBeenCalledTimes(1);
    let settled = false;
    void Promise.resolve(afterPromise).then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);

    resolveDelivery({ id: "integration-event-1" });
    await afterPromise;
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "auth registration verification delivery completed",
      expect.objectContaining({ event: "auth.registration.verification_delivery_completed" }),
    );
  });

  it("keeps a successful registration response when post-response delivery persistence fails", async () => {
    queueEmailVerificationMock.mockRejectedValue(new Error("provider or event persistence failed"));

    const response = await POST(registrationRequest({
      companyName: "Exempel AB",
      email: "owner@example.se",
      password: "securepass1",
    }));

    expect(response.status).toBe(201);
    await runScheduledAfterCallbacks();
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "auth registration verification delivery failed",
      expect.any(Error),
      expect.objectContaining({
        event: "auth.registration.verification_delivery_failed",
        companyId: "company-1",
        userId: "user-1",
      }),
    );
  });

  it("returns a safe correlated error when account persistence fails", async () => {
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
    expect(afterMock).not.toHaveBeenCalled();
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "auth registration failed",
      expect.any(Error),
      expect.objectContaining({ event: "auth.registration.failed" }),
    );
  });
});
