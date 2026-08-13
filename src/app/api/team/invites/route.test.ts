import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  teamInviteFindManyMock,
  teamInviteCreateMock,
  userFindUniqueMock,
  transactionMock,
  writeAuditLogMock,
  createResetTokenMock,
  hashResetTokenMock,
  queueTicketNotificationMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  teamInviteFindManyMock: vi.fn(),
  teamInviteCreateMock: vi.fn(),
  userFindUniqueMock: vi.fn(),
  transactionMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  createResetTokenMock: vi.fn(),
  hashResetTokenMock: vi.fn(),
  queueTicketNotificationMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: writeAuditLogMock,
}));

vi.mock("@/lib/auth", () => ({
  createResetToken: createResetTokenMock,
  hashResetToken: hashResetTokenMock,
}));

vi.mock("@/lib/integrations", () => ({
  queueTicketNotification: queueTicketNotificationMock,
}));

vi.mock("@/lib/db", () => {
  const dbMock = {
    teamInvite: {
      findMany: teamInviteFindManyMock,
      create: teamInviteCreateMock,
    },
    user: {
      findUnique: userFindUniqueMock,
    },
    $transaction: transactionMock,
  };
  transactionMock.mockImplementation((callback: (tx: typeof dbMock) => unknown) => callback(dbMock));
  return { default: dbMock };
});

import { GET, POST } from "./route";

