import { put } from "@vercel/blob";

export type StoredFile = {
  url: string;
  provider: "vercel_blob" | "database_fallback";
};

export async function storeAttachment(input: {
  fileName: string;
  contentType: string;
  buffer: Buffer;
  prefix: string;
}): Promise<StoredFile> {
  if (!process.env.STORAGE_PROVIDER_KEY) {
    return {
      provider: "database_fallback",
      url: `data:${input.contentType};base64,${input.buffer.toString("base64")}`,
    };
  }

  const safeFileName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
  const pathname = `${input.prefix}/${Date.now()}-${safeFileName}`;
  const blob = await put(pathname, input.buffer, {
    access: "public",
    contentType: input.contentType,
    token: process.env.STORAGE_PROVIDER_KEY,
  });

  return {
    provider: "vercel_blob",
    url: blob.url,
  };
}
