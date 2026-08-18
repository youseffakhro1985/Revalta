import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createLoggerMock,
  getCurrentUserMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  managedDocumentFindFirstMock,
  auditLogFindFirstMock,
  blobGetMock,
  getStorageTokenMock,
} = vi.hoisted(() => ({
  createLoggerMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  managedDocumentFindFirstMock: vi.fn(),
  auditLogFindFirstMock: vi.fn(),
  blobGetMock: vi.fn(),
  getStorageTokenMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/db", () => ({
  default: {
    managedDocument: { findFirst: managedDocumentFindFirstMock },
    auditLog: { findFirst: auditLogFindFirstMock },
  },
}));

vi.mock("@vercel/blob", () => ({
  get: blobGetMock,
}));

vi.mock("@/lib/storage", () => ({
  getStorageToken: getStorageTokenMock,
}));

vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { GET } from "./route";

function streamFromString(value: string) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(value));
      controller.close();
    },
  });
}

const requestId = "550e8400-e29b-41d4-a716-446655440000";
const params = Promise.resolve({ id: "doc-1" });

function request(path = "doc-1") {
  return new Request(`http://localhost/api/documents/${path}/download`, {
    headers: { "x-request-id": requestId },
  });
}

describe("documents/[id]/download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    getStorageTokenMock.mockReturnValue("blob-token");
  });

  it("returns a correlated stable 401 when there is no authenticated user", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const response = await GET(request(), { params });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      error: "Obehörig",
      errorCode: "UNAUTHORIZED",
      requestId,
    });
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(managedDocumentFindFirstMock).not.toHaveBeenCalled();
  });

  it("streams a document owned by the requesting user's company with correlation", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-a", role: "owner" });
    managedDocumentFindFirstMock.mockResolvedValue({
      file_name: "avtal.pdf",
      content_type: "application/pdf",
      storage_url: "blob://path/avtal.pdf",
      data_url: null,
    });
    blobGetMock.mockResolvedValue({ stream: streamFromString("pdf-bytes") });

    const response = await GET(request(), { params });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toContain("avtal.pdf");
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(managedDocumentFindFirstMock).toHaveBeenCalledWith({
      where: { id: "doc-1", company_id: "company-a" },
      select: {
        file_name: true,
        content_type: true,
        storage_url: true,
        data_url: true,
      },
    });
    expect(blobGetMock).toHaveBeenCalledWith("blob://path/avtal.pdf", {
      access: "private",
      token: "blob-token",
    });
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "document download completed",
      expect.objectContaining({
        event: "documents.download.completed",
        userId: "user-1",
        companyId: "company-a",
        documentId: "doc-1",
        storage: "private_blob",
      }),
    );
  });

  it("never returns another company's document: scopes the lookup by the caller's company_id and 404s when it belongs to a different tenant", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-a", role: "owner" });
    // Document actually belongs to "company-b" — the tenant-scoped query must not find it.
    managedDocumentFindFirstMock.mockResolvedValue(null);
    auditLogFindFirstMock.mockResolvedValue(null);

    const response = await GET(request(), { params });
    const body = await response.json();

    expect(managedDocumentFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "doc-1", company_id: "company-a" } }),
    );
    expect(auditLogFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "doc-1", company_id: "company-a" }),
      }),
    );
    expect(response.status).toBe(404);
    expect(body).toEqual({
      error: "Dokumentet hittades inte",
      errorCode: "NOT_FOUND",
      requestId,
    });
    expect(blobGetMock).not.toHaveBeenCalled();
  });

  it("404s for a document id that does not exist at all", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-a", role: "owner" });
    managedDocumentFindFirstMock.mockResolvedValue(null);
    auditLogFindFirstMock.mockResolvedValue(null);

    const response = await GET(request("missing"), {
      params: Promise.resolve({ id: "missing" }),
    });

    expect(response.status).toBe(404);
  });

  it("scopes actor-only users (no company_id) to their own audit log entries", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: null, role: "owner" });
    auditLogFindFirstMock.mockResolvedValue(null);

    const response = await GET(request(), { params });

    expect(managedDocumentFindFirstMock).not.toHaveBeenCalled();
    expect(auditLogFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ actor_user_id: "user-1" }),
      }),
    );
    expect(response.status).toBe(404);
  });

  it("returns legacy audit-log-backed base64 documents scoped to the caller's company", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-a", role: "owner" });
    managedDocumentFindFirstMock.mockResolvedValue(null);
    const base64 = Buffer.from("hello world").toString("base64");
    auditLogFindFirstMock.mockResolvedValue({
      metadata: {
        contentType: "text/plain",
        fileName: "legacy.txt",
        dataUrl: `data:text/plain;base64,${base64}`,
      },
    });

    const response = await GET(request(), { params });
    const bytes = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(bytes.toString()).toBe("hello world");
    expect(response.headers.get("Content-Disposition")).toContain("legacy.txt");
    expect(response.headers.get("x-request-id")).toBe(requestId);
  });

  it("returns a correlated 503 when blob storage is not configured for a storage_url document", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-a", role: "owner" });
    managedDocumentFindFirstMock.mockResolvedValue({
      file_name: "avtal.pdf",
      content_type: "application/pdf",
      storage_url: "blob://path/avtal.pdf",
      data_url: null,
    });
    getStorageTokenMock.mockReturnValue(null);

    const response = await GET(request(), { params });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      error: "Fillagringen är inte konfigurerad",
      errorCode: "SERVICE_UNAVAILABLE",
      requestId,
    });
    expect(blobGetMock).not.toHaveBeenCalled();
  });

  it("404s when the modern document has neither storage_url nor data_url", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-a", role: "owner" });
    managedDocumentFindFirstMock.mockResolvedValue({
      file_name: "avtal.pdf",
      content_type: "application/pdf",
      storage_url: null,
      data_url: null,
    });

    const response = await GET(request(), { params });

    expect(response.status).toBe(404);
  });

  it("returns a correlated safe 500 and never exposes an unexpected error", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-a", role: "owner" });
    managedDocumentFindFirstMock.mockRejectedValue(new Error("postgres://secret@db.internal/revalta"));

    const response = await GET(request(), { params });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Internt serverfel",
      errorCode: "INTERNAL_ERROR",
      requestId,
    });
    expect(JSON.stringify(body)).not.toContain("postgres://");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "document download failed",
      expect.any(Error),
      expect.objectContaining({ event: "documents.download.failed" }),
    );
  });
});
