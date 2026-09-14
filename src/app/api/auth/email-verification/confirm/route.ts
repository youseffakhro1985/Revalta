import { NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api-error-response";
import { getPublicAppUrl } from "@/lib/app-url";
import { writeAuditLog } from "@/lib/audit";
import { hashResetToken } from "@/lib/auth";
import db from "@/lib/db";
import { createRouteObservability } from "@/lib/route-observability";

function isNativeFormPost(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  return contentType.includes("application/x-www-form-urlencoded")
    || contentType.includes("multipart/form-data");
}

async function readVerificationToken(request: Request) {
  if (isNativeFormPost(request)) {
    const form = await request.formData().catch(() => null);
    return String(form?.get("token") || "");
  }
  const body = await request.json().catch(() => ({})) as { token?: unknown };
  return typeof body.token === "string" ? body.token : "";
}

export async function POST(request: Request) {
  const observability = createRouteObservability(request, "/api/auth/email-verification/confirm");
  const nativeForm = isNativeFormPost(request);
  const fail = (
    status: number,
    code: (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES],
    message: string,
    reason: "invalid" | "error",
    token?: string,
  ) => {
    if (!nativeForm) {
      return apiErrorResponse({
        status,
        code,
        message,
        requestId: observability.requestId,
      });
    }
    const url = new URL("/verify-email", getPublicAppUrl(request.url));
    url.searchParams.set("reason", reason);
    if (token && token.length === 64) url.searchParams.set("token", token);
    const response = NextResponse.redirect(url, 303);
    response.headers.set("Cache-Control", "no-store");
    return observability.correlate(response);
  };
  const invalidTokenResponse = (token?: string) => fail(
    400,
    API_ERROR_CODES.validationFailed,
    "Verifieringslänken är ogiltig eller har gått ut",
    "invalid",
    token,
  );

  let token = "";
  try {
    token = await readVerificationToken(request);
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

    if (!verifiedUser) return invalidTokenResponse(token);

    observability.logger.info("auth email verification completed", observability.elapsed({
      event: "auth.email_verification.completed",
      userId: verifiedUser.id,
    }));
    if (nativeForm) {
      const url = new URL("/login", getPublicAppUrl(request.url));
      url.searchParams.set("verified", "1");
      const response = NextResponse.redirect(url, 303);
      response.headers.set("Cache-Control", "no-store");
      response.headers.set("X-Content-Type-Options", "nosniff");
      return observability.correlate(response);
    }
    const response = NextResponse.json(
      { success: true },
      { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
    );
    return observability.correlate(response);
  } catch (error) {
    observability.logger.error("auth email verification failed", error, observability.elapsed({
      event: "auth.email_verification.failed",
    }));
    return fail(500, API_ERROR_CODES.internalError, "Internt serverfel", "error", token);
  }
}
