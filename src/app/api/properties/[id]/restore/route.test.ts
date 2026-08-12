import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  propertyFindFirstMock,
  propertyUpdateManyMock,
  writeAuditLogMock,
  transactionMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
  propertyUpdateManyMock: vi.fn(),
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
    property: {
      findFirst: propertyFindFirstMock,
      updateMany: propertyUpdateManyMock,
    },
    $transaction: transactionMock,
  };
  transactionMock.mockImplementation((callback: (tx: typeof dbMock) => unknown) => callback(dbMock));
  return { default: dbMock };
});

import { POST } from "./route";

const params = Promise.resolve({ id: "property-1" });

describe("properties/[id]/restore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeAuditLogMock.mockResolvedValue(undefined);
    propertyUpdateManyMock.mockResolvedValue({ count: 1 });
  });

  it("restores a soft-deleted property", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    propertyFindFirstMock.mockResolvedValue({ id: "property-1", name: "Brf Sol", status: "active" });

    const response = await POST(new Request("http://localhost/api/properties/property-1/restore", { method: "POST" }), { params });
    expect(response.status).toBe(200);
    expect(propertyUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "property-1", company_id: "company-1", deleted_at: { not: null } },
      data: { deleted_at: null },
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "property.restored" }),
      expect.anything(),
    );
  });

  it("returns 403 for roles that cannot manage properties", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "technician" });
    const response = await POST(new Request("http://localhost/api/properties/property-1/restore", { method: "POST" }), { params });
    expect(response.status).toBe(403);
  });

  it("does not report success when the audit log write fails inside the transaction", async () => {
    // Regression test: restore and audit-log write must be atomic. Previously the
    // updateMany committed on its own; if writeAuditLog then threw, the property was
    // already un-deleted but the caller was told "Internt serverfel" (500) — a false
    // negative. Now both happen inside one $transaction, so a failure here rolls the
    // whole operation back and the 500 accurately reflects that nothing changed.
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    propertyFindFirstMock.mockResolvedValue({ id: "property-1", name: "Brf Sol", status: "active" });
    writeAuditLogMock.mockRejectedValue(new Error("audit db unavailable"));

    const response = await POST(new Request("http://localhost/api/properties/property-1/restore", { method: "POST" }), { params });

    expect(response.status).toBe(500);
    expect(transactionMock).toHaveBeenCalledTimes(1);
  });
});
