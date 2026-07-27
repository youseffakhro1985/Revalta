import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  requireCompanyUserMock,
  canManageTicketsMock,
  ticketFindFirstMock,
  ticketAttachmentCreateMock,
  auditLogCreateMock,
  transactionMock,
  validateUploadFileMock,
  storeAttachmentMock,
  deleteStoredFileMock,
  recordStorageEventMock,
  isAssignedWorkAccessibleMock,
  isMissingSchemaColumnErrorMock,
  schemaMismatchUserMessageMock,
  loggerInfoMock,
  loggerWarnMock,
  loggerErrorMock,
  createLoggerMock,
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  requireCompanyUserMock: vi.fn(),
  canManageTicketsMock: vi.fn(),
  ticketFindFirstMock: vi.fn(),
  ticketAttachmentCreateMock: vi.fn(),
  auditLogCreateMock: vi.fn(),
  transactionMock: vi.fn(),
  validateUploadFileMock: vi.fn(),
  storeAttachmentMock: vi.fn(),
  deleteStoredFileMock: vi.fn(),
  recordStorageEventMock: vi.fn(),
  isAssignedWorkAccessibleMock: vi.fn(),
  isMissingSchemaColumnErrorMock: vi.fn(),
  schemaMismatchUserMessageMock: vi.fn(),
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
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
  requireCompanyUser: requireCompanyUserMock,
  canManageTickets: canManageTicketsMock,
}));
vi.mock("@/lib/document-file-security", () => ({ validateUploadFile: validateUploadFileMock }));
vi.mock("@/lib/storage", () => ({
  StorageConfigurationError: class StorageConfigurationError extends Error {},
  storeAttachment: storeAttachmentMock,
  deleteStoredFile: deleteStoredFileMock,
}));
vi.mock("@/lib/integrations", () => ({ recordStorageEvent: recordStorageEventMock }));
vi.mock("@/lib/assigned-work-access", () => ({
  isAssignedWorkAccessible: isAssignedWorkAccessibleMock,
}));
vi.mock("@/lib/schema-readiness", () => ({
  isMissingSchemaColumnError: isMissingSchemaColumnErrorMock,
  schemaMismatchUserMessage: schemaMismatchUserMessageMock,
}));
vi.mock("@/lib/structured-logger", () => ({ createLogger: createLoggerMock }));

import { POST } from "./route";

const user = {
  id: "user-1",
  company_id: "company-1",
  role: "admin",
  name: "Anna",
  email: "anna@example.se",
};
const file = new File(["content"], "underlag.pdf", { type: "application/pdf" });
const attachment = {
  id: "attachment-1",
  file_name: "underlag.pdf",
  content_type: "application/pdf",
  size_bytes: 7,
  data_url: "https://blob.example/underlag.pdf",
  created_at: new Date("2026-07-27T20:00:00Z"),
};

function request(requestId = "request-attachment-1") {
  return {
    headers: new Headers({ "x-request-id": requestId }),
    formData: vi.fn().mockResolvedValue({ get: () => file }),
  } as unknown as Request;
}
function context() {
  return { params: Promise.resolve({ id: "ticket-1" }) };
}

describe("POST /api/tickets/[id]/attachments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLoggerMock.mockReturnValue({ info: loggerInfoMock, warn: loggerWarnMock, error: loggerErrorMock });
    getCurrentUserMock.mockResolvedValue(user);
    requireCompanyUserMock.mockReturnValue(user);
    canManageTicketsMock.mockReturnValue(true);
    isAssignedWorkAccessibleMock.mockReturnValue(true);
    isMissingSchemaColumnErrorMock.mockReturnValue(false);
    schemaMismatchUserMessageMock.mockReturnValue("Databasen uppdateras");
    ticketFindFirstMock.mockResolvedValue({ id: "ticket-1", assigned_to_id: "user-1" });
    validateUploadFileMock.mockReturnValue({
      ok: true,
      fileName: "underlag.pdf",
      contentType: "application/pdf",
      sizeBytes: 7,
    });
    storeAttachmentMock.mockResolvedValue({
      provider: "vercel_blob",
      url: "https://blob.example/underlag.pdf",
    });
    ticketAttachmentCreateMock.mockResolvedValue(attachment);
    auditLogCreateMock.mockResolvedValue({ id: "audit-1" });
    transactionMock.mockImplementation(async (callback) => callback({
      ticketAttachment: { create: ticketAttachmentCreateMock },
      auditLog: { create: auditLogCreateMock },
    }));
    deleteStoredFileMock.mockResolvedValue(undefined);
    recordStorageEventMock.mockResolvedValue(undefined);
  });

  it("scopes the ticket and parent property to the verified company", async () => {
    await POST(request(), context());

    expect(ticketFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "ticket-1",
        company_id: "company-1",
        deleted_at: null,
        OR: expect.arrayContaining([
          { property_id: null },
          { property: { company_id: "company-1", deleted_at: null } },
        ]),
      }),
    }));
  });

  it("creates attachment metadata and audit atomically", async () => {
    const response = await POST(request(), context());

    expect(response.status).toBe(201);
    expect(ticketAttachmentCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        ticket_id: "ticket-1",
        data_url: "https://blob.example/underlag.pdf",
      }),
    }));
    expect(auditLogCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        company_id: "company-1",
        action: "ticket.attachment_created",
        metadata: expect.objectContaining({ attachmentId: "attachment-1", provider: "vercel_blob" }),
      }),
    });
  });

  it("deletes the uploaded blob when the database transaction fails", async () => {
    transactionMock.mockRejectedValue(new Error("database unavailable"));

    const response = await POST(request(), context());

    expect(response.status).toBe(500);
    expect(deleteStoredFileMock).toHaveBeenCalledWith("https://blob.example/underlag.pdf");
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "orphaned ticket attachment compensated",
      expect.objectContaining({ eventCode: "tickets.attachments.create.compensated" }),
    );
  });

  it("returns 201 when storage telemetry fails after commit", async () => {
    recordStorageEventMock.mockRejectedValue(new Error("telemetry unavailable"));

    const response = await POST(request(), context());

    expect(response.status).toBe(201);
    expect(deleteStoredFileMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "ticket attachment telemetry failed",
      expect.objectContaining({ eventCode: "tickets.attachments.create.partial_failure" }),
    );
  });

  it("returns a private correlated response", async () => {
    const response = await POST(request("request-attachment-2"), context());

    expect(response.headers.get("x-request-id")).toBe("request-attachment-2");
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
