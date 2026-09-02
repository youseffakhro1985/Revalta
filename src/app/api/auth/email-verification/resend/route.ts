import { after, NextResponse } from "next/server";
import { getPublicAppUrl } from "@/lib/app-url";
import { writeAuditLog } from "@/lib/audit";
import { createResetToken, hashResetToken } from "@/lib/auth";
import db from "@/lib/db";
import { queueEmailVerification } from "@/lib/integrations";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { createRouteObservability } from "@/lib/route-observability";
import { isValidEmail, normalizeEmail } from "@/lib/security";

const RESPONSE = { message: "Om kontot behöver verifieras skickar vi en ny verifieringslänk." };
const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

const LOOKUP_TRANSACTION_OPTIONS = {
  maxWait: 750,
  timeout: 1_500,
} as const;

const TOKEN_TRANSACTION_OPTIONS = {
  maxWait: 750,
  timeout: 1_500,
} as const;

function phaseLatency(startedAt: number) {
  return Math.max(0, Date.now() - startedAt);
}

async function invalidateFreshToken(tokenHash: string, userId: string, observability: ReturnType<typeof createRouteObservability>) {
  try {
    await db.$transaction(
      (tx) => tx.emailVerificationToken.updateMany({
        where: { token_hash: tokenHash, used_at: null },
        data: { used_at: new Date() },
      }),
      TOKEN_TRANSACTION_OPTIONS,
    );
  } catch (cleanupError) {
    observability.logger.error("auth email verification resend token cleanup failed", cleanupError, {
      event: "auth.email_verification.resend_token_cleanup_failed",
      userId,
    });
  }
}

async function processResend(input: {
  email: string;
  ip: string;
  publicAppUrl: string;
  observability: ReturnType<typeof createRouteObservability>;
}) {
  const { email, ip, publicAppUrl, observability } = input;
  try {
    const rateLimitStartedAt = Date.now();
    const [ipLimit, accountLimit] = await Promise.all([
      checkRateLimit(`email-verification-resend:ip:${ip}`, 8, 60 * 60 * 1000),
      checkRateLimit(`email-verification-resend:account:${email}`, 3, 60 * 60 * 1000),
    ]);
    observability.logger.info("auth email verification resend rate limit completed", {
      event: "auth.email_verification.resend_rate_limit_completed",
      phaseLatencyMs: phaseLatency(rateLimitStartedAt),
      ipSource: ipLimit.source,
      accountSource: accountLimit.source,
    });
    if (!ipLimit.allowed || !accountLimit.allowed) return;

    const lookupStartedAt = Date.now();
    const user = await db.$transaction(
      (tx) => tx.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          company_id: true,
          status: true,
          email_verified_at: true,
          company: { select: { status: true } },
          email_verification_tokens: { select: { id: true }, take: 1 },
        },
      }),
      LOOKUP_TRANSACTION_OPTIONS,
    );
    observability.logger.info("auth email verification resend lookup completed", {
      event: "auth.email_verification.resend_lookup_completed",
      phaseLatencyMs: phaseLatency(lookupStartedAt),
    });

    if (
      !user
      || user.status !== "active"
      || (user.company && user.company.status !== "active")
      || user.email_verified_at !== null
      || user.email_verification_tokens.length === 0
    ) return;

    const token = createResetToken();
    const tokenHash = hashResetToken(token);
    const tokenStartedAt = Date.now();
    await db.$transaction(async (tx) => {
      const now = new Date();
      await tx.emailVerificationToken.updateMany({
        where: { user_id: user.id, used_at: null },
        data: { used_at: now },
      });
      await tx.emailVerificationToken.create({
        data: {
          user_id: user.id,
          token_hash: tokenHash,
          expires_at: new Date(Date.now() + VERIFY_TOKEN_TTL_MS),
        },
      });
      await writeAuditLog(user, {
        entityType: "user",
        entityId: user.id,
        action: "auth.email_verification_resent",
        metadata: { method: "one_time_token" },
      }, tx);
    }, TOKEN_TRANSACTION_OPTIONS);
    observability.logger.info("auth email verification resend token persisted", {
      event: "auth.email_verification.resend_token_persisted",
      userId: user.id,
      phaseLatencyMs: phaseLatency(tokenStartedAt),
    });

    const verificationUrl = `${publicAppUrl}/verify-email?token=${encodeURIComponent(token)}`;
    const deliveryStartedAt = Date.now();
    try {
      const delivery = await queueEmailVerification(user, {
        recipient: user.email,
        verificationUrl,
      });
      if (delivery.status === "failed") {
        await invalidateFreshToken(tokenHash, user.id, observability);
        observability.logger.warn("auth email verification resend delivery failed", {
          event: "auth.email_verification.resend_delivery_failed",
          userId: user.id,
          deliveryLatencyMs: phaseLatency(deliveryStartedAt),
        });
        return;
      }
      observability.logger.info("auth email verification resend delivery completed", {
        event: "auth.email_verification.resend_delivery_completed",
        userId: user.id,
        phaseLatencyMs: phaseLatency(deliveryStartedAt),
      });
    } catch (error) {
      await invalidateFreshToken(tokenHash, user.id, observability);
      observability.logger.warn("auth email verification resend delivery failed", {
        event: "auth.email_verification.resend_delivery_failed",
        userId: user.id,
        errorName: error instanceof Error ? error.name : "UnknownError",
        deliveryLatencyMs: phaseLatency(deliveryStartedAt),
      });
    }
  } catch (error) {
    observability.logger.error("auth email verification resend background processing failed", error, observability.elapsed({
      event: "auth.email_verification.resend_background_failed",
    }));
  }
}

export async function POST(request: Request) {
  const observability = createRouteObservability(request, "/api/auth/email-verification/resend");
  const neutralResponse = () => observability.correlate(NextResponse.json(RESPONSE, { headers: HEADERS }));

  const body = await request.json().catch(() => ({})) as { email?: unknown };
  const email = normalizeEmail(body.email);
  if (isValidEmail(email)) {
    const ip = getClientIp(request);
    const publicAppUrl = getPublicAppUrl(request.url);
    after(() => processResend({ email, ip, publicAppUrl, observability }));
  }

  return neutralResponse();
}
