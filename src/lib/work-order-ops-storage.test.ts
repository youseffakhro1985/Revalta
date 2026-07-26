import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  timeEntryFindManyMock,
  materialEntryFindManyMock,
  integrationFindManyMock,
  isModernStorageOnlyMock,
} = vi.hoisted(() => ({
  timeEntryFindManyMock: vi.fn(),
  materialEntryFindManyMock: vi.fn(),
  integrationFindManyMock: vi.fn(),
  isModernStorageOnlyMock: vi.fn(),
}));

vi.mock("@/lib/dual-list", () => ({
  isModernStorageOnly: isModernStorageOnlyMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    workOrderTimeEntry: { findMany: timeEntryFindManyMock },
    workOrderMaterialEntry: { findMany: materialEntryFindManyMock },
    integrationEvent: { findMany: integrationFindManyMock },
  },
}));

import { listMaterialEntries, listTimeEntries } from "./work-order-ops-storage";

describe("work-order-ops-storage dual-read source markers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isModernStorageOnlyMock.mockReturnValue(false);
  });

  it("listTimeEntries marks modern rows as table and IE rows as legacy", async () => {
    timeEntryFindManyMock.mockResolvedValue([{
      id: "time-modern",
      work_order_id: "wo-1",
      user_id: "user-1",
      user_name: "Tekniker",
      user_email: "tekniker@example.se",
      kind: "work",
      action: "manual",
      started_at: new Date("2026-07-01T08:00:00.000Z"),
      ended_at: new Date("2026-07-01T09:00:00.000Z"),
      minutes: 60,
      billable: true,
      note: null,
      status: "submitted",
      actor_id: "user-1",
      created_at: new Date("2026-07-01T09:00:00.000Z"),
    }]);
    integrationFindManyMock.mockResolvedValue([{
      id: "ie-1",
      created_at: new Date("2026-07-01T07:00:00.000Z"),
      payload: {
        entryId: "time-legacy",
        workOrderId: "wo-1",
        userId: "user-2",
        userEmail: "legacy@example.se",
        kind: "work",
        action: "manual",
        status: "submitted",
        actorId: "user-2",
      },
    }]);

    const entries = await listTimeEntries("company-1", "wo-1");
    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ entryId: "time-modern", source: "table" }),
      expect.objectContaining({ entryId: "time-legacy", source: "legacy" }),
    ]));
  });

  it("listMaterialEntries marks modern rows as table and IE rows as legacy", async () => {
    materialEntryFindManyMock.mockResolvedValue([{
      id: "mat-modern",
      work_order_id: "wo-1",
      article_number: "A-1",
      name: "Filter",
      quantity: 2,
      unit: "st",
      unit_price: 100,
      total: 200,
      supplier: null,
      stock_status: "in_stock",
      billable: true,
      note: null,
      status: "submitted",
      created_by_id: "user-1",
      created_by_name: "Tekniker",
      created_by_email: "tekniker@example.se",
      actor_id: "user-1",
      created_at: new Date("2026-07-01T09:00:00.000Z"),
    }]);
    integrationFindManyMock.mockResolvedValue([{
      id: "ie-2",
      created_at: new Date("2026-07-01T07:00:00.000Z"),
      payload: {
        entryId: "mat-legacy",
        workOrderId: "wo-1",
        name: "Legacy filter",
        quantity: 1,
        unit: "st",
        unitPrice: 50,
        total: 50,
        stockStatus: "in_stock",
        status: "submitted",
        createdById: "user-2",
        createdByEmail: "legacy@example.se",
        actorId: "user-2",
      },
    }]);

    const entries = await listMaterialEntries("company-1", "wo-1");
    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ entryId: "mat-modern", source: "table" }),
      expect.objectContaining({ entryId: "mat-legacy", source: "legacy" }),
    ]));
  });
});
