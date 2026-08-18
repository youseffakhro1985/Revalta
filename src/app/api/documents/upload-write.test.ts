import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createLoggerMock,
  getCurrentUserMock,
  hasStorageConfigMock,
  isProductionRuntimeMock,
  leaseFindFirstMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  managedCreateMock,
  propertyFindFirstMock,
  storeAttachmentMock,
  transactionMock,
  unitFindFirstMock,
  validateDocumentFileMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  createLoggerMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  hasStorageConfigMock: vi.fn(),
  isProductionRuntimeMock: vi.fn(),
  leaseFindFirstMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  managedCreateMock: vi.fn(),
  propertyFindFirstMock: vi.fn(),
  storeAttachmentMock: vi.fn(),
  transactionMock: vi.fn(),
  unitFindFirstMock: vi.fn(),
  validateDocumentFileMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

const tx = {
  managedDocument: { create: managedCreateMock },
  auditLog: { create: vi.fn() },
};

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("@/lib/document-file-security", () => ({ validateDocumentFile: validateDocumentFileMock }));
vi.mock("@/lib/runtime-env", () => ({ isProductionRuntime: isProductionRuntimeMock }));
vi.mock("@/lib/storage", () => ({
  hasStorageConfig: hasStorageConfigMock,
  storeAttachment: storeAttachmentMock,
  StorageConfigurationError: class StorageConfigurationError extends Error {},
}));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/db", () => ({
  default: {
    property: { findFirst: propertyFindFirstMock },
    unit: { findFirst: unitFindFirstMock },
    lease: { findFirst: leaseFindFirstMock },
    managedDocument: { findMany: vi.fn(), updateMany: vi.fn() },
    auditLog: { findMany: vi.fn(), findFirst: vi.fn() },
    $transaction: transactionMock,
  },
}));

import { POST } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";
const owner = { id: "owner-1", company_id: "company-1", role: "owner" };

function uploadRequest(overrides: Record<string, string> = {}) {
  const form = new FormData();
  form.set("file", new File(["safe-pdf"], overrides.fileName || "hemligt-avtal.pdf", { type: "application/pdf" }));
  form.set("name", overrides.name || "Hemligt hyresavtal");
  form.set("category", overrides.category || "lease");
  form.set("visibility", overrides.visibility || "resident_unit");
  form.set("propertyId", overrides.propertyId || "property-1");
  form.set("unitId", overrides.unitId || "unit-1");
  form.set("validUntil", overrides.validUntil || "2027-12-31");
  if (overrides.leaseId) form.set("leaseId", overrides.leaseId);

  return new Request("https://www.revalta.se/api/documents", {
    method: "POST",
    headers: { "x-request-id": requestId },
    body: form,
  });
}

describe("document upload write security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    getCurrentUserMock.mockResolvedValue(owner);
    hasStorageConfigMock.mockReturnValue(false);
    isProductionRuntimeMock.mockReturnValue(false);
    validateDocumentFileMock.mockReturnValue({
      ok: true,
      fileName: "hemligt-avtal.pdf",
      contentType: "application/pdf",
      sizeBytes: 8,
    });
    propertyFindFirstMock.mockResolvedValue({ id: "property-1" });
    unitFindFirstMock.mockResolvedValue({ id: "unit-1", property_id: "property-1" });
    leaseFindFirstMock.mockResolvedValue(null);
    managedCreateMock.mockResolvedValue({ id: "document-1", created_at: new Date("2026-08-19T00:00:00Z") });
    writeAuditLogMock.mockResolvedValue(undefined);
    transactionMock.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  });

  it("creates the document and audit record in one transaction with minimized metadata", async () => {
    const response = await POST(uploadRequest());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(managedCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        company_id: "company-1",
        property_id: "property-1",
        unit_id: "unit-1",
        lease_id: null,
        name: "Hemligt hyresavtal",
        file_name: "hemligt-avtal.pdf",
      }),
    }));
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({
        entityType: "document",
        entityId: "document-1",
        action: "document.created",
        metadata: {
          schemaVersion: 6,
          storage: "ManagedDocument",
          visibility: "resident_unit",
          hasPropertyScope: true,
          hasUnitScope: true,
          hasLeaseScope: false,
        },
      }),
      tx,
    );

    const audit = JSON.stringify(writeAuditLogMock.mock.calls[0][1].metadata);
    expect(audit).not.toContain("Hemligt hyresavtal");
    expect(audit).not.toContain("hemligt-avtal.pdf");
    expect(audit).not.toContain("2027-12-31");
    expect(audit).not.toContain("property-1");
    expect(audit).not.toContain("unit-1");
    expect(audit).not.toContain("application/pdf");
    expect(audit).not.toContain("8");
    expect(managedCreateMock.mock.invocationCallOrder[0]).toBeLessThan(writeAuditLogMock.mock.invocationCallOrder[0]);
  });

  it("fails closed when audit persistence fails instead of returning a false 201", async () => {
    writeAuditLogMock.mockRejectedValue(new Error("audit database unavailable"));

    const response = await POST(uploadRequest());
    const body = await response.json();

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(managedCreateMock).toHaveBeenCalledTimes(1);
    expect(writeAuditLogMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Internt serverfel", errorCode: "INTERNAL_ERROR", requestId });
    expect(JSON.stringify(body)).not.toContain("audit database unavailable");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "document create failed",
      expect.any(Error),
      expect.objectContaining({ event: "documents.create.failed" }),
    );
  });

  it("rejects a unit outside the selected property before transaction or audit", async () => {
    unitFindFirstMock.mockResolvedValue({ id: "unit-1", property_id: "other-property" });

    const response = await POST(uploadRequest());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: "Objektet tillhör inte den valda fastigheten",
      errorCode: "VALIDATION_FAILED",
      requestId,
    });
    expect(transactionMock).not.toHaveBeenCalled();
    expect(managedCreateMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("does not log unverified property or unit identifiers when scope validation fails", async () => {
    unitFindFirstMock.mockResolvedValue(null);

    const response = await POST(uploadRequest({ propertyId: "secret-property", unitId: "secret-unit" }));
    expect(response.status).toBe(404);

    const serializedWarnings = JSON.stringify(loggerWarnMock.mock.calls);
    expect(serializedWarnings).not.toContain("secret-property");
    expect(serializedWarnings).not.toContain("secret-unit");
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
