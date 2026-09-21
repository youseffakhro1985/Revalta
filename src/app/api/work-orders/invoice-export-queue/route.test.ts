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

describe("GET /api/work-orders/invoice-export-queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workOrderFindManyMock.mockResolvedValue([]);
  });

  it("denies technicians from reading the invoice export queue", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });
    const response = await GET();
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Du saknar behörighet att köa fakturaexport");
    expect(workOrderFindManyMock).not.toHaveBeenCalled();
  });

  it("rejects residents before listing invoice-export drafts", async () => {
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

  it("lists ready drafts that are not already queued or exported", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "mgr-1", company_id: "company-1", role: "manager" });
    workOrderFindManyMock.mockResolvedValue([{
      id: "wo-1",
      title: "Byte av cirkulationspump",
      status: "completed",
      updated_at: new Date("2026-09-15T08:00:00.000Z"),
      completed_at: new Date("2026-09-15T07:00:00.000Z"),
      property: { id: "prop-1", name: "Storgatan 12" },
      invoice_drafts: [{
        status: "ready",
        customer_name: "Kund AB",
        total: 8125,
        version_id: "ver-1",
      }],
      invoice_export_jobs: [],
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
    expect(JSON.stringify(workOrderFindManyMock.mock.calls[0]?.[0])).toContain("ready");
    expect(body.summary).toEqual({ workOrders: 1 });
    expect(body.workOrders[0]).toEqual(expect.objectContaining({
      id: "wo-1",
      customerName: "Kund AB",
      total: 8125,
      href: "/dashboard/arbetsorder/wo-1#ekonomi",
    }));
    expect(body.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "webhook" }),
    ]));
  });

  it("hides drafts that are not latest-ready or already have an export job", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "mgr-1", company_id: "company-1", role: "manager" });
    workOrderFindManyMock.mockResolvedValue([
      {
        id: "wo-draft",
        title: "Utkast",
        status: "completed",
        updated_at: new Date("2026-09-15T08:00:00.000Z"),
        completed_at: null,
        property: { id: "prop-1", name: "Storgatan 12" },
        invoice_drafts: [{ status: "draft", customer_name: "Kund AB", total: 100, version_id: "ver-d" }],
        invoice_export_jobs: [],
      },
      {
        id: "wo-queued",
        title: "Redan köad",
        status: "completed",
        updated_at: new Date("2026-09-15T08:00:00.000Z"),
        completed_at: null,
        property: { id: "prop-1", name: "Storgatan 12" },
        invoice_drafts: [{ status: "ready", customer_name: "Kund AB", total: 200, version_id: "ver-q" }],
        invoice_export_jobs: [{ status: "queued", invoice_version_id: "ver-q" }],
      },
      {
        id: "wo-ready",
        title: "Redo",
        status: "completed",
        updated_at: new Date("2026-09-15T08:00:00.000Z"),
        completed_at: null,
        property: { id: "prop-1", name: "Storgatan 12" },
        invoice_drafts: [{ status: "ready", customer_name: "Kund AB", total: 300, version_id: "ver-r" }],
        invoice_export_jobs: [{ status: "cancelled", invoice_version_id: "ver-r" }],
      },
      {
        id: "wo-sent",
        title: "Redan skickad",
        status: "completed",
        updated_at: new Date("2026-09-15T08:00:00.000Z"),
        completed_at: null,
        property: { id: "prop-1", name: "Storgatan 12" },
        invoice_drafts: [{ status: "ready", customer_name: "Kund AB", total: 400, version_id: "ver-s" }],
        invoice_export_jobs: [{ status: "sent", invoice_version_id: "ver-s" }],
      },
      {
        id: "wo-failed",
        title: "Misslyckad export",
        status: "completed",
        updated_at: new Date("2026-09-15T08:00:00.000Z"),
        completed_at: null,
        property: { id: "prop-1", name: "Storgatan 12" },
        invoice_drafts: [{ status: "ready", customer_name: "Kund AB", total: 500, version_id: "ver-f" }],
        invoice_export_jobs: [{ status: "failed", invoice_version_id: "ver-f" }],
      },
    ]);

    const response = await GET();
    const body = await response.json();
    expect(body.workOrders.map((row: { id: string }) => row.id)).toEqual(["wo-ready"]);
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
