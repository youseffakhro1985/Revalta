import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  checkRateLimitMock,
  getClientIpMock,
  comparePasswordMock,
  hashPasswordMock,
  signTokenMock,
  userFindUniqueMock,
  userUpdateMock,
  passwordResetTokenUpdateManyMock,
  auditLogCreateMock,
  transactionMock,
  cookiesMock,
  cookieSetMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  getClientIpMock: vi.fn(),
  comparePasswordMock: vi.fn(),
  hashPasswordMock: vi.fn(),
  signTokenMock: vi.fn(),
  userFindUniqueMock: vi.fn(),
  userUpdateMock: vi.fn(),
  passwordResetTokenUpdateManyMock: vi.fn(),
  auditLogCreateMock: vi.fn(),
  transactionMock: vi.fn(),
  cookiesMock: vi.fn(),
  cookieSetMock: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: cookiesMock }));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/auth", () => ({
  comparePassword: comparePasswordMock,
  hashPassword: hashPasswordMock,
  signToken: signTokenMock,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
  getClientIp: getClientIpMock,
}));

vi.mock("@/lib/db", () => {
  const dbMock = {
    user: {
      findUnique: userFindUniqueMock,
      update: userUpdateMock,
    },
    passwordResetToken: {
      updateMany: passwordResetTokenUpdateManyMock,
    },
    auditLog: {
      create: auditLogCreateMock,
    },
    $transaction: transactionMock,
  };
  transactionMock.mockImplementation((callback: (tx: typeof dbMock) => unknown) => callback(dbMock));
  return { default: dbMock };
});

import { PATCH } from "./route";

const CURRENT_USER = { id: "user-1", company_id: "company-1", role: "owner" };
const STRONG_NEW_PASSWORD = "NewPassw0rd!";

