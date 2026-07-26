import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { validateUploadFile } from "@/lib/document-file-security";
import { recordStorageEvent } from "@/lib/integrations";
import { extractPortalTrackingToken, verifyPortalTrackingToken } from "@/lib/portal-tracking";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { StorageConfigurationError, storeAttachment } from "@/lib/storage";
import { NextResponse } from "next/server";

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
    const tracking = verifyPortalTrackingToken(extractPortalTrackingToken(request, formData));

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Fil krävs" }, { status: 400 });
    }

    const authorizedEmail = tracking?.email || email;
    if (!authorizedEmail.includes("@")) {
      return NextResponse.json({ error: "E-post eller spårningstoken krävs" }, { status: 400 });
    }
    if (tracking && tracking.reference !== reference.toUpperCase()) {
      return NextResponse.json({ error: "Ogiltig spårningstoken" }, { status: 403 });
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

    const ticket = await db.ticket.findFirst({
      where: {
        public_reference: reference.toUpperCase(),
        reporter_email: authorizedEmail,
        deleted_at: null,
        ...(tracking ? { company_id: tracking.companyId } : {}),
      },
      select: { id: true, company_id: true, user_id: true, title: true },
    });

    if (!ticket?.company_id) {
      return NextResponse.json({ error: "Ärendet hittades inte. Kontrollera referensnummer och e-post." }, { status: 404 });
    }

    const storedFile = await storeAttachment({
      fileName: validation.fileName,
      contentType: validation.contentType,
      buffer,
      prefix: `public-tickets/${ticket.id}`,
    });
    const attachment = await db.ticketAttachment.create({
      data: {
        ticket_id: ticket.id,
        file_name: validation.fileName,
        content_type: validation.contentType,
        size_bytes: validation.sizeBytes,
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

    await writeAuditLog({ id: ticket.user_id, company_id: ticket.company_id }, {
      entityType: "ticket",
      entityId: ticket.id,
      action: "public.attachment_created",
      metadata: { fileName: attachment.file_name, reporterEmail: authorizedEmail },
    });
    await recordStorageEvent({ company_id: ticket.company_id }, {
      ticketId: ticket.id,
      fileName: attachment.file_name,
      source: "public_portal",
      provider: storedFile.provider,
    });

    return NextResponse.json({ success: true, attachment }, { status: 201 });
  } catch (error) {
    if (error instanceof StorageConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("Create public attachment error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
