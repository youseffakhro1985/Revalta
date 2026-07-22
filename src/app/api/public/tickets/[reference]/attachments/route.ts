import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { recordStorageEvent } from "@/lib/integrations";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { FileSecurityError, inspectUpload } from "@/lib/document-file-security";
import { removeStoredFile, StorageConfigurationError, storeAttachment } from "@/lib/storage";
import { NextResponse } from "next/server";

const maxFileSize = 1024 * 1024;
const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf", "text/plain"]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ reference: string }> }
) {
  try {
    const ip = getClientIp(request);
    const rateLimit = await checkRateLimit(`public-attachment:${ip}`, 10, 60 * 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "För många uppladdningar. Vänta en stund och prova igen." }, { status: 429 });
    }

    const { reference } = await params;
    const formData = await request.formData();
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const file = formData.get("file");

    if (!email.includes("@") || !(file instanceof File)) {
      return NextResponse.json({ error: "E-post och fil krävs" }, { status: 400 });
    }

    if (!allowedTypes.has(file.type)) {
      return NextResponse.json({ error: "Filtypen stöds inte" }, { status: 400 });
    }

    if (file.size > maxFileSize) {
      return NextResponse.json({ error: "Filen får vara max 1 MB" }, { status: 400 });
    }

    const ticket = await db.ticket.findFirst({
      where: {
        public_reference: reference.toUpperCase(),
        reporter_email: email,
      },
      select: { id: true, company_id: true, user_id: true, title: true },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Ärendet hittades inte. Kontrollera referensnummer och e-post." }, { status: 404 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const inspection = inspectUpload(buffer, file.type, allowedTypes);
    const storedFile = await storeAttachment({
      fileName: file.name,
      contentType: file.type,
      buffer,
      prefix: `public-tickets/${ticket.id}`,
    });
    let attachment;
    try {
      attachment = await db.ticketAttachment.create({
        data: {
          ticket_id: ticket.id,
          file_name: file.name,
          content_type: file.type,
          size_bytes: file.size,
          data_url: storedFile.url,
          visibility: "public",
        },
        select: {
          id: true,
          file_name: true,
          content_type: true,
          size_bytes: true,
          created_at: true,
        },
      });
    } catch (error) {
      await removeStoredFile(storedFile.url).catch(() => undefined);
      throw error;
    }

    await writeAuditLog({ id: ticket.user_id, company_id: ticket.company_id }, {
      entityType: "ticket",
      entityId: ticket.id,
      action: "public.attachment_created",
      metadata: {
        fileName: attachment.file_name,
        reporterEmail: email,
        detectedContentType: inspection.detectedContentType,
        checksumSha256: inspection.checksumSha256,
        scanStatus: inspection.scanStatus,
      },
    });
    await recordStorageEvent({ company_id: ticket.company_id }, {
      ticketId: ticket.id,
      fileName: attachment.file_name,
      source: "public_portal",
      provider: storedFile.provider,
      detectedContentType: inspection.detectedContentType,
      checksumSha256: inspection.checksumSha256,
      scanStatus: inspection.scanStatus,
    });

    return NextResponse.json({ success: true, attachment }, { status: 201 });
  } catch (error) {
    if (error instanceof FileSecurityError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof StorageConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("Create public attachment error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
