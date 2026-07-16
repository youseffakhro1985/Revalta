import db from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { comparePassword, hashPassword } from "@/lib/auth";
import { getCurrentUser } from "@/lib/current-user";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { isStrongPassword, passwordPolicyMessage } from "@/lib/security";

export async function PATCH(request: Request) {
  try {
    const ip = getClientIp(request);
    const rateLimit = await checkRateLimit(`settings-password:${ip}`, 8, 60 * 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "För många försök. Vänta en stund och prova igen." }, { status: 429 });
    }

    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Obehörig" }, { status: 401 });

    const { currentPassword, newPassword } = await request.json();
    if (typeof currentPassword !== "string" || !currentPassword) {
      return NextResponse.json({ error: "Nuvarande lösenord krävs" }, { status: 400 });
    }
    if (!isStrongPassword(newPassword)) {
      return NextResponse.json({ error: passwordPolicyMessage }, { status: 400 });
    }

    const currentUser = await db.user.findUnique({
      where: { id: user.id },
      select: { password: true },
    });

    if (!currentUser || !(await comparePassword(currentPassword, currentUser.password))) {
      return NextResponse.json({ error: "Nuvarande lösenord stämmer inte" }, { status: 400 });
    }

    await db.user.update({
      where: { id: user.id },
      data: { password: await hashPassword(newPassword) },
    });

    await writeAuditLog(user, {
      entityType: "user",
      entityId: user.id,
      action: "settings.password_changed",
      metadata: { email: user.email },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Change password error:", error);
    return NextResponse.json({ error: "Internt serverfel" }, { status: 500 });
  }
}
