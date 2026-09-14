import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import { getPublicAppUrl } from "@/lib/app-url";
import db from "@/lib/db";
import { hashPassword, hashResetToken } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { createRouteObservability } from "@/lib/route-observability";
import { isStrongPassword, passwordPolicyMessage } from "@/lib/security";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

function isNativeFormPost(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  return contentType.includes("application/x-www-form-urlencoded")
    || contentType.includes("multipart/form-data");
}

async function readConfirmFields(request: Request) {
  if (isNativeFormPost(request)) {
    const form = await request.formData().catch(() => null);
    return {
      token: String(form?.get("token") || ""),
      password: String(form?.get("password") || ""),
      confirmPassword: String(form?.get("confirmPassword") || ""),
    };
  }
  const body = await request.json().catch(() => ({})) as {
    token?: unknown;
    password?: unknown;
    confirmPassword?: unknown;
  };
  return {
    token: typeof body.token === "string" ? body.token : "",
    password: typeof body.password === "string" ? body.password : "",
    confirmPassword: typeof body.confirmPassword === "string" ? body.confirmPassword : "",
  };
}

export async function POST(request: Request) {
  const observability = createRouteObservability(request, "/api/auth/password-reset/confirm");
  const nativeForm = isNativeFormPost(request);
  const fail = (
    status: number,
    code: (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES],
    message: string,
    reason: "invalid" | "mismatch" | "policy" | "rate" | "error",
    headers?: HeadersInit,
    token?: string,
  ) => {
    if (!nativeForm) {
      return apiErrorResponse({
        status,
        code,
        message,
        requestId: observability.requestId,
        headers,
      });
    }
    const url = new URL("/reset-password", getPublicAppUrl(request.url));
    url.searchParams.set("reason", reason);
    if (token && token.length === 64) url.searchParams.set("token", token);
    const response = NextResponse.redirect(url, 303);
    if (headers) {
      new Headers(headers).forEach((value, name) => {
        if (name.toLowerCase() === "retry-after") response.headers.set(name, value);
      });
    }
    return observability.correlate(response);
  };
  let token = "";
  try {
    const ip = getClientIp(request);
    const rateLimit = await checkRateLimit(`password-reset-confirm:${ip}`, 8, 60 * 60 * 1000);
    const fields = nativeForm || rateLimit.allowed ? await readConfirmFields(request) : { token: "", password: "", confirmPassword: "" };
    token = fields.token;
    if (!rateLimit.allowed) {
      observability.logger.warn("auth password reset confirmation rate limited", observability.elapsed({
        event: "auth.password_reset.confirmation_rate_limited",
      }));
      return fail(
        429,
        API_ERROR_CODES.rateLimited,
        "För många försök. Vänta en stund och prova igen.",
        "rate",
        {
          "Retry-After": String(Math.max(1, Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000))),
        },
        fields.token,
      );
    }

    const password = fields.password;
    const confirmPassword = fields.confirmPassword;
    if (token.length !== 64) return fail(400, API_ERROR_CODES.validationFailed, "Länken är ogiltig eller har gått ut", "invalid");
    if (password !== confirmPassword) {
      return fail(400, API_ERROR_CODES.validationFailed, "Lösenorden matchar inte", "mismatch", undefined, token);
    }
    if (!isStrongPassword(password)) {
      return fail(400, API_ERROR_CODES.validationFailed, passwordPolicyMessage, "policy", undefined, token);
    }

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

    if (!result) {
      return fail(400, API_ERROR_CODES.validationFailed, "Länken är ogiltig eller har gått ut", "invalid");
    }
    observability.logger.info("auth password reset completed", observability.elapsed({
      event: "auth.password_reset.completed",
      userId: result,
    }));
    if (nativeForm) {
      const url = new URL("/login", getPublicAppUrl(request.url));
      url.searchParams.set("reset", "1");
      const response = NextResponse.redirect(url, 303);
      response.headers.set("Cache-Control", "no-store");
      response.headers.set("X-Content-Type-Options", "nosniff");
      return observability.correlate(response);
    }
    const response = NextResponse.json(
      { success: true, message: "Lösenordet är återställt. Logga in igen." },
      { headers: HEADERS },
    );
    return observability.correlate(response);
  } catch (error) {
    observability.logger.error("auth password reset confirmation failed", error, observability.elapsed({
      event: "auth.password_reset.confirmation_failed",
    }));
    return fail(500, API_ERROR_CODES.internalError, "Kunde inte återställa lösenordet", "error", undefined, token);
  }
}
