import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserMock, leaseFindFirstMock, readInspectionWorkOrdersMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  leaseFindFirstMock: vi.fn(),
  readInspectionWorkOrdersMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    lease: { findFirst: leaseFindFirstMock },
  },
}));

vi.mock("@/lib/read-inspection-work-orders", () => ({
  readInspectionWorkOrders: readInspectionWorkOrdersMock,
}));

import { GET } from "./route";

const params = Promise.resolve({ id: "lease-1" });

describe("GET /api/leases/[id]/inspection-work-orders/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    leaseFindFirstMock.mockResolvedValue({ id: "lease-1" });
    readInspectionWorkOrdersMock.mockResolvedValue([]);
  });

  it("denies technicians before reading inspection work-order links", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await GET(new Request("http://localhost/api/leases/lease-1/inspection-work-orders/status"), { params });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet att visa leasingdata");
    expect(leaseFindFirstMock).not.toHaveBeenCalled();
    expect(readInspectionWorkOrdersMock).not.toHaveBeenCalled();
  });

  it("rejects residents before reading inspection work-order links", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await GET(new Request("http://localhost/api/leases/lease-1/inspection-work-orders/status"), { params });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(leaseFindFirstMock).not.toHaveBeenCalled();
    expect(readInspectionWorkOrdersMock).not.toHaveBeenCalled();
  });

  it("lists inspection work-order status for a lease in the caller company", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });
    readInspectionWorkOrdersMock.mockResolvedValue([{ itemId: "item-1", workOrderId: "wo-1" }]);
    const response = await GET(new Request("http://localhost/api/leases/lease-1/inspection-work-orders/status"), { params });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.links).toEqual([{ itemId: "item-1", workOrderId: "wo-1" }]);
    expect(leaseFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "lease-1", company_id: "company-1", deleted_at: null, property: { deleted_at: null } },
    }));
    expect(readInspectionWorkOrdersMock).toHaveBeenCalledWith("company-1", "lease-1");
  });
});

describe("inspection-work-orders status Tenant B", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({
      id: "owner-1",
      company_id: "company-1",
      role: "owner",
    });
    leaseFindFirstMock.mockResolvedValue(null);
    readInspectionWorkOrdersMock.mockResolvedValue([]);
  });

  it("returns tenant-safe 404 when Tenant A lists inspection work-order status for a Tenant B lease id", async () => {
    const response = await GET(
      new Request("http://localhost/api/leases/lease-tenant-b/inspection-work-orders/status"),
      { params: Promise.resolve({ id: "lease-tenant-b" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Avtalet hittades inte");
    expect(body.errorCode).toBeUndefined();
    expect(leaseFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "lease-tenant-b", company_id: "company-1", deleted_at: null, property: { deleted_at: null } },
    }));
    expect(readInspectionWorkOrdersMock).not.toHaveBeenCalled();
  });
});
