import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  roundFindFirstMock,
  auditFindFirstMock,
  writeAuditLogMock,
  transactionMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  roundFindFirstMock: vi.fn(),
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
    inspectionRound: {
      findFirst: roundFindFirstMock,
    },
    auditLog: { findFirst: auditFindFirstMock },
    $transaction: transactionMock,
  },
}));

vi.mock("@/lib/work-order-enterprise-core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/work-order-enterprise-core")>()),
  allocateWorkOrderNumber: vi.fn().mockResolvedValue("AO-0001"),
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

function postRequest(body: unknown) {
  return new Request("http://localhost/api/rounds/round-1/work-orders", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("rounds/[id]/work-orders route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  const baseRound = {
    id: "round-1",
    company_id: "company-1",
    property_id: "property-1",
    title: "Vårrond",
    status: "planned",
    property: { id: "property-1", name: "Storgatan 1" },
    checklist: [
      { id: "item-1", label: "Trapphus", completed: false, hasDeviation: true, note: "", workOrderId: null },
      { id: "item-2", label: "Källare", completed: false, hasDeviation: false, note: "", workOrderId: null },
    ],
  };

  it("returns 404 when the round doesn't exist for this company", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    roundFindFirstMock.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    auditFindFirstMock.mockResolvedValue(null);

    const response = await POST(postRequest({}), { params: Promise.resolve({ id: "round-1" }) });

    expect(response.status).toBe(404);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 409 up front when there are no open deviations at all", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    roundFindFirstMock.mockResolvedValue({ ...baseRound, checklist: [baseRound.checklist[1]] });

    const response = await POST(postRequest({}), { params: Promise.resolve({ id: "round-1" }) });

    expect(response.status).toBe(409);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 409 without creating anything when a concurrent request already holds the round lock", async () => {
    // Regression test: two concurrent POSTs against the same round used to
    // both read the same stale checklist, both create real WorkOrder rows,
    // and race on the final updateMany (last write wins, silently losing
    // the other's checklist linkage). The advisory lock must reject the
    // loser instead.
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    roundFindFirstMock.mockResolvedValue(baseRound);
    const tx = { $queryRaw: vi.fn().mockResolvedValue([{ locked: false }]) };
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx));

    const response = await POST(postRequest({}), { params: Promise.resolve({ id: "round-1" }) });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/försök igen/i);
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("returns 409 when the fresh in-lock checklist shows the deviation was already claimed", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    roundFindFirstMock.mockResolvedValue(baseRound);
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]),
      inspectionRound: {
        findFirst: vi.fn().mockResolvedValue({
          status: "in_progress",
          // A concurrent request already linked item-1 to a work order.
          checklist: [
            { ...baseRound.checklist[0], workOrderId: "work-order-other" },
            baseRound.checklist[1],
          ],
        }),
      },
    };
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx));

    const response = await POST(postRequest({}), { params: Promise.resolve({ id: "round-1" }) });

    expect(response.status).toBe(409);
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("creates a work order per fresh candidate and links it in the same checklist write", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    roundFindFirstMock.mockResolvedValue(baseRound);
    const workOrderCreateMock = vi.fn().mockResolvedValue({ id: "work-order-new" });
    const updateManyMock = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]),
      inspectionRound: {
        findFirst: vi.fn().mockResolvedValue({ status: "planned", checklist: baseRound.checklist }),
        updateMany: updateManyMock,
      },
      workOrder: { create: workOrderCreateMock },
    };
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx));

    const response = await POST(postRequest({}), { params: Promise.resolve({ id: "round-1" }) });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(workOrderCreateMock).toHaveBeenCalledTimes(1);
    expect(body.created).toEqual([{ itemId: "item-1", workOrderId: "work-order-new", workOrderNumber: "AO-0001" }]);
    // Only the deviation item (item-1) is linked; the non-deviation item
    // (item-2) is untouched, and the round status advances from planned.
    expect(updateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "round-1", company_id: "company-1" },
      data: expect.objectContaining({ status: "in_progress" }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledTimes(1);
  });

  it("only creates work orders for requested itemIds when the client scopes the request", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    const roundWithTwoDeviations = {
      ...baseRound,
      checklist: [
        { id: "item-1", label: "Trapphus", completed: false, hasDeviation: true, note: "", workOrderId: null },
        { id: "item-2", label: "Källare", completed: false, hasDeviation: true, note: "", workOrderId: null },
      ],
    };
    roundFindFirstMock.mockResolvedValue(roundWithTwoDeviations);
    const workOrderCreateMock = vi.fn().mockResolvedValue({ id: "work-order-new" });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]),
      inspectionRound: {
        findFirst: vi.fn().mockResolvedValue({ status: "planned", checklist: roundWithTwoDeviations.checklist }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      workOrder: { create: workOrderCreateMock },
    };
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx));

    const response = await POST(postRequest({ itemIds: ["item-2"] }), { params: Promise.resolve({ id: "round-1" }) });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(workOrderCreateMock).toHaveBeenCalledTimes(1);
    expect(body.created).toEqual([{ itemId: "item-2", workOrderId: "work-order-new", workOrderNumber: "AO-0001" }]);
  });
});
