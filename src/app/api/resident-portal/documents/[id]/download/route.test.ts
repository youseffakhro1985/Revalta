import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  blobGetMock,
  createLoggerMock,
  getCurrentUserMock,
  getStorageTokenMock,
  leaseFindFirstMock,
  managedDocumentFindFirstMock,
  auditLogFindFirstMock,
  auditLogCreateMock,
  getDocumentLifecycleStateMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
} = vi.hoisted(() => ({
  blobGetMock: vi.fn(),
  createLoggerMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  getStorageTokenMock: vi.fn(),
  leaseFindFirstMock: vi.fn(),
  managedDocumentFindFirstMock: vi.fn(),
  auditLogFindFirstMock: vi.fn(),
  auditLogCreateMock: vi.fn(),
  getDocumentLifecycleStateMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/document-lifecycle", () => ({
  getDocumentLifecycleState: getDocumentLifecycleStateMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    lease: { findFirst: leaseFindFirstMock },
    managedDocument: { findFirst: managedDocumentFindFirstMock },
    auditLog: {
      findFirst: auditLogFindFirstMock,
      create: auditLogCreateMock,
    },
  },
}));

vi.mock("@vercel/blob", () => ({ get: blobGetMock }));
vi.mock("@/lib/storage", () => ({ getStorageToken: getStorageTokenMock }));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { GET } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";
const pdfBytes = Buffer.from("%PDF-1.4\n%âãÏÓ\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n", "utf8");
const pdfDataUrl = `data:application/pdf;base64,${pdfBytes.toString("base64")}`;

const residentUser = {
  id: "user-resident",
  company_id: "company-1",
  role: "resident",
  email: "boende@exempel.se",
};

const lease = {
  id: "lease-1",
  property_id: "property-1",
  unit_id: "unit-1",
  lease_number: "L-100",
};

const modernDocument = {
  id: "doc-1",
  name: "Hyresavtal",
  visibility: "resident_lease",
  property_id: "property-1",
  unit_id: "unit-1",
  lease_id: "lease-1",
  file_name: "hyresavtal.pdf",
  content_type: "application/pdf",
  size_bytes: pdfBytes.length,
  storage_url: null,
  data_url: pdfDataUrl,
  lifecycle_state: "active",
};

function downloadRequest(documentId = "doc-1", leaseId = "lease-1") {
  return new Request(
    `https://www.revalta.se/api/resident-portal/documents/${documentId}/download?leaseId=${leaseId}`,
    { headers: { "x-request-id": requestId } },
  );
}

