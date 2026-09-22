import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserMock, leaseFindFirstMock, linkFindManyMock, recordFindUniqueMock, transactionMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  leaseFindFirstMock: vi.fn(),
  linkFindManyMock: vi.fn(),
  recordFindUniqueMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    lease: { findFirst: leaseFindFirstMock },
    leaseInspectionWorkOrderLink: { findMany: linkFindManyMock },
    leaseInspectionRecord: { findUnique: recordFindUniqueMock },
    integrationEvent: { findFirst: vi.fn(), findMany: vi.fn() },
    $transaction: transactionMock,
  },
}));

import { GET, POST } from "./route";

const params = Promise.resolve({ id: "lease-1" });

describe("GET /api/leases/[id]/inspection-items/work-orders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    leaseFindFirstMock.mockResolvedValue({ id: "lease-1" });
    linkFindManyMock.mockResolvedValue([]);
  });

  it("denies technicians before listing inspection work orders", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await GET(new Request("http://localhost/api/leases/lease-1/inspection-items/work-orders"), { params });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet att visa leasingdata");
    expect(leaseFindFirstMock).not.toHaveBeenCalled();
  });

  it("rejects residents before listing inspection work orders", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await GET(new Request("http://localhost/api/leases/lease-1/inspection-items/work-orders"), { params });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(leaseFindFirstMock).not.toHaveBeenCalled();
  });

  it("POST rejects residents before creating inspection work orders", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await POST(new Request("http://localhost/api/leases/lease-1/inspection-items/work-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 1, itemIds: ["item-1"] }),
    }), { params });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(leaseFindFirstMock).not.toHaveBeenCalled();
  });

  it("POST denies viewers with the work-order-create copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "viewer-1", company_id: "company-1", role: "viewer" });
    const response = await POST(new Request("http://localhost/api/leases/lease-1/inspection-items/work-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 1, itemIds: ["item-1"] }),
    }), { params });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet att skapa arbetsorder");
    expect(leaseFindFirstMock).not.toHaveBeenCalled();
  });
});

describe("lease inspection-items work-orders Tenant B", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({
      id: "owner-1",
      company_id: "company-1",
      role: "owner",
      name: "Owner",
      email: "owner@example.com",
    });
    leaseFindFirstMock.mockResolvedValue(null);
    recordFindUniqueMock.mockResolvedValue(null);
  });

  it("returns tenant-safe 404 when Tenant A lists inspection work orders for a Tenant B lease id", async () => {
    const response = await GET(
      new Request("http://localhost/api/leases/lease-tenant-b/inspection-items/work-orders"),
      { params: Promise.resolve({ id: "lease-tenant-b" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Avtalet hittades inte");
    expect(leaseFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "lease-tenant-b", company_id: "company-1", deleted_at: null, property: { deleted_at: null } },
    }));
    expect(linkFindManyMock).not.toHaveBeenCalled();
  });

  it("returns tenant-safe 404 when Tenant A creates inspection work orders on a Tenant B lease id", async () => {
    const response = await POST(
      new Request("http://localhost/api/leases/lease-tenant-b/inspection-items/work-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: 1, itemIds: ["item-1"] }),
      }),
      { params: Promise.resolve({ id: "lease-tenant-b" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Avtalet hittades inte");
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
