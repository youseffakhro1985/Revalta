import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import { writeAuditLog } from "@/lib/audit";
import { hashResetToken } from "@/lib/auth";
import db from "@/lib/db";
import { createRouteObservability } from "@/lib/route-observability";

export async function POST(request: Request) {
  const observability = createRouteObservability(request, "/api/auth/email-verification/confirm");
  const invalidTokenResponse = () => apiErrorResponse({
    status: 400,
    code: API_ERROR_CODES.validationFailed,
    message: "Verifieringslänken är ogiltig eller har gått ut",
    requestId: observability.requestId,
  });

  try {
    const body = await request.json().catch(() => ({})) as { token?: unknown };
    const token = typeof body.token === "string" ? body.token : "";
    if (token.length !== 64) return invalidTokenResponse();

    const tokenHash = hashResetToken(token);
    const verifiedUser = await db.$transaction(async (tx) => {
      const verification = await tx.emailVerificationToken.findUnique({
        where: { token_hash: tokenHash },
        select: {
          id: true,
          user_id: true,
          expires_at: true,
          used_at: true,
          user: {
            select: {
              id: true,
              email: true,
              company_id: true,
              status: true,
              company: { select: { status: true } },
            },
          },
        },
      });

      const now = new Date();
      if (
        !verification
        || verification.used_at
        || verification.expires_at <= now
        || verification.user.status !== "active"
        || (verification.user.company && verification.user.company.status !== "active")
      ) return null;

      const claimed = await tx.emailVerificationToken.updateMany({
        where: {
          id: verification.id,
          used_at: null,
          expires_at: { gt: now },
        },
        data: { used_at: now },
      });
      if (claimed.count !== 1) return null;

      await tx.user.update({
        where: { id: verification.user_id },
        data: { email_verified_at: now },
      });
      await writeAuditLog(verification.user, {
        entityType: "user",
        entityId: verification.user.id,
        action: "auth.email_verified",
        metadata: { method: "one_time_token" },
      }, tx);

      return verification.user;
    });

    if (!verifiedUser) return invalidTokenResponse();

    const response = NextResponse.json(
      { success: true },
      { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
    );
    observability.logger.info("auth email verification completed", observability.elapsed({
      event: "auth.email_verification.completed",
      userId: verifiedUser.id,
    }));
    return observability.correlate(response);
  } catch (error) {
    observability.logger.error("auth email verification failed", error, observability.elapsed({
      event: "auth.email_verification.failed",
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId: observability.requestId,
    });
  }
}
