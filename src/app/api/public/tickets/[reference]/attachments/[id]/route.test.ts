import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  attachmentFindFirstMock,
  checkRateLimitMock,
  getClientIpMock,
  verifyTokenMock,
  extractTokenMock,
  blobGetMock,
  getStorageTokenMock,
  loggerInfoMock,
  loggerWarnMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  attachmentFindFirstMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  getClientIpMock: vi.fn(),
  verifyTokenMock: vi.fn(),
  extractTokenMock: vi.fn(),
  blobGetMock: vi.fn(),
  getStorageTokenMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: { ticketAttachment: { findFirst: attachmentFindFirstMock } },
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
  getClientIp: getClientIpMock,
}));
vi.mock("@/lib/portal-tracking", () => ({
  extractPortalTrackingToken: extractTokenMock,
  verifyPortalTrackingToken: verifyTokenMock,
}));
vi.mock("@/lib/storage", () => ({ getStorageToken: getStorageTokenMock }));
vi.mock("@vercel/blob", () => ({ get: blobGetMock }));
vi.mock("@/lib/schema-readiness", () => ({
  isMissingSchemaColumnError: vi.fn(() => false),
  schemaMismatchUserMessage: vi.fn(() => "Databasen är inte redo"),
}));
vi.mock("@/lib/structured-logger", () => ({
  createLogger: vi.fn(() => ({
    info: loggerInfoMock,
    warn: loggerWarnMock,
    error: loggerErrorMock,
  })),
}));

import { GET } from "./route";

const params = Promise.resolve({ reference: "RV-2026-ABC123", id: "attachment_123" });

function request(url = "https://www.revalta.se/api/public/tickets/RV-2026-ABC123/attachments/attachment_123") {
  return new Request(url, { headers: { "x-request-id": "download-request-1" } });
}

function publicAttachment(overrides: Record<string, unknown> = {}) {
  return {
    id: "attachment_123",
    file_name: "skada-bild.jpg",
    content_type: "image/jpeg",
    size_bytes: 4,
    data_url: "https://blob.example/private-file",
    ticket: { id: "ticket-1", company_id: "company-1" },
    ...overrides,
  };
}

describe("GET public ticket attachment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimitMock.mockResolvedValue({
      allowed: true,
      resetAt: new Date(Date.now() + 60_000),
      source: "database",
    });
    getClientIpMock.mockReturnValue("127.0.0.1");
    extractTokenMock.mockReturnValue("tracking-token");
    verifyTokenMock.mockReturnValue({
      reference: "RV-2026-ABC123",
      email: "boende@example.se",
      companyId: "company-1",
    });
    getStorageTokenMock.mockReturnValue("blob-token");
    attachmentFindFirstMock.mockResolvedValue(publicAttachment());
    blobGetMock.mockResolvedValue({ stream: new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3, 4]));
      controller.close();
    } }) });
  });

  it("rate limits before authorization or database access", async () => {
    checkRateLimitMock.mockResolvedValue({
      allowed: false,
      resetAt: new Date(Date.now() + 30_000),
      source: "database",
    });

    const response = await GET(request(), { params });
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload.errorCode).toBe("RATE_LIMITED");
    expect(verifyTokenMock).not.toHaveBeenCalled();
    expect(attachmentFindFirstMock).not.toHaveBeenCalled();
  });

  it("binds public visibility, reference, email and company in one query", async () => {
    const response = await GET(request(), { params });

    expect(response.status).toBe(200);
    expect(attachmentFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "attachment_123",
        visibility: "public",
        ticket: expect.objectContaining({
          public_reference: "RV-2026-ABC123",
          reporter_email: "boende@example.se",
          company_id: "company-1",
          deleted_at: null,
        }),
      },
    }));
  });

  it("returns private no-store download headers without exposing the blob URL", async () => {
    const response = await GET(request(), { params });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-request-id")).toBe("download-request-1");
    expect(response.headers.get("content-disposition")).toContain("attachment;");
    expect(response.headers.get("location")).toBeNull();
    expect(blobGetMock).toHaveBeenCalledWith("https://blob.example/private-file", {
      access: "private",
      token: "blob-token",
    });
  });

  it("returns the same neutral 404 for invalid token scope and missing attachment", async () => {
    verifyTokenMock.mockReturnValue({
      reference: "RV-OTHER",
      email: "boende@example.se",
      companyId: "company-1",
    });
    const rejected = await GET(request(), { params });
    const rejectedBody = await rejected.json();

    verifyTokenMock.mockReturnValue({
      reference: "RV-2026-ABC123",
      email: "boende@example.se",
      companyId: "company-1",
    });
    attachmentFindFirstMock.mockResolvedValue(null);
    const missing = await GET(request(), { params });
    const missingBody = await missing.json();

    expect(rejected.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(rejectedBody.error).toBe(missingBody.error);
    expect(rejectedBody.errorCode).toBe("NOT_FOUND");
  });

  it("supports legacy data URLs without contacting blob storage", async () => {
    attachmentFindFirstMock.mockResolvedValue(publicAttachment({
      data_url: "data:text/plain;base64,SGVq",
      file_name: "hej.txt",
      content_type: "text/plain",
      size_bytes: 3,
    }));

    const response = await GET(request(), { params });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("Hej");
    expect(blobGetMock).not.toHaveBeenCalled();
  });

  it("fails closed when private storage is unavailable", async () => {
    getStorageTokenMock.mockReturnValue(null);

    const response = await GET(request(), { params });
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.errorCode).toBe("SERVICE_UNAVAILABLE");
    expect(payload.error).not.toContain("token");
  });
});
