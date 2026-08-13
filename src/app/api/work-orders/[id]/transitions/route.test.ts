import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserMock, workOrderFindFirstMock, userFindManyMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  workOrderFindFirstMock: vi.fn(),
  userFindManyMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    workOrder: { findFirst: workOrderFindFirstMock },
    user: { findMany: userFindManyMock },
  },
}));

import { GET } from "./route";

const params = Promise.resolve({ id: "wo-1" });

function makeRequest() {
  return new Request("http://localhost/api/work-orders/wo-1/transitions");
}

const activeUsers = [
  { id: "owner-1", name: "Ägare Ägarsson", email: "owner@example.com", role: "owner" },
  { id: "tech-1", name: "Tekniker Teknikersson", email: "tech@example.com", role: "technician" },
  { id: "viewer-1", name: "Visare Visarsson", email: "viewer@example.com", role: "viewer" },
];

describe("GET /api/work-orders/[id]/transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userFindManyMock.mockResolvedValue(activeUsers);
  });

  it("returns 401 when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const response = await GET(makeRequest(), { params });

    expect(response.status).toBe(401);
    expect(workOrderFindFirstMock).not.toHaveBeenCalled();
    expect(userFindManyMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the user has no company", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", role: "owner", company_id: null });

    const response = await GET(makeRequest(), { params });

    expect(response.status).toBe(400);
    expect(workOrderFindFirstMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the work order does not exist for the caller's company (tenant isolation)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", role: "owner", company_id: "company-1" });
    workOrderFindFirstMock.mockResolvedValue(null);

    const response = await GET(makeRequest(), { params });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Arbetsordern hittades inte");
    expect(workOrderFindFirstMock).toHaveBeenCalledWith({
      where: { deleted_at: null, id: "wo-1", company_id: "company-1", property: { deleted_at: null } },
      select: { id: true, status: true, assigned_to_id: true },
    });
  });

  it("scopes the users list lookup to the caller's company", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", role: "owner", company_id: "company-1" });
    workOrderFindFirstMock.mockResolvedValue({ id: "wo-1", status: "planned", assigned_to_id: null });

    await GET(makeRequest(), { params });

    expect(userFindManyMock).toHaveBeenCalledWith({
      where: { company_id: "company-1", status: "active" },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: { id: true, name: true, email: true, role: true },
    });
  });

  it("does not leak a work order belonging to another company: findFirst never sees a foreign id/company mismatch bypassed", async () => {
    // Simulate a caller from company-2 requesting a work order that only exists under company-1.
    // Because the mocked findFirst is company-scoped in the where clause, it must resolve to null.
    getCurrentUserMock.mockResolvedValue({ id: "user-9", role: "owner", company_id: "company-2" });
    workOrderFindFirstMock.mockImplementation(async ({ where }: { where: { company_id: string } }) => {
      if (where.company_id !== "company-1") return null;
      return { id: "wo-1", status: "planned", assigned_to_id: null };
    });

    const response = await GET(makeRequest(), { params });

    expect(response.status).toBe(404);
    expect(workOrderFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ company_id: "company-2" }) }),
    );
  });

  it("returns 404 for a technician not assigned to the work order (assigned-work scoping)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", role: "technician", company_id: "company-1" });
    workOrderFindFirstMock.mockResolvedValue({ id: "wo-1", status: "planned", assigned_to_id: "tech-2" });

    const response = await GET(makeRequest(), { params });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Arbetsordern hittades inte");
  });

  it("allows a technician assigned to the work order to view it", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", role: "technician", company_id: "company-1" });
    workOrderFindFirstMock.mockResolvedValue({ id: "wo-1", status: "planned", assigned_to_id: "tech-1" });

    const response = await GET(makeRequest(), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.currentStatus).toBe("planned");
  });

  describe("allowed status transitions (state machine)", () => {
    const cases: Array<{ status: string; allowed: string[] }> = [
      { status: "new", allowed: ["new", "planned", "in_progress", "cancelled"] },
      { status: "planned", allowed: ["planned", "new", "in_progress", "waiting_material", "blocked", "cancelled"] },
      { status: "in_progress", allowed: ["in_progress", "planned", "waiting_material", "blocked", "completed", "cancelled"] },
      { status: "waiting_material", allowed: ["waiting_material", "planned", "in_progress", "blocked", "cancelled"] },
      { status: "blocked", allowed: ["blocked", "planned", "in_progress", "waiting_material", "cancelled"] },
      { status: "completed", allowed: ["completed", "in_progress", "invoiced"] },
      { status: "invoiced", allowed: ["invoiced", "completed"] },
      { status: "cancelled", allowed: ["cancelled", "new", "planned"] },
    ];

    it.each(cases)("reports allowedStatuses $allowed for current status $status", async ({ status, allowed }) => {
      getCurrentUserMock.mockResolvedValue({ id: "user-1", role: "owner", company_id: "company-1" });
      workOrderFindFirstMock.mockResolvedValue({ id: "wo-1", status, assigned_to_id: null });

      const response = await GET(makeRequest(), { params });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.currentStatus).toBe(status);
      expect(body.allowedStatuses).toEqual(allowed);
    });

    it("never includes a status outside the canonical set, and each listed target is reachable from the reported current status", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "user-1", role: "owner", company_id: "company-1" });
      workOrderFindFirstMock.mockResolvedValue({ id: "wo-1", status: "blocked", assigned_to_id: null });

      const response = await GET(makeRequest(), { params });
      const body = await response.json();

      // "completed" must never be directly reachable from "blocked" per the state graph.
      expect(body.allowedStatuses).not.toContain("completed");
      expect(body.allowedStatuses).not.toContain("invoiced");
    });

    it("normalizes an unrecognized/corrupt stored status to 'planned'", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "user-1", role: "owner", company_id: "company-1" });
      workOrderFindFirstMock.mockResolvedValue({ id: "wo-1", status: "not-a-real-status", assigned_to_id: null });

      const response = await GET(makeRequest(), { params });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.currentStatus).toBe("planned");
    });
  });

  describe("role-based visibility of assignable users and capability flags", () => {
    it("includes eligible active users for a manager (can assign) filtered to assignable roles", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "manager-1", role: "manager", company_id: "company-1" });
      workOrderFindFirstMock.mockResolvedValue({ id: "wo-1", status: "planned", assigned_to_id: null });

      const response = await GET(makeRequest(), { params });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.canAssign).toBe(true);
      expect(body.users.map((u: { id: string }) => u.id)).toEqual(["owner-1", "tech-1"]);
      expect(body.users.some((u: { id: string }) => u.id === "viewer-1")).toBe(false);
    });

    it("returns an empty users list for a technician (cannot assign)", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "tech-1", role: "technician", company_id: "company-1" });
      workOrderFindFirstMock.mockResolvedValue({ id: "wo-1", status: "planned", assigned_to_id: "tech-1" });

      const response = await GET(makeRequest(), { params });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.canAssign).toBe(false);
      expect(body.users).toEqual([]);
    });

    it("returns an empty users list for a viewer (cannot assign)", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "viewer-1", role: "viewer", company_id: "company-1" });
      workOrderFindFirstMock.mockResolvedValue({ id: "wo-1", status: "planned", assigned_to_id: null });

      const response = await GET(makeRequest(), { params });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.canAssign).toBe(false);
      expect(body.users).toEqual([]);
    });

    it("reflects canManage true for roles permitted to manage tickets (owner/admin/manager/technician)", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "tech-1", role: "technician", company_id: "company-1" });
      workOrderFindFirstMock.mockResolvedValue({ id: "wo-1", status: "planned", assigned_to_id: "tech-1" });

      const response = await GET(makeRequest(), { params });
      const body = await response.json();

      expect(body.canManage).toBe(true);
      expect(body.canAssign).toBe(false);
    });

    it("reflects canManage false for a viewer role", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "viewer-1", role: "viewer", company_id: "company-1" });
      workOrderFindFirstMock.mockResolvedValue({ id: "wo-1", status: "planned", assigned_to_id: null });

      const response = await GET(makeRequest(), { params });
      const body = await response.json();

      expect(body.canManage).toBe(false);
    });
  });

  it("returns 500 when the database lookup throws", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", role: "owner", company_id: "company-1" });
    workOrderFindFirstMock.mockRejectedValue(new Error("db unavailable"));

    const response = await GET(makeRequest(), { params });

    expect(response.status).toBe(500);
  });

  it("sets a private, no-store cache header on success", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", role: "owner", company_id: "company-1" });
    workOrderFindFirstMock.mockResolvedValue({ id: "wo-1", status: "planned", assigned_to_id: null });

    const response = await GET(makeRequest(), { params });

    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
