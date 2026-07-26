import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { findFirstMock, getCurrentUserMock, getBlobMock } = vi.hoisted(() => ({
  findFirstMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  getBlobMock: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({ get: getBlobMock }));
vi.mock("@/lib/current-user", () => ({ getCurrentUser: getCurrentUserMock }));
vi.mock("@/lib/db", () => ({
  default: { operationalDocument: { findFirst: findFirstMock } },
}));

import { GET } from "./route";

const params = Promise.resolve({ id: "work-order-1", documentId: "document-1" });

describe("work-order document download", () => {
  beforeEach(() => {
    findFirstMock.mockReset();
    getCurrentUserMock.mockReset();
    getBlobMock.mockReset();
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "private-token");
    vi.stubEnv("STORAGE_PROVIDER_KEY", "");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("requires an authenticated user", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const response = await GET(new Request("https://www.revalta.se/api/document"), { params });
    expect(response.status).toBe(401);
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it("scopes document lookup to tenant, work order and document", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1" });
    findFirstMock.mockResolvedValue(null);
    const response = await GET(new Request("https://www.revalta.se/api/document"), { params });

    expect(response.status).toBe(404);
    expect(findFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        deleted_at: null,
        id: "document-1",
        work_order_id: "work-order-1",
        company_id: "company-1",
        work_order: {
          deleted_at: null,
          company_id: "company-1",
          property: { deleted_at: null },
        },
      },
    }));
    expect(getBlobMock).not.toHaveBeenCalled();
  });

  it("streams a private blob without exposing its storage URL", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1", company_id: "company-1" });
    findFirstMock.mockResolvedValue({
      file_name: "besiktning.pdf",
      storage_url: "https://store.private.blob.vercel-storage.com/besiktning.pdf",
      content_type: "application/pdf",
    });
    getBlobMock.mockResolvedValue({
      stream: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.close(); } }),
    });

    const response = await GET(new Request("https://www.revalta.se/api/document"), { params });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(getBlobMock).toHaveBeenCalledWith(
      "https://store.private.blob.vercel-storage.com/besiktning.pdf",
      { access: "private", token: "private-token" },
    );
  });
});
