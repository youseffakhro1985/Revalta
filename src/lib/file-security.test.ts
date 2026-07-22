import { describe, expect, it } from "vitest";
import { detectContentType, FileSecurityError, inspectUpload } from "@/lib/document-file-security";

const allowed = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain"]);

describe("file signature validation", () => {
  it.each([
    ["application/pdf", Buffer.from("%PDF-1.7\n%%EOF")],
    ["image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])],
    ["image/png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])],
    ["image/webp", Buffer.from("RIFF0000WEBPVP8 ", "ascii")],
    ["text/plain", Buffer.from("Säker svensk text", "utf8")],
  ])("detects %s by content", (contentType, buffer) => {
    expect(detectContentType(buffer)).toBe(contentType);
    expect(inspectUpload(buffer, contentType, allowed)).toMatchObject({
      detectedContentType: contentType,
      scanStatus: "signature_verified",
      checksumSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it("rejects a renamed executable or binary payload", () => {
    const executable = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03]);
    expect(() => inspectUpload(executable, "application/pdf", allowed)).toThrow(FileSecurityError);
  });

  it("rejects a mismatch between reported and detected MIME type", () => {
    expect(() => inspectUpload(Buffer.from("%PDF-1.7"), "image/png", allowed)).toThrow(
      "Filens innehåll stämmer inte med den angivna filtypen",
    );
  });

  it.each(["<svg onload=alert(1)>", "<!doctype html><script>alert(1)</script>"])(
    "rejects active markup disguised as text: %s",
    (payload) => expect(() => inspectUpload(Buffer.from(payload), "text/plain", allowed)).toThrow(FileSecurityError),
  );

  it("rejects empty files", () => {
    expect(() => inspectUpload(Buffer.alloc(0), "text/plain", allowed)).toThrow("Filen är tom");
  });
});
