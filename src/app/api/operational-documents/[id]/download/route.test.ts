import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  blobGetMock,
  createLoggerMock,
  getCurrentUserMock,
  getStorageTokenMock,
  isOperationalDocumentAccessibleMock,
  loggerErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  operationalDocumentFindFirstMock,
} = vi.hoisted(() => ({
  blobGetMock: vi.fn(),
  createLoggerMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  getStorageTokenMock: vi.fn(),
  isOperationalDocumentAccessibleMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  operationalDocumentFindFirstMock: vi.fn(),
}));

vi.mock("@/lib/current-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/current-user")>()),
  getCurrentUser: getCurrentUserMock,
}));
vi.mock("@/lib/db", () => ({
  default: {
    operationalDocument: { findFirst: operationalDocumentFindFirstMock },
  },
}));
vi.mock("@/lib/operational-document-access", () => ({
  isOperationalDocumentAccessible: isOperationalDocumentAccessibleMock,
}));
vi.mock("@/lib/storage", () => ({ getStorageToken: getStorageTokenMock }));
vi.mock("@vercel/blob", () => ({ get: blobGetMock }));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { GET } from "./route";

const requestId = "550e8400-e29b-41d4-a716-446655440000";
const params = Promise.resolve({ id: "doc-1" });

function request(path = "doc-1") {
  return new Request(`https://www.revalta.se/api/operational-documents/${path}/download`, {
    headers: { "x-request-id": requestId },
  });
}

function streamFromString(value: string) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(value));
      controller.close();
    },
  });
}

function documentFixture() {
  return {
    id: "doc-1",
    file_name: "protokoll.pdf",
    storage_url: "blob://private/protokoll.pdf",
    content_type: "application/pdf",
    work_order_id: "work-order-1",
    project_id: null,
    property_id: null,
    technical_asset_id: null,
  };
}

describe("operational-documents/[id]/download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      debug: vi.fn(),
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    isOperationalDocumentAccessibleMock.mockResolvedValue(true);
    getStorageTokenMock.mockReturnValue("blob-token");
  });

  it("returns a correlated stable 401 before touching document data", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const response = await GET(request(), { params });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "Obehörig", errorCode: "UNAUTHORIZED", requestId });
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(operationalDocumentFindFirstMock).not.toHaveBeenCalled();
  });

  it("tenant-scopes the lookup and returns a stable correlated 404 without logging an unverified id", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-a", role: "manager" });
    operationalDocumentFindFirstMock.mockResolvedValue(null);

    const response = await GET(request("external-secret-id"), {
      params: Promise.resolve({ id: "external-secret-id" }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: "Dokumentet hittades inte", errorCode: "NOT_FOUND", requestId });
    expect(operationalDocumentFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "external-secret-id", company_id: "company-a", deleted_at: null },
    }));
    expect(blobGetMock).not.toHaveBeenCalled();
    expect(JSON.stringify(loggerWarnMock.mock.calls)).not.toContain("external-secret-id");
  });

  it("returns a correlated 503 after access is verified when storage is unavailable", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-a", role: "manager" });
    operationalDocumentFindFirstMock.mockResolvedValue(documentFixture());
    getStorageTokenMock.mockReturnValue(null);

    const response = await GET(request(), { params });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      error: "Fillagringen är inte konfigurerad",
      errorCode: "SERVICE_UNAVAILABLE",
      requestId,
    });
    expect(isOperationalDocumentAccessibleMock).toHaveBeenCalled();
    expect(blobGetMock).not.toHaveBeenCalled();
  });

  it("streams a verified private blob with request correlation and private cache headers", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-a", role: "manager" });
    operationalDocumentFindFirstMock.mockResolvedValue(documentFixture());
    blobGetMock.mockResolvedValue({ stream: streamFromString("pdf-bytes") });

    const response = await GET(request(), { params });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("protokoll.pdf");
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("vercel-cdn-cache-control")).toBe("no-store");
    expect(blobGetMock).toHaveBeenCalledWith("blob://private/protokoll.pdf", {
      access: "private",
      token: "blob-token",
    });
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "operational document download completed",
      expect.objectContaining({
        event: "operational_documents.download.completed",
        userId: "user-1",
        companyId: "company-a",
        documentId: "doc-1",
        storage: "private_blob",
      }),
    );
    expect(JSON.stringify(loggerInfoMock.mock.calls)).not.toContain("protokoll.pdf");
    expect(JSON.stringify(loggerInfoMock.mock.calls)).not.toContain("blob://private");
  });

  it("returns a safe correlated 500 without leaking storage or database details", async () => {
    getCurrentUserMock.mockRejectedValue(new Error("postgres://user:secret@db.internal/revalta"));

    const response = await GET(request(), { params });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Internt serverfel", errorCode: "INTERNAL_ERROR", requestId });
    expect(JSON.stringify(body)).not.toContain("postgres://");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "operational document download failed",
      expect.any(Error),
      expect.objectContaining({ event: "operational_documents.download.failed" }),
    );
  });
});
