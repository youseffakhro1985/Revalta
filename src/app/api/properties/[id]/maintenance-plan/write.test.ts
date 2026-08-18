import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createLoggerMock,
  executeRawMock,
  getCurrentUserMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  propertyFindFirstMock,
  queryRawMock,
  transactionMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  createLoggerMock: vi.fn(),
  executeRawMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
  queryRawMock: vi.fn(),
  transactionMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

const tx = {
  $queryRaw: queryRawMock,
  $executeRaw: executeRawMock,
  auditLog: { create: vi.fn() },
};

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/db", () => ({
  default: {
    property: { findFirst: propertyFindFirstMock },
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    $transaction: transactionMock,
  },
}));

import { POST } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";
const owner = { id: "owner-1", company_id: "company-1", role: "owner" };
const technician = { id: "tech-1", company_id: "company-1", role: "technician" };
const property = { id: "property-1", name: "Kvarnhuset", buildings: [{ id: "building-1", name: "Hus A" }] };
const plan = {
  id: "plan-1",
  name: "Plan 2026",
  version: 2,
  status: "draft",
  base_year: 2026,
  horizon_years: 10,
  annual_index_rate: 3,
  summary: null,
  assumptions: null,
  approved_at: null,
  created_at: "2026-08-18T00:00:00.000Z",
};

