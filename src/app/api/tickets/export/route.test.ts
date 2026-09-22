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
      where: {
        company_id: "company-a",
        deleted_at: null,
        OR: [{ property_id: null }, { property: { deleted_at: null } }],
      },
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
    expect((await response.json()).error).toBe("Du saknar behörighet att exportera ärenden");
    expect(ticketFindManyMock).not.toHaveBeenCalled();
  });

  it("rejects residents before exporting reporter or assignee emails", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-a",
      email: "boende@exempel.se",
    });

    const response = await GET();

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(ticketFindManyMock).not.toHaveBeenCalled();
  });

  it("quotes formula-like cells so CSV cannot execute Tenant B or injected titles", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "user-a",
      company_id: "company-a",
      role: "owner",
    });
    ticketFindManyMock.mockResolvedValue([{
      public_reference: "RV-1",
      title: "=CMD(TenantB)",
      status: "new",
      priority: "high",
      category: "other",
      due_date: null,
      created_at: new Date("2026-09-22T12:00:00.000Z"),
      reporter_email: "a@example.se",
      property: { name: "+Hyra" },
      assigned_to: { email: "owner@a.se", name: "Owner" },
    }]);

    const response = await GET();
    const csv = await response.text();

    expect(response.status).toBe(200);
    expect(csv).toContain("\"'=CMD(TenantB)\"");
    expect(csv).toContain("\"'+Hyra\"");
    expect(csv).not.toContain("\"=CMD(TenantB)\"");
    expect(csv).not.toMatch(/(?:^|,)=CMD\(TenantB\)(?:$|,)/);
  });
});
