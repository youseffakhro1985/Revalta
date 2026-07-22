import { NextResponse } from "next/server";
import db from "@/lib/db";
import { createResetToken, hashResetToken } from "@/lib/auth";
import { getCurrentUser } from "@/lib/current-user";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { sendEmailVerificationEmail } from "@/lib/email-verification-email";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401, headers: HEADERS });
    if (user.email_verified_at) return NextResponse.json({ message: "E-postadressen är redan verifierad." }, { headers: HEADERS });

    const ip = getClientIp(request);
    const [ipLimit, userLimit] = await Promise.all([
      checkRateLimit(`email-verification:ip:${ip}`, 8, 60 * 60 * 1000),
      checkRateLimit(`email-verification:user:${user.id}`, 3, 60 * 60 * 1000),
    ]);
    if (!ipLimit.allowed || !userLimit.allowed) {
      return NextResponse.json({ error: "För många försök. Försök igen senare." }, { status: 429, headers: { ...HEADERS, "Retry-After": "3600" } });
    }

    const token = createResetToken();
    const tokenHash = hashResetToken(token);
    await db.$transaction(async (tx) => {
      await tx.emailVerificationToken.updateMany({ where: { user_id: user.id, used_at: null }, data: { used_at: new Date() } });
      await tx.emailVerificationToken.create({ data: { user_id: user.id, token_hash: tokenHash, expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
      await tx.auditLog.create({ data: { company_id: user.company_id, actor_user_id: user.id, entity_type: "user", entity_id: user.id, action: "user.email_verification_requested", metadata: { email: user.email } } });
    });

    try {
      await sendEmailVerificationEmail(user.email, token);
    } catch (error) {
      await db.emailVerificationToken.updateMany({ where: { token_hash: tokenHash, used_at: null }, data: { used_at: new Date() } });
      console.error("Email verification delivery error", error);
      return NextResponse.json({ error: "Verifieringsmeddelandet kunde inte skickas. Kontrollera e-postinställningarna." }, { status: 503, headers: HEADERS });
    }

    return NextResponse.json({ message: "Verifieringslänken har skickats till din e-postadress." }, { headers: HEADERS });
  } catch (error) {
    console.error("Email verification request error", error);
    return NextResponse.json({ error: "Verifieringsmeddelandet kunde inte skickas." }, { status: 500, headers: HEADERS });
  }
}
