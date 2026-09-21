import { NextResponse } from "next/server";
import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { queueTicketNotification, queueSmsNotification } from "@/lib/integrations";
import { analyzeTicket } from "@/lib/ai";
import { getPublicAppUrl } from "@/lib/app-url";
import { createPortalTrackingToken, hasPortalTrackingConfig } from "@/lib/portal-tracking";
import {
  reporterCreatedEmailCopy,
  reporterCreatedSmsCopy,
  reporterStaffCreatedEmailCopy,
} from "@/lib/ticket-reporter-notify";
import { extractPortalCompanySlug, generatePublicReference, resolvePublicPortalCompany } from "@/lib/public-portal";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { calculateDueDate } from "@/lib/sla";
import { isValidEmail } from "@/lib/security";
import { createRouteObservability } from "@/lib/route-observability";
import { hasTicketAiSourceColumn, ticketAiSourceWrite } from "@/lib/schema-readiness";

function isNativeFormPost(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  return contentType.includes("application/x-www-form-urlencoded")
    || contentType.includes("multipart/form-data");
}

async function readPublicTicketFields(request: Request) {
  if (isNativeFormPost(request)) {
    const form = await request.formData().catch(() => null);
    return {
      reporterName: String(form?.get("reporterName") || ""),
      reporterEmail: String(form?.get("reporterEmail") || ""),
      reporterPhone: String(form?.get("reporterPhone") || ""),
      reporterUnit: String(form?.get("reporterUnit") || ""),
      propertyId: String(form?.get("propertyId") || ""),
      title: String(form?.get("title") || ""),
      description: String(form?.get("description") || ""),
      companySlug: String(form?.get("companySlug") || ""),
    };
  }
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  return {
    reporterName: typeof body.reporterName === "string" ? body.reporterName : "",
    reporterEmail: typeof body.reporterEmail === "string" ? body.reporterEmail : "",
    reporterPhone: typeof body.reporterPhone === "string" ? body.reporterPhone : "",
    reporterUnit: typeof body.reporterUnit === "string" ? body.reporterUnit : "",
    propertyId: typeof body.propertyId === "string" ? body.propertyId : "",
    title: typeof body.title === "string" ? body.title : "",
    description: typeof body.description === "string" ? body.description : "",
    companySlug: typeof body.companySlug === "string" ? body.companySlug : "",
  };
}

function portalLandingPath(companySlug: string | null) {
  return companySlug ? `/portal/${encodeURIComponent(companySlug)}` : "/portal";
}

