import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  afterMock,
  checkRateLimitMock,
  createLoggerMock,
  createResetTokenMock,
  hashResetTokenMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  passwordResetTokenCreateMock,
  passwordResetTokenUpdateManyMock,
  scheduledAfterCallbacks,
  sendPasswordResetEmailMock,
  transactionMock,
  userFindUniqueMock,
} = vi.hoisted(() => ({
  afterMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  createLoggerMock: vi.fn(),
  createResetTokenMock: vi.fn(),
  hashResetTokenMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  passwordResetTokenCreateMock: vi.fn(),
  passwordResetTokenUpdateManyMock: vi.fn(),
  scheduledAfterCallbacks: [] as Array<() => void | Promise<void>>,
  sendPasswordResetEmailMock: vi.fn(),
  transactionMock: vi.fn(),
  userFindUniqueMock: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: afterMock };
});

vi.mock("@/lib/db", () => {
  const dbMock = {
    user: { findUnique: userFindUniqueMock },
    passwordResetToken: {
      create: passwordResetTokenCreateMock,
      updateMany: passwordResetTokenUpdateManyMock,
    },
    $transaction: transactionMock,
  };
  transactionMock.mockImplementation((callback: (tx: typeof dbMock) => unknown) => callback(dbMock));
  return { default: dbMock };
});

vi.mock("@/lib/auth", () => ({
  createResetToken: createResetTokenMock,
  hashResetToken: hashResetTokenMock,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
  getClientIp: vi.fn(() => "203.0.113.10"),
}));

vi.mock("@/lib/password-reset-email", () => ({
  sendPasswordResetEmail: sendPasswordResetEmailMock,
}));

vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { POST } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";

function resetRequest(body: unknown) {
  return new Request("https://www.revalta.se/api/auth/password-reset/request", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-request-id": requestId },
    body: JSON.stringify(body),
  });
}

const NEUTRAL_BODY = { message: "Om kontot finns skickar vi en återställningslänk." };
const LOOKUP_OPTIONS = { maxWait: 750, timeout: 1_500 };
const TOKEN_OPTIONS = { maxWait: 500, timeout: 1_000 };

async function runScheduledAfterCallbacks() {
  for (const callback of scheduledAfterCallbacks.splice(0)) {
    await callback();
  }
}

