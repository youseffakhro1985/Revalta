import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { getPublicAppUrl } from "@/lib/app-url";
import { validateUploadFile } from "@/lib/document-file-security";
import { recordStorageEvent } from "@/lib/integrations";
import { extractPortalTrackingToken, verifyPortalTrackingToken } from "@/lib/portal-tracking";
import { extractPortalCompanySlug } from "@/lib/public-portal";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { StorageConfigurationError, storeAttachment } from "@/lib/storage";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/public/tickets/[reference]/attachments" });

function isNativeFormPost(form: FormData | null) {
  return String(form?.get("native") || "") === "1";
}

function portalLandingPath(companySlug: string | null) {
  return companySlug ? `/portal/${encodeURIComponent(companySlug)}` : "/portal";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ reference: string }> }
) {
  const { reference } = await params;
  const formData = await request.formData().catch(() => null);
  const nativeForm = isNativeFormPost(formData);
  const companySlug = extractPortalCompanySlug(request, formData?.get("companySlug"));
  const token = String(formData?.get("token") || extractPortalTrackingToken(request, formData) || "");

  const fail = (status: number, message: string, reason: "invalid" | "rate" | "error" | "unavailable") => {
    if (!nativeForm) {
      return NextResponse.json({ error: message }, { status });
    }
    const url = new URL(portalLandingPath(companySlug), getPublicAppUrl(request.url));
    url.searchParams.set("reason", reason);
    if (reference) url.searchParams.set("ref", reference.toUpperCase());
    if (token) url.searchParams.set("token", token);
    const response = NextResponse.redirect(url, 303);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  };

  try {
    const ip = getClientIp(request);
    const rateLimit = await checkRateLimit(`public-attachment:${ip}`, 10, 60 * 60 * 1000);
    if (!rateLimit.allowed) {
      return fail(429, "För många uppladdningar. Vänta en stund och prova igen.", "rate");
    }

    const email = String(formData?.get("email") || "").trim().toLowerCase();
    const file = formData?.get("file");
    const tracking = verifyPortalTrackingToken(token || extractPortalTrackingToken(request, formData));

    if (!(file instanceof File)) {
      return fail(400, "Fil krävs", "invalid");
    }

    const authorizedEmail = tracking?.email || email;
    if (!authorizedEmail.includes("@")) {
      return fail(400, "E-post eller spårningstoken krävs", "invalid");
    }
    if (tracking && tracking.reference !== reference.toUpperCase()) {
      return fail(403, "Ogiltig spårningstoken", "invalid");
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
      return fail(400, validation.error, "invalid");
    }

    const ticket = await db.ticket.findFirst({
      where: {
        public_reference: reference.toUpperCase(),
        reporter_email: authorizedEmail,
        deleted_at: null,
        OR: [{ property_id: null }, { property: { deleted_at: null } }],
        ...(tracking ? { company_id: tracking.companyId } : {}),
      },
      select: { id: true, company_id: true, user_id: true, title: true },
    });

    if (!ticket?.company_id) {
      return fail(404, "Ärendet hittades inte. Kontrollera referensnummer och e-post.", "invalid");
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

    if (nativeForm) {
      const url = new URL(portalLandingPath(companySlug), getPublicAppUrl(request.url));
      url.searchParams.set("attached", "1");
      url.searchParams.set("ref", reference.toUpperCase());
      if (token) url.searchParams.set("token", token);
      const response = NextResponse.redirect(url, 303);
      response.headers.set("Cache-Control", "no-store");
      response.headers.set("X-Content-Type-Options", "nosniff");
      return response;
    }

    return NextResponse.json({ success: true, attachment }, { status: 201 });
  } catch (error) {
    if (error instanceof StorageConfigurationError) {
      return fail(503, error.message, "unavailable");
    }
    logger.error("Create public attachment error", error);
    return fail(500, "Internt serverfel", "error");
  }
}
