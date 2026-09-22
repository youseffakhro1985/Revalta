import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  ticketFindFirstMock,
  ticketAttachmentCreateMock,
  writeAuditLogMock,
  recordStorageEventMock,
  storeAttachmentMock,
  checkRateLimitMock,
  getClientIpMock,
  verifyPortalTrackingTokenMock,
  extractPortalTrackingTokenMock,
  validateUploadFileMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  ticketFindFirstMock: vi.fn(),
  ticketAttachmentCreateMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
  recordStorageEventMock: vi.fn(),
  storeAttachmentMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  getClientIpMock: vi.fn(),
  verifyPortalTrackingTokenMock: vi.fn(),
  extractPortalTrackingTokenMock: vi.fn(),
  validateUploadFileMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: {
    ticket: { findFirst: ticketFindFirstMock },
    ticketAttachment: { create: ticketAttachmentCreateMock },
  },
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: writeAuditLogMock }));
vi.mock("@/lib/integrations", () => ({ recordStorageEvent: recordStorageEventMock }));
vi.mock("@/lib/storage", () => ({
  StorageConfigurationError: class StorageConfigurationError extends Error {},
  storeAttachment: storeAttachmentMock,
}));
vi.mock("@/lib/document-file-security", () => ({
  validateUploadFile: validateUploadFileMock,
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
  getClientIp: getClientIpMock,
}));
vi.mock("@/lib/portal-tracking", () => ({
  verifyPortalTrackingToken: verifyPortalTrackingTokenMock,
  extractPortalTrackingToken: extractPortalTrackingTokenMock,
}));
vi.mock("@/lib/structured-logger", () => ({
  createLogger: () => ({ error: loggerErrorMock, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

import { POST } from "./route";

const params = Promise.resolve({ reference: "rv-2026-test" });

function pngFile() {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "foto.png", { type: "image/png" });
}

function jsonFormRequest(extra: Record<string, string> = {}) {
  const form = new FormData();
  form.append("file", pngFile());
  form.append("email", "boende@example.se");
  for (const [key, value] of Object.entries(extra)) form.append(key, value);
  return new Request("https://www.revalta.se/api/public/tickets/RV-2026-TEST/attachments", {
    method: "POST",
    body: form,
  });
}

function nativeFormRequest(extra: Record<string, string> = {}) {
  const form = new FormData();
  form.append("native", "1");
  form.append("file", pngFile());
  form.append("email", "boende@example.se");
  form.append("companySlug", "demo");
  for (const [key, value] of Object.entries(extra)) form.append(key, value);
  return new Request("https://www.revalta.se/api/public/tickets/RV-2026-TEST/attachments?companySlug=demo", {
    method: "POST",
    body: form,
  });
}

const createdAttachment = {
  id: "att-1",
  file_name: "foto.png",
  content_type: "image/png",
  size_bytes: 8,
  created_at: new Date("2026-09-14T12:00:00.000Z"),
};

describe("public tickets/[reference]/attachments POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimitMock.mockResolvedValue({ allowed: true });
    getClientIpMock.mockReturnValue("127.0.0.1");
    verifyPortalTrackingTokenMock.mockReturnValue(null);
    extractPortalTrackingTokenMock.mockReturnValue(null);
    writeAuditLogMock.mockResolvedValue(undefined);
    recordStorageEventMock.mockResolvedValue(undefined);
    storeAttachmentMock.mockResolvedValue({ url: "https://files.example/foto.png", provider: "mock" });
    validateUploadFileMock.mockReturnValue({
      ok: true,
      fileName: "foto.png",
      contentType: "image/png",
      sizeBytes: 8,
    });
    ticketFindFirstMock.mockResolvedValue({
      id: "ticket-1",
      company_id: "company-1",
      user_id: "staff-1",
      title: "Trasig port",
    });
    ticketAttachmentCreateMock.mockResolvedValue(createdAttachment);
  });

  it("creates a public attachment and returns JSON for fetch uploads", async () => {
    const response = await POST(jsonFormRequest(), { params });
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.attachment).toEqual({
      id: "att-1",
      file_name: "foto.png",
      content_type: "image/png",
      size_bytes: 8,
      created_at: "2026-09-14T12:00:00.000Z",
    });
    expect(ticketAttachmentCreateMock).toHaveBeenCalledTimes(1);
  });

  it("accepts a native form post and redirects without putting the reporter email in the URL", async () => {
    const response = await POST(nativeFormRequest({ token: "track-token" }), { params });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://www.revalta.se/portal/demo?attached=1&ref=RV-2026-TEST&token=track-token",
    );
    expect(response.headers.get("location")).not.toContain("boende");
    expect(response.headers.get("location")).not.toContain("example.se");
    expect(ticketAttachmentCreateMock).toHaveBeenCalledTimes(1);
  });

  it("returns tenant-safe 404 when a Tenant A portal token looks up a Tenant B reference", async () => {
    ticketFindFirstMock.mockResolvedValue(null);
    verifyPortalTrackingTokenMock.mockReturnValue({
      reference: "RV-TENANT-B",
      email: "boende@example.se",
      companyId: "company-1",
      exp: Date.now() + 1_000_000,
    });

    const form = new FormData();
    form.append("file", pngFile());
    form.append("token", "signed-token");
    const response = await POST(
      new Request("https://www.revalta.se/api/public/tickets/RV-TENANT-B/attachments", {
        method: "POST",
        body: form,
      }),
      { params: Promise.resolve({ reference: "rv-tenant-b" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Ärendet hittades inte. Kontrollera referensnummer och e-post.");
    expect(ticketFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        public_reference: "RV-TENANT-B",
        reporter_email: "boende@example.se",
        company_id: "company-1",
      }),
    }));
    expect(storeAttachmentMock).not.toHaveBeenCalled();
    expect(ticketAttachmentCreateMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).not.toHaveBeenCalled();
  });

  it("returns the native form to the portal when the file is missing", async () => {
    const form = new FormData();
    form.append("native", "1");
    form.append("email", "boende@example.se");
    form.append("companySlug", "demo");
    const response = await POST(
      new Request("https://www.revalta.se/api/public/tickets/RV-2026-TEST/attachments?companySlug=demo", {
        method: "POST",
        body: form,
      }),
      { params },
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://www.revalta.se/portal/demo?reason=invalid&ref=RV-2026-TEST",
    );
    expect(ticketAttachmentCreateMock).not.toHaveBeenCalled();
  });
});
