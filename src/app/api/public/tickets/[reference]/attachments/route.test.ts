import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  ticketFindFirstMock,
  transactionMock,
  attachmentCreateMock,
  auditCreateMock,
  checkRateLimitMock,
  getClientIpMock,
  storeAttachmentMock,
  deleteStoredFileMock,
  validateUploadFileMock,
  recordStorageEventMock,
  verifyPortalTrackingTokenMock,
  extractPortalTrackingTokenMock,
  isMissingSchemaColumnErrorMock,
  loggerInfoMock,
  loggerWarnMock,
  loggerErrorMock,
  createLoggerMock,
} = vi.hoisted(() => ({
  ticketFindFirstMock: vi.fn(),
  transactionMock: vi.fn(),
  attachmentCreateMock: vi.fn(),
  auditCreateMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  getClientIpMock: vi.fn(),
  storeAttachmentMock: vi.fn(),
  deleteStoredFileMock: vi.fn(),
  validateUploadFileMock: vi.fn(),
  recordStorageEventMock: vi.fn(),
  verifyPortalTrackingTokenMock: vi.fn(),
  extractPortalTrackingTokenMock: vi.fn(),
  isMissingSchemaColumnErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  createLoggerMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: {
    ticket: { findFirst: ticketFindFirstMock },
    $transaction: transactionMock,
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
  getClientIp: getClientIpMock,
}));
vi.mock("@/lib/storage", () => {
  class StorageConfigurationError extends Error {}
  return {
    StorageConfigurationError,
    storeAttachment: storeAttachmentMock,
    deleteStoredFile: deleteStoredFileMock,
  };
});
vi.mock("@/lib/document-file-security", () => ({
  validateUploadFile: validateUploadFileMock,
}));
vi.mock("@/lib/integrations", () => ({
  recordStorageEvent: recordStorageEventMock,
}));
vi.mock("@/lib/portal-tracking", () => ({
  extractPortalTrackingToken: extractPortalTrackingTokenMock,
  verifyPortalTrackingToken: verifyPortalTrackingTokenMock,
}));
vi.mock("@/lib/schema-readiness", () => ({
  isMissingSchemaColumnError: isMissingSchemaColumnErrorMock,
  schemaMismatchUserMessage: vi.fn(() => "Databasen är inte redo"),
}));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { POST } from "./route";

const params = Promise.resolve({ reference: "rv-2026-test" });
const attachment = {
  id: "attachment-1",
  file_name: "photo.png",
  content_type: "image/png",
  size_bytes: 8,
  created_at: new Date("2026-07-28T10:00:00.000Z"),
};

function uploadRequest(options?: {
  email?: string;
  file?: File;
  token?: string;
  requestId?: string;
}) {
  const formData = new FormData();
  formData.set("email", options?.email ?? "boende@example.se");
  formData.set(
    "file",
    options?.file ?? new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "photo.png", {
      type: "image/png",
    }),
  );
  if (options?.token) formData.set("token", options.token);

  return new Request("https://www.revalta.se/api/public/tickets/RV-2026-TEST/attachments", {
    method: "POST",
    headers: { "x-request-id": options?.requestId ?? "attachment-request-1" },
    body: formData,
  });
}

