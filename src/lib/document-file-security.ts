import { createHash } from "node:crypto";

const MIME = {
  pdf: "application/pdf",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  text: "text/plain",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const;

export const allowedDocumentContentTypes = new Set<string>(Object.values(MIME));

export type SupportedUploadType = (typeof MIME)[keyof typeof MIME];

export type FileInspection = {
  detectedContentType: SupportedUploadType;
  checksumSha256: string;
  scanStatus: "signature_verified";
};

export class FileSecurityError extends Error {
  readonly status: number;

  constructor(message: string, status = 415) {
    super(message);
    this.name = "FileSecurityError";
    this.status = status;
  }
}

const expectedExtensions: Record<string, Set<string>> = {
  [MIME.pdf]: new Set(["pdf"]),
  [MIME.jpeg]: new Set(["jpg", "jpeg"]),
  [MIME.png]: new Set(["png"]),
  [MIME.webp]: new Set(["webp"]),
  [MIME.text]: new Set(["txt"]),
  [MIME.docx]: new Set(["docx"]),
  [MIME.xlsx]: new Set(["xlsx"]),
};

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

function asciiIncludes(bytes: Uint8Array, value: string) {
  return Buffer.from(bytes).includes(Buffer.from(value, "utf8"));
}

function isSafeText(bytes: Uint8Array) {
  const buffer = Buffer.from(bytes);
  if (buffer.includes(0)) return false;
  try {
    const value = new TextDecoder("utf-8", { fatal: true }).decode(buffer).trimStart().toLowerCase();
    return !value.startsWith("<!doctype html") && !value.startsWith("<html") && !value.startsWith("<svg");
  } catch {
    return false;
  }
}

export function detectContentType(bytes: Uint8Array): SupportedUploadType | null {
  const buffer = Buffer.from(bytes);
  if (!buffer.length) return null;
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") return MIME.pdf;
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return MIME.png;
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return MIME.jpeg;
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return MIME.webp;
  if (startsWith(buffer, [0x50, 0x4b, 0x03, 0x04])) {
    const packageHeader = buffer.subarray(0, Math.min(buffer.length, 250_000));
    if (asciiIncludes(packageHeader, "word/")) return MIME.docx;
    if (asciiIncludes(packageHeader, "xl/")) return MIME.xlsx;
    return null;
  }
  if (isSafeText(buffer)) return MIME.text;
  return null;
}

export function inspectUpload(
  bytes: Uint8Array,
  declaredContentType: string,
  allowedTypes: ReadonlySet<string>,
): FileInspection {
  if (!bytes.length) throw new FileSecurityError("Filen är tom", 400);
  if (!allowedTypes.has(declaredContentType)) throw new FileSecurityError("Filtypen stöds inte");

  const detectedContentType = detectContentType(bytes);
  if (!detectedContentType || detectedContentType !== declaredContentType) {
    throw new FileSecurityError("Filens innehåll stämmer inte med den angivna filtypen");
  }

  return {
    detectedContentType,
    checksumSha256: createHash("sha256").update(bytes).digest("hex"),
    scanStatus: "signature_verified",
  };
}

export function safeDocumentFileName(value: string) {
  const normalized = value.normalize("NFKC");
  const withoutControls = normalized.replace(/[\u0000-\u001f\u007f]/g, "");
  const sanitized = withoutControls.replace(/["'`<>:\\|?*\/]+/g, "_").replace(/\s+/g, " ").trim();
  return sanitized.slice(0, 180) || "dokument";
}

export function validateDocumentFile(input: {
  bytes: Uint8Array;
  contentType: string;
  fileName: string;
  maxBytes?: number;
}) {
  const { bytes, contentType, fileName, maxBytes = 2_000_000 } = input;
  if (!allowedDocumentContentTypes.has(contentType)) return { ok: false as const, error: "Filtypen stöds inte" };
  if (!bytes.length) return { ok: false as const, error: "Filen är tom" };
  if (bytes.length > maxBytes) return { ok: false as const, error: `Filen får vara högst ${Math.floor(maxBytes / 1_000_000)} MB` };

  const extension = fileName.split(".").pop()?.toLowerCase() || "";
  if (!expectedExtensions[contentType]?.has(extension)) {
    return { ok: false as const, error: "Filändelsen matchar inte filtypen" };
  }

  const detectedContentType = detectContentType(bytes);
  if (detectedContentType !== contentType) return { ok: false as const, error: "Filens innehåll matchar inte det angivna formatet" };
  return {
    ok: true as const,
    fileName: safeDocumentFileName(fileName),
    contentType,
    sizeBytes: bytes.length,
    checksumSha256: createHash("sha256").update(bytes).digest("hex"),
    detectedContentType,
    scanStatus: "signature_verified" as const,
  };
}
