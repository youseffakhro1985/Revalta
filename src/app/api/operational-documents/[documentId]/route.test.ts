import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { findFirstMock, getCurrentUserMock, getBlobMock } = vi.hoisted(() => ({
  findFirstMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  getBlobMock: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({ get: getBlobMock }));
vi.mock("@/lib/current-user", () => ({ getCurrentUser: getCurrentUserMock }));
vi.mock("@/lib/db", () => ({ default: { operationalDocument: { findFirst: findFirstMock } } }));

import { GET } from "./route";

describe("operational document access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "private-token");
    vi.stubEnv("STORAGE_PROVIDER_KEY", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("does not reveal whether a foreign tenant document exists", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-a", company_id: "company-a" });
    findFirstMock.mockResolvedValue(null);

    const response = await GET(new Request("https://www.revalta.se/api/operational-documents/document-b"), {
      params: Promise.resolve({ documentId: "document-b" }),
    });

    expect(response.status).toBe(404);
    expect(findFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "document-b", company_id: "company-a" },
    }));
    expect(getBlobMock).not.toHaveBeenCalled();
  });

  it("streams an authorized private document with no-store headers", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-a", company_id: "company-a" });
    findFirstMock.mockResolvedValue({
      file_name: "rapport.pdf",
      storage_url: "https://store.private.blob.vercel-storage.com/rapport.pdf",
      content_type: "application/pdf",
    });
    getBlobMock.mockResolvedValue({ stream: new Blob(["pdf"]).stream() });

    const response = await GET(new Request("https://www.revalta.se/api/operational-documents/document-a"), {
      params: Promise.resolve({ documentId: "document-a" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("content-type")).toBe("application/pdf");
  });
});
