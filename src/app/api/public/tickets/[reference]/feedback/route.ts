import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { getPublicAppUrl } from "@/lib/app-url";
import { extractPortalTrackingToken, verifyPortalTrackingToken } from "@/lib/portal-tracking";
import { extractPortalCompanySlug } from "@/lib/public-portal";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  loadTicketResidentFeedback,
  TICKET_RESIDENT_FEEDBACK_ACTION,
} from "@/lib/ticket-resident-feedback";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/public/tickets/[reference]/feedback" });

function isNativeFormPost(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  return contentType.includes("application/x-www-form-urlencoded")
    || contentType.includes("multipart/form-data");
}

function portalLandingPath(companySlug: string | null) {
  return companySlug ? `/portal/${encodeURIComponent(companySlug)}` : "/portal";
}

async function readFeedbackFields(request: Request) {
  if (isNativeFormPost(request)) {
    const form = await request.formData().catch(() => null);
    return {
      email: String(form?.get("email") || ""),
      token: String(form?.get("token") || ""),
      rating: form?.get("rating"),
      comment: String(form?.get("comment") || ""),
      companySlug: String(form?.get("companySlug") || ""),
      form,
      validObject: true,
    };
  }
  const bodyJson = await request.json().catch(() => null);
  if (!bodyJson || typeof bodyJson !== "object" || Array.isArray(bodyJson)) {
    return {
      email: "",
      token: "",
      rating: undefined as unknown,
      comment: "",
      companySlug: "",
      form: null as FormData | null,
      validObject: false,
    };
  }
  return {
    email: typeof bodyJson.email === "string" ? bodyJson.email : "",
    token: typeof bodyJson.token === "string" ? bodyJson.token : "",
    rating: bodyJson.rating,
    comment: typeof bodyJson.comment === "string" ? bodyJson.comment : "",
    companySlug: typeof bodyJson.companySlug === "string" ? bodyJson.companySlug : "",
    form: null as FormData | null,
    validObject: true,
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ reference: string }> },
) {
  const nativeForm = isNativeFormPost(request);
  const { reference } = await params;
  const fail = (
    status: number,
    message: string,
    reason: "invalid" | "rate" | "error",
    extra?: { companySlug?: string | null; token?: string; feedback?: unknown },
  ) => {
    if (!nativeForm) {
      return NextResponse.json(
        extra?.feedback ? { error: message, feedback: extra.feedback } : { error: message },
        { status },
      );
    }
    const url = new URL(
      portalLandingPath(extra?.companySlug || extractPortalCompanySlug(request)),
      getPublicAppUrl(request.url),
    );
    url.searchParams.set("reason", reason);
    if (reference) url.searchParams.set("ref", reference.toUpperCase());
    if (extra?.token) url.searchParams.set("token", extra.token);
    const response = NextResponse.redirect(url, 303);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  };

  try {
    const ip = getClientIp(request);
    const rateLimit = await checkRateLimit(`public-feedback:${ip}`, 10, 60 * 60 * 1000);
    if (!rateLimit.allowed) {
      return fail(429, "För många försök. Vänta en stund och prova igen.", "rate");
    }

    const fields = await readFeedbackFields(request);
    if (!fields.validObject) {
      return fail(400, "Ogiltig förfrågan", "invalid");
    }

    const email = fields.email.trim().toLowerCase();
    const companySlug = extractPortalCompanySlug(request, fields.companySlug);
    const tracking = verifyPortalTrackingToken(
      fields.token || extractPortalTrackingToken(request, fields.form),
    );
    const authorizedEmail = tracking?.email || email;
    const rating = Number(fields.rating);
    const comment = fields.comment.trim();

    if (!authorizedEmail.includes("@") || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return fail(400, "E-post eller spårningstoken och betyg 1–5 krävs", "invalid", { companySlug, token: fields.token });
    }
    if (authorizedEmail.length > 254 || comment.length > 1000) {
      return fail(400, "En eller flera uppgifter är för långa", "invalid", { companySlug, token: fields.token });
    }
    if (tracking && tracking.reference !== reference.toUpperCase()) {
      return fail(403, "Ogiltig spårningstoken", "invalid", { companySlug });
    }

    const ticket = await db.ticket.findFirst({
      where: {
        public_reference: reference.toUpperCase(),
        reporter_email: authorizedEmail,
        deleted_at: null,
        OR: [{ property_id: null }, { property: { deleted_at: null } }],
        ...(tracking ? { company_id: tracking.companyId } : {}),
      },
      select: {
        id: true,
        status: true,
        company_id: true,
        user_id: true,
        public_reference: true,
      },
    });

    if (!ticket?.company_id) {
      return fail(404, "Ärendet hittades inte. Kontrollera referensnummer och e-post.", "invalid", { companySlug, token: fields.token });
    }
    if (!["closed", "completed"].includes(ticket.status)) {
      return fail(409, "Återkoppling kan lämnas när ärendet är avslutat.", "invalid", { companySlug, token: fields.token });
    }

    const existing = await loadTicketResidentFeedback(db, {
      companyId: ticket.company_id,
      ticketId: ticket.id,
    });
    if (existing) {
      return fail(409, "Återkoppling är redan lämnad för det här ärendet.", "invalid", {
        companySlug,
        token: fields.token,
        feedback: existing,
      });
    }

    const submittedAt = new Date();
    await writeAuditLog({ id: ticket.user_id, company_id: ticket.company_id }, {
      entityType: "ticket",
      entityId: ticket.id,
      action: TICKET_RESIDENT_FEEDBACK_ACTION,
      metadata: {
        rating,
        comment: comment || null,
        publicReference: ticket.public_reference,
        source: "public_portal",
        schemaVersion: 1,
      },
    });

    if (nativeForm) {
      const url = new URL(portalLandingPath(companySlug), getPublicAppUrl(request.url));
      url.searchParams.set("feedback", "1");
      url.searchParams.set("ref", reference.toUpperCase());
      const token = fields.token || extractPortalTrackingToken(request, fields.form);
      if (token) url.searchParams.set("token", token);
      const response = NextResponse.redirect(url, 303);
      response.headers.set("Cache-Control", "no-store");
      response.headers.set("X-Content-Type-Options", "nosniff");
      return response;
    }

    return NextResponse.json({
      success: true,
      feedback: {
        rating,
        comment: comment || null,
        submittedAt: submittedAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    logger.error("Create public ticket feedback error", error);
    return fail(500, "Internt serverfel", "error");
  }
}
