import { NextResponse } from "next/server";
import db from "@/lib/db";
import { createResetToken, hashPassword, hashResetToken } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { resolveRequestId, REQUEST_ID_HEADER } from "@/lib/request-correlation";
import { queueTicketNotification } from "@/lib/integrations";
import { isStrongPassword, isValidEmail, normalizeEmail, passwordPolicyMessage } from "@/lib/security";
import { createLogger } from "@/lib/structured-logger";

function successHeaders(requestId: string) {
  return {
    "Cache-Control": "private, no-store, max-age=0, must-revalidate",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    [REQUEST_ID_HEADER]: requestId,
  };
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request.headers);
  const logger = createLogger({
    route: "/api/auth/register",
    method: "POST",
    requestId,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  });

  try {
    const ip = getClientIp(request);
    const rateLimit = await checkRateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
    if (!rateLimit.allowed) {
      logger.warn("registration rate limited", {
        eventCode: "auth.register.rate_limited",
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 429,
        code: API_ERROR_CODES.rateLimited,
        message: "För många registreringar. Vänta en stund och prova igen.",
        requestId,
        headers: {
          "Retry-After": String(Math.max(1, Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000))),
        },
      });
    }

    const body = await request.json().catch(() => ({})) as {
      name?: unknown;
      email?: unknown;
      password?: unknown;
      companyName?: unknown;
    };
    const normalizedEmail = normalizeEmail(body.email);
    const normalizedName = typeof body.name === "string" ? body.name.trim() : null;
    const normalizedCompanyName =
      typeof body.companyName === "string" && body.companyName.trim()
        ? body.companyName.trim()
        : normalizedName
          ? `${normalizedName}s bolag`
          : "Mitt företag";

    if (!isValidEmail(normalizedEmail)) {
      logger.info("registration validation failed", {
        eventCode: "auth.register.validation_failed",
        field: "email",
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "En giltig e-postadress krävs",
        requestId,
      });
    }
    if (!isStrongPassword(body.password)) {
      logger.info("registration validation failed", {
        eventCode: "auth.register.validation_failed",
        field: "password",
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: passwordPolicyMessage,
        requestId,
      });
    }

    const existingUser = await db.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      logger.info("registration conflict", {
        eventCode: "auth.register.conflict",
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 400,
        code: API_ERROR_CODES.conflict,
        message: "E-postadressen används redan",
        requestId,
      });
    }

    const hashedPassword = await hashPassword(body.password as string);

    const company = await db.company.create({
      data: {
        name: normalizedCompanyName,
        users: {
          create: {
            email: normalizedEmail,
            password: hashedPassword,
            name: normalizedName,
            role: "owner",
          },
        },
      },
      include: {
        users: {
          select: { id: true, email: true, company_id: true },
        },
      },
    });

    const owner = company.users[0];
    let verifyUrl: string | undefined;
    if (owner) {
      const verifyToken = createResetToken();
      await db.emailVerificationToken.create({
        data: {
          user_id: owner.id,
          token_hash: hashResetToken(verifyToken),
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      await writeAuditLog(owner, {
        entityType: "company",
        entityId: company.id,
        action: "company.created",
        metadata: { companyName: normalizedCompanyName },
      });
      await queueTicketNotification(owner, {
        ticketId: owner.id,
        title: "Verifiera e-postadress",
        recipient: owner.email,
        event: "email_verification",
      });

      const candidateVerifyUrl = `${new URL(request.url).origin}/verify-email?token=${verifyToken}`;
      const canExposeVerifyUrl = !process.env.EMAIL_PROVIDER_API_KEY && process.env.NODE_ENV !== "production";
      verifyUrl = canExposeVerifyUrl ? candidateVerifyUrl : undefined;
    }

    logger.info("registration succeeded", {
      eventCode: "auth.register.succeeded",
      companyId: company.id,
      userId: owner?.id,
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json(
      {
        success: true,
        requestId,
        verifyUrl,
      },
      {
        status: 201,
        headers: successHeaders(requestId),
      },
    );
  } catch (error) {
    logger.error("registration failed", error, {
      eventCode: "auth.register.failed",
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
