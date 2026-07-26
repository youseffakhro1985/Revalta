import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  ticketFindFirstMock,
  operationFindManyMock,
  auditFindManyMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  ticketFindFirstMock: vi.fn(),
  operationFindManyMock: vi.fn(),
  auditFindManyMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    ticket: { findFirst: ticketFindFirstMock },
    ticketOperation: { findMany: operationFindManyMock },
    auditLog: { findMany: auditFindManyMock },
  },
}));

import { GET } from "./route";

describe("ticket operations route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ticketFindFirstMock.mockResolvedValue({ id: "ticket-1", company_id: "company-1" });
    auditFindManyMock.mockResolvedValue([]);
  });

  it("returns modern ticket operations with legacy action shape", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1", role: "owner" });
    operationFindManyMock.mockResolvedValue([
      {
        id: "op-1",
        operation_type: "time",
        description: "Arbete",
        minutes: 45,
        amount: null,
        completed: null,
        ticket_title: "Läckage",
        created_at: new Date("2026-07-20T10:00:00Z"),
        created_by: { name: "Anna", email: "anna@example.se" },
      },
    ]);

    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "ticket-1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(operationFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { company_id: "company-1", ticket_id: "ticket-1" },
    }));
    expect(body.operations[0].action).toBe("workorder.time.added");
    expect(body.operations[0].metadata.minutes).toBe(45);
  });
});
