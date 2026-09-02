import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  afterMock,
  checkRateLimitMock,
  createLoggerMock,
  createResetTokenMock,
  emailVerificationTokenCreateMock,
  emailVerificationTokenUpdateManyMock,
  hashResetTokenMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  queueEmailVerificationMock,
  scheduledAfterCallbacks,
  transactionMock,
  userFindUniqueMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  afterMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  createLoggerMock: vi.fn(),
  createResetTokenMock: vi.fn(),
  emailVerificationTokenCreateMock: vi.fn(),
  emailVerificationTokenUpdateManyMock: vi.fn(),
  hashResetTokenMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  queueEmailVerificationMock: vi.fn(),
  scheduledAfterCallbacks: [] as Array<() => void | Promise<void>>,
  transactionMock: vi.fn(),
  userFindUniqueMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: afterMock };
});

vi.mock("@/lib/db", () => ({
  default: {
    $transaction: transactionMock,
  },
}));
vi.mock("@/lib/auth", () => ({
  createResetToken: createResetTokenMock,
  hashResetToken: hashResetTokenMock,
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/integrations", () => ({ queueEmailVerification: queueEmailVerificationMock }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
  getClientIp: vi.fn(() => "203.0.113.10"),
}));
vi.mock("@/lib/app-url", () => ({ getPublicAppUrl: vi.fn(() => "https://www.revalta.se") }));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { POST } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";
const NEUTRAL_BODY = { message: "Om kontot behöver verifieras skickar vi en ny verifieringslänk." };

function resendRequest(body: unknown) {
  return new Request("https://www.revalta.se/api/auth/email-verification/resend", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-request-id": requestId },
    body: JSON.stringify(body),
  });
}

function enrolledUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "owner@example.se",
    company_id: "company-1",
    status: "active",
    email_verified_at: null,
    company: { status: "active" },
    email_verification_tokens: [{ id: "old-token" }],
    ...overrides,
  };
}

async function runScheduledAfterCallbacks() {
  for (const callback of scheduledAfterCallbacks.splice(0)) {
    await callback();
  }
}

