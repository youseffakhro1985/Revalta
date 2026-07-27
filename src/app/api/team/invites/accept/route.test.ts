import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  findUniqueMock,
  userCreateMock,
  teamInviteUpdateMock,
  transactionMock,
  writeAuditLogMock,
  hashPasswordMock,
  hashResetTokenMock,
  signTokenMock,
  cookieSetMock,
  checkRateLimitMock,
} = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
  userCreateMock: vi.fn(),
  teamInviteUpdateMock: vi.fn(),
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
      findUnique: findUniqueMock,
      update: teamInviteUpdateMock,
    },
    user: { create: userCreateMock },
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

describe("team invite accept route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimitMock.mockResolvedValue({ allowed: true, remaining: 10, resetAt: new Date() });
    hashResetTokenMock.mockReturnValue("hashed-token");
    hashPasswordMock.mockResolvedValue("hashed-password");
    signTokenMock.mockResolvedValue("session-token");
    writeAuditLogMock.mockResolvedValue(undefined);
    findUniqueMock.mockResolvedValue(invite);
    transactionMock.mockImplementation(async (callback: (tx: {
      user: { create: typeof userCreateMock };
      teamInvite: { update: typeof teamInviteUpdateMock };
    }) => unknown) => callback({
      user: { create: userCreateMock },
      teamInvite: { update: teamInviteUpdateMock },
    }));
    userCreateMock.mockResolvedValue({
      id: "user-1",
      email: invite.email,
      name: invite.name,
      role: "resident",
      company_id: "company-1",
    });
    teamInviteUpdateMock.mockResolvedValue({ id: invite.id });
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
    findUniqueMock.mockResolvedValue({
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

  it("accepts an invite, sets a session cookie, and redirects residents to the portal", async () => {
    const response = await POST(
      new Request("https://www.revalta.se/api/team/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "raw-token",
          password: "Password123",
          name: "Boende Test",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      redirectTo: "/dashboard/boendeportal",
      user: { role: "resident", email: "boende@exempel.se" },
    });
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

  it("redirects staff invites to the dashboard", async () => {
    findUniqueMock.mockResolvedValue({
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

    const response = await POST(
      new Request("https://www.revalta.se/api/team/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "raw-token",
          password: "Password123",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.redirectTo).toBe("/dashboard");
  });
});
