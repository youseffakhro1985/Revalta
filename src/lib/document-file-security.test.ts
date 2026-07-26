import { describe, expect, it } from "vitest";
import { safeDocumentFileName, validateDocumentFile, validateUploadFile } from "@/lib/document-file-security";

describe("document file security", () => {
  it("accepts a PDF with matching extension and signature", () => {
    const bytes = Buffer.from("%PDF-1.7\nexample");
    expect(validateDocumentFile({ bytes, contentType: "application/pdf", fileName: "rapport.pdf" })).toMatchObject({
      ok: true,
      fileName: "rapport.pdf",
      sizeBytes: bytes.length,
    });
  });

  it("rejects content that only claims to be a PDF", () => {
    const result = validateDocumentFile({
      bytes: Buffer.from("<script>alert(1)</script>"),
      contentType: "application/pdf",
      fileName: "rapport.pdf",
    });
    expect(result).toEqual({ ok: false, error: "Filens innehåll matchar inte det angivna formatet" });
  });

  it("rejects mismatched file extensions", () => {
    const result = validateDocumentFile({
      bytes: Buffer.from("%PDF-1.7\nexample"),
      contentType: "application/pdf",
      fileName: "rapport.png",
    });
    expect(result).toEqual({ ok: false, error: "Filändelsen matchar inte filtypen" });
  });

  it("accepts ZIP-based Office documents only with the expected package marker", () => {
    const docx = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("word/document.xml")]);
    const xlsx = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("xl/workbook.xml")]);
    expect(validateDocumentFile({ bytes: docx, contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", fileName: "avtal.docx" }).ok).toBe(true);
    expect(validateDocumentFile({ bytes: xlsx, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName: "budget.xlsx" }).ok).toBe(true);
  });

  it("sanitizes unsafe download names", () => {
    expect(safeDocumentFileName("..\\\r\nrapport<2026>.pdf")).toBe(".._rapport_2026_.pdf");
  });

  it("accepts attachment profiles for webp and plain text", () => {
    const webp = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]);
    expect(
      validateUploadFile({
        bytes: webp,
        contentType: "image/webp",
        fileName: "foto.webp",
        profile: "attachment",
      }).ok,
    ).toBe(true);
    expect(
      validateUploadFile({
        bytes: Buffer.from("Hej från boendeportalen"),
        contentType: "text/plain",
        fileName: "anteckning.txt",
        profile: "attachment",
      }).ok,
    ).toBe(true);
  });
});

