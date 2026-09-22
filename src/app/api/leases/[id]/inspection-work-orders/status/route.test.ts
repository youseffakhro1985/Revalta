import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserMock, readInspectionWorkOrdersMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  readInspectionWorkOrdersMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/read-inspection-work-orders", () => ({
  readInspectionWorkOrders: readInspectionWorkOrdersMock,
}));

import { GET } from "./route";

const params = Promise.resolve({ id: "lease-1" });

describe("GET /api/leases/[id]/inspection-work-orders/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readInspectionWorkOrdersMock.mockResolvedValue([]);
  });

  it("denies technicians before reading inspection work-order links", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await GET(new Request("http://localhost/api/leases/lease-1/inspection-work-orders/status"), { params });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet att visa leasingdata");
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
    expect(readInspectionWorkOrdersMock).not.toHaveBeenCalled();
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
    readInspectionWorkOrdersMock.mockResolvedValue([]);
  });

  it("keeps a Tenant B lease id inside the caller company when listing inspection work-order status", async () => {
    const response = await GET(
      new Request("http://localhost/api/leases/lease-tenant-b/inspection-work-orders/status"),
      { params: Promise.resolve({ id: "lease-tenant-b" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.links).toEqual([]);
    expect(readInspectionWorkOrdersMock).toHaveBeenCalledWith("company-1", "lease-tenant-b");
  });
});
