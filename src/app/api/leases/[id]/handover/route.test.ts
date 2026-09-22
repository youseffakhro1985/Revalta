import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  leaseFindFirstMock,
  handoverFindUniqueMock,
  integrationFindFirstMock,
  auditFindManyMock,
  transactionMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  leaseFindFirstMock: vi.fn(),
  handoverFindUniqueMock: vi.fn(),
  integrationFindFirstMock: vi.fn(),
  auditFindManyMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    lease: { findFirst: leaseFindFirstMock },
    leaseHandoverRecord: { findUnique: handoverFindUniqueMock },
    integrationEvent: { findFirst: integrationFindFirstMock },
    auditLog: { findMany: auditFindManyMock },
    $transaction: transactionMock,
  },
}));

import { GET, PUT } from "./route";

const params = Promise.resolve({ id: "lease-1" });

const sampleLease = {
  id: "lease-1",
  lease_number: "L-100",
  status: "active",
  start_date: new Date("2026-01-01"),
  end_date: null,
  notice_date: null,
  ended_at: null,
  property: { id: "prop-1", name: "Storgatan 1", address: "Storgatan 1", city: "Stockholm" },
  unit: { id: "unit-1", designation: "1101", unit_type: "apartment" },
  lease_holder: { id: "holder-1", name: "Anna", email: "anna@example.se", phone: null },
};

describe("leases/[id]/handover route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handoverFindUniqueMock.mockResolvedValue(null);
    integrationFindFirstMock.mockResolvedValue(null);
    auditFindManyMock.mockResolvedValue([]);
  });

  it("GET requires active property filter on lease findFirst", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "user-1",
      company_id: "company-1",
      role: "owner",
      name: "Bo",
      email: "bo@example.se",
    });
    leaseFindFirstMock.mockResolvedValue(sampleLease);

    const response = await GET(new Request("http://localhost/api/leases/lease-1/handover"), { params });

    expect(response.status).toBe(200);
    expect(leaseFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "lease-1", company_id: "company-1", deleted_at: null, property: { deleted_at: null } },
    }));
  });

  it("GET returns 404 when lease is missing or on a soft-deleted property", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "user-1",
      company_id: "company-1",
      role: "owner",
      name: "Bo",
      email: "bo@example.se",
    });
    leaseFindFirstMock.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/leases/lease-1/handover"), { params });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toMatch(/hittades inte/i);
    expect(handoverFindUniqueMock).not.toHaveBeenCalled();
  });

  it("GET denies technicians from reading handover holder emails", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await GET(new Request("http://localhost/api/leases/lease-1/handover"), { params });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet att visa leasingdata");
    expect(leaseFindFirstMock).not.toHaveBeenCalled();
    expect(auditFindManyMock).not.toHaveBeenCalled();
  });

  it("GET rejects residents before looking up a handover or holder email", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await GET(new Request("http://localhost/api/leases/lease-1/handover"), { params });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(leaseFindFirstMock).not.toHaveBeenCalled();
    expect(auditFindManyMock).not.toHaveBeenCalled();
  });

  it("PUT requires active property filter on lease findFirst", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "user-1",
      company_id: "company-1",
      role: "owner",
      name: "Bo",
      email: "bo@example.se",
    });
    leaseFindFirstMock.mockResolvedValue(null);

    const response = await PUT(new Request("http://localhost/api/leases/lease-1/handover", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "move_in" }),
    }), { params });

    expect(response.status).toBe(404);
    expect(leaseFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "lease-1", company_id: "company-1", deleted_at: null, property: { deleted_at: null } },
    }));
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("PUT fail-closes IE-only (legacy) handovers with Swedish 409", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "user-1",
      company_id: "company-1",
      role: "owner",
      name: "Bo",
      email: "bo@example.se",
    });
    leaseFindFirstMock.mockResolvedValue(sampleLease);
    handoverFindUniqueMock.mockResolvedValue(null);
    integrationFindFirstMock.mockResolvedValue({ id: "ie-1" });

    const response = await PUT(new Request("http://localhost/api/leases/lease-1/handover", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "move_in" }),
    }), { params });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/backfill/i);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("PUT rejects residents before looking up a handover", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await PUT(new Request("http://localhost/api/leases/lease-1/handover", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "move_in" }),
    }), { params });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(leaseFindFirstMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("PUT denies technicians with the handover-manage copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await PUT(new Request("http://localhost/api/leases/lease-1/handover", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "move_in" }),
    }), { params });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet att hantera överlämningar");
    expect(leaseFindFirstMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("GET returns tenant-safe 404 for a Tenant B lease id without loading handover payload", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "user-1",
      company_id: "company-1",
      role: "owner",
      name: "Bo",
      email: "bo@example.se",
    });
    leaseFindFirstMock.mockResolvedValue(null);
    const tenantBParams = Promise.resolve({ id: "lease-tenant-b" });

    const response = await GET(
      new Request("http://localhost/api/leases/lease-tenant-b/handover"),
      { params: tenantBParams },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toMatch(/hittades inte/i);
    expect(leaseFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "lease-tenant-b", company_id: "company-1", deleted_at: null, property: { deleted_at: null } },
    }));
    expect(handoverFindUniqueMock).not.toHaveBeenCalled();
    expect(auditFindManyMock).not.toHaveBeenCalled();
  });

  it("PUT returns tenant-safe 404 for a Tenant B lease id without mutating", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "user-1",
      company_id: "company-1",
      role: "owner",
      name: "Bo",
      email: "bo@example.se",
    });
    leaseFindFirstMock.mockResolvedValue(null);
    const tenantBParams = Promise.resolve({ id: "lease-tenant-b" });

    const response = await PUT(new Request("http://localhost/api/leases/lease-tenant-b/handover", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "move_in" }),
    }), { params: tenantBParams });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toMatch(/hittades inte/i);
    expect(leaseFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "lease-tenant-b", company_id: "company-1", deleted_at: null, property: { deleted_at: null } },
    }));
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
