import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  workOrderFindFirstMock,
  listTimeEntriesMock,
  listMaterialEntriesMock,
  getProfitabilitySettingsMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  workOrderFindFirstMock: vi.fn(),
  listTimeEntriesMock: vi.fn(),
  listMaterialEntriesMock: vi.fn(),
  getProfitabilitySettingsMock: vi.fn(),
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
  getModernProfitabilitySettings: vi.fn(),
  upsertProfitabilitySettings: vi.fn(),
}));

import { GET } from "./route";

describe("work-order profitability route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workOrderFindFirstMock.mockResolvedValue({
      id: "wo-1",
      title: "Byte av packning",
      estimated_cost: null,
      actual_cost: null,
    });
    listTimeEntriesMock.mockResolvedValue([]);
    listMaterialEntriesMock.mockResolvedValue([]);
    getProfitabilitySettingsMock.mockResolvedValue({
      internalHourlyCost: 350,
      customerHourlyRate: 650,
      materialMarkupPercent: 15,
      otherCost: 0,
      fixedRevenue: 0,
    });
  });

  it("denies technicians from reading profitability", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "tech-1", company_id: "company-1", role: "technician" });

    const response = await GET(new Request("https://www.revalta.se/api/work-orders/wo-1/profitability"), {
      params: Promise.resolve({ id: "wo-1" }),
    });

    expect(response.status).toBe(403);
    expect(workOrderFindFirstMock).not.toHaveBeenCalled();
  });

  it("allows managers to read profitability", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "manager-1", company_id: "company-1", role: "manager" });

    const response = await GET(new Request("https://www.revalta.se/api/work-orders/wo-1/profitability"), {
      params: Promise.resolve({ id: "wo-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.canManage).toBe(true);
  });

  it("allows viewers to read but not manage profitability", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "viewer-1", company_id: "company-1", role: "viewer" });

    const response = await GET(new Request("https://www.revalta.se/api/work-orders/wo-1/profitability"), {
      params: Promise.resolve({ id: "wo-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.canManage).toBe(false);
  });
});
