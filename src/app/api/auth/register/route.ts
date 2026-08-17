import { after, NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import { getPublicAppUrl } from "@/lib/app-url";
import db from "@/lib/db";
import { createResetToken, hashPassword, hashResetToken } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { queueEmailVerification } from "@/lib/integrations";
import { createRouteObservability } from "@/lib/route-observability";
import { isStrongPassword, isValidEmail, normalizeEmail, passwordPolicyMessage } from "@/lib/security";

const REGISTER_TRANSACTION_OPTIONS = {
  maxWait: 1_500,
  timeout: 5_000,
} as const;

function phaseLatency(startedAt: number) {
  return Math.max(0, Date.now() - startedAt);
}

function isEmailUniqueConstraintError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; meta?: { target?: unknown } };
  if (candidate.code !== "P2002") return false;

  const target = candidate.meta?.target;
  if (Array.isArray(target)) {
    return target.some((value) => typeof value === "string" && value.toLowerCase().includes("email"));
  }
  return typeof target === "string" && target.toLowerCase().includes("email");
}

export async function POST(request: Request) {
  const observability = createRouteObservability(request, "/api/auth/register");
  try {
    const ip = getClientIp(request);
    const rateLimitStartedAt = Date.now();
    const rateLimit = await checkRateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
    observability.logger.info("auth registration rate limit completed", {
      event: "auth.registration.rate_limit_completed",
      phaseLatencyMs: phaseLatency(rateLimitStartedAt),
      source: rateLimit.source,
    });
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

    const passwordStartedAt = Date.now();
    const hashedPassword = await hashPassword(password);
    observability.logger.info("auth registration password hash completed", {
      event: "auth.registration.password_hash_completed",
      phaseLatencyMs: phaseLatency(passwordStartedAt),
    });

    const verifyToken = createResetToken();
    const persistenceStartedAt = Date.now();
    const { company, owner } = await db.$transaction(async (tx) => {
      const createdCompany = await tx.company.create({
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

      const createdOwner = createdCompany.users[0];
      if (!createdOwner) throw new Error("Company creation completed without an owner");

      await tx.emailVerificationToken.create({
        data: {
          user_id: createdOwner.id,
          token_hash: hashResetToken(verifyToken),
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      await writeAuditLog(createdOwner, {
        entityType: "company",
        entityId: createdCompany.id,
        action: "company.created",
        metadata: { companyName: normalizedCompanyName },
      }, tx);
      return { company: createdCompany, owner: createdOwner };
    }, REGISTER_TRANSACTION_OPTIONS);
    observability.logger.info("auth registration persistence completed", {
      event: "auth.registration.persistence_completed",
      companyId: company.id,
      userId: owner.id,
      phaseLatencyMs: phaseLatency(persistenceStartedAt),
    });

    const verifyUrl = `${getPublicAppUrl(request.url)}/verify-email?token=${encodeURIComponent(verifyToken)}`;
    after(async () => {
      const deliveryStartedAt = Date.now();
      try {
        await queueEmailVerification(owner, {
          recipient: owner.email,
          verificationUrl: verifyUrl,
        });
        observability.logger.info("auth registration verification delivery completed", {
          event: "auth.registration.verification_delivery_completed",
          companyId: company.id,
          userId: owner.id,
          phaseLatencyMs: phaseLatency(deliveryStartedAt),
        });
      } catch (error) {
        observability.logger.error(
          "auth registration verification delivery failed",
          error,
          {
            event: "auth.registration.verification_delivery_failed",
            companyId: company.id,
            userId: owner.id,
            phaseLatencyMs: phaseLatency(deliveryStartedAt),
          },
        );
      }
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
      verificationDelivery: "scheduled",
    }));
    return observability.correlate(response);
  } catch (error) {
    if (isEmailUniqueConstraintError(error)) {
      observability.logger.info("auth registration email conflict", observability.elapsed({
        event: "auth.registration.email_conflict",
      }));
      return apiErrorResponse({
        status: 409,
        code: API_ERROR_CODES.conflict,
        message: "E-postadressen används redan",
        requestId: observability.requestId,
      });
    }

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
