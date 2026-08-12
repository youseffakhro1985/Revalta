import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserMock, userFindFirstMock, ticketCreateMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  userFindFirstMock: vi.fn(),
  ticketCreateMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("@/lib/db", () => ({
  default: {
    user: { findFirst: userFindFirstMock },
    ticket: { create: ticketCreateMock },
  },
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/integrations", () => ({ queueTicketNotification: vi.fn(), recordAiEvent: vi.fn() }));

import { POST } from "./route";

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
  beforeEach(() => vi.clearAllMocks());

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
});