function postRequest(body: unknown) {
  return new Request("https://www.revalta.se/api/team/invites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validPayload = {
  name: "Ny Medlem",
  email: "ny.medlem@exempel.se",
  role: "manager",
};

describe("team/invites route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeAuditLogMock.mockResolvedValue(undefined);
    userFindUniqueMock.mockResolvedValue(null);
    teamInviteFindManyMock.mockResolvedValue([]);
    createResetTokenMock.mockReturnValue("raw-invite-token");
    hashResetTokenMock.mockReturnValue("hashed-invite-token");
    queueTicketNotificationMock.mockResolvedValue(undefined);
  });

  describe("GET", () => {
    it("returns 401 when unauthenticated", async () => {
      getCurrentUserMock.mockResolvedValue(null);

      const response = await GET();

      expect(response.status).toBe(401);
      expect(teamInviteFindManyMock).not.toHaveBeenCalled();
    });

    it("returns 403 for a role that cannot manage the team (e.g. manager)", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "manager" });

      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.error).toBe("Du saknar behörighet att visa inbjudningar");
      expect(teamInviteFindManyMock).not.toHaveBeenCalled();
    });

    it("returns 403 when the caller has no company_id, even if role is owner", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: null, role: "owner" });

      const response = await GET();

      expect(response.status).toBe(403);
      expect(teamInviteFindManyMock).not.toHaveBeenCalled();
    });

    it("lists pending invites scoped to the caller's own company", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
      const invites = [
        {
          id: "invite-1",
          email: "kandidat@exempel.se",
          name: "Kandidat",
          role: "manager",
          expires_at: new Date(),
          accepted_at: null,
          created_at: new Date(),
          invited_by: { name: "Ägare", email: "agare@exempel.se" },
        },
      ];
      teamInviteFindManyMock.mockResolvedValue(invites);

      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.invites).toEqual(
        invites.map((invite) => ({
          ...invite,
          expires_at: invite.expires_at.toISOString(),
          created_at: invite.created_at.toISOString(),
        })),
      );
      expect(teamInviteFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { company_id: "company-1" } }),
      );
    });

    it("scopes the invites query to the caller's own company_id, not any other company", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "user-9", company_id: "company-A", role: "admin" });
      teamInviteFindManyMock.mockResolvedValue([]);

      await GET();

      const whereArg = teamInviteFindManyMock.mock.calls[0][0].where;
      expect(whereArg).toEqual({ company_id: "company-A" });
      expect(whereArg.company_id).not.toBe("company-B");
    });

    it("returns 500 when the database call fails", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
      teamInviteFindManyMock.mockRejectedValue(new Error("db down"));

      const response = await GET();

      expect(response.status).toBe(500);
    });
  });

  describe("POST", () => {
    it("returns 401 when unauthenticated", async () => {
      getCurrentUserMock.mockResolvedValue(null);

      const response = await POST(postRequest(validPayload));

      expect(response.status).toBe(401);
      expect(teamInviteCreateMock).not.toHaveBeenCalled();
    });

    it("returns 403 for a role that cannot manage the team (e.g. manager)", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "manager" });

      const response = await POST(postRequest(validPayload));
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.error).toBe("Du saknar behörighet att bjuda in teammedlemmar");
      expect(teamInviteCreateMock).not.toHaveBeenCalled();
    });

    it("returns 403 for a technician", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "technician" });

      const response = await POST(postRequest(validPayload));

      expect(response.status).toBe(403);
      expect(teamInviteCreateMock).not.toHaveBeenCalled();
    });

    it("returns 403 when the caller has no company_id, even if role is owner", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: null, role: "owner" });

      const response = await POST(postRequest(validPayload));

      expect(response.status).toBe(403);
      expect(teamInviteCreateMock).not.toHaveBeenCalled();
    });

    it("returns 400 for an invalid email", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });

      const response = await POST(postRequest({ ...validPayload, email: "not-an-email" }));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe("Giltig e-post krävs");
      expect(teamInviteCreateMock).not.toHaveBeenCalled();
    });

    it("returns 400 when the name exceeds 120 characters", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });

      const response = await POST(postRequest({ ...validPayload, name: "a".repeat(121) }));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe("Namnet får vara högst 120 tecken");
      expect(teamInviteCreateMock).not.toHaveBeenCalled();
    });

    it("returns 400 for a role not in the allowed set", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });

      const response = await POST(postRequest({ ...validPayload, role: "superadmin" }));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe("Ogiltig användarroll");
      expect(teamInviteCreateMock).not.toHaveBeenCalled();
    });

    // Key privilege-escalation check: the invite route's allowed-role set has no "owner" entry
    // at all (unlike /api/team, which uses canGrantTeamRole to let an owner-but-not-admin grant
    // "owner"). So inviting someone as "owner" is rejected for every caller, including an owner
    // themselves — it fails validation, not authorization.
    it("rejects an admin trying to invite someone as owner (role not in allowed invite set)", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "admin" });

      const response = await POST(postRequest({ ...validPayload, role: "owner" }));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe("Ogiltig användarroll");
      expect(teamInviteCreateMock).not.toHaveBeenCalled();
    });

    it("also rejects an owner trying to invite someone as owner (role not in allowed invite set)", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });

      const response = await POST(postRequest({ ...validPayload, role: "owner" }));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe("Ogiltig användarroll");
      expect(teamInviteCreateMock).not.toHaveBeenCalled();
    });

    it("returns 400 when a user with that email already exists", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
      userFindUniqueMock.mockResolvedValue({ id: "existing-user" });

      const response = await POST(postRequest(validPayload));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe("Det finns redan en användare med den e-postadressen");
      expect(teamInviteCreateMock).not.toHaveBeenCalled();
    });

    it("creates the invite scoped to the caller's own company_id, generates a hashed token with a 7-day expiry, sends a notification, and writes an audit log", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const created = {
        id: "invite-new",
        email: validPayload.email,
        name: validPayload.name,
        role: validPayload.role,
        expires_at: expiresAt,
      };
      teamInviteCreateMock.mockResolvedValue(created);

      const before = Date.now();
      const response = await POST(postRequest(validPayload));
      const after = Date.now();
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.invite).toEqual({ ...created, expires_at: expiresAt.toISOString() });

      expect(createResetTokenMock).toHaveBeenCalledTimes(1);
      expect(hashResetTokenMock).toHaveBeenCalledWith("raw-invite-token");

      expect(teamInviteCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            company_id: "company-1",
            invited_by_id: "user-1",
            email: validPayload.email,
            role: validPayload.role,
            token_hash: "hashed-invite-token",
          }),
        }),
      );
      const dataArg = teamInviteCreateMock.mock.calls[0][0].data;
      expect(dataArg.expires_at.getTime()).toBeGreaterThanOrEqual(before + 7 * 24 * 60 * 60 * 1000 - 1000);
      expect(dataArg.expires_at.getTime()).toBeLessThanOrEqual(after + 7 * 24 * 60 * 60 * 1000 + 1000);

      expect(queueTicketNotificationMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: "user-1" }),
        expect.objectContaining({ recipient: created.email, event: "updated" }),
      );

      expect(writeAuditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: "user-1" }),
        expect.objectContaining({
          entityType: "team_invite",
          entityId: created.id,
          action: "team.invite_created",
        }),
        expect.anything(),
      );
    });

    it("never uses a company_id supplied by the request body — always the caller's own", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
      teamInviteCreateMock.mockResolvedValue({
        id: "invite-new",
        email: validPayload.email,
        name: validPayload.name,
        role: validPayload.role,
        expires_at: new Date(),
      });

      await POST(postRequest({ ...validPayload, company_id: "company-attacker" }));

      expect(teamInviteCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ company_id: "company-1" }) }),
      );
    });

    it("normalizes email casing/whitespace before checking for an existing user and creating the invite", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
      teamInviteCreateMock.mockResolvedValue({
        id: "invite-new",
        email: "ny.medlem@exempel.se",
        name: validPayload.name,
        role: validPayload.role,
        expires_at: new Date(),
      });

      await POST(postRequest({ ...validPayload, email: "  Ny.Medlem@Exempel.se  " }));

      expect(userFindUniqueMock).toHaveBeenCalledWith({ where: { email: "ny.medlem@exempel.se" }, select: { id: true } });
      expect(teamInviteCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ email: "ny.medlem@exempel.se" }) }),
      );
    });

    it("does not expose the raw invite URL in production even without an email provider configured", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
      teamInviteCreateMock.mockResolvedValue({
        id: "invite-new",
        email: validPayload.email,
        name: validPayload.name,
        role: validPayload.role,
        expires_at: new Date(),
      });
      const originalEnv = process.env.NODE_ENV;
      const originalKey = process.env.EMAIL_PROVIDER_API_KEY;
      vi.stubEnv("NODE_ENV", "production");
      delete process.env.EMAIL_PROVIDER_API_KEY;

      try {
        const response = await POST(postRequest(validPayload));
        const body = await response.json();

        expect(body.inviteUrl).toBeUndefined();
      } finally {
        vi.stubEnv("NODE_ENV", originalEnv ?? "test");
        if (originalKey !== undefined) process.env.EMAIL_PROVIDER_API_KEY = originalKey;
      }
    });

    it("returns 500 when the database call fails", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
      userFindUniqueMock.mockRejectedValue(new Error("db down"));

      const response = await POST(postRequest(validPayload));

      expect(response.status).toBe(500);
    });
  });
});
