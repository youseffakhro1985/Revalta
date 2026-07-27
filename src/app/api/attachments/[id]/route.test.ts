import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  blobGetMock,
  attachmentFindFirstMock,
  getCurrentUserMock,
  requireCompanyUserMock,
  isAssignedWorkAccessibleMock,
  getStorageTokenMock,
  isMissingSchemaColumnErrorMock,
  schemaMismatchUserMessageMock,
  loggerInfoMock,
  loggerWarnMock,
  loggerErrorMock,
  createLoggerMock,
} = vi.hoisted(() => ({
  blobGetMock: vi.fn(),
  attachmentFindFirstMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  requireCompanyUserMock: vi.fn(),
  isAssignedWorkAccessibleMock: vi.fn(),
  getStorageTokenMock: vi.fn(),
  isMissingSchemaColumnErrorMock: vi.fn(),
  schemaMismatchUserMessageMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  createLoggerMock: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({ get: blobGetMock }));
vi.mock("@/lib/db", () => ({
  default: { ticketAttachment: { findFirst: attachmentFindFirstMock } },
}));
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
  requireCompanyUser: requireCompanyUserMock,
}));
vi.mock("@/lib/assigned-work-access", () => ({
  isAssignedWorkAccessible: isAssignedWorkAccessibleMock,
}));
vi.mock("@/lib/storage", () => ({ getStorageToken: getStorageTokenMock }));
vi.mock("@/lib/schema-readiness", () => ({
  isMissingSchemaColumnError: isMissingSchemaColumnErrorMock,
  schemaMismatchUserMessage: schemaMismatchUserMessageMock,
}));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { GET } from "./route";

const user = {
  id: "user-1",
  company_id: "company-1",
  role: "manager",
  name: "Test User",
  email: "test@example.com",
};

const attachment = {
  id: "attachment-1",
  file_name: "underlag.pdf",
  content_type: "application/pdf",
  size_bytes: 4,
  data_url: "https://store.private.blob.vercel-storage.com/file.pdf",
  ticket: { id: "ticket-1", assigned_to_id: "user-1" },
};

function request(requestId = "request-1") {
  return new Request("https://www.revalta.se/api/attachments/attachment-1", {
    headers: { "x-request-id": requestId },
  });
}

function context(id = "attachment-1") {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/attachments/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue(user);
    requireCompanyUserMock.mockReturnValue(user);
    isAssignedWorkAccessibleMock.mockReturnValue(true);
    getStorageTokenMock.mockReturnValue("storage-token");
    attachmentFindFirstMock.mockResolvedValue(attachment);
    blobGetMock.mockResolvedValue({ stream: new ReadableStream() });
    isMissingSchemaColumnErrorMock.mockReturnValue(false);
    schemaMismatchUserMessageMock.mockReturnValue("Databasschemat är inte redo");
    createLoggerMock.mockReturnValue({
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
  });

  it("fails closed before database access without a verified company user", async () => {
    requireCompanyUserMock.mockReturnValue(null);

    const response = await GET(request(), context());

    expect(response.status).toBe(401);
    expect(attachmentFindFirstMock).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      errorCode: "UNAUTHORIZED",
      requestId: "request-1",
    });
  });

  it("scopes attachment, ticket and parent property to the verified company", async () => {
    await GET(request(), context());

    expect(attachmentFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "attachment-1",
        ticket: {
          company_id: "company-1",
          deleted_at: null,
          OR: [
            { property_id: null },
            { property: { company_id: "company-1", deleted_at: null } },
          ],
        },
      },
    }));
  });

  it("returns 404 for a direct-id request outside assigned-work access", async () => {
    isAssignedWorkAccessibleMock.mockReturnValue(false);

    const response = await GET(request(), context());

    expect(response.status).toBe(404);
    expect(blobGetMock).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ errorCode: "NOT_FOUND" });
  });

  it("downloads a private blob with the configured token and secure headers", async () => {
    const response = await GET(request("download-request"), context());

    expect(response.status).toBe(200);
    expect(blobGetMock).toHaveBeenCalledWith(attachment.data_url, {
      access: "private",
      token: "storage-token",
    });
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    expect(response.headers.get("cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("vercel-cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(response.headers.get("x-request-id")).toBe("download-request");
    expect(response.headers.get("content-type")).toBe("application/pdf");
  });

  it("sanitizes control characters in content-disposition", async () => {
    attachmentFindFirstMock.mockResolvedValue({
      ...attachment,
      file_name: "rapport\r\nX-Evil: injected.pdf",
    });

    const response = await GET(request(), context());
    const disposition = response.headers.get("content-disposition") ?? "";

    expect(response.status).toBe(200);
    expect(disposition).not.toContain("\r");
    expect(disposition).not.toContain("\n");
    expect(disposition).toContain("filename=");
  });

  it("supports legacy data-url attachments without calling blob storage", async () => {
    attachmentFindFirstMock.mockResolvedValue({
      ...attachment,
      data_url: "data:text/plain;base64,dGVzdA==",
      content_type: "text/plain",
    });

    const response = await GET(request(), context());

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("test");
    expect(blobGetMock).not.toHaveBeenCalled();
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "legacy attachment downloaded",
      expect.objectContaining({ storageMode: "legacy_data_url" }),
    );
  });

  it("returns a correlated 503 when private storage is not configured", async () => {
    getStorageTokenMock.mockReturnValue(null);

    const response = await GET(request("storage-request"), context());

    expect(response.status).toBe(503);
    expect(blobGetMock).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      errorCode: "SERVICE_UNAVAILABLE",
      requestId: "storage-request",
    });
  });

  it("returns 404 when the blob provider no longer has the object", async () => {
    blobGetMock.mockResolvedValue(null);

    const response = await GET(request(), context());

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ errorCode: "NOT_FOUND" });
  });

  it("returns a safe schema-readiness error without leaking internals", async () => {
    const databaseError = new Error("column secret_internal missing");
    attachmentFindFirstMock.mockRejectedValue(databaseError);
    isMissingSchemaColumnErrorMock.mockReturnValue(true);

    const response = await GET(request(), context());
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toMatchObject({
      error: "Databasschemat är inte redo",
      errorCode: "SERVICE_UNAVAILABLE",
    });
    expect(JSON.stringify(payload)).not.toContain("secret_internal");
  });

  it("does not log file names or storage urls on success", async () => {
    await GET(request(), context());

    const serializedLogs = JSON.stringify(loggerInfoMock.mock.calls);
    expect(serializedLogs).not.toContain(attachment.file_name);
    expect(serializedLogs).not.toContain(attachment.data_url);
  });
});
