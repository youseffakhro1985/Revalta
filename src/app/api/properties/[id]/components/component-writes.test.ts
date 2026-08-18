import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  auditCreateMock,
  createLoggerMock,
  executeRawMock,
  getCurrentUserMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  projectFindFirstMock,
  propertyFindFirstMock,
  queryRawMock,
  workOrderFindFirstMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  auditCreateMock: vi.fn(),
  createLoggerMock: vi.fn(),
  executeRawMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  projectFindFirstMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
  queryRawMock: vi.fn(),
  workOrderFindFirstMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/db", () => ({
  default: {
    property: { findFirst: propertyFindFirstMock },
    workOrder: { findFirst: workOrderFindFirstMock },
    project: { findFirst: projectFindFirstMock },
    auditLog: { create: auditCreateMock },
    $queryRaw: queryRawMock,
    $executeRaw: executeRawMock,
  },
}));

import { PATCH as patchComponent } from "./[componentId]/route";
import { POST as postComponentAction } from "./[componentId]/actions/route";
import { PATCH as patchMaintenance } from "./[componentId]/maintenance-settings/route";
import { POST as postComponentManage } from "./manage/route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";
const owner = { id: "owner-1", company_id: "company-1", role: "owner" };

function jsonRequest(url: string, body: Record<string, unknown>, method: "POST" | "PATCH" = "POST") {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json", "x-request-id": requestId },
    body: JSON.stringify(body),
  });
}

function componentParams(propertyId = "property-1", componentId = "asset-1") {
  return { params: Promise.resolve({ id: propertyId, componentId }) };
}

function propertyParams(propertyId = "property-1") {
  return { params: Promise.resolve({ id: propertyId }) };
}

function requireResponse(response: Response | undefined): Response {
  expect(response).toBeDefined();
  if (!response) throw new Error("Route handler returned no response");
  return response;
}

