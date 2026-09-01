import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  ticketFindFirstMock,
  attachmentCreateMock,
  transactionMock,
  writeAuditLogMock,
  recordStorageEventMock,
  storeAttachmentMock,
  deleteStoredFileMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  ticketFindFirstMock: vi.fn(),
  attachmentCreateMock: vi.fn(),
  transactionMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  recordStorageEventMock: vi.fn(),
  storeAttachmentMock: vi.fn(),
  deleteStoredFileMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

class StorageConfigurationError extends Error {}

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
  canManageTickets: () => true,
  tenantWhere: () => ({ company_id: "company-1" }),
}));
vi.mock("@/lib/assigned-work-access", () => ({
  isAssignedWorkAccessible: () => true,
  notFoundTicket: () => Response.json({ error: "Ärendet hittades inte" }, { status: 404 }),
}));
vi.mock("@/lib/document-file-security", () => ({
  validateUploadFile: () => ({
    ok: true,
    fileName: "photo.png",
    contentType: "image/png",
    sizeBytes: 8,
  }),
}));
vi.mock("@/lib/storage", () => ({
  StorageConfigurationError,
  storeAttachment: storeAttachmentMock,
  deleteStoredFile: deleteStoredFileMock,
}));
vi.mock("@/lib/integrations", () => ({ recordStorageEvent: recordStorageEventMock }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/structured-logger", () => ({
  createLogger: () => ({ error: loggerErrorMock, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));
vi.mock("@/lib/db", () => ({
  default: {
    ticket: { findFirst: ticketFindFirstMock },
    $transaction: transactionMock,
  },
}));

import { POST } from "./route";

function request() {
  const formData = new FormData();
  formData.set("file", new File([Buffer.from("png-data")], "photo.png", { type: "image/png" }));
  return new Request("https://www.revalta.se/api/tickets/ticket-1/attachments", {
    method: "POST",
    body: formData,
  });
}

const context = { params: Promise.resolve({ id: "ticket-1" }) };
const attachment = {
  id: "attachment-1",
  file_name: "photo.png",
  content_type: "image/png",
  size_bytes: 8,
  data_url: "https://blob.example/private/photo.png",
  created_at: new Date("2026-09-02T00:00:00Z"),
};

describe("ticket attachment reliability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({
      id: "user-1",
      email: "owner@example.com",
      role: "owner",
      company_id: "company-1",
    });
    ticketFindFirstMock.mockResolvedValue({ id: "ticket-1", title: "Leak", assigned_to_id: null });
    storeAttachmentMock.mockResolvedValue({
      provider: "vercel_blob",
      url: "https://blob.example/private/photo.png",
    });
    attachmentCreateMock.mockResolvedValue(attachment);
    writeAuditLogMock.mockResolvedValue(undefined);
    recordStorageEventMock.mockResolvedValue(undefined);
    deleteStoredFileMock.mockResolvedValue(undefined);
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      ticketAttachment: { create: attachmentCreateMock },
    }));
  });

  it("returns 201 after a committed attachment even when storage telemetry fails", async () => {
    recordStorageEventMock.mockRejectedValue(new Error("telemetry unavailable"));

    const response = await POST(request(), context);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.attachment.data_url).toBe("/api/attachments/attachment-1");
    expect(deleteStoredFileMock).not.toHaveBeenCalled();
    expect(loggerErrorMock).toHaveBeenCalledWith("Attachment storage telemetry failed", expect.any(Error));
  });

  it("deletes the uploaded blob when the database or audit transaction fails", async () => {
    writeAuditLogMock.mockRejectedValue(new Error("audit transaction failed"));

    const response = await POST(request(), context);

    expect(response.status).toBe(500);
    expect(deleteStoredFileMock).toHaveBeenCalledWith("https://blob.example/private/photo.png");
    expect(recordStorageEventMock).not.toHaveBeenCalled();
  });

  it("does not upload when the tenant-scoped ticket cannot be found", async () => {
    ticketFindFirstMock.mockResolvedValue(null);

    const response = await POST(request(), context);

    expect(response.status).toBe(404);
    expect(ticketFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "ticket-1", company_id: "company-1", deleted_at: null }),
    }));
    expect(storeAttachmentMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