describe("POST /api/auth/password-reset/request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scheduledAfterCallbacks.length = 0;
    afterMock.mockImplementation((callback: () => void | Promise<void>) => {
      scheduledAfterCallbacks.push(callback);
    });
    checkRateLimitMock.mockResolvedValue({
      allowed: true,
      remaining: 5,
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
    hashResetTokenMock.mockReturnValue("reset-token-hash");
    userFindUniqueMock.mockResolvedValue(null);
    passwordResetTokenUpdateManyMock.mockResolvedValue({ count: 0 });
    passwordResetTokenCreateMock.mockResolvedValue({ id: "reset-token-1" });
    sendPasswordResetEmailMock.mockResolvedValue(undefined);
    transactionMock.mockImplementation(async (callback, _options) => callback({
      user: { findUnique: userFindUniqueMock },
      passwordResetToken: {
        create: passwordResetTokenCreateMock,
        updateMany: passwordResetTokenUpdateManyMock,
      },
    }));
  });

  it("issues a token synchronously but schedules email delivery after the neutral response", async () => {
    userFindUniqueMock.mockResolvedValue({
      id: "user-1",
      email: "owner@example.se",
      status: "active",
      company: { status: "active" },
    });

    const response = await POST(resetRequest({ email: "OWNER@example.se" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(NEUTRAL_BODY);
    expect(userFindUniqueMock).toHaveBeenCalledWith({
      where: { email: "owner@example.se" },
      select: { id: true, email: true, status: true, company: { select: { status: true } } },
    });
    expect(transactionMock.mock.calls[0]?.[1]).toEqual(LOOKUP_OPTIONS);
    expect(passwordResetTokenUpdateManyMock).toHaveBeenCalledWith({
      where: { user_id: "user-1", used_at: null },
      data: { used_at: expect.any(Date) },
    });
    expect(passwordResetTokenCreateMock).toHaveBeenCalledWith({
      data: {
        user_id: "user-1",
        token_hash: "reset-token-hash",
        expires_at: expect.any(Date),
      },
    });
    expect(transactionMock.mock.calls[1]?.[1]).toEqual(TOKEN_OPTIONS);
    expect(afterMock).toHaveBeenCalledTimes(1);
    expect(sendPasswordResetEmailMock).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");

    await runScheduledAfterCallbacks();
    expect(sendPasswordResetEmailMock).toHaveBeenCalledWith("owner@example.se", "a".repeat(64));
  });

  it("returns the neutral response without waiting for a slow email provider", async () => {
    userFindUniqueMock.mockResolvedValue({
      id: "user-1",
      email: "owner@example.se",
      status: "active",
      company: { status: "active" },
    });
    let resolveDelivery!: () => void;
    const slowDelivery = new Promise<void>((resolve) => {
      resolveDelivery = resolve;
    });
    sendPasswordResetEmailMock.mockReturnValue(slowDelivery);

    const response = await POST(resetRequest({ email: "owner@example.se" }));

    expect(response.status).toBe(200);
    expect(sendPasswordResetEmailMock).not.toHaveBeenCalled();
    const afterPromise = scheduledAfterCallbacks.shift()?.();
    expect(sendPasswordResetEmailMock).toHaveBeenCalledTimes(1);

    let settled = false;
    void Promise.resolve(afterPromise).then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);

    resolveDelivery();
    await afterPromise;
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "auth password reset delivery completed",
      expect.objectContaining({ event: "auth.password_reset.delivery_completed", userId: "user-1" }),
    );
  });

  it("returns the identical neutral response for a non-existent account with a bounded lookup transaction", async () => {
    userFindUniqueMock.mockResolvedValue(null);

    const response = await POST(resetRequest({ email: "missing@example.se" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(NEUTRAL_BODY);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(transactionMock.mock.calls[0]?.[1]).toEqual(LOOKUP_OPTIONS);
    expect(passwordResetTokenCreateMock).not.toHaveBeenCalled();
    expect(afterMock).not.toHaveBeenCalled();
    expect(sendPasswordResetEmailMock).not.toHaveBeenCalled();
  });

  it("fails closed to the neutral response when the bounded lookup cannot complete", async () => {
    transactionMock.mockRejectedValueOnce(new Error("lookup timed out"));

    const response = await POST(resetRequest({ email: "missing@example.se" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(NEUTRAL_BODY);
    expect(afterMock).not.toHaveBeenCalled();
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "auth password reset request failed",
      expect.any(Error),
      expect.objectContaining({ event: "auth.password_reset.request_failed" }),
    );
  });

  it("returns the same neutral response for an inactive user without issuing a token", async () => {
    userFindUniqueMock.mockResolvedValue({
      id: "user-2",
      email: "suspended@example.se",
      status: "suspended",
      company: { status: "active" },
    });

    const response = await POST(resetRequest({ email: "suspended@example.se" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(NEUTRAL_BODY);
    expect(passwordResetTokenCreateMock).not.toHaveBeenCalled();
    expect(afterMock).not.toHaveBeenCalled();
  });

  it("returns the same neutral response when the user's company is inactive", async () => {
    userFindUniqueMock.mockResolvedValue({
      id: "user-3",
      email: "owner@example.se",
      status: "active",
      company: { status: "suspended" },
    });

    const response = await POST(resetRequest({ email: "owner@example.se" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(NEUTRAL_BODY);
    expect(passwordResetTokenCreateMock).not.toHaveBeenCalled();
    expect(afterMock).not.toHaveBeenCalled();
  });

  it("returns the neutral response for a malformed email without querying the database", async () => {
    const response = await POST(resetRequest({ email: "not-an-email" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(NEUTRAL_BODY);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns the neutral response when the email field is missing", async () => {
    const response = await POST(resetRequest({}));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(NEUTRAL_BODY);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns the neutral response for a non-JSON request body", async () => {
    const response = await POST(new Request("https://www.revalta.se/api/auth/password-reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-request-id": requestId },
      body: "not json",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(NEUTRAL_BODY);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns the neutral response and skips lookup once the IP is rate limited", async () => {
    checkRateLimitMock.mockImplementation((key: string) => Promise.resolve({
      allowed: !key.startsWith("password-reset-request:ip:"),
      remaining: 0,
      resetAt: new Date(Date.now() + 60_000),
      source: "database",
    }));

    const response = await POST(resetRequest({ email: "owner@example.se" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(NEUTRAL_BODY);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns the neutral response and skips lookup once the account is rate limited", async () => {
    checkRateLimitMock.mockImplementation((key: string) => Promise.resolve({
      allowed: !key.startsWith("password-reset-request:account:"),
      remaining: 0,
      resetAt: new Date(Date.now() + 60_000),
      source: "database",
    }));

    const response = await POST(resetRequest({ email: "owner@example.se" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(NEUTRAL_BODY);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("invalidates the fresh token after a post-response delivery failure", async () => {
    userFindUniqueMock.mockResolvedValue({
      id: "user-1",
      email: "owner@example.se",
      status: "active",
      company: { status: "active" },
    });
    sendPasswordResetEmailMock.mockRejectedValue(new Error("provider unavailable with sensitive detail"));

    const response = await POST(resetRequest({ email: "owner@example.se" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(NEUTRAL_BODY);
    expect(passwordResetTokenUpdateManyMock).toHaveBeenCalledTimes(1);

    await runScheduledAfterCallbacks();

    expect(passwordResetTokenUpdateManyMock).toHaveBeenLastCalledWith({
      where: { token_hash: "reset-token-hash", used_at: null },
      data: { used_at: expect.any(Date) },
    });
    expect(transactionMock.mock.calls[2]?.[1]).toEqual(TOKEN_OPTIONS);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "auth password reset delivery failed",
      expect.objectContaining({ event: "auth.password_reset.delivery_failed", userId: "user-1" }),
    );
  });

  it("logs cleanup failure safely after the neutral response when delivery and invalidation both fail", async () => {
    userFindUniqueMock.mockResolvedValue({
      id: "user-1",
      email: "owner@example.se",
      status: "active",
      company: { status: "active" },
    });
    sendPasswordResetEmailMock.mockRejectedValue(new Error("provider unavailable"));
    transactionMock
      .mockImplementationOnce(async (callback) => callback({
        user: { findUnique: userFindUniqueMock },
        passwordResetToken: { create: passwordResetTokenCreateMock, updateMany: passwordResetTokenUpdateManyMock },
      }))
      .mockImplementationOnce(async (callback) => callback({
        user: { findUnique: userFindUniqueMock },
        passwordResetToken: { create: passwordResetTokenCreateMock, updateMany: passwordResetTokenUpdateManyMock },
      }))
      .mockRejectedValueOnce(new Error("cleanup database unavailable"));

    const response = await POST(resetRequest({ email: "owner@example.se" }));
    expect(response.status).toBe(200);

    await runScheduledAfterCallbacks();

    expect(loggerErrorMock).toHaveBeenCalledWith(
      "auth password reset token cleanup failed",
      expect.any(Error),
      expect.objectContaining({ event: "auth.password_reset.token_cleanup_failed", userId: "user-1" }),
    );
  });

  it("returns the neutral response and logs an error when token persistence fails unexpectedly", async () => {
    userFindUniqueMock.mockResolvedValue({
      id: "user-1",
      email: "owner@example.se",
      status: "active",
      company: { status: "active" },
    });
    transactionMock
      .mockImplementationOnce(async (callback) => callback({
        user: { findUnique: userFindUniqueMock },
        passwordResetToken: { create: passwordResetTokenCreateMock, updateMany: passwordResetTokenUpdateManyMock },
      }))
      .mockRejectedValueOnce(new Error("database connection contains sensitive detail"));

    const response = await POST(resetRequest({ email: "owner@example.se" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(NEUTRAL_BODY);
    expect(JSON.stringify(body)).not.toContain("database connection");
    expect(afterMock).not.toHaveBeenCalled();
    expect(sendPasswordResetEmailMock).not.toHaveBeenCalled();
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "auth password reset request failed",
      expect.any(Error),
      expect.objectContaining({ event: "auth.password_reset.request_failed" }),
    );
  });

  it("correlates the response with the inbound request id", async () => {
    const response = await POST(resetRequest({ email: "missing@example.se" }));

    expect(response.headers.get("x-request-id")).toBe(requestId);
  });
});
