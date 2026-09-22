import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserMock, createInspectionWorkOrdersMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  createInspectionWorkOrdersMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/create-inspection-work-orders", () => ({
  createInspectionWorkOrders: createInspectionWorkOrdersMock,
  InspectionWorkOrderError: class InspectionWorkOrderError extends Error {},
}));

import { POST } from "./route";

const params = Promise.resolve({ id: "lease-1" });

describe("POST /api/leases/[id]/inspection-work-orders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects residents before creating inspection work orders", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await POST(new Request("http://localhost/api/leases/lease-1/inspection-work-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 1, itemIds: ["item-1"] }),
    }), { params });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(createInspectionWorkOrdersMock).not.toHaveBeenCalled();
  });

  it("denies viewers with the work-order-create copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "viewer-1", company_id: "company-1", role: "viewer" });
    const response = await POST(new Request("http://localhost/api/leases/lease-1/inspection-work-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 1, itemIds: ["item-1"] }),
    }), { params });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet att skapa arbetsorder");
    expect(createInspectionWorkOrdersMock).not.toHaveBeenCalled();
  });
});
