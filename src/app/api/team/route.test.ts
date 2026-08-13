import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  userFindManyMock,
  userFindUniqueMock,
  userCreateMock,
  transactionMock,
  writeAuditLogMock,
  hashPasswordMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  userFindManyMock: vi.fn(),
  userFindUniqueMock: vi.fn(),
  userCreateMock: vi.fn(),
  transactionMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  hashPasswordMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: writeAuditLogMock,
}));

vi.mock("@/lib/auth", () => ({
  hashPassword: hashPasswordMock,
}));

vi.mock("@/lib/db", () => {
  const dbMock = {
    user: {
      findMany: userFindManyMock,
      findUnique: userFindUniqueMock,
      create: userCreateMock,
    },
    $transaction: transactionMock,
  };
  transactionMock.mockImplementation((callback: (tx: typeof dbMock) => unknown) => callback(dbMock));
  return { default: dbMock };
});

import { GET, POST } from "./route";

function postRequest(body: unknown) {
  return new Request("https://www.revalta.se/api/team", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validPayload = {
  name: "Ny Medlem",
  email: "ny.medlem@exempel.se",
  role: "manager",
  password: "StarktLosen123",
};

describe("team route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeAuditLogMock.mockResolvedValue(undefined);
    hashPasswordMock.mockResolvedValue("hashed-password");
    userFindUniqueMock.mockResolvedValue(null);
    userFindManyMock.mockResolvedValue([]);
  });

  describe("GET", () => {
    it("returns 401 when unauthenticated", async () => {
      getCurrentUserMock.mockResolvedValue(null);

      const response = await GET();

      expect(response.status).toBe(401);
      expect(userFindManyMock).not.toHaveBeenCalled();
    });

    it("returns the full roster with emails for a manager-and-above role, scoped to the caller's company", async () => {
      getCurrentUserMock.mockResolvedValue({
        id: "user-1",
        company_id: "company-1",
        role: "owner",
        company: { name: "Testfastigheter AB" },
      });
      const createdAt = new Date();
      const members = [
        { id: "user-1", name: "Ägare", email: "agare@exempel.se", role: "owner", status: "active", created_at: createdAt, _count: { assigned_tickets: 0 } },
      ];
      userFindManyMock.mockResolvedValue(members);

      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(userFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { company_id: "company-1" },
        }),
      );
      expect(body.members).toEqual([{ ...members[0], created_at: createdAt.toISOString() }]);
      expect(body.canManage).toBe(true);
      expect(body.permissions).toEqual({ canManage: true, canSeeEmails: true });
    });

    it("scopes the full roster query to the caller's own company_id, not any other company", async () => {
      getCurrentUserMock.mockResolvedValue({
        id: "user-9",
        company_id: "company-A",
        role: "admin",
        company: { name: "A AB" },
      });
      userFindManyMock.mockResolvedValue([]);

      await GET();

      const whereArg = userFindManyMock.mock.calls[0][0].where;
      expect(whereArg).toEqual({ company_id: "company-A" });
      expect(whereArg.company_id).not.toBe("company-B");
    });

    it("returns a limited roster without emails for a technician (no full-roster permission)", async () => {
      getCurrentUserMock.mockResolvedValue({
        id: "user-2",
        company_id: "company-1",
        role: "technician",
        company: { name: "Testfastigheter AB" },
      });
      const limitedMembers = [
        { id: "user-1", name: "Ägare", role: "owner", status: "active" },
      ];
      userFindManyMock.mockResolvedValue(limitedMembers);

      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(userFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { company_id: "company-1", status: "active", role: { not: "resident" } },
          select: { id: true, name: true, role: true, status: true },
        }),
      );
      expect(body.members).toEqual(limitedMembers);
      expect(body.canManage).toBe(false);
      expect(body.permissions).toEqual({ canManage: false, canSeeEmails: false });
      // Ensure the limited-view select does not leak email addresses.
      expect(userFindManyMock.mock.calls[0][0].select.email).toBeUndefined();
    });

    it("returns a limited roster without emails for a resident (no full-roster permission)", async () => {
      getCurrentUserMock.mockResolvedValue({
        id: "user-3",
        company_id: "company-1",
        role: "resident",
        company: { name: "Testfastigheter AB" },
      });
      userFindManyMock.mockResolvedValue([]);

      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.canManage).toBe(false);
      expect(body.permissions.canSeeEmails).toBe(false);
    });

    it("scopes to self only when the caller has no company_id", async () => {
      getCurrentUserMock.mockResolvedValue({
        id: "user-orphan",
        company_id: null,
        role: "technician",
        company: null,
      });
      userFindManyMock.mockResolvedValue([]);

      await GET();

      expect(userFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "user-orphan" } }),
      );
    });

    it("returns 500 when the database call fails", async () => {
      getCurrentUserMock.mockResolvedValue({
        id: "user-1",
        company_id: "company-1",
        role: "owner",
        company: { name: "Testfastigheter AB" },
      });
      userFindManyMock.mockRejectedValue(new Error("db down"));

      const response = await GET();

      expect(response.status).toBe(500);
    });
  });

  describe("POST", () => {
    it("returns 401 when unauthenticated", async () => {
      getCurrentUserMock.mockResolvedValue(null);

      const response = await POST(postRequest(validPayload));

      expect(response.status).toBe(401);
      expect(userCreateMock).not.toHaveBeenCalled();
    });

    it("returns 403 for a role that cannot manage the team (e.g. manager)", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "manager" });

      const response = await POST(postRequest(validPayload));
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.error).toBe("Du saknar behörighet att lägga till teammedlemmar");
      expect(userCreateMock).not.toHaveBeenCalled();
    });

    it("returns 403 for a technician", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "technician" });

      const response = await POST(postRequest(validPayload));

      expect(response.status).toBe(403);
      expect(userCreateMock).not.toHaveBeenCalled();
    });

    it("returns 403 when the caller has no company_id, even if role is owner", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: null, role: "owner" });

      const response = await POST(postRequest(validPayload));

      expect(response.status).toBe(403);
      expect(userCreateMock).not.toHaveBeenCalled();
    });

    it("returns 400 for an invalid email", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });

      const response = await POST(postRequest({ ...validPayload, email: "not-an-email" }));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe("En giltig e-postadress krävs");
      expect(userCreateMock).not.toHaveBeenCalled();
    });

    it("returns 400 when the name exceeds 120 characters", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });

      const response = await POST(postRequest({ ...validPayload, name: "a".repeat(121) }));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe("Namnet får vara högst 120 tecken");
      expect(userCreateMock).not.toHaveBeenCalled();
    });

    it("returns 400 for a role not in the allowed set", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });

      const response = await POST(postRequest({ ...validPayload, role: "superadmin" }));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe("Ogiltig användarroll");
      expect(userCreateMock).not.toHaveBeenCalled();
    });

    it("returns 403 when an admin tries to grant the owner role", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "admin" });

      const response = await POST(postRequest({ ...validPayload, role: "owner" }));
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.error).toBe("Du saknar behörighet att tilldela ägarrollen");
      expect(userCreateMock).not.toHaveBeenCalled();
    });

    it("allows an owner to grant the owner role", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
      userCreateMock.mockResolvedValue({
        id: "user-new",
        name: validPayload.name,
        email: validPayload.email,
        role: "owner",
        status: "active",
        created_at: new Date(),
        _count: { assigned_tickets: 0 },
      });

      const response = await POST(postRequest({ ...validPayload, role: "owner" }));

      expect(response.status).toBe(201);
      expect(userCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ role: "owner" }) }),
      );
    });

    it("returns 400 for a weak password", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });

      const response = await POST(postRequest({ ...validPayload, password: "short" }));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toContain("Lösenordet");
      expect(userCreateMock).not.toHaveBeenCalled();
    });

    it("returns 400 when the email is already in use", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
      userFindUniqueMock.mockResolvedValue({ id: "existing-user" });

      const response = await POST(postRequest(validPayload));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe("E-postadressen används redan");
      expect(userCreateMock).not.toHaveBeenCalled();
    });

    it("creates the member scoped to the caller's own company_id and writes an audit log", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
      const createdAt = new Date();
      const created = {
        id: "user-new",
        name: validPayload.name,
        email: validPayload.email,
        role: validPayload.role,
        status: "active",
        created_at: createdAt,
        _count: { assigned_tickets: 0 },
      };
      userCreateMock.mockResolvedValue(created);

      const response = await POST(postRequest(validPayload));
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body).toEqual({ success: true, member: { ...created, created_at: createdAt.toISOString() } });
      expect(hashPasswordMock).toHaveBeenCalledWith(validPayload.password);
      expect(userCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: validPayload.email,
            company_id: "company-1",
            role: validPayload.role,
          }),
        }),
      );
      expect(writeAuditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: "user-1", company_id: "company-1" }),
        expect.objectContaining({
          entityType: "user",
          entityId: created.id,
          action: "team.member_created",
        }),
        expect.anything(),
      );
    });

    it("never uses a company_id supplied by the request body — always the caller's own", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
      userCreateMock.mockResolvedValue({
        id: "user-new",
        name: validPayload.name,
        email: validPayload.email,
        role: validPayload.role,
        status: "active",
        created_at: new Date(),
        _count: { assigned_tickets: 0 },
      });

      await POST(postRequest({ ...validPayload, company_id: "company-attacker" }));

      expect(userCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ company_id: "company-1" }) }),
      );
    });

    it("normalizes email casing/whitespace before checking uniqueness and creating", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
      userCreateMock.mockResolvedValue({
        id: "user-new",
        name: validPayload.name,
        email: "ny.medlem@exempel.se",
        role: validPayload.role,
        status: "active",
        created_at: new Date(),
        _count: { assigned_tickets: 0 },
      });

      await POST(postRequest({ ...validPayload, email: "  Ny.Medlem@Exempel.se  " }));

      expect(userFindUniqueMock).toHaveBeenCalledWith({ where: { email: "ny.medlem@exempel.se" } });
      expect(userCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ email: "ny.medlem@exempel.se" }) }),
      );
    });

    it("returns 500 when the database call fails", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
      userFindUniqueMock.mockRejectedValue(new Error("db down"));

      const response = await POST(postRequest(validPayload));

      expect(response.status).toBe(500);
    });
  });
});
