import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  ticketFindFirstMock,
  workOrderFindFirstMock,
  auditLogFindManyMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  ticketFindFirstMock: vi.fn(),
  workOrderFindFirstMock: vi.fn(),
  auditLogFindManyMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    ticket: { findFirst: ticketFindFirstMock },
    workOrder: { findFirst: workOrderFindFirstMock },
    auditLog: { findMany: auditLogFindManyMock },
  },
}));

import { GET } from "./route";

describe("ticket timeline Tenant B", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({
      id: "owner-1",
      company_id: "company-1",
      role: "owner",
    });
    ticketFindFirstMock.mockResolvedValue(null);
  });

  it("returns tenant-safe 404 when Tenant A reads the timeline for a Tenant B ticket id", async () => {
    const response = await GET(
      new Request("https://www.revalta.se/api/tickets/ticket-tenant-b/timeline"),
      { params: Promise.resolve({ id: "ticket-tenant-b" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Ärendet hittades inte");
    expect(ticketFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "ticket-tenant-b",
        deleted_at: null,
        company_id: "company-1",
      }),
    }));
    expect(workOrderFindFirstMock).not.toHaveBeenCalled();
    expect(auditLogFindManyMock).not.toHaveBeenCalled();
  });
});
