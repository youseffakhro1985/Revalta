import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserMock, leaseFindFirstMock, recordFindUniqueMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  leaseFindFirstMock: vi.fn(),
  recordFindUniqueMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    lease: { findFirst: leaseFindFirstMock },
    leaseInspectionRecord: { findUnique: recordFindUniqueMock },
  },
}));

import { GET, PUT } from "./route";

const params = Promise.resolve({ id: "lease-1" });

describe("GET /api/leases/[id]/inspection-items", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    leaseFindFirstMock.mockResolvedValue({ id: "lease-1" });
    recordFindUniqueMock.mockResolvedValue(null);
  });

  it("denies technicians from reading inspection holder names", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await GET(new Request("http://localhost/api/leases/lease-1/inspection-items"), { params });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet att visa leasingdata");
    expect(leaseFindFirstMock).not.toHaveBeenCalled();
  });

  it("rejects residents before looking up inspection items", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await GET(new Request("http://localhost/api/leases/lease-1/inspection-items"), { params });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(leaseFindFirstMock).not.toHaveBeenCalled();
  });

  it("PUT rejects residents before writing inspection items", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await PUT(new Request("http://localhost/api/leases/lease-1/inspection-items", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [] }),
    }), { params });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(leaseFindFirstMock).not.toHaveBeenCalled();
  });

  it("PUT denies technicians with the inspection-manage copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await PUT(new Request("http://localhost/api/leases/lease-1/inspection-items", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [] }),
    }), { params });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet att hantera besiktningar");
    expect(leaseFindFirstMock).not.toHaveBeenCalled();
  });
});

describe("lease inspection-items Tenant B", () => {
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
  });

  it("returns tenant-safe 404 when Tenant A reads inspection items for a Tenant B lease id", async () => {
    const response = await GET(
      new Request("http://localhost/api/leases/lease-tenant-b/inspection-items"),
      { params: Promise.resolve({ id: "lease-tenant-b" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Avtalet hittades inte");
    expect(leaseFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "lease-tenant-b", company_id: "company-1", deleted_at: null, property: { deleted_at: null } },
    }));
    expect(recordFindUniqueMock).not.toHaveBeenCalled();
  });

  it("returns tenant-safe 404 when Tenant A writes inspection items on a Tenant B lease id", async () => {
    const response = await PUT(
      new Request("http://localhost/api/leases/lease-tenant-b/inspection-items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [] }),
      }),
      { params: Promise.resolve({ id: "lease-tenant-b" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Avtalet hittades inte");
    expect(recordFindUniqueMock).not.toHaveBeenCalled();
  });
});
