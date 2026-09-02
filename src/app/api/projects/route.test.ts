import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  projectFindManyMock,
  projectCountMock,
  projectAggregateMock,
  propertyFindManyMock,
  propertyFindFirstMock,
  userFindManyMock,
  userFindFirstMock,
  workOrderFindFirstMock,
  projectCreateMock,
  transactionMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  projectFindManyMock: vi.fn(),
  projectCountMock: vi.fn(),
  projectAggregateMock: vi.fn(),
  propertyFindManyMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
  userFindManyMock: vi.fn(),
  userFindFirstMock: vi.fn(),
  workOrderFindFirstMock: vi.fn(),
  projectCreateMock: vi.fn(),
  transactionMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));

vi.mock("@/lib/db", () => ({
  default: {
    project: {
      findMany: projectFindManyMock,
      count: projectCountMock,
      aggregate: projectAggregateMock,
    },
    property: { findMany: propertyFindManyMock, findFirst: propertyFindFirstMock },
    user: { findMany: userFindManyMock, findFirst: userFindFirstMock },
    workOrder: { findFirst: workOrderFindFirstMock },
    $transaction: transactionMock,
  },
}));

import { GET, POST } from "./route";

function ownerUser() {
  return {
    id: "owner-1",
    email: "owner@example.com",
    name: "Owner",
    company_id: "company-1",
    role: "owner",
  };
}

function projectRequest(body: Record<string, unknown>) {
  return new Request("https://www.revalta.se/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("projects GET pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue(ownerUser());
    projectFindManyMock.mockResolvedValue([]);
    projectCountMock.mockResolvedValueOnce(120).mockResolvedValueOnce(7);
    projectAggregateMock.mockResolvedValue({ _sum: { budget: 1_000_000, forecast: 900_000, actual: 400_000 } });
    propertyFindManyMock.mockResolvedValue([]);
    userFindManyMock.mockResolvedValue([]);
  });

  it("returns a stable tenant page with global portfolio totals", async () => {
    const response = await GET(new Request("https://www.revalta.se/api/projects?page=2&pageSize=25"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(projectFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      skip: 25,
      take: 25,
      where: expect.objectContaining({ company_id: "company-1", deleted_at: null }),
      orderBy: expect.arrayContaining([{ id: "asc" }]),
    }));
    expect(body.pagination).toEqual({ page: 2, pageSize: 25, total: 120, totalPages: 5 });
    expect(body.summary).toEqual({ active: 7, budget: 1_000_000, forecast: 900_000, actual: 400_000 });
  });

  it("caps oversized pages at 100 rows", async () => {
    const response = await GET(new Request("https://www.revalta.se/api/projects?page=1&pageSize=5000"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(projectFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
    expect(body.pagination.pageSize).toBe(100);
  });
});

describe("projects POST reliability", () => {
  const tx = { project: { create: projectCreateMock } };

  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue(ownerUser());
    propertyFindFirstMock.mockResolvedValue({ id: "property-1", name: "Kvarter Eken" });
    userFindFirstMock.mockResolvedValue({ id: "manager-1" });
    workOrderFindFirstMock.mockResolvedValue({ id: "work-order-1" });
    projectCreateMock.mockResolvedValue({
      id: "project-1",
      company_id: "company-1",
      property_id: "property-1",
      source_work_order_id: "work-order-1",
      manager_id: "manager-1",
      name: "Takprojekt",
      status: "planned",
      risk: "medium",
    });
    writeAuditLogMock.mockResolvedValue(undefined);
    transactionMock.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  });

  it("creates the project and mandatory audit record in the same transaction", async () => {
    const response = await POST(projectRequest({
      propertyId: "property-1",
      sourceWorkOrderId: "work-order-1",
      managerId: "manager-1",
      name: "Takprojekt",
      status: "planned",
      risk: "medium",
      budget: 250000,
      forecast: 240000,
      actual: 0,
      startDate: "2026-09-10T08:00:00.000Z",
      endDate: "2026-10-10T16:00:00.000Z",
    }));

    expect(response.status).toBe(201);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(projectCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        company_id: "company-1",
        property_id: "property-1",
        source_work_order_id: "work-order-1",
        manager_id: "manager-1",
        name: "Takprojekt",
      }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "owner-1", company_id: "company-1" }),
      expect.objectContaining({ entityType: "project", entityId: "project-1", action: "project.created" }),
      tx,
    );
  });

  it("does not report success when the audit write fails inside the transaction", async () => {
    writeAuditLogMock.mockRejectedValue(new Error("audit unavailable"));

    await expect(POST(projectRequest({
      propertyId: "property-1",
      name: "Takprojekt",
      status: "planned",
      risk: "low",
      budget: 100000,
      forecast: 100000,
      actual: 0,
    }))).rejects.toThrow("audit unavailable");

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(projectCreateMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "project.created" }),
      tx,
    );
  });

  it("rejects malformed JSON before tenant lookups or any transaction", async () => {
    const request = new Request("https://www.revalta.se/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Ogiltigt innehåll" });
    expect(propertyFindFirstMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("keeps property validation tenant-scoped before writes", async () => {
    propertyFindFirstMock.mockResolvedValue(null);

    const response = await POST(projectRequest({ propertyId: "foreign-property", name: "Projekt" }));

    expect(response.status).toBe(404);
    expect(propertyFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "foreign-property", company_id: "company-1", deleted_at: null },
    }));
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