export async function POST(request: Request) {
  const observability = createRouteObservability(request, "/api/public/tickets");
  const nativeForm = isNativeFormPost(request);
  const fail = (
    status: number,
    message: string,
    reason: "invalid" | "rate" | "unavailable" | "error",
    companySlug?: string | null,
    headers?: HeadersInit,
  ) => {
    if (!nativeForm) {
      return NextResponse.json({ error: message }, { status, headers });
    }
    const url = new URL(portalLandingPath(companySlug || extractPortalCompanySlug(request)), getPublicAppUrl(request.url));
    url.searchParams.set("reason", reason);
    const response = NextResponse.redirect(url, 303);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    if (headers) {
      new Headers(headers).forEach((value, name) => {
        if (name.toLowerCase() === "retry-after") response.headers.set(name, value);
      });
    }
    return observability.correlate(response);
  };

  try {
    const ip = getClientIp(request);
    const rateLimit = await checkRateLimit(`public-ticket:${ip}`, 5, 60 * 60 * 1000);
    if (!rateLimit.allowed) {
      return fail(429, "För många försök. Vänta en stund och prova igen.", "rate", extractPortalCompanySlug(request));
    }

    const fields = await readPublicTicketFields(request);
    const normalizedReporterName = fields.reporterName.trim();
    const normalizedReporterEmail = fields.reporterEmail.trim().toLowerCase();
    const normalizedReporterPhone = fields.reporterPhone.trim();
    const normalizedReporterUnit = fields.reporterUnit.trim();
    const normalizedTitle = fields.title.trim();
    const normalizedDescription = fields.description.trim();
    const normalizedPropertyId = fields.propertyId.trim() || null;
    const companySlug = extractPortalCompanySlug(request, fields.companySlug);

    const portal = await resolvePublicPortalCompany({
      propertyId: normalizedPropertyId,
      companySlug,
    });
    if (!portal) {
      return fail(503, "Boendeportalen är inte konfigurerad ännu", "unavailable", companySlug);
    }

    if (!normalizedReporterName || !isValidEmail(normalizedReporterEmail) || !normalizedTitle || normalizedDescription.length < 10) {
      return fail(400, "Namn, e-post, titel och tydlig beskrivning krävs", "invalid", companySlug);
    }
    if (
      normalizedReporterName.length > 120 ||
      normalizedReporterEmail.length > 254 ||
      normalizedReporterPhone.length > 50 ||
      normalizedReporterUnit.length > 80 ||
      normalizedTitle.length > 200 ||
      normalizedDescription.length > 5_000
    ) {
      return fail(400, "En eller flera uppgifter är för långa", "invalid", companySlug);
    }

    if (!hasPortalTrackingConfig()) {
      observability.logger.warn("public ticket rejected because tracking is unavailable", observability.elapsed({
        event: "public.ticket.tracking_unavailable",
        companyId: portal.company.id,
      }));
      return fail(503, "Boendeportalen är tillfälligt inte tillgänglig", "unavailable", companySlug);
    }

    let property = null;
    if (normalizedPropertyId) {
      property = await db.property.findFirst({
        where: { id: normalizedPropertyId, company_id: portal.company.id, status: "active", deleted_at: null },
        select: { id: true, name: true, address: true, city: true },
      });
      if (!property) {
        return fail(404, "Vald fastighet hittades inte", "invalid", companySlug);
      }
    }

    const analysis = await analyzeTicket(normalizedDescription);
    const persistAiSource = await hasTicketAiSourceColumn();
    let publicReference = generatePublicReference();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const existing = await db.ticket.findUnique({ where: { public_reference: publicReference }, select: { id: true } });
      if (!existing) break;
      publicReference = generatePublicReference();
    }

    // Build the tracking token before any persistent mutation. If signing cannot
    // succeed, the caller receives a truthful failure and no ticket is created.
    const trackingToken = createPortalTrackingToken({
      reference: publicReference,
      email: normalizedReporterEmail,
      companyId: portal.company.id,
    });

    const ticket = await db.$transaction(async (tx) => {
      const created = await tx.ticket.create({
        data: {
          title: normalizedTitle,
          description: normalizedDescription,
          status: "new",
          category: analysis.category,
          priority: analysis.priority,
          due_date: calculateDueDate(analysis.priority),
          company_id: portal.company.id,
          user_id: portal.owner.id,
          property_id: property?.id ?? null,
          public_reference: publicReference,
          source: "public_portal",
          reporter_name: normalizedReporterName,
          reporter_email: normalizedReporterEmail,
          reporter_phone: normalizedReporterPhone || null,
          reporter_unit: normalizedReporterUnit || null,
          ai_summary: analysis.summary,
          ai_recommended_action: analysis.recommendedAction,
          ai_confidence: analysis.confidence,
          ai_processed_at: new Date(),
          ...ticketAiSourceWrite(persistAiSource, analysis.source),
        },
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          category: true,
          public_reference: true,
          reporter_email: true,
          created_at: true,
          property: { select: { name: true, address: true, city: true } },
        },
      });

      await writeAuditLog({ id: portal.owner.id, company_id: portal.company.id }, {
        entityType: "ticket",
        entityId: created.id,
        action: "public.ticket_created",
        metadata: {
          publicReference,
          propertyId: property?.id ?? null,
          source: "public_portal",
        },
      }, tx);

      return created;
    });

    const trackUrl = `${getPublicAppUrl()}/portal?ref=${encodeURIComponent(publicReference)}&token=${encodeURIComponent(trackingToken)}`;
    try {
      await queueTicketNotification({ company_id: portal.company.id }, {
        ticketId: ticket.id,
        title: ticket.title,
        recipient: normalizedReporterEmail,
        event: "created",
        emailContent: reporterCreatedEmailCopy({
          title: ticket.title,
          public_reference: publicReference,
        }, trackUrl),
      });
    } catch {
      observability.logger.warn("public ticket email notification failed", observability.elapsed({
        event: "public.ticket.email_failed",
        ticketId: ticket.id,
        companyId: portal.company.id,
      }));
    }

    if (portal.owner.email) {
      try {
        await queueTicketNotification({ company_id: portal.company.id }, {
          ticketId: ticket.id,
          title: ticket.title,
          recipient: portal.owner.email,
          event: "created",
          emailContent: reporterStaffCreatedEmailCopy({
            title: ticket.title,
            public_reference: publicReference,
          }),
        });
      } catch {
        observability.logger.warn("public ticket staff email notification failed", observability.elapsed({
          event: "public.ticket.staff_email_failed",
          ticketId: ticket.id,
          companyId: portal.company.id,
        }));
      }
    }

    if (normalizedReporterPhone) {
      try {
        await queueSmsNotification({ company_id: portal.company.id }, {
          ticketId: ticket.id,
          recipient: normalizedReporterPhone,
          message: reporterCreatedSmsCopy(publicReference),
        });
      } catch {
        observability.logger.warn("public ticket sms notification failed", observability.elapsed({
          event: "public.ticket.sms_failed",
          ticketId: ticket.id,
          companyId: portal.company.id,
        }));
      }
    }

    observability.logger.info("public ticket created", observability.elapsed({
      event: "public.ticket.created",
      ticketId: ticket.id,
      companyId: portal.company.id,
    }));
    if (nativeForm) {
      const url = new URL(portalLandingPath(companySlug), getPublicAppUrl(request.url));
      url.searchParams.set("created", "1");
      url.searchParams.set("ref", ticket.public_reference || publicReference);
      url.searchParams.set("token", trackingToken);
      const response = NextResponse.redirect(url, 303);
      response.headers.set("Cache-Control", "no-store");
      response.headers.set("X-Content-Type-Options", "nosniff");
      return observability.correlate(response);
    }
    return NextResponse.json({ success: true, ticket, trackingToken }, { status: 201 });
  } catch (error) {
    observability.logger.error("public ticket creation failed", error, observability.elapsed({
      event: "public.ticket.failed",
    }));
    return fail(500, "Internt serverfel", "error", extractPortalCompanySlug(request));
  }
}
