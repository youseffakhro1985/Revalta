import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  userFindFirstMock,
  userUpdateManyMock,
  userCountMock,
  executeRawMock,
  transactionMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  userFindFirstMock: vi.fn(),
  userUpdateManyMock: vi.fn(),
  userCountMock: vi.fn(),
  executeRawMock: vi.fn(),
  transactionMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));

vi.mock("@/lib/db", () => {
  const tx = {
    user: {
      findFirst: userFindFirstMock,
      updateMany: userUpdateManyMock,
      count: userCountMock,
    },
    $executeRaw: executeRawMock,
  };
  return {
    default: {
      user: tx.user,
      $executeRaw: executeRawMock,
      $transaction: (callback: (client: typeof tx) => unknown) => transactionMock(callback, tx),
    },
  };
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

const managerCaller = { id: "caller-1", company_id: "company-1", role: "admin" };

const updatedMember = {
  id: "target-user",
  name: "Medlem",
  email: "medlem@exempel.se",
  role: "manager",
  status: "active",
  created_at: new Date("2026-09-01T10:00:00.000Z"),
  _count: { assigned_tickets: 2 },
};

describe("PATCH /api/team/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executeRawMock.mockResolvedValue(1);
    transactionMock.mockImplementation(async (callback: (client: unknown) => unknown, client: unknown) => callback(client));
    writeAuditLogMock.mockResolvedValue(undefined);
    userUpdateManyMock.mockResolvedValue({ count: 1 });
    userCountMock.mockResolvedValue(1);
  });

  it("returns 401 when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const response = await PATCH(patchRequest({ status: "inactive" }), ctx());
    expect(response.status).toBe(401);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(userUpdateManyMock).not.toHaveBeenCalled();
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
    getCurrentUserMock.mockResolvedValue(managerCaller);
    const response = await PATCH(patchRequest({ status: "inactive" }), ctx("caller-1"));
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toContain("eget konto");
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the target does not belong to the caller's company", async () => {
    getCurrentUserMock.mockResolvedValue(managerCaller);
    userFindFirstMock.mockResolvedValueOnce(null);
    const response = await PATCH(patchRequest({ status: "inactive" }), ctx());
    const body = await response.json();
    expect(response.status).toBe(404);
    expect(body.error).toBe("Teammedlemmen hittades inte");
    expect(executeRawMock).toHaveBeenCalledTimes(1);
    expect(userFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "target-user", company_id: "company-1" } }));
    expect(userUpdateManyMock).not.toHaveBeenCalled();
  });

  it("returns 403 when a non-owner targets an existing owner", async () => {
    getCurrentUserMock.mockResolvedValue(managerCaller);
    userFindFirstMock.mockResolvedValueOnce({ id: "target-user", role: "owner", status: "active" });
    const response = await PATCH(patchRequest({ status: "inactive" }), ctx());
    const body = await response.json();
    expect(response.status).toBe(403);
    expect(body.error).toBe("Du saknar behörighet att ändra den här medlemmen");
    expect(userUpdateManyMock).not.toHaveBeenCalled();
  });

  it("returns 403 when a non-owner tries to promote a member to owner", async () => {
    getCurrentUserMock.mockResolvedValue(managerCaller);
    const response = await PATCH(patchRequest({ role: "owner" }), ctx());
    const body = await response.json();
    expect(response.status).toBe(403);
    expect(body.error).toBe("Du saknar behörighet att tilldela ägarrollen");
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a role not in the allowed set", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "caller-1", company_id: "company-1", role: "owner" });
    const response = await PATCH(patchRequest({ role: "superadmin" }), ctx());
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toBe("Ogiltig användarroll");
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 400 when no role or status is provided", async () => {
    getCurrentUserMock.mockResolvedValue(managerCaller);
    const response = await PATCH(patchRequest({}), ctx());
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toBe("Ingen ändring angiven");
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("blocks deactivating the last active owner after taking the company privilege lock", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "caller-1", company_id: "company-1", role: "owner" });
    userFindFirstMock.mockResolvedValueOnce({ id: "target-user", role: "owner", status: "active" });
    userCountMock.mockResolvedValueOnce(0);
    const response = await PATCH(patchRequest({ status: "inactive" }), ctx());
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toBe("Företaget måste ha minst en aktiv ägare");
    expect(executeRawMock).toHaveBeenCalledTimes(1);
    expect(executeRawMock.mock.invocationCallOrder[0]).toBeLessThan(userCountMock.mock.invocationCallOrder[0]);
    expect(userUpdateManyMock).not.toHaveBeenCalled();
  });

  it("blocks demoting the last active owner to a lower role", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "caller-1", company_id: "company-1", role: "owner" });
    userFindFirstMock.mockResolvedValueOnce({ id: "target-user", role: "owner", status: "active" });
    userCountMock.mockResolvedValueOnce(0);
    const response = await PATCH(patchRequest({ role: "admin" }), ctx());
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toBe("Företaget måste ha minst en aktiv ägare");
    expect(userUpdateManyMock).not.toHaveBeenCalled();
  });

  it("allows deactivating an owner when another active owner exists", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "caller-1", company_id: "company-1", role: "owner" });
    const inactiveOwner = { ...updatedMember, name: "Andra Ägaren", email: "andra@exempel.se", role: "owner", status: "inactive", _count: { assigned_tickets: 0 } };
    userFindFirstMock
      .mockResolvedValueOnce({ id: "target-user", role: "owner", status: "active" })
      .mockResolvedValueOnce(inactiveOwner);
    userCountMock.mockResolvedValueOnce(1);
    const response = await PATCH(patchRequest({ status: "inactive" }), ctx());
    expect(response.status).toBe(200);
    expect(userUpdateManyMock).toHaveBeenCalledWith({ where: { id: "target-user", company_id: "company-1" }, data: { status: "inactive" } });
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "team.member_status_changed" }), expect.anything());
  });

  it("returns 404 when the tenant-scoped update matches no row", async () => {
    getCurrentUserMock.mockResolvedValue(managerCaller);
    userFindFirstMock.mockResolvedValueOnce({ id: "target-user", role: "manager", status: "active" });
    userUpdateManyMock.mockResolvedValueOnce({ count: 0 });
    const response = await PATCH(patchRequest({ status: "inactive" }), ctx());
    const body = await response.json();
    expect(response.status).toBe(404);
    expect(body.error).toBe("Teammedlemmen hittades inte");
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("updates the role and writes the mandatory audit in the same transaction", async () => {
    getCurrentUserMock.mockResolvedValue(managerCaller);
    userFindFirstMock
      .mockResolvedValueOnce({ id: "target-user", role: "technician", status: "active" })
      .mockResolvedValueOnce(updatedMember);
    const response = await PATCH(patchRequest({ role: "manager" }), ctx());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, member: { ...updatedMember, created_at: updatedMember.created_at.toISOString() } });
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(userUpdateManyMock).toHaveBeenCalledWith({ where: { id: "target-user", company_id: "company-1" }, data: { role: "manager" } });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "caller-1", company_id: "company-1" }),
      expect.objectContaining({ entityType: "user", entityId: "target-user", action: "team.member_role_changed", metadata: { previousRole: "technician", role: "manager" } }),
      expect.objectContaining({ user: expect.anything(), $executeRaw: expect.anything() }),
    );
  });

  it("reactivates an inactive member atomically", async () => {
    getCurrentUserMock.mockResolvedValue(managerCaller);
    userFindFirstMock
      .mockResolvedValueOnce({ id: "target-user", role: "manager", status: "inactive" })
      .mockResolvedValueOnce(updatedMember);
    const response = await PATCH(patchRequest({ status: "active" }), ctx());
    expect(response.status).toBe(200);
    expect(userUpdateManyMock).toHaveBeenCalledWith({ where: { id: "target-user", company_id: "company-1" }, data: { status: "active" } });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "caller-1" }),
      expect.objectContaining({ action: "team.member_status_changed", metadata: { previousStatus: "inactive", status: "active" } }),
      expect.anything(),
    );
  });

  it("fails the request when mandatory audit persistence fails after the update", async () => {
    getCurrentUserMock.mockResolvedValue(managerCaller);
    userFindFirstMock
      .mockResolvedValueOnce({ id: "target-user", role: "technician", status: "active" })
      .mockResolvedValueOnce(updatedMember);
    writeAuditLogMock.mockRejectedValueOnce(new Error("audit unavailable"));
    const response = await PATCH(patchRequest({ role: "manager" }), ctx());
    expect(response.status).toBe(500);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(userUpdateManyMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything());
  });

  it("returns 409 if the row disappears after the scoped update so the transaction can roll back", async () => {
    getCurrentUserMock.mockResolvedValue(managerCaller);
    userFindFirstMock
      .mockResolvedValueOnce({ id: "target-user", role: "manager", status: "active" })
      .mockResolvedValueOnce(null);
    const response = await PATCH(patchRequest({ status: "inactive" }), ctx());
    const body = await response.json();
    expect(response.status).toBe(409);
    expect(body.error).toContain("ändrades samtidigt");
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("returns 500 when the database call fails", async () => {
    getCurrentUserMock.mockResolvedValue(managerCaller);
    userFindFirstMock.mockRejectedValueOnce(new Error("db down"));
    const response = await PATCH(patchRequest({ status: "inactive" }), ctx());
    expect(response.status).toBe(500);
  });
});
