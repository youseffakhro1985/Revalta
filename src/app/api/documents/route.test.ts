import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  auditCreateMock,
  getCurrentUserMock,
  removeStoredFileMock,
  storeAttachmentMock,
} = vi.hoisted(() => ({
  auditCreateMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  removeStoredFileMock: vi.fn(),
  storeAttachmentMock: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({ getCurrentUser: getCurrentUserMock }));
vi.mock("@/lib/document-lifecycle", () => ({ getDocumentLifecycleMap: vi.fn() }));
vi.mock("@/lib/document-storage", () => ({ hasStoredDocumentFile: vi.fn() }));
vi.mock("@/lib/storage", () => ({
  removeStoredFile: removeStoredFileMock,
  StorageConfigurationError: class StorageConfigurationError extends Error {},
  storeAttachment: storeAttachmentMock,
}));
vi.mock("@/lib/db", () => ({
  default: {
    auditLog: { create: auditCreateMock, findMany: vi.fn() },
    property: { findFirst: vi.fn(), findMany: vi.fn() },
    unit: { findFirst: vi.fn() },
    lease: { findFirst: vi.fn(), findMany: vi.fn() },
  },
}));

import { POST } from "./route";

function uploadRequest() {
  const formData = new FormData();
  formData.set("name", "Årsrapport");
  formData.set("category", "other");
  formData.set("visibility", "internal");
  formData.set("file", new File(["%PDF-1.7\nsecure"], "årsrapport.pdf", { type: "application/pdf" }));
  return new Request("https://www.revalta.se/api/documents", { method: "POST", body: formData });
}

describe("document uploads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({ id: "user-a", company_id: "company-a", role: "owner" });
    storeAttachmentMock.mockResolvedValue({
      provider: "vercel_blob",
      url: "https://store.private.blob.vercel-storage.com/document.pdf",
    });
    removeStoredFileMock.mockResolvedValue(undefined);
    auditCreateMock.mockResolvedValue({ id: "document-a", created_at: new Date("2026-07-22T10:00:00Z") });
  });

  it("stores new document bytes privately and persists only verified metadata", async () => {
    const response = await POST(uploadRequest());

    expect(response.status).toBe(201);
    expect(storeAttachmentMock).toHaveBeenCalledWith(expect.objectContaining({
      contentType: "application/pdf",
      prefix: "companies/company-a/documents",
      buffer: expect.any(Buffer),
    }));
    const metadata = auditCreateMock.mock.calls[0][0].data.metadata;
    expect(metadata).toMatchObject({
      schemaVersion: 4,
      storageUrl: "https://store.private.blob.vercel-storage.com/document.pdf",
      storageProvider: "vercel_blob",
      detectedContentType: "application/pdf",
      checksumSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      scanStatus: "signature_verified",
    });
    expect(metadata).not.toHaveProperty("dataUrl");
  });

  it("removes the private blob when the database write fails", async () => {
    auditCreateMock.mockRejectedValue(new Error("database unavailable"));

    const response = await POST(uploadRequest());

    expect(response.status).toBe(500);
    expect(removeStoredFileMock).toHaveBeenCalledWith("https://store.private.blob.vercel-storage.com/document.pdf");
  });
});
