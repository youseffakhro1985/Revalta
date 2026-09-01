import { del, put } from "@vercel/blob";

export type StoredFile = {
  url: string;
  provider: "vercel_blob";
};

export class StorageConfigurationError extends Error {
  constructor() {
    super("Fillagringen är inte konfigurerad");
    this.name = "StorageConfigurationError";
  }
}

export function getStorageToken() {
  return process.env.BLOB_READ_WRITE_TOKEN?.trim()
    || process.env.STORAGE_PROVIDER_KEY?.trim()
    || null;
}

export function hasStorageConfig() {
  return getStorageToken() !== null;
}

export async function storeAttachment(input: {
  fileName: string;
  contentType: string;
  buffer: Buffer;
  prefix: string;
}): Promise<StoredFile> {
  const token = getStorageToken();
  if (!token) throw new StorageConfigurationError();

  const safeFileName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
  const pathname = `${input.prefix}/${Date.now()}-${safeFileName}`;
  const blob = await put(pathname, input.buffer, {
    access: "private",
    contentType: input.contentType,
    token,
  });

  return {
    provider: "vercel_blob",
    url: blob.url,
  };
}

export async function deleteStoredFile(url: string) {
  const token = getStorageToken();
  if (!token) throw new StorageConfigurationError();
  await del(url, { token });
}
