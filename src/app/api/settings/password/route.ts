import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getPublicAppUrl } from "@/lib/app-url";
import { comparePassword, hashPassword, signToken } from "@/lib/auth";
import { getCurrentUser } from "@/lib/current-user";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { isStrongPassword, passwordPolicyMessage } from "@/lib/security";
import { createLogger } from "@/lib/structured-logger";
import {
  LEGACY_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  expiredSessionCookieOptions,
  sessionCookieOptions,
} from "@/lib/session-policy";

const logger = createLogger({ route: "/api/settings/password" });
const ACCOUNT_PATH = "/dashboard/boendeportal/konto";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function isNativeFormPost(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  return contentType.includes("application/x-www-form-urlencoded")
    || contentType.includes("multipart/form-data");
}

function nativeRedirect(request: Request, path: string) {
  const response = NextResponse.redirect(new URL(path, getPublicAppUrl(request.url)), 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

function jsonError(message: string, status: number, extraHeaders?: HeadersInit) {
  return NextResponse.json(
    { error: message },
    { status, headers: { ...NO_STORE_HEADERS, ...extraHeaders } },
  );
}

async function readPasswordFields(request: Request, nativeForm: boolean) {
  if (nativeForm) {
    const form = await request.formData().catch(() => null);
    return {
      currentPassword: String(form?.get("currentPassword") || ""),
      newPassword: String(form?.get("newPassword") || ""),
      confirmPassword: String(form?.get("confirmPassword") || ""),
    };
  }
  const body = await request.json().catch(() => ({})) as {
    currentPassword?: unknown;
    newPassword?: unknown;
    confirmPassword?: unknown;
  };
  return {
    currentPassword: typeof body.currentPassword === "string" ? body.currentPassword : "",
    newPassword: typeof body.newPassword === "string" ? body.newPassword : "",
    confirmPassword: typeof body.confirmPassword === "string" ? body.confirmPassword : "",
  };
}

async function changePassword(request: Request, nativeForm: boolean) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      if (nativeForm) return nativeRedirect(request, "/login");
      return jsonError("Obehörig", 401);
    }

    const ip = getClientIp(request);
    const rateLimit = await checkRateLimit(`settings-password:${user.id}:${ip}`, 5, 30 * 60 * 1000);
    if (!rateLimit.allowed) {
      if (nativeForm) return nativeRedirect(request, `${ACCOUNT_PATH}?reason=rate`);
      return jsonError("För många försök. Vänta en stund och prova igen.", 429, {
        "Retry-After": String(Math.max(1, Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000))),
      });
    }

    const { currentPassword, newPassword, confirmPassword } = await readPasswordFields(request, nativeForm);

    if (!currentPassword || currentPassword.length > 512) {
      if (nativeForm) return nativeRedirect(request, `${ACCOUNT_PATH}?reason=current`);
      return jsonError("Nuvarande lösenord är felaktigt", 400);
    }
    if (newPassword !== confirmPassword) {
      if (nativeForm) return nativeRedirect(request, `${ACCOUNT_PATH}?reason=mismatch`);
      return jsonError("De nya lösenorden matchar inte", 400);
    }
    if (!isStrongPassword(newPassword)) {
      if (nativeForm) return nativeRedirect(request, `${ACCOUNT_PATH}?reason=weak`);
      return jsonError(passwordPolicyMessage, 400);
    }
    if (currentPassword === newPassword) {
      if (nativeForm) return nativeRedirect(request, `${ACCOUNT_PATH}?reason=same`);
      return jsonError("Det nya lösenordet måste skilja sig från det nuvarande", 400);
    }

    const account = await db.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, name: true, password: true, company_id: true },
    });
    if (!account || !(await comparePassword(currentPassword, account.password))) {
      if (nativeForm) return nativeRedirect(request, `${ACCOUNT_PATH}?reason=current`);
      return jsonError("Nuvarande lösenord är felaktigt", 400);
    }

    const passwordHash = await hashPassword(newPassword);
    const passwordChange = await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: account.id }, data: { password: passwordHash } });
      await tx.passwordResetToken.updateMany({
        where: { user_id: account.id, used_at: null },
        data: { used_at: new Date() },
      });
      return tx.auditLog.create({
        data: {
          company_id: account.company_id,
          actor_user_id: account.id,
          entity_type: "user",
          entity_id: account.id,
          action: "user.password_changed",
          metadata: { method: "authenticated_settings", revokedResetTokens: true },
        },
        select: { created_at: true },
      });
    });

    const token = await signToken({
      sub: account.id,
      email: account.email,
      name: account.name,
      passwordChangedAt: passwordChange.created_at.getTime(),
    });
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
    cookieStore.set(LEGACY_SESSION_COOKIE_NAME, "", expiredSessionCookieOptions());

    if (nativeForm) return nativeRedirect(request, `${ACCOUNT_PATH}?password=1`);
    return NextResponse.json(
      { success: true, message: "Lösenordet har ändrats och tidigare sessioner har avslutats." },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    logger.error("Change password error", error);
    if (nativeForm) return nativeRedirect(request, `${ACCOUNT_PATH}?reason=error`);
    return jsonError("Internt serverfel", 500);
  }
}

export async function PATCH(request: Request) {
  return changePassword(request, false);
}

export async function POST(request: Request) {
  return changePassword(request, isNativeFormPost(request));
}
