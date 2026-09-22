import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserMock, workOrderFindManyMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  workOrderFindManyMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    workOrder: { findMany: workOrderFindManyMock },
  },
}));

import { GET } from "./route";

describe("GET /api/work-orders/invoice-close-queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workOrderFindManyMock.mockResolvedValue([]);
  });

  it("denies technicians from reading the invoice close queue", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await GET();
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet att fakturera arbetsordrar");
    expect(workOrderFindManyMock).not.toHaveBeenCalled();
  });

  it("rejects residents before listing invoice-close drafts", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      role: "resident",
      company_id: "company-1",
      email: "boende@exempel.se",
    });
    const response = await GET();
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(workOrderFindManyMock).not.toHaveBeenCalled();
  });

  it("lists completed work orders whose latest draft is ready or exported", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "mgr-1", company_id: "company-1", role: "manager" });
    workOrderFindManyMock.mockResolvedValue([{
      id: "wo-1",
      title: "Byte av cirkulationspump",
      status: "completed",
      updated_at: new Date("2026-09-15T08:00:00.000Z"),
      completed_at: new Date("2026-09-15T07:00:00.000Z"),
      property: { id: "prop-1", name: "Storgatan 12" },
      invoice_drafts: [{ status: "ready", customer_name: "Kund AB", total: 8125 }],
    }]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(workOrderFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        company_id: "company-1",
        deleted_at: null,
        status: "completed",
      }),
    }));
    expect(body.summary).toEqual({ workOrders: 1 });
    expect(body.workOrders[0]).toEqual(expect.objectContaining({
      id: "wo-1",
      customerName: "Kund AB",
      total: 8125,
      draftStatus: "ready",
      href: "/dashboard/arbetsorder/wo-1#ekonomi",
    }));
  });

  it("hides drafts that are not latest-ready and keeps exported drafts", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "mgr-1", company_id: "company-1", role: "manager" });
    workOrderFindManyMock.mockResolvedValue([
      {
        id: "wo-draft",
        title: "Utkast",
        status: "completed",
        updated_at: new Date("2026-09-15T08:00:00.000Z"),
        completed_at: null,
        property: { id: "prop-1", name: "Storgatan 12" },
        invoice_drafts: [{ status: "draft", customer_name: "Kund AB", total: 100 }],
      },
      {
        id: "wo-exported",
        title: "Exporterad",
        status: "completed",
        updated_at: new Date("2026-09-15T08:00:00.000Z"),
        completed_at: null,
        property: { id: "prop-1", name: "Storgatan 12" },
        invoice_drafts: [{ status: "exported", customer_name: "Kund AB", total: 300 }],
      },
    ]);

    const response = await GET();
    const body = await response.json();
    expect(body.workOrders.map((row: { id: string }) => row.id)).toEqual(["wo-exported"]);
    expect(body.workOrders[0].draftStatus).toBe("exported");
  });

  it("returns an empty queue without leaking other tenants", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "mgr-2", company_id: "company-2", role: "owner" });
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.workOrders).toEqual([]);
    expect(workOrderFindManyMock.mock.calls[0]?.[0].where.company_id).toBe("company-2");
  });
});
