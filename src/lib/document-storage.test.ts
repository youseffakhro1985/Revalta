import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock("@vercel/blob", () => ({
  get: getMock,
  put: vi.fn(),
  del: vi.fn(),
}));

import {
  hasStoredDocumentFile,
  loadStoredDocumentFile,
} from "@/lib/document-storage";

describe("document storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "private-token");
    vi.stubEnv("STORAGE_PROVIDER_KEY", "");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("loads a verified legacy base64 document without exposing its data URL", async () => {
    const bytes = Buffer.from("%PDF-1.7\nlegacy");
    const metadata = {
      fileName: "rapport.pdf",
      contentType: "application/pdf",
      sizeBytes: bytes.length,
      dataUrl: `data:application/pdf;base64,${bytes.toString("base64")}`,
    };

    expect(hasStoredDocumentFile(metadata)).toBe(true);
    const file = await loadStoredDocumentFile(metadata);
    expect(file).toMatchObject({ fileName: "rapport.pdf", contentType: "application/pdf", sizeBytes: bytes.length });
    expect(Buffer.from(file.body as ArrayBuffer).toString()).toBe(bytes.toString());
  });

  it("rejects a legacy document with a mismatched checksum", async () => {
    const bytes = Buffer.from("%PDF-1.7\nlegacy");
    await expect(loadStoredDocumentFile({
      fileName: "rapport.pdf",
      contentType: "application/pdf",
      sizeBytes: bytes.length,
      checksumSha256: "0".repeat(64),
      dataUrl: `data:application/pdf;base64,${bytes.toString("base64")}`,
    })).rejects.toMatchObject({ status: 422 });
  });

  it("streams a private blob only when its server metadata matches", async () => {
    const stream = new Blob(["%PDF-1.7"]).stream();
    getMock.mockResolvedValue({
      stream,
      blob: { size: 8, contentType: "application/pdf" },
    });
    const storageUrl = "https://store.private.blob.vercel-storage.com/rapport.pdf";

    const file = await loadStoredDocumentFile({
      fileName: "rapport.pdf",
      contentType: "application/pdf",
      sizeBytes: 8,
      storageUrl,
    });

    expect(file.body).toBe(stream);
    expect(getMock).toHaveBeenCalledWith(storageUrl, { access: "private", token: "private-token" });
  });

  it("rejects an untrusted storage host before making a request", async () => {
    await expect(loadStoredDocumentFile({
      fileName: "rapport.pdf",
      contentType: "application/pdf",
      sizeBytes: 8,
      storageUrl: "https://example.com/rapport.pdf",
    })).rejects.toMatchObject({ status: 422 });
    expect(getMock).not.toHaveBeenCalled();
  });
});
