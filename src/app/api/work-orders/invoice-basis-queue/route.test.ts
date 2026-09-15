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

describe("GET /api/work-orders/invoice-basis-queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workOrderFindManyMock.mockResolvedValue([]);
  });

  it("denies technicians from reading the invoice-basis queue", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await GET();
    expect(response.status).toBe(403);
    expect(workOrderFindManyMock).not.toHaveBeenCalled();
  });

  it("lists work orders with attested billable rows and no usable invoice draft", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "mgr-1", company_id: "company-1", role: "manager" });
    workOrderFindManyMock.mockResolvedValue([{
      id: "wo-1",
      title: "Byte av cirkulationspump",
      status: "completed",
      updated_at: new Date("2026-09-14T12:00:00.000Z"),
      completed_at: new Date("2026-09-14T11:00:00.000Z"),
      property: { id: "prop-1", name: "Storgatan 12" },
      time_entries: [{ id: "t-1" }, { id: "t-2" }],
      material_entries: [{ id: "m-1" }],
      invoice_drafts: [],
    }]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(workOrderFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        company_id: "company-1",
        deleted_at: null,
        status: { notIn: ["invoiced", "cancelled"] },
      }),
    }));
    expect(JSON.stringify(workOrderFindManyMock.mock.calls[0]?.[0])).toContain("approved");
    expect(JSON.stringify(workOrderFindManyMock.mock.calls[0]?.[0])).toContain("billable");
    expect(body.summary).toEqual({ workOrders: 1, approvedTime: 2, approvedMaterial: 1 });
    expect(body.workOrders[0]).toEqual(expect.objectContaining({
      id: "wo-1",
      statusLabel: "Klar",
      approvedTime: 2,
      approvedMaterial: 1,
      draftStatus: "missing",
      draftStatusLabel: "Saknas",
      href: "/dashboard/arbetsorder/wo-1#ekonomi",
    }));
  });

  it("hides ready or exported drafts but keeps lined drafts so they can be marked ready", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "mgr-1", company_id: "company-1", role: "manager" });
    workOrderFindManyMock.mockResolvedValue([
      {
        id: "wo-ready",
        title: "Klar underlag",
        status: "completed",
        updated_at: new Date("2026-09-14T12:00:00.000Z"),
        completed_at: null,
        property: { id: "prop-1", name: "Storgatan 12" },
        time_entries: [{ id: "t-1" }],
        material_entries: [],
        invoice_drafts: [{ status: "ready", lines: [], customer_name: "Kund AB" }],
      },
      {
        id: "wo-lines",
        title: "Har rader",
        status: "completed",
        updated_at: new Date("2026-09-14T12:00:00.000Z"),
        completed_at: null,
        property: { id: "prop-1", name: "Storgatan 12" },
        time_entries: [{ id: "t-2" }],
        material_entries: [],
        invoice_drafts: [{ status: "draft", lines: [{ id: "line-1" }], customer_name: "" }],
      },
      {
        id: "wo-empty",
        title: "Tomt utkast",
        status: "completed",
        updated_at: new Date("2026-09-14T12:00:00.000Z"),
        completed_at: null,
        property: { id: "prop-1", name: "Storgatan 12" },
        time_entries: [{ id: "t-3" }],
        material_entries: [],
        invoice_drafts: [{ status: "draft", lines: [], customer_name: "" }],
      },
    ]);

    const response = await GET();
    const body = await response.json();
    expect(body.workOrders.map((row: { id: string }) => row.id)).toEqual(["wo-lines", "wo-empty"]);
    expect(body.workOrders[0]).toEqual(expect.objectContaining({
      id: "wo-lines",
      draftStatus: "built",
      draftStatusLabel: "Utkast med rader",
      lineCount: 1,
    }));
    expect(body.workOrders[1].draftStatus).toBe("empty");
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
