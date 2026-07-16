import { NextResponse } from "next/server";
import db from "@/lib/db";
import { hashPassword, hashResetToken } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { isStrongPassword, passwordPolicyMessage } from "@/lib/security";

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const rateLimit = await checkRateLimit(`password-reset-confirm:${ip}`, 10, 60 * 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "För många försök. Vänta en stund och prova igen." }, { status: 429 });
    }

    const { token, password } = await request.json();
    if (typeof token !== "string" || !token) {
      return NextResponse.json({ error: "Återställningslänken saknas" }, { status: 400 });
    }
    if (!isStrongPassword(password)) {
      return NextResponse.json({ error: passwordPolicyMessage }, { status: 400 });
    }

    const tokenHash = hashResetToken(token);
    const reset = await db.passwordResetToken.findUnique({
      where: { token_hash: tokenHash },
      select: {
        id: true,
        user_id: true,
        expires_at: true,
        used_at: true,
        user: { select: { id: true, company_id: true, email: true } },
      },
    });

    if (!reset || reset.used_at || reset.expires_at < new Date()) {
      return NextResponse.json({ error: "Länken är ogiltig eller har gått ut" }, { status: 400 });
    }

    await db.$transaction([
      db.user.update({
        where: { id: reset.user_id },
        data: { password: await hashPassword(password) },
      }),
      db.passwordResetToken.update({
        where: { id: reset.id },
        data: { used_at: new Date() },
      }),
    ]);

    await writeAuditLog(reset.user, {
      entityType: "user",
      entityId: reset.user.id,
      action: "auth.password_reset_completed",
      metadata: { email: reset.user.email },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Password reset confirm error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
