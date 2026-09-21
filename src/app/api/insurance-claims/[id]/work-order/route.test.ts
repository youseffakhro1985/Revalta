import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  claimFindFirstMock,
  auditFindFirstMock,
  writeAuditLogMock,
  transactionMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  claimFindFirstMock: vi.fn(),
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
    insuranceClaim: { findFirst: claimFindFirstMock },
    auditLog: { findFirst: auditFindFirstMock },
    $transaction: transactionMock,
  },
}));

vi.mock("@/lib/work-order-enterprise-core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/work-order-enterprise-core")>()),
  allocateWorkOrderNumber: vi.fn().mockResolvedValue("AO-0009"),
  setWorkOrderEnterpriseFields: vi.fn().mockResolvedValue(undefined),
  addWorkOrderStatusEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/work-order-asset-links", () => ({
  setWorkOrderAssetLinks: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@prisma/client", () => ({
  Prisma: { sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }) },
}));

import { POST } from "./route";

const validClaim = {
  id: "claim-1",
  status: "reported",
  property_id: "property-1",
  title: "Vattenskada källare",
  damage_type: "water",
  location: "Källare",
  insurer: "If",
  claim_number: "SK-1",
  note: null,
  property: { id: "property-1", name: "Storgatan 1" },
};

describe("insurance-claims/[id]/work-order route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeAuditLogMock.mockResolvedValue(undefined);
    auditFindFirstMock.mockResolvedValue(null);
  });

  it("returns 404 when creating work order for a claim on a soft-deleted property", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    claimFindFirstMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "claim-1" });

    const response = await POST(new Request("http://localhost/api/insurance-claims/claim-1/work-order", {
      method: "POST",
    }), { params: Promise.resolve({ id: "claim-1" }) });

    expect(response.status).toBe(404);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 409 for a settled claim", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    claimFindFirstMock.mockResolvedValue({ ...validClaim, status: "settled" });

    const response = await POST(new Request("http://localhost/api/insurance-claims/claim-1/work-order", {
      method: "POST",
    }), { params: Promise.resolve({ id: "claim-1" }) });

    expect(response.status).toBe(409);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 409 when an audit link already exists", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    claimFindFirstMock.mockResolvedValue(validClaim);
    auditFindFirstMock.mockResolvedValue({ metadata: { workOrderId: "wo-existing" } });

    const response = await POST(new Request("http://localhost/api/insurance-claims/claim-1/work-order", {
      method: "POST",
    }), { params: Promise.resolve({ id: "claim-1" }) });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.workOrderId).toBe("wo-existing");
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("creates a work order and writes the claim link as audit metadata", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    claimFindFirstMock.mockResolvedValue(validClaim);
    const workOrderCreateMock = vi.fn().mockResolvedValue({ id: "work-order-new" });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]),
      auditLog: { findFirst: vi.fn().mockResolvedValue(null) },
      workOrder: { create: workOrderCreateMock },
    };
    transactionMock.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));

    const response = await POST(new Request("http://localhost/api/insurance-claims/claim-1/work-order", {
      method: "POST",
    }), { params: Promise.resolve({ id: "claim-1" }) });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(workOrderCreateMock).toHaveBeenCalledTimes(1);
    expect(body).toEqual(expect.objectContaining({ success: true, workOrderId: "work-order-new", workOrderNumber: "AO-0009" }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1", company_id: "company-1" }),
      expect.objectContaining({
        entityType: "insurance_claim",
        entityId: "claim-1",
        action: "insurance_claim.work_order_created",
        metadata: expect.objectContaining({ workOrderId: "work-order-new" }),
      }),
      tx,
    );
  });

  it("rejects residents before looking up a claim", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await POST(new Request("http://localhost/api/insurance-claims/claim-1/work-order", {
      method: "POST",
    }), { params: Promise.resolve({ id: "claim-1" }) });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(claimFindFirstMock).not.toHaveBeenCalled();
  });

  it("denies technicians with the finance-manage copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await POST(new Request("http://localhost/api/insurance-claims/claim-1/work-order", {
      method: "POST",
    }), { params: Promise.resolve({ id: "claim-1" }) });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet");
    expect(claimFindFirstMock).not.toHaveBeenCalled();
  });
});