describe("resident document download route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    getStorageTokenMock.mockReturnValue("blob-token");
    leaseFindFirstMock.mockResolvedValue(lease);
    managedDocumentFindFirstMock.mockResolvedValue(modernDocument);
    auditLogFindFirstMock.mockResolvedValue(null);
    auditLogCreateMock.mockResolvedValue({ id: "audit-1" });
    getDocumentLifecycleStateMock.mockResolvedValue({ state: "active" });
  });

  it("lets a resident download a document for an email-matched lease with correlated private headers", async () => {
    getCurrentUserMock.mockResolvedValue(residentUser);

    const response = await GET(downloadRequest(), { params: Promise.resolve({ id: "doc-1" }) });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("vercel-cdn-cache-control")).toBe("no-store");
    expect(leaseFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "lease-1",
        company_id: "company-1",
        lease_holder: expect.anything(),
      }),
    }));
    expect(auditLogCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "resident_portal.document_downloaded",
        metadata: expect.objectContaining({
          accessMode: "resident_self_service",
          leaseId: "lease-1",
        }),
      }),
    }));
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "resident document download completed",
      expect.objectContaining({
        event: "resident_documents.download.completed",
        userId: "user-resident",
        companyId: "company-1",
        documentId: "doc-1",
        leaseId: "lease-1",
        residentView: true,
        sizeBytes: pdfBytes.length,
      }),
    );
    const logged = JSON.stringify(loggerInfoMock.mock.calls);
    expect(logged).not.toContain("hyresavtal.pdf");
    expect(logged).not.toContain("Hyresavtal");
    expect(logged).not.toContain("boende@exempel.se");
    expect(logged).not.toContain("data:application/pdf");
  });

  it("hides documents when the resident lease email does not match without logging submitted ids", async () => {
    getCurrentUserMock.mockResolvedValue(residentUser);
    leaseFindFirstMock.mockResolvedValue(null);

    const response = await GET(
      downloadRequest("external-secret-document", "external-secret-lease"),
      { params: Promise.resolve({ id: "external-secret-document" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      error: "Dokumentet hittades inte",
      errorCode: "NOT_FOUND",
      requestId,
    });
    expect(managedDocumentFindFirstMock).not.toHaveBeenCalled();
    const logged = JSON.stringify(loggerWarnMock.mock.calls);
    expect(logged).not.toContain("external-secret-document");
    expect(logged).not.toContain("external-secret-lease");
  });

  it("requires a leaseId with a stable correlated validation error", async () => {
    getCurrentUserMock.mockResolvedValue(residentUser);

    const response = await GET(
      new Request("https://www.revalta.se/api/resident-portal/documents/doc-1/download", {
        headers: { "x-request-id": requestId },
      }),
      { params: Promise.resolve({ id: "doc-1" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Hyresavtal krävs",
      errorCode: "VALIDATION_FAILED",
      requestId,
    });
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("denies roles without download permission with a stable correlated 403", async () => {
    getCurrentUserMock.mockResolvedValue({
      ...residentUser,
      role: "viewer",
    });

    const response = await GET(downloadRequest(), { params: Promise.resolve({ id: "doc-1" }) });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Du saknar behörighet till boendedokument",
      errorCode: "FORBIDDEN",
      requestId,
    });
    expect(leaseFindFirstMock).not.toHaveBeenCalled();
  });

  it("lets operations staff preview without email-scoped lease filters", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "user-manager",
      company_id: "company-1",
      role: "manager",
      email: "forvaltare@exempel.se",
    });

    const response = await GET(downloadRequest(), { params: Promise.resolve({ id: "doc-1" }) });

    expect(response.status).toBe(200);
    expect(leaseFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.not.objectContaining({
        lease_holder: expect.anything(),
      }),
    }));
    expect(auditLogCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          accessMode: "operations_preview",
        }),
      }),
    }));
  });

  it("blocks download when visibility is not resident-facing", async () => {
    getCurrentUserMock.mockResolvedValue(residentUser);
    managedDocumentFindFirstMock.mockResolvedValue({
      ...modernDocument,
      visibility: "internal",
    });

    const response = await GET(downloadRequest(), { params: Promise.resolve({ id: "doc-1" }) });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Du saknar behörighet till dokumentet",
      errorCode: "FORBIDDEN",
      requestId,
    });
    expect(JSON.stringify(loggerWarnMock.mock.calls)).not.toContain("doc-1");
  });

  it("returns a correlated 410 for an inactive tenant document", async () => {
    getCurrentUserMock.mockResolvedValue(residentUser);
    managedDocumentFindFirstMock.mockResolvedValue({ ...modernDocument, lifecycle_state: "archived" });

    const response = await GET(downloadRequest(), { params: Promise.resolve({ id: "doc-1" }) });
    const body = await response.json();

    expect(response.status).toBe(410);
    expect(body).toEqual({
      error: "Dokumentet är inte längre publicerat",
      errorCode: "NOT_FOUND",
      requestId,
    });
    expect(auditLogCreateMock).not.toHaveBeenCalled();
  });

  it("returns a correlated 503 when private storage is not configured after access is verified", async () => {
    getCurrentUserMock.mockResolvedValue(residentUser);
    managedDocumentFindFirstMock.mockResolvedValue({
      ...modernDocument,
      storage_url: "blob://private/doc.pdf",
      data_url: null,
    });
    getStorageTokenMock.mockReturnValue(null);

    const response = await GET(downloadRequest(), { params: Promise.resolve({ id: "doc-1" }) });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      error: "Fillagringen är inte konfigurerad",
      errorCode: "SERVICE_UNAVAILABLE",
      requestId,
    });
    expect(blobGetMock).not.toHaveBeenCalled();
    expect(JSON.stringify(loggerWarnMock.mock.calls)).not.toContain("blob://private");
  });

  it("returns a correlated 422 for a size mismatch and does not audit a failed download", async () => {
    getCurrentUserMock.mockResolvedValue(residentUser);
    managedDocumentFindFirstMock.mockResolvedValue({ ...modernDocument, size_bytes: pdfBytes.length + 10 });

    const response = await GET(downloadRequest(), { params: Promise.resolve({ id: "doc-1" }) });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.errorCode).toBe("VALIDATION_FAILED");
    expect(body.requestId).toBe(requestId);
    expect(auditLogCreateMock).not.toHaveBeenCalled();
  });

  it("returns a safe correlated 500 without leaking dependency details", async () => {
    getCurrentUserMock.mockRejectedValue(new Error("postgres://user:secret@db.internal/revalta"));

    const response = await GET(downloadRequest(), { params: Promise.resolve({ id: "doc-1" }) });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Internt serverfel", errorCode: "INTERNAL_ERROR", requestId });
    expect(JSON.stringify(body)).not.toContain("postgres://");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "resident document download failed",
      expect.any(Error),
      expect.objectContaining({ event: "resident_documents.download.failed" }),
    );
  });
});
