import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canManageTickets, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { recordStorageEvent } from "@/lib/integrations";
import { FileSecurityError, inspectUpload } from "@/lib/document-file-security";
import { removeStoredFile, StorageConfigurationError, storeAttachment } from "@/lib/storage";
import { NextResponse } from "next/server";

const maxFileSize = 1024 * 1024;
const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf", "text/plain"]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
    if (!canManageTickets(user.role)) {
      return NextResponse.json({ error: "Du saknar behörighet att lägga till bilagor" }, { status: 403 });
    }

    const { id } = await params;
    const ticket = await db.ticket.findFirst({
      where: { id, ...tenantWhere(user) },
      select: { id: true, title: true },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Ärendet hittades inte" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Fil krävs" }, { status: 400 });
    }

    if (!allowedTypes.has(file.type)) {
      return NextResponse.json({ error: "Filtypen stöds inte" }, { status: 400 });
    }

    if (file.size > maxFileSize) {
      return NextResponse.json({ error: "Filen får vara max 1 MB" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const inspection = inspectUpload(buffer, file.type, allowedTypes);
    const storedFile = await storeAttachment({
      fileName: file.name,
      contentType: file.type,
      buffer,
      prefix: `tickets/${ticket.id}`,
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
        },
        select: {
          id: true,
          file_name: true,
          content_type: true,
          size_bytes: true,
          data_url: true,
          created_at: true,
        },
      });
    } catch (error) {
      await removeStoredFile(storedFile.url).catch(() => undefined);
      throw error;
    }

    await writeAuditLog(user, {
      entityType: "ticket",
      entityId: ticket.id,
      action: "ticket.attachment_created",
      metadata: {
        attachmentId: attachment.id,
        fileName: attachment.file_name,
        detectedContentType: inspection.detectedContentType,
        checksumSha256: inspection.checksumSha256,
        scanStatus: inspection.scanStatus,
      },
    });
    await recordStorageEvent(user, {
      ticketId: ticket.id,
      fileName: attachment.file_name,
      contentType: attachment.content_type,
      sizeBytes: attachment.size_bytes,
      provider: storedFile.provider,
      detectedContentType: inspection.detectedContentType,
      checksumSha256: inspection.checksumSha256,
      scanStatus: inspection.scanStatus,
    });

    return NextResponse.json(
      {
        success: true,
        attachment: {
          ...attachment,
          data_url: `/api/attachments/${attachment.id}`,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof FileSecurityError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof StorageConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("Create attachment error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
