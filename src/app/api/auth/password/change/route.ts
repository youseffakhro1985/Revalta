import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { comparePassword, hashPassword, signToken } from "@/lib/auth";
import { getCurrentUser } from "@/lib/current-user";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { isStrongPassword, passwordPolicyMessage } from "@/lib/security";
import {
  LEGACY_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  expiredSessionCookieOptions,
  sessionCookieOptions,
} from "@/lib/session-policy";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401, headers: NO_STORE_HEADERS });

    const ip = getClientIp(request);
    const rateLimit = await checkRateLimit(`password-change:${user.id}:${ip}`, 5, 30 * 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "För många försök. Vänta en stund och prova igen." },
        {
          status: 429,
          headers: {
            ...NO_STORE_HEADERS,
            "Retry-After": String(Math.max(1, Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000))),
          },
        },
      );
    }

    const body = await request.json().catch(() => ({})) as {
      currentPassword?: unknown;
      newPassword?: unknown;
      confirmPassword?: unknown;
    };
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : "";

    if (!currentPassword || currentPassword.length > 512) {
      return NextResponse.json({ error: "Nuvarande lösenord är felaktigt" }, { status: 400, headers: NO_STORE_HEADERS });
    }
    if (newPassword !== confirmPassword) {
      return NextResponse.json({ error: "De nya lösenorden matchar inte" }, { status: 400, headers: NO_STORE_HEADERS });
    }
    if (!isStrongPassword(newPassword)) {
      return NextResponse.json({ error: passwordPolicyMessage }, { status: 400, headers: NO_STORE_HEADERS });
    }
    if (currentPassword === newPassword) {
      return NextResponse.json({ error: "Det nya lösenordet måste skilja sig från det nuvarande" }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const account = await db.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, name: true, password: true, company_id: true },
    });
    if (!account || !(await comparePassword(currentPassword, account.password))) {
      return NextResponse.json({ error: "Nuvarande lösenord är felaktigt" }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const passwordHash = await hashPassword(newPassword);
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: account.id }, data: { password: passwordHash } });
      await tx.passwordResetToken.updateMany({
        where: { user_id: account.id, used_at: null },
        data: { used_at: new Date() },
      });
      await tx.auditLog.create({
        data: {
          company_id: account.company_id,
          actor_user_id: account.id,
          entity_type: "user",
          entity_id: account.id,
          action: "user.password_changed",
          metadata: { method: "authenticated", revokedResetTokens: true },
        },
      });
    });

    const token = await signToken({ sub: account.id, email: account.email, name: account.name });
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
    cookieStore.set(LEGACY_SESSION_COOKIE_NAME, "", expiredSessionCookieOptions());

    return NextResponse.json(
      { success: true, message: "Lösenordet har ändrats och tidigare sessioner har avslutats." },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("Change password error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
