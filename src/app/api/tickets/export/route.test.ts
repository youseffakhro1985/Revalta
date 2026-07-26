import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserMock, ticketFindManyMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  ticketFindManyMock: vi.fn(),
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
    ticket: { findMany: ticketFindManyMock },
  },
}));

import { GET } from "./route";

describe("ticket export tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ticketFindManyMock.mockResolvedValue([]);
  });

  it("exports only tickets for the caller company", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "user-a",
      company_id: "company-a",
      role: "owner",
    });

    const response = await GET();
    expect(response.status).toBe(200);
    expect(ticketFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { company_id: "company-a" },
    }));
  });

  it("denies export for roles without permission", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "user-a",
      company_id: "company-a",
      role: "viewer",
    });

    const response = await GET();
    expect(response.status).toBe(403);
    expect(ticketFindManyMock).not.toHaveBeenCalled();
  });
});
