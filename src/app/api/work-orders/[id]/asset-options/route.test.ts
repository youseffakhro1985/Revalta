import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  workOrderFindFirstMock,
  buildingFindManyMock,
  queryRawMock,
  assignedAccessibleMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  workOrderFindFirstMock: vi.fn(),
  buildingFindManyMock: vi.fn(),
  queryRawMock: vi.fn(),
  assignedAccessibleMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("@/lib/assigned-work-access", () => ({
  isAssignedWorkAccessible: assignedAccessibleMock,
  notFoundWorkOrder: () => Response.json({ error: "Arbetsordern hittades inte" }, { status: 404 }),
}));
vi.mock("@/lib/db", () => ({
  default: {
    workOrder: { findFirst: workOrderFindFirstMock },
    building: { findMany: buildingFindManyMock },
    $queryRaw: queryRawMock,
  },
}));

import { GET } from "./route";
import { Prisma } from "@prisma/client";
import { schemaMismatchUserMessage } from "@/lib/schema-readiness";

describe("work-orders/[id]/asset-options GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assignedAccessibleMock.mockReturnValue(true);
    workOrderFindFirstMock.mockResolvedValue({ id: "wo-1", property_id: "property-1", assigned_to_id: null });
    buildingFindManyMock.mockResolvedValue([]);
    queryRawMock.mockResolvedValue([]);
  });

  it("rejects residents before loading buildings or technical assets", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "resident-1",
      company_id: "company-1",
      role: "resident",
      email: "boende@exempel.se",
    });

    const response = await GET(
      new Request("https://www.revalta.se/api/work-orders/wo-1/asset-options"),
      { params: Promise.resolve({ id: "wo-1" }) },
    );

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("En aktiv organisation och personalbehörighet krävs");
    expect(workOrderFindFirstMock).not.toHaveBeenCalled();
    expect(buildingFindManyMock).not.toHaveBeenCalled();
    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it("maps a missing PropertyTechnicalAsset table to 503 SERVICE_UNAVAILABLE", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "owner-1",
      company_id: "company-1",
      role: "owner",
    });
    queryRawMock.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        "The table `public.PropertyTechnicalAsset` does not exist in the current database.",
        {
          code: "P2021",
          clientVersion: "test",
          meta: { table: "public.PropertyTechnicalAsset" },
        },
      ),
    );

    const response = await GET(
      new Request("https://www.revalta.se/api/work-orders/wo-1/asset-options"),
      { params: Promise.resolve({ id: "wo-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBe(schemaMismatchUserMessage());
    expect(body.errorCode).toBe("SERVICE_UNAVAILABLE");
  });
});

describe("work-order asset-options Tenant B", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({
      id: "owner-1",
      company_id: "company-1",
      role: "owner",
    });
    workOrderFindFirstMock.mockResolvedValue(null);
  });

  it("returns tenant-safe 404 when Tenant A reads asset options for a Tenant B work-order id", async () => {
    const response = await GET(
      new Request("https://www.revalta.se/api/work-orders/wo-tenant-b/asset-options"),
      { params: Promise.resolve({ id: "wo-tenant-b" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Arbetsordern hittades inte");
    expect(workOrderFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { deleted_at: null, id: "wo-tenant-b", company_id: "company-1", property: { deleted_at: null } },
    }));
    expect(buildingFindManyMock).not.toHaveBeenCalled();
    expect(queryRawMock).not.toHaveBeenCalled();
  });
});
