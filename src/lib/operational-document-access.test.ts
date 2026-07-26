import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  workOrderFindFirstMock,
  projectFindFirstMock,
  propertyFindFirstMock,
  queryRawMock,
} = vi.hoisted(() => ({
  workOrderFindFirstMock: vi.fn(),
  projectFindFirstMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
  queryRawMock: vi.fn(),
}));

vi.mock("@/lib/soft-delete-compat", () => ({
  sqlSoftDeleteGuard: vi.fn(async () => Prisma.empty),
}));

vi.mock("@/lib/db", () => ({
  default: {
    workOrder: { findFirst: workOrderFindFirstMock },
    project: { findFirst: projectFindFirstMock },
    property: { findFirst: propertyFindFirstMock },
    $queryRaw: queryRawMock,
  },
}));

import { isOperationalDocumentParentActive } from "./operational-document-access";

describe("isOperationalDocumentParentActive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires active property on work-order parents", async () => {
    workOrderFindFirstMock.mockResolvedValue(null);
    await expect(isOperationalDocumentParentActive("company-1", {
      work_order_id: "wo-1",
      project_id: null,
      property_id: null,
      technical_asset_id: null,
    })).resolves.toBe(false);
    expect(workOrderFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        deleted_at: null,
        id: "wo-1",
        company_id: "company-1",
        property: { deleted_at: null },
      },
    }));
  });

  it("allows documents on active properties", async () => {
    propertyFindFirstMock.mockResolvedValue({ id: "prop-1" });
    await expect(isOperationalDocumentParentActive("company-1", {
      work_order_id: null,
      project_id: null,
      property_id: "prop-1",
      technical_asset_id: null,
    })).resolves.toBe(true);
  });

  it("joins Property for technical assets", async () => {
    queryRawMock.mockResolvedValue([{ id: "asset-1" }]);
    await expect(isOperationalDocumentParentActive("company-1", {
      work_order_id: null,
      project_id: null,
      property_id: null,
      technical_asset_id: "asset-1",
    })).resolves.toBe(true);
    expect(queryRawMock).toHaveBeenCalled();
  });
});
