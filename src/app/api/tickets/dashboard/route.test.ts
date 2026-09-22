import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  ticketCountMock,
  ticketGroupByMock,
  ticketFindManyMock,
  loggerInfoMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  ticketCountMock: vi.fn(),
  ticketGroupByMock: vi.fn(),
  ticketFindManyMock: vi.fn(),
  loggerInfoMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    ticket: {
      count: ticketCountMock,
      groupBy: ticketGroupByMock,
      findMany: ticketFindManyMock,
    },
  },
}));

vi.mock("@/lib/schema-readiness", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/schema-readiness")>()),
  notDeletedFilter: vi.fn(async () => ({ deleted_at: null })),
}));

vi.mock("@/lib/route-observability", () => ({
  createRouteObservability: () => ({
    requestId: "550e8400-e29b-41d4-a716-446655440000",
    elapsed: (value: unknown) => value,
    correlate: (response: Response) => response,
    logger: { info: loggerInfoMock, warn: vi.fn(), error: vi.fn() },
  }),
}));

import { GET } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";

function request() {
  return new Request("https://www.revalta.se/api/tickets/dashboard", {
    headers: { "x-request-id": requestId },
  });
}

describe("ticket dashboard staff scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ticketCountMock.mockResolvedValue(0);
    ticketGroupByMock.mockResolvedValue([]);
    ticketFindManyMock.mockResolvedValue([]);
  });

  it("rejects residents before counting tickets", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
      status: "active",
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.errorCode).toBe("FORBIDDEN");
    expect(ticketCountMock).not.toHaveBeenCalled();
    expect(ticketFindManyMock).not.toHaveBeenCalled();
  });

  it("lets managers load ticket counts for the caller company", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "manager-1",
      company_id: "company-1",
      role: "manager",
      email: "chef@exempel.se",
      status: "active",
    });

    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(ticketCountMock).toHaveBeenCalled();
    expect(ticketFindManyMock).toHaveBeenCalled();
    for (const [args] of ticketCountMock.mock.calls) {
      expect(args.where).toEqual(expect.objectContaining({ company_id: "company-1" }));
      expect(args.where).not.toEqual(expect.objectContaining({ assigned_to_id: expect.anything() }));
    }
    expect(ticketGroupByMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ company_id: "company-1" }),
    }));
    expect(ticketFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ company_id: "company-1" }),
    }));
  });

  it("keeps technicians on assigned tickets inside the caller company", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "tech-1",
      company_id: "company-1",
      role: "technician",
      email: "tina@exempel.se",
      status: "active",
    });

    const response = await GET(request());
    expect(response.status).toBe(200);
    for (const [args] of ticketCountMock.mock.calls) {
      expect(args.where).toEqual(expect.objectContaining({
        company_id: "company-1",
        assigned_to_id: "tech-1",
      }));
    }
    expect(ticketFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        company_id: "company-1",
        assigned_to_id: "tech-1",
      }),
    }));
  });

  it("ignores a client-supplied Tenant B company_id query parameter", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "owner-1",
      company_id: "company-1",
      role: "owner",
      status: "active",
    });

    const response = await GET(new Request(
      "https://www.revalta.se/api/tickets/dashboard?company_id=company-tenant-b",
      { headers: { "x-request-id": requestId } },
    ));
    expect(response.status).toBe(200);
    for (const [args] of ticketCountMock.mock.calls) {
      expect(args.where).toEqual(expect.objectContaining({ company_id: "company-1" }));
      expect(JSON.stringify(args)).not.toContain("company-tenant-b");
    }
    expect(JSON.stringify(ticketFindManyMock.mock.calls)).not.toContain("company-tenant-b");
  });
});
