import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserMock, ticketFindFirstMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  ticketFindFirstMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    ticket: { findFirst: ticketFindFirstMock },
  },
}));

import { GET } from "./route";

const params = Promise.resolve({ id: "ticket-1" });

function ticketRow() {
  return {
    id: "ticket-1",
    title: "Läckande kran",
    description: "Det droppar",
    status: "new",
    category: "vvs",
    priority: "normal",
    public_reference: "REF-1",
    source: "portal",
    reporter_name: "Anna Andersson",
    reporter_email: "anna@example.se",
    reporter_phone: "0701234567",
    reporter_unit: "1201",
    property_id: "property-1",
    assigned_to_id: "tech-1",
    created_at: new Date("2026-08-01T10:00:00Z"),
    updated_at: new Date("2026-08-01T10:00:00Z"),
    due_date: null,
    ai_summary: null,
    ai_recommended_action: null,
    ai_confidence: null,
    ai_processed_at: null,
    property: { id: "property-1", name: "Storgatan 1", address: "Storgatan 1", city: "Stockholm" },
    assigned_to: { id: "tech-1", name: "Tekniker", email: "tech@example.com" },
    comments: [],
    attachments: [],
  };
}

describe("ticket detail capability contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets an assigned technician manage the ticket without assignment authority", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    ticketFindFirstMock.mockResolvedValue(ticketRow());

    const response = await GET(new Request("http://localhost/api/tickets/ticket-1"), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.permissions).toEqual({ canManage: true, canAssign: false });
  });
});
