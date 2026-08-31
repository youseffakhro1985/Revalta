import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createLoggerMock,
  loggerErrorMock,
  loggerInfoMock,
  transactionMock,
  tokenFindUniqueMock,
  tokenUpdateManyMock,
  userUpdateMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  createLoggerMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  transactionMock: vi.fn(),
  tokenFindUniqueMock: vi.fn(),
  tokenUpdateManyMock: vi.fn(),
  userUpdateMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: { $transaction: transactionMock },
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { POST } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";
const token = "a".repeat(64);
const tx = {
  emailVerificationToken: {
    findUnique: tokenFindUniqueMock,
    updateMany: tokenUpdateManyMock,
  },
  user: { update: userUpdateMock },
};

function verificationRequest(value: unknown) {
  return new Request("https://www.revalta.se/api/auth/email-verification/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-request-id": requestId },
    body: JSON.stringify({ token: value }),
  });
}

function validVerification() {
  return {
    id: "verification-1",
    user_id: "user-1",
    expires_at: new Date(Date.now() + 60_000),
    used_at: null,
    user: {
      id: "user-1",
      email: "owner@example.se",
      company_id: "company-1",
      status: "active",
      company: { status: "active" },
    },
  };
}

describe("POST /api/auth/email-verification/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: vi.fn(),
      error: loggerErrorMock,
    });
    transactionMock.mockImplementation(async (callback) => callback(tx));
    tokenUpdateManyMock.mockResolvedValue({ count: 1 });
    userUpdateMock.mockResolvedValue({ id: "user-1" });
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("rejects malformed tokens before touching the database", async () => {
    const response = await POST(verificationRequest("short"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: "Verifieringslänken är ogiltig eller har gått ut",
      errorCode: "VALIDATION_FAILED",
      requestId,
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("claims the one-time token, verifies the user and writes audit in the same transaction", async () => {
    tokenFindUniqueMock.mockResolvedValue(validVerification());

    const response = await POST(verificationRequest(token));

    expect(response.status).toBe(200);
    expect(tokenUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "verification-1", used_at: null }),
    }));
    expect(userUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "user-1" },
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1" }),
      expect.objectContaining({
        action: "auth.email_verified",
        metadata: { method: "one_time_token" },
      }),
      tx,
    );
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "auth email verification completed",
      expect.objectContaining({ userId: "user-1" }),
    );
  });

  it("rejects a token already claimed by a concurrent request", async () => {
    tokenFindUniqueMock.mockResolvedValue(validVerification());
    tokenUpdateManyMock.mockResolvedValue({ count: 0 });

    const response = await POST(verificationRequest(token));

    expect(response.status).toBe(400);
    expect(userUpdateMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("fail-closes the verification when audit fails inside the transaction", async () => {
    tokenFindUniqueMock.mockResolvedValue(validVerification());
    writeAuditLogMock.mockRejectedValue(new Error("audit-db-secret"));

    const response = await POST(verificationRequest(token));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Internt serverfel",
      errorCode: "INTERNAL_ERROR",
      requestId,
    });
    expect(JSON.stringify(body)).not.toContain("audit-db-secret");
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1" }),
      expect.anything(),
      tx,
    );
  });

  it("returns a safe correlated failure when persistence fails", async () => {
    transactionMock.mockRejectedValue(new Error("database details"));

    const response = await POST(verificationRequest(token));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Internt serverfel",
      errorCode: "INTERNAL_ERROR",
      requestId,
    });
    expect(JSON.stringify(body)).not.toContain("database details");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "auth email verification failed",
      expect.any(Error),
      expect.objectContaining({ event: "auth.email_verification.failed" }),
    );
  });
});