function request(body: Record<string, unknown> | string, propertyId = "property-1") {
  return new Request(`https://www.revalta.se/api/properties/${propertyId}/maintenance-plan`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": requestId },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function params(propertyId = "property-1") {
  return { params: Promise.resolve({ id: propertyId }) };
}

function serializedSql(callIndex = 0) {
  const sql = queryRawMock.mock.calls[callIndex]?.[0] as { strings?: readonly string[]; values?: unknown[] } | undefined;
  return JSON.stringify({ strings: sql?.strings, values: sql?.values });
}

describe("maintenance plan root write security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    getCurrentUserMock.mockResolvedValue(owner);
    propertyFindFirstMock.mockResolvedValue(property);
    queryRawMock.mockReset();
    executeRawMock.mockReset();
    executeRawMock.mockResolvedValue(1);
    writeAuditLogMock.mockResolvedValue(undefined);
    transactionMock.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  });

  it("creates a plan and its audit record inside one transaction with tenant-scoped versioning", async () => {
    queryRawMock.mockResolvedValueOnce([{ next_version: 3 }]);

    const response = await POST(
      request({
        action: "plan.create",
        name: "Tioårsplan hemlig titel",
        baseYear: 2026,
        horizonYears: 10,
        annualIndexRate: 3.5,
        summary: "Intern fri text",
      }),
      params(),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(typeof body.id).toBe("string");
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(queryRawMock).toHaveBeenCalledTimes(1);
    expect(executeRawMock).toHaveBeenCalledTimes(1);
    expect(serializedSql()).toContain("company-1");
    expect(serializedSql()).toContain("property-1");
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({
        entityType: "maintenance_plan",
        action: "maintenance_plan.created",
        metadata: { propertyId: "property-1", baseYear: 2026, horizonYears: 10, indexRateConfigured: true },
      }),
      tx,
    );
    const audit = JSON.stringify(writeAuditLogMock.mock.calls[0][1].metadata);
    expect(audit).not.toContain("Tioårsplan hemlig titel");
    expect(audit).not.toContain("Intern fri text");
    expect(audit).not.toContain("3.5");
    expect(executeRawMock.mock.invocationCallOrder[0]).toBeLessThan(writeAuditLogMock.mock.invocationCallOrder[0]);
  });

  it("creates an action atomically without storing title, description or cost in audit metadata", async () => {
    queryRawMock
      .mockResolvedValueOnce([plan])
      .mockResolvedValueOnce([{ id: "asset-1" }]);

    const response = await POST(
      request({
        action: "action.create",
        planId: "plan-1",
        title: "Takbyte – intern titel",
        category: "roof",
        plannedYear: 2028,
        estimatedCost: 765432,
        priority: "high",
        risk: "medium",
        status: "planned",
        buildingId: "building-1",
        technicalAssetId: "asset-1",
        description: "Intern teknisk fritext",
        annualIndexRate: 4,
      }),
      params(),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(typeof body.id).toBe("string");
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(executeRawMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({
        entityType: "maintenance_action",
        action: "maintenance_action.created",
        metadata: {
          propertyId: "property-1",
          planId: "plan-1",
          plannedYear: 2028,
          priority: "high",
          risk: "medium",
          financeFieldRecorded: true,
          indexed: true,
        },
      }),
      tx,
    );
    const audit = JSON.stringify(writeAuditLogMock.mock.calls[0][1].metadata);
    expect(audit).not.toContain("Takbyte");
    expect(audit).not.toContain("765432");
    expect(audit).not.toContain("Intern teknisk fritext");
  });

  it("rejects an action plan outside the verified property without mutation or audit", async () => {
    queryRawMock.mockResolvedValueOnce([]);

    const response = await POST(
      request({
        action: "action.create",
        planId: "external-plan",
        title: "Takbyte",
        category: "roof",
        plannedYear: 2028,
        estimatedCost: 1000,
      }),
      params(),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: "Underhållsplanen hittades inte", errorCode: "NOT_FOUND", requestId });
    expect(executeRawMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("rejects an asset outside the verified property before insert", async () => {
    queryRawMock
      .mockResolvedValueOnce([plan])
      .mockResolvedValueOnce([]);

    const response = await POST(
      request({
        action: "action.create",
        planId: "plan-1",
        title: "Takbyte",
        category: "roof",
        plannedYear: 2028,
        estimatedCost: 1000,
        technicalAssetId: "external-asset",
      }),
      params(),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Installationen tillhör inte fastigheten");
    expect(executeRawMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("activates a plan and writes audit in the same transaction", async () => {
    executeRawMock
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);

    const response = await POST(request({ action: "plan.activate", planId: "plan-1" }), params());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(executeRawMock).toHaveBeenCalledTimes(2);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      owner,
      {
        entityType: "maintenance_plan",
        entityId: "plan-1",
        action: "maintenance_plan.activated",
        metadata: { propertyId: "property-1" },
      },
      tx,
    );
  });

  it("fails closed when target activation affects zero rows and creates no audit", async () => {
    executeRawMock
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);

    const response = await POST(request({ action: "plan.activate", planId: "external-plan" }), params());
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: "Planen hittades inte", errorCode: "NOT_FOUND", requestId });
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("returns safe correlated 500 when transactional audit fails", async () => {
    executeRawMock
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);
    writeAuditLogMock.mockRejectedValueOnce(new Error("postgres://audit-secret@db.internal/revalta"));

    const response = await POST(request({ action: "plan.activate", planId: "plan-1" }), params());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Internt serverfel", errorCode: "INTERNAL_ERROR", requestId });
    expect(JSON.stringify(body)).not.toContain("audit-secret");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "maintenance plan write failed",
      expect.any(Error),
      expect.objectContaining({ event: "maintenance_plan.write.failed" }),
    );
  });

  it("rejects malformed JSON and unknown actions before starting a transaction", async () => {
    const malformed = await POST(request("{not-json"), params());
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).errorCode).toBe("VALIDATION_FAILED");

    const unknown = await POST(request({ action: "dangerous.unknown" }), params());
    expect(unknown.status).toBe(400);
    expect((await unknown.json()).error).toBe("Okänd åtgärd");
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects technicians before property lookup or mutation", async () => {
    getCurrentUserMock.mockResolvedValueOnce(technician);

    const response = await POST(request({ action: "plan.create" }), params());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: "Du saknar behörighet", errorCode: "FORBIDDEN", requestId });
    expect(propertyFindFirstMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("does not log an unverified cross-tenant property id", async () => {
    propertyFindFirstMock.mockResolvedValueOnce(null);

    const response = await POST(
      request({ action: "plan.create", name: "Plan", baseYear: 2026, horizonYears: 10, annualIndexRate: 3 }, "external-secret-property"),
      params("external-secret-property"),
    );

    expect(response.status).toBe(404);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(JSON.stringify(loggerWarnMock.mock.calls)).not.toContain("external-secret-property");
  });
});
