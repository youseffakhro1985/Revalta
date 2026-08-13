import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  checkRateLimitMock,
  getClientIpMock,
  hashPasswordMock,
  hashResetTokenMock,
  passwordResetTokenFindUniqueMock,
  passwordResetTokenUpdateManyMock,
  userUpdateMock,
  auditLogCreateManyMock,
  transactionMock,
} = vi.hoisted(() => ({
  checkRateLimitMock: vi.fn(),
  getClientIpMock: vi.fn(),
  hashPasswordMock: vi.fn(),
  hashResetTokenMock: vi.fn(),
  passwordResetTokenFindUniqueMock: vi.fn(),
  passwordResetTokenUpdateManyMock: vi.fn(),
  userUpdateMock: vi.fn(),
  auditLogCreateManyMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  hashPassword: hashPasswordMock,
  hashResetToken: hashResetTokenMock,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
  getClientIp: getClientIpMock,
}));

vi.mock("@/lib/db", () => {
  const dbMock = {
    passwordResetToken: {
      findUnique: passwordResetTokenFindUniqueMock,
      updateMany: passwordResetTokenUpdateManyMock,
    },
    user: {
      update: userUpdateMock,
    },
    auditLog: {
      createMany: auditLogCreateManyMock,
    },
    $transaction: transactionMock,
  };
  transactionMock.mockImplementation((callback: (tx: typeof dbMock) => unknown) => callback(dbMock));
  return { default: dbMock };
});

import { POST } from "./route";

const RAW_TOKEN = "a".repeat(64);
const STRONG_PASSWORD = "NewPassw0rd!";

const VALID_RESET = {
  id: "reset-1",
  user_id: "user-1",
  expires_at: new Date(Date.now() + 60 * 60 * 1000),
  used_at: null,
  user: {
    id: "user-1",
    company_id: "company-1",
    status: "active",
    company: { status: "active" },
  },
};