describe("POST /api/public/tickets/[reference]/attachments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({
      info: loggerInfoMock,
      warn: loggerWarnMock,
      error: loggerErrorMock,
    });
    getClientIpMock.mockReturnValue("127.0.0.1");
    checkRateLimitMock.mockResolvedValue({
      allowed: true,
      remaining: 9,
      resetAt: new Date(Date.now() + 60_000),
      source: "database",
    });
    extractPortalTrackingTokenMock.mockReturnValue(null);
    verifyPortalTrackingTokenMock.mockReturnValue(null);
    ticketFindFirstMock.mockResolvedValue({
      id: "ticket-1",
      company_id: "company-1",
      user_id: "owner-1",
    });
    validateUploadFileMock.mockReturnValue({
      ok: true,
      fileName: "photo.png",
      contentType: "image/png",
      sizeBytes: 8,
    });
    storeAttachmentMock.mockResolvedValue({
      url: "https://blob.example/private/photo.png",
      provider: "vercel_blob",
    });
    attachmentCreateMock.mockResolvedValue(attachment);
    auditCreateMock.mockResolvedValue({ id: "audit-1" });
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      ticketAttachment: { create: attachmentCreateMock },
      auditLog: { create: auditCreateMock },
    }));
    deleteStoredFileMock.mockResolvedValue(undefined);
    recordStorageEventMock.mockResolvedValue(undefined);
    isMissingSchemaColumnErrorMock.mockReturnValue(false);
  });

  it("rate limits before parsing multipart data or touching the database", async () => {
    checkRateLimitMock.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 30_000),
      source: "database",
    });

    const response = await POST(uploadRequest(), { params });
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload.errorCode).toBe("RATE_LIMITED");
    expect(response.headers.get("retry-after")).toBeTruthy();
    expect(ticketFindFirstMock).not.toHaveBeenCalled();
    expect(storeAttachmentMock).not.toHaveBeenCalled();
  });

  it("verifies tenant-bound ticket access before reading file bytes", async () => {
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(8));
    const file = new File(["payload"], "photo.png", { type: "image/png" });
    Object.defineProperty(file, "arrayBuffer", { value: arrayBuffer });
    ticketFindFirstMock.mockResolvedValue(null);

    const response = await POST(uploadRequest({ file }), { params });

    expect(response.status).toBe(404);
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(ticketFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        public_reference: "RV-2026-TEST",
        reporter_email: "boende@example.se",
        deleted_at: null,
      }),
    }));
  });

  it("binds tracking token reference, email and company to the lookup", async () => {
    extractPortalTrackingTokenMock.mockReturnValue("tracking-token");
    verifyPortalTrackingTokenMock.mockReturnValue({
      reference: "RV-2026-TEST",
      email: "token@example.se",
      companyId: "company-token",
      exp: Date.now() + 60_000,
    });

    const response = await POST(uploadRequest({ email: "ignored@example.se", token: "tracking-token" }), { params });

    expect(response.status).toBe(201);
    expect(ticketFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        public_reference: "RV-2026-TEST",
        reporter_email: "token@example.se",
        company_id: "company-token",
      }),
    }));
  });

  it("stores a private attachment and commits metadata plus audit atomically", async () => {
    const response = await POST(uploadRequest(), { params });
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.attachment.id).toBe("attachment-1");
    expect(storeAttachmentMock).toHaveBeenCalledWith(expect.objectContaining({
      prefix: "public-tickets/ticket-1",
      fileName: "photo.png",
      contentType: "image/png",
    }));
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(attachmentCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        ticket_id: "ticket-1",
        visibility: "public",
        data_url: "https://blob.example/private/photo.png",
      }),
    }));
    expect(auditCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        company_id: "company-1",
        actor_user_id: "owner-1",
        entity_id: "ticket-1",
        action: "public.attachment_created",
      }),
    }));
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    expect(response.headers.get("x-request-id")).toBe("attachment-request-1");
  });

  it("deletes the stored blob when the database transaction fails", async () => {
    transactionMock.mockRejectedValue(new Error("database unavailable"));

    const response = await POST(uploadRequest(), { params });

    expect(response.status).toBe(500);
    expect(deleteStoredFileMock).toHaveBeenCalledWith("https://blob.example/private/photo.png");
    expect(recordStorageEventMock).not.toHaveBeenCalled();
  });

  it("returns 201 when the post-commit storage event fails", async () => {
    recordStorageEventMock.mockRejectedValue(new Error("integration unavailable"));

    const response = await POST(uploadRequest(), { params });

    expect(response.status).toBe(201);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "public ticket attachment storage event failed",
      expect.objectContaining({
        eventCode: "public_tickets.attachment.storage_event_failed",
        attachmentId: "attachment-1",
      }),
    );
  });

  it("returns a safe service-unavailable response for missing storage configuration", async () => {
    const { StorageConfigurationError } = await import("@/lib/storage");
    storeAttachmentMock.mockRejectedValue(new StorageConfigurationError());

    const response = await POST(uploadRequest(), { params });
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.errorCode).toBe("SERVICE_UNAVAILABLE");
    expect(payload.error).toBe("Filuppladdning är tillfälligt inte tillgänglig");
  });

  it("returns a safe schema readiness response", async () => {
    const error = new Error("column missing");
    transactionMock.mockRejectedValue(error);
    isMissingSchemaColumnErrorMock.mockImplementation((value: unknown) => value === error);

    const response = await POST(uploadRequest(), { params });
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.errorCode).toBe("SERVICE_UNAVAILABLE");
    expect(payload.error).toBe("Databasen är inte redo");
    expect(deleteStoredFileMock).toHaveBeenCalled();
  });
});
