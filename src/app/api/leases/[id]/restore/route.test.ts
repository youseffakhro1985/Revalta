import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  leaseFindFirstMock,
  leaseUpdateManyMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  leaseFindFirstMock: vi.fn(),
  leaseUpdateManyMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: writeAuditLogMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    lease: {
      findFirst: leaseFindFirstMock,
      updateMany: leaseUpdateManyMock,
    },
  },
}));

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
});