function passwordRequest(body: unknown) {
  return new Request("https://www.revalta.se/api/settings/password", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/settings/password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getClientIpMock.mockReturnValue("203.0.113.10");
    checkRateLimitMock.mockResolvedValue({
      allowed: true,
      remaining: 4,
      resetAt: new Date(Date.now() + 60_000),
    });
    userFindUniqueMock.mockResolvedValue({
      id: CURRENT_USER.id,
      email: "owner@example.se",
      name: "Yousef",
      password: "old-hash",
      company_id: CURRENT_USER.company_id,
    });
    comparePasswordMock.mockResolvedValue(true);
    hashPasswordMock.mockResolvedValue("new-hash");
    userUpdateMock.mockResolvedValue({});
    passwordResetTokenUpdateManyMock.mockResolvedValue({ count: 0 });
    auditLogCreateMock.mockResolvedValue({ created_at: new Date("2026-08-13T10:00:00.000Z") });
    signTokenMock.mockResolvedValue("new-session-token");
    cookiesMock.mockResolvedValue({ set: cookieSetMock });
    getCurrentUserMock.mockResolvedValue(CURRENT_USER);
  });

  it("returns 401 when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const response = await PATCH(
      passwordRequest({
        currentPassword: "old-password-1",
        newPassword: STRONG_NEW_PASSWORD,
        confirmPassword: STRONG_NEW_PASSWORD,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBeTruthy();
    expect(userFindUniqueMock).not.toHaveBeenCalled();
    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  it("returns 400 when required fields are missing", async () => {
    const response = await PATCH(passwordRequest({}));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeTruthy();
    expect(userFindUniqueMock).not.toHaveBeenCalled();
    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a weak new password without touching the database", async () => {
    const response = await PATCH(
      passwordRequest({
        currentPassword: "old-password-1",
        newPassword: "weak",
        confirmPassword: "weak",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeTruthy();
    expect(userFindUniqueMock).not.toHaveBeenCalled();
    expect(userUpdateMock).not.toHaveBeenCalled();
    expect(hashPasswordMock).not.toHaveBeenCalled();
  });

  it("returns 400 when new password and confirmation do not match", async () => {
    const response = await PATCH(
      passwordRequest({
        currentPassword: "old-password-1",
        newPassword: STRONG_NEW_PASSWORD,
        confirmPassword: "SomethingElse123",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeTruthy();
    expect(userFindUniqueMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the new password equals the current password", async () => {
    const response = await PATCH(
      passwordRequest({
        currentPassword: STRONG_NEW_PASSWORD,
        newPassword: STRONG_NEW_PASSWORD,
        confirmPassword: STRONG_NEW_PASSWORD,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeTruthy();
    // Same-password check happens before comparing against the stored hash.
    expect(userFindUniqueMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the current password is wrong and does not write to the database", async () => {
    comparePasswordMock.mockResolvedValue(false);

    const response = await PATCH(
      passwordRequest({
        currentPassword: "wrong-password-1",
        newPassword: STRONG_NEW_PASSWORD,
        confirmPassword: STRONG_NEW_PASSWORD,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeTruthy();
    expect(comparePasswordMock).toHaveBeenCalledWith("wrong-password-1", "old-hash");
    expect(hashPasswordMock).not.toHaveBeenCalled();
    expect(userUpdateMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
    expect(signTokenMock).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limited and does not write to the database", async () => {
    checkRateLimitMock.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 60_000),
    });

    const response = await PATCH(
      passwordRequest({
        currentPassword: "old-password-1",
        newPassword: STRONG_NEW_PASSWORD,
        confirmPassword: STRONG_NEW_PASSWORD,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toBeTruthy();
    expect(response.headers.get("retry-after")).toBeTruthy();
    expect(userFindUniqueMock).not.toHaveBeenCalled();
  });

  it("changes the password, hashes the new value, scopes the update to the current user, and rotates the session", async () => {
    const response = await PATCH(
      passwordRequest({
        currentPassword: "old-password-1",
        newPassword: STRONG_NEW_PASSWORD,
        confirmPassword: STRONG_NEW_PASSWORD,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    // The plaintext current password is verified against the stored hash.
    expect(comparePasswordMock).toHaveBeenCalledWith("old-password-1", "old-hash");

    // The new password is hashed before persistence — never stored in plaintext.
    expect(hashPasswordMock).toHaveBeenCalledWith(STRONG_NEW_PASSWORD);

    // The update is scoped strictly to the current user's own id.
    expect(userUpdateMock).toHaveBeenCalledTimes(1);
    expect(userUpdateMock).toHaveBeenCalledWith({
      where: { id: CURRENT_USER.id },
      data: { password: "new-hash" },
    });

    const updateCall = userUpdateMock.mock.calls[0][0];
    expect(updateCall.data.password).not.toBe(STRONG_NEW_PASSWORD);
    expect(updateCall.where.id).toBe(CURRENT_USER.id);

    // Outstanding password reset tokens for this user are invalidated.
    expect(passwordResetTokenUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ user_id: CURRENT_USER.id, used_at: null }),
      }),
    );

    // An audit trail entry is written for the change, scoped to this user/company.
    expect(auditLogCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          company_id: CURRENT_USER.company_id,
          actor_user_id: CURRENT_USER.id,
          entity_id: CURRENT_USER.id,
          action: "user.password_changed",
        }),
      }),
    );

    // A fresh session token is issued and the old session cookie is superseded,
    // effectively invalidating the previous session on this response.
    expect(signTokenMock).toHaveBeenCalledWith(
      expect.objectContaining({ sub: CURRENT_USER.id }),
    );
    expect(cookieSetMock).toHaveBeenCalledTimes(2);
  });

  it("never updates another user's record even if payload manipulation is attempted", async () => {
    await PATCH(
      passwordRequest({
        currentPassword: "old-password-1",
        newPassword: STRONG_NEW_PASSWORD,
        confirmPassword: STRONG_NEW_PASSWORD,
        userId: "someone-elses-id",
        id: "someone-elses-id",
      }),
    );

    expect(userFindUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: CURRENT_USER.id } }),
    );
    expect(userUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: CURRENT_USER.id } }),
    );
  });

  it("returns 500 and does not leak internal details when the database throws", async () => {
    userFindUniqueMock.mockRejectedValue(new Error("connection string leaked-secret"));

    const response = await PATCH(
      passwordRequest({
        currentPassword: "old-password-1",
        newPassword: STRONG_NEW_PASSWORD,
        confirmPassword: STRONG_NEW_PASSWORD,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("leaked-secret");
  });
});
