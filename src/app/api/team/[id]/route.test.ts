import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  userFindFirstMock,
  userUpdateManyMock,
  userCountMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  userFindFirstMock: vi.fn(),
  userUpdateManyMock: vi.fn(),
  userCountMock: vi.fn(),
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
  };
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

const managerCaller = { id: "caller-1", company_id: "company-1", role: "admin" };

describe("PATCH /api/team/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeAuditLogMock.mockResolvedValue(undefined);
    userUpdateManyMock.mockResolvedValue({ count: 1 });
    userCountMock.mockResolvedValue(1);
  });

  it("returns 401 when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const response = await PATCH(patchRequest({ status: "inactive" }), ctx());

    expect(response.status).toBe(401);
    expect(userUpdateManyMock).not.toHaveBeenCalled();
  });

  it("returns 403 for a role that cannot manage the team", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "caller-1", company_id: "company-1", role: "manager" });

    const response = await PATCH(patchRequest({ status: "inactive" }), ctx());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Du saknar behörighet att hantera teammedlemmar");
    expect(userUpdateManyMock).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller has no company_id, even if role is owner", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "caller-1", company_id: null, role: "owner" });

    const response = await PATCH(patchRequest({ status: "inactive" }), ctx());

    expect(response.status).toBe(403);
    expect(userUpdateManyMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the caller targets their own account", async () => {
    getCurrentUserMock.mockResolvedValue(managerCaller);

    const response = await PATCH(patchRequest({ status: "inactive" }), ctx("caller-1"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("eget konto");
    expect(userFindFirstMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the target does not belong to the caller's company", async () => {
    getCurrentUserMock.mockResolvedValue(managerCaller);
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
    userFindFirstMock.mockResolvedValueOnce({ id: "target-user", role: "manager", status: "active" });

    const response = await PATCH(patchRequest({ role: "owner" }), ctx());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Du saknar behörighet att tilldela ägarrollen");
    expect(userUpdateManyMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a role not in the allowed set", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "caller-1", company_id: "company-1", role: "owner" });
    userFindFirstMock.mockResolvedValueOnce({ id: "target-user", role: "manager", status: "active" });

    const response = await PATCH(patchRequest({ role: "superadmin" }), ctx());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Ogiltig användarroll");
    expect(userUpdateManyMock).not.toHaveBeenCalled();
  });

  it("returns 400 when no role or status is provided", async () => {
    getCurrentUserMock.mockResolvedValue(managerCaller);
    userFindFirstMock.mockResolvedValueOnce({ id: "target-user", role: "manager", status: "active" });

    const response = await PATCH(patchRequest({}), ctx());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Ingen ändring angiven");
    expect(userUpdateManyMock).not.toHaveBeenCalled();
  });

  it("blocks deactivating the last active owner", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "caller-1", company_id: "company-1", role: "owner" });
    userFindFirstMock.mockResolvedValueOnce({ id: "target-user", role: "owner", status: "active" });
    userCountMock.mockResolvedValueOnce(0);

    const response = await PATCH(patchRequest({ status: "inactive" }), ctx());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Företaget måste ha minst en aktiv ägare");
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
    const updatedMember = {
      id: "target-user",
      name: "Andra Ägaren",
      email: "andra@exempel.se",
      role: "owner",
      status: "inactive",
      created_at: new Date(),
      _count: { assigned_tickets: 0 },
    };
    userFindFirstMock
      .mockResolvedValueOnce({ id: "target-user", role: "owner", status: "active" }) // initial tenant-scoped lookup
      .mockResolvedValueOnce(updatedMember) // internal findFirst inside updateOwnedByCompany
      .mockResolvedValueOnce(updatedMember); // final findFirst for the response shape
    userCountMock.mockResolvedValueOnce(1);

    const response = await PATCH(patchRequest({ status: "inactive" }), ctx());

    expect(response.status).toBe(200);
    expect(userUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "target-user", company_id: "company-1" },
      data: { status: "inactive" },
    });
  });

  it("returns 404 when the tenant-scoped update matches no row (race/cross-tenant)", async () => {
    getCurrentUserMock.mockResolvedValue(managerCaller);
    userFindFirstMock.mockResolvedValueOnce({ id: "target-user", role: "manager", status: "active" });
    userUpdateManyMock.mockResolvedValueOnce({ count: 0 });

    const response = await PATCH(patchRequest({ status: "inactive" }), ctx());
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Teammedlemmen hittades inte");
  });

  it("updates the role, scoped to the caller's company, and writes an audit log", async () => {
    getCurrentUserMock.mockResolvedValue(managerCaller);
    const updatedMember = {
      id: "target-user",
      name: "Medlem",
      email: "medlem@exempel.se",
      role: "manager",
      status: "active",
      created_at: new Date(),
      _count: { assigned_tickets: 2 },
    };
    userFindFirstMock
      .mockResolvedValueOnce({ id: "target-user", role: "technician", status: "active" })
      .mockResolvedValueOnce(updatedMember)
      .mockResolvedValueOnce(updatedMember);

    const response = await PATCH(patchRequest({ role: "manager" }), ctx());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      member: { ...updatedMember, created_at: updatedMember.created_at.toISOString() },
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
    );
  });

  it("reactivates an inactive member", async () => {
    getCurrentUserMock.mockResolvedValue(managerCaller);
    const updatedMember = {
      id: "target-user",
      name: "Medlem",
      email: "medlem@exempel.se",
      role: "manager",
      status: "active",
      created_at: new Date(),
      _count: { assigned_tickets: 0 },
    };
    userFindFirstMock
      .mockResolvedValueOnce({ id: "target-user", role: "manager", status: "inactive" })
      .mockResolvedValueOnce(updatedMember)
      .mockResolvedValueOnce(updatedMember);

    const response = await PATCH(patchRequest({ status: "active" }), ctx());

    expect(response.status).toBe(200);
    expect(userUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "target-user", company_id: "company-1" },
      data: { status: "active" },
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "caller-1" }),
      expect.objectContaining({
        action: "team.member_status_changed",
        metadata: { previousStatus: "inactive", status: "active" },
      }),
    );
  });

  it("returns 500 when the database call fails", async () => {
    getCurrentUserMock.mockResolvedValue(managerCaller);
    userFindFirstMock.mockRejectedValueOnce(new Error("db down"));

    const response = await PATCH(patchRequest({ status: "inactive" }), ctx());

    expect(response.status).toBe(500);
  });
});
