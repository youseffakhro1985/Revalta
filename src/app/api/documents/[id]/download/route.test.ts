import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  auditCreateMock,
  auditFindFirstMock,
  getCurrentUserMock,
  lifecycleMock,
  loadStoredDocumentFileMock,
} = vi.hoisted(() => ({
  auditCreateMock: vi.fn(),
  auditFindFirstMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  lifecycleMock: vi.fn(),
  loadStoredDocumentFileMock: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({ getCurrentUser: getCurrentUserMock }));
vi.mock("@/lib/document-lifecycle", () => ({ getDocumentLifecycleState: lifecycleMock }));
vi.mock("@/lib/document-storage", () => ({
  documentDownloadHeaders: vi.fn(() => ({ "Cache-Control": "private, no-store" })),
  DocumentStorageError: class DocumentStorageError extends Error {},
  loadStoredDocumentFile: loadStoredDocumentFileMock,
}));
vi.mock("@/lib/db", () => ({
  default: { auditLog: { create: auditCreateMock, findFirst: auditFindFirstMock } },
}));

import { GET } from "./route";

describe("document download access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({ id: "user-a", company_id: "company-a" });
    lifecycleMock.mockResolvedValue({ state: "active" });
    auditCreateMock.mockResolvedValue({ id: "audit-a" });
  });

  it("does not load a document outside the current tenant", async () => {
    auditFindFirstMock.mockResolvedValue(null);

    const response = await GET(new Request("https://www.revalta.se/api/documents/document-b/download"), {
      params: Promise.resolve({ id: "document-b" }),
    });

    expect(response.status).toBe(404);
    expect(auditFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "document-b", company_id: "company-a" }),
    }));
    expect(loadStoredDocumentFileMock).not.toHaveBeenCalled();
  });

  it("streams and audits an authorized document", async () => {
    auditFindFirstMock.mockResolvedValue({ id: "document-a", metadata: { storageUrl: "private" } });
    loadStoredDocumentFileMock.mockResolvedValue({
      body: new TextEncoder().encode("pdf").buffer,
      contentType: "application/pdf",
      fileName: "rapport.pdf",
      sizeBytes: 3,
    });

    const response = await GET(new Request("https://www.revalta.se/api/documents/document-a/download"), {
      params: Promise.resolve({ id: "document-a" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(auditCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ company_id: "company-a", action: "document.downloaded" }),
    }));
  });
});
