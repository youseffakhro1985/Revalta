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
const request = new Request("http://localhost/api/work-orders/wo-1/transitions");

describe("work order transition finance visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userFindManyMock.mockResolvedValue([]);
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", role: "technician", company_id: "company-1" });
  });

  it("does not offer invoiced to an assigned technician on a completed work order", async () => {
    workOrderFindFirstMock.mockResolvedValue({ id: "wo-1", status: "completed", assigned_to_id: "tech-1" });

    const response = await GET(request, { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.currentStatus).toBe("completed");
    expect(body.allowedStatuses).toEqual(["completed", "in_progress"]);
    expect(body.allowedStatuses).not.toContain("invoiced");
  });

  it("does not offer a transition out of invoiced to an assigned technician", async () => {
    workOrderFindFirstMock.mockResolvedValue({ id: "wo-1", status: "invoiced", assigned_to_id: "tech-1" });

    const response = await GET(request, { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.currentStatus).toBe("invoiced");
    expect(body.allowedStatuses).toEqual(["invoiced"]);
    expect(body.allowedStatuses).not.toContain("completed");
  });
});
