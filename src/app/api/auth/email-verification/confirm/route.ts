import { NextResponse } from "next/server";
import db from "@/lib/db";
import { hashResetToken } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    const { token } = await request.json();
    if (typeof token !== "string" || !token) {
      return NextResponse.json({ error: "Verifieringstoken krävs" }, { status: 400 });
    }

    const tokenHash = hashResetToken(token);
    const verification = await db.emailVerificationToken.findUnique({
      where: { token_hash: tokenHash },
      select: {
        id: true,
        user_id: true,
        expires_at: true,
        used_at: true,
        user: { select: { id: true, email: true, company_id: true } },
      },
    });

    if (!verification || verification.used_at || verification.expires_at < new Date()) {
      return NextResponse.json({ error: "Verifieringslänken är ogiltig eller har gått ut" }, { status: 400 });
    }

    await db.$transaction([
      db.user.update({
        where: { id: verification.user_id },
        data: { email_verified_at: new Date() },
      }),
      db.emailVerificationToken.update({
        where: { id: verification.id },
        data: { used_at: new Date() },
      }),
    ]);

    await writeAuditLog(verification.user, {
      entityType: "user",
      entityId: verification.user.id,
      action: "auth.email_verified",
      metadata: { email: verification.user.email },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Email verification error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
