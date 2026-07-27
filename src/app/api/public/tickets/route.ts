import db from "@/lib/db";
import { queueTicketNotification, queueSmsNotification } from "@/lib/integrations";
import { analyzeTicket } from "@/lib/ai";
import { createPortalTrackingToken } from "@/lib/portal-tracking";
import {
  extractPortalCompanySlug,
  generatePublicReference,
  resolvePublicPortalCompany,
} from "@/lib/public-portal";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { calculateDueDate } from "@/lib/sla";
import {
  isMissingSchemaColumnError,
  schemaMismatchUserMessage,
} from "@/lib/schema-readiness";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import { resolveRequestId, REQUEST_ID_HEADER } from "@/lib/request-correlation";
import { createLogger } from "@/lib/structured-logger";
import { NextResponse } from "next/server";

const PUBLIC_TICKET_LIMIT = 5;
const PUBLIC_TICKET_WINDOW_MS = 60 * 60 * 1000;
const MAX_REFERENCE_ATTEMPTS = 5;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function successHeaders(requestId: string) {
  return {
    "Cache-Control": "private, no-store, max-age=0, must-revalidate",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    [REQUEST_ID_HEADER]: requestId,
  };
}

function isPublicReferenceConflict(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; meta?: { target?: unknown } };
  if (candidate.code !== "P2002") return false;
  const target = candidate.meta?.target;
  return Array.isArray(target)
    ? target.includes("public_reference")
    : String(target ?? "").includes("public_reference");
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request.headers);
  const logger = createLogger({
    route: "/api/public/tickets",
    method: "POST",
    requestId,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  });

  try {
    const ip = getClientIp(request);
    const rateLimit = await checkRateLimit(
      `public-ticket:${ip}`,
      PUBLIC_TICKET_LIMIT,
      PUBLIC_TICKET_WINDOW_MS,
    );
    if (!rateLimit.allowed) {
      const retryAfter = Math.max(
        1,
        Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000),
      );
      logger.warn("public ticket rate limited", {
        eventCode: "public_tickets.create.rate_limited",
        rateLimitSource: rateLimit.source,
        retryAfterSeconds: retryAfter,
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 429,
        code: API_ERROR_CODES.rateLimited,
        message: "För många försök. Vänta en stund och prova igen.",
        requestId,
        headers: { "Retry-After": String(retryAfter) },
      });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return apiErrorResponse({
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Ogiltig förfrågan",
        requestId,
      });
    }

    const normalizedReporterName = typeof body.reporterName === "string" ? body.reporterName.trim() : "";
    const normalizedReporterEmail = typeof body.reporterEmail === "string"
      ? body.reporterEmail.trim().toLowerCase()
      : "";
    const normalizedReporterPhone = typeof body.reporterPhone === "string" ? body.reporterPhone.trim() : "";
    const normalizedReporterUnit = typeof body.reporterUnit === "string" ? body.reporterUnit.trim() : "";
    const normalizedTitle = typeof body.title === "string" ? body.title.trim() : "";
    const normalizedDescription = typeof body.description === "string" ? body.description.trim() : "";
    const normalizedPropertyId = typeof body.propertyId === "string" && body.propertyId.trim()
      ? body.propertyId.trim()
      : null;
    const companySlug = extractPortalCompanySlug(request, body.companySlug);

    if (
      !normalizedReporterName ||
      !EMAIL_PATTERN.test(normalizedReporterEmail) ||
      !normalizedTitle ||
      normalizedDescription.length < 10
    ) {
      logger.warn("public ticket validation failed", {
        eventCode: "public_tickets.create.validation_failed",
        reason: "required_fields",
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Namn, giltig e-post, titel och tydlig beskrivning krävs",
        requestId,
      });
    }

    if (
      normalizedReporterName.length > 120 ||
      normalizedReporterEmail.length > 254 ||
      normalizedReporterPhone.length > 50 ||
      normalizedReporterUnit.length > 80 ||
      normalizedTitle.length > 200 ||
      normalizedDescription.length > 5_000
    ) {
      return apiErrorResponse({
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "En eller flera uppgifter är för långa",
        requestId,
      });
    }

    const portal = await resolvePublicPortalCompany({
      propertyId: normalizedPropertyId,
      companySlug,
    });
    if (!portal) {
      logger.warn("public ticket portal unavailable", {
        eventCode: "public_tickets.create.portal_unavailable",
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 503,
        code: API_ERROR_CODES.serviceUnavailable,
        message: "Boendeportalen är inte konfigurerad ännu",
        requestId,
      });
    }

    let property = null;
    if (normalizedPropertyId) {
      property = await db.property.findFirst({
        where: {
          id: normalizedPropertyId,
          company_id: portal.company.id,
          status: "active",
          deleted_at: null,
        },
        select: { id: true, name: true, address: true, city: true },
      });
      if (!property) {
        return apiErrorResponse({
          status: 400,
          code: API_ERROR_CODES.validationFailed,
          message: "Vald fastighet hittades inte",
          requestId,
        });
      }
    }

    const analysis = await analyzeTicket(normalizedDescription);
    let persisted: {
      ticket: {
        id: string;
        title: string;
        status: string;
        priority: string;
        category: string;
        public_reference: string;
        reporter_email: string | null;
        created_at: Date;
        property: { name: string; address: string; city: string } | null;
      };
      trackingToken: string;
    } | null = null;

    for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt += 1) {
      const publicReference = generatePublicReference();
      const trackingToken = createPortalTrackingToken({
        reference: publicReference,
        email: normalizedReporterEmail,
        companyId: portal.company.id,
      });

      try {
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

          await tx.auditLog.create({
            data: {
              actor_user_id: portal.owner.id,
              company_id: portal.company.id,
              entity_type: "ticket",
              entity_id: created.id,
              action: "public.ticket_created",
              metadata: {
                publicReference,
                propertyId: property?.id ?? null,
                source: "public_portal",
              },
            },
          });

          return created;
        });

        persisted = {
          ticket: {
            ...ticket,
            public_reference: ticket.public_reference ?? publicReference,
          },
          trackingToken,
        };
        break;
      } catch (error) {
        if (isPublicReferenceConflict(error) && attempt < MAX_REFERENCE_ATTEMPTS - 1) {
          logger.warn("public ticket reference collision", {
            eventCode: "public_tickets.create.reference_collision",
            companyId: portal.company.id,
            attempt: attempt + 1,
          });
          continue;
        }
        throw error;
      }
    }

    if (!persisted) {
      throw new Error("PUBLIC_REFERENCE_EXHAUSTED");
    }

    const sideEffects = [
      queueTicketNotification({ company_id: portal.company.id }, {
        ticketId: persisted.ticket.id,
        title: persisted.ticket.title,
        recipient: normalizedReporterEmail,
        event: "created",
      }),
      normalizedReporterPhone
        ? queueSmsNotification({ company_id: portal.company.id }, {
            ticketId: persisted.ticket.id,
            recipient: normalizedReporterPhone,
            message: `Tack! Ärende ${persisted.ticket.public_reference} är mottaget.`,
          })
        : Promise.resolve(),
    ];
    const sideEffectResults = await Promise.allSettled(sideEffects);
    const failedSideEffects = sideEffectResults.filter((result) => result.status === "rejected").length;

    if (failedSideEffects > 0) {
      logger.warn("public ticket created with side-effect failures", {
        eventCode: "public_tickets.create.partial_failure",
        companyId: portal.company.id,
        ticketId: persisted.ticket.id,
        failedSideEffects,
      });
    }

    logger.info("public ticket created", {
      eventCode: "public_tickets.create.succeeded",
      companyId: portal.company.id,
      ticketId: persisted.ticket.id,
      hasProperty: Boolean(property),
      hasSmsRecipient: Boolean(normalizedReporterPhone),
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json(
      { success: true, ticket: persisted.ticket, trackingToken: persisted.trackingToken },
      { status: 201, headers: successHeaders(requestId) },
    );
  } catch (error) {
    if (isMissingSchemaColumnError(error)) {
      logger.error("public ticket schema unavailable", {
        eventCode: "public_tickets.create.schema_unavailable",
        latencyMs: Date.now() - startedAt,
        error,
      });
      return apiErrorResponse({
        status: 503,
        code: API_ERROR_CODES.serviceUnavailable,
        message: schemaMismatchUserMessage(),
        requestId,
      });
    }

    logger.error("public ticket creation failed", {
      eventCode: "public_tickets.create.failed",
      latencyMs: Date.now() - startedAt,
      error,
    });
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId,
    });
  }
}
