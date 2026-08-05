import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import db from "@/lib/db";
import { hashPassword, hashResetToken } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { createRouteObservability } from "@/lib/route-observability";
import { isStrongPassword, passwordPolicyMessage } from "@/lib/security";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export async function POST(request: Request) {
  const observability = createRouteObservability(request, "/api/auth/password-reset/confirm");
  const validationError = (message: string) => apiErrorResponse({
    status: 400,
    code: API_ERROR_CODES.validationFailed,
    message,
    requestId: observability.requestId,
  });
  try {
    const ip = getClientIp(request);
    const rateLimit = await checkRateLimit(`password-reset-confirm:${ip}`, 8, 60 * 60 * 1000);
    if (!rateLimit.allowed) {
      observability.logger.warn("auth password reset confirmation rate limited", observability.elapsed({
        event: "auth.password_reset.confirmation_rate_limited",
      }));
      return apiErrorResponse({
        status: 429,
        code: API_ERROR_CODES.rateLimited,
        message: "För många försök. Vänta en stund och prova igen.",
        requestId: observability.requestId,
        headers: {
          "Retry-After": String(Math.max(1, Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000))),
        },
      });
    }

    const body = await request.json().catch(() => ({})) as { token?: unknown; password?: unknown; confirmPassword?: unknown };
    const token = typeof body.token === "string" ? body.token : "";
    const password = typeof body.password === "string" ? body.password : "";
    const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : "";
    if (token.length !== 64) return validationError("Länken är ogiltig eller har gått ut");
    if (password !== confirmPassword) return validationError("Lösenorden matchar inte");
    if (!isStrongPassword(password)) return validationError(passwordPolicyMessage);

    const tokenHash = hashResetToken(token);
    const passwordHash = await hashPassword(password);
    const result = await db.$transaction(async (tx) => {
      const reset = await tx.passwordResetToken.findUnique({ where: { token_hash: tokenHash }, select: { id: true, user_id: true, expires_at: true, used_at: true, user: { select: { id: true, company_id: true, status: true, company: { select: { status: true } } } } } });
      if (!reset || reset.used_at || reset.expires_at <= new Date() || reset.user.status !== "active" || (reset.user.company && reset.user.company.status !== "active")) return null;
      const used = await tx.passwordResetToken.updateMany({ where: { id: reset.id, used_at: null, expires_at: { gt: new Date() } }, data: { used_at: new Date() } });
      if (used.count !== 1) return null;
      await tx.user.update({ where: { id: reset.user_id }, data: { password: passwordHash } });
      await tx.passwordResetToken.updateMany({ where: { user_id: reset.user_id, used_at: null }, data: { used_at: new Date() } });
      await tx.auditLog.createMany({
        data: [
          {
            company_id: reset.user.company_id,
            actor_user_id: reset.user.id,
            entity_type: "user",
            entity_id: reset.user.id,
            action: "user.password_changed",
            metadata: { method: "reset_token", revokedSessions: true },
          },
          {
            company_id: reset.user.company_id,
            actor_user_id: reset.user.id,
            entity_type: "user",
            entity_id: reset.user.id,
            action: "auth.password_reset_completed",
            metadata: { method: "reset_token", revokedSessions: true },
          },
        ],
      });
      return reset.user.id;
    });

    if (!result) return validationError("Länken är ogiltig eller har gått ut");
    const response = NextResponse.json(
      { success: true, message: "Lösenordet är återställt. Logga in igen." },
      { headers: HEADERS },
    );
    observability.logger.info("auth password reset completed", observability.elapsed({
      event: "auth.password_reset.completed",
      userId: result,
    }));
    return observability.correlate(response);
  } catch (error) {
    observability.logger.error("auth password reset confirmation failed", error, observability.elapsed({
      event: "auth.password_reset.confirmation_failed",
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Kunde inte återställa lösenordet",
      requestId: observability.requestId,
    });
  }
}
