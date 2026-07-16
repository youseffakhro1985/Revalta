import { NextResponse } from "next/server";
import db from "@/lib/db";
import { createResetToken, hashResetToken } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { queueTicketNotification } from "@/lib/integrations";
import { isValidEmail, normalizeEmail } from "@/lib/security";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const rateLimit = await checkRateLimit(`password-reset:${ip}`, 5, 60 * 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "För många försök. Vänta en stund och prova igen." }, { status: 429 });
    }

    const { email } = await request.json();
    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmail(normalizedEmail)) {
      return NextResponse.json({ error: "Ange en giltig e-postadress" }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, company_id: true },
    });

    if (!user) {
      return NextResponse.json({ success: true });
    }

    const token = createResetToken();
    const tokenHash = hashResetToken(token);
    await db.passwordResetToken.create({
      data: {
        user_id: user.id,
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    await writeAuditLog(user, {
      entityType: "user",
      entityId: user.id,
      action: "auth.password_reset_requested",
      metadata: { email: user.email },
    });
    await queueTicketNotification(user, {
      ticketId: user.id,
      title: "Återställ lösenord",
      recipient: user.email,
      event: "password_reset",
    });

    const resetUrl = `${new URL(request.url).origin}/reset-password?token=${token}`;
    return NextResponse.json({
      success: true,
      resetUrl: process.env.EMAIL_PROVIDER_API_KEY ? undefined : resetUrl,
    });
  } catch (error) {
    console.error("Password reset request error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