function confirmRequest(body: unknown) {
  return new Request("https://www.revalta.se/api/auth/password-reset/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/password-reset/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getClientIpMock.mockReturnValue("203.0.113.10");
    checkRateLimitMock.mockResolvedValue({
      allowed: true,
      remaining: 7,
      resetAt: new Date(Date.now() + 60_000),
    });
    hashResetTokenMock.mockReturnValue("hashed-token");
    hashPasswordMock.mockResolvedValue("new-hash");
    passwordResetTokenFindUniqueMock.mockResolvedValue(VALID_RESET);
    passwordResetTokenUpdateManyMock.mockResolvedValue({ count: 1 });
    userUpdateMock.mockResolvedValue({});
    auditLogCreateManyMock.mockResolvedValue({ count: 2 });
    transactionMock.mockImplementation((callback: (tx: unknown) => unknown) => callback({
      passwordResetToken: {
        findUnique: passwordResetTokenFindUniqueMock,
        updateMany: passwordResetTokenUpdateManyMock,
      },
      user: { update: userUpdateMock },
      auditLog: { createMany: auditLogCreateManyMock },
    }));
  });

  it("returns 429 when rate limited and does not touch the database", async () => {
    checkRateLimitMock.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 60_000),
    });

    const response = await POST(
      confirmRequest({ token: RAW_TOKEN, password: STRONG_PASSWORD, confirmPassword: STRONG_PASSWORD }),
    );
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toBeTruthy();
    expect(response.headers.get("retry-after")).toBeTruthy();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the token is not the expected 64-character shape", async () => {
    const response = await POST(
      confirmRequest({ token: "too-short", password: STRONG_PASSWORD, confirmPassword: STRONG_PASSWORD }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeTruthy();
    expect(transactionMock).not.toHaveBeenCalled();
    expect(hashPasswordMock).not.toHaveBeenCalled();
  });

  it("returns 400 when password and confirmPassword do not match", async () => {
    const response = await POST(
      confirmRequest({ token: RAW_TOKEN, password: STRONG_PASSWORD, confirmPassword: "SomethingElse123" }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeTruthy();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a weak password without touching the database", async () => {
    const response = await POST(
      confirmRequest({ token: RAW_TOKEN, password: "weak", confirmPassword: "weak" }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeTruthy();
    expect(transactionMock).not.toHaveBeenCalled();
    expect(hashPasswordMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the token does not exist", async () => {
    passwordResetTokenFindUniqueMock.mockResolvedValue(null);

    const response = await POST(
      confirmRequest({ token: RAW_TOKEN, password: STRONG_PASSWORD, confirmPassword: STRONG_PASSWORD }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeTruthy();
    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the token has expired", async () => {
    passwordResetTokenFindUniqueMock.mockResolvedValue({
      ...VALID_RESET,
      expires_at: new Date(Date.now() - 1_000),
    });

    const response = await POST(
      confirmRequest({ token: RAW_TOKEN, password: STRONG_PASSWORD, confirmPassword: STRONG_PASSWORD }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeTruthy();
    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the token has already been used", async () => {
    passwordResetTokenFindUniqueMock.mockResolvedValue({
      ...VALID_RESET,
      used_at: new Date(Date.now() - 1_000),
    });

    const response = await POST(
      confirmRequest({ token: RAW_TOKEN, password: STRONG_PASSWORD, confirmPassword: STRONG_PASSWORD }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeTruthy();
    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the user account is not active", async () => {
    passwordResetTokenFindUniqueMock.mockResolvedValue({
      ...VALID_RESET,
      user: { ...VALID_RESET.user, status: "suspended" },
    });

    const response = await POST(
      confirmRequest({ token: RAW_TOKEN, password: STRONG_PASSWORD, confirmPassword: STRONG_PASSWORD }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeTruthy();
    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the company is not active", async () => {
    passwordResetTokenFindUniqueMock.mockResolvedValue({
      ...VALID_RESET,
      user: { ...VALID_RESET.user, company: { status: "suspended" } },
    });

    const response = await POST(
      confirmRequest({ token: RAW_TOKEN, password: STRONG_PASSWORD, confirmPassword: STRONG_PASSWORD }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeTruthy();
    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the compare-and-swap consume of the token loses a race", async () => {
    // Simulates a concurrent request having already flipped used_at between the
    // initial lookup and the atomic updateMany guard.
    passwordResetTokenUpdateManyMock.mockResolvedValue({ count: 0 });

    const response = await POST(
      confirmRequest({ token: RAW_TOKEN, password: STRONG_PASSWORD, confirmPassword: STRONG_PASSWORD }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeTruthy();
    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  it("resets the password on a valid token, hashes it, invalidates the token, and revokes other outstanding tokens", async () => {
    const response = await POST(
      confirmRequest({ token: RAW_TOKEN, password: STRONG_PASSWORD, confirmPassword: STRONG_PASSWORD }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    // The raw token is hashed before being looked up — the raw value is never queried directly.
    expect(hashResetTokenMock).toHaveBeenCalledWith(RAW_TOKEN);
    expect(passwordResetTokenFindUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { token_hash: "hashed-token" } }),
    );

    // The new password is hashed before persistence — never stored in plaintext.
    expect(hashPasswordMock).toHaveBeenCalledWith(STRONG_PASSWORD);
    expect(userUpdateMock).toHaveBeenCalledWith({
      where: { id: VALID_RESET.user_id },
      data: { password: "new-hash" },
    });
    const updateCall = userUpdateMock.mock.calls[0][0];
    expect(updateCall.data.password).not.toBe(STRONG_PASSWORD);

    // The consumed token is atomically marked used (single-use, compare-and-swap style).
    expect(passwordResetTokenUpdateManyMock).toHaveBeenCalledWith({
      where: { id: VALID_RESET.id, used_at: null, expires_at: { gt: expect.any(Date) } },
      data: { used_at: expect.any(Date) },
    });

    // Any other outstanding reset tokens for this user are also invalidated.
    expect(passwordResetTokenUpdateManyMock).toHaveBeenCalledWith({
      where: { user_id: VALID_RESET.user_id, used_at: null },
      data: { used_at: expect.any(Date) },
    });

    // An audit trail is written, scoped to the user's company.
    expect(auditLogCreateManyMock).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          company_id: VALID_RESET.user.company_id,
          actor_user_id: VALID_RESET.user.id,
          action: "user.password_changed",
        }),
        expect.objectContaining({
          company_id: VALID_RESET.user.company_id,
          actor_user_id: VALID_RESET.user.id,
          action: "auth.password_reset_completed",
        }),
      ]),
    });
  });

  it("returns 500 and does not leak internal details when the database throws", async () => {
    passwordResetTokenFindUniqueMock.mockRejectedValue(new Error("connection string leaked-secret"));

    const response = await POST(
      confirmRequest({ token: RAW_TOKEN, password: STRONG_PASSWORD, confirmPassword: STRONG_PASSWORD }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("leaked-secret");
  });
});
