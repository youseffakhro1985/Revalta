import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  transaction,
  findUnique,
  updateMany,
  updateUser,
  createMany,
  checkRateLimit,
  hashPassword,
  hashResetToken,
} = vi.hoisted(() => ({
  transaction: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  updateUser: vi.fn(),
  createMany: vi.fn(),
  checkRateLimit: vi.fn(),
  hashPassword: vi.fn(),
  hashResetToken: vi.fn(),
}));

const transactionClient = {
  passwordResetToken: { findUnique, updateMany },
  user: { update: updateUser },
  auditLog: { createMany },
};

vi.mock("@/lib/db", () => ({
  default: { $transaction: transaction },
}));

vi.mock("@/lib/auth", () => ({ hashPassword, hashResetToken }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit,
  getClientIp: vi.fn(() => "203.0.113.10"),
}));

import { POST } from "@/app/api/auth/password-reset/confirm/route";

describe("password reset session revocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 7,
      resetAt: new Date(Date.now() + 60_000),
    });
    hashPassword.mockResolvedValue("hashed-password");
    hashResetToken.mockReturnValue("hashed-token");
    findUnique.mockResolvedValue({
      id: "reset-1",
      user_id: "user-1",
      expires_at: new Date(Date.now() + 60_000),
      used_at: null,
      user: {
        id: "user-1",
        company_id: "company-1",
        status: "active",
        company: { status: "active" },
      },
    });
    updateMany.mockResolvedValue({ count: 1 });
    updateUser.mockResolvedValue({ id: "user-1" });
    createMany.mockResolvedValue({ count: 2 });
    transaction.mockImplementation((callback) => callback(transactionClient));
  });

  it("records a new password security version and a completion event atomically", async () => {
    const response = await POST(new Request("https://www.revalta.se/api/auth/password-reset/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "a".repeat(64),
        password: "Sakertlosenord123",
        confirmPassword: "Sakertlosenord123",
      }),
    }));

    expect(response.status).toBe(200);
    expect(createMany).toHaveBeenCalledOnce();
    expect(createMany.mock.calls[0][0].data.map((entry: { action: string }) => entry.action)).toEqual([
      "user.password_changed",
      "auth.password_reset_completed",
    ]);
    expect(createMany.mock.calls[0][0].data[0].metadata).toMatchObject({
      method: "reset_token",
      revokedSessions: true,
    });
  });
});
