import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserMock, userFindFirstMock, ticketCreateMock, ticketFindManyMock, ticketCountMock, transactionMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  userFindFirstMock: vi.fn(),
  ticketCreateMock: vi.fn(),
  ticketFindManyMock: vi.fn(),
  ticketCountMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("@/lib/db", () => ({
  default: {
    user: { findFirst: userFindFirstMock },
    ticket: { create: ticketCreateMock, findMany: ticketFindManyMock, count: ticketCountMock },
    $transaction: transactionMock,
  },
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/integrations", () => ({ queueTicketNotification: vi.fn(), recordAiEvent: vi.fn() }));
vi.mock("@/lib/schema-readiness", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/schema-readiness")>()),
  notDeletedFilter: vi.fn(async () => ({ deleted_at: null })),
}));

import { GET, POST } from "./route";

function request(overrides: Record<string, unknown> = {}) {
  return new Request("https://www.revalta.se/api/tickets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Läckande kran",
      description: "Det droppar kontinuerligt från kökskranen.",
      category: "vvs",
      priority: "normal",
      ...overrides,
    }),
  });
}

describe("POST /api/tickets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionMock.mockImplementation(async (callback) => callback({
      ticket: { create: ticketCreateMock },
      auditLog: { create: vi.fn() },
    }));
  });

  it("prevents technicians from assigning a new ticket to another user", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });

    const response = await POST(request({ assignedToId: "tech-2" }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Du saknar behörighet att tilldela ärenden till andra",
    });
    expect(userFindFirstMock).not.toHaveBeenCalled();
    expect(ticketCreateMock).not.toHaveBeenCalled();
  });

  it("rejects unsupported category and priority values", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "manager-1", company_id: "company-1", role: "manager" });

    const categoryResponse = await POST(request({ category: "<script>" }));
    const priorityResponse = await POST(request({ priority: "super-urgent" }));

    expect(categoryResponse.status).toBe(400);
    expect(priorityResponse.status).toBe(400);
    expect(ticketCreateMock).not.toHaveBeenCalled();
  });

  it("creates the ticket inside the same transaction as its audit record", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "manager-1",
      email: "manager@example.se",
      company_id: "company-1",
      role: "manager",
    });
    ticketCreateMock.mockResolvedValue({
      id: "ticket-1",
      title: "Läckande kran",
      category: "vvs",
      priority: "normal",
      assigned_to_id: null,
    });

    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(ticketCreateMock).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/tickets pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({ id: "manager-1", company_id: "company-1", role: "manager" });
    ticketFindManyMock.mockResolvedValue([]);
    ticketCountMock.mockResolvedValue(245);
  });

  it("bounds page size and returns tenant-scoped pagination metadata", async () => {
    const response = await GET(new Request("https://www.revalta.se/api/tickets?page=3&pageSize=1000"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(ticketFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ skip: 200, take: 100 }));
    expect(ticketCountMock).toHaveBeenCalledWith(expect.objectContaining({ where: expect.any(Object) }));
    expect(body.pagination).toEqual({ page: 3, pageSize: 100, total: 245, totalPages: 3 });
  });
});
