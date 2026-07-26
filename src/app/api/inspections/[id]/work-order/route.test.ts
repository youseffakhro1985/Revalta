import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  inspectionFindFirstMock,
  auditFindFirstMock,
  writeAuditLogMock,
  transactionMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  inspectionFindFirstMock: vi.fn(),
  auditFindFirstMock: vi.fn(),
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

vi.mock("@/lib/db", () => ({
  default: {
    complianceInspection: {
      findFirst: inspectionFindFirstMock,
    },
    auditLog: { findFirst: auditFindFirstMock },
    $transaction: transactionMock,
  },
}));

import { POST } from "./route";

describe("inspections/[id]/work-order route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("returns 404 when creating work order for inspection on soft-deleted property", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    inspectionFindFirstMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "inspection-1" });

    const response = await POST(new Request("http://localhost/api/inspections/inspection-1/work-order", {
      method: "POST",
    }), { params: Promise.resolve({ id: "inspection-1" }) });

    expect(response.status).toBe(404);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("fail-closes legacy inspection work-order creation with Swedish 409", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    inspectionFindFirstMock.mockResolvedValue(null);
    auditFindFirstMock.mockResolvedValue({ id: "legacy-1", metadata: {} });

    const response = await POST(new Request("http://localhost/api/inspections/legacy-1/work-order", {
      method: "POST",
    }), { params: Promise.resolve({ id: "legacy-1" }) });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/backfill/i);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });
});
