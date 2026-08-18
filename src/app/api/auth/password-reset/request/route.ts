import { after, NextResponse } from "next/server";
import db from "@/lib/db";
import { createResetToken, hashResetToken } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { createRouteObservability } from "@/lib/route-observability";
import { isValidEmail, normalizeEmail } from "@/lib/security";
import { sendPasswordResetEmail } from "@/lib/password-reset-email";

const RESPONSE = { message: "Om kontot finns skickar vi en återställningslänk." };
const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

const RESET_LOOKUP_TRANSACTION_OPTIONS = {
  maxWait: 750,
  timeout: 1_500,
} as const;

const RESET_TOKEN_TRANSACTION_OPTIONS = {
  maxWait: 500,
  timeout: 1_000,
} as const;

function phaseLatency(startedAt: number) {
  return Math.max(0, Date.now() - startedAt);
}

export async function POST(request: Request) {
  const observability = createRouteObservability(request, "/api/auth/password-reset/request");
  const neutralResponse = () => {
    observability.logger.info("auth password reset request completed", observability.elapsed({
      event: "auth.password_reset.request_completed",
    }));
    return observability.correlate(NextResponse.json(RESPONSE, { headers: HEADERS }));
  };

  try {
    const body = await request.json().catch(() => ({})) as { email?: unknown };
    const email = normalizeEmail(body.email);
    const ip = getClientIp(request);

    const rateLimitStartedAt = Date.now();
    const [ipLimit, accountLimit] = await Promise.all([
      checkRateLimit(`password-reset-request:ip:${ip}`, 8, 60 * 60 * 1000),
      checkRateLimit(`password-reset-request:account:${email || "invalid"}`, 3, 60 * 60 * 1000),
    ]);
    observability.logger.info("auth password reset rate limit completed", {
      event: "auth.password_reset.rate_limit_completed",
      phaseLatencyMs: phaseLatency(rateLimitStartedAt),
      ipSource: ipLimit.source,
      accountSource: accountLimit.source,
    });

    if (!ipLimit.allowed || !accountLimit.allowed || !isValidEmail(email)) {
      return neutralResponse();
    }

    const lookupStartedAt = Date.now();
    const user = await db.$transaction(
      (tx) => tx.user.findUnique({
        where: { email },
        select: { id: true, email: true, status: true, company: { select: { status: true } } },
      }),
      RESET_LOOKUP_TRANSACTION_OPTIONS,
    );
    observability.logger.info("auth password reset lookup completed", {
      event: "auth.password_reset.lookup_completed",
      phaseLatencyMs: phaseLatency(lookupStartedAt),
    });

    if (!user || user.status !== "active" || (user.company && user.company.status !== "active")) {
      return neutralResponse();
    }

    const tokenStartedAt = Date.now();
    const token = createResetToken();
    const tokenHash = hashResetToken(token);
    await db.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: { user_id: user.id, used_at: null },
        data: { used_at: new Date() },
      });
      await tx.passwordResetToken.create({
        data: {
          user_id: user.id,
          token_hash: tokenHash,
          expires_at: new Date(Date.now() + 30 * 60 * 1000),
        },
      });
    }, RESET_TOKEN_TRANSACTION_OPTIONS);
    observability.logger.info("auth password reset token persisted", {
      event: "auth.password_reset.token_persisted",
      userId: user.id,
      phaseLatencyMs: phaseLatency(tokenStartedAt),
    });

    after(async () => {
      const deliveryStartedAt = Date.now();
      try {
        await sendPasswordResetEmail(user.email, token);
        observability.logger.info("auth password reset delivery completed", {
          event: "auth.password_reset.delivery_completed",
          userId: user.id,
          phaseLatencyMs: phaseLatency(deliveryStartedAt),
        });
      } catch (error) {
        const cleanupStartedAt = Date.now();
        try {
          await db.$transaction(
            (tx) => tx.passwordResetToken.updateMany({
              where: { token_hash: tokenHash, used_at: null },
              data: { used_at: new Date() },
            }),
            RESET_TOKEN_TRANSACTION_OPTIONS,
          );
        } catch (cleanupError) {
          observability.logger.error(
            "auth password reset token cleanup failed",
            cleanupError,
            {
              event: "auth.password_reset.token_cleanup_failed",
              userId: user.id,
              cleanupLatencyMs: phaseLatency(cleanupStartedAt),
            },
          );
        }
        observability.logger.warn("auth password reset delivery failed", observability.elapsed({
          event: "auth.password_reset.delivery_failed",
          userId: user.id,
          errorName: error instanceof Error ? error.name : "UnknownError",
          deliveryLatencyMs: phaseLatency(deliveryStartedAt),
        }));
      }
    });

    return neutralResponse();
  } catch (error) {
    observability.logger.error("auth password reset request failed", error, observability.elapsed({
      event: "auth.password_reset.request_failed",
    }));
    return neutralResponse();
  }
}
