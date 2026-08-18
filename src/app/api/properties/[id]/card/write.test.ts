import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  buildingFindFirstMock,
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
  buildingFindFirstMock: vi.fn(),
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
  building: { findFirst: buildingFindFirstMock },
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
    building: { findFirst: vi.fn() },
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    $transaction: transactionMock,
  },
}));

import { POST } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";
const owner = { id: "owner-1", company_id: "company-1", role: "owner" };
const technician = { id: "tech-1", company_id: "company-1", role: "technician" };

function request(body: Record<string, unknown> | string, propertyId = "property-1") {
  return new Request(`https://www.revalta.se/api/properties/${propertyId}/card`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": requestId },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function params(propertyId = "property-1") {
  return { params: Promise.resolve({ id: propertyId }) };
}

describe("property card atomic writes", () => {
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
    buildingFindFirstMock.mockResolvedValue({ id: "building-1" });
    queryRawMock.mockResolvedValue([{ id: "asset-1" }]);
    executeRawMock.mockResolvedValue(1);
    writeAuditLogMock.mockResolvedValue(undefined);
    transactionMock.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  });

  it("writes and audits a card mutation inside the same transaction", async () => {
    const response = await POST(
      request({ action: "entrance.save", recordId: "entrance-1", name: "Entré A", buildingId: "building-1" }),
      params(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, id: "entrance-1" });
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(executeRawMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      owner,
      {
        entityType: "property",
        entityId: "property-1",
        action: "property_card.entrance.save",
        metadata: { recordId: "entrance-1" },
      },
      tx,
    );
    expect(executeRawMock.mock.invocationCallOrder[0]).toBeLessThan(writeAuditLogMock.mock.invocationCallOrder[0]);
  });

  it("does not expose agreement cost or free text in audit metadata", async () => {
    const response = await POST(
      request({
        action: "agreement.save",
        recordId: "agreement-1",
        supplier: "Hemlig Leverantör AB",
        serviceArea: "Ventilation",
        costAmount: 987654,
        contactEmail: "private@example.com",
      }),
      params(),
    );

    expect(response.status).toBe(200);
    const metadata = writeAuditLogMock.mock.calls[0][1].metadata;
    expect(metadata).toEqual({ recordId: "agreement-1" });
    const serialized = JSON.stringify(metadata);
    expect(serialized).not.toContain("987654");
    expect(serialized).not.toContain("Hemlig Leverantör");
    expect(serialized).not.toContain("private@example.com");
  });

  it("fails closed when a supplied record id cannot mutate within the verified property", async () => {
    executeRawMock.mockResolvedValueOnce(0);

    const response = await POST(
      request({ action: "entrance.save", recordId: "external-record", name: "Entré A" }),
      params(),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: "Posten kunde inte sparas i fastigheten", errorCode: "NOT_FOUND", requestId });
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("returns validation errors before mutation for invalid building scope", async () => {
    buildingFindFirstMock.mockResolvedValueOnce(null);

    const response = await POST(
      request({ action: "entrance.save", name: "Entré A", buildingId: "external-building" }),
      params(),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "Byggnaden tillhör inte fastigheten", errorCode: "VALIDATION_FAILED", requestId });
    expect(executeRawMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("returns validation errors before mutation for invalid technical asset scope", async () => {
    queryRawMock.mockResolvedValueOnce([]);

    const response = await POST(
      request({ action: "warranty.save", title: "Garanti", technicalAssetId: "external-asset" }),
      params(),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "Installationen tillhör inte fastigheten", errorCode: "VALIDATION_FAILED", requestId });
    expect(executeRawMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("rejects unsupported actions before starting a transaction", async () => {
    const response = await POST(request({ action: "dangerous.unknown" }), params());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "Åtgärden stöds inte", errorCode: "VALIDATION_FAILED", requestId });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("keeps technicians outside card mutations", async () => {
    getCurrentUserMock.mockResolvedValueOnce(technician);

    const response = await POST(request({ action: "entrance.save", name: "Entré A" }), params());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: "Du saknar behörighet", errorCode: "FORBIDDEN", requestId });
    expect(propertyFindFirstMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns correlated validation for malformed JSON", async () => {
    const response = await POST(request("{not-json"), params());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "Ogiltig förfrågan", errorCode: "VALIDATION_FAILED", requestId });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("does not log an unverified cross-tenant property id", async () => {
    propertyFindFirstMock.mockResolvedValueOnce(null);

    const response = await POST(
      request({ action: "entrance.save", name: "Entré A" }, "external-secret-property"),
      params("external-secret-property"),
    );

    expect(response.status).toBe(404);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(JSON.stringify(loggerWarnMock.mock.calls)).not.toContain("external-secret-property");
  });

  it("turns transaction or audit failures into safe correlated 500 responses", async () => {
    writeAuditLogMock.mockRejectedValueOnce(new Error("postgres://user:audit-secret@db.internal/revalta"));

    const response = await POST(
      request({ action: "entrance.save", recordId: "entrance-1", name: "Entré A" }),
      params(),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Internt serverfel", errorCode: "INTERNAL_ERROR", requestId });
    expect(JSON.stringify(body)).not.toContain("audit-secret");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "property card write failed",
      expect.any(Error),
      expect.objectContaining({ event: "property.card.write.failed" }),
    );
  });
});
