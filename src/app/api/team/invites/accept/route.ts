import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { hashPassword, hashResetToken } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { token, password, name } = await request.json();
    if (typeof token !== "string" || !token || typeof password !== "string" || password.length < 6) {
      return NextResponse.json({ error: "Token och minst 6 tecken i lösenord krävs" }, { status: 400 });
    }

    const invite = await db.teamInvite.findUnique({
      where: { token_hash: hashResetToken(token) },
      select: {
        id: true,
        company_id: true,
        email: true,
        name: true,
        role: true,
        expires_at: true,
        accepted_at: true,
      },
    });

    if (!invite || invite.accepted_at || invite.expires_at < new Date()) {
      return NextResponse.json({ error: "Inbjudan är ogiltig eller har gått ut" }, { status: 400 });
    }

    const normalizedName = typeof name === "string" && name.trim() ? name.trim() : invite.name;
    const user = await db.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email: invite.email,
          password: await hashPassword(password),
          name: normalizedName,
          role: invite.role,
          status: "active",
          company_id: invite.company_id,
          email_verified_at: new Date(),
        },
        select: { id: true, email: true, name: true, role: true, company_id: true },
      });

      await tx.teamInvite.update({
        where: { id: invite.id },
        data: { accepted_at: new Date() },
      });

      return createdUser;
    });

    await writeAuditLog(user, {
      entityType: "user",
      entityId: user.id,
      action: "team.invite_accepted",
      metadata: { email: user.email, role: user.role },
    });

    return NextResponse.json({ success: true, user });
  } catch (error) {
    console.error("Accept team invite error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
