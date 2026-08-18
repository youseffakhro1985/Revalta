import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  auditFindManyMock,
  createLoggerMock,
  executeRawMock,
  getCurrentUserMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  propertyFindFirstMock,
  queryRawMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  auditFindManyMock: vi.fn(),
  createLoggerMock: vi.fn(),
  executeRawMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
  queryRawMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/soft-delete-compat", async () => {
  const { Prisma } = await import("@prisma/client");
  return { sqlSoftDeleteGuard: vi.fn().mockResolvedValue(Prisma.empty) };
});
vi.mock("@/lib/db", () => ({
  default: {
    property: { findFirst: propertyFindFirstMock },
    auditLog: { findMany: auditFindManyMock },
    $queryRaw: queryRawMock,
    $executeRaw: executeRawMock,
  },
}));

import { PATCH as patchEntry } from "./[componentId]/entries/[kind]/[entryId]/route";
import { GET as getLinkOptions } from "./[componentId]/link-options/route";
import { GET as getReport } from "./[componentId]/report/route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";
const owner = { id: "owner-1", company_id: "company-1", role: "owner" };
const technician = { id: "tech-1", company_id: "company-1", role: "technician" };
const property = {
  id: "property-1",
  name: "Kvarnhuset",
  address: "Storgatan 1",
  postal_code: "411 01",
  city: "Göteborg",
  property_identifier: "Göteborg 1:1",
};
const component = {
  id: "asset-1",
  name: "Ventilationsaggregat",
  category: "ventilation",
  status: "active",
  replacement_value: 250000,
  responsible_supplier: "VentPartner AB",
};
const cost = {
  id: "cost-1",
  cost_date: new Date("2026-08-18T00:00:00.000Z"),
  cost_type: "service",
  description: "Årsservice",
  supplier: "Servicebolaget",
  amount_ex_vat: 5000,
  vat_rate: 25,
};
const audit = {
  id: "audit-1",
  created_at: new Date("2026-08-18T10:00:00.000Z"),
  action: "corrected",
  entity_type: "component_cost_entry",
  metadata: { componentId: "asset-1", amount_ex_vat: 5000, secret: "historical-audit-secret" },
  actor: { name: "Admin", email: "admin@revalta.se" },
};

function reportRequest(format?: "csv") {
  return new Request(`https://www.revalta.se/api/properties/property-1/components/asset-1/report${format ? `?format=${format}` : ""}`, {
    headers: { "x-request-id": requestId },
  });
}

function linkRequest(propertyId = "property-1", componentId = "asset-1") {
  return new Request(`https://www.revalta.se/api/properties/${propertyId}/components/${componentId}/link-options`, {
    headers: { "x-request-id": requestId },
  });
}

function entryRequest(body: Record<string, unknown>) {
  return new Request("https://www.revalta.se/api/properties/property-1/components/asset-1/entries/cost/cost-1", {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-request-id": requestId },
    body: JSON.stringify(body),
  });
}

function reportParams() {
  return { params: Promise.resolve({ id: "property-1", componentId: "asset-1" }) };
}

function entryParams(kind = "cost", entryId = "cost-1") {
  return { params: Promise.resolve({ id: "property-1", componentId: "asset-1", kind, entryId }) };
}

function seedReportQueries(events: Array<Record<string, unknown>> = []) {
  queryRawMock
    .mockResolvedValueOnce([component])
    .mockResolvedValueOnce(events)
    .mockResolvedValueOnce([cost]);
  auditFindManyMock.mockResolvedValue([audit]);
}

