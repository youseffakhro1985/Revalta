import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { comparePassword, signToken } from "@/lib/auth";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { resolveRequestId, withRequestCorrelation } from "@/lib/request-correlation";
import { isValidEmail, normalizeEmail } from "@/lib/security";
import {
  LEGACY_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  expiredSessionCookieOptions,
  sessionCookieOptions,
} from "@/lib/session-policy";
import { createLogger } from "@/lib/structured-logger";

const ROUTE = "/api/auth/login";

export async function POST(request: Request) {
  const requestId = resolveRequestId(request.headers);
  const startedAt = Date.now();
  const logger = createLogger({
    route: ROUTE,
    method: "POST",
    requestId,
    release: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || "local",
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
  });

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
      const retryAfter = String(Math.max(1, Math.ceil((strictest.resetAt.getTime() - Date.now()) / 1000)));
      logger.warn("auth.login.rate_limited", {
        eventCode: "auth.login.rate_limited",
        latencyMs: Date.now() - startedAt,
        retryAfterSeconds: Number(retryAfter),
      });
      return apiErrorResponse({
        status: 429,
        code: API_ERROR_CODES.rateLimited,
        message: "För många inloggningsförsök. Vänta en stund och prova igen.",
        requestId,
        headers: { "Retry-After": retryAfter },
      });
    }

    if (!isValidEmail(normalizedEmail) || password.length < 1 || password.length > 512) {
      logger.info("auth.login.rejected", {
        eventCode: "auth.login.invalid_credentials",
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Ogiltiga uppgifter",
        requestId,
      });
    }

    const user = await db.user.findUnique({ where: { email: normalizedEmail }, include: { company: { select: { status: true } } } });
    const valid = user ? await comparePassword(password, user.password) : false;
    if (!user || !valid || user.status !== "active" || (user.company && user.company.status !== "active")) {
      logger.info("auth.login.rejected", {
        eventCode: "auth.login.invalid_credentials",
        latencyMs: Date.now() - startedAt,
      });
      return apiErrorResponse({
        status: 401,
        code: API_ERROR_CODES.unauthorized,
        message: "Ogiltiga uppgifter",
        requestId,
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

    logger.info("auth.login.succeeded", {
      eventCode: "auth.login.succeeded",
      userId: user.id,
      latencyMs: Date.now() - startedAt,
    });

    return withRequestCorrelation(
      NextResponse.json(
        { success: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } },
        {
          headers: {
            "Cache-Control": "private, no-store, max-age=0, must-revalidate",
            "CDN-Cache-Control": "no-store",
            "Vercel-CDN-Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          },
        },
      ),
      requestId,
    );
  } catch (error) {
    logger.error("auth.login.failed", error, {
      eventCode: "auth.login.failed",
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
