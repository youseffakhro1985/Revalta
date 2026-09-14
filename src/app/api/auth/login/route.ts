import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import { getPublicAppUrl } from "@/lib/app-url";
import db from "@/lib/db";
import { comparePassword, signToken } from "@/lib/auth";
import { isResident } from "@/lib/permissions";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { homePathForRole, isStaffOnlyDashboardPath } from "@/lib/resident-access";
import { createRouteObservability } from "@/lib/route-observability";
import { isValidEmail, normalizeEmail, safeInternalPath } from "@/lib/security";
import {
  LEGACY_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  expiredSessionCookieOptions,
  sessionCookieOptions,
} from "@/lib/session-policy";

// Fixed bcrypt cost/hash used only to equalize the missing-account code path.
const INVALID_ACCOUNT_PASSWORD_HASH = "$2a$10$FJbQnDGAGV2VKWMTHazxDOdHo5WvcroaPaabBeTUArU48dQcRWqdW";

function isNativeFormLogin(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  return contentType.includes("application/x-www-form-urlencoded")
    || contentType.includes("multipart/form-data");
}

async function readLoginCredentials(request: Request) {
  if (isNativeFormLogin(request)) {
    const form = await request.formData().catch(() => null);
    return {
      email: String(form?.get("email") || ""),
      password: String(form?.get("password") || ""),
      nextPath: String(form?.get("next") || ""),
    };
  }
  const body = await request.json().catch(() => ({})) as { email?: unknown; password?: unknown };
  return {
    email: typeof body.email === "string" ? body.email : "",
    password: typeof body.password === "string" ? body.password : "",
    nextPath: "",
  };
}

export async function POST(request: Request) {
  const observability = createRouteObservability(request, "/api/auth/login");
  const nativeForm = isNativeFormLogin(request);
  const fail = (
    status: number,
    code: (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES],
    message: string,
    reason: "invalid" | "verify" | "rate" | "error",
    headers?: HeadersInit,
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
    const url = new URL("/login", getPublicAppUrl(request.url));
    url.searchParams.set("reason", reason);
    const response = NextResponse.redirect(url, 303);
    if (headers) {
      new Headers(headers).forEach((value, name) => {
        if (name.toLowerCase() === "retry-after") response.headers.set(name, value);
      });
    }
    return observability.correlate(response);
  };

  try {
    const ip = getClientIp(request);
    const credentials = await readLoginCredentials(request);
    const normalizedEmail = normalizeEmail(credentials.email);
    const password = credentials.password;

    const [ipLimit, accountLimit] = await Promise.all([
      checkRateLimit(`login:ip:${ip}`, 12, 15 * 60 * 1000),
      checkRateLimit(`login:account:${normalizedEmail || "invalid"}`, 6, 15 * 60 * 1000),
    ]);
    const strictest = ipLimit.resetAt > accountLimit.resetAt ? ipLimit : accountLimit;
    if (!ipLimit.allowed || !accountLimit.allowed) {
      observability.logger.warn("auth login rate limited", observability.elapsed({
        event: "auth.login.rate_limited",
      }));
      return fail(
        429,
        API_ERROR_CODES.rateLimited,
        "För många inloggningsförsök. Vänta en stund och prova igen.",
        "rate",
        {
          "Retry-After": String(Math.max(1, Math.ceil((strictest.resetAt.getTime() - Date.now()) / 1000))),
        },
      );
    }

    if (!isValidEmail(normalizedEmail) || password.length < 1 || password.length > 512) {
      return fail(401, API_ERROR_CODES.unauthorized, "Ogiltiga uppgifter", "invalid");
    }

    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        company: { select: { status: true } },
        email_verification_tokens: {
          where: { used_at: null },
          select: { id: true },
          take: 1,
        },
      },
    });
    const valid = await comparePassword(password, user?.password || INVALID_ACCOUNT_PASSWORD_HASH);
    if (!user || !valid || user.status !== "active" || (user.company && user.company.status !== "active")) {
      return fail(401, API_ERROR_CODES.unauthorized, "Ogiltiga uppgifter", "invalid");
    }

    // Backward-compatible rollout: legacy accounts predate verification tokens.
    // Only an unused token means a verification email was issued and is still
    // outstanding. Consumed tokens (used after failed delivery or confirm) must
    // not permanently lock the account out of login.
    const requiresEmailVerification =
      user.email_verified_at === null && user.email_verification_tokens.length > 0;
    if (requiresEmailVerification) {
      observability.logger.info("auth login requires email verification", observability.elapsed({
        event: "auth.login.email_verification_required",
        userId: user.id,
      }));
      return fail(
        403,
        API_ERROR_CODES.emailVerificationRequired,
        "Verifiera din e-postadress innan du loggar in.",
        "verify",
      );
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

    observability.logger.info("auth login succeeded", observability.elapsed({
      event: "auth.login.succeeded",
      userId: user.id,
    }));

    if (nativeForm) {
      const fallback = homePathForRole(user.role);
      const nextPath = safeInternalPath(credentials.nextPath, fallback);
      const destination = isResident(user.role) && isStaffOnlyDashboardPath(nextPath) ? fallback : nextPath;
      const response = NextResponse.redirect(new URL(destination, getPublicAppUrl(request.url)), 303);
      return observability.correlate(response);
    }

    const response = NextResponse.json(
      { success: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } },
      { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
    );
    return observability.correlate(response);
  } catch (error) {
    observability.logger.error("auth login failed", error, observability.elapsed({
      event: "auth.login.failed",
    }));
    return fail(500, API_ERROR_CODES.internalError, "Internt serverfel", "error");
  }
}
