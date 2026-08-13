import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  leaseHolderFindFirstMock,
  leaseHolderUpdateManyMock,
  writeAuditLogMock,
  transactionMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  leaseHolderFindFirstMock: vi.fn(),
  leaseHolderUpdateManyMock: vi.fn(),
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
    leaseHolder: {
      findFirst: leaseHolderFindFirstMock,
      updateMany: leaseHolderUpdateManyMock,
    },
    $transaction: transactionMock,
  };
  transactionMock.mockImplementation((callback: (tx: typeof dbMock) => unknown) => callback(dbMock));
  return { default: dbMock };
});

import { POST } from "./route";

const params = Promise.resolve({ holderId: "holder-1" });

describe("lease-holders/[holderId]/restore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeAuditLogMock.mockResolvedValue(undefined);
    leaseHolderUpdateManyMock.mockResolvedValue({ count: 1 });
    leaseHolderFindFirstMock.mockResolvedValueOnce({
      id: "holder-1",
      name: "Anna Andersson",
      party_type: "individual",
      email: "anna@example.se",
      organization_number: null,
      status: "inactive",
    });
  });

  it("restores a soft-deleted lease holder and writes audit", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    leaseHolderFindFirstMock.mockResolvedValueOnce(null); // duplicate check finds nothing

    const response = await POST(new Request("http://localhost/api/lease-holders/holder-1/restore", { method: "POST" }), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(leaseHolderUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "holder-1", company_id: "company-1", deleted_at: { not: null } },
      data: { deleted_at: null, status: "active" },
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "lease_holder.restored" }),
      expect.anything(),
    );
  });

  it("returns 409 when another active contact already uses the same email", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    leaseHolderFindFirstMock.mockResolvedValueOnce({ id: "holder-2", name: "Anna A" });

    const response = await POST(new Request("http://localhost/api/lease-holders/holder-1/restore", { method: "POST" }), { params });
    expect(response.status).toBe(409);
    expect(leaseHolderUpdateManyMock).not.toHaveBeenCalled();
  });

  it("does not report success when the audit log write fails inside the transaction", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    leaseHolderFindFirstMock.mockResolvedValueOnce(null);
    writeAuditLogMock.mockRejectedValue(new Error("audit db unavailable"));

    const response = await POST(new Request("http://localhost/api/lease-holders/holder-1/restore", { method: "POST" }), { params });

    expect(response.status).toBe(500);
    expect(transactionMock).toHaveBeenCalledTimes(1);
  });
});
