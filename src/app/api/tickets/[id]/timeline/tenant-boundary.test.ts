import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  ticketFindFirstMock,
  workOrderFindFirstMock,
  auditFindManyMock,
  assignedAccessibleMock,
  enterpriseStateMock,
  statusEventsMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  ticketFindFirstMock: vi.fn(),
  workOrderFindFirstMock: vi.fn(),
  auditFindManyMock: vi.fn(),
  assignedAccessibleMock: vi.fn(),
  enterpriseStateMock: vi.fn(),
  statusEventsMock: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
  tenantWhere: () => ({ company_id: "company-1" }),
}));
vi.mock("@/lib/assigned-work-access", () => ({
  isAssignedWorkAccessible: assignedAccessibleMock,
  notFoundTicket: () => Response.json({ error: "Ärendet hittades inte" }, { status: 404 }),
}));
vi.mock("@/lib/work-order-enterprise-core", () => ({
  getWorkOrderEnterpriseState: enterpriseStateMock,
  getWorkOrderStatusEvents: statusEventsMock,
}));
vi.mock("@/lib/ticket-work-order-timeline", () => ({ buildTicketWorkOrderTimeline: () => [] }));
vi.mock("@/lib/structured-logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));
vi.mock("@/lib/db", () => ({
  default: {
    ticket: { findFirst: ticketFindFirstMock },
    workOrder: { findFirst: workOrderFindFirstMock },
    auditLog: { findMany: auditFindManyMock },
  },
}));

import { GET } from "./route";

const request = new Request("https://www.revalta.se/api/tickets/ticket-1/timeline");
const context = { params: Promise.resolve({ id: "ticket-1" }) };

const ticket = {
  id: "ticket-1",
  title: "Leak",
  created_at: new Date("2026-09-02T00:00:00Z"),
  assigned_to_id: null,
  comments: [],
  attachments: [],
};

describe("ticket timeline tenant boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({
      id: "user-1",
      role: "owner",
      company_id: "company-1",
    });
    ticketFindFirstMock.mockResolvedValue(ticket);
    assignedAccessibleMock.mockReturnValue(true);
    workOrderFindFirstMock.mockResolvedValue(null);
    auditFindManyMock.mockResolvedValue([]);
  });

  it("returns 404 without reading related data when the tenant-scoped ticket is absent", async () => {
    ticketFindFirstMock.mockResolvedValue(null);

    const response = await GET(request, context);

    expect(response.status).toBe(404);
    expect(ticketFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "ticket-1", company_id: "company-1", deleted_at: null }),
    }));
    expect(workOrderFindFirstMock).not.toHaveBeenCalled();
    expect(auditFindManyMock).not.toHaveBeenCalled();
    expect(enterpriseStateMock).not.toHaveBeenCalled();
    expect(statusEventsMock).not.toHaveBeenCalled();
  });

  it("returns 404 before related reads when assigned-work access is denied", async () => {
    assignedAccessibleMock.mockReturnValue(false);

    const response = await GET(request, context);

    expect(response.status).toBe(404);
    expect(workOrderFindFirstMock).not.toHaveBeenCalled();
    expect(auditFindManyMock).not.toHaveBeenCalled();
  });

  it("keeps work-order and audit lookups scoped to the authenticated company", async () => {
    const response = await GET(request, context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.timeline).toHaveLength(1);
    expect(workOrderFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { ticket_id: "ticket-1", company_id: "company-1", deleted_at: null },
    }));
    expect(auditFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { company_id: "company-1", entity_type: "ticket", entity_id: "ticket-1" },
    }));
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
