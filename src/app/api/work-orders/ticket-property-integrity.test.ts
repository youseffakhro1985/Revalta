import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  propertyFindFirstMock,
  transactionMock,
  findAccessibleTicketMock,
  validateWorkOrderAssetLinksMock,
  loggerWarnMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
  transactionMock: vi.fn(),
  findAccessibleTicketMock: vi.fn(),
  validateWorkOrderAssetLinksMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    property: { findFirst: propertyFindFirstMock },
    $transaction: transactionMock,
  },
}));

vi.mock("@/lib/assigned-work-access", () => ({
  findAccessibleTicket: findAccessibleTicketMock,
}));

vi.mock("@/lib/work-order-asset-links", () => ({
  validateWorkOrderAssetLinks: validateWorkOrderAssetLinksMock,
  setWorkOrderAssetLinks: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));

vi.mock("@/lib/route-observability", () => ({
  createRouteObservability: () => ({
    requestId: "550e8400-e29b-41d4-a716-446655440000",
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: loggerWarnMock,
      error: vi.fn(),
    },
    elapsed: (context: Record<string, unknown>) => context,
    correlate: (response: Response) => response,
  }),
}));

import { POST } from "./route";

function request(ticketId = "ticket-1") {
  return new Request("https://www.revalta.se/api/work-orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      propertyId: "property-1",
      ticketId,
      title: "Kontrollera läckage",
      description: "Kontrollera och dokumentera",
    }),
  });
}

describe("work-order ticket/property relation integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({
      id: "manager-1",
      email: "manager@example.com",
      name: "Manager",
      role: "manager",
      company_id: "company-1",
    });
    propertyFindFirstMock.mockResolvedValue({ id: "property-1" });
  });

  it("rejects linking a propertyless ticket to a work order", async () => {
    findAccessibleTicketMock.mockResolvedValue({
      id: "ticket-1",
      assigned_to_id: null,
      property_id: null,
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Ärendet måste kopplas till en fastighet innan det kan länkas till en arbetsorder");
    expect(body.requestId).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(validateWorkOrderAssetLinksMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "work-order request rejected",
      expect.objectContaining({ reason: "ticket_missing_property" }),
    );
  });

  it("rejects linking a ticket from another property in the same company", async () => {
    findAccessibleTicketMock.mockResolvedValue({
      id: "ticket-1",
      assigned_to_id: null,
      property_id: "property-2",
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Ärendet tillhör inte vald fastighet");
    expect(body.requestId).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(validateWorkOrderAssetLinksMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "work-order request rejected",
      expect.objectContaining({ reason: "ticket_property_mismatch" }),
    );
  });
});