describe("component support security contracts", () => {
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
    executeRawMock.mockResolvedValue(1);
    auditFindManyMock.mockResolvedValue([]);
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("masks component finance and historical audit metadata in JSON reports for technicians", async () => {
    getCurrentUserMock.mockResolvedValue(technician);
    seedReportQueries();

    const response = await getReport(reportRequest(), reportParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body.component.replacement_value).toBeNull();
    expect(body.costs[0].amount_ex_vat).toBeNull();
    expect(body.audits[0].metadata).toBeNull();
    expect(body.summary.totalCostExVat).toBeNull();
    expect(JSON.stringify(body)).not.toContain("historical-audit-secret");
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "component report generated",
      expect.objectContaining({ event: "components.report.completed", includeFinance: false, propertyId: "property-1", componentId: "asset-1" }),
    );
  });

  it("preserves report finance data for authorized roles", async () => {
    seedReportQueries();

    const response = await getReport(reportRequest(), reportParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.component.replacement_value).toBe(250000);
    expect(body.costs[0].amount_ex_vat).toBe(5000);
    expect(body.audits[0].metadata.secret).toBe("historical-audit-secret");
    expect(body.summary.totalCostExVat).toBe(5000);
  });

  it("keeps finance out of technician CSV exports and neutralizes spreadsheet formulas", async () => {
    getCurrentUserMock.mockResolvedValue(technician);
    seedReportQueries([{ event_date: new Date("2026-08-18T00:00:00.000Z"), event_type: "service", title: "=2+2", description: null, provider: "Tekniker" }]);

    const response = await getReport(reportRequest("csv"), reportParams());
    const csv = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(csv).not.toContain("250000");
    expect(csv).not.toContain("5000");
    expect(csv).not.toContain("historical-audit-secret");
    expect(csv).toContain("\"'=2+2\"");
  });

  it("returns a safe correlated 500 if report data loading fails", async () => {
    queryRawMock.mockRejectedValueOnce(new Error("postgres://user:secret@db.internal/revalta"));

    const response = await getReport(reportRequest(), reportParams());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Internt serverfel", errorCode: "INTERNAL_ERROR", requestId });
    expect(JSON.stringify(body)).not.toContain("postgres://");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "component report generation failed",
      expect.any(Error),
      expect.objectContaining({ event: "components.report.failed" }),
    );
  });

  it("does not log unverified cross-tenant identifiers in link options", async () => {
    propertyFindFirstMock.mockResolvedValueOnce(null);

    const response = await getLinkOptions(
      linkRequest("external-secret-property", "external-secret-component"),
      { params: Promise.resolve({ id: "external-secret-property", componentId: "external-secret-component" }) },
    );

    expect(response.status).toBe(404);
    expect((await response.json()).errorCode).toBe("NOT_FOUND");
    expect(queryRawMock).not.toHaveBeenCalled();
    const warnings = JSON.stringify(loggerWarnMock.mock.calls);
    expect(warnings).not.toContain("external-secret-property");
    expect(warnings).not.toContain("external-secret-component");
  });

  it("returns private correlated link options after component scope is verified", async () => {
    queryRawMock
      .mockResolvedValueOnce([{ id: "asset-1" }])
      .mockResolvedValueOnce([{ id: "wo-1", title: "Service", status: "open", priority: "normal" }])
      .mockResolvedValueOnce([{ id: "project-1", name: "Byte", status: "active", risk: "low" }]);

    const response = await getLinkOptions(linkRequest(), reportParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body.workOrders).toHaveLength(1);
    expect(body.projects).toHaveLength(1);
  });

  it("minimizes cost-correction audit metadata and never stores the prior record or amount", async () => {
    queryRawMock
      .mockResolvedValueOnce([{ id: "asset-1" }])
      .mockResolvedValueOnce([{ id: "cost-1" }])
      .mockResolvedValueOnce([{ id: "cost-1", amount_ex_vat: 7654, supplier: "Hemlig Leverantör" }]);

    const response = await patchEntry(
      entryRequest({
        cost_type: "service",
        description: "Korrigerad fritext",
        supplier: "Hemlig Leverantör",
        amount_ex_vat: 7654,
        vat_rate: 25,
        cost_date: "2026-08-18",
        arbitrarySecret: "do-not-audit",
      }),
      entryParams(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const metadata = writeAuditLogMock.mock.calls[0][1].metadata;
    expect(metadata.financeFieldChanged).toBe(true);
    expect(metadata).not.toHaveProperty("before");
    expect(metadata.fields).toEqual(["cost_date", "cost_type", "description", "supplier", "vat_rate"]);
    const serialized = JSON.stringify(metadata);
    expect(serialized).not.toContain("7654");
    expect(serialized).not.toContain("Hemlig Leverantör");
    expect(serialized).not.toContain("Korrigerad fritext");
    expect(serialized).not.toContain("do-not-audit");
  });

  it("masks unexpected entry-correction database failures", async () => {
    queryRawMock.mockRejectedValueOnce(new Error("password=component-entry-db-secret"));

    const response = await patchEntry(
      entryRequest({ cost_type: "service", amount_ex_vat: 100, vat_rate: 25, cost_date: "2026-08-18" }),
      entryParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Internt serverfel", errorCode: "INTERNAL_ERROR", requestId });
    expect(JSON.stringify(body)).not.toContain("component-entry-db-secret");
  });
});
