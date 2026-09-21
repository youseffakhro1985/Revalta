import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  workOrderFindFirstMock,
  buildingFindManyMock,
  queryRawMock,
  assignedAccessibleMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  workOrderFindFirstMock: vi.fn(),
  buildingFindManyMock: vi.fn(),
  queryRawMock: vi.fn(),
  assignedAccessibleMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("@/lib/assigned-work-access", () => ({
  isAssignedWorkAccessible: assignedAccessibleMock,
  notFoundWorkOrder: () => Response.json({ error: "Arbetsordern hittades inte" }, { status: 404 }),
}));
vi.mock("@/lib/db", () => ({
  default: {
    workOrder: { findFirst: workOrderFindFirstMock },
    building: { findMany: buildingFindManyMock },
    $queryRaw: queryRawMock,
  },
}));

import { GET } from "./route";

describe("work-orders/[id]/asset-options GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assignedAccessibleMock.mockReturnValue(true);
    workOrderFindFirstMock.mockResolvedValue({ id: "wo-1", property_id: "property-1", assigned_to_id: null });
    buildingFindManyMock.mockResolvedValue([]);
    queryRawMock.mockResolvedValue([]);
  });

  it("rejects residents before loading buildings or technical assets", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
    });

    const response = await GET(
      new Request("https://www.revalta.se/api/work-orders/wo-1/asset-options"),
      { params: Promise.resolve({ id: "wo-1" }) },
    );

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(workOrderFindFirstMock).not.toHaveBeenCalled();
    expect(buildingFindManyMock).not.toHaveBeenCalled();
    expect(queryRawMock).not.toHaveBeenCalled();
  });
});
