const MIME = {
  pdf: "application/pdf",
  jpeg: "image/jpeg",
  png: "image/png",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const;

export const allowedDocumentContentTypes = new Set<string>(Object.values(MIME));

const expectedExtensions: Record<string, Set<string>> = {
  [MIME.pdf]: new Set(["pdf"]),
  [MIME.jpeg]: new Set(["jpg", "jpeg"]),
  [MIME.png]: new Set(["png"]),
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

  let validSignature = false;
  if (contentType === MIME.pdf) validSignature = startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
  if (contentType === MIME.jpeg) validSignature = startsWith(bytes, [0xff, 0xd8, 0xff]);
  if (contentType === MIME.png) validSignature = startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (contentType === MIME.docx || contentType === MIME.xlsx) {
    const zipSignature = startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
    const marker = contentType === MIME.docx ? "word/" : "xl/";
    validSignature = zipSignature && asciiIncludes(bytes.subarray(0, Math.min(bytes.length, 250_000)), marker);
  }

  if (!validSignature) return { ok: false as const, error: "Filens innehåll matchar inte det angivna formatet" };
  return { ok: true as const, fileName: safeDocumentFileName(fileName), contentType, sizeBytes: bytes.length };
}
