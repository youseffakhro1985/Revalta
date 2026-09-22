import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  ticketFindFirstMock,
  analyzeTicketMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  ticketFindFirstMock: vi.fn(),
  analyzeTicketMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/ai", () => ({ analyzeTicket: analyzeTicketMock }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/integrations", () => ({ recordAiEvent: vi.fn() }));
vi.mock("@/lib/schema-readiness", () => ({
  hasTicketAiSourceColumn: vi.fn(async () => false),
  ticketAiSourceSelect: () => ({}),
  ticketAiSourceWrite: () => ({}),
}));
vi.mock("@/lib/db", () => ({
  default: {
    ticket: {
      findFirst: ticketFindFirstMock,
      updateMany: vi.fn(),
    },
  },
}));

import { POST } from "./route";

const params = { params: Promise.resolve({ id: "ticket-1" }) };

describe("tickets/[id]/ai POST staff-scope", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects residents before looking up a ticket or calling AI", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });

    const response = await POST(
      new Request("https://www.revalta.se/api/tickets/ticket-1/ai", { method: "POST" }),
      params,
    );

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(ticketFindFirstMock).not.toHaveBeenCalled();
    expect(analyzeTicketMock).not.toHaveBeenCalled();
  });

  it("denies viewers with the AI-manage copy", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "viewer-1", company_id: "company-1", role: "viewer" });

    const response = await POST(
      new Request("https://www.revalta.se/api/tickets/ticket-1/ai", { method: "POST" }),
      params,
    );

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet att AI-analysera ärenden");
    expect(ticketFindFirstMock).not.toHaveBeenCalled();
    expect(analyzeTicketMock).not.toHaveBeenCalled();
  });
});

describe("ticket AI Tenant B", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({
      id: "owner-1",
      company_id: "company-1",
      role: "owner",
    });
    ticketFindFirstMock.mockResolvedValue(null);
  });

  it("returns tenant-safe 404 when Tenant A AI-analyzes a Tenant B ticket id", async () => {
    const response = await POST(
      new Request("https://www.revalta.se/api/tickets/ticket-tenant-b/ai", { method: "POST" }),
      { params: Promise.resolve({ id: "ticket-tenant-b" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Ärendet hittades inte");
    expect(ticketFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "ticket-tenant-b", company_id: "company-1", deleted_at: null }),
    }));
    expect(analyzeTicketMock).not.toHaveBeenCalled();
  });
});
