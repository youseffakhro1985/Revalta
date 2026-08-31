import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  workOrderFindFirstMock,
  listTimeEntriesMock,
  listMaterialEntriesMock,
  getProfitabilitySettingsMock,
  getLatestInvoiceDraftMock,
  createInvoiceDraftMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  workOrderFindFirstMock: vi.fn(),
  listTimeEntriesMock: vi.fn(),
  listMaterialEntriesMock: vi.fn(),
  getProfitabilitySettingsMock: vi.fn(),
  getLatestInvoiceDraftMock: vi.fn(),
  createInvoiceDraftMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    workOrder: { findFirst: workOrderFindFirstMock },
  },
}));

vi.mock("@/lib/work-order-ops-storage", () => ({
  listTimeEntries: listTimeEntriesMock,
  listMaterialEntries: listMaterialEntriesMock,
  getProfitabilitySettings: getProfitabilitySettingsMock,
  getLatestInvoiceDraft: getLatestInvoiceDraftMock,
  createInvoiceDraft: createInvoiceDraftMock,
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));

import { GET } from "./route";

const params = { params: Promise.resolve({ id: "wo-1" }) };

describe("work-order invoice basis material approval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({
      id: "manager-1",
      email: "manager@example.com",
      name: "Manager",
      role: "manager",
      company_id: "company-1",
    });
    workOrderFindFirstMock.mockResolvedValue({
      id: "wo-1",
      title: "Byte av filter",
      status: "completed",
      property: { name: "Fastigheten", address: "Storgatan 1", postal_code: "411 01", city: "Göteborg" },
      unit: null,
      company: { name: "Bolaget AB", org_number: "556000-0000" },
    });
    listTimeEntriesMock.mockResolvedValue([]);
    getProfitabilitySettingsMock.mockResolvedValue({
      customerHourlyRate: 650,
      materialMarkupPercent: 15,
      fixedRevenue: 0,
    });
    getLatestInvoiceDraftMock.mockResolvedValue(null);
    createInvoiceDraftMock.mockResolvedValue(null);
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("includes only approved billable material in generated invoice source and lines", async () => {
    listMaterialEntriesMock.mockResolvedValue([
      { entryId: "approved", status: "approved", total: 100, billable: true },
      { entryId: "approved-private", status: "approved", total: 50, billable: false },
      { entryId: "submitted", status: "submitted", total: 900, billable: true },
      { entryId: "rejected", status: "rejected", total: 700, billable: true },
      { entryId: "deleted", status: "deleted", total: 500, billable: true },
    ]);

    const response = await GET(new Request("https://www.revalta.se/api/work-orders/wo-1/invoice-basis"), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.source.billableMaterial).toBe(100);
    const materialLines = body.draft.lines.filter((line: { type: string }) => line.type === "material");
    expect(materialLines).toHaveLength(1);
    expect(materialLines[0]).toEqual(expect.objectContaining({
      type: "material",
      description: "Material enligt arbetsorder",
      quantity: 1,
      unit: "st",
      unitPrice: 115,
      total: 115,
    }));
  });

  it("generates no material invoice line while all billable material is awaiting approval", async () => {
    listMaterialEntriesMock.mockResolvedValue([
      { entryId: "submitted", status: "submitted", total: 900, billable: true },
    ]);

    const response = await GET(new Request("https://www.revalta.se/api/work-orders/wo-1/invoice-basis"), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.source.billableMaterial).toBe(0);
    expect(body.draft.lines.some((line: { type: string }) => line.type === "material")).toBe(false);
  });
});
