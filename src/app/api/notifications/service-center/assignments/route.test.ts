import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  userFindManyMock,
  queryRawMock,
  listAssignmentsMock,
  upsertAssignmentMock,
  sqlSoftDeleteGuardMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  userFindManyMock: vi.fn(),
  queryRawMock: vi.fn(),
  listAssignmentsMock: vi.fn(),
  upsertAssignmentMock: vi.fn(),
  sqlSoftDeleteGuardMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    user: { findMany: userFindManyMock },
    $queryRaw: queryRawMock,
  },
}));

vi.mock("@/lib/service-notification-assignments", () => ({
  listServiceNotificationAssignments: listAssignmentsMock,
  upsertServiceNotificationAssignment: upsertAssignmentMock,
}));

vi.mock("@/lib/soft-delete-compat", () => ({
  sqlSoftDeleteGuard: sqlSoftDeleteGuardMock,
}));

import { GET, POST } from "./route";

function companyUser(role: string) {
  return {
    id: `${role}-1`,
    email: `${role}@example.com`,
    name: role,
    role,
    status: "active",
    company_id: "company-1",
  };
}

function postRequest() {
  return new Request("https://www.revalta.se/api/notifications/service-center/assignments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      notificationKey: "component-service:asset-1:2026-09-01",
      status: "assigned",
    }),
  });
}

describe("service-center assignment authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userFindManyMock.mockResolvedValue([]);
    listAssignmentsMock.mockResolvedValue([]);
    sqlSoftDeleteGuardMock.mockResolvedValue({});
    queryRawMock.mockResolvedValue([
      { id: "asset-1", next_service_at: new Date("2026-09-01T00:00:00.000Z") },
    ]);
    upsertAssignmentMock.mockResolvedValue({
      notificationKey: "component-service:asset-1:2026-09-01",
      assigneeId: null,
      assigneeName: null,
      status: "assigned",
      deadline: null,
      note: null,
      updatedAt: "2026-08-31T21:00:00.000Z",
    });
  });

  it.each(["technician", "viewer", "resident"])("blocks %s from reading company-wide assignment data", async (role) => {
    getCurrentUserMock.mockResolvedValue(companyUser(role));

    const response = await GET();

    expect(response.status).toBe(403);
    expect(userFindManyMock).not.toHaveBeenCalled();
    expect(listAssignmentsMock).not.toHaveBeenCalled();
  });

  it.each(["technician", "viewer", "resident"])("blocks %s from mutating service assignments", async (role) => {
    getCurrentUserMock.mockResolvedValue(companyUser(role));

    const response = await POST(postRequest());

    expect(response.status).toBe(403);
    expect(queryRawMock).not.toHaveBeenCalled();
    expect(upsertAssignmentMock).not.toHaveBeenCalled();
  });

  it("keeps assignment access available to operations leadership", async () => {
    getCurrentUserMock.mockResolvedValue(companyUser("manager"));

    const getResponse = await GET();
    const postResponse = await POST(postRequest());

    expect(getResponse.status).toBe(200);
    expect(postResponse.status).toBe(201);
    expect(upsertAssignmentMock).toHaveBeenCalledWith(expect.objectContaining({
      companyId: "company-1",
      notificationKey: "component-service:asset-1:2026-09-01",
      changedById: "manager-1",
    }));
  });
});
