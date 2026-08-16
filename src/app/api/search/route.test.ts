import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  propertyFindManyMock,
  ticketFindManyMock,
  workOrderFindManyMock,
  userFindManyMock,
  leaseHolderFindManyMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  propertyFindManyMock: vi.fn(),
  ticketFindManyMock: vi.fn(),
  workOrderFindManyMock: vi.fn(),
  userFindManyMock: vi.fn(),
  leaseHolderFindManyMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async () => {
  const actual = await vi.importActual<typeof import("@/lib/current-user")>("@/lib/current-user");
  return {
    ...actual,
    getCurrentUser: getCurrentUserMock,
  };
});
vi.mock("@/lib/db", () => ({
  default: {
    property: { findMany: propertyFindManyMock },
    ticket: { findMany: ticketFindManyMock },
    workOrder: { findMany: workOrderFindManyMock },
    user: { findMany: userFindManyMock },
    leaseHolder: { findMany: leaseHolderFindManyMock },
  },
}));

import { GET } from "./route";

describe("global search tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    propertyFindManyMock.mockResolvedValue([]);
    ticketFindManyMock.mockResolvedValue([]);
    workOrderFindManyMock.mockResolvedValue([]);
    userFindManyMock.mockResolvedValue([]);
    leaseHolderFindManyMock.mockResolvedValue([]);
  });

  it("scopes property, ticket and work order search to the caller company", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "user-a",
      company_id: "company-a",
      role: "owner",
    });

    const response = await GET(new Request("https://www.revalta.se/api/search?q=port"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(propertyFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ company_id: "company-a" }),
    }));
    expect(ticketFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ company_id: "company-a" }),
    }));
    expect(workOrderFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ company_id: "company-a" }),
    }));
    expect(userFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ company_id: "company-a" }),
    }));
  });

  it("does not use open company filters for users without organisation", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "user-solo",
      company_id: null,
      role: "owner",
    });

    const response = await GET(new Request("https://www.revalta.se/api/search?q=port"));
    expect(response.status).toBe(200);
    expect(propertyFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ user_id: "user-solo" }),
    }));
    expect(workOrderFindManyMock).not.toHaveBeenCalled();
    expect(leaseHolderFindManyMock).not.toHaveBeenCalled();
  });

  it("keeps technicians on assigned ticket and work-order search without directory hits", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "tech-1",
      company_id: "company-a",
      role: "technician",
    });
    workOrderFindManyMock.mockResolvedValue([
      {
        id: "wo-1",
        title: "Kontrollera pump",
        status: "planned",
        work_order_number: "AO-2026-0142",
        property: { name: "Eken 7" },
      },
    ]);

    const response = await GET(new Request("https://www.revalta.se/api/search?q=pump"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(propertyFindManyMock).toHaveBeenCalled();
    expect(ticketFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        company_id: "company-a",
        assigned_to_id: "tech-1",
      }),
    }));
    expect(workOrderFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        company_id: "company-a",
        assigned_to_id: "tech-1",
      }),
    }));
    expect(userFindManyMock).not.toHaveBeenCalled();
    expect(leaseHolderFindManyMock).not.toHaveBeenCalled();
    expect(body.results).toContainEqual(expect.objectContaining({
      type: "work_order",
      href: "/dashboard/arbetsorder/wo-1",
    }));
  });
});
