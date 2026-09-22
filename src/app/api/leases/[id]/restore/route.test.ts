import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  leaseFindFirstMock,
  leaseUpdateManyMock,
  writeAuditLogMock,
  transactionMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  leaseFindFirstMock: vi.fn(),
  leaseUpdateManyMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: writeAuditLogMock,
}));

vi.mock("@/lib/db", () => {
  const dbMock = {
    lease: {
      findFirst: leaseFindFirstMock,
      updateMany: leaseUpdateManyMock,
    },
    $transaction: transactionMock,
  };
  transactionMock.mockImplementation((callback: (tx: typeof dbMock) => unknown) => callback(dbMock));
  return { default: dbMock };
});

import { POST } from "./route";

const params = Promise.resolve({ id: "lease-1" });

describe("leases/[id]/restore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeAuditLogMock.mockResolvedValue(undefined);
    leaseUpdateManyMock.mockResolvedValue({ count: 1 });
  });

  it("restores a soft-deleted draft lease", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    leaseFindFirstMock.mockResolvedValue({
      id: "lease-1",
      lease_number: "AVT-2026-ABC",
      status: "draft",
      unit_id: "unit-1",
      property: { deleted_at: null },
    });

    const response = await POST(new Request("http://localhost/api/leases/lease-1/restore", { method: "POST" }), { params });
    expect(response.status).toBe(200);
    expect(leaseUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "lease-1", company_id: "company-1", deleted_at: { not: null } },
      data: { deleted_at: null },
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "lease.restored" }),
      expect.anything(),
    );
  });

  it("returns 409 when property is soft-deleted", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    leaseFindFirstMock.mockResolvedValue({
      id: "lease-1",
      lease_number: "AVT-2026-ABC",
      status: "ended",
      unit_id: "unit-1",
      property: { deleted_at: new Date() },
    });

    const response = await POST(new Request("http://localhost/api/leases/lease-1/restore", { method: "POST" }), { params });
    expect(response.status).toBe(409);
    expect(leaseUpdateManyMock).not.toHaveBeenCalled();
  });

  it("does not report success when the audit log write fails inside the transaction", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    leaseFindFirstMock.mockResolvedValue({
      id: "lease-1",
      lease_number: "AVT-2026-ABC",
      status: "draft",
      unit_id: "unit-1",
      property: { deleted_at: null },
    });
    writeAuditLogMock.mockRejectedValue(new Error("audit db unavailable"));

    const response = await POST(new Request("http://localhost/api/leases/lease-1/restore", { method: "POST" }), { params });

    expect(response.status).toBe(500);
    expect(transactionMock).toHaveBeenCalledTimes(1);
  });

  it("POST denies residents before looking up a lease", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-a",
      company_id: "company-a",
      role: "resident",
      email: "boende-a@exempel.se",
    });
    const response = await POST(new Request("http://localhost/api/leases/lease-1/restore", { method: "POST" }), { params });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(leaseFindFirstMock).not.toHaveBeenCalled();
  });

  it("POST denies technicians with the lease-restore copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await POST(new Request("http://localhost/api/leases/lease-1/restore", { method: "POST" }), { params });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet att återställa avtal");
    expect(leaseFindFirstMock).not.toHaveBeenCalled();
  });

  it("returns tenant-safe 404 when Tenant A restores a Tenant B lease id", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "owner-1", company_id: "company-1", role: "owner" });
    leaseFindFirstMock.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/leases/lease-tenant-b/restore", { method: "POST" }),
      { params: Promise.resolve({ id: "lease-tenant-b" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Avtalet hittades inte eller är redan aktivt");
    expect(leaseFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "lease-tenant-b", company_id: "company-1", deleted_at: { not: null } },
    }));
    expect(transactionMock).not.toHaveBeenCalled();
    expect(leaseUpdateManyMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });
});
