import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import db from "@/lib/db";
import { comparePassword, signToken } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { createRouteObservability } from "@/lib/route-observability";
import { isValidEmail, normalizeEmail } from "@/lib/security";
import {
  LEGACY_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  expiredSessionCookieOptions,
  sessionCookieOptions,
} from "@/lib/session-policy";

// Fixed bcrypt cost/hash used only to equalize the missing-account code path.
const INVALID_ACCOUNT_PASSWORD_HASH = "$2a$10$FJbQnDGAGV2VKWMTHazxDOdHo5WvcroaPaabBeTUArU48dQcRWqdW";

export async function POST(request: Request) {
  const observability = createRouteObservability(request, "/api/auth/login");
  try {
    const ip = getClientIp(request);
    const body = await request.json().catch(() => ({})) as { email?: unknown; password?: unknown };
    const normalizedEmail = normalizeEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";

    const [ipLimit, accountLimit] = await Promise.all([
      checkRateLimit(`login:ip:${ip}`, 12, 15 * 60 * 1000),
      checkRateLimit(`login:account:${normalizedEmail || "invalid"}`, 6, 15 * 60 * 1000),
    ]);
    const strictest = ipLimit.resetAt > accountLimit.resetAt ? ipLimit : accountLimit;
    if (!ipLimit.allowed || !accountLimit.allowed) {
      observability.logger.warn("auth login rate limited", observability.elapsed({
        event: "auth.login.rate_limited",
      }));
      return apiErrorResponse({
        status: 429,
        code: API_ERROR_CODES.rateLimited,
        message: "För många inloggningsförsök. Vänta en stund och prova igen.",
        requestId: observability.requestId,
        headers: {
          "Retry-After": String(Math.max(1, Math.ceil((strictest.resetAt.getTime() - Date.now()) / 1000))),
        },
      });
    }

    if (!isValidEmail(normalizedEmail) || password.length < 1 || password.length > 512) {
      return apiErrorResponse({
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Ogiltiga uppgifter",
        requestId: observability.requestId,
      });
    }

    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        company: { select: { status: true } },
        email_verification_tokens: { select: { id: true }, take: 1 },
      },
    });
    const valid = await comparePassword(password, user?.password || INVALID_ACCOUNT_PASSWORD_HASH);
    if (!user || !valid || user.status !== "active" || (user.company && user.company.status !== "active")) {
      return apiErrorResponse({
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Ogiltiga uppgifter",
        requestId: observability.requestId,
      });
    }

    // Backward-compatible rollout: legacy accounts predate the verification-token
    // flow and may legitimately have email_verified_at = null. Only accounts with
    // token history are known to have been enrolled in email verification.
    const requiresEmailVerification =
      user.email_verified_at === null && user.email_verification_tokens.length > 0;
    if (requiresEmailVerification) {
      observability.logger.info("auth login requires email verification", observability.elapsed({
        event: "auth.login.email_verification_required",
        userId: user.id,
      }));
      return apiErrorResponse({
        status: 403,
        code: API_ERROR_CODES.emailVerificationRequired,
        message: "Verifiera din e-postadress innan du loggar in.",
        requestId: observability.requestId,
      });
    }

    const latestPasswordChange = await db.auditLog.findFirst({
      where: {
        actor_user_id: user.id,
        entity_type: "user",
        entity_id: user.id,
        action: "user.password_changed",
      },
      orderBy: { created_at: "desc" },
      select: { created_at: true },
    });

    const token = await signToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      passwordChangedAt: latestPasswordChange?.created_at.getTime() ?? null,
    });
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
    cookieStore.set(LEGACY_SESSION_COOKIE_NAME, "", expiredSessionCookieOptions());

    const response = NextResponse.json(
      { success: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } },
      { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
    );
    observability.logger.info("auth login succeeded", observability.elapsed({
      event: "auth.login.succeeded",
      userId: user.id,
    }));
    return observability.correlate(response);
  } catch (error) {
    observability.logger.error("auth login failed", error, observability.elapsed({
      event: "auth.login.failed",
    }));
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.internalError,
      message: "Internt serverfel",
      requestId: observability.requestId,
    });
  }
}
