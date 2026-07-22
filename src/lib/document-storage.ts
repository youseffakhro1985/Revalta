import { get } from "@vercel/blob";
import { allowedDocumentContentTypes, safeDocumentFileName, validateDocumentFile } from "@/lib/document-file-security";
import { getStorageToken } from "@/lib/storage";

export type StoredDocumentMetadata = {
  name?: unknown;
  fileName?: unknown;
  contentType?: unknown;
  sizeBytes?: unknown;
  checksumSha256?: unknown;
  storageUrl?: unknown;
  dataUrl?: unknown;
};

export type LoadedDocumentFile = {
  body: ArrayBuffer | ReadableStream<Uint8Array>;
  contentType: string;
  fileName: string;
  sizeBytes: number;
};

export class DocumentStorageError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "DocumentStorageError";
    this.status = status;
  }
}

function isTrustedBlobUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

function documentIdentity(metadata: StoredDocumentMetadata) {
  const contentType = typeof metadata.contentType === "string" ? metadata.contentType : "";
  if (!allowedDocumentContentTypes.has(contentType)) {
    throw new DocumentStorageError("Dokumentets filformat stöds inte", 415);
  }
  const fileName = safeDocumentFileName(
    typeof metadata.fileName === "string"
      ? metadata.fileName
      : typeof metadata.name === "string"
        ? metadata.name
        : "dokument",
  );
  const expectedSize = typeof metadata.sizeBytes === "number" && Number.isSafeInteger(metadata.sizeBytes)
    ? metadata.sizeBytes
    : null;
  return { contentType, fileName, expectedSize };
}

export function hasStoredDocumentFile(metadata: StoredDocumentMetadata) {
  const contentType = typeof metadata.contentType === "string" ? metadata.contentType : "";
  if (!allowedDocumentContentTypes.has(contentType)) return false;
  const storageUrl = typeof metadata.storageUrl === "string" ? metadata.storageUrl : "";
  const dataUrl = typeof metadata.dataUrl === "string" ? metadata.dataUrl : "";
  return isTrustedBlobUrl(storageUrl) || dataUrl.startsWith(`data:${contentType};base64,`);
}

export async function loadStoredDocumentFile(
  metadata: StoredDocumentMetadata,
  maxBytes = 2_000_000,
): Promise<LoadedDocumentFile> {
  const { contentType, fileName, expectedSize } = documentIdentity(metadata);
  const storageUrl = typeof metadata.storageUrl === "string" ? metadata.storageUrl : "";

  if (storageUrl) {
    if (!isTrustedBlobUrl(storageUrl)) {
      throw new DocumentStorageError("Dokumentets lagringsreferens är ogiltig", 422);
    }
    const token = getStorageToken();
    if (!token) throw new DocumentStorageError("Fillagringen är inte konfigurerad", 503);

    const stored = await get(storageUrl, { access: "private", token });
    if (!stored?.stream) throw new DocumentStorageError("Dokumentfilen saknas i fillagringen", 404);
    const storedSize = stored.blob?.size;
    const storedContentType = stored.blob?.contentType;
    if (
      (typeof storedSize === "number" && (storedSize <= 0 || storedSize > maxBytes || (expectedSize !== null && storedSize !== expectedSize)))
      || (typeof storedContentType === "string" && storedContentType !== contentType)
    ) {
      throw new DocumentStorageError("Dokumentfilens metadata kunde inte verifieras", 422);
    }
    return {
      body: stored.stream,
      contentType,
      fileName,
      sizeBytes: typeof storedSize === "number" ? storedSize : expectedSize || 0,
    };
  }

  const dataUrl = typeof metadata.dataUrl === "string" ? metadata.dataUrl : "";
  const prefix = `data:${contentType};base64,`;
  if (!dataUrl.startsWith(prefix)) {
    throw new DocumentStorageError("Dokumentfilen är skadad eller saknas", 422);
  }

  const bytes = Buffer.from(dataUrl.slice(prefix.length), "base64");
  if (!bytes.length || bytes.length > maxBytes || (expectedSize !== null && bytes.length !== expectedSize)) {
    throw new DocumentStorageError("Dokumentfilens storlek kunde inte verifieras", 422);
  }
  const validation = validateDocumentFile({ bytes, contentType, fileName, maxBytes });
  if (!validation.ok) {
    throw new DocumentStorageError("Dokumentfilens innehåll kunde inte verifieras", 422);
  }
  const expectedChecksum = typeof metadata.checksumSha256 === "string" ? metadata.checksumSha256 : null;
  if (expectedChecksum && validation.checksumSha256 !== expectedChecksum) {
    throw new DocumentStorageError("Dokumentfilens kontrollsumma stämmer inte", 422);
  }
  return {
    body: Uint8Array.from(bytes).buffer,
    contentType,
    fileName: validation.fileName,
    sizeBytes: bytes.length,
  };
}

export function documentDownloadHeaders(file: LoadedDocumentFile) {
  return {
    "Content-Type": file.contentType,
    ...(file.sizeBytes > 0 ? { "Content-Length": String(file.sizeBytes) } : {}),
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  };
}
