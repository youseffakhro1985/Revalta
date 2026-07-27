import db from "@/lib/db";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import { extractPortalCompanySlug, resolvePublicPortalCompany, toPortalSlug } from "@/lib/public-portal";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { resolveRequestId, REQUEST_ID_HEADER } from "@/lib/request-correlation";
import { isMissingSchemaColumnError, schemaMismatchUserMessage } from "@/lib/schema-readiness";
import { createLogger } from "@/lib/structured-logger";
import { NextResponse } from "next/server";

const PUBLIC_PROPERTIES_LIMIT = 120;
const PUBLIC_PROPERTIES_WINDOW_MS = 60 * 1000;
const MAX_PUBLIC_PROPERTIES = 1_000;

function successHeaders(requestId: string) {
  return {
    "Cache-Control": "private, no-store, max-age=0, must-revalidate",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
    [REQUEST_ID_HEADER]: requestId,
  };
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request.headers);
  const logger = createLogger({
    route: "/api/public/properties",
    method: "GET",
    requestId,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  });

  try {
    const rateLimit = await checkRateLimit(
      `public-properties:${getClientIp(request)}`,
      PUBLIC_PROPERTIES_LIMIT,
      PUBLIC_PROPERTIES_WINDOW_MS,
    );
    if (!rateLimit.allowed) {
      const retryAfter = Math.max(1, Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000));
      logger.warn("public property directory rate limited", {
        eventCode: "public_properties.list.rate_limited",
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

    const companySlug = extractPortalCompanySlug(request);
    const portal = await resolvePublicPortalCompany({ companySlug });
    if (!portal) {
      logger.warn("public property directory unavailable", {
        eventCode: "public_properties.list.portal_unavailable",
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 503,
        code: API_ERROR_CODES.serviceUnavailable,
        message: "Boendeportalen är inte konfigurerad ännu",
        requestId,
      });
    }

    const properties = await db.property.findMany({
      where: {
        company_id: portal.company.id,
        status: "active",
        deleted_at: null,
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: MAX_PUBLIC_PROPERTIES + 1,
      select: {
        id: true,
        name: true,
        address: true,
        postal_code: true,
        city: true,
      },
    });

    if (properties.length > MAX_PUBLIC_PROPERTIES) {
      logger.error("public property directory exceeds safe limit", undefined, {
        eventCode: "public_properties.list.limit_exceeded",
        companyId: portal.company.id,
        maxProperties: MAX_PUBLIC_PROPERTIES,
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 503,
        code: API_ERROR_CODES.serviceUnavailable,
        message: "Fastighetslistan är tillfälligt inte tillgänglig",
        requestId,
      });
    }

    logger.info("public property directory listed", {
      eventCode: "public_properties.list.succeeded",
      companyId: portal.company.id,
      propertyCount: properties.length,
      rateLimitSource: rateLimit.source,
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json(
      {
        company: {
          name: portal.company.name,
          slug: toPortalSlug(portal.company.name, portal.company.id),
        },
        properties,
      },
      { headers: successHeaders(requestId) },
    );
  } catch (error) {
    if (isMissingSchemaColumnError(error)) {
      logger.error("public property directory schema unavailable", error, {
        eventCode: "public_properties.list.schema_unavailable",
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 503,
        code: API_ERROR_CODES.serviceUnavailable,
        message: schemaMismatchUserMessage(),
        requestId,
      });
    }

    logger.error("public property directory failed", error, {
      eventCode: "public_properties.list.failed",
      latencyMs: Date.now() - startedAt,
    });
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId,
    });
  }
}
