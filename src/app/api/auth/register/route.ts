import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import { getPublicAppUrl } from "@/lib/app-url";
import db from "@/lib/db";
import { createResetToken, hashPassword, hashResetToken } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { queueEmailVerification } from "@/lib/integrations";
import { createRouteObservability } from "@/lib/route-observability";
import { isStrongPassword, isValidEmail, normalizeEmail, passwordPolicyMessage } from "@/lib/security";

export async function POST(request: Request) {
  const observability = createRouteObservability(request, "/api/auth/register");
  try {
    const ip = getClientIp(request);
    const rateLimit = await checkRateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
    if (!rateLimit.allowed) {
      observability.logger.warn("auth registration rate limited", observability.elapsed({
        event: "auth.registration.rate_limited",
      }));
      return apiErrorResponse({
        status: 429,
        code: API_ERROR_CODES.rateLimited,
        message: "För många registreringar. Vänta en stund och prova igen.",
        requestId: observability.requestId,
        headers: {
          "Retry-After": String(Math.max(1, Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000))),
        },
      });
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const { name, email, password, companyName } = body;
    const normalizedEmail = normalizeEmail(email);
    const normalizedName = typeof name === "string" ? name.trim() : null;
    const normalizedCompanyName =
      typeof companyName === "string" && companyName.trim()
        ? companyName.trim()
        : normalizedName
          ? `${normalizedName}s bolag`
          : "Mitt företag";

    if ((normalizedName?.length ?? 0) > 120 || normalizedCompanyName.length > 160) {
      return apiErrorResponse({
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "Namn eller företagsnamn är för långt",
        requestId: observability.requestId,
      });
    }
    if (!isValidEmail(normalizedEmail)) {
      return apiErrorResponse({
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: "En giltig e-postadress krävs",
        requestId: observability.requestId,
      });
    }
    if (!isStrongPassword(password)) {
      return apiErrorResponse({
        status: 400,
        code: API_ERROR_CODES.validationFailed,
        message: passwordPolicyMessage,
        requestId: observability.requestId,
      });
    }

    const existingUser = await db.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return apiErrorResponse({
        status: 409,
        code: API_ERROR_CODES.conflict,
        message: "E-postadressen används redan",
        requestId: observability.requestId,
      });
    }

    const hashedPassword = await hashPassword(password);

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
    if (!owner) throw new Error("Company creation completed without an owner");

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
    const verifyUrl = `${getPublicAppUrl(request.url)}/verify-email?token=${encodeURIComponent(verifyToken)}`;
    await queueEmailVerification(owner, {
      recipient: owner.email,
      verificationUrl: verifyUrl,
    });

    const canExposeVerifyUrl = !process.env.EMAIL_PROVIDER_API_KEY && process.env.NODE_ENV !== "production";
    const response = NextResponse.json({
      success: true,
      verifyUrl: canExposeVerifyUrl ? verifyUrl : undefined,
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
    observability.logger.info("auth registration succeeded", observability.elapsed({
      event: "auth.registration.succeeded",
      userId: owner.id,
      companyId: company.id,
    }));
    return observability.correlate(response);
  } catch (error) {
    observability.logger.error("auth registration failed", error, observability.elapsed({
      event: "auth.registration.failed",
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId: observability.requestId,
    });
  }
}
