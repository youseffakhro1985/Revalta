import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { deleteMock, putMock } = vi.hoisted(() => ({
  deleteMock: vi.fn(),
  putMock: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({ del: deleteMock, put: putMock }));

import {
  getStorageToken,
  hasStorageConfig,
  StorageConfigurationError,
  storeAttachment,
} from "@/lib/storage";

describe("storage configuration", () => {
  beforeEach(() => {
    putMock.mockReset();
    putMock.mockResolvedValue({ url: "https://store.private.blob.vercel-storage.com/file.pdf" });
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("STORAGE_PROVIDER_KEY", "");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("prefers the canonical Vercel Blob token", () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "canonical-token");
    vi.stubEnv("STORAGE_PROVIDER_KEY", "legacy-token");
    expect(getStorageToken()).toBe("canonical-token");
    expect(hasStorageConfig()).toBe(true);
  });

  it("supports the legacy token during migration", () => {
    vi.stubEnv("STORAGE_PROVIDER_KEY", "legacy-token");
    expect(getStorageToken()).toBe("legacy-token");
  });

  it("fails closed instead of writing base64 files into the database", async () => {
    await expect(storeAttachment({
      fileName: "underlag.pdf",
      contentType: "application/pdf",
      buffer: Buffer.from("content"),
      prefix: "tickets/ticket-1",
    })).rejects.toBeInstanceOf(StorageConfigurationError);
    expect(putMock).not.toHaveBeenCalled();
  });

  it("stores new files as private blobs", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "canonical-token");
    const stored = await storeAttachment({
      fileName: "säkert underlag.pdf",
      contentType: "application/pdf",
      buffer: Buffer.from("content"),
      prefix: "tickets/ticket-1",
    });

    expect(stored.provider).toBe("vercel_blob");
    expect(putMock).toHaveBeenCalledWith(
      expect.stringMatching(/^tickets\/ticket-1\/\d+-s-kert-underlag\.pdf$/),
      expect.any(Buffer),
      expect.objectContaining({ access: "private", token: "canonical-token" }),
    );
  });
});
