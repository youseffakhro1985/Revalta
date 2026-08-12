import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserMock, propertyFindManyMock, userFindManyMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  propertyFindManyMock: vi.fn(),
  userFindManyMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("@/lib/schema-readiness", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/schema-readiness")>()),
  notDeletedFilter: vi.fn(async () => ({ deleted_at: null })),
}));
vi.mock("@/lib/db", () => ({
  default: {
    property: { findMany: propertyFindManyMock },
    user: { findMany: userFindManyMock },
  },
}));

import { GET } from "./route";

describe("GET /api/work-orders/options", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    propertyFindManyMock.mockResolvedValue([]);
    userFindManyMock.mockResolvedValue([{ id: "tech-2", email: "tech@example.se" }]);
  });

  it("does not disclose the company user directory to technicians", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(userFindManyMock).not.toHaveBeenCalled();
    expect(body.users).toEqual([]);
    expect(body.permissions.canAssign).toBe(false);
  });

  it("returns assignable users to managers", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "manager-1", company_id: "company-1", role: "manager" });

    const response = await GET();
    const body = await response.json();

    expect(userFindManyMock).toHaveBeenCalled();
    expect(body.users).toHaveLength(1);
    expect(body.permissions.canAssign).toBe(true);
  });
});
