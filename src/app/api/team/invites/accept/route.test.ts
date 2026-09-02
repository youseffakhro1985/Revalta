import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  teamInviteFindUniqueMock,
  userFindUniqueMock,
  userCreateMock,
  teamInviteUpdateManyMock,
  transactionMock,
  writeAuditLogMock,
  hashPasswordMock,
  hashResetTokenMock,
  signTokenMock,
  cookieSetMock,
  checkRateLimitMock,
} = vi.hoisted(() => ({
  teamInviteFindUniqueMock: vi.fn(),
  userFindUniqueMock: vi.fn(),
  userCreateMock: vi.fn(),
  teamInviteUpdateManyMock: vi.fn(),
  transactionMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  hashPasswordMock: vi.fn(),
  hashResetTokenMock: vi.fn(),
  signTokenMock: vi.fn(),
  cookieSetMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ set: cookieSetMock })),
}));

vi.mock("@/lib/db", () => ({
  default: {
    teamInvite: {
      findUnique: teamInviteFindUniqueMock,
      updateMany: teamInviteUpdateManyMock,
    },
    user: {
      findUnique: userFindUniqueMock,
      create: userCreateMock,
    },
    $transaction: transactionMock,
  },
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/auth", () => ({
  hashPassword: hashPasswordMock,
  hashResetToken: hashResetTokenMock,
  signToken: signTokenMock,
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
  getClientIp: () => "127.0.0.1",
}));
vi.mock("@/lib/security", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/security")>()),
  isStrongPassword: (value: string) => value.length >= 10,
}));

import { GET, POST } from "./route";
import { SESSION_COOKIE_NAME } from "@/lib/session-policy";

const invite = {
  id: "invite-1",
  company_id: "company-1",
  email: "boende@exempel.se",
  name: "Boende Test",
  role: "resident",
  expires_at: new Date(Date.now() + 60_000),
  accepted_at: null,
  company: { name: "Testfastigheter AB", status: "active" },
};

function acceptRequest(overrides: Record<string, unknown> = {}) {
  return new Request("https://www.revalta.se/api/team/invites/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: "raw-token",
      password: "Password123",
      name: "Boende Test",
      ...overrides,
    }),
  });
}

describe("team invite accept route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimitMock.mockResolvedValue({ allowed: true, remaining: 10, resetAt: new Date() });
    hashResetTokenMock.mockReturnValue("hashed-token");
    hashPasswordMock.mockResolvedValue("hashed-password");
    signTokenMock.mockResolvedValue("session-token");
    writeAuditLogMock.mockResolvedValue(undefined);
    teamInviteFindUniqueMock.mockResolvedValue(invite);
    userFindUniqueMock.mockResolvedValue(null);
    transactionMock.mockImplementation(async (callback: (tx: {
      user: { findUnique: typeof userFindUniqueMock; create: typeof userCreateMock };
      teamInvite: { updateMany: typeof teamInviteUpdateManyMock };
    }) => unknown) => callback({
      user: { findUnique: userFindUniqueMock, create: userCreateMock },
      teamInvite: { updateMany: teamInviteUpdateManyMock },
    }));
    userCreateMock.mockResolvedValue({
      id: "user-1",
      email: invite.email,
      name: invite.name,
      role: "resident",
      company_id: "company-1",
    });
    teamInviteUpdateManyMock.mockResolvedValue({ count: 1 });
  });

  it("previews a valid resident invite", async () => {
    const response = await GET(
      new Request("https://www.revalta.se/api/team/invites/accept?token=raw-token"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.invite).toEqual({
      email: "boende@exempel.se",
      name: "Boende Test",
      role: "resident",
      companyName: "Testfastigheter AB",
      redirectTo: "/dashboard/boendeportal",
    });
  });

  it("rejects expired invites on preview", async () => {
    teamInviteFindUniqueMock.mockResolvedValue({
      ...invite,
      expires_at: new Date(Date.now() - 1_000),
    });

    const response = await GET(
      new Request("https://www.revalta.se/api/team/invites/accept?token=raw-token"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Inbjudan är ogiltig eller har gått ut",
    });
  });

  it("accepts an invite atomically, writes the audit entry inside the transaction, sets a session cookie, and redirects residents to the portal", async () => {
    const response = await POST(acceptRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      redirectTo: "/dashboard/boendeportal",
      user: { role: "resident", email: "boende@exempel.se" },
    });
    expect(userFindUniqueMock).toHaveBeenCalledWith({
      where: { email: "boende@exempel.se" },
      select: { id: true },
    });
    expect(teamInviteUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: invite.id,
        accepted_at: null,
        expires_at: expect.objectContaining({ gte: expect.any(Date) }),
      }),
      data: { accepted_at: expect.any(Date) },
    }));
    expect(hashPasswordMock).toHaveBeenCalledWith("Password123");
    expect(userCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        email: invite.email,
        password: "hashed-password",
        company_id: "company-1",
        email_verified_at: expect.any(Date),
      }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1", company_id: "company-1" }),
      expect.objectContaining({ action: "team.invite_accepted", entityId: "user-1" }),
      expect.anything(),
    );
    expect(signTokenMock).toHaveBeenCalledWith(expect.objectContaining({
      sub: "user-1",
      email: "boende@exempel.se",
      passwordChangedAt: null,
    }));
    expect(cookieSetMock).toHaveBeenCalledWith(
      SESSION_COOKIE_NAME,
      "session-token",
      expect.any(Object),
    );
  });

  it("returns a conflict when another request already claimed the invite", async () => {
    teamInviteUpdateManyMock.mockResolvedValue({ count: 0 });

    const response = await POST(acceptRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe("Inbjudan har redan använts eller gått ut");
    expect(userCreateMock).not.toHaveBeenCalled();
    expect(signTokenMock).not.toHaveBeenCalled();
  });

  it("returns a conflict when the invited email already has an account", async () => {
    userFindUniqueMock.mockResolvedValue({ id: "existing-user" });

    const response = await POST(acceptRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("Det finns redan ett konto");
    expect(teamInviteUpdateManyMock).not.toHaveBeenCalled();
    expect(userCreateMock).not.toHaveBeenCalled();
  });

  it("rejects an overlong display name before hashing the password or mutating the invite", async () => {
    const response = await POST(acceptRequest({ name: "a".repeat(121) }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Namnet får vara högst 120 tecken");
    expect(hashPasswordMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("maps a concurrent unique-email violation to a safe conflict instead of a 500", async () => {
    userCreateMock.mockRejectedValue({ code: "P2002", meta: { target: ["email"] } });

    const response = await POST(acceptRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("Det finns redan ett konto");
    expect(signTokenMock).not.toHaveBeenCalled();
  });

  it("redirects staff invites to the dashboard", async () => {
    teamInviteFindUniqueMock.mockResolvedValue({
      ...invite,
      role: "technician",
      email: "tekniker@exempel.se",
    });
    userCreateMock.mockResolvedValue({
      id: "user-2",
      email: "tekniker@exempel.se",
      name: "Tekniker",
      role: "technician",
      company_id: "company-1",
    });

    const response = await POST(acceptRequest({ name: "Tekniker" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.redirectTo).toBe("/dashboard");
  });
});
