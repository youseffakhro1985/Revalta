import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  checkRateLimitMock,
  createLoggerMock,
  createResetTokenMock,
  hashResetTokenMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  passwordResetTokenCreateMock,
  passwordResetTokenUpdateManyMock,
  sendPasswordResetEmailMock,
  transactionMock,
  userFindUniqueMock,
} = vi.hoisted(() => ({
  checkRateLimitMock: vi.fn(),
  createLoggerMock: vi.fn(),
  createResetTokenMock: vi.fn(),
  hashResetTokenMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  passwordResetTokenCreateMock: vi.fn(),
  passwordResetTokenUpdateManyMock: vi.fn(),
  sendPasswordResetEmailMock: vi.fn(),
  transactionMock: vi.fn(),
  userFindUniqueMock: vi.fn(),
}));

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

describe("POST /api/auth/password-reset/request", () => {
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
    createResetTokenMock.mockReturnValue("a".repeat(64));
    hashResetTokenMock.mockReturnValue("reset-token-hash");
    userFindUniqueMock.mockResolvedValue(null);
    passwordResetTokenUpdateManyMock.mockResolvedValue({ count: 0 });
    passwordResetTokenCreateMock.mockResolvedValue({ id: "reset-token-1" });
    sendPasswordResetEmailMock.mockResolvedValue(undefined);
  });

  it("issues a token, persists it and emails it for a valid active account", async () => {
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
    expect(sendPasswordResetEmailMock).toHaveBeenCalledWith("owner@example.se", "a".repeat(64));
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("returns the identical neutral response for a non-existent account (no email enumeration)", async () => {
    userFindUniqueMock.mockResolvedValue(null);

    const response = await POST(resetRequest({ email: "missing@example.se" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(NEUTRAL_BODY);
    expect(passwordResetTokenCreateMock).not.toHaveBeenCalled();
    expect(sendPasswordResetEmailMock).not.toHaveBeenCalled();
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
  });

  it("returns the neutral response for a malformed email without querying the database", async () => {
    const response = await POST(resetRequest({ email: "not-an-email" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(NEUTRAL_BODY);
    expect(userFindUniqueMock).not.toHaveBeenCalled();
  });

  it("returns the neutral response when the email field is missing", async () => {
    const response = await POST(resetRequest({}));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(NEUTRAL_BODY);
    expect(userFindUniqueMock).not.toHaveBeenCalled();
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
    expect(userFindUniqueMock).not.toHaveBeenCalled();
  });

  it("returns the neutral response and skips lookup once the IP is rate limited", async () => {
    checkRateLimitMock.mockImplementation((key: string) => Promise.resolve({
      allowed: !key.startsWith("password-reset-request:ip:"),
      remaining: 0,
      resetAt: new Date(Date.now() + 60_000),
    }));

    const response = await POST(resetRequest({ email: "owner@example.se" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(NEUTRAL_BODY);
    expect(userFindUniqueMock).not.toHaveBeenCalled();
  });

  it("returns the neutral response and skips lookup once the account is rate limited", async () => {
    checkRateLimitMock.mockImplementation((key: string) => Promise.resolve({
      allowed: !key.startsWith("password-reset-request:account:"),
      remaining: 0,
      resetAt: new Date(Date.now() + 60_000),
    }));

    const response = await POST(resetRequest({ email: "owner@example.se" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(NEUTRAL_BODY);
    expect(userFindUniqueMock).not.toHaveBeenCalled();
  });

  it("invalidates the freshly created token and logs a warning when delivery fails", async () => {
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
    expect(passwordResetTokenUpdateManyMock).toHaveBeenLastCalledWith({
      where: { token_hash: "reset-token-hash", used_at: null },
      data: { used_at: expect.any(Date) },
    });
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "auth password reset delivery failed",
      expect.objectContaining({ event: "auth.password_reset.delivery_failed", userId: "user-1" }),
    );
  });

  it("returns the neutral response and logs an error when persistence fails unexpectedly", async () => {
    userFindUniqueMock.mockResolvedValue({
      id: "user-1",
      email: "owner@example.se",
      status: "active",
      company: { status: "active" },
    });
    transactionMock.mockRejectedValue(new Error("database connection contains sensitive detail"));

    const response = await POST(resetRequest({ email: "owner@example.se" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(NEUTRAL_BODY);
    expect(JSON.stringify(body)).not.toContain("database connection");
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
