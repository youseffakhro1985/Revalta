import { NextResponse } from "next/server";
import db from "@/lib/db";
import { createResetToken, hashResetToken } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { createRouteObservability } from "@/lib/route-observability";
import { isValidEmail, normalizeEmail } from "@/lib/security";
import { sendPasswordResetEmail } from "@/lib/password-reset-email";

const RESPONSE = { message: "Om kontot finns skickar vi en återställningslänk." };
const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export async function POST(request: Request) {
  const observability = createRouteObservability(request, "/api/auth/password-reset/request");
  const neutralResponse = () => observability.correlate(NextResponse.json(RESPONSE, { headers: HEADERS }));
  try {
    const body = await request.json().catch(() => ({})) as { email?: unknown };
    const email = normalizeEmail(body.email);
    const ip = getClientIp(request);
    const [ipLimit, accountLimit] = await Promise.all([
      checkRateLimit(`password-reset-request:ip:${ip}`, 8, 60 * 60 * 1000),
      checkRateLimit(`password-reset-request:account:${email || "invalid"}`, 3, 60 * 60 * 1000),
    ]);
    if (!ipLimit.allowed || !accountLimit.allowed || !isValidEmail(email)) {
      return neutralResponse();
    }

    const user = await db.user.findUnique({ where: { email }, select: { id: true, email: true, status: true, company: { select: { status: true } } } });
    if (!user || user.status !== "active" || (user.company && user.company.status !== "active")) {
      return neutralResponse();
    }

    const token = createResetToken();
    const tokenHash = hashResetToken(token);
    await db.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({ where: { user_id: user.id, used_at: null }, data: { used_at: new Date() } });
      await tx.passwordResetToken.create({ data: { user_id: user.id, token_hash: tokenHash, expires_at: new Date(Date.now() + 30 * 60 * 1000) } });
    });

    try {
      await sendPasswordResetEmail(user.email, token);
    } catch (error) {
      await db.passwordResetToken.updateMany({ where: { token_hash: tokenHash, used_at: null }, data: { used_at: new Date() } });
      observability.logger.warn("auth password reset delivery failed", observability.elapsed({
        event: "auth.password_reset.delivery_failed",
        userId: user.id,
        errorName: error instanceof Error ? error.name : "UnknownError",
      }));
    }

    return neutralResponse();
  } catch (error) {
    observability.logger.error("auth password reset request failed", error, observability.elapsed({
      event: "auth.password_reset.request_failed",
    }));
    return neutralResponse();
  }
}
