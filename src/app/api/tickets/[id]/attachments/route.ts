import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { canManageTickets, getCurrentUser, tenantWhere } from "@/lib/current-user";
import { validateUploadFile } from "@/lib/document-file-security";
import { recordStorageEvent } from "@/lib/integrations";
import { StorageConfigurationError, storeAttachment } from "@/lib/storage";
import { NextResponse } from "next/server";

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
      where: { id, deleted_at: null, ...tenantWhere(user) },
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

    const buffer = Buffer.from(await file.arrayBuffer());
    const validation = validateUploadFile({
      bytes: buffer,
      contentType: file.type,
      fileName: file.name,
      profile: "attachment",
      maxBytes: 1024 * 1024,
    });
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const storedFile = await storeAttachment({
      fileName: validation.fileName,
      contentType: validation.contentType,
      buffer,
      prefix: `tickets/${ticket.id}`,
    });
    const attachment = await db.ticketAttachment.create({
      data: {
        ticket_id: ticket.id,
        file_name: validation.fileName,
        content_type: validation.contentType,
        size_bytes: validation.sizeBytes,
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

    await writeAuditLog(user, {
      entityType: "ticket",
      entityId: ticket.id,
      action: "ticket.attachment_created",
      metadata: { attachmentId: attachment.id, fileName: attachment.file_name },
    });
    await recordStorageEvent(user, {
      ticketId: ticket.id,
      fileName: attachment.file_name,
      contentType: attachment.content_type,
      sizeBytes: attachment.size_bytes,
      provider: storedFile.provider,
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
    if (error instanceof StorageConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("Create attachment error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
