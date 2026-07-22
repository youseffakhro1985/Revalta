import { NextResponse } from "next/server";
import db from "@/lib/db";
import { hashPassword, hashResetToken } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { isStrongPassword, passwordPolicyMessage } from "@/lib/security";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const rateLimit = await checkRateLimit(`password-reset-confirm:${ip}`, 8, 60 * 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "För många försök. Vänta en stund och prova igen." }, { status: 429, headers: { ...HEADERS, "Retry-After": String(Math.max(1, Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000))) } });
    }

    const body = await request.json().catch(() => ({})) as { token?: unknown; password?: unknown; confirmPassword?: unknown };
    const token = typeof body.token === "string" ? body.token : "";
    const password = typeof body.password === "string" ? body.password : "";
    const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : "";
    if (token.length !== 64) return NextResponse.json({ error: "Länken är ogiltig eller har gått ut" }, { status: 400, headers: HEADERS });
    if (password !== confirmPassword) return NextResponse.json({ error: "Lösenorden matchar inte" }, { status: 400, headers: HEADERS });
    if (!isStrongPassword(password)) return NextResponse.json({ error: passwordPolicyMessage }, { status: 400, headers: HEADERS });

    const tokenHash = hashResetToken(token);
    const passwordHash = await hashPassword(password);
    const result = await db.$transaction(async (tx) => {
      const reset = await tx.passwordResetToken.findUnique({ where: { token_hash: tokenHash }, select: { id: true, user_id: true, expires_at: true, used_at: true, user: { select: { id: true, company_id: true, status: true, company: { select: { status: true } } } } } });
      if (!reset || reset.used_at || reset.expires_at <= new Date() || reset.user.status !== "active" || (reset.user.company && reset.user.company.status !== "active")) return null;
      const used = await tx.passwordResetToken.updateMany({ where: { id: reset.id, used_at: null, expires_at: { gt: new Date() } }, data: { used_at: new Date() } });
      if (used.count !== 1) return null;
      await tx.user.update({ where: { id: reset.user_id }, data: { password: passwordHash } });
      await tx.passwordResetToken.updateMany({ where: { user_id: reset.user_id, used_at: null }, data: { used_at: new Date() } });
      await tx.auditLog.create({ data: { company_id: reset.user.company_id, actor_user_id: reset.user.id, entity_type: "user", entity_id: reset.user.id, action: "auth.password_reset_completed", metadata: { method: "reset_token", revokedSessions: true } } });
      return true;
    });

    if (!result) return NextResponse.json({ error: "Länken är ogiltig eller har gått ut" }, { status: 400, headers: HEADERS });
    return NextResponse.json({ success: true, message: "Lösenordet är återställt. Logga in igen." }, { headers: HEADERS });
  } catch (error) {
    console.error("Password reset confirm error", error);
    return NextResponse.json({ error: "Kunde inte återställa lösenordet" }, { status: 500, headers: HEADERS });
  }
}
