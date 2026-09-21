import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  ticketFindFirstMock,
  transactionMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  ticketFindFirstMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    ticket: { findFirst: ticketFindFirstMock },
    $transaction: transactionMock,
  },
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/ticket-reporter-notify", () => ({ notifyTicketReporter: vi.fn() }));
vi.mock("@/lib/structured-logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

import { POST } from "./route";

const TENANT_A = "company-a";
const TICKET_B = "ticket-tenant-b";

function request(ticketId: string) {
  return new Request(`https://www.revalta.se/api/tickets/${ticketId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: "Intern kommentar", isInternal: false }),
  });
}

describe("staff ticket comments tenant boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ticketFindFirstMock.mockResolvedValue(null);
  });

  it("returns 403 and does not read tickets when a resident uses the staff comment API", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-a",
      company_id: TENANT_A,
      role: "resident",
      email: "boende-a@exempel.se",
    });

    const response = await POST(request(TICKET_B), { params: Promise.resolve({ id: TICKET_B }) });

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(ticketFindFirstMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("denies viewers with the comment-manage copy", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "viewer-a",
      company_id: TENANT_A,
      role: "viewer",
    });

    const response = await POST(request(TICKET_B), { params: Promise.resolve({ id: TICKET_B }) });

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet att kommentera ärenden");
    expect(ticketFindFirstMock).not.toHaveBeenCalled();
  });

  it("returns tenant-safe 404 when Tenant A comments on a Tenant B ticket id", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "manager-a",
      company_id: TENANT_A,
      role: "manager",
      email: "chef@exempel.se",
      name: "Chef",
    });

    const response = await POST(request(TICKET_B), { params: Promise.resolve({ id: TICKET_B }) });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Ärendet hittades inte");
    expect(ticketFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: TICKET_B,
        company_id: TENANT_A,
        deleted_at: null,
      }),
    }));
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
