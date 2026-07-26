const MIME = {
  pdf: "application/pdf",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  text: "text/plain",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const;

export type UploadProfile = "document" | "attachment" | "work_order_document" | "operational_document";

const profileTypes: Record<UploadProfile, Set<string>> = {
  document: new Set([MIME.pdf, MIME.jpeg, MIME.png, MIME.docx, MIME.xlsx]),
  attachment: new Set([MIME.pdf, MIME.jpeg, MIME.png, MIME.webp, MIME.text]),
  work_order_document: new Set([MIME.pdf, MIME.jpeg, MIME.png, MIME.webp]),
  operational_document: new Set([MIME.pdf, MIME.jpeg, MIME.png, MIME.webp, MIME.text, MIME.docx, MIME.xlsx]),
};

export const allowedDocumentContentTypes = profileTypes.document;

const expectedExtensions: Record<string, Set<string>> = {
  [MIME.pdf]: new Set(["pdf"]),
  [MIME.jpeg]: new Set(["jpg", "jpeg"]),
  [MIME.png]: new Set(["png"]),
  [MIME.webp]: new Set(["webp"]),
  [MIME.text]: new Set(["txt", "text", "log", "md"]),
  [MIME.docx]: new Set(["docx"]),
  [MIME.xlsx]: new Set(["xlsx"]),
};

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

function asciiIncludes(bytes: Uint8Array, value: string) {
  return Buffer.from(bytes).includes(Buffer.from(value, "utf8"));
}

export function safeDocumentFileName(value: string) {
  const normalized = value.normalize("NFKC");
  const withoutControls = normalized.replace(/[\u0000-\u001f\u007f]/g, "");
  const sanitized = withoutControls.replace(/["'`<>:\\|?*\/]+/g, "_").replace(/\s+/g, " ").trim();
  return sanitized.slice(0, 180) || "dokument";
}

function hasValidSignature(contentType: string, bytes: Uint8Array) {
  if (contentType === MIME.pdf) return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
  if (contentType === MIME.jpeg) return startsWith(bytes, [0xff, 0xd8, 0xff]);
  if (contentType === MIME.png) return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (contentType === MIME.webp) {
    return (
      startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
      bytes.length >= 12 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    );
  }
  if (contentType === MIME.text) {
    if (bytes.includes(0)) return false;
    return Buffer.from(bytes.subarray(0, Math.min(bytes.length, 8_192))).toString("utf8").length > 0;
  }
  if (contentType === MIME.docx || contentType === MIME.xlsx) {
    const zipSignature = startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
    const marker = contentType === MIME.docx ? "word/" : "xl/";
    return zipSignature && asciiIncludes(bytes.subarray(0, Math.min(bytes.length, 250_000)), marker);
  }
  return false;
}

export function validateUploadFile(input: {
  bytes: Uint8Array;
  contentType: string;
  fileName: string;
  profile?: UploadProfile;
  maxBytes?: number;
}) {
  const profile = input.profile || "document";
  const maxBytes = input.maxBytes ?? (profile === "document" ? 2_000_000 : 4_000_000);
  const allowed = profileTypes[profile];
  const { bytes, contentType, fileName } = input;

  if (!allowed.has(contentType)) return { ok: false as const, error: "Filtypen stöds inte" };
  if (!bytes.length) return { ok: false as const, error: "Filen är tom" };
  if (bytes.length > maxBytes) {
    return { ok: false as const, error: `Filen får vara högst ${Math.max(1, Math.floor(maxBytes / 1_000_000))} MB` };
  }

  const extension = fileName.split(".").pop()?.toLowerCase() || "";
  if (!expectedExtensions[contentType]?.has(extension)) {
    return { ok: false as const, error: "Filändelsen matchar inte filtypen" };
  }

  if (!hasValidSignature(contentType, bytes)) {
    return { ok: false as const, error: "Filens innehåll matchar inte det angivna formatet" };
  }

  return {
    ok: true as const,
    fileName: safeDocumentFileName(fileName),
    contentType,
    sizeBytes: bytes.length,
  };
}

export function validateDocumentFile(input: {
  bytes: Uint8Array;
  contentType: string;
  fileName: string;
  maxBytes?: number;
}) {
  return validateUploadFile({ ...input, profile: "document" });
}
