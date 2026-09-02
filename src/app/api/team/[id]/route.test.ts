import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  userFindFirstMock,
  userUpdateManyMock,
  userCountMock,
  transactionMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  userFindFirstMock: vi.fn(),
  userUpdateManyMock: vi.fn(),
  userCountMock: vi.fn(),
  transactionMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: writeAuditLogMock,
}));

vi.mock("@/lib/db", () => {
  const dbMock = {
    user: {
      findFirst: userFindFirstMock,
      updateMany: userUpdateManyMock,
      count: userCountMock,
    },
    $transaction: transactionMock,
  };
  transactionMock.mockImplementation((callback: (tx: typeof dbMock) => unknown) => callback(dbMock));
  return { default: dbMock };
});

import { PATCH } from "./route";

function patchRequest(body: unknown) {
  return new Request("https://www.revalta.se/api/team/target-user", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function ctx(id = "target-user") {
  return { params: Promise.resolve({ id }) };
}

const adminCaller = { id: "caller-1", company_id: "company-1", role: "admin" };
const ownerCaller = { id: "caller-owner", company_id: "company-1", role: "owner" };

function updatedMember(overrides: Record<string, unknown> = {}) {
  return {
    id: "target-user",
    name: "Medlem",
    email: "medlem@exempel.se",
    role: "manager",
    status: "active",
    created_at: new Date(),
    _count: { assigned_tickets: 0 },
    ...overrides,
  };
}

describe("PATCH /api/team/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeAuditLogMock.mockResolvedValue(undefined);
    userUpdateManyMock.mockResolvedValue({ count: 1 });
    userCountMock.mockResolvedValue(1);
    transactionMock.mockImplementation((callback: (tx: {
      user: {
        findFirst: typeof userFindFirstMock;
        updateMany: typeof userUpdateManyMock;
        count: typeof userCountMock;
      };
    }) => unknown) => callback({
      user: {
        findFirst: userFindFirstMock,
        updateMany: userUpdateManyMock,
        count: userCountMock,
      },
    }));
  });

  it("returns 401 when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const response = await PATCH(patchRequest({ status: "inactive" }), ctx());

    expect(response.status).toBe(401);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 403 for a role that cannot manage the team", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "caller-1", company_id: "company-1", role: "manager" });

    const response = await PATCH(patchRequest({ status: "inactive" }), ctx());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Du saknar behörighet att hantera teammedlemmar");
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller has no company_id, even if role is owner", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "caller-1", company_id: null, role: "owner" });

    const response = await PATCH(patchRequest({ status: "inactive" }), ctx());

    expect(response.status).toBe(403);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the caller targets their own account", async () => {
    getCurrentUserMock.mockResolvedValue(adminCaller);

    const response = await PATCH(patchRequest({ status: "inactive" }), ctx("caller-1"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("eget konto");
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("validates the mutation before opening a transaction", async () => {
    getCurrentUserMock.mockResolvedValue(adminCaller);

    const emptyResponse = await PATCH(patchRequest({}), ctx());
    expect(emptyResponse.status).toBe(400);
    expect(await emptyResponse.json()).toEqual({ error: "Ingen ändring angiven" });

    const roleResponse = await PATCH(patchRequest({ role: "superadmin" }), ctx());
    expect(roleResponse.status).toBe(400);
    expect(await roleResponse.json()).toEqual({ error: "Ogiltig användarroll" });

    const statusResponse = await PATCH(patchRequest({ status: "deleted" }), ctx());
    expect(statusResponse.status).toBe(400);
    expect(await statusResponse.json()).toEqual({ error: "Ogiltig status" });

    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 403 when a non-owner tries to promote a member to owner before database work", async () => {
    getCurrentUserMock.mockResolvedValue(adminCaller);

    const response = await PATCH(patchRequest({ role: "owner" }), ctx());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Du saknar behörighet att tilldela ägarrollen");
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the target does not belong to the caller's company", async () => {
    getCurrentUserMock.mockResolvedValue(adminCaller);
    userFindFirstMock.mockResolvedValueOnce(null);

    const response = await PATCH(patchRequest({ status: "inactive" }), ctx());
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Teammedlemmen hittades inte");
    expect(userFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "target-user", company_id: "company-1" } }),
    );
    expect(userUpdateManyMock).not.toHaveBeenCalled();
  });

  it("returns 403 when a non-owner targets an existing owner", async () => {
    getCurrentUserMock.mockResolvedValue(adminCaller);
    userFindFirstMock.mockResolvedValueOnce({ id: "target-user", role: "owner", status: "active" });

    const response = await PATCH(patchRequest({ status: "inactive" }), ctx());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Du saknar behörighet att ändra den här medlemmen");
    expect(userUpdateManyMock).not.toHaveBeenCalled();
  });

  it("blocks deactivating the last active owner inside the serializable transaction", async () => {
    getCurrentUserMock.mockResolvedValue(ownerCaller);
    userFindFirstMock.mockResolvedValueOnce({ id: "target-user", role: "owner", status: "active" });
    userCountMock.mockResolvedValueOnce(0);

    const response = await PATCH(patchRequest({ status: "inactive" }), ctx());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Företaget måste ha minst en aktiv ägare");
    expect(userUpdateManyMock).not.toHaveBeenCalled();
    expect(transactionMock).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
  });

  it("blocks demoting the last active owner to a lower role", async () => {
    getCurrentUserMock.mockResolvedValue(ownerCaller);
    userFindFirstMock.mockResolvedValueOnce({ id: "target-user", role: "owner", status: "active" });
    userCountMock.mockResolvedValueOnce(0);

    const response = await PATCH(patchRequest({ role: "admin" }), ctx());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Företaget måste ha minst en aktiv ägare");
    expect(userUpdateManyMock).not.toHaveBeenCalled();
  });

  it("allows deactivating an owner when another active owner exists and audits in the same transaction", async () => {
    getCurrentUserMock.mockResolvedValue(ownerCaller);
    const member = updatedMember({
      name: "Andra Ägaren",
      email: "andra@exempel.se",
      role: "owner",
      status: "inactive",
    });
    userFindFirstMock
      .mockResolvedValueOnce({ id: "target-user", role: "owner", status: "active" })
      .mockResolvedValueOnce(member)
      .mockResolvedValueOnce(member);
    userCountMock.mockResolvedValueOnce(1);

    const response = await PATCH(patchRequest({ status: "inactive" }), ctx());

    expect(response.status).toBe(200);
    expect(userUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "target-user", company_id: "company-1" },
      data: { status: "inactive" },
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "caller-owner", company_id: "company-1" }),
      expect.objectContaining({
        action: "team.member_status_changed",
        metadata: { previousStatus: "active", status: "inactive" },
      }),
      expect.anything(),
    );
  });

  it("returns 404 when the tenant-scoped update matches no row", async () => {
    getCurrentUserMock.mockResolvedValue(adminCaller);
    userFindFirstMock.mockResolvedValueOnce({ id: "target-user", role: "manager", status: "active" });
    userUpdateManyMock.mockResolvedValueOnce({ count: 0 });

    const response = await PATCH(patchRequest({ status: "inactive" }), ctx());
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Teammedlemmen hittades inte");
  });

  it("updates a role tenant-scoped and returns the refreshed member", async () => {
    getCurrentUserMock.mockResolvedValue(adminCaller);
    const member = updatedMember({ role: "manager", _count: { assigned_tickets: 2 } });
    userFindFirstMock
      .mockResolvedValueOnce({ id: "target-user", role: "technician", status: "active" })
      .mockResolvedValueOnce(member)
      .mockResolvedValueOnce(member);

    const response = await PATCH(patchRequest({ role: "manager" }), ctx());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      member: { ...member, created_at: member.created_at.toISOString() },
    });
    expect(userUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "target-user", company_id: "company-1" },
      data: { role: "manager" },
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "caller-1", company_id: "company-1" }),
      expect.objectContaining({
        entityType: "user",
        entityId: "target-user",
        action: "team.member_role_changed",
        metadata: { previousRole: "technician", role: "manager" },
      }),
      expect.anything(),
    );
  });

  it("maps a serializable transaction conflict to a retryable 409", async () => {
    getCurrentUserMock.mockResolvedValue(ownerCaller);
    transactionMock.mockRejectedValueOnce({ code: "P2034" });

    const response = await PATCH(patchRequest({ status: "inactive" }), ctx());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("ändrades samtidigt");
  });

  it("returns 500 for an unexpected database failure", async () => {
    getCurrentUserMock.mockResolvedValue(adminCaller);
    transactionMock.mockRejectedValueOnce(new Error("db down"));

    const response = await PATCH(patchRequest({ status: "inactive" }), ctx());

    expect(response.status).toBe(500);
  });
});
