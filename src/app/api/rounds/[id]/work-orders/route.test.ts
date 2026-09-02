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

  it("creates a work order per fresh candidate, links it and audits in the same transaction", async () => {
    const user = { id: "user-1", company_id: "company-1", role: "owner" };
    getCurrentUserMock.mockResolvedValue(user);
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
    expect(updateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "round-1", company_id: "company-1" },
      data: expect.objectContaining({ status: "in_progress" }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        entityType: "round",
        entityId: "round-1",
        action: "round.work_orders_created",
        metadata: expect.objectContaining({
          count: 1,
          itemIds: ["item-1"],
          workOrderIds: ["work-order-new"],
        }),
      }),
      tx,
    );
  });

  it("returns 500 when mandatory audit fails inside the transaction instead of committing a partial round linkage", async () => {
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
    writeAuditLogMock.mockRejectedValue(new Error("audit unavailable"));
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx));

    const response = await POST(postRequest({}), { params: Promise.resolve({ id: "round-1" }) });

    expect(response.status).toBe(500);
    expect(workOrderCreateMock).toHaveBeenCalledTimes(1);
    expect(updateManyMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx);
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