describe("POST /api/auth/email-verification/resend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scheduledAfterCallbacks.length = 0;
    afterMock.mockImplementation((callback: () => void | Promise<void>) => {
      scheduledAfterCallbacks.push(callback);
    });
    checkRateLimitMock.mockResolvedValue({
      allowed: true,
      remaining: 2,
      resetAt: new Date(Date.now() + 60_000),
      source: "database",
    });
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    createResetTokenMock.mockReturnValue("a".repeat(64));
    hashResetTokenMock.mockReturnValue("verification-token-hash");
    userFindUniqueMock.mockResolvedValue(null);
    emailVerificationTokenUpdateManyMock.mockResolvedValue({ count: 1 });
    emailVerificationTokenCreateMock.mockResolvedValue({ id: "new-token" });
    writeAuditLogMock.mockResolvedValue(undefined);
    queueEmailVerificationMock.mockResolvedValue({ status: "sent" });
    transactionMock.mockImplementation(async (callback) => callback({
      user: { findUnique: userFindUniqueMock },
      emailVerificationToken: {
        create: emailVerificationTokenCreateMock,
        updateMany: emailVerificationTokenUpdateManyMock,
      },
    }));
  });

  it("returns a neutral response immediately and rotates the token in background for an enrolled account", async () => {
    userFindUniqueMock.mockResolvedValue(enrolledUser());

    const response = await POST(resendRequest({ email: "OWNER@example.se" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(NEUTRAL_BODY);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(afterMock).toHaveBeenCalledTimes(1);
    expect(transactionMock).not.toHaveBeenCalled();

    await runScheduledAfterCallbacks();

    expect(userFindUniqueMock).toHaveBeenCalledWith({
      where: { email: "owner@example.se" },
      select: {
        id: true,
        email: true,
        company_id: true,
        status: true,
        email_verified_at: true,
        company: { select: { status: true } },
        email_verification_tokens: { select: { id: true }, take: 1 },
      },
    });
    expect(emailVerificationTokenUpdateManyMock).toHaveBeenCalledWith({
      where: { user_id: "user-1", used_at: null },
      data: { used_at: expect.any(Date) },
    });
    expect(emailVerificationTokenCreateMock).toHaveBeenCalledWith({
      data: {
        user_id: "user-1",
        token_hash: "verification-token-hash",
        expires_at: expect.any(Date),
      },
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1", company_id: "company-1" }),
      expect.objectContaining({ action: "auth.email_verification_resent", entityId: "user-1" }),
      expect.any(Object),
    );
    expect(queueEmailVerificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1", company_id: "company-1" }),
      {
        recipient: "owner@example.se",
        verificationUrl: `https://www.revalta.se/verify-email?token=${"a".repeat(64)}`,
      },
    );
  });

  it("returns the identical neutral response for a missing account without creating a token", async () => {
    userFindUniqueMock.mockResolvedValue(null);

    const response = await POST(resendRequest({ email: "missing@example.se" }));
    expect(await response.json()).toEqual(NEUTRAL_BODY);

    await runScheduledAfterCallbacks();
    expect(emailVerificationTokenCreateMock).not.toHaveBeenCalled();
    expect(queueEmailVerificationMock).not.toHaveBeenCalled();
  });

  it("does not enroll legacy accounts that have no verification-token history", async () => {
    userFindUniqueMock.mockResolvedValue(enrolledUser({ email_verification_tokens: [] }));

    const response = await POST(resendRequest({ email: "owner@example.se" }));
    expect(await response.json()).toEqual(NEUTRAL_BODY);

    await runScheduledAfterCallbacks();
    expect(emailVerificationTokenCreateMock).not.toHaveBeenCalled();
    expect(queueEmailVerificationMock).not.toHaveBeenCalled();
  });

  it("does nothing for an already verified account while preserving the neutral contract", async () => {
    userFindUniqueMock.mockResolvedValue(enrolledUser({ email_verified_at: new Date() }));

    const response = await POST(resendRequest({ email: "owner@example.se" }));
    expect(await response.json()).toEqual(NEUTRAL_BODY);

    await runScheduledAfterCallbacks();
    expect(emailVerificationTokenCreateMock).not.toHaveBeenCalled();
    expect(queueEmailVerificationMock).not.toHaveBeenCalled();
  });

  it("does not schedule work for malformed input", async () => {
    const response = await POST(resendRequest({ email: "not-an-email" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(NEUTRAL_BODY);
    expect(afterMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("keeps the neutral response and skips lookup when rate limited", async () => {
    checkRateLimitMock.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 60_000),
      source: "database",
    });

    const response = await POST(resendRequest({ email: "owner@example.se" }));
    expect(await response.json()).toEqual(NEUTRAL_BODY);

    await runScheduledAfterCallbacks();
    expect(transactionMock).not.toHaveBeenCalled();
    expect(queueEmailVerificationMock).not.toHaveBeenCalled();
  });

  it("invalidates the fresh token when the email provider reports delivery failure", async () => {
    userFindUniqueMock.mockResolvedValue(enrolledUser());
    queueEmailVerificationMock.mockResolvedValue({ status: "failed" });

    const response = await POST(resendRequest({ email: "owner@example.se" }));
    expect(await response.json()).toEqual(NEUTRAL_BODY);

    await runScheduledAfterCallbacks();

    expect(emailVerificationTokenUpdateManyMock).toHaveBeenLastCalledWith({
      where: { token_hash: "verification-token-hash", used_at: null },
      data: { used_at: expect.any(Date) },
    });
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "auth email verification resend delivery failed",
      expect.objectContaining({ event: "auth.email_verification.resend_delivery_failed", userId: "user-1" }),
    );
  });

  it("fails closed after unexpected background errors without changing the public response", async () => {
    transactionMock.mockRejectedValueOnce(new Error("database unavailable with sensitive detail"));

    const response = await POST(resendRequest({ email: "owner@example.se" }));
    expect(await response.json()).toEqual(NEUTRAL_BODY);

    await runScheduledAfterCallbacks();
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "auth email verification resend background processing failed",
      expect.any(Error),
      expect.objectContaining({ event: "auth.email_verification.resend_background_failed" }),
    );
  });
});
