import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  workOrderFindFirstMock,
  userFindFirstMock,
  projectCreateMock,
  transactionMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  workOrderFindFirstMock: vi.fn(),
  userFindFirstMock: vi.fn(),
  projectCreateMock: vi.fn(),
  transactionMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
  canManageWorkOrderFinance: () => true,
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: writeAuditLogMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    workOrder: { findFirst: workOrderFindFirstMock },
    user: { findFirst: userFindFirstMock },
    $transaction: transactionMock,
  },
}));

import { POST } from "./route";

const params = Promise.resolve({ id: "work-order-1" });
const transactionClient = {
  project: { create: projectCreateMock },
  auditLog: { create: vi.fn() },
};

const workOrder = {
  id: "work-order-1",
  title: "Byt cirkulationspump",
  description: "Pumpen ska bytas och driftsättas",
  property_id: "property-1",
  scheduled_start: null,
  scheduled_end: null,
  estimated_cost: 12000,
  property: { id: "property-1", name: "Kvarteret Eken" },
  projects: [],
};

const project = {
  id: "project-1",
  company_id: "company-1",
  property_id: "property-1",
  source_work_order_id: "work-order-1",
  name: "Byt cirkulationspump",
  status: "planned",
  property: { id: "property-1", name: "Kvarteret Eken" },
  manager: null,
  source_work_order: { id: "work-order-1", title: "Byt cirkulationspump", status: "planned" },
};

function request(body: string) {
  return new Request("https://www.revalta.se/api/work-orders/work-order-1/project", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("work-orders/[id]/project POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({ id: "manager-1", company_id: "company-1", role: "manager" });
    workOrderFindFirstMock.mockResolvedValue(workOrder);
    userFindFirstMock.mockResolvedValue({ id: "manager-1" });
    projectCreateMock.mockResolvedValue(project);
    writeAuditLogMock.mockResolvedValue(undefined);
    transactionMock.mockImplementation(async (callback: (tx: typeof transactionClient) => unknown) => callback(transactionClient));
  });

  it("creates the project and required audit record in the same transaction", async () => {
    const response = await POST(request(JSON.stringify({ managerId: "manager-1" })), { params });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ project });
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(projectCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        company_id: "company-1",
        property_id: "property-1",
        source_work_order_id: "work-order-1",
        manager_id: "manager-1",
      }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      { id: "manager-1", company_id: "company-1", role: "manager" },
      expect.objectContaining({
        entityType: "project",
        entityId: "project-1",
        action: "project.created_from_work_order",
        metadata: expect.objectContaining({ workOrderId: "work-order-1", propertyId: "property-1" }),
      }),
      transactionClient,
    );
  });

  it("propagates an audit failure through the transaction so Prisma rolls the project creation back", async () => {
    const auditFailure = new Error("audit unavailable");
    writeAuditLogMock.mockRejectedValue(auditFailure);

    await expect(POST(request(JSON.stringify({})), { params })).rejects.toThrow("audit unavailable");

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(projectCreateMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed JSON before opening a transaction", async () => {
    const response = await POST(request("{"), { params });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Ogiltigt innehåll" });
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
