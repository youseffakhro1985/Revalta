import { NextResponse } from "next/server";
import db from "@/lib/db";
import { hashResetToken } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const limit = await checkRateLimit(`email-verification-confirm:ip:${ip}`, 20, 60 * 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json({ error: "För många försök. Försök igen senare." }, { status: 429, headers: { ...HEADERS, "Retry-After": "3600" } });
    }

    const body = await request.json().catch(() => ({})) as { token?: unknown };
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (token.length < 32 || token.length > 512) {
      return NextResponse.json({ error: "Verifieringslänken är ogiltig eller har gått ut." }, { status: 400, headers: HEADERS });
    }

    const tokenHash = hashResetToken(token);
    const verification = await db.emailVerificationToken.findUnique({
      where: { token_hash: tokenHash },
      select: { id: true, user_id: true, expires_at: true, used_at: true, user: { select: { id: true, email: true, email_verified_at: true, company_id: true, status: true } } },
    });

    if (!verification || verification.used_at || verification.expires_at <= new Date() || verification.user.status !== "active") {
      return NextResponse.json({ error: "Verifieringslänken är ogiltig eller har gått ut." }, { status: 400, headers: HEADERS });
    }

    if (verification.user.email_verified_at) {
      await db.emailVerificationToken.updateMany({ where: { user_id: verification.user_id, used_at: null }, data: { used_at: new Date() } });
      return NextResponse.json({ message: "E-postadressen är redan verifierad." }, { headers: HEADERS });
    }

    const verifiedAt = new Date();
    await db.$transaction(async (tx) => {
      const consumed = await tx.emailVerificationToken.updateMany({
        where: { id: verification.id, used_at: null, expires_at: { gt: verifiedAt } },
        data: { used_at: verifiedAt },
      });
      if (consumed.count !== 1) throw new Error("Verification token was already consumed");

      await tx.user.update({ where: { id: verification.user_id }, data: { email_verified_at: verifiedAt } });
      await tx.emailVerificationToken.updateMany({ where: { user_id: verification.user_id, used_at: null }, data: { used_at: verifiedAt } });
      await tx.auditLog.create({ data: { company_id: verification.user.company_id, actor_user_id: verification.user.id, entity_type: "user", entity_id: verification.user.id, action: "user.email_verified", metadata: { email: verification.user.email } } });
    });

    return NextResponse.json({ message: "E-postadressen är verifierad. Ditt konto är nu säkrare." }, { headers: HEADERS });
  } catch (error) {
    console.error("Email verification confirmation error", error);
    return NextResponse.json({ error: "Verifieringslänken är ogiltig eller har redan använts." }, { status: 400, headers: HEADERS });
  }
}
