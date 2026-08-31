import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  ticketFindFirstMock,
  workOrderFindFirstMock,
  unitFindFirstMock,
  userFindFirstMock,
  transactionMock,
  loggerErrorMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  ticketFindFirstMock: vi.fn(),
  workOrderFindFirstMock: vi.fn(),
  unitFindFirstMock: vi.fn(),
  userFindFirstMock: vi.fn(),
  transactionMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    ticket: { findFirst: ticketFindFirstMock },
    workOrder: { findFirst: workOrderFindFirstMock },
    unit: { findFirst: unitFindFirstMock },
    user: { findFirst: userFindFirstMock },
    $transaction: transactionMock,
  },
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));

vi.mock("@/lib/work-order-enterprise-core", () => ({
  addWorkOrderStatusEvent: vi.fn(),
  allocateWorkOrderNumber: vi.fn(),
  calculateWorkOrderSla: vi.fn(() => ({ responseDueAt: null, resolutionDueAt: null })),
  setWorkOrderEnterpriseFields: vi.fn(),
}));

vi.mock("@/lib/work-order-workflow", () => ({
  normalizeWorkOrderPriority: vi.fn((value: string) => value || "normal"),
}));

vi.mock("@/lib/structured-logger", () => ({
  createLogger: () => ({ error: loggerErrorMock }),
}));

import { POST } from "./route";

function request(body: Record<string, unknown>) {
  return new Request("https://www.revalta.se/api/tickets/ticket-1/work-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: "ticket-1" }) };
const technician = {
  id: "tech-1",
  company_id: "company-1",
  role: "technician",
  email: "tech@example.com",
};
const accessibleTicket = {
  id: "ticket-1",
  property_id: "property-1",
  assigned_to_id: "tech-1",
  status: "received",
  title: "Läckage",
  description: "Kontrollera läckage",
  priority: "normal",
};

describe("ticket work-order creation authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue(technician);
    ticketFindFirstMock.mockResolvedValue(accessibleTicket);
    workOrderFindFirstMock.mockResolvedValue(null);
  });

  it("keeps the parent ticket lookup scoped to the authenticated company", async () => {
    ticketFindFirstMock.mockResolvedValue(null);

    const response = await POST(request({}), params);

    expect(response.status).toBe(404);
    expect(ticketFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "ticket-1",
        company_id: "company-1",
        deleted_at: null,
      }),
    }));
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("prevents a technician from assigning a new work order to another user", async () => {
    const response = await POST(request({ assignedToId: "tech-2" }), params);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Du saknar behörighet att tilldela arbetsorder till andra",
    });
    expect(userFindFirstMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("prevents a technician from setting an estimated work-order cost", async () => {
    const response = await POST(request({ estimatedCost: 1250 }), params);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Du saknar behörighet att sätta arbetsorderkostnader",
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
