import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { getPublicAppUrl } from "@/lib/app-url";
import { queueTicketNotification } from "@/lib/integrations";
import { extractPortalTrackingToken, verifyPortalTrackingToken } from "@/lib/portal-tracking";
import { extractPortalCompanySlug } from "@/lib/public-portal";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/structured-logger";

const logger = createLogger({ route: "/api/public/tickets/[reference]/comments" });

function isNativeFormPost(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  return contentType.includes("application/x-www-form-urlencoded")
    || contentType.includes("multipart/form-data");
}

function portalLandingPath(companySlug: string | null) {
  return companySlug ? `/portal/${encodeURIComponent(companySlug)}` : "/portal";
}

async function readCommentFields(request: Request) {
  if (isNativeFormPost(request)) {
    const form = await request.formData().catch(() => null);
    return {
      email: String(form?.get("email") || ""),
      name: String(form?.get("name") || ""),
      body: String(form?.get("body") || ""),
      token: String(form?.get("token") || ""),
      companySlug: String(form?.get("companySlug") || ""),
      form,
    };
  }
  const bodyJson = await request.json().catch(() => ({})) as Record<string, unknown>;
  return {
    email: typeof bodyJson.email === "string" ? bodyJson.email : "",
    name: typeof bodyJson.name === "string" ? bodyJson.name : "",
    body: typeof bodyJson.body === "string" ? bodyJson.body : "",
    token: typeof bodyJson.token === "string" ? bodyJson.token : "",
    companySlug: typeof bodyJson.companySlug === "string" ? bodyJson.companySlug : "",
    form: null as FormData | null,
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ reference: string }> }
) {
  const nativeForm = isNativeFormPost(request);
  const { reference } = await params;
  const fail = (
    status: number,
    message: string,
    reason: "invalid" | "rate" | "error",
    companySlug?: string | null,
    token?: string,
  ) => {
    if (!nativeForm) {
      return NextResponse.json({ error: message }, { status });
    }
    const url = new URL(portalLandingPath(companySlug || extractPortalCompanySlug(request)), getPublicAppUrl(request.url));
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
    const rateLimit = await checkRateLimit(`public-comment:${ip}`, 10, 60 * 60 * 1000);
    if (!rateLimit.allowed) {
      return fail(429, "För många kommentarer. Vänta en stund och prova igen.", "rate", extractPortalCompanySlug(request));
    }

    const fields = await readCommentFields(request);
    const email = fields.email.trim().toLowerCase();
    const name = fields.name.trim();
    const body = fields.body.trim();
    const companySlug = extractPortalCompanySlug(request, fields.companySlug);
    const tracking = verifyPortalTrackingToken(
      fields.token || extractPortalTrackingToken(request, fields.form),
    );
    const authorizedEmail = tracking?.email || email;

    if (!authorizedEmail.includes("@") || !body) {
      return fail(400, "E-post eller spårningstoken och kommentar krävs", "invalid", companySlug, fields.token);
    }
    if (authorizedEmail.length > 254 || name.length > 120 || body.length > 5_000) {
      return fail(400, "En eller flera uppgifter är för långa", "invalid", companySlug, fields.token);
    }
    if (tracking && tracking.reference !== reference.toUpperCase()) {
      return fail(403, "Ogiltig spårningstoken", "invalid", companySlug);
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
        title: true,
        company_id: true,
        user_id: true,
        reporter_name: true,
        reporter_email: true,
      },
    });

    if (!ticket?.company_id) {
      return fail(404, "Ärendet hittades inte. Kontrollera referensnummer och e-post.", "invalid", companySlug, fields.token);
    }

    const authorName = name || ticket.reporter_name || "Boende";
    const authorEmail = ticket.reporter_email || authorizedEmail;
    const comment = await db.$transaction(async (tx) => {
      const created = await tx.ticketComment.create({
        data: {
          ticket_id: ticket.id,
          user_id: ticket.user_id,
          body,
          is_internal: false,
          author_type: "resident",
          author_name: authorName,
          author_email: authorEmail,
        },
        select: {
          id: true,
          body: true,
          created_at: true,
          author_type: true,
          author_name: true,
        },
      });

      await writeAuditLog({ id: ticket.user_id, company_id: ticket.company_id }, {
        entityType: "ticket",
        entityId: ticket.id,
        action: "public.comment_created",
        metadata: {
          commentId: created.id,
          authorType: "resident",
          schemaVersion: 2,
        },
      }, tx);

      return created;
    });

    try {
      await queueTicketNotification({ company_id: ticket.company_id }, {
        ticketId: ticket.id,
        title: ticket.title,
        recipient: authorizedEmail,
        event: "commented",
      });
    } catch (notificationError) {
      logger.error("Public comment notification failed", notificationError);
    }

    if (nativeForm) {
      const url = new URL(portalLandingPath(companySlug), getPublicAppUrl(request.url));
      url.searchParams.set("commented", "1");
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
      comment: {
        id: comment.id,
        body: comment.body,
        created_at: comment.created_at,
        author: { type: "resident", name: comment.author_name || authorName },
      },
    }, { status: 201 });
  } catch (error) {
    logger.error("Create public comment error", error);
    return fail(500, "Internt serverfel", "error", extractPortalCompanySlug(request));
  }
}