describe("secure component write contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    getCurrentUserMock.mockResolvedValue(owner);
    propertyFindFirstMock.mockResolvedValue({ id: "property-1" });
    workOrderFindFirstMock.mockResolvedValue(null);
    projectFindFirstMock.mockResolvedValue(null);
    queryRawMock.mockResolvedValue([{ id: "asset-1", name: "Ventilation" }]);
    executeRawMock.mockResolvedValue(1);
    auditCreateMock.mockResolvedValue({ id: "audit-1" });
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  it("correlates component detail updates and excludes financial values from audit metadata", async () => {
    const response = requireResponse(await patchComponent(
      jsonRequest("https://www.revalta.se/api/properties/property-1/components/asset-1", {
        name: "Ventilationsaggregat",
        status: "active",
        criticality: "high",
        replacement_value: 987654,
        responsible_supplier: "Leverantör Hemlig AB",
      }, "PATCH"),
      componentParams(),
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    const metadata = writeAuditLogMock.mock.calls[0][1].metadata;
    expect(metadata.financeFieldChanged).toBe(true);
    expect(JSON.stringify(metadata)).not.toContain("987654");
    expect(JSON.stringify(metadata)).not.toContain("Leverantör Hemlig AB");
  });

  it("keeps known detail validation public but masks unexpected database failures", async () => {
    const invalid = requireResponse(await patchComponent(
      jsonRequest("https://www.revalta.se/api/properties/property-1/components/asset-1", {
        name: "Ventilation",
        status: "active",
        criticality: "normal",
        installation_year: 1200,
      }, "PATCH"),
      componentParams(),
    ));
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({ error: "Ogiltigt heltal", errorCode: "VALIDATION_FAILED", requestId });

    queryRawMock.mockRejectedValueOnce(new Error("postgres://user:secret@db.internal/revalta"));
    const failed = requireResponse(await patchComponent(
      jsonRequest("https://www.revalta.se/api/properties/property-1/components/asset-1", {
        name: "Ventilation",
        status: "active",
        criticality: "normal",
      }, "PATCH"),
      componentParams(),
    ));
    const body = await failed.json();
    expect(failed.status).toBe(500);
    expect(body).toEqual({ error: "Internt serverfel", errorCode: "INTERNAL_ERROR", requestId });
    expect(JSON.stringify(body)).not.toContain("postgres://");
    expect(loggerErrorMock).toHaveBeenCalled();
  });

  it("does not log unverified cross-tenant identifiers for detail mutations", async () => {
    propertyFindFirstMock.mockResolvedValueOnce(null);
    const response = requireResponse(await patchComponent(
      jsonRequest("https://www.revalta.se/api/properties/external-secret-property/components/external-component", {
        name: "Ventilation",
        status: "active",
        criticality: "normal",
      }, "PATCH"),
      componentParams("external-secret-property", "external-component"),
    ));

    expect(response.status).toBe(404);
    expect(JSON.stringify(loggerWarnMock.mock.calls)).not.toContain("external-secret-property");
    expect(JSON.stringify(loggerWarnMock.mock.calls)).not.toContain("external-component");
  });

  it("uses an allowlisted audit payload for legacy manage updates", async () => {
    const response = await postComponentManage(
      jsonRequest("https://www.revalta.se/api/properties/property-1/components/manage", {
        action: "update",
        assetId: "asset-1",
        componentClass: "HVAC",
        responsibleSupplier: "Hemlig Leverantör",
        replacementValue: 123456,
        arbitrarySecret: "do-not-store",
      }),
      propertyParams(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    const metadata = auditCreateMock.mock.calls[0][0].data.metadata;
    expect(metadata.financeFieldChanged).toBe(true);
    expect(metadata.fields).toEqual(["componentClass", "responsibleSupplier"]);
    const serialized = JSON.stringify(metadata);
    expect(serialized).not.toContain("123456");
    expect(serialized).not.toContain("Hemlig Leverantör");
    expect(serialized).not.toContain("do-not-store");
  });

  it("keeps manage validation public while masking unexpected database failures", async () => {
    const invalid = await postComponentManage(
      jsonRequest("https://www.revalta.se/api/properties/property-1/components/manage", {
        action: "update",
        assetId: "asset-1",
        conditionGrade: 99,
      }),
      propertyParams(),
    );
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).errorCode).toBe("VALIDATION_FAILED");

    queryRawMock.mockRejectedValueOnce(new Error("password=internal-secret"));
    const failed = await postComponentManage(
      jsonRequest("https://www.revalta.se/api/properties/property-1/components/manage", {
        action: "update",
        assetId: "asset-1",
      }),
      propertyParams(),
    );
    const body = await failed.json();
    expect(failed.status).toBe(500);
    expect(body).toEqual({ error: "Internt serverfel", errorCode: "INTERNAL_ERROR", requestId });
    expect(JSON.stringify(body)).not.toContain("internal-secret");
  });

  it("returns correlated action validation errors and safe 500 for unexpected insert failures", async () => {
    const invalid = await postComponentAction(
      jsonRequest("https://www.revalta.se/api/properties/property-1/components/asset-1/actions", {
        action: "event",
        event_type: "not-valid",
      }),
      componentParams(),
    );
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({ error: "Ogiltig händelsetyp", errorCode: "VALIDATION_FAILED", requestId });

    queryRawMock.mockResolvedValueOnce([{ id: "asset-1" }]).mockRejectedValueOnce(new Error("postgres internal stack secret"));
    const failed = await postComponentAction(
      jsonRequest("https://www.revalta.se/api/properties/property-1/components/asset-1/actions", {
        action: "event",
        event_type: "service",
        event_date: "2026-08-18",
        title: "Service",
      }),
      componentParams(),
    );
    const body = await failed.json();
    expect(failed.status).toBe(500);
    expect(body.errorCode).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(body)).not.toContain("stack secret");
  });

  it("correlates maintenance validation and masks raw-query failures", async () => {
    const invalid = requireResponse(await patchMaintenance(
      jsonRequest("https://www.revalta.se/api/properties/property-1/components/asset-1/maintenance-settings", {
        serviceIntervalMonths: 0,
        serviceLeadDays: 30,
        autoCreateServiceWorkOrders: true,
      }, "PATCH"),
      componentParams(),
    ));
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).errorCode).toBe("VALIDATION_FAILED");

    queryRawMock.mockRejectedValueOnce(new Error("db.internal:5432 secret"));
    const failed = requireResponse(await patchMaintenance(
      jsonRequest("https://www.revalta.se/api/properties/property-1/components/asset-1/maintenance-settings", {
        serviceIntervalMonths: 12,
        serviceLeadDays: 30,
        autoCreateServiceWorkOrders: true,
        nextServiceAt: "2026-12-01",
      }, "PATCH"),
      componentParams(),
    ));
    const body = await failed.json();
    expect(failed.status).toBe(500);
    expect(body).toEqual({ error: "Internt serverfel", errorCode: "INTERNAL_ERROR", requestId });
    expect(JSON.stringify(body)).not.toContain("db.internal");
  });
});
