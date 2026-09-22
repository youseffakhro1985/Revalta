import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserMock, noticeFindManyMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  noticeFindManyMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    rentNotice: { findMany: noticeFindManyMock },
  },
}));

import { GET } from "./route";

describe("GET /api/rent-notices/status-queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    noticeFindManyMock.mockResolvedValue([]);
  });

  it("denies technicians from reading the rent notice status queue", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await GET();
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet att ändra aviestatus");
    expect(noticeFindManyMock).not.toHaveBeenCalled();
  });

  it("rejects residents before listing rent-notice tenant names", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await GET();
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(noticeFindManyMock).not.toHaveBeenCalled();
  });

  it("lists unpaid modern notices with the next manual status action", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "mgr-1", company_id: "company-1", role: "manager" });
    noticeFindManyMock.mockResolvedValue([
      {
        id: "notice-draft",
        tenant_name: "Anna Andersson",
        unit: "1101",
        period: "2026-09",
        due_date: new Date("2026-09-30T00:00:00.000Z"),
        status: "draft",
        total: 12500,
        property: { name: "Storgatan 12" },
      },
      {
        id: "notice-sent",
        tenant_name: "Bo Bengtsson",
        unit: "",
        period: "2026-08",
        due_date: new Date("2026-08-31T00:00:00.000Z"),
        status: "sent",
        total: 9800,
        property: { name: "Storgatan 12" },
      },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(noticeFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        company_id: "company-1",
        status: { notIn: ["paid", "credited"] },
      }),
    }));
    expect(body.notices[0]).toEqual(expect.objectContaining({
      id: "notice-draft",
      nextStatus: "sent",
      nextStatusLabel: "Markera som skickad",
      canMarkOverdue: false,
      href: "/dashboard/hyresavisering?id=notice-draft",
    }));
    expect(body.notices[1]).toEqual(expect.objectContaining({
      id: "notice-sent",
      nextStatus: "paid",
      nextStatusLabel: "Markera som betald",
      canMarkOverdue: true,
    }));
  });

  it("returns an empty queue without leaking other tenants", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "mgr-2", company_id: "company-2", role: "owner" });
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.notices).toEqual([]);
    expect(noticeFindManyMock.mock.calls[0]?.[0].where.company_id).toBe("company-2");
  });
});
